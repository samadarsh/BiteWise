import datetime
from sqlalchemy import Column, String, DateTime, Float, ForeignKey, Boolean, JSON, func, Date
from sqlalchemy.orm import relationship
from backend.db.session import Base

class GroceryList(Base):
    __tablename__ = "grocery_lists"

    id = Column(String, primary_key=True, index=True)
    household_id = Column(String, ForeignKey("households.id"), nullable=False)
    name = Column(String, default="Shopping List", nullable=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)

    household = relationship("Household", back_populates="grocery_lists")
    items = relationship("GroceryListItem", back_populates="grocery_list", cascade="all, delete-orphan")


class GroceryListItem(Base):
    __tablename__ = "grocery_list_items"

    id = Column(String, primary_key=True, index=True)
    grocery_list_id = Column(String, ForeignKey("grocery_lists.id"), nullable=False)
    item_name = Column(String, nullable=False, index=True)
    quantity = Column(Float, default=1.0, nullable=False)
    unit = Column(String, default="unit", nullable=False)
    is_purchased = Column(Boolean, default=False, nullable=False)
    added_at = Column(DateTime, default=func.now(), nullable=False)

    grocery_list = relationship("GroceryList", back_populates="items")


class RecipePlan(Base):
    __tablename__ = "recipe_plans"

    id = Column(String, primary_key=True, index=True)
    household_id = Column(String, ForeignKey("households.id"), nullable=False)
    recipe_name = Column(String, nullable=False)
    ingredients = Column(JSON, default=list, nullable=False) # list of dicts: [{"name": "item", "qty": 1.0, "unit": "g"}]
    planned_for_date = Column(Date, nullable=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)

    household = relationship("Household", back_populates="recipe_plans")


class InstamartCartSession(Base):
    __tablename__ = "instamart_cart_sessions"

    id = Column(String, primary_key=True, index=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    household_id = Column(String, ForeignKey("households.id"), nullable=False)
    status = Column(String, default="START", nullable=False)
    swiggy_cart_meta = Column(JSON, default=dict, nullable=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)
