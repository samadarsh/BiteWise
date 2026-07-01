import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, LargeBinary, ForeignKey, JSON, func
from sqlalchemy.orm import relationship
from backend.db.session import Base

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
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
