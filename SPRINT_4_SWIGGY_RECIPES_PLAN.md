# Sprint 4 Plan: Swiggy API Recipes Integration (Revised)

This sprint integrates the 6 official Swiggy MCP recipes and safety patterns, incorporating architectural corrections for coupon arguments, checkout recovery, availability/distance normalization, and voice payload stubs.

---

## 🛠️ Implementation Steps

### 1. Coupon Support in MCP Client & Mock Layers
- Add `fetch_food_coupons(self, restaurantId, addressId, couponCode)` and `apply_food_coupon(self, couponCode, addressId, cartId)` to `mcp/mcp_client.py`, `mcp/mcp_mock.py`, and `backend/mcp/swiggy_client.py`.
- Persist applied coupon discounts and coupon details in the mock cart object.
- Add `distance_km` to mock restaurants:
  - `rest_1` (Protein Bowl Co) -> `2.1` km
  - `rest_2` (Lean Meal Hub) -> `4.5` km
  - `rest_3` (Fit Feast Kitchen) -> `6.2` km

### 2. Backend Routes for Coupons & Ambiguous Checkout Recovery
- Implement `GET /orders/session/{session_id}/coupons` and `POST /orders/session/{session_id}/coupon/apply` endpoints. Filter coupons requiring online payments (`requiresOnlinePayment = True`).
- Handle checkout recovery in `/place` route on ambiguous exceptions (timeouts, connection issues, 5xx) by querying `get_food_orders`. Do not recover on 400, 401, 403, or safety-lock failures.

### 3. Pipeline Normalization & Availability Filtering
- Update `_convert_mcp_items` to parse `distance_km`.
- Update `_validate_constraints` to filter matching candidate meals whose restaurant `availabilityStatus != "OPEN"`.

### 4. Voice-Spoken Payloads & Recommendation Response Models
- Add `distance_km`, `delivery_time_spoken` (e.g. `"about 35 minutes"`), and `short_description` (voice-friendly, 1 sentence) to recommendation schemas.

### 5. Frontend Integration
- Add API types and routes in `frontend/lib/api.ts`.
- Build a coupon selection widget in the cart side-panel.
- Render distance warning badge on meal cards for distances > 5 km.
- Block checkout if cart exceeds ₹1000 and display warning at ₹850.

### 6. Automated & Build Verifications
- Add tests in `agent/tests/test_integration.py` for coupon schemas, COD filtering, ambiguous recovery, and availability filters.
- Verify production Next.js compilation (`npm run build`) and Python test runner.
