import streamlit as st
import time
from agent.agent import NutriOrderAgent
from config.settings import get_settings
from agent.observability import metrics_tracker
import os

# Premium Sleek CSS styling for Streamlit
CUSTOM_CSS = """
<style>
    .main {
        background-color: #0f172a;
        color: #f8fafc;
    }
    .stButton>button {
        background: linear-gradient(135deg, #ff5200 0%, #ff7e40 100%);
        color: white;
        border: none;
        padding: 0.6rem 1.5rem;
        border-radius: 8px;
        font-weight: bold;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    .stButton>button:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(255, 82, 0, 0.4);
    }
    .card {
        background-color: #1e293b;
        padding: 1.5rem;
        border-radius: 12px;
        border: 1px solid #334155;
        margin-bottom: 1rem;
    }
    .metric-box {
        background-color: #0f172a;
        padding: 1rem;
        border-radius: 8px;
        border: 1px solid #334155;
        text-align: center;
    }
    .explanation-title {
        color: #ff5200;
        font-weight: bold;
        margin-top: 1rem;
        margin-bottom: 0.5rem;
    }
</style>
"""

def render_result(result: dict) -> None:
    recommendation = result["recommendation"]
    constraints = result["constraints"]

    # Wrap result in a styled card container
    st.markdown(f"""
    <div class="card">
        <h3 style="color: #ff5200; margin-top: 0;">🥗 Top Recommended Meal</h3>
        <p><strong>Restaurant:</strong> {recommendation['restaurant_name']}</p>
        <p><strong>Dishes:</strong> {recommendation['item_name']}</p>
        <p><strong>Protein Content:</strong> <span style="color: #4ade80; font-weight: bold;">{recommendation['protein_g']} g</span></p>
        <p><strong>Estimated Calories:</strong> {int(recommendation.get('calories', 500))} kcal</p>
        <p><strong>Price:</strong> Rs {recommendation['price']}</p>
        <p><strong>Estimated Delivery:</strong> {recommendation['delivery_time_min']} mins</p>
        <p><strong>Match Score:</strong> {round(recommendation['score'], 1)} / 100</p>
    </div>
    """, unsafe_allow_html=True)

    # Warnings if fallbacks were executed
    if result.get("fallback_warnings"):
        for warning in result["fallback_warnings"]:
            st.warning(f"⚠️ {warning}")

    # Explainable recommendations
    st.subheader("💡 Why This Was Chosen")
    explanations = recommendation.get("explanations", [])
    if explanations:
        for bullet in explanations:
            st.markdown(f"- {bullet}")
    else:
        st.markdown(
            f"- Fits your protein target of at least {constraints['target_protein']} g "
            f"within a budget of Rs {constraints['typical_budget']}."
        )

    # Cart preview
    if result.get("cart_preview"):
        with st.expander("🛒 Swiggy Cart Preview"):
            st.json(result["cart_preview"])

    if result.get("cart_state"):
        with st.expander("📦 Cart Detailed State"):
            st.json(result["cart_state"])


def render_confirmation_result(result: dict) -> None:
    if not result["success"]:
        st.error(result["message"])
        return

    st.subheader("🎉 Order Status")
    st.success(result["message"])
    st.json(result["order"])

    if result.get("tracking"):
        st.subheader("🛵 Delivery Tracking")
        st.json(result["tracking"])

    if result.get("mock_mode"):
        st.info("This is running in mock mode. No real delivery partner has been dispatched.")


def main() -> None:
    st.set_page_config(page_title="NutriOrder AI", page_icon="🥗", layout="wide")
    st.markdown(CUSTOM_CSS, unsafe_allow_html=True)

    settings = get_settings()
    
    # Cache agent initialization in session state
    if "agent" not in st.session_state:
        st.session_state["agent"] = NutriOrderAgent(settings=settings)
    agent = st.session_state["agent"]

    st.title("🥗 NutriOrder AI")
    st.caption("Production-Ready Goal-Driven Nutrition and Food Ordering Assistant powered by Swiggy MCP.")

    # Main columns
    col_input, col_output = st.columns([1.1, 1.2])

    with col_input:
        st.subheader("1. Configure Your Order")
        
        # User Memory & Preferences Panel in Sidebar
        with st.sidebar:
            st.markdown("### 👤 Long-Term Memory Profile")
            st.caption("Preferences are remembered across orders.")
            
            # Select Goal
            goal_mapping = {
                "Muscle Gain": "muscle_gain",
                "Fat Loss": "fat_loss",
                "Weight Maintenance": "maintenance",
                "General Health": "general"
            }
            goal_options = list(goal_mapping.keys())
            current_goal_key = next((k for k, v in goal_mapping.items() if v == agent.memory.profile["fitness_goal"]), "Muscle Gain")
            goal_sel = st.selectbox("Fitness Goal", options=goal_options, index=goal_options.index(current_goal_key))
            
            # Update target macros
            protein_t = st.slider("Target Protein (g)", 10, 80, int(agent.memory.profile["target_protein"]))
            calories_t = st.slider("Target Calories (kcal)", 300, 1200, int(agent.memory.profile["target_calories"]))
            
            # Allergies & Dislikes
            allergies_str = st.text_input("Allergies (comma-separated)", value=", ".join(agent.memory.profile["allergies"]))
            dislikes_str = st.text_input("Disliked Foods (comma-separated)", value=", ".join(agent.memory.profile["dislikes"]))
            favorite_cuisines_str = st.text_input("Favorite Cuisines (comma-separated)", value=", ".join(agent.memory.profile["favorite_cuisines"]))
            
            # Save memory changes
            if st.button("Save Profile Settings"):
                allergies = [a.strip().lower() for a in allergies_str.split(",") if a.strip()]
                dislikes = [d.strip().lower() for d in dislikes_str.split(",") if d.strip()]
                cuisines = [c.strip().lower() for c in favorite_cuisines_str.split(",") if c.strip()]
                
                agent.memory.update_profile({
                    "fitness_goal": goal_mapping[goal_sel],
                    "target_protein": protein_t,
                    "target_calories": calories_t,
                    "allergies": allergies,
                    "dislikes": dislikes,
                    "favorite_cuisines": cuisines
                })
                st.success("Profile saved!")
                time.sleep(0.5)
                st.rerun()

            if st.button("Reset Long-Term Profile", type="secondary"):
                agent.memory.reset_profile()
                st.info("Profile reset.")
                time.sleep(0.5)
                st.rerun()

        # Multi-modal Voice / Text input
        input_mode = st.radio("Input mode", options=["Text Prompt", "Voice Input (Upload Audio)"], horizontal=True)
        
        user_goal = ""
        if input_mode == "Text Prompt":
            user_goal = st.text_input(
                "What would you like to eat today?",
                value="Order me a high protein dinner under Rs 300",
            )
        else:
            uploaded_audio = st.file_uploader("Upload an audio recording of your order", type=["wav", "mp3", "m4a", "ogg"])
            if uploaded_audio:
                st.audio(uploaded_audio)
                if st.button("Transcribe & Parse Voice Order"):
                    with st.spinner("Processing audio with Whisper & Groq..."):
                        try:
                            # Save temp file
                            from voice_interface.audio_utils import save_uploaded_audio
                            temp_path = save_uploaded_audio(uploaded_audio)
                            
                            # Transcribe
                            from voice_interface.transcribe import transcribe_audio
                            transcript_res = transcribe_audio(temp_path)
                            transcription_text = transcript_res.get("text", "")
                            
                            st.write(f"**Transcription:** \"{transcription_text}\"")
                            
                            # Parse intent via Groq
                            from voice_interface.intent_parser import parse_food_order_intent
                            parsed_intent = parse_food_order_intent(transcription_text)
                            
                            # Update session state with voice constraints
                            st.session_state["voice_intent"] = parsed_intent
                            st.success("Parsed voice order constraints successfully!")
                        except Exception as e:
                            st.error(f"Voice processing failed: {str(e)}")
                            st.info("Ensure GROQ_API_KEY is configured in your settings and Whisper is installed.")

        # Display parsed voice intent if any
        voice_intent = st.session_state.get("voice_intent")
        if voice_intent:
            st.json(voice_intent)
            # Pre-populate settings from voice intent
            protein_target = voice_intent.get("protein_goal", 30)
            budget_max = voice_intent.get("budget", 300)
            max_delivery_time = voice_intent.get("delivery_time", 45)
            user_goal = voice_intent.get("query") or "Order meal"
        else:
            # Standard inputs linked to memory default values
            protein_target = st.number_input("Minimum protein (g)", min_value=0, value=int(agent.memory.profile["target_protein"]))
            budget_max = st.number_input("Maximum budget (Rs)", min_value=50, value=int(agent.memory.profile["typical_budget"]))
            max_delivery_time = st.number_input(
                "Maximum delivery time (minutes)",
                min_value=10,
                value=45,
            )

        dietary_preference = st.selectbox(
            "Dietary preference",
            options=["any", "veg", "non-veg"],
            index=0,
        )

        submitted = st.button("Find Recommended Meal")

    with col_output:
        st.subheader("2. Recommendation Results")
        
        if submitted:
            with st.spinner("Executing recommendation pipeline..."):
                result = agent.recommend_meal(
                    user_goal=user_goal,
                    protein_target_g=int(protein_target),
                    budget_max_rs=int(budget_max),
                    max_delivery_time_min=int(max_delivery_time),
                    dietary_preference=dietary_preference,
                )

            if not result["success"]:
                st.error(result["message"])
                if result.get("fallback_warnings"):
                    for w in result["fallback_warnings"]:
                        st.warning(w)
                return

            st.session_state["latest_result"] = result
            st.session_state.pop("confirmation_result", None)

        latest_result = st.session_state.get("latest_result")
        if latest_result:
            render_result(latest_result)
            if latest_result.get("mock_mode"):
                st.info("Running in mock mode. Orders will not be placed on real Swiggy servers.")

            if st.button("Confirm and Place Order (Cash On Delivery)"):
                with st.spinner("Placing order securely..."):
                    confirmation_result = agent.confirm_order(latest_result)
                    st.session_state["confirmation_result"] = confirmation_result

        confirmation_result = st.session_state.get("confirmation_result")
        if confirmation_result:
            render_confirmation_result(confirmation_result)

    # Full developer console at the bottom
    st.write("---")
    with st.expander("🛠️ Developer Logs & Performance Metrics"):
        summary = metrics_tracker.get_metrics_summary()
        
        col_m1, col_m2, col_m3, col_m4 = st.columns(4)
        with col_m1:
            st.metric("Cache Hit Ratio", f"{summary['cache_hit_ratio_percent']}%")
        with col_m2:
            st.metric("Total Tool Calls", summary["tool_calls"])
        with col_m3:
            st.metric("Retry Requests", summary["retries"])
        with col_m4:
            st.metric("Tool Failures", summary["tool_failures"])

        st.markdown("### Average Latency Metrics")
        for k, v in summary["avg_latencies_sec"].items():
            st.write(f"- **{k}**: {v*1000:.1f} ms")

        # Personalization insights
        st.markdown("### Personalization Insights")
        pers_sum = agent.personalization.get_personalization_summary()
        st.json(pers_sum)

        # Live structured log stream
        st.markdown("### Production Log Stream")
        for log in reversed(metrics_tracker.log_history):
            color = "#ef4444" if log["level"] == "ERROR" else ("#f59e0b" if log["level"] == "WARNING" else "#10b981")
            st.markdown(
                f"<span style='color: {color}; font-weight: bold;'>[{log['level']}]</span> "
                f"<span style='color: #64748b;'>{log['timestamp']}</span>: {log['message']}",
                unsafe_allow_html=True
            )


if __name__ == "__main__":
    main()
