from typing import Dict

from google import genai
from google.genai import types
from pydantic import BaseModel, Field

from agent.observability import log_info
from config.settings import get_settings


class FoodScanResult(BaseModel):
    """Result of analyzing a food photo. Macros are a real best-effort
    estimate; micronutrients are explicitly rougher (a flexible dict, not
    per-nutrient precision) and confidence/caveats must reflect that a
    single photo cannot reveal true nutrient content — only visual signals
    (food type, apparent portion size) that Gemini reasons from."""

    food_name: str
    description: str
    estimated_portion: str
    calories: float = Field(ge=0)
    protein_g: float = Field(ge=0)
    carbs_g: float = Field(ge=0)
    fat_g: float = Field(ge=0)
    confidence: float = Field(ge=0.0, le=1.0)
    micronutrients: Dict[str, str] = Field(default_factory=dict)
    caveats: str


_SYSTEM_PROMPT = """You are a nutrition estimation assistant analyzing a photo of food.

Identify the food and estimate its nutrition. Be honest about uncertainty —
this is a single photo, not a lab measurement:

- Identify what the food is and describe it briefly.
- Estimate the portion size you can see (e.g. "about 1 cup", "a medium bowl").
- Estimate calories, protein, carbs, and fat for that portion.
- Set confidence genuinely low (below 0.5) if the photo is unclear, the
  portion size is hard to judge, or the food could be several different
  things. Set it higher (above 0.7) only when the food and portion are
  clearly identifiable.
- For micronutrients, give a *few* rough, clearly-approximate values only
  where visually plausible (e.g. sodium for visibly salty/processed food,
  fiber for visible vegetables) — do not invent precise values for nutrients
  you have no visual basis for. An empty micronutrients dict is a valid,
  honest answer for many foods.
- In "caveats", state plainly that this is a visual estimate from one photo,
  not a verified measurement, and note anything that makes this particular
  estimate less reliable (e.g. "portion size is hard to judge from this
  angle", "sauce may hide ingredients").

Never present an estimate as more precise or certain than a photo can
actually support."""


def analyze_food_image(image_bytes: bytes, media_type: str) -> FoodScanResult:
    """Identifies the food in a photo and estimates its nutrition via Gemini
    vision. Raises google.genai.errors.APIError on failure — the caller
    (backend/coach/routes.py) is responsible for turning those into an HTTP
    response; this function does not swallow errors or fabricate a fallback
    result the way a failed heuristic lookup might."""
    settings = get_settings()
    client = genai.Client(api_key=settings.gemini_api_key)

    log_info("Starting food image scan analysis.", {"media_type": media_type, "image_bytes": len(image_bytes)})

    response = client.models.generate_content(
        model="gemini-3.5-flash",
        contents=[
            "Identify this food and estimate its nutrition.",
            types.Part.from_bytes(data=image_bytes, mime_type=media_type),
        ],
        config=types.GenerateContentConfig(
            system_instruction=_SYSTEM_PROMPT,
            response_mime_type="application/json",
            response_schema=FoodScanResult,
        ),
    )

    result = response.parsed
    log_info(
        f"Food image scan complete: {result.food_name} ({result.calories} kcal, confidence {result.confidence})",
    )
    return result
