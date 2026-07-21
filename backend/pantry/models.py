import datetime
from sqlalchemy import Column, String, DateTime, ForeignKey, Boolean, Integer, Date, func
from sqlalchemy.orm import relationship
from backend.db.session import Base

class PantryItem(Base):
    __tablename__ = "pantry_items"

    id = Column(String, primary_key=True, index=True)
    household_id = Column(String, ForeignKey("households.id"), nullable=False)
    item_name = Column(String, nullable=False, index=True)
    stock_level = Column(String, default="full", nullable=False)  # full|half|low|empty
    category = Column(String, default="Other", nullable=False)     # Staples|Dairy|Proteins|Vegetables|Spices|Bakery|Other
    expiry_date = Column(Date, nullable=True)                      # optional manual or category-default
    added_at = Column(DateTime, default=func.now(), nullable=False)
    is_bulk = Column(Boolean, default=False, nullable=False)       # oil, salt, spices — slow decrement
    bulk_use_count = Column(Integer, default=0, nullable=False)    # tracks cook-cycles for bulk items
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    household = relationship("Household", back_populates="pantry_items")
