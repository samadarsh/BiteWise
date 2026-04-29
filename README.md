# NutriOrder AI

AI-powered nutrition-aware food ordering agent that recommends high-protein meals based on user goals, budget, and preferences — and places confirmed orders through Swiggy MCP.

---

## 🚀 Problem

Users struggle to consistently find meals that match:
- Daily protein targets  
- Budget constraints  
- Delivery time expectations  
- Healthy eating habits  

Food ordering apps provide options — but not intelligent decision-making.

---

## 💡 Solution

NutriOrder AI acts as an AI-driven decision layer on top of Swiggy, enabling users to:

- Discover meals aligned with fitness goals (high protein, low calorie, etc.)
- Stay within budget
- Reduce decision fatigue
- Order efficiently with AI-assisted recommendations

---

## 🧠 Core Features

- 🥩 Nutrition-aware meal recommendations  
- 💰 Budget-constrained ordering  
- ⏱️ Delivery-time optimization  
- 🤖 AI-driven ranking of menu items  
- 🛒 Smart cart management via Swiggy MCP  
- ✅ Safe order placement with user confirmation  
- 📦 Real-time order tracking  

---

## ⚙️ Architecture

User → Frontend → AI Agent → Nutrition Scoring Engine → Swiggy MCP → Cart → Confirmation → Order Placement

---

## 🔄 MCP Integration Flow (Swiggy Food)

NutriOrder AI follows the standard Swiggy MCP food ordering workflow:

1. `get_addresses`  
   → Resolve user’s delivery location  

2. `search_restaurants`  
   → Discover relevant restaurants  

3. `get_restaurant_menu` / `search_menu`  
   → Retrieve available food items  

4. AI Processing  
   → Rank items based on:
   - Estimated protein value  
   - Price  
   - User preferences  

5. `update_food_cart`  
   → Add selected items to cart  

6. `get_food_cart`  
   → Verify cart contents and total price  

7. User Confirmation  
   → Explicit confirmation before placing order  

8. `place_food_order`  
   → Place order safely (non-idempotent)  

9. `track_food_order`  
   → Track delivery status  

---

## ⚠️ Compliance & Safety

- Orders are placed **only after user confirmation**  
- Cart is always verified before placing an order  
- Food cart is tied to a single restaurant  
- No blind retries on order placement  
- COD (Cash on Delivery) supported in v1  
- Cart value handled within Swiggy Builders limits  

---

## 🧰 Tech Stack

- Frontend: Next.js / Streamlit  
- Backend: FastAPI  
- Agent Layer: LangGraph / OpenAI Agents SDK  
- Execution Layer: Swiggy MCP (Food Server)  
- Database: PostgreSQL / SQLite  
- Auth: OAuth 2.1 (PKCE)  

---

## 🔗 MCP Integration

NutriOrder AI integrates with Swiggy’s Model Context Protocol (MCP):

- Uses Swiggy Food MCP server  
- Executes actions via authenticated API calls  
- Processes structured JSON responses for decision-making  
- Maintains server-side cart state  

---

## 🧪 Demo Flow

1. User: “Order me a high-protein dinner under ₹300”  
2. Agent filters meals based on protein + price  
3. Ranks optimal choices  
4. Adds to cart  
5. Requests user confirmation  
6. Places order via MCP  

---

## 📌 Status

🚧 MVP (Minimum Viable Product) in development  
🔐 Awaiting Swiggy MCP API access for live execution  

---

## 🔮 Future Improvements

- Instamart integration (grocery-based meal planning)  
- Macro tracking (protein, carbs, fats)  
- Voice-based ordering agent  
- Personalized diet profiles  
- Integration with fitness apps  

---

## 👤 Author

Sam Adarsh  
AI & Data Science | Building AI systems for real-world automation  
Founder @ Haugtun  

---

## 📝 Note

This project is being built as part of the Swiggy Builders Club program.
