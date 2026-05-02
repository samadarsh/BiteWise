# NutriOrder AI 🥗

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
- 🎙️ Multi-modal voice support (record or upload audio files)
- ⚙️ Configurable Whisper model selection and audio normalization
- 🛠️ Developer tools (Voice JSON testing form, transcript debug panels)

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

### 🎙️ Voice JSON Contract

Voice transcription must be normalized into this exact JSON shape before it enters
the NutriOrderAI pipeline:

```json
{
  "intent": "order_food",
  "protein_goal": 30,
  "budget": 200,
  "delivery_time": 30,
  "preferences": ["chicken", "no spicy"],
  "location": "user_location"
}
```

The Groq intent parser in `voice_interface/intent_parser.py` is prompted to return
only these six keys. The agent accepts this payload directly through
`recommend_meal_from_json(...)` and adapts it into the internal recommendation
constraints.

If Groq returns malformed JSON or the wrong schema, NutriOrderAI retries once with
the validation error. A second failure asks the user to clarify the voice command
instead of sending uncertain input into the ordering pipeline.

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
```

---

## 🧰 Tech Stack

- 🎨 Frontend: Streamlit  
- 🧠 Agent Layer: Python orchestration layer  
- 🎙️ Voice: Streamlit audio recording/upload + Whisper transcription + Groq intent parsing
- 🔌 Execution Layer: Swiggy MCP Food Server  
- ⚙️ Config: `python-dotenv`  
- 🚀 Future Upgrade Path: OpenAI Agents SDK or LangGraph  

Voice transcription expects `ffmpeg` to be available on the system path for
audio conversion and normalization.

---

## 🔗 MCP Integration

NutriOrder AI integrates with Swiggy's Model Context Protocol:

- 🍛 Uses the Swiggy Food MCP server  
- 🔐 Executes actions via authenticated API calls  
- 📄 Processes structured JSON responses for decision-making  
- 🧺 Maintains server-side cart state  

---

## 🎯 Current MVP Scope

This repository currently focuses on:

- 🖥️ A local Streamlit interface  
- 🧪 A mock MCP integration for development  
- 🥗 Nutrition-first recommendation logic  
- 🔄 A clean structure for swapping in a real Swiggy MCP client later  

---

## 🎬 Demo Flow

1. User: "Order me a high-protein dinner under Rs 300"  
2. Agent filters meals based on protein and price  
3. Agent ranks optimal choices  
4. Agent prepares a mock cart preview  
5. User reviews the recommendation  
6. Live MCP ordering can be added in the next phase  

---

## 📌 Status

- 🚧 Currently in MVP development phase  
- 🧪 Prototyping against a local mock flow  
- 🔐 Production Swiggy MCP access is still pending approval  

---

## 🔮 Future Improvements

- 🔌 Real Swiggy MCP client integration  
- 🛒 Cart review and confirmation UI  
- 🛍️ Instamart integration  
- 📊 Macro tracking for protein, carbs, and fats  
- 👤 Personalized diet profiles  
- ⌚ Integration with fitness apps  

---

## 📝 Note

This project is being built as part of the Swiggy Builders Club program.
