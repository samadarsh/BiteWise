import sys
import traceback

def run_suite():
    # Import test modules
    try:
        from agent.tests import test_ranking, test_caching, test_fallback, test_integration, test_nutrition, test_coach, test_demo, test_observability, test_oauth_pkce
    except ImportError as e:
        print(f"Failed to import test modules: {str(e)}")
        sys.exit(1)

    tests = [
        ("test_ranking_muscle_gain", test_ranking.test_ranking_muscle_gain),
        ("test_ranking_strict_dietary_pref", test_ranking.test_ranking_strict_dietary_pref),
        ("test_cache_hit_miss_expiry", test_caching.test_cache_hit_miss_expiry),
        ("test_pipeline_fallback", test_fallback.test_pipeline_fallback),
        ("test_query_propagation", test_integration.test_query_propagation),
        ("test_voice_json_adapter", test_integration.test_voice_json_adapter),
        ("test_response_envelope_normalization", test_integration.test_response_envelope_normalization),
        ("test_real_schema_arguments", test_integration.test_real_schema_arguments),
        ("test_non_idempotent_order_safety", test_integration.test_non_idempotent_order_safety),
        ("test_place_order_requires_staging_and_allow_flag", test_integration.test_place_order_requires_staging_and_allow_flag),
        ("test_database_models_and_queries", test_integration.test_database_models_and_queries),
        ("test_cryptography_fail_closed", test_integration.test_cryptography_fail_closed),
        ("test_production_swiggy_client_token_loading", test_integration.test_production_swiggy_client_token_loading),
        ("test_mock_swiggy_cart_is_per_user_and_request_safe", test_integration.test_mock_swiggy_cart_is_per_user_and_request_safe),
        ("test_db_backed_memory_manager", test_integration.test_db_backed_memory_manager),
        ("test_order_state_machine_validation", test_integration.test_order_state_machine_validation),
        ("test_production_checkout_validation_rules", test_integration.test_production_checkout_validation_rules),
        ("test_sliding_window_rate_limiter", test_integration.test_sliding_window_rate_limiter),
        ("test_recommendations_search_endpoint", test_integration.test_recommendations_search_endpoint),
        ("test_complete_journey_routes", test_integration.test_complete_journey_routes),
        ("test_feedback_endpoint_fastapi_contract", test_integration.test_feedback_endpoint_fastapi_contract),
        ("test_nutrition_targets_calc", test_nutrition.test_nutrition_targets_calc),
        ("test_nutrition_estimator", test_nutrition.test_nutrition_estimator),
        ("test_ranking_with_priorities", test_nutrition.test_ranking_with_priorities),
        ("test_search_request_schema", test_nutrition.test_search_request_schema),
        ("test_db_memory_loads_biometrics_for_target_engine", test_nutrition.test_db_memory_loads_biometrics_for_target_engine),
        ("test_pipeline_relaxation_patch_overrides_computed_targets", test_nutrition.test_pipeline_relaxation_patch_overrides_computed_targets),
        ("test_sprint3_settings_resolution", test_integration.test_sprint3_settings_resolution),
        ("test_sprint3_request_id_middleware", test_integration.test_sprint3_request_id_middleware),
        ("test_sprint3_centralized_order_event_audit", test_integration.test_sprint3_centralized_order_event_audit),
        ("test_sprint3_auth_status_endpoint", test_integration.test_sprint3_auth_status_endpoint),
        ("test_sprint4_coupons_schema_and_cod_filter", test_integration.test_sprint4_coupons_schema_and_cod_filter),
        ("test_sprint4_checkout_recovery_and_failing_closed", test_integration.test_sprint4_checkout_recovery_and_failing_closed),
        ("test_sprint4_availability_and_distance_filtering", test_integration.test_sprint4_availability_and_distance_filtering),
        ("test_timezone_aware_date_boundaries", test_coach.test_timezone_aware_date_boundaries),
        ("test_coach_target_calculation", test_coach.test_coach_target_calculation),
        ("test_coach_manual_and_history_endpoints", test_coach.test_coach_manual_and_history_endpoints),
        ("test_coach_next_meal_address_rule_and_floors", test_coach.test_coach_next_meal_address_rule_and_floors),
        ("test_order_success_autologging", test_coach.test_order_success_autologging),
        ("test_demo_endpoints_forbidden_in_production", test_demo.test_demo_endpoints_forbidden_in_production),
        ("test_demo_reset_and_seed_data_flow", test_demo.test_demo_reset_and_seed_data_flow),
        ("test_address_selection_persistence", test_demo.test_address_selection_persistence),
        ("test_log_redaction_message", test_observability.test_log_redaction_message),
        ("test_log_redaction_extra", test_observability.test_log_redaction_extra),
        ("test_swiggy_oauth_start_sets_cookies_and_returns_url", test_oauth_pkce.test_swiggy_oauth_start_sets_cookies_and_returns_url),
        ("test_swiggy_oauth_callback_state_verification", test_oauth_pkce.test_swiggy_oauth_callback_state_verification),
        ("test_swiggy_oauth_callback_mock_mode_success", test_oauth_pkce.test_swiggy_oauth_callback_mock_mode_success),
        ("test_swiggy_oauth_callback_production_token_exchange", test_oauth_pkce.test_swiggy_oauth_callback_production_token_exchange),
        ("test_swiggy_oauth_callback_success_redirect", test_oauth_pkce.test_swiggy_oauth_callback_success_redirect),
        ("test_swiggy_oauth_callback_failure_redirect", test_oauth_pkce.test_swiggy_oauth_callback_failure_redirect),
    ]

    passed = 0
    failed = 0

    print("Running NutriOrder AI Unit & Integration Tests...\n" + "="*40)
    for name, func in tests:
        try:
            func()
            print(f"✅ {name} PASSED")
            passed += 1
        except AssertionError as e:
            print(f"❌ {name} FAILED (AssertionError)")
            traceback.print_exc()
            failed += 1
        except Exception as e:
            print(f"❌ {name} FAILED ({type(e).__name__}): {str(e)}")
            traceback.print_exc()
            failed += 1

    print("="*40)
    print(f"Summary: {passed} passed, {failed} failed")
    if failed > 0:
        sys.exit(1)

if __name__ == "__main__":
    run_suite()
