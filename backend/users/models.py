from typing import List, Optional
from pydantic import BaseModel, Field

class UserProfileSchema(BaseModel):
    protein_target: int = Field(30, ge=10, le=100)
    calorie_target: int = Field(600, ge=300, le=1500)
    diet_preference: str = Field("any", pattern="^(any|veg|non-veg)$")
    allergies: List[str] = Field(default_factory=list)
    dislikes: List[str] = Field(default_factory=list)
    favorite_cuisines: List[str] = Field(default_factory=list)
    fitness_goal: str = Field("maintenance")
    
    # Biometric & personalization preferences
    age: Optional[int] = Field(None, ge=10, le=120)
    gender: Optional[str] = Field(None)
    height_cm: Optional[float] = Field(None, ge=50.0, le=250.0)
    weight_kg: Optional[float] = Field(None, ge=30.0, le=250.0)
    activity_level: str = Field("moderate")
    meal_budget_default: int = Field(300, ge=50, le=2000)
    preferred_meal_times: dict = Field(default_factory=dict)
    spice_tolerance: str = Field("medium", pattern="^(low|medium|high)$")

class AddressSchema(BaseModel):
    id: str
    label: str
    display_text: str
