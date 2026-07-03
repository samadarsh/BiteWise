import sys
import requests

def run_smoke_tests():
    base_url = "http://localhost:8000"
    print("Starting NutriOrder AI Smoke Test Suite...")
    print(f"Connecting to backend: {base_url}\n" + "-"*50)

    try:
        # 1. Health check
        res_health = requests.get(f"{base_url}/health")
        assert res_health.status_code == 200, "Health check failed"
        print("[OK] Health check passed.")

        # 2. Config status check
        res_status = requests.get(f"{base_url}/auth/swiggy/status")
        assert res_status.status_code == 200, "Swiggy status check failed"
        status_data = res_status.json()
        print("[OK] Swiggy staging configuration status:")
        print(f"   - Mock Mode Active: {status_data.get('use_mock_mcp')}")
        print(f"   - DB Connection: {status_data.get('database_connected')}")
        print(f"   - Encryption Key: {status_data.get('encryption_key_configured')}")
        print(f"   - Client credentials: ID={status_data.get('client_id_configured')}, Secret={status_data.get('client_secret_configured')}")

        # Share session cookies across calls
        session = requests.Session()

        # 3. Demo login
        res_login = session.post(f"{base_url}/auth/demo-login")
        assert res_login.status_code == 200, "Demo login failed"
        print("[OK] Authenticated demo login successfully.")

        # 4. Start session
        res_sess = session.post(f"{base_url}/orders/session/start")
        assert res_sess.status_code == 200, "Start order session failed"
        session_id = res_sess.json()["session_id"]
        print(f"[OK] Spawned order session: {session_id}")

        # 5. Select address
        res_addr = session.post(f"{base_url}/orders/session/{session_id}/select-address", params={"address_id": "addr_home"})
        assert res_addr.status_code == 200, "Select address failed"
        print("[OK] Selected delivery location 'addr_home'.")

        # 6. Get coach status
        res_coach = session.get(f"{base_url}/coach/today")
        assert res_coach.status_code == 200, "Get coach status failed"
        coach_data = res_coach.json()
        print("[OK] Health Coach targets retrieved:")
        print(f"   - Calorie Target: {coach_data.get('target_calories')} kcal")
        print(f"   - Protein Target: {coach_data.get('target_protein')}g")

        # 7. Recommendation pipeline query
        search_payload = {
            "session_id": session_id,
            "query": "chicken salad"
        }
        res_search = session.post(f"{base_url}/recommendations/search", json=search_payload)
        assert res_search.status_code == 200, "Recommendation search failed"
        rec_data = res_search.json()
        rec_meal = rec_data.get("results", {}).get("recommendation", {})
        print("[OK] AI meal recommendation matches:")
        print(f"   - Recommended Meal: {rec_meal.get('item_name')} from {rec_meal.get('restaurant_name')}")
        print(f"   - Estimated macros: {rec_meal.get('protein_g')}g protein, {rec_meal.get('calories')} kcal")

        print("-"*50)
        print("Smoke test suite completed successfully. Backend is healthy and staging-ready.")
        return 0
    except requests.exceptions.ConnectionError:
        print("[FAIL] Connection failed. Please make sure your FastAPI backend server is running locally on port 8000.")
        return 1
    except AssertionError as e:
        print(f"[FAIL] Smoke test failed: {str(e)}")
        return 1
    except Exception as e:
        print(f"[FAIL] Unexpected smoke test failure: {str(e)}")
        return 1

if __name__ == "__main__":
    sys.exit(run_smoke_tests())
