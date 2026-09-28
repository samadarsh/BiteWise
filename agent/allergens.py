"""
Allergen detection shared by NutriOrder ranking and SmartPantry recipes.

Users pick allergies as broad labels ("Nuts", "Dairy", "Gluten", ...) or type
them freely ("peanuts", "milk"). A dish never literally contains the word
"dairy" or "nuts" — it says "paneer" or "cashew" — so each label is expanded
into the ingredient words that actually signal it, and matched as whole words
against the dish's name/description.

This is a best-effort text heuristic, not a guarantee: it errs on the side of
hiding a dish (e.g. "peanut butter" also trips Dairy via "butter") rather than
showing an unsafe one.
"""
import re
from typing import Dict, Iterable, List, Set

ALLERGEN_KEYWORDS: Dict[str, Set[str]] = {
    "nuts": {
        "nut", "peanut", "groundnut", "cashew", "kaju", "almond", "badam",
        "walnut", "akhrot", "pistachio", "pista", "hazelnut", "pecan",
        "macadamia", "praline", "marzipan", "nutella", "satay", "chikki",
    },
    "dairy": {
        "dairy", "milk", "paneer", "cheese", "butter", "ghee", "cream", "curd",
        "dahi", "yogurt", "yoghurt", "raita", "lassi", "malai", "khoya", "mawa",
        "makhani", "kheer", "rabri", "rasmalai", "shrikhand", "chaas", "whey",
        "mozzarella", "cheddar", "milkshake", "latte",
    },
    "gluten": {
        "gluten", "wheat", "atta", "maida", "roti", "chapati", "naan", "paratha",
        "kulcha", "bhatura", "puri", "poori", "bread", "bun", "pav", "burger",
        "pizza", "pasta", "noodle", "maggi", "sandwich", "wrap", "roll", "momo",
        "samosa", "kachori", "semolina", "suji", "sooji", "rava", "upma",
        "barley", "rye", "seitan", "cake", "cookie", "biscuit", "croissant",
    },
    "soy": {"soy", "soya", "tofu", "edamame", "miso", "tempeh"},
    "shellfish": {
        "shellfish", "prawn", "shrimp", "jhinga", "crab", "lobster", "clam",
        "mussel", "oyster", "scallop", "squid", "calamari",
    },
    "eggs": {"egg", "omelette", "omelet", "bhurji", "mayo", "mayonnaise", "meringue"},
    "fish": {"fish", "salmon", "tuna", "pomfret", "surmai", "rohu", "basa", "anchovy", "sardine", "mackerel"},
}

# Free-text spellings people type, mapped onto the canonical labels above.
_ALIASES: Dict[str, str] = {
    "nut": "nuts", "tree nuts": "nuts", "tree nut": "nuts", "peanut": "nuts",
    "peanuts": "nuts", "groundnuts": "nuts",
    "milk": "dairy", "lactose": "dairy",
    "wheat": "gluten",
    "soya": "soy", "soybean": "soy", "soybeans": "soy",
    "shrimp": "shellfish", "prawn": "shellfish", "prawns": "shellfish", "seafood": "shellfish",
    "egg": "eggs",
}

# Vegan excludes animal products beyond meat/fish/eggs.
VEGAN_EXCLUDED = ("dairy", "eggs")
_VEGAN_EXTRA_WORDS = {"honey"}


def canonical_allergen(allergen: str) -> str:
    clean = (allergen or "").strip().lower()
    return _ALIASES.get(clean, clean)


def keywords_for(allergen: str) -> Set[str]:
    canon = canonical_allergen(allergen)
    if not canon:
        return set()
    words = set(ALLERGEN_KEYWORDS.get(canon, set()))
    # An unknown free-text allergy ("sesame", "mushroom") still matches itself.
    words.add(canon)
    raw = (allergen or "").strip().lower()
    if raw:
        words.add(raw)
    return words


def _mentions(text: str, words: Iterable[str]) -> bool:
    for word in words:
        singular = word[:-1] if word.endswith("s") and len(word) > 3 else word
        # Whole-word match with optional plural: "nut" must not match
        # "nutrition", but "peanut" must match "peanuts".
        if re.search(rf"\b{re.escape(singular)}(?:e?s)?\b", text):
            return True
    return False


def find_allergen_conflicts(text: str, allergens: Iterable[str]) -> List[str]:
    """Returns the allergens (as given) that `text` appears to contain."""
    haystack = (text or "").lower()
    return [a for a in allergens if a and a.strip() and _mentions(haystack, keywords_for(a))]


def violates_vegan(text: str) -> bool:
    haystack = (text or "").lower()
    if _mentions(haystack, _VEGAN_EXTRA_WORDS):
        return True
    return bool(find_allergen_conflicts(haystack, VEGAN_EXCLUDED))
