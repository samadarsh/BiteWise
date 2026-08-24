import os
import pytest

from backend.auth.rate_limiter import mutating_rate_limiter


@pytest.fixture(autouse=True)
def _restore_environ():
    """Several tests set os.environ["USE_MOCK_MCP"] (and similar settings
    vars) to exercise a specific mode, but at least one (test_coach.py, 5
    call sites) never restores it — with no fixture like this, that leaves
    USE_MOCK_MCP="true" leaked into every test that runs afterward for the
    rest of the pytest session. That's not just theoretical: four tests in
    test_integration.py (e.g. test_production_checkout_validation_rules)
    only pass today because they happen to run after test_coach.py and
    silently inherit that leaked value — running test_integration.py alone,
    or in a different order, fails them against a real .env where
    USE_MOCK_MCP=false. Snapshot and restore os.environ around every test so
    none of this depends on collection order or which other tests ran
    first, regardless of whether the test itself remembers to clean up."""
    snapshot = dict(os.environ)
    yield
    os.environ.clear()
    os.environ.update(snapshot)


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    """mutating_rate_limiter is a module-level singleton shared by the real
    app across all requests from one deployment instance — correct there,
    but it would otherwise let unrelated tests silently trip each other's
    rate limit (e.g. many tests call /auth/guest, and TestClient always uses
    the same fake client IP, so their call counts stack up in one pytest
    run). Reset before every test so each one sees a fresh window, matching
    what a real fresh client would see."""
    mutating_rate_limiter.history.clear()
    yield
