# Sprint 14: SmartPantry AI Redesign — Tasks

## Backend: Data Model
- [x] Migrate `PantryItem` model (stock_level, category, expiry_date, added_at, is_bulk, bulk_use_count)

## Backend: Kitchen Templates
- [x] Create `backend/pantry/templates.py` with 30+ kitchen items

## Backend: Pantry Routes
- [x] Update existing endpoints for new schema
- [x] Add `POST /pantry/quick-stock`
- [x] Add `POST /pantry/cook/{recipe_name}`
- [x] Add `GET /pantry/expiring`
- [x] Add `POST /pantry/mark-purchased`

## Backend: Intelligence Module
- [x] Expand recipe templates to 30+
- [x] Adapt `detect_low_stock()` for stock_level
- [x] Adapt `suggest_cookable_recipes()` for stock_level + expiry boost
- [x] Adapt `group_grocery_items()` for stock_level
- [x] Add expiry defaults + `get_effective_expiry()` helper

## Backend: Grocery Routes
- [x] Adapt recipe-match for qualitative matching

## Backend: Tests
- [x] Update `test_household_module_flow()` for new schema
- [x] Update `test_household_intelligence_flow()` for new schema
- [x] Add `test_quick_stock_onboarding()`
- [x] Add `test_cook_auto_decrement()`
- [x] Add `test_bulk_item_slow_decrement()`
- [x] Add `test_expiring_items()`
- [x] Add `test_mark_purchased_restocks_pantry()`

## Frontend: API
- [x] Update `PantryItem` interface
- [x] Update `addOrUpdatePantryItem()` signature
- [x] Add `quickStockPantry()`, `cookRecipe()`, `getExpiringItems()`, `markPurchasedAndRestock()`

## Frontend: Components
- [x] Redesign `PantryManager.tsx` with battery-style cards
- [x] Create `QuickStockModal.tsx`
- [x] Add "I Cooked This" to `CookTodayPanel.tsx`
- [x] Add expiry alerts to `LowStockAlerts.tsx`
- [x] Wire up `HouseholdDashboard.tsx`

## Verification
- [x] All tests pass (59 passed)
- [x] `npm run lint` passes
- [x] `npm run build` passes
- [x] Push to main
