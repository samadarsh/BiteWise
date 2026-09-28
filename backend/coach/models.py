from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import date, datetime

class ManualEntrySchema(BaseModel):
    meal_name: str = Field(..., min_length=1)
    calories: float = Field(..., ge=0)
    protein_g: float = Field(..., ge=0)
    carbs_g: Optional[float] = Field(default=None, ge=0)
    fat_g: Optional[float] = Field(default=None, ge=0)
    # Defaults reproduce the pre-existing manual-entry behavior exactly —
    # only a caller that explicitly overrides these (e.g. saving a reviewed
    # food-image-scan result) sees anything different.
    source: str = Field(default="manual")
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    is_estimated: bool = Field(default=False)
    micronutrients: Optional[dict] = Field(default=None)

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
    micronutrients: Optional[dict] = None
    order_session_id: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class WeightLogRequest(BaseModel):
    # Same bounds as UserProfileSchema.weight_kg — logging a weight outside
    # them used to save fine and then break GET /me/profile for good.
    weight_kg: float = Field(..., ge=30.0, le=250.0)


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
