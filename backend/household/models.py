import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, JSON, func, Float, Integer
from sqlalchemy.orm import relationship
from backend.db.session import Base

class Household(Base):
    __tablename__ = "households"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)

    # Relationships
    members = relationship("HouseholdMember", back_populates="household", cascade="all, delete-orphan")
    pantry_items = relationship("PantryItem", back_populates="household", cascade="all, delete-orphan")
    grocery_lists = relationship("GroceryList", back_populates="household", cascade="all, delete-orphan")
    recipe_plans = relationship("RecipePlan", back_populates="household", cascade="all, delete-orphan")


class HouseholdMember(Base):
    __tablename__ = "household_members"

    id = Column(String, primary_key=True, index=True)
    household_id = Column(String, ForeignKey("households.id"), nullable=False)
    user_id = Column(String, ForeignKey("users.id"), nullable=True) # links to NutriOrder registered User if applicable
    name = Column(String, nullable=False)
    dietary_preference = Column(String, default="any", nullable=False)
    allergies = Column(JSON, default=list, nullable=False)
    calorie_target = Column(Integer, nullable=True)
    protein_target = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)

    household = relationship("Household", back_populates="members")
