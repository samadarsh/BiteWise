# BiteWise Frontend

This is the Next.js frontend for BiteWise.

BiteWise contains two product modules:

- **NutriOrder AI**: health-aware Swiggy food ordering.
- **SmartPantry AI**: household pantry, recipe, and grocery planning.

## App Routes

- `/` - public landing page.
- `/pitch` - guided demo walkthrough.
- `/app` - authenticated dashboard with the NutriOrder AI and SmartPantry AI product switcher.

## Local Development

Start the backend first:

```bash
cd path/to/nutriorderai
.venv/bin/python -m uvicorn backend.main:app --port 8000 --reload
```

Then start the frontend:

```bash
cd frontend
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

## Verification

```bash
npm run lint
npm run build
```

## Environment

The frontend reads:

```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
```

If omitted, the client defaults to `http://127.0.0.1:8000`.
