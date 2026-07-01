import time
from agent.caching import MCPCache
from agent.observability import metrics_tracker

def test_cache_hit_miss_expiry():
    cache = MCPCache()
    metrics_tracker.reset()

    tool = "search_restaurants"
    args = {"addressId": "addr_1", "query": "pizza"}
    result_val = [{"id": "rest_1", "name": "Pizza Planet"}]

    # Initially missing
    cached = cache.get(tool, args)
    assert cached is None
    assert metrics_tracker.cache_misses == 1
    assert metrics_tracker.cache_hits == 0

    # Cache it with very short TTL
    cache.set(tool, args, result_val, ttl_seconds=0.5)

    # Now it hits
    cached_again = cache.get(tool, args)
    assert cached_again == result_val
    assert metrics_tracker.cache_hits == 1

    # Wait for TTL to expire
    time.sleep(0.6)

    # Now it misses again (expired)
    expired = cache.get(tool, args)
    assert expired is None
    assert metrics_tracker.cache_misses == 2
