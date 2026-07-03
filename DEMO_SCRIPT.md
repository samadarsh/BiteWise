# NutriOrder AI - 5-Minute Demonstration Walkthrough Script

This script outlines a structured, end-to-end user journey to demonstrate NutriOrder AI's core capabilities: personalization, safety cap validation, dynamic coupons, recovery resilience, and daily health coach tracking.

---

## 🎭 Preparation
1. Start the backend server (`python -m backend.main`) and frontend dev server (`npm run dev`).
2. Open the dashboard in your web browser (`http://localhost:3000`).
3. Click the **"Reset Session"** button in the Demo Banner at the top of the screen to start with a completely clean slate.

---

## 🚶 Walkthrough Steps

### Step 1: Initialize Mock Demo Seed Data
* **Action**: Click the **"Seed Demo Data"** button in the top Demo Banner.
* **Explanation**: Explain that this provisions a standard user profile containing:
  * Biometric profile details (28-year-old male, 75kg, moderate activity) resulting in calculated Mifflin-St Jeor TDEE targets.
  * Two saved mock addresses (Home and Office) located in Bengaluru.
  * Pre-logged breakfast and lunch logs in the daily coach history tracker.

### Step 2: Review Daily Target Progress
* **Action**: Look at the **AI Nutrition Coach** sidebar panel.
* **Explanation**: Point out the progress rings/bars showing today's macro totals (Calories & Protein). Notice that the Oats and Chicken Salad are already logged, leaving remaining calorie/protein targets.

### Step 3: Pick a Delivery Address
* **Action**: Select the **"Home"** address option under Step 1: Address Selection.
* **Explanation**: Explain that selecting an address spawns a state-safe order session on the backend and records the selected coordinates.

### Step 4: Ask the Advisor for the Next Meal suggestion
* **Action**: Scroll to the Coach panel and click **"Suggest My Next Meal"**.
* **Explanation**: Explain that the AI adviser queries the Swiggy mock MCP and runs the recommendation pipeline automatically configured to target the *remaining* daily macros. Note that if targets were already met, it applies safety floors so as not to request zero-calorie food.

### Step 5: Select a Recommended Meal and Review Cart
* **Action**: Click **"Select Meal"** on the top suggestion card (e.g. *Grilled Chicken Rice Bowl*).
* **Explanation**: Notice that selecting a meal:
  * Non-blockingly caches its nutrition estimates in the database session.
  * Syncs the item to the staging cart.
  * Reveals the Staging Cart Review panel, including an approach warning if the cost is close to the Rs 1000 safety cap.

### Step 6: Fetch and Apply Coupons
* **Action**: Look at the Coupon selector widget. Select and click **"Apply"** on a COD-compatible coupon (e.g. `FITNEW50`).
* **Explanation**: Point out that the system dynamically retrieves coupons from the Swiggy MCP client, filters out any coupons requiring online payment (retaining COD only), and dynamically updates the cart total on the staging review panel.

### Step 7: Place Mock Order and Confirm Ledger
* **Action**: Check the confirmation checkbox and click **"Place COD Order on Swiggy"**.
* **Explanation**:
  * The order placements uses the ambiguous-recovery checkout policy (resilience checking).
  * Point out that upon successful confirmation, the order successfully transitions to placed status and the selected meal is **automatically appended** to the daily nutrition history logs, updating the coach dashboard totals instantly.

---

## 🎯 Key Takeaways to Highlight
* **Real-time Personalization**: Recommendation calculations are dynamically calculated using Mifflin-St Jeor biometrics.
* **Hard Safety Cap locks**: Prevents checkout from exceeding the Rs 1000 Swiggy Builders Club limit.
* **Closed-loop Health Tracking**: Integrates MCP Swiggy orders directly into a daily ledger, providing a true daily health companion.
