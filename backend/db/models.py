import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, LargeBinary, ForeignKey, JSON, func, Boolean, Date
from sqlalchemy.orm import relationship
from backend.db.session import Base

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    email = Column(String, unique=True, nullable=True, index=True)
    name = Column(String, nullable=True)
    avatar_url = Column(String, nullable=True)
    auth_provider = Column(String, default="guest", nullable=False)
    swiggy_user_ref = Column(String, unique=True, nullable=True, index=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)

    # Relationships
    token = relationship("SwiggyToken", back_populates="user", uselist=False, cascade="all, delete-orphan")
    profile = relationship("UserProfile", back_populates="user", uselist=False, cascade="all, delete-orphan")
    addresses = relationship("DeliveryAddress", back_populates="user", cascade="all, delete-orphan")
    order_sessions = relationship("OrderSession", back_populates="user", cascade="all, delete-orphan")


class SwiggyToken(Base):
    __tablename__ = "swiggy_tokens"

    user_id = Column(String, ForeignKey("users.id"), primary_key=True)
    encrypted_access_token = Column(LargeBinary, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    scope = Column(String, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)

    user = relationship("User", back_populates="token")


class UserProfile(Base):
    __tablename__ = "user_profiles"

    user_id = Column(String, ForeignKey("users.id"), primary_key=True)
    protein_target = Column(Integer, default=30, nullable=False)
    calorie_target = Column(Integer, default=600, nullable=False)
    diet_preference = Column(String, default="any", nullable=False)
    allergies = Column(JSON, default=list, nullable=False)
    dislikes = Column(JSON, default=list, nullable=False)
    favorite_cuisines = Column(JSON, default=list, nullable=False)
    fitness_goal = Column(String, default="maintenance", nullable=False)

    # Biometric extensions
    age = Column(Integer, nullable=True)
    gender = Column(String, nullable=True)
    height_cm = Column(Float, nullable=True)
    weight_kg = Column(Float, nullable=True)
    activity_level = Column(String, default="moderate", nullable=False)
    meal_budget_default = Column(Integer, default=300, nullable=False)
    preferred_meal_times = Column(JSON, default=dict, nullable=False)
    spice_tolerance = Column(String, default="medium", nullable=False)

    user = relationship("User", back_populates="profile")


class DeliveryAddress(Base):
    __tablename__ = "delivery_addresses"

    user_id = Column(String, ForeignKey("users.id"), primary_key=True)
    address_id = Column(String, primary_key=True)
    label = Column(String, nullable=False)
    display_text = Column(String, nullable=False)
    last_selected_at = Column(DateTime, default=func.now(), nullable=False)

    user = relationship("User", back_populates="addresses")


class OrderSession(Base):
    __tablename__ = "order_sessions"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    address_id = Column(String, nullable=True)
    status = Column(String, default="START", nullable=False)
    query = Column(String, nullable=True)
    selected_restaurant_id = Column(String, nullable=True)
    selected_item_id = Column(String, nullable=True)
    cart_snapshot = Column(JSON, nullable=True)
    selected_item_nutrition = Column(JSON, nullable=True)
    total = Column(Float, nullable=True)
    payment_method = Column(String, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    user = relationship("User", back_populates="order_sessions")
    events = relationship("OrderEvent", back_populates="order_session", cascade="all, delete-orphan")


class OrderEvent(Base):
    __tablename__ = "order_events"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    order_session_id = Column(String, ForeignKey("order_sessions.id"), nullable=False)
    event_type = Column(String, nullable=False)
    payload = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)

    order_session = relationship("OrderSession", back_populates="events")


class OrderFeedback(Base):
    __tablename__ = "order_feedbacks"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    order_session_id = Column(String, ForeignKey("order_sessions.id"), unique=True, nullable=False)
    rating = Column(Integer, nullable=False)
    filling = Column(String, nullable=True)
    spicy = Column(String, nullable=True)
    again = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)


class NutritionEntry(Base):
    __tablename__ = "nutrition_entries"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    entry_date = Column(Date, nullable=False, index=True)
    meal_name = Column(String, nullable=False)
    restaurant_name = Column(String, nullable=True)
    calories = Column(Float, nullable=False)
    protein_g = Column(Float, nullable=False)
    carbs_g = Column(Float, nullable=True)
    fat_g = Column(Float, nullable=True)
    source = Column(String, default="manual", nullable=False)  # "manual" or "order"
    confidence = Column(Float, default=1.0, nullable=False)
    is_estimated = Column(Boolean, default=False, nullable=False)
    order_session_id = Column(String, ForeignKey("order_sessions.id"), unique=True, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)

    user = relationship("User")
    order_session = relationship("OrderSession")


# Import household, pantry, and grocery models to register them on Base metadata
from backend.household.models import Household, HouseholdMember
from backend.pantry.models import PantryItem
from backend.grocery.models import GroceryList, GroceryListItem, RecipePlan, InstamartCartSession
