# NutriOrder AI

AI-powered fitness meal ordering agent that intelligently discovers and executes food orders based on user goals like protein intake, budget, and dietary preferences.

---

## 🚀 Problem

Users struggle to consistently find meals that match:
- Daily protein targets
- Budget constraints
- Time availability
- Healthy eating habits

Food ordering apps provide options — but not decision-making.

---

## 💡 Solution

NutriOrder AI acts as an intelligent agent that:

- Understands user intent (e.g., “high protein meal under ₹300”)
- Filters and ranks meals based on nutrition, price, and delivery time
- Automatically executes food orders using Swiggy MCP

---

## 🧠 Core Features

- 🥩 High-protein meal discovery
- 💰 Budget-aware optimization
- ⏱️ Time-aware ordering (fast delivery filtering)
- 🤖 AI-driven decision making
- 🛒 End-to-end ordering automation

---

## ⚙️ Architecture

User → Frontend → AI Agent → Swiggy MCP → Order Execution

### Flow:
1. User inputs goal (protein, budget, preference)
2. AI agent converts input into structured constraints
3. Swiggy MCP tools are called:
   - search_restaurants
   - search_menu
   - add_to_cart
   - place_order
4. Meals are ranked using a nutrition + cost scoring logic
5. Final recommendation is shown → order executed on confirmation

---

## 🧰 Tech Stack

- Frontend: Next.js / Streamlit
- Backend: FastAPI
- Agent Layer: LangGraph / OpenAI Agents SDK
- Execution Layer: Swiggy MCP (Food Server)
- Database: PostgreSQL / SQLite (user preferences)
- Auth: OAuth 2.1 (PKCE)

---

## 🔗 MCP Integration

NutriOrder AI integrates with Swiggy’s Model Context Protocol (MCP) to perform real-world actions.

- Uses Swiggy Food MCP server
- Calls tools via authenticated API requests
- Handles structured JSON responses for decision making

---

## 🧪 Demo Flow

1. User: “Order me a high-protein dinner under ₹300”
2. Agent filters meals based on protein + cost
3. Selects optimal meal
4. Adds to cart → places order via MCP

---

## 📌 Status

🚧 Currently in MVP development phase
🔐 Awaiting Swiggy MCP API access for live integration

---

## 🔮 Future Improvements

- Calorie & macro tracking integration
- Weekly meal planning automation
- Voice-based ordering assistant
- Personalized food learning system
- Integration with fitness trackers

---

## 👤 Author

Sam Adarsh
AI & Data Science | Building AI systems for real-world automation
Founder @ Haugtun

--
