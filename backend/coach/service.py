import datetime
from sqlalchemy.orm import Session
from sqlalchemy import func
from zoneinfo import ZoneInfo
from typing import Dict, Any, List, Optional
from backend.db.models import UserProfile, NutritionEntry, WeightEntry, OrderSession, OrderEvent
from backend.coach.models import ManualEntrySchema
from agent.nutrition_targets import NutritionTargetEngine
from agent.observability import log_info, log_warn, log_error

def get_local_today_date() -> datetime.date:
    utc_now = datetime.datetime.now(ZoneInfo("UTC"))
    ist_now = utc_now.astimezone(ZoneInfo("Asia/Kolkata"))
    return ist_now.date()

def _get_daily_targets(db: Session, user_id: str) -> Dict[str, float]:
    """Current profile's daily calorie/protein targets. Applied to past days too
    when computing trends — we don't keep historical profile snapshots."""
    profile_rec = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    if not profile_rec:
        return {"target_calories": 1950.0, "target_protein": 105.0}

    profile_dict = {
        "age": profile_rec.age,
        "gender": profile_rec.gender,
        "height_cm": profile_rec.height_cm,
        "weight_kg": profile_rec.weight_kg,
        "activity_level": profile_rec.activity_level,
        "fitness_goal": profile_rec.fitness_goal,
        "calorie_target": profile_rec.calorie_target,
        "protein_target": profile_rec.protein_target,
    }
    targets = NutritionTargetEngine.calculate_targets(profile_dict)
    return {
        "target_calories": float(targets.get("daily_calories", 1950.0)),
        "target_protein": float(targets.get("daily_protein", 105.0)),
    }

def get_today_status(db: Session, user_id: str) -> Dict[str, Any]:
    # 1. Fetch targets for the current profile
    daily_targets = _get_daily_targets(db, user_id)
    target_calories = daily_targets["target_calories"]
    target_protein = daily_targets["target_protein"]

    # 2. Get local date
    today_date = get_local_today_date()

    # 3. Sum consumption for today
    consumed_calories = db.query(func.sum(NutritionEntry.calories)).filter(
        NutritionEntry.user_id == user_id,
        NutritionEntry.entry_date == today_date
    ).scalar() or 0.0

    consumed_protein = db.query(func.sum(NutritionEntry.protein_g)).filter(
        NutritionEntry.user_id == user_id,
        NutritionEntry.entry_date == today_date
    ).scalar() or 0.0

    # 4. Compute remaining macros (cap at 0.0)
    remaining_calories = max(0.0, target_calories - consumed_calories)
    remaining_protein = max(0.0, target_protein - consumed_protein)

    return {
        "target_calories": target_calories,
        "target_protein": target_protein,
        "consumed_calories": float(consumed_calories),
        "consumed_protein": float(consumed_protein),
        "remaining_calories": float(remaining_calories),
        "remaining_protein": float(remaining_protein),
    }

def add_manual_entry(db: Session, user_id: str, payload: ManualEntrySchema) -> NutritionEntry:
    today_date = get_local_today_date()

    entry = NutritionEntry(
        user_id=user_id,
        entry_date=today_date,
        meal_name=payload.meal_name,
        restaurant_name="Manual Entry",
        calories=payload.calories,
        protein_g=payload.protein_g,
        carbs_g=payload.carbs_g,
        fat_g=payload.fat_g,
        source="manual",
        confidence=1.0,
        is_estimated=False,
        order_session_id=None
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    log_info(f"Added manual nutrition entry: {payload.meal_name} ({payload.calories} kcal)")
    return entry

def get_recent_history(db: Session, user_id: str) -> List[NutritionEntry]:
    today_date = get_local_today_date()
    return db.query(NutritionEntry).filter(
        NutritionEntry.user_id == user_id,
        NutritionEntry.entry_date == today_date
    ).order_by(NutritionEntry.created_at.desc()).all()

def auto_log_ordered_meal(db: Session, user_id: str, session_record: OrderSession) -> Optional[NutritionEntry]:
    """Safe, non-blocking order auto-logging function.

    Checks for duplicate order_session_id to prevent double logging.
    """
    try:
        # Check duplicate logging prevention
        existing = db.query(NutritionEntry).filter(
            NutritionEntry.order_session_id == session_record.id
        ).first()
        if existing:
            log_warn(f"Nutrition entry already exists for session {session_record.id}. Skipping auto-log.")
            return existing

        # Ensure selected_item_nutrition is present
        nutrition = session_record.selected_item_nutrition
        if not nutrition:
            log_warn(f"No selected_item_nutrition cached for session {session_record.id}. Skipping auto-log.")
            return None

        # Build entry
        today_date = get_local_today_date()
        entry = NutritionEntry(
            user_id=user_id,
            entry_date=today_date,
            meal_name=nutrition.get("item_name") or "Swiggy Meal",
            restaurant_name=nutrition.get("restaurant_name") or "Swiggy Restaurant",
            calories=float(nutrition.get("calories", 0)),
            protein_g=float(nutrition.get("protein_g", 0)),
            carbs_g=float(nutrition.get("carbs_g")) if nutrition.get("carbs_g") is not None else None,
            fat_g=float(nutrition.get("fat_g")) if nutrition.get("fat_g") is not None else None,
            source="order",
            confidence=float(nutrition.get("confidence", 1.0)),
            is_estimated=bool(nutrition.get("is_estimated", False)),
            order_session_id=session_record.id
        )
        db.add(entry)
        db.commit()
        db.refresh(entry)
        log_info(f"Auto-logged nutrition entry for session {session_record.id}: {entry.meal_name}")
        return entry
    except Exception as e:
        db.rollback()
        log_error(f"Failed to auto-log nutrition entry for session {session_record.id}: {str(e)}", error_category="internal_error")
        try:
            audit = OrderEvent(
                order_session_id=session_record.id,
                event_type="NUTRITION_AUTO_LOG_FAILED",
                payload={"error": str(e), "user_id": user_id}
            )
            db.add(audit)
            db.commit()
        except Exception as audit_err:
            log_error(f"Failed to write state-less error audit: {str(audit_err)}", error_category="database_error")
        return None

def add_weight_entry(db: Session, user_id: str, weight_kg: float) -> WeightEntry:
    """Logs today's weight and keeps UserProfile.weight_kg (used in BMR/target math) current."""
    today_date = get_local_today_date()

    entry = WeightEntry(user_id=user_id, weight_kg=weight_kg, entry_date=today_date)
    db.add(entry)

    profile_rec = db.query(UserProfile).filter(UserProfile.user_id == user_id).first()
    if profile_rec:
        profile_rec.weight_kg = weight_kg

    db.commit()
    db.refresh(entry)
    log_info(f"Logged weight entry: {weight_kg}kg")
    return entry

def get_weight_history(db: Session, user_id: str, days: int = 30) -> List[WeightEntry]:
    cutoff = get_local_today_date() - datetime.timedelta(days=days)
    return db.query(WeightEntry).filter(
        WeightEntry.user_id == user_id,
        WeightEntry.entry_date >= cutoff
    ).order_by(WeightEntry.entry_date.asc()).all()

def get_trends(db: Session, user_id: str, days: int = 7) -> Dict[str, Any]:
    """
    Per-day calorie/protein totals for the last `days` days, plus a streak count.
    A day "hits target" if at least one entry was logged and protein consumed is
    at least 80% of that day's target — a reasonable "on track" bar, not a strict
    exact match (macros are rarely hit to the gram).
    """
    daily_targets = _get_daily_targets(db, user_id)
    target_calories = daily_targets["target_calories"]
    target_protein = daily_targets["target_protein"]

    today_date = get_local_today_date()
    start_date = today_date - datetime.timedelta(days=days - 1)

    rows = db.query(
        NutritionEntry.entry_date,
        func.sum(NutritionEntry.calories).label("calories"),
        func.sum(NutritionEntry.protein_g).label("protein"),
    ).filter(
        NutritionEntry.user_id == user_id,
        NutritionEntry.entry_date >= start_date,
        NutritionEntry.entry_date <= today_date,
    ).group_by(NutritionEntry.entry_date).all()

    by_date = {row.entry_date: row for row in rows}

    day_list = []
    for offset in range(days):
        d = start_date + datetime.timedelta(days=offset)
        row = by_date.get(d)
        calories = float(row.calories) if row else 0.0
        protein = float(row.protein) if row else 0.0
        hit_target = protein >= (target_protein * 0.8) and (row is not None)
        day_list.append({
            "date": d,
            "calories": calories,
            "protein": protein,
            "target_calories": target_calories,
            "target_protein": target_protein,
            "hit_target": hit_target,
        })

    # Current streak: consecutive hit-target days ending today (or yesterday, so
    # a not-yet-logged today doesn't zero out an otherwise-intact streak).
    current_streak = 0
    for day in reversed(day_list):
        if day["date"] == today_date and not day["hit_target"]:
            continue
        if day["hit_target"]:
            current_streak += 1
        else:
            break

    best_streak = 0
    running = 0
    for day in day_list:
        if day["hit_target"]:
            running += 1
            best_streak = max(best_streak, running)
        else:
            running = 0

    return {"days": day_list, "current_streak": current_streak, "best_streak": best_streak}
