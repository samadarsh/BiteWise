import time
from typing import Any, Dict, Optional, Tuple
from agent.observability import log_info, metrics_tracker

class MCPCache:
    def __init__(self) -> None:
        # cache dict structure: { key: (value, expiration_timestamp) }
        self._cache: Dict[str, Tuple[Any, float]] = {}

    def _make_key(self, tool_name: str, arguments: Dict[str, Any]) -> str:
        # Create a stable string key from arguments
        sorted_args = sorted(arguments.items())
        args_str = ",".join(f"{k}:{v}" for k, v in sorted_args)
        return f"{tool_name}#{args_str}"

    def get(self, tool_name: str, arguments: Dict[str, Any]) -> Optional[Any]:
        key = self._make_key(tool_name, arguments)
        entry = self._cache.get(key)
        if entry is None:
            metrics_tracker.record_cache_miss()
            return None
        val, expires_at = entry
        if time.time() > expires_at:
            # Expired, remove from cache (pop: another thread may have already)
            self._cache.pop(key, None)
            log_info(f"Cache expired for tool: {tool_name}", extra={"tool": tool_name})
            metrics_tracker.record_cache_miss()
            return None

        log_info(f"Cache HIT for tool: {tool_name}", extra={"tool": tool_name})
        metrics_tracker.record_cache_hit()
        return val

    MAX_ENTRIES = 2000

    def set(self, tool_name: str, arguments: Dict[str, Any], value: Any, ttl_seconds: float = 600.0) -> None:
        key = self._make_key(tool_name, arguments)
        now = time.time()
        expires_at = now + ttl_seconds
        if len(self._cache) >= self.MAX_ENTRIES:
            # Expired entries were only ever removed when re-read, so the
            # cache grew without bound. Sweep them; if still full, drop the
            # entries closest to expiry.
            for k, (_, exp) in list(self._cache.items()):
                if exp <= now:
                    self._cache.pop(k, None)
            if len(self._cache) >= self.MAX_ENTRIES:
                for k, _ in sorted(self._cache.items(), key=lambda kv: kv[1][1])[: self.MAX_ENTRIES // 10]:
                    self._cache.pop(k, None)
        self._cache[key] = (value, expires_at)
        log_info(f"Cached results for tool: {tool_name} with TTL {ttl_seconds}s", extra={"tool": tool_name, "ttl": ttl_seconds})

    def invalidate_all(self) -> None:
        self._cache.clear()
        log_info("Cleared all cached MCP results.")

    def invalidate_tool(self, tool_name: str) -> None:
        keys_to_remove = [k for k in self._cache.keys() if k.startswith(f"{tool_name}#")]
        for k in keys_to_remove:
            self._cache.pop(k, None)
        log_info(f"Invalidated cache for tool: {tool_name}")

mcp_cache = MCPCache()
