# -*- coding: utf-8 -*-
"""
Phase 1: Pre-Test Baseline Capture
====================================
Captures Redis, SQS queue depths, GPU, and CPU state BEFORE the batch upload.
Writes BASELINE_METRICS.json for post-batch comparison.

No source code modifications. Read-only observer.
"""
import os
import sys
import json
import time
import subprocess
from datetime import datetime, timezone

# Add backend to path for Django
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BACKEND_DIR)

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "reports")
os.makedirs(OUTPUT_DIR, exist_ok=True)


def capture_redis_metrics() -> dict:
    """Read Redis INFO and return key memory/throughput metrics."""
    try:
        import redis as redis_lib
        from dotenv import load_dotenv
        load_dotenv(os.path.join(BACKEND_DIR, ".env"))

        host = os.getenv("REDIS_HOST", "localhost")
        port = int(os.getenv("REDIS_PORT", "6379"))
        password = os.getenv("REDIS_PASSWORD") or None
        db = int(os.getenv("REDIS_DB", "0"))

        r = redis_lib.Redis(host=host, port=port, password=password,
                            db=db, decode_responses=True, socket_timeout=5)
        r.ping()
        info = r.info()
        latency_info = {}
        try:
            latency_info = r.execute_command("LATENCY", "LATEST") or {}
        except Exception:
            pass

        key_count = r.dbsize()

        # Count lock keys and session keys
        lock_count = len(list(r.scan_iter("lock:*", count=1000)))
        session_count = len(list(r.scan_iter("session:*", count=1000)))
        assembly_count = len(list(r.scan_iter("assembly:*", count=1000)))
        worker_hb_count = len(list(r.scan_iter("worker_hb_*", count=1000)))

        metrics = {
            "status": "UP",
            "host": host,
            "port": port,
            "used_memory_mb": round(info.get("used_memory", 0) / 1024 / 1024, 2),
            "used_memory_human": info.get("used_memory_human", "unknown"),
            "peak_memory_mb": round(info.get("used_memory_peak", 0) / 1024 / 1024, 2),
            "ops_per_sec": info.get("instantaneous_ops_per_sec", 0),
            "connected_clients": info.get("connected_clients", 0),
            "total_key_count": key_count,
            "lock_key_count": lock_count,
            "session_key_count": session_count,
            "assembly_key_count": assembly_count,
            "worker_heartbeat_key_count": worker_hb_count,
            "redis_version": info.get("redis_version", "unknown"),
            "uptime_seconds": info.get("uptime_in_seconds", 0),
            "keyspace_hits": info.get("keyspace_hits", 0),
            "keyspace_misses": info.get("keyspace_misses", 0),
            "latency_latest": str(latency_info)[:200],
        }
        print(f"  [Redis] UP | mem={metrics['used_memory_mb']} MB | keys={key_count} | "
              f"locks={lock_count} | sessions={session_count}")
        return metrics
    except Exception as e:
        print(f"  [Redis] ERROR: {e}")
        return {"status": "ERROR", "error": str(e)}


def capture_sqs_depths() -> dict:
    """Query all 6 SQS role queues + DLQ for depth."""
    try:
        import django
        from dotenv import load_dotenv
        load_dotenv(os.path.join(BACKEND_DIR, ".env"))
        os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
        django.setup()

        from core.sqs import queue_service
        roles = ["ingestion", "ai", "assembly", "finalize", "export", "materialization"]
        depths = {}
        total = 0
        for role in roles:
            try:
                depth = queue_service.get_queue_depth(role)
                depths[role] = depth
                total += depth
                print(f"  [SQS] {role:20s} depth={depth}")
            except Exception as e:
                depths[role] = f"ERROR: {str(e)[:60]}"

        # DLQ
        try:
            dlq_depth = queue_service.get_queue_depth("dlq")
            depths["dlq"] = dlq_depth
            print(f"  [SQS] {'dlq':20s} depth={dlq_depth}")
        except Exception as e:
            depths["dlq"] = f"ERROR: {str(e)[:60]}"

        return {"status": "OK", "queue_depths": depths, "total_depth": total}
    except Exception as e:
        print(f"  [SQS] ERROR: {e}")
        return {"status": "ERROR", "error": str(e)}


def capture_gpu_metrics() -> dict:
    """Run nvidia-smi and parse VRAM + utilization."""
    try:
        result = subprocess.run(
            ["nvidia-smi",
             "--query-gpu=name,memory.used,memory.free,memory.total,utilization.gpu,temperature.gpu",
             "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=10
        )
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip())
        line = result.stdout.strip().split("\n")[0]
        parts = [p.strip() for p in line.split(",")]
        gpu_name = parts[0]
        vram_used = int(parts[1])
        vram_free = int(parts[2])
        vram_total = int(parts[3])
        util = int(parts[4])
        temp = int(parts[5])

        metrics = {
            "status": "GPU_AVAILABLE",
            "gpu_name": gpu_name,
            "vram_used_mib": vram_used,
            "vram_free_mib": vram_free,
            "vram_total_mib": vram_total,
            "vram_used_pct": round(vram_used / vram_total * 100, 1),
            "gpu_utilization_pct": util,
            "temperature_c": temp,
        }
        print(f"  [GPU ] {gpu_name} | VRAM {vram_used}/{vram_total} MiB ({metrics['vram_used_pct']}%) | "
              f"util={util}% | temp={temp}°C")
        return metrics
    except FileNotFoundError:
        print("  [GPU ] nvidia-smi not found")
        return {"status": "NO_GPU", "error": "nvidia-smi not in PATH"}
    except Exception as e:
        print(f"  [GPU ] ERROR: {e}")
        return {"status": "ERROR", "error": str(e)}


def capture_cpu_metrics() -> dict:
    """Capture CPU and RAM utilization."""
    try:
        import psutil
        cpu_pct = psutil.cpu_percent(interval=2)
        ram = psutil.virtual_memory()
        metrics = {
            "status": "OK",
            "cpu_utilization_pct": cpu_pct,
            "cpu_count_logical": psutil.cpu_count(logical=True),
            "cpu_count_physical": psutil.cpu_count(logical=False),
            "ram_total_gb": round(ram.total / 1024**3, 2),
            "ram_used_gb": round(ram.used / 1024**3, 2),
            "ram_available_gb": round(ram.available / 1024**3, 2),
            "ram_used_pct": ram.percent,
        }
        print(f"  [CPU ] util={cpu_pct}% | RAM {metrics['ram_used_gb']}/{metrics['ram_total_gb']} GB "
              f"({ram.percent}% used)")
        return metrics
    except ImportError:
        print("  [CPU ] psutil not installed, skipping")
        return {"status": "SKIP", "error": "psutil not installed"}
    except Exception as e:
        print(f"  [CPU ] ERROR: {e}")
        return {"status": "ERROR", "error": str(e)}


def capture_worker_heartbeats() -> dict:
    """Check which worker roles are alive via Redis heartbeat keys."""
    try:
        import redis as redis_lib
        from dotenv import load_dotenv
        load_dotenv(os.path.join(BACKEND_DIR, ".env"))
        host = os.getenv("REDIS_HOST", "localhost")
        port = int(os.getenv("REDIS_PORT", "6379"))
        password = os.getenv("REDIS_PASSWORD") or None
        db = int(os.getenv("REDIS_DB", "0"))
        cluster_env = os.getenv("CLUSTER_ENV", "local")

        r = redis_lib.Redis(host=host, port=port, password=password,
                            db=db, decode_responses=True, socket_timeout=5)
        roles = ["INGESTION", "AI", "ASSEMBLY", "FINALIZE", "EXPORT", "MATERIALIZE"]
        worker_status = {}
        alive_count = 0
        for role in roles:
            hb_key = f"worker_hb_{role}_{cluster_env}"
            exists = r.exists(hb_key)
            ttl = r.ttl(hb_key) if exists else -1
            worker_status[role] = {"alive": bool(exists), "ttl_seconds": ttl}
            if exists:
                alive_count += 1
            status = "ALIVE" if exists else "DOWN"
            print(f"  [Worker] {role:15s} {status} (TTL={ttl}s)")
        return {"alive_count": alive_count, "total_roles": len(roles), "workers": worker_status}
    except Exception as e:
        print(f"  [Worker] Heartbeat check failed: {e}")
        return {"status": "ERROR", "error": str(e)}


def capture_baseline(label: str = "PRE_BATCH") -> dict:
    print(f"\n{'='*60}")
    print(f"SPRINT 3 — BASELINE CAPTURE ({label})")
    print(f"{'='*60}")
    print()

    ts = datetime.now(timezone.utc).isoformat()
    baseline = {
        "capture_label": label,
        "captured_at": ts,
        "captured_at_epoch": time.time(),
    }

    print("[1/5] Redis Metrics ...")
    baseline["redis"] = capture_redis_metrics()
    print()

    print("[2/5] SQS Queue Depths ...")
    baseline["sqs"] = capture_sqs_depths()
    print()

    print("[3/5] GPU Metrics ...")
    baseline["gpu"] = capture_gpu_metrics()
    print()

    print("[4/5] CPU / RAM Metrics ...")
    baseline["cpu"] = capture_cpu_metrics()
    print()

    print("[5/5] Worker Heartbeats ...")
    baseline["workers"] = capture_worker_heartbeats()
    print()

    filename = f"BASELINE_METRICS_{label}.json"
    out_path = os.path.join(OUTPUT_DIR, filename)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(baseline, f, indent=2, ensure_ascii=False)
    print(f"[OK] Baseline written: {out_path}")

    return baseline


if __name__ == "__main__":
    label = sys.argv[1] if len(sys.argv) > 1 else "PRE_BATCH"
    capture_baseline(label)
