from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import date, datetime

class ManualEntrySchema(BaseModel):
    meal_name: str = Field(..., min_length=1)
    calories: float = Field(..., ge=0)
    protein_g: float = Field(..., ge=0)
    carbs_g: Optional[float] = Field(default=None, ge=0)
    fat_g: Optional[float] = Field(default=None, ge=0)

class CoachStatusResponse(BaseModel):
    target_calories: float
    target_protein: float
    consumed_calories: float
    consumed_protein: float
    remaining_calories: float
    remaining_protein: float

class NutritionEntrySchema(BaseModel):
    id: int
    user_id: str
    entry_date: date
    meal_name: str
    restaurant_name: Optional[str] = None
    calories: float
    protein_g: float
    carbs_g: Optional[float] = None
    fat_g: Optional[float] = None
    source: str
    confidence: float
    is_estimated: bool
    order_session_id: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class WeightLogRequest(BaseModel):
    weight_kg: float = Field(..., gt=0, le=500)


class WeightEntrySchema(BaseModel):
    id: int
    user_id: str
    weight_kg: float
    entry_date: date
    created_at: datetime

    class Config:
        from_attributes = True


class DayTrendSchema(BaseModel):
    date: date
    calories: float
    protein: float
    target_calories: float
    target_protein: float
    hit_target: bool


class TrendsResponse(BaseModel):
    days: List[DayTrendSchema]
    current_streak: int
    best_streak: int
