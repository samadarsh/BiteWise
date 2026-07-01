import json
import os
from typing import Any


FOOD_ORDER_INTENT_SCHEMA = {
    "intent": "order_food",
    "protein_goal": 30,
    "budget": 200,
    "delivery_time": 30,
    "preferences": ["chicken", "no spicy"],
    "location": "user_location",
}

SYSTEM_PROMPT = """
You extract structured food-order intent for NutriOrderAI.

NutriOrderAI recommends meals and prepares a cart only after the user confirms.
Your job is to convert a voice transcript into structured constraints for the
recommendation pipeline. Return JSON only. Do not include markdown or commentary.

Return exactly these keys:
intent, protein_goal, budget, delivery_time, preferences, location

Field rules:
- intent must always be "order_food" for food or meal ordering requests.
- protein_goal is an integer grams target. If the user says "high protein"
  without a number, use 30.
- budget is the maximum price in Indian rupees. If absent, use 300.
- delivery_time is the maximum delivery time in minutes. If absent, use 45.
- preferences is an array of short strings for food items, cuisine, dietary
  preferences, spice preferences, and exclusions. Use [] when absent.
- location is the spoken delivery location when present. If absent, use
  "user_location" so NutriOrderAI can use the saved/default address.
- Do not return any keys beyond the six keys listed above.

Example transcript:
Order me a high protein meal under 200 rupees arriving in 30 minutes

Example output:
{
  "intent": "order_food",
  "protein_goal": 30,
  "budget": 200,
  "delivery_time": 30,
  "preferences": [],
  "location": "user_location"
}
"""


class IntentParsingError(ValueError):
    """Raised when a transcript cannot be converted into valid voice JSON."""

    def __init__(self, message: str, clarification_prompt: str) -> None:
        super().__init__(message)
        self.clarification_prompt = clarification_prompt


def parse_food_order_intent(
    transcript: str,
    model: str | None = None,
    api_key: str | None = None,
) -> dict[str, Any]:
    """Convert a voice transcript into the exact NutriOrderAI voice JSON contract.

    The Groq call is retried once when the returned content is not valid JSON or
    does not match the expected schema. A second failure asks the caller to get a
    clearer command from the user rather than guessing.
    """
    cleaned_transcript = transcript.strip()
    if not cleaned_transcript:
        raise ValueError("Transcript cannot be empty.")

    try:
        from groq import Groq
    except ImportError as exc:
        raise RuntimeError("Groq SDK is not installed. Install groq to enable intent parsing.") from exc

    _load_dotenv_if_available()
    groq_api_key = api_key or os.getenv("GROQ_API_KEY")
    if not groq_api_key:
        raise RuntimeError("Missing GROQ_API_KEY. Add it to a .env file or export it in your shell.")

    client = Groq(api_key=groq_api_key)
    model_name = model or os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")

    last_error: Exception | None = None
    for _ in range(2):
        raw_content = _request_intent_json(
            client=client,
            model_name=model_name,
            transcript=cleaned_transcript,
            previous_error=str(last_error) if last_error else None,
        )
        try:
            parsed = _extract_json(raw_content)
            return validate_food_order_intent(parsed)
        except (json.JSONDecodeError, ValueError) as exc:
            last_error = exc

    raise IntentParsingError(
        "Could not convert the transcript into valid food-order JSON.",
        clarification_prompt=(
            "Please repeat the order with a meal preference, budget, and delivery time. "
            "For example: 'Order me a high protein chicken meal under 200 rupees in 30 minutes.'"
        ),
    )


def _request_intent_json(
    client: Any,
    model_name: str,
    transcript: str,
    previous_error: str | None = None,
) -> str:
    retry_instruction = ""
    if previous_error:
        retry_instruction = (
            "\n\nYour previous response was invalid for this reason: "
            f"{previous_error}\nReturn corrected JSON only."
        )

    completion = client.chat.completions.create(
        model=model_name,
        temperature=0,
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "system",
                "content": SYSTEM_PROMPT,
            },
            {
                "role": "user",
                "content": (
                    "Extract this transcript into the following JSON shape:\n"
                    f"{json.dumps(FOOD_ORDER_INTENT_SCHEMA)}\n\n"
                    f"Transcript: {transcript}"
                    f"{retry_instruction}"
                ),
            },
        ],
    )
    return completion.choices[0].message.content or "{}"


def _extract_json(content: str) -> dict[str, Any]:
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        start = content.find("{")
        end = content.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise
        return json.loads(content[start : end + 1])


def _load_dotenv_if_available() -> None:
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    load_dotenv()


def validate_food_order_intent(intent: dict[str, Any]) -> dict[str, Any]:
    """Validate and coerce parser output into the voice JSON contract."""
    expected_keys = set(FOOD_ORDER_INTENT_SCHEMA)
    actual_keys = set(intent)
    missing_keys = expected_keys - actual_keys
    extra_keys = actual_keys - expected_keys
    if missing_keys:
        raise ValueError(f"Missing required keys: {', '.join(sorted(missing_keys))}.")
    if extra_keys:
        raise ValueError(f"Unexpected keys: {', '.join(sorted(extra_keys))}.")
    if intent.get("intent") != "order_food":
        raise ValueError("intent must be 'order_food'.")

    normalized = {
        "intent": "order_food",
        "protein_goal": _coerce_int(intent.get("protein_goal"), field_name="protein_goal"),
        "budget": _coerce_int(intent.get("budget"), field_name="budget"),
        "delivery_time": _coerce_int(intent.get("delivery_time"), field_name="delivery_time"),
        "preferences": _coerce_preferences(intent.get("preferences")),
        "location": _coerce_location(intent.get("location")),
    }
    return normalized


def _coerce_int(value: Any, field_name: str) -> int:
    try:
        coerced = int(value)
    except (TypeError, ValueError):
        raise ValueError(f"{field_name} must be an integer.") from None
    if coerced < 0:
        raise ValueError(f"{field_name} cannot be negative.")
    return coerced


def _coerce_preferences(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value] if value else []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    raise ValueError("preferences must be an array of strings.")


def _coerce_location(value: Any) -> str:
    if not isinstance(value, str):
        raise ValueError("location must be a string.")
    return value.strip() or "user_location"
