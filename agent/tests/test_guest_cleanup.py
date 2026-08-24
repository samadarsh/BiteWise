import datetime

from backend.db.session import SessionLocal, Base, engine
from backend.db.models import User, WeightEntry
from backend.auth.cleanup import reap_stale_guest_accounts

Base.metadata.create_all(bind=engine)


def _make_guest(db, user_id: str, age_days: int) -> User:
    user = User(
        id=user_id,
        auth_provider="guest",
        created_at=datetime.datetime.now() - datetime.timedelta(days=age_days),
    )
    db.add(user)
    db.commit()
    return user


def test_reaps_old_abandoned_guest():
    db = SessionLocal()
    try:
        db.query(User).filter(User.id == "guest_old_abandoned").delete()
        db.commit()
        _make_guest(db, "guest_old_abandoned", age_days=45)

        deleted = reap_stale_guest_accounts(db, max_age_days=30)
        assert deleted >= 1
        assert db.query(User).filter(User.id == "guest_old_abandoned").first() is None
    finally:
        db.close()


def test_keeps_recent_guest():
    db = SessionLocal()
    try:
        db.query(User).filter(User.id == "guest_recent").delete()
        db.commit()
        _make_guest(db, "guest_recent", age_days=2)

        reap_stale_guest_accounts(db, max_age_days=30)
        assert db.query(User).filter(User.id == "guest_recent").first() is not None
    finally:
        db.query(User).filter(User.id == "guest_recent").delete()
        db.commit()
        db.close()


def test_keeps_old_guest_with_extended_footprint():
    """A guest with real weight-tracking history isn't 'abandoned' just
    because the account itself is old — and WeightEntry has no cascade
    configured on User, so deleting them would silently orphan the row."""
    db = SessionLocal()
    try:
        db.query(WeightEntry).filter(WeightEntry.user_id == "guest_old_active").delete()
        db.query(User).filter(User.id == "guest_old_active").delete()
        db.commit()
        _make_guest(db, "guest_old_active", age_days=45)
        db.add(WeightEntry(user_id="guest_old_active", weight_kg=70.0, entry_date=datetime.date.today()))
        db.commit()

        reap_stale_guest_accounts(db, max_age_days=30)
        assert db.query(User).filter(User.id == "guest_old_active").first() is not None
    finally:
        db.query(WeightEntry).filter(WeightEntry.user_id == "guest_old_active").delete()
        db.query(User).filter(User.id == "guest_old_active").delete()
        db.commit()
        db.close()
