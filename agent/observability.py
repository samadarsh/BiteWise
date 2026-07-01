import json
import logging
import time
from collections import defaultdict
from typing import Any, Dict

# Config structured logger
logger = logging.getLogger("NutriOrderAI")
logger.setLevel(logging.INFO)

class JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        log_data = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
        }
        if hasattr(record, "extra_data") and isinstance(record.extra_data, dict):
            log_data.update(record.extra_data)
        return json.dumps(log_data)

# Create console handler with JSON formatter
# Avoid adding duplicate handlers if already present
if not logger.handlers:
    ch = logging.StreamHandler()
    ch.setFormatter(JSONFormatter())
    logger.addHandler(ch)

class MetricsTracker:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(MetricsTracker, cls).__new__(cls)
            cls._instance.reset()
        return cls._instance

    def reset(self):
        self.latencies: Dict[str, list] = defaultdict(list)
        self.cache_hits: int = 0
        self.cache_misses: int = 0
        self.tool_calls: int = 0
        self.tool_failures: int = 0
        self.oauth_failures: int = 0
        self.recommendation_count: int = 0
        self.recommendation_failures: int = 0
        self.order_attempts: int = 0
        self.order_successes: int = 0
        self.order_failures: int = 0
        self.retries: int = 0
        self.error_counts: Dict[str, int] = defaultdict(int)
        self.log_history: list[dict] = []

    def record_latency(self, metric_name: str, duration_sec: float):
        self.latencies[metric_name].append(duration_sec)

    def record_cache_hit(self):
        self.cache_hits += 1

    def record_cache_miss(self):
        self.cache_misses += 1

    def record_tool_call(self, success: bool = True):
        self.tool_calls += 1
        if not success:
            self.tool_failures += 1

    def record_oauth_failure(self):
        self.oauth_failures += 1

    def record_recommendation(self, success: bool = True):
        self.recommendation_count += 1
        if not success:
            self.recommendation_failures += 1

    def record_order(self, success: bool = True):
        self.order_attempts += 1
        if success:
            self.order_successes += 1
        else:
            self.order_failures += 1

    def record_retry(self):
        self.retries += 1

    def record_error(self, category: str):
        self.error_counts[category] += 1

    def add_log_entry(self, level: str, message: str, extra: Dict[str, Any] = None):
        entry = {
            "timestamp": time.strftime("%H:%M:%S"),
            "level": level,
            "message": message,
            "extra": extra or {}
        }
        self.log_history.append(entry)
        # Keep last 100 logs for UI display
        if len(self.log_history) > 100:
            self.log_history.pop(0)

    def get_metrics_summary(self) -> Dict[str, Any]:
        avg_latencies = {}
        for k, v in self.latencies.items():
            if v:
                avg_latencies[k] = sum(v) / len(v)
            else:
                avg_latencies[k] = 0.0

        total_cache = self.cache_hits + self.cache_misses
        hit_ratio = (self.cache_hits / total_cache) * 100 if total_cache > 0 else 0.0

        return {
            "avg_latencies_sec": avg_latencies,
            "cache_hits": self.cache_hits,
            "cache_misses": self.cache_misses,
            "cache_hit_ratio_percent": round(hit_ratio, 2),
            "tool_calls": self.tool_calls,
            "tool_failures": self.tool_failures,
            "oauth_failures": self.oauth_failures,
            "recommendation_count": self.recommendation_count,
            "recommendation_failures": self.recommendation_failures,
            "order_attempts": self.order_attempts,
            "order_successes": self.order_successes,
            "order_failures": self.order_failures,
            "retries": self.retries,
            "error_counts": dict(self.error_counts),
        }

metrics_tracker = MetricsTracker()

def log_info(message: str, extra: Dict[str, Any] = None):
    extra_data = extra or {}
    logger.info(message, extra={"extra_data": extra_data})
    metrics_tracker.add_log_entry("INFO", message, extra_data)

def log_warn(message: str, extra: Dict[str, Any] = None):
    extra_data = extra or {}
    logger.warning(message, extra={"extra_data": extra_data})
    metrics_tracker.add_log_entry("WARNING", message, extra_data)

def log_error(message: str, error_category: str, extra: Dict[str, Any] = None):
    extra_data = extra or {}
    extra_data["error_category"] = error_category
    logger.error(message, extra={"extra_data": extra_data})
    metrics_tracker.record_error(error_category)
    metrics_tracker.add_log_entry("ERROR", f"[{error_category}] {message}", extra_data)
