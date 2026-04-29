# 🥗 NutriOrder AI

AI-powered nutrition-aware food ordering agent that recommends high-protein meals based on user goals, budget, and preferences, and places confirmed orders through Swiggy MCP.

---

## 🚀 Problem

Users struggle to consistently find meals that match:
- Daily protein targets  
- Budget constraints  
- Delivery time expectations  
- Healthy eating habits  

Food ordering apps provide options, but not intelligent decision-making.

---

## 💡 Solution

NutriOrder AI acts as an AI-driven decision layer on top of Swiggy, enabling users to:

- Discover meals aligned with fitness goals such as high protein or lower calorie options  
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

User → Frontend → AI Agent → Address Resolution → Swiggy MCP Food Server → Nutrition Scoring → Cart → User Confirmation → Order Placement  

### 🔄 Flow

1. User inputs goal, budget, and dietary preference  
2. AI agent converts input into structured constraints  
3. Resolve delivery location using `get_addresses`  
4. Discover restaurants using `search_restaurants`  
5. Retrieve menu data using `get_restaurant_menu` or `search_menu`  
6. Rank meals using protein, price, delivery time, and preferences  
7. Build cart using `update_food_cart`  
8. Verify cart using `get_food_cart`  
9. Require explicit user confirmation  
10. Place order using `place_food_order`  
11. Track order using `track_food_order`  

### 🧪 Current MVP Note

The current local scaffold stops at recommendation + mock cart preparation.  
Real order placement and tracking will be enabled after MCP access.

---

## ⚠️ Compliance & Safety

- Orders are placed **only after explicit user confirmation**  
- Cart is verified before placing an order  
- Food cart is tied to a single restaurant  
- No blind retries on order placement (non-idempotent)  
- COD support will be handled during live integration  

---

## 🏗️ Project Structure

```text
NutriOrderAI/
├── app.py
├── agent/
│   └── agent.py
├── mcp/
│   ├── mcp_mock.py
│   └── mcp_client.py
├── utils/
│   └── nutrition_scorer.py
├── config/
│   └── settings.py
├── requirements.txt
├── .env.example
├── README.md
└── .gitignore
