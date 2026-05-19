import logging
import json
import time
import os

# Configure structured logger
logger = logging.getLogger("ai_accounting_forensics")
logger.setLevel(logging.INFO)

class ForensicObservability:
    """
    PHASE 2: FULL OBSERVABILITY LAYER.
    Implements deterministic visibility into system behavior under load.
    Hardened to prevent TypeError when 'event' is passed both positionally and in kwargs.
    """
    def _sanitize_kwargs(self, kwargs):
        """Removes reserved keys from kwargs to prevent payload corruption."""
        reserved = ["timestamp", "level", "service", "hostname", "event"]
        for key in reserved:
            if key in kwargs:
                # Move to a safe 'extra_' prefix instead of dropping
                kwargs[f"extra_{key}"] = kwargs.pop(key)
        return kwargs

    def info(self, *args, **kwargs):
        """
        Positional or keyword 'event' support.
        Standardizes on: info("mylabel", key="val") OR info(event="mylabel", key="val")
        """
        # 1. Extract event with priority: keyword > positional > default
        event = kwargs.pop("event", args[0] if args else "GENERAL_EVENT")
        
        # 2. Prevent payload collision
        clean_kwargs = self._sanitize_kwargs(kwargs)

        payload = {
            "timestamp": time.time(),
            "level": "INFO",
            "event": event,
            "service": "ai_accounting_backend",
            "hostname": os.getenv("HOSTNAME", "localhost"),
            **clean_kwargs
        }
        logger.info(json.dumps(payload))

    def error(self, *args, **kwargs):
        """
        Error logger with standardized fallback.
        Priority: keyword 'event' > positional arg[0]
        """
        event = kwargs.pop("event", args[0] if args else "ERROR_EVENT")
        error_val = kwargs.pop("error", args[1] if len(args) > 1 else "Unknown Error")
        
        clean_kwargs = self._sanitize_kwargs(kwargs)

        payload = {
            "timestamp": time.time(),
            "level": "ERROR",
            "event": event,
            "error": str(error_val),
            "service": "ai_accounting_backend",
            "hostname": os.getenv("HOSTNAME", "localhost"),
            **clean_kwargs
        }
        logger.error(json.dumps(payload))

    def queue_metric(self, **kwargs):
        """[QUEUE_METRIC] - Tracks depth, retries, wait times, etc."""
        # Standardize prefix and ensure no duplicate 'event' key is passed to info()
        event = kwargs.pop("event", "OP")
        self.info(f"[QUEUE_METRIC] {event}", **kwargs)

    def worker_metric(self, **kwargs):
        """[WORKER_METRIC] - Tracks CPU, memory, and stage latencies."""
        event = kwargs.pop("event", "OP")
        self.info(f"[WORKER_METRIC] {event}", **kwargs)

    def db_metric(self, **kwargs):
        """[DB_METRIC] - Tracks slow queries, lock waits, contention."""
        event = kwargs.pop("event", "OP")
        self.info(f"[DB_METRIC] {event}", **kwargs)

    def redis_metric(self, **kwargs):
        """[REDIS_METRIC] - Tracks latency, memory, key counts, locks."""
        event = kwargs.pop("event", "OP")
        self.info(f"[REDIS_METRIC] {event}", **kwargs)

    def pipeline_metric(self, **kwargs):
        """[PIPELINE_METRIC] - Tracks end-to-end stage latencies."""
        event = kwargs.pop("event", "OP")
        self.info(f"[PIPELINE_METRIC] {event}", **kwargs)

    def ai_metric(self, **kwargs):
        """[AI_METRIC] - Tracks Gemini latency, 429s, token usage."""
        event = kwargs.pop("event", "OP")
        self.info(f"[AI_METRIC] {event}", **kwargs)

    def api_metric(self, **kwargs):
        """[API_METRIC] - Tracks upload latency, concurrency, errors."""
        event = kwargs.pop("event", "OP")
        self.info(f"[API_METRIC] {event}", **kwargs)

    def alert(self, **kwargs):
        """[ALERT_TRIGGERED] - Critical operational alerts."""
        event = kwargs.pop("event", "ALERT")
        self.error(f"[ALERT_TRIGGERED] {event}", **kwargs)

    def trace(self, status, **kwargs):
        """[TRACE_START], [TRACE_STAGE], [TRACE_COMPLETE] support."""
        event = f"[TRACE_{status.upper()}]"
        self.info(event, **kwargs)

class MetricsService:
    """
    PHASE 11: REAL-TIME METRICS.
    Standardized metrics collector for P50/P95/P99 latency and resource usage.
    """
    def __init__(self):
        self.counters = {}
        self.histograms = {}
        self.gauges = {}

    def increment_counter(self, name, value=1, tags=None):
        tag_key = f"{name}:{json.dumps(tags, sort_keys=True)}" if tags else name
        self.counters[tag_key] = self.counters.get(tag_key, 0) + value

    def record_latency(self, name, value, tags=None):
        if name not in self.histograms:
            self.histograms[name] = []
        
        # Ensure name and value are valid
        if not name or value is None:
            return

        self.histograms[name].append({"v": float(value), "t": tags, "ts": time.time()})
        # Keep only last 5000 for local memory safety
        if len(self.histograms[name]) > 5000:
            self.histograms[name].pop(0)

    def set_gauge(self, name, value, tags=None):
        """Sets an instantaneous gauge value."""
        tag_key = f"{name}:{json.dumps(tags, sort_keys=True)}" if tags else name
        self.gauges[tag_key] = float(value)

    def get_stats(self, name):
        """Calculates P50, P95, P99 for a histogram."""
        if name not in self.histograms or not self.histograms[name]:
            return None
        values = sorted([x["v"] for x in self.histograms[name]])
        count = len(values)
        if count == 0: return None
        
        return {
            "p50": values[int(count * 0.5)],
            "p75": values[int(count * 0.75)],
            "p95": values[int(count * 0.95)],
            "p99": values[int(count * 0.99)],
            "avg": sum(values) / count,
            "min": values[0],
            "max": values[-1],
            "count": count
        }

    def get_all_metrics(self):
        """Dumps all current metrics for dashboard hydration."""
        summary = {
            "counters": self.counters,
            "gauges": self.gauges,
            "histograms": {}
        }
        for name in self.histograms:
            stats = self.get_stats(name)
            if stats:
                summary["histograms"][name] = stats
        return summary

observability = ForensicObservability()
metrics = MetricsService()