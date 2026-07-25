from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Dict, Any, List
from backend.db.session import get_db
from backend.auth.sessions import get_current_user_id
from backend.auth.rate_limiter import mutating_rate_limiter
from backend.coach.models import (
    ManualEntrySchema,
    CoachStatusResponse,
    NutritionEntrySchema,
    WeightLogRequest,
    WeightEntrySchema,
    TrendsResponse,
)
from backend.coach import service
from backend.db.models import OrderSession, DeliveryAddress

router = APIRouter(prefix="/coach", tags=["Health Coach"])

@router.get("/today", response_model=CoachStatusResponse)
async def get_coach_today_status(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """Retrieves the user's daily target macros, consumed totals, and remaining capacities."""
    try:
        return service.get_today_status(db, user_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve daily status: {str(e)}")

@router.post("/manual-entry", response_model=NutritionEntrySchema)
async def add_manual_nutrition_log(
    payload: ManualEntrySchema,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
    _rate_limit = Depends(mutating_rate_limiter)
):
    """Manually logs a food entry for the current user."""
    try:
        entry = service.add_manual_entry(db, user_id, payload)
        return entry
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save manual log: {str(e)}")

@router.get("/history", response_model=List[NutritionEntrySchema])
async def get_logged_meals_history(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """Retrieves all nutrition logs entered today (user-local date)."""
    try:
        return service.get_recent_history(db, user_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch history: {str(e)}")

@router.post("/weight", response_model=WeightEntrySchema)
async def log_weight(
    payload: WeightLogRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
    _rate_limit = Depends(mutating_rate_limiter)
):
    """Logs today's weight and updates the profile's current weight for target math."""
    try:
        return service.add_weight_entry(db, user_id, payload.weight_kg)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to log weight: {str(e)}")

@router.get("/weight-history", response_model=List[WeightEntrySchema])
async def get_weight_history(
    days: int = Query(30, ge=1, le=365),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """Retrieves weight entries over the last `days` days, oldest first."""
    try:
        return service.get_weight_history(db, user_id, days)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch weight history: {str(e)}")

@router.get("/trends", response_model=TrendsResponse)
async def get_trends(
    days: int = Query(7, ge=1, le=90),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
):
    """Per-day calorie/protein totals and a target-hit streak over the last `days` days."""
    try:
        return service.get_trends(db, user_id, days)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch trends: {str(e)}")

@router.post("/next-meal")
async def recommend_next_coach_meal(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
    _rate_limit = Depends(mutating_rate_limiter)
) -> Dict[str, Any]:
    """
    Recommends a follow-up healthy meal tailored to remaining daily macro capacities.
    Uses safety floors and will not mutate the staging cart.
    """
    # 1. Resolve address
    address_id = None

    # Check active/recent sessions
    active_sess = db.query(OrderSession).filter(
        OrderSession.user_id == user_id,
        OrderSession.status != "FAILED",
        OrderSession.status != "ORDER_PLACED"
    ).order_by(OrderSession.updated_at.desc()).first()

    if active_sess and active_sess.address_id:
        address_id = active_sess.address_id
    else:
        # Check latest selected saved address
        latest_addr = db.query(DeliveryAddress).filter(
            DeliveryAddress.user_id == user_id
        ).order_by(DeliveryAddress.last_selected_at.desc()).first()
        if latest_addr:
            address_id = latest_addr.address_id

    # Enforce address requirement
    if not address_id:
        return {
            "success": False,
            "status": "action_required",
            "message": "Delivery address required. Please select or set an address first to request recommendations."
        }

    # 2. Get today's remaining capacity
    today_status = service.get_today_status(db, user_id)
    rem_calories = today_status["remaining_calories"]
    rem_protein = today_status["remaining_protein"]

    # Check targets met state
    target_met = (rem_calories <= 0.0 and rem_protein <= 0.0)

    # 3. Apply safety floors (minimum 350 kcal and 20g protein)
    target_calories = max(350.0, rem_calories)
    target_protein = max(20.0, rem_protein)

    message = "Here are some meal recommendations tailored to your remaining macros."
    if target_met:
        message = "Congratulations! You have already met your daily calorie and protein targets today. Here are some high-quality wellness options for your reference."

    try:
        from backend.mcp.swiggy_client import ProductionSwiggyClient
        swiggy = ProductionSwiggyClient(user_id=user_id)

        from agent.memory import UserMemoryManager
        from agent.personalization import PersonalizationEngine
        from agent.pipeline import NutriOrderPipeline

        memory_mgr = UserMemoryManager(db=db, user_id=user_id)
        personalization = PersonalizationEngine()

        pipeline = NutriOrderPipeline(
            mcp_client=swiggy,
            memory_manager=memory_mgr,
            personalization_engine=personalization
        )

        constraints = {
            "calorie_target": target_calories,
            "protein_target_g": target_protein,
            "budget_max_rs": 450,
        }

        results = pipeline.run_pipeline(
            raw_input="healthy meal",
            session_constraints=constraints,
            address_id=address_id,
            skip_cart_update=True
        )

        return {
            "success": True,
            "message": message,
            "target_met": target_met,
            "today_status": today_status,
            "results": results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate coach suggestions: {str(e)}")
