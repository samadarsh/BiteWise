import datetime
from sqlalchemy import Column, String, DateTime, Float, ForeignKey, func
from sqlalchemy.orm import relationship
from backend.db.session import Base

class PantryItem(Base):
    __tablename__ = "pantry_items"

    id = Column(String, primary_key=True, index=True)
    household_id = Column(String, ForeignKey("households.id"), nullable=False)
    item_name = Column(String, nullable=False, index=True)
    quantity = Column(Float, default=0.0, nullable=False)
    unit = Column(String, default="unit", nullable=False)
    min_threshold = Column(Float, nullable=True) # auto-restock trigger threshold
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    household = relationship("Household", back_populates="pantry_items")
