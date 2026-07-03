# NutriOrder AI 🥗

An AI-powered nutrition-aware food ordering agent that recommends high-protein meals based on user goals, budget, and preferences. It functions as a daily health companion, helping users track their macros and suggest optimal meals based on remaining daily nutrient caps.

---

## 🏗️ Tech Stack & Components

This repository contains two primary components:
1. **Production Backend (FastAPI)**: Owned Swiggy OAuth, state-safe order state machine, database token encryption, and the daily nutrition coach service layer.
2. **Production Frontend (Next.js & TypeScript)**: Collapsible personalized dashboard, staging cart review, coupon widget, and a componentized AI health coach sidebar.

---

## 🤖 Core Features

- 🥩 **Nutrition-Aware Recommendations**: Personalization engine maps meals based on fitness goals and strict dietary preferences.
- ⏱️ **Mifflin-St Jeor Biometrics**: Targets are calculated dynamically using Mifflin-St Jeor formulas when biometrics exist in the user profile.
- 🛡️ **Hard Safety Limits**: Prevents staging cart total from meeting or exceeding **₹1,000**.
- 🎫 **Dynamic Coupons**: Automatically fetches available coupons from Swiggy, filtering for COD-only compliance.
- 📋 **Daily Coach Ledger**: Tracks daily protein/calories and logs manual entries or placed Swiggy orders automatically.
- 💡 **Next Meal Suggestions**: Adviser suggests follow-up meals targeting remaining macros, enforcing safety floors.

---

## ⚙️ Quick Start

### 1. Install & Set Up Backend
Create a virtual environment and install dependencies:
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Create a `.env` file in the root folder (see `.env.example`):
```ini
APP_ENV=development
USE_MOCK_MCP=true
SWIGGY_ENV=mock
ALLOW_PLACE_ORDER=false
DATABASE_URL=sqlite:///./nutriorder.db
ENCRYPTION_KEY=your_32_byte_hex_encryption_key_here
CORS_ALLOWED_ORIGINS=http://localhost:3000
```

Start the FastAPI server:
```bash
python -m backend.main
```

### 2. Install & Set Up Frontend
Navigate to the frontend folder, install dependencies, and start the development server:
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:3000` to access the NutriOrder AI dashboard.

---

## 🎬 Repeating a Demo Flow
To show a clean, repeatable demo:
1. Click **"Reset Session"** in the top Demo Banner. This wipes database session history, logs, and mock cart memory state.
2. Click **"Seed Demo Data"** to automatically populate a biometric profile, Bengaluru Saved Addresses (Home & Office), and pre-logged breakfast and lunch entries.
3. Walk through the demo using the guided script in [DEMO_SCRIPT.md](file:///Users/samadarsh/Documents/MY%20PROJECTS/nutriorderai/DEMO_SCRIPT.md).

---

## 🧪 Testing and Verification

### 1. Run Complete Python Test Suite
We maintain unit and integration tests covering the personalization engine, caching layer, state transitions, checkout recovery, and daily coach boundaries.
```bash
python run_tests.py
```

### 2. Run Smoke Test Script
To quickly verify that the local backend endpoints are healthy and responding correctly:
```bash
python scripts/smoke_test.py
```

---

## 🔒 Staging Transition Checklist
When Swiggy Builders Club staging credentials arrive, consult the [STAGING_READINESS.md](file:///Users/samadarsh/Documents/MY%20PROJECTS/nutriorderai/STAGING_READINESS.md) file to configure the client variables and switch from mock mode to live staging integration safely.
