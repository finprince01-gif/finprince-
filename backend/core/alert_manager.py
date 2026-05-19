import time
import logging
import os
import threading
from core.observability import observability, metrics
from core.sqs import queue_service
from core.redis_orchestrator import orchestrator

logger = logging.getLogger(__name__)

class AlertManager:
    """
    PHASE 11: ALERTING & FAILURE DETECTION.
    Monitors system state and fires alerts for SLO breaches.
    """
    def __init__(self):
        self.thresholds = {
            'queue_lag': int(os.getenv('ALERT_QUEUE_LAG_THRESHOLD', '100')),
            'worker_rss_mb': int(os.getenv('ALERT_WORKER_RSS_THRESHOLD', '1024')),
            'redis_latency_ms': int(os.getenv('ALERT_REDIS_LATENCY_THRESHOLD', '100')),
            'failure_rate': float(os.getenv('ALERT_FAILURE_RATE_THRESHOLD', '0.05'))
        }
        self.active_alerts = set()
        self.running = False
        self._thread = None

    def start(self):
        if self.running: return
        self.running = True
        self._thread = threading.Thread(target=self._monitor_loop, daemon=True)
        self._thread.start()
        logger.info("[ALERT_MANAGER_BOOT] Monitoring started.")

    def stop(self):
        self.running = False
        if self._thread:
            self._thread.join(timeout=5)

    def _monitor_loop(self):
        while self.running:
            try:
                self._check_queues()
                self._check_redis()
                self._check_workers()
                self._check_pipeline()
                time.sleep(30)
            except Exception as e:
                logger.error(f"[ALERT_MONITOR_ERR] {e}")
                time.sleep(60)

    def _check_queues(self):
        queues = ['ingestion', 'ai', 'assembly', 'finalize', 'export']
        for q in queues:
            depth = queue_service.get_queue_depth(q)
            if depth > self.thresholds['queue_lag']:
                self._fire_alert("QUEUE_LAG", queue=q, depth=depth)
            else:
                self._resolve_alert("QUEUE_LAG", queue=q)

    def _check_redis(self):
        stats = orchestrator.get_redis_metrics()
        if stats and stats.get('used_memory_mb', 0) > 512: # Example 512MB
             self._fire_alert("REDIS_MEMORY_PRESSURE", memory_mb=stats['used_memory_mb'])
        
        latency = metrics.get_stats("redis:op_duration")
        if latency and latency.get('p95', 0) > self.thresholds['redis_latency_ms']:
            self._fire_alert("REDIS_LATENCY_SPIKE", p95=latency['p95'])

    def _check_workers(self):
        # We check gauges set by workers
        # worker:rss, worker:cpu
        for role in ['ingestion', 'ai', 'assembly', 'finalize']:
            # Gauges use JSON-serialized tags as part of the key
            # We'll just look for keys containing the role
            for key, val in metrics.gauges.items():
                if f"'role': '{role}'" in key and "worker:rss" in key:
                    if val > self.thresholds['worker_rss_mb']:
                        self._fire_alert("WORKER_MEMORY_LEAK", role=role, rss_mb=val)

    def _check_pipeline(self):
        # failure rate
        task_failures = metrics.counters.get("worker:task_failure_total", 0)
        # We need a total task count counter
        task_total = metrics.counters.get("worker:task_duration:count", 1) # This is not quite right, histograms aren't in counters
        
        # Let's count successes and failures separately
        successes = metrics.counters.get("worker:task_complete_total", 0)
        total = successes + task_failures
        
        rate = task_failures / max(total, 1)
        
        if rate > self.thresholds['failure_rate'] and total > 10:
            self._fire_alert("PIPELINE_FAILURE_SPIKE", rate=rate)

    def _fire_alert(self, alert_type, **kwargs):
        alert_key = f"{alert_type}:{kwargs.get('queue', kwargs.get('role', 'global'))}"
        if alert_key not in self.active_alerts:
            self.active_alerts.add(alert_key)
            observability.alert(event=alert_type, status="TRIGGERED", **kwargs)
            logger.critical(f"[ALERT_TRIGGERED] {alert_type} {kwargs}")

    def _resolve_alert(self, alert_type, **kwargs):
        alert_key = f"{alert_type}:{kwargs.get('queue', kwargs.get('role', 'global'))}"
        if alert_key in self.active_alerts:
            self.active_alerts.remove(alert_key)
            observability.info(f"[ALERT_RESOLVED] {alert_type}", status="RESOLVED", **kwargs)
            logger.info(f"[ALERT_RESOLVED] {alert_type} {kwargs}")

alert_manager = AlertManager()
