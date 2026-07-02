from typing import Any, Dict, Optional
from pydantic import BaseModel, Field

class SearchRequestSchema(BaseModel):
    session_id: str = Field(..., description="ID of the active order session")
    query: str = Field(..., description="Meal search query (e.g. 'high protein lunch')")
    priorities: Optional[Dict[str, float]] = Field(default=None, description="Dynamic ranking priority adjustments")
    relaxation_patch: Optional[Dict[str, Any]] = Field(default=None, description="Adjusted constraints applied when retrying search")
