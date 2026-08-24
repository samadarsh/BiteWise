import datetime
from sqlalchemy.orm import Session

from backend.db.models import User, WeightEntry, NutritionEntry, OrderFeedback, HouseholdMember
from agent.observability import log_info


def reap_stale_guest_accounts(db: Session, max_age_days: int = 30) -> int:
    """Deletes long-abandoned guest accounts (POST /auth/guest creates a
    permanent row on every call, with no TTL otherwise) to stop unbounded
    account growth.

    Only removes guests whose sole footprint is what User.cascade already
    covers (token, profile, addresses, order_sessions+events) — skips
    anyone with household membership, weight/nutrition history, or order
    feedback, since those tables have no cascade configured on User and a
    blind delete could silently orphan rows (SQLite, which doesn't enforce
    FKs by default) or hard-fail outright on a real FK-enforcing database
    (Postgres). A guest with that much real footprint isn't "abandoned"
    anyway.
    """
    cutoff = datetime.datetime.now() - datetime.timedelta(days=max_age_days)
    candidates = db.query(User).filter(
        User.auth_provider == "guest",
        User.created_at < cutoff
    ).all()

    deleted = 0
    for user in candidates:
        has_extended_footprint = (
            db.query(HouseholdMember.user_id).filter(HouseholdMember.user_id == user.id).first() is not None
            or db.query(WeightEntry.id).filter(WeightEntry.user_id == user.id).first() is not None
            or db.query(NutritionEntry.id).filter(NutritionEntry.user_id == user.id).first() is not None
            or db.query(OrderFeedback.id).filter(OrderFeedback.user_id == user.id).first() is not None
        )
        if has_extended_footprint:
            continue
        db.delete(user)
        deleted += 1

    if deleted:
        db.commit()
        log_info(f"Reaped {deleted} stale guest account(s) older than {max_age_days} days.")
    return deleted
