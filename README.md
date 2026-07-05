# BiteWise

BiteWise is a food intelligence platform that helps people decide what to eat, what to cook, and what to restock.

It contains two product modules:

- **NutriOrder AI**: personal nutrition-aware Swiggy food ordering.
- **SmartPantry AI**: household pantry, recipe, grocery list, and Instamart cart-preview intelligence.

The platform uses Swiggy MCP as the execution layer while keeping order placement behind explicit review, environment locks, and safety checks.

---

## Product Modules

### NutriOrder AI

NutriOrder AI turns health goals into smarter Swiggy food orders.

Core capabilities:

- Fitness profile, calorie targets, protein targets, allergies, dislikes, budget, and cuisine preferences.
- Nutrition-aware meal ranking using estimated macros, confidence scoring, delivery time, price, taste, and user priorities.
- Explainable recommendations with reasons and tradeoffs.
- Cart review, coupon support, dynamic payment-method parsing, and explicit user confirmation.
- Daily nutrition ledger with manual entries and automatic meal logging after successful orders.

### SmartPantry AI

SmartPantry AI manages household food planning before the order happens.

Core capabilities:

- Shared household model with family members and dietary constraints.
- Pantry inventory with low-stock and out-of-stock detection.
- "What can I cook today?" recipe suggestions from seeded recipe templates.
- Missing ingredient detection and grocery list generation.
- Grocery grouping by category and priority.
- Mock Instamart cart preview with estimated totals. Real Instamart checkout is not enabled yet.

---

## Routes

- `/` - BiteWise landing page.
- `/pitch` - guided 5-step demo walkthrough.
- `/app` - authenticated product dashboard containing NutriOrder AI and SmartPantry AI.

---

## Tech Stack

- **Backend**: FastAPI, SQLAlchemy, SQLite/PostgreSQL-ready models, OAuth 2.1 PKCE flow, encrypted token storage.
- **Frontend**: Next.js App Router, React, TypeScript, Tailwind CSS.
- **MCP layer**: Swiggy Food MCP client, mock Food MCP, mock Instamart preview client.
- **Testing**: custom Python test runner plus frontend lint/build verification.

---

## Quick Start

### 1. Backend

```bash
cd path/to/nutriorderai
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Create `.env` from `.env.example`, then start FastAPI:

```bash
.venv/bin/python -m uvicorn backend.main:app --port 8000 --reload
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

---

## Demo Flow

For the fastest product walkthrough:

1. Open `http://localhost:3000/pitch`.
2. Click **Start Live Demo** when running in mock mode.
3. Walk through the 5-step BiteWise story:
   - NutriOrder AI health profile.
   - NutriOrder AI meal recommendation.
   - SmartPantry AI low-stock alerts.
   - SmartPantry AI cook-today suggestions.
   - SmartPantry AI grocery cart preview.

For the full app:

1. Open `http://localhost:3000/app`.
2. Use **Seed Demo Data**.
3. Switch between **NutriOrder AI** and **SmartPantry AI** in the product switcher.

---

## Verification

Run backend tests:

```bash
.venv/bin/python run_tests.py
```

Run frontend checks:

```bash
cd frontend
npm run lint
npm run build
```

Run smoke tests:

```bash
.venv/bin/python scripts/smoke_test.py --mode mock --journey coach
.venv/bin/python scripts/smoke_test.py --mode mock --journey household
```

Run local diagnostics:

```bash
.venv/bin/python scripts/dev_check.py
```

---

## Staging Status

Food MCP staging is ready for credential validation. Until Swiggy staging credentials are active:

- Keep `USE_MOCK_MCP=true`.
- Keep `ALLOW_PLACE_ORDER=false`.
- Use mock/demo mode for local walkthroughs.

When staging credentials arrive, follow `STAGING_READINESS.md` and use `scripts/validate_credentials.py` before running real staging validation.

Real Instamart checkout is intentionally not implemented yet. SmartPantry AI currently provides pantry intelligence, grocery grouping, and mock cart preview only.
