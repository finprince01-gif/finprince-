"""
gpu_validator.py — GPU-Only Enforcement Engine
===============================================
Validates that the NVIDIA RTX 4050 GPU is active and that Ollama
is running the Qwen model entirely on GPU before allowing any inference.

GUARANTEE:
  - Startup fails with a fatal RuntimeError if GPU is unavailable.
  - Per-request guard aborts with a RuntimeError if CPU inference is detected.
  - Zero silent CPU fallback is possible while this module is active.

Usage (startup):
    from core.gpu_validator import validate_gpu_on_startup
    validate_gpu_on_startup()          # Raises RuntimeError if GPU not available

Usage (per-request telemetry):
    from core.gpu_validator import emit_gpu_status, enforce_gpu_compute
    emit_gpu_status(...)               # Logs [QWEN_GPU_STATUS]
    enforce_gpu_compute(tokens_per_s)  # Raises RuntimeError if CPU mode detected
"""

import logging
import os
import subprocess
import time
from typing import Optional

import requests

logger = logging.getLogger(__name__)

# ── CONSTANTS ─────────────────────────────────────────────────────────────────

# GPU inference with Qwen-2.5-VL on RTX 4050 typically produces 6-20 tok/s
# depending on image count and KV-cache pressure. We set the CPU boundary
# conservatively: anything below 5 tok/s during actual vision inference is
# almost certainly CPU. The previous threshold of ≥15 was calibrated for
# text-only, not multi-image vision tasks.
GPU_MIN_TOKENS_PER_SECOND = 5.0   # Below this → CPU_ONLY → abort

# VRAM floor: if the model is on GPU, we expect ≥500 MiB consumed
GPU_VRAM_MIN_MIB = 500

# Ollama native port (no /v1 suffix)
_OLLAMA_NATIVE_BASE = "http://localhost:11434"


# ── HELPER: nvidia-smi query ──────────────────────────────────────────────────

def query_nvidia_smi() -> Optional[dict]:
    """
    Query GPU hardware stats via nvidia-smi.
    Returns dict or None if GPU not available.
    """
    try:
        result = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=name,memory.used,memory.total,utilization.gpu,"
                "utilization.memory,temperature.gpu,power.draw,driver_version",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode != 0:
            logger.error(f"[GPU_VALIDATOR] nvidia-smi failed: {result.stderr}")
            return None

        line = result.stdout.strip().splitlines()[0]
        parts = [p.strip() for p in line.split(",")]
        if len(parts) < 7:
            return None

        return {
            "gpu_name":        parts[0],
            "vram_used_mib":   float(parts[1]) if parts[1] not in ("N/A", "") else 0.0,
            "vram_total_mib":  float(parts[2]) if parts[2] not in ("N/A", "") else 0.0,
            "gpu_util_pct":    float(parts[3]) if parts[3] not in ("N/A", "") else 0.0,
            "mem_util_pct":    float(parts[4]) if parts[4] not in ("N/A", "") else 0.0,
            "temp_c":          float(parts[5]) if parts[5] not in ("N/A", "") else 0.0,
            "power_w":         float(parts[6]) if parts[6] not in ("N/A", "") else 0.0,
            "driver_version":  parts[7] if len(parts) > 7 else "unknown",
        }
    except FileNotFoundError:
        logger.error("[GPU_VALIDATOR] nvidia-smi not found. NVIDIA driver not installed.")
        return None
    except Exception as exc:
        logger.error(f"[GPU_VALIDATOR] nvidia-smi query error: {exc}")
        return None


# ── HELPER: Ollama GPU detection ──────────────────────────────────────────────

def query_ollama_model_gpu(model_name: str) -> dict:
    """
    Query Ollama /api/ps to check if the model is loaded and on which processor.
    Returns dict with keys: loaded, processor, vram_size.
    """
    result = {
        "loaded": False,
        "processor": "unknown",
        "vram_size": 0,
        "gpu_layers": "unknown",
    }
    try:
        resp = requests.get(f"{_OLLAMA_NATIVE_BASE}/api/ps", timeout=5.0)
        if resp.status_code != 200:
            return result

        data = resp.json()
        models = data.get("models", [])
        for m in models:
            if model_name in m.get("name", ""):
                result["loaded"] = True
                result["processor"] = m.get("details", {}).get("processor", m.get("processor", "unknown"))
                result["vram_size"] = m.get("size_vram", 0)
                result["gpu_layers"] = m.get("details", {}).get("num_gpu", "unknown")
                break
    except Exception as exc:
        logger.warning(f"[GPU_VALIDATOR] Ollama /api/ps query failed: {exc}")
    return result


def query_ollama_show(model_name: str) -> dict:
    """
    Query Ollama /api/show to get model parameters including num_gpu.
    """
    result = {"num_ctx": None, "num_gpu": None, "parameters": ""}
    try:
        resp = requests.post(
            f"{_OLLAMA_NATIVE_BASE}/api/show",
            json={"model": model_name},
            timeout=10.0,
        )
        if resp.status_code != 200:
            return result

        data = resp.json()
        params_str = data.get("parameters", "")
        result["parameters"] = params_str
        for line in params_str.split("\n"):
            parts = line.split()
            if len(parts) >= 2:
                key = parts[0].lower()
                try:
                    val = int(parts[1])
                    if key == "num_ctx":
                        result["num_ctx"] = val
                    elif key == "num_gpu":
                        result["num_gpu"] = val
                except ValueError:
                    pass
    except Exception as exc:
        logger.warning(f"[GPU_VALIDATOR] Ollama /api/show query failed: {exc}")
    return result


# ── TELEMETRY: [QWEN_GPU_STATUS] ─────────────────────────────────────────────

def emit_gpu_status(
    attempt_label: str,
    model_name: str,
    latency_s: float,
    tokens_per_second: float,
    inference_time_s: float,
    vram_used_mib: float = 0.0,
    vram_total_mib: float = 0.0,
    gpu_name: str = "unknown",
    gpu_layers: str = "unknown",
    total_layers: str = "unknown",
):
    """
    Emit a standardised [QWEN_GPU_STATUS] log line for every inference call.
    Compute mode classification uses vision-adjusted thresholds and hardware telemetry.
    """
    # Check if we have actual GPU usage from VRAM or Ollama ps
    has_gpu_vram = vram_used_mib >= GPU_VRAM_MIN_MIB
    
    has_ollama_gpu = False
    # If nvidia-smi reports low VRAM or failed, query Ollama ps to be sure
    if not has_gpu_vram:
        try:
            ollama_ps = query_ollama_model_gpu(model_name)
            if ollama_ps.get("loaded"):
                proc = str(ollama_ps.get("processor", "")).lower()
                if "cpu" not in proc or "gpu" in proc or "cuda" in proc:
                    has_ollama_gpu = True
        except Exception as e:
            logger.warning(f"[GPU_TELEMETRY_CHECK_ERR] {e}")

    if has_gpu_vram or has_ollama_gpu:
        compute_mode = "GPU_ONLY"
    else:
        # Fallback to tokens_per_second if telemetry is inconclusive
        if tokens_per_second >= GPU_MIN_TOKENS_PER_SECOND:
            compute_mode = "GPU_ONLY"
        else:
            compute_mode = "CPU_ONLY"

    logger.info(
        f"[QWEN_GPU_STATUS] {attempt_label} "
        f"model={model_name} "
        f"compute_mode={compute_mode} "
        f"gpu_name={gpu_name} "
        f"gpu_layers={gpu_layers} "
        f"total_layers={total_layers} "
        f"vram_used_mb={vram_used_mib:.0f} "
        f"vram_total_mb={vram_total_mib:.0f} "
        f"inference_time={inference_time_s:.2f}s "
        f"latency_s={latency_s:.2f} "
        f"tokens_per_second={tokens_per_second:.2f}"
    )
    return compute_mode


# ── GUARD: enforce GPU compute per-request ────────────────────────────────────

def enforce_gpu_compute(tokens_per_second: float, attempt_label: str = ""):
    """
    Called after every inference call.
    If tokens_per_second indicates CPU execution, ABORT immediately.
    CPU inference must never complete successfully.

    Raises:
        RuntimeError: If compute mode is CPU_ONLY.
    """
    if tokens_per_second < GPU_MIN_TOKENS_PER_SECOND:
        msg = (
            f"[GPU_GUARD_VIOLATION] {attempt_label} "
            f"tokens_per_second={tokens_per_second:.2f} is below GPU minimum "
            f"({GPU_MIN_TOKENS_PER_SECOND} tok/s). "
            f"compute_mode=CPU_ONLY. Aborting request. "
            f"CPU inference is FORBIDDEN."
        )
        logger.critical(msg)
        raise RuntimeError(
            f"GPU validation failed: compute_mode=CPU_ONLY "
            f"(tokens/s={tokens_per_second:.2f} < {GPU_MIN_TOKENS_PER_SECOND}). "
            f"Refusing CPU inference."
        )


# ── STARTUP: full GPU validation sequence ────────────────────────────────────

def validate_gpu_on_startup(model_name: str = "qwen2.5vl:7b") -> dict:
    """
    Phase 1 — Hardware: confirm RTX 4050 is present and VRAM is available.
    Phase 2 — Ollama: confirm model is loaded with GPU acceleration.
    Phase 3 — Inference smoke test: confirm GPU tok/s before accepting traffic.

    Raises:
        RuntimeError: If ANY of the three phases fail.

    Returns:
        dict: Validation evidence collected across all phases.
    """
    evidence = {}
    failures = []

    logger.info("[GPU_VALIDATOR] ===========================================")
    logger.info("[GPU_VALIDATOR] PHASE 1 -- Hardware GPU Audit")
    logger.info("[GPU_VALIDATOR] ===========================================")

    # -- Phase 1: nvidia-smi ---------------------------------------------------
    smi = query_nvidia_smi()
    if smi is None:
        failures.append("NVIDIA_GPU_NOT_FOUND: nvidia-smi unavailable or returned no GPU.")
    else:
        evidence["gpu_name"]       = smi["gpu_name"]
        evidence["vram_total_mib"] = smi["vram_total_mib"]
        evidence["vram_used_mib"]  = smi["vram_used_mib"]
        evidence["driver_version"] = smi["driver_version"]
        logger.info(
            f"[GPU_VALIDATOR] GPU detected: {smi['gpu_name']} | "
            f"VRAM={smi['vram_used_mib']:.0f}/{smi['vram_total_mib']:.0f} MiB | "
            f"Driver={smi['driver_version']} | "
            f"Temp={smi['temp_c']} degC | Power={smi['power_w']}W"
        )
        if "rtx" not in smi["gpu_name"].lower() and "nvidia" not in smi["gpu_name"].lower():
            failures.append(f"EXPECTED_NVIDIA_GPU: found '{smi['gpu_name']}'")
        if smi["vram_total_mib"] < 4096:
            failures.append(
                f"INSUFFICIENT_VRAM: {smi['vram_total_mib']:.0f} MiB -- minimum 4096 MiB required."
            )

    logger.info("[GPU_VALIDATOR] ===========================================")
    logger.info("[GPU_VALIDATOR] PHASE 2 -- Ollama GPU Detection")
    logger.info("[GPU_VALIDATOR] ===========================================")

    # -- Phase 2a: Ollama /api/show ---------------------------------------------
    show = query_ollama_show(model_name)
    evidence["ollama_num_ctx"] = show.get("num_ctx")
    evidence["ollama_num_gpu"] = show.get("num_gpu")
    logger.info(
        f"[GPU_VALIDATOR] Ollama model config: "
        f"num_ctx={show.get('num_ctx')} | num_gpu={show.get('num_gpu')}"
    )

    # -- Phase 2b: Ollama /api/ps (live model state) ----------------------------
    ps = query_ollama_model_gpu(model_name)
    evidence["ollama_loaded"]    = ps["loaded"]
    evidence["ollama_processor"] = ps["processor"]
    evidence["ollama_vram_size"] = ps["vram_size"]

    if ps["loaded"]:
        logger.info(
            f"[GPU_VALIDATOR] Ollama model loaded: processor={ps['processor']} | "
            f"vram_size={ps['vram_size'] // (1024*1024):.0f} MiB"
        )
        proc = ps["processor"].lower()
        if "cpu" in proc and "gpu" not in proc:
            failures.append(
                f"OLLAMA_CPU_ONLY: /api/ps reports processor='{ps['processor']}'. "
                f"GPU layers not active."
            )
    else:
        logger.info(
            "[GPU_VALIDATOR] Model not pre-loaded in Ollama (will load on first inference). "
            "This is normal -- proceeding to smoke test."
        )

    logger.info("[GPU_VALIDATOR] ===========================================")
    logger.info("[GPU_VALIDATOR] PHASE 3 -- Inference Smoke Test (GPU tok/s)")
    logger.info("[GPU_VALIDATOR] ===========================================")

    # -- Phase 3: live inference smoke test ------------------------------------
    try:
        t0 = time.time()
        resp = requests.post(
            f"{_OLLAMA_NATIVE_BASE}/api/generate",
            json={"model": model_name, "prompt": "GPU check: respond with OK", "stream": False},
            timeout=180,   # Allow up to 3 min for cold GPU load
        )
        elapsed = time.time() - t0

        if resp.status_code != 200:
            failures.append(f"SMOKE_TEST_HTTP_ERROR: status={resp.status_code}")
        else:
            data = resp.json()
            eval_count    = data.get("eval_count", 0) or 1
            eval_duration = data.get("eval_duration", 1) or 1  # nanoseconds
            tps = eval_count / (eval_duration / 1e9)

            evidence["smoke_tokens_per_second"] = tps
            evidence["smoke_latency_s"]         = elapsed
            evidence["smoke_eval_count"]        = eval_count

            # Re-query VRAM after model is loaded
            smi_after = query_nvidia_smi()
            if smi_after:
                evidence["vram_used_mib_after_load"] = smi_after["vram_used_mib"]
                logger.info(
                    f"[GPU_VALIDATOR] Post-load VRAM: "
                    f"{smi_after['vram_used_mib']:.0f}/{smi_after['vram_total_mib']:.0f} MiB"
                )
                if smi_after["vram_used_mib"] < GPU_VRAM_MIN_MIB:
                    failures.append(
                        f"GPU_VRAM_NOT_USED: only {smi_after['vram_used_mib']:.0f} MiB VRAM used "
                        f"after model load (expected >={GPU_VRAM_MIN_MIB} MiB). "
                        f"Model may be running on CPU."
                    )

            logger.info(
                f"[GPU_VALIDATOR] Smoke test: "
                f"eval_count={eval_count} | eval_duration={eval_duration/1e6:.0f}ms | "
                f"tokens_per_second={tps:.2f} | elapsed={elapsed:.2f}s"
            )

            if tps < GPU_MIN_TOKENS_PER_SECOND:
                failures.append(
                    f"GPU_TOO_SLOW: {tps:.2f} tok/s < {GPU_MIN_TOKENS_PER_SECOND} tok/s minimum. "
                    f"Model is likely running on CPU."
                )
            else:
                logger.info(
                    f"[GPU_VALIDATOR] [OK] GPU inference confirmed: {tps:.2f} tok/s "
                    f">= {GPU_MIN_TOKENS_PER_SECOND} tok/s threshold"
                )

    except requests.exceptions.ConnectionError:
        failures.append("OLLAMA_UNREACHABLE: Cannot connect to Ollama at http://localhost:11434")
    except Exception as exc:
        failures.append(f"SMOKE_TEST_ERROR: {exc}")

    # -- Final verdict ---------------------------------------------------------
    logger.info("[GPU_VALIDATOR] ===========================================")
    if failures:
        failure_summary = " | ".join(failures)
        logger.critical(
            f"[GPU_VALIDATOR] VALIDATION FAILED -- {len(failures)} failure(s): {failure_summary}"
        )
        logger.critical("[GPU_VALIDATOR] Refusing to start. CPU inference is FORBIDDEN.")
        raise RuntimeError(
            f"GPU validation failed. Refusing CPU inference.\n"
            f"Failures ({len(failures)}):\n"
            + "\n".join(f"  - {f}" for f in failures)
        )

    logger.info(
        f"[GPU_VALIDATOR] [OK] ALL PHASES PASSED -- "
        f"compute_mode=GPU_ONLY | "
        f"gpu={evidence.get('gpu_name', 'unknown')} | "
        f"vram={evidence.get('vram_used_mib_after_load', evidence.get('vram_used_mib', 0)):.0f} MiB | "
        f"smoke_tps={evidence.get('smoke_tokens_per_second', 0):.2f}"
    )
    logger.info("[GPU_VALIDATOR] ===========================================")
    return evidence
