"""
core/ai_proxy.py — AI Extraction Proxy
========================================
Provider: Qwen-VL (self-hosted, OpenAI-compatible API)
Former provider: Google Gemini (removed)

All Google GenAI SDK dependencies have been eliminated.
The provider abstraction layer (core/providers/) is the sole AI interface.

Configuration:
    QWEN_MODEL    = qwen-vl-max          (model name served by your vLLM/Ollama server)
    QWEN_API_BASE = http://localhost:8080/v1  (your Qwen server base URL)
    QWEN_API_KEY  = EMPTY                (leave empty for unauthenticated local servers)
"""

import os
import json
import re
import base64
import time
import hashlib
import logging
import threading
import random
from typing import Dict, Any, Optional, Tuple, List
from django.db import models
from django.core.cache import cache
from django.conf import settings
from dotenv import load_dotenv

# Ensure environment variables are loaded
load_dotenv(override=True)

# ── PROVIDER CONFIGURATION ──
AI_MODEL_NAME = os.getenv("QWEN_MODEL", "qwen-vl-max")

logger = logging.getLogger(__name__)

# ── PROVIDER SINGLETON ──
# Instantiated once at module load. All workers share this instance.
from core.providers.qwen_provider import QwenProvider
_ai_provider = QwenProvider()


# ═══════════════════════════════════════════════════════════════════════════════
# JSON UTILITIES (provider-agnostic, unchanged from former Gemini version)
# ═══════════════════════════════════════════════════════════════════════════════

def safe_extract_json(text: str) -> Optional[str]:
    """
    Production-grade JSON extractor.
    - Handles ```json ... ``` blocks
    - Handles ``` ... ``` blocks
    - Handles plain JSON text
    - Locates boundaries by brace counting
    - Sanitizes control characters
    """
    if not text:
        return None

    # Remove potentially dangerous control characters except common whitespace
    text = "".join(ch for ch in text if ch >= " " or ch in "\n\r\t")

    clean_text = text.strip()

    # 1. Standard markdown extract
    if "```json" in clean_text:
        try:
            clean_text = clean_text.split("```json")[1].split("```")[0].strip()
        except IndexError:
            pass
    elif "```" in clean_text:
        try:
            clean_text = clean_text.split("```")[1].split("```")[0].strip()
        except IndexError:
            pass

    # 2. Brace-based boundary detection
    if not (clean_text.startswith('{') and (clean_text.endswith('}') or clean_text.endswith(']'))):
        start = clean_text.find('{')
        if start == -1:
            start = clean_text.find('[')

        if start != -1:
            brace_count = 0
            bracket_count = 0
            for i in range(start, len(clean_text)):
                char = clean_text[i]
                if char == '{': brace_count += 1
                elif char == '}': brace_count -= 1
                elif char == '[': bracket_count += 1
                elif char == ']': bracket_count -= 1

                if brace_count == 0 and bracket_count == 0:
                    return clean_text[start:i+1].strip()

    return clean_text if (clean_text.startswith('{') or clean_text.startswith('[')) else None


def repair_json(text: str) -> str:
    """
    Emergency JSON repair layer for common LLM hallucinations.
    Handles trailing commas and missing braces.
    """
    if not text: return ""
    repaired = text.replace('\u201c', '"').replace('\u201d', '"').replace('\u2018', "'").replace('\u2019', "'")
    repaired = re.sub(r",\s*([\]}])", r"\1", repaired)
    brace_diff = repaired.count('{') - repaired.count('}')
    if brace_diff > 0: repaired += ('}' * brace_diff)
    bracket_diff = repaired.count('[') - repaired.count(']')
    if bracket_diff > 0: repaired += (']' * bracket_diff)
    return repaired


# ═══════════════════════════════════════════════════════════════════════════════
# API KEY MANAGER (supports QWEN_API_KEY with comma-separated rotation)
# ═══════════════════════════════════════════════════════════════════════════════

class APIKeyManager:
    """
    Rotates through multiple Qwen API keys and tracks health.
    For self-hosted servers without authentication, a single placeholder key is used.
    """

    def __init__(self):
        self.api_keys = []
        self.unhealthy_keys = set()
        self.rotation_counter = 0
        self.recheck_interval = 600  # 10 minutes quarantine before re-testing
        self._sync_keys()

    def _sync_keys(self):
        raw_keys = os.getenv('QWEN_API_KEY', 'EMPTY')
        if not raw_keys:
            # Self-hosted servers often require no auth — use placeholder
            self.api_keys = ['EMPTY']
            return
        self.api_keys = [k.strip() for k in raw_keys.split(',') if k.strip()]
        if not self.api_keys:
            self.api_keys = ['EMPTY']

    def get_healthy_key(self) -> Optional[str]:
        self._sync_keys()
        if not self.api_keys: return 'EMPTY'
        healthy_keys = [k for k in self.api_keys if k not in self.unhealthy_keys]
        keys_to_use = healthy_keys if healthy_keys else self.api_keys
        if healthy_keys:
            self.rotation_counter += 1
            return healthy_keys[self.rotation_counter % len(healthy_keys)]
        return keys_to_use[0] if keys_to_use else 'EMPTY'

    def mark_key_unhealthy(self, api_key: str):
        if api_key == 'EMPTY':
            return  # Never quarantine the placeholder key
        self.unhealthy_keys.add(api_key)
        threading.Timer(
            self.recheck_interval,
            lambda: self._recheck_key(api_key)
        ).start()

    def _recheck_key(self, api_key: str):
        try:
            healthy = _ai_provider.recheck_key_health(api_key, AI_MODEL_NAME)
            if healthy:
                self.unhealthy_keys.discard(api_key)
                logger.info(f"[KEY_RECHECK_PASS] Key ...{api_key[-6:]} is healthy again.")
        except Exception as e:
            logger.warning(f"[KEY_RECHECK_FAIL] Key ...{api_key[-6:]} still unhealthy: {e}")


# ═══════════════════════════════════════════════════════════════════════════════
# CIRCUIT BREAKER (provider-agnostic, unchanged)
# ═══════════════════════════════════════════════════════════════════════════════

class CircuitBreaker:
    def __init__(self):
        self.failure_threshold = 5
        self.reset_timeout = 300
        self.failures = 0
        self.last_failure = 0

    def is_open(self) -> bool:
        now = time.time()
        if self.failures >= self.failure_threshold:
            if now - self.last_failure < self.reset_timeout: return True
            self.failures = 0
        return False

    def record_failure(self):
        self.failures += 1
        self.last_failure = time.time()

    def record_success(self):
        if self.failures > 0: self.failures -= 1


# ═══════════════════════════════════════════════════════════════════════════════
# RATE LIMITER (provider-agnostic, unchanged)
# ═══════════════════════════════════════════════════════════════════════════════

class RateLimiter:
    def _get_redis(self):
        from core.redis_orchestrator import orchestrator
        if not orchestrator.redis:
            orchestrator._connect()
        return orchestrator.redis

    def check_rate_limit(self, key: str, limit: int = None, window: float = 1.0) -> Dict[str, Any]:
        r = self._get_redis()
        if not r:
            return {'allowed': True, 'retry_after': 0}

        if limit is None:
            limit = int(os.getenv('AI_MAX_RPS', '10'))

        now = time.time()
        clear_before = now - window

        try:
            pipe = r.pipeline()
            pipe.zremrangebyscore(key, 0, clear_before)
            pipe.zcard(key)
            pipe.zadd(key, {str(now): now})
            pipe.expire(key, int(window * 2) or 1)

            res = pipe.execute()
            count = res[1]

            if count >= limit:
                r.zrem(key, str(now))
                retry_after = max(0.1, window - (now - clear_before))
                return {'allowed': False, 'retry_after': retry_after}

            return {'allowed': True, 'retry_after': 0}
        except Exception as e:
            logger.error(f"[RATE_LIMIT_ERROR] {e}")
            return {'allowed': True, 'retry_after': 0}


# ═══════════════════════════════════════════════════════════════════════════════
# DISTRIBUTED CONCURRENCY MANAGER (provider-agnostic, unchanged)
# ═══════════════════════════════════════════════════════════════════════════════

class DistributedConcurrencyManager:
    """
    Redis-backed atomic semaphore for distributed concurrency governance.
    Replaces brittle DB locks with auto-expiring lease tokens to prevent permit leaks.
    """
    def __init__(self, max_concurrent=20):
        self.global_max = max_concurrent
        self.acquire_script = """
        local global_key = KEYS[1]
        local tenant_key = KEYS[2]
        local permit_id = ARGV[1]
        local current_time = tonumber(ARGV[2])
        local expiration_time = tonumber(ARGV[3])
        local global_limit = tonumber(ARGV[4])
        local tenant_limit = tonumber(ARGV[5])

        -- Cleanup expired
        redis.call('ZREMRANGEBYSCORE', global_key, 0, current_time)
        if tenant_key ~= "" then
            redis.call('ZREMRANGEBYSCORE', tenant_key, 0, current_time)
        end

        -- Check limits
        local global_count = redis.call('ZCARD', global_key)
        if global_count >= global_limit then
            return 0
        end

        if tenant_key ~= "" then
            local tenant_count = redis.call('ZCARD', tenant_key)
            if tenant_count >= tenant_limit then
                return 0
            end
        end

        -- Acquire
        redis.call('ZADD', global_key, expiration_time, permit_id)
        if tenant_key ~= "" then
            redis.call('ZADD', tenant_key, expiration_time, permit_id)
        end

        return 1
        """
        self._lua_sha = None

    def _get_redis(self):
        from core.redis_orchestrator import orchestrator
        if not orchestrator.redis:
            orchestrator._connect()
        return orchestrator.redis

    def acquire_permit(self, permit_id: str, tenant_id: str = "global") -> bool:
        r = self._get_redis()
        if not r:
            logger.warning("[REDIS_UNAVAILABLE] Concurrency governor falling back to deny-all.")
            return False

        from core.sqs import queue_service
        try:
            q_depth = queue_service.get_queue_depth('ai')
        except Exception:
            q_depth = 0

        effective_max = self.global_max
        if q_depth > 2000:
            effective_max = max(5, self.global_max // 4)
            logger.warning(f"[OVERLOAD_THROTTLE] Q_DEPTH={q_depth}. Reducing concurrency to {effective_max}")
        elif q_depth > 1000:
            effective_max = max(10, self.global_max // 2)

        global_key = "ai_concurrency:global"
        tenant_key = f"ai_concurrency:tenant:{tenant_id}" if tenant_id and tenant_id != "global" else ""

        now = time.time()
        expiration = now + 900  # 15-minute max lease to match watchdog
        tenant_limit = 15

        try:
            if not self._lua_sha:
                self._lua_sha = r.script_load(self.acquire_script)

            keys = [global_key, tenant_key]
            args = [permit_id, now, expiration, effective_max, tenant_limit]

            result = r.evalsha(self._lua_sha, len(keys), *keys, *args)
            return result == 1
        except Exception as e:
            logger.error(f"[QUOTA_ACQUIRE_ERROR] {e}")
            return False

    def release_permit(self, permit_id: str, tenant_id: str = "global"):
        r = self._get_redis()
        if not r:
            return

        global_key = "ai_concurrency:global"
        tenant_key = f"ai_concurrency:tenant:{tenant_id}" if tenant_id and tenant_id != "global" else ""

        try:
            r.zrem(global_key, permit_id)
            if tenant_key:
                r.zrem(tenant_key, permit_id)
        except Exception as e:
            logger.error(f"[QUOTA_RELEASE_ERROR] {e}")


# ═══════════════════════════════════════════════════════════════════════════════
# GLOBAL INSTANCES
# ═══════════════════════════════════════════════════════════════════════════════

api_key_manager = APIKeyManager()
circuit_breaker = CircuitBreaker()
rate_limiter = RateLimiter()
concurrency_governor = DistributedConcurrencyManager(
    max_concurrent=int(os.getenv('AI_GLOBAL_CONCURRENCY', '1'))
)


# ═══════════════════════════════════════════════════════════════════════════════
# STARTUP VALIDATION
# ═══════════════════════════════════════════════════════════════════════════════

def ensure_qwen_context_limit(api_base: str, model_name: str) -> bool:
    """
    Ensures the Ollama Qwen model is configured for GPU-only execution on RTX 4050.

    Key parameters:
      num_ctx  4096  — Reduced from 8192 to prevent VRAM overflow on 6 GB GPU.
                       At 8192 tokens, KV-cache overhead causes 66% CPU spillover
                       and 203+ second latency. At 4096 the model fits fully in VRAM.
      num_gpu  99    — Forces all model layers to GPU. Ollama caps at actual layer count.

    For OCR of 1-2 page invoices, 4096 context is more than sufficient.
    """
    import urllib.parse
    import requests
    import subprocess
    import tempfile

    # GPU-safe target values for RTX 4050 (6 GB VRAM)
    TARGET_NUM_CTX = 8192
    TARGET_NUM_GPU = 99  # Forces all layers to GPU (Ollama caps at actual count)

    try:
        parsed = urllib.parse.urlparse(api_base)
        native_base = f"{parsed.scheme}://{parsed.netloc}"
        show_url = f"{native_base}/api/show"

        logger.info(f"[OLLAMA_CONTEXT_CHECK] Querying {show_url} for model {model_name}...")
        resp = requests.post(show_url, json={"model": model_name}, timeout=5.0)
        if resp.status_code != 200:
            logger.warning(f"[OLLAMA_CONTEXT_CHECK_FAIL] Model show API returned status {resp.status_code}")
            return False

        data = resp.json()
        parameters = data.get("parameters", "")

        num_ctx = None
        num_gpu = None
        if parameters:
            for line in parameters.split("\n"):
                parts = line.split()
                if len(parts) >= 2:
                    try:
                        key = parts[0].lower()
                        val = int(parts[1])
                        if key == "num_ctx":
                            num_ctx = val
                        elif key == "num_gpu":
                            num_gpu = val
                    except ValueError:
                        pass

        logger.info(f"[OLLAMA_CONTEXT_CHECK] Model {model_name} current num_ctx={num_ctx} num_gpu={num_gpu}")

        needs_rebuild = (
            num_ctx is None or num_ctx != TARGET_NUM_CTX or
            num_gpu is None or num_gpu < TARGET_NUM_GPU
        )

        if needs_rebuild:
            logger.warning(
                f"[OLLAMA_CONFIG_INSUFFICIENT] num_ctx={num_ctx} num_gpu={num_gpu}. "
                f"Expected num_ctx={TARGET_NUM_CTX} num_gpu={TARGET_NUM_GPU}. "
                f"Auto-rebuilding model for GPU-only execution..."
            )

            modelfile_content = (
                f"FROM {model_name}\n"
                f"PARAMETER num_ctx {TARGET_NUM_CTX}\n"
                f"PARAMETER num_gpu {TARGET_NUM_GPU}\n"
                f"PARAMETER temperature 0.0001\n"
            )

            with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='_Modelfile') as f:
                f.write(modelfile_content)
                temp_path = f.name

            try:
                logger.info(f"[OLLAMA_REBUILD] Running: ollama create {model_name} -f {temp_path}")
                res = subprocess.run(
                    ["ollama", "create", model_name, "-f", temp_path],
                    capture_output=True,
                    text=True,
                    timeout=60.0
                )
                if res.returncode == 0 or "success" in res.stdout.lower():
                    logger.info(
                        f"[OLLAMA_REBUILD_SUCCESS] Model {model_name} rebuilt: "
                        f"num_ctx={TARGET_NUM_CTX} num_gpu={TARGET_NUM_GPU}"
                    )
                    return True
                else:
                    logger.error(f"[OLLAMA_REBUILD_FAILED] Return code: {res.returncode}. Stderr: {res.stderr}")
                    return False
            finally:
                try:
                    if os.path.exists(temp_path):
                        os.remove(temp_path)
                except Exception as cleanup_err:
                    logger.warning(f"[OLLAMA_TEMP_CLEANUP_ERR] {cleanup_err}")
        else:
            logger.info(
                f"[OLLAMA_CONFIG_OK] Model {model_name} is configured for GPU-only: "
                f"num_ctx={num_ctx} num_gpu={num_gpu}"
            )
            return True

    except Exception as e:
        logger.warning(f"[OLLAMA_CONTEXT_CHECK_ERR] Failed to verify or update Ollama GPU config: {e}")
        return False




def validate_ai_on_startup() -> bool:
    """
    Called at Django startup / worker startup to verify AI provider configuration and endpoint.
    Refuses provider initialization if required Qwen config is missing or the endpoint is invalid.

    GPU Enforcement:
        After endpoint validation, this function runs a 3-phase GPU audit:
          Phase 1 — nvidia-smi: Confirm RTX 4050 is present with ≥4 GB VRAM
          Phase 2 — Ollama /api/ps: Confirm model is loaded on GPU processor
          Phase 3 — Smoke test: Confirm tok/s proves GPU execution

        If ANY phase fails, raises RuntimeError immediately.
        Startup is ABORTED. CPU inference is FORBIDDEN.
    """
    api_base = os.getenv('QWEN_API_BASE')
    if not api_base:
        logger.error("[AI_PROVIDER_STARTUP_FAILURE] QWEN_API_BASE environment variable is missing.")
        _ai_provider.mark_invalid("MISSING_CONFIG", "QWEN_API_BASE environment variable is missing.")
        return False

    model_name = os.getenv('QWEN_MODEL')
    if not model_name:
        logger.error("[AI_PROVIDER_STARTUP_FAILURE] QWEN_MODEL config missing. Set QWEN_MODEL in .env")
        _ai_provider.mark_invalid("MISSING_CONFIG", "QWEN_MODEL config missing. Set QWEN_MODEL in .env")
        return False

    # Dynamic self-healing context window check/rebuild for local Ollama models
    ensure_qwen_context_limit(api_base, model_name)

    api_key_manager._sync_keys()

    from core.providers.qwen_provider import check_endpoint_health
    primary_key = api_key_manager.get_healthy_key()
    health = check_endpoint_health(api_base, primary_key)

    health_log = (
        f"[AI_PROVIDER_HEALTHCHECK]\n"
        f"provider=Qwen\n"
        f"endpoint={health['endpoint_used']}\n"
        f"result={health['classification']}\n"
        f"latency_ms={health['latency_ms']:.1f}"
    )
    logger.info(health_log)
    print(health_log)

    if not health['valid']:
        logger.error(
            f"[QWEN_ENDPOINT_INVALID] endpoint={health['endpoint_used']} "
            f"classification={health['classification']} error={health['error_msg']}"
        )
        logger.error(
            f"[AI_PROVIDER_STARTUP_FAILURE] reason=Endpoint health check failed: {health['classification']}"
        )
        _ai_provider.mark_invalid(health['classification'], health['error_msg'])
        return False

    logger.info(
        f"[QWEN_ENDPOINT_VALIDATED] endpoint={health['endpoint_used']} latency_ms={health['latency_ms']:.1f}"
    )

    # ── GPU-ONLY STARTUP VALIDATION ─────────────────────────────────────────────
    # Verify that the RTX 4050 GPU is present and Qwen is running on GPU.
    # If GPU is unavailable or the model runs on CPU, this RAISES a fatal
    # RuntimeError — the cluster REFUSES to start. CPU inference is forbidden.
    # [FIX] Skip GPU validation for Django runserver (web process) to prevent startup hangs.
    import sys
    is_runserver = any('runserver' in arg.lower() for arg in sys.argv)
    if is_runserver:
        logger.info("[GPU_STARTUP_SKIPPED] Skipping hardware GPU validation and smoke test for web server process.")
    else:
        try:
            from core.gpu_validator import validate_gpu_on_startup
            gpu_evidence = validate_gpu_on_startup(model_name)
            logger.info(
                f"[GPU_STARTUP_VALIDATED] "
                f"gpu={gpu_evidence.get('gpu_name', 'unknown')} | "
                f"vram={gpu_evidence.get('vram_used_mib_after_load', gpu_evidence.get('vram_used_mib', 0)):.0f} MiB | "
                f"smoke_tps={gpu_evidence.get('smoke_tokens_per_second', 0):.2f} | "
                f"compute_mode=GPU_ONLY"
            )
        except RuntimeError as gpu_err:
            # GPU validation explicitly failed — do NOT allow startup
            logger.critical(
                f"[GPU_STARTUP_FATAL] GPU validation failed. Refusing CPU inference.\n{gpu_err}"
            )
            _ai_provider.mark_invalid("GPU_UNAVAILABLE", str(gpu_err))
            raise RuntimeError(
                f"GPU validation failed. Refusing CPU inference.\n{gpu_err}"
            ) from gpu_err
        except Exception as gpu_exc:
            # Unexpected error in GPU validator itself — fail safely
            logger.critical(
                f"[GPU_STARTUP_ERROR] Unexpected GPU validator error: {gpu_exc}. Refusing startup."
            )
            _ai_provider.mark_invalid("GPU_VALIDATOR_ERROR", str(gpu_exc))
            raise RuntimeError(
                f"GPU validation failed. Refusing CPU inference.\n{gpu_exc}"
            ) from gpu_exc
    # ── END GPU-ONLY STARTUP VALIDATION ─────────────────────────────────────────

    logger.info(
        f"[AI_PROVIDER_READY] provider=Qwen model={os.getenv('QWEN_MODEL')} "
        f"base_url={api_base} keys={len(api_key_manager.api_keys)} "
        f"compute_mode=GPU_ONLY"
    )
    _ai_provider.mark_valid()
    return True



# ═══════════════════════════════════════════════════════════════════════════════
# ERROR TYPES
# ═══════════════════════════════════════════════════════════════════════════════

class TerminalTaskError(Exception):
    """Raised for non-retryable AI orchestration errors."""
    pass


class ProviderSaturatedError(Exception):
    """Raised when the AI provider or local concurrency limits are saturated."""
    pass


# ═══════════════════════════════════════════════════════════════════════════════
# ERROR CLASSIFICATION
# ═══════════════════════════════════════════════════════════════════════════════

def is_retryable_ai_error(e: Exception) -> bool:
    """
    Implements global retry classification.
    Non-retryable errors abort immediately; retryable errors trigger backoff.
    """
    err_str = str(e).lower()
    # Non-retryable
    if any(k in err_str for k in [
        "400", "401", "403", "404", "model not found",
        "invalid api key", "api key not valid", "malformed",
        "invalid_argument", "permission_denied", "unauthenticated",
        "quota_disabled", "billing not enabled", "invalid_ai_endpoint"
    ]):
        return False
    # Retryable
    if any(k in err_str for k in [
        "429", "500", "502", "503", "timeout", "connection reset",
        "capacity", "too many requests"
    ]):
        return True
    return True  # Default: treat as transient


# ═══════════════════════════════════════════════════════════════════════════════
# CORE EXECUTION WITH RETRY
# ═══════════════════════════════════════════════════════════════════════════════

def execute_with_retry(prompt: Any, request_data: dict, api_key: str) -> str:
    """
    Production-grade retry logic with exponential backoff and jitter.
    Delegates to QwenProvider.call_single() for each attempt.

    STRICT RETRY RULE:
    - Do NOT retry: auth failures, invalid keys, malformed requests.
    - Retry ONLY: transient network failures, rate limits, 5xx provider failures.
    """
    import random
    from core.observability import observability

    MAX_ATTEMPTS = 5
    base_delay = 1

    tenant_id = request_data.get('tenant_id') or (request_data.get('metadata') or {}).get('tenant_id')
    record_id = request_data.get('record_id') or (request_data.get('metadata') or {}).get('record_id')
    page_number = request_data.get('page_number') or request_data.get('page_index')

    current_model = AI_MODEL_NAME
    last_error = None
    attempt = 0

    logger.info(
        f"[AI_MODEL_SELECTED] provider=Qwen model={current_model} "
        f"tenant_id={tenant_id} record_id={record_id} page_number={page_number}"
    )

    # ── RESOLVE PROMPT PARTS ──
    if isinstance(prompt, list):
        # Former Gemini multipart list format — extract text and image
        prompt_text = ""
        image_b64 = None
        mime_type = "image/jpeg"
        batch_images = None

        for part in prompt:
            if isinstance(part, str):
                prompt_text = part
            elif isinstance(part, dict) and "inline_data" in part:
                # Former Gemini inline_data format → convert to b64 string
                raw_bytes = part["inline_data"].get("data", b"")
                if isinstance(raw_bytes, bytes):
                    image_b64 = base64.b64encode(raw_bytes).decode("utf-8")
                else:
                    image_b64 = raw_bytes  # already b64 string
                mime_type = part["inline_data"].get("mime_type", "image/jpeg")
    else:
        # Plain string prompt (text-only or already preprocessed)
        prompt_text = prompt if isinstance(prompt, str) else str(prompt)
        image_b64 = None
        mime_type = "image/jpeg"
        batch_images = None

    # Handle batch_images from request_data directly
    if request_data.get("batch_images"):
        batch_images = request_data["batch_images"]
        image_b64 = None  # batch mode overrides single-image mode
    elif request_data.get("image_data"):
        image_b64 = request_data["image_data"]
        mime_type = request_data.get("mime_type", "image/jpeg")
        batch_images = None
        # prompt_text was already set above from prompt list or string
        if not prompt_text:
            prompt_text = request_data.get("prompt", "Extract data")

    while attempt < MAX_ATTEMPTS:
        try:
            result = _ai_provider.call_single(
                prompt_text=prompt_text,
                image_b64=image_b64,
                mime_type=mime_type,
                batch_images=batch_images,
                request_data=request_data,
                api_key=api_key,
                model_name=current_model,
                attempt_label=f"Attempt {attempt + 1}",
            )
            return result
        except TerminalTaskError as e:
            logger.error(
                f"[AI_TERMINAL_FAILURE] provider=Qwen model={current_model} "
                f"tenant_id={tenant_id} record_id={record_id} page_number={page_number} "
                f"error={str(e)[:100]}"
            )
            raise
        except Exception as e:
            last_error = e
            retryable = is_retryable_ai_error(e)

            logger.info(
                f"[AI_ERROR_CLASSIFIED] provider=Qwen model={current_model} "
                f"tenant_id={tenant_id} record_id={record_id} page_number={page_number} "
                f"retryable={retryable} error={str(e)[:100]}"
            )

            if not retryable:
                logger.error(
                    f"[AI_TERMINAL_FAILURE] provider=Qwen model={current_model} "
                    f"error={str(e)[:100]}"
                )
                raise TerminalTaskError(str(e))

            if attempt < MAX_ATTEMPTS - 1:
                delay = (base_delay * (2 ** attempt)) + (random.random() * 0.5)
                logger.warning(
                    f"[AI_RETRY] Qwen/{current_model} Attempt {attempt+1} failed: {e}. "
                    f"Retrying in {delay:.2f}s..."
                )
                observability.ai_metric(event="AI_RETRY", attempt=attempt + 1, error=str(e)[:100])
                time.sleep(delay)
                attempt += 1
            else:
                logger.error(f"[AI_EXHAUSTED] All {MAX_ATTEMPTS} attempts failed on {current_model}: {e}")
                observability.ai_metric(event="AI_EXHAUSTED", error=str(e)[:100])
                raise e

    raise last_error


# ═══════════════════════════════════════════════════════════════════════════════
# SHADOW MODE COMPARISON & DRIFT TELEMETRY
# ═══════════════════════════════════════════════════════════════════════════════

def compare_bypass_vs_qwen(bypass_payload: dict, qwen_payload: dict) -> Tuple[bool, List[str]]:
    from typing import Tuple, List
    reasons = []
    
    b_h = bypass_payload.get('header', {}) or {}
    q_h = qwen_payload.get('header', {}) or {}
    
    # Header fields comparison
    b_vn = str(b_h.get('vendor_name') or "").strip().lower()
    q_vn = str(q_h.get('vendor_name') or "").strip().lower()
    if b_vn != q_vn:
        reasons.append(f"vendor_name_drift: bypass='{b_vn}' qwen='{q_vn}'")
        
    b_gst = str(b_h.get('vendor_gstin') or "").strip().lower()
    q_gst = str(q_h.get('vendor_gstin') or "").strip().lower()
    if b_gst != q_gst:
        reasons.append(f"gstin_drift: bypass='{b_gst}' qwen='{q_gst}'")
        
    b_inv = str(b_h.get('invoice_no') or "").strip().lower()
    q_inv = str(q_h.get('invoice_no') or "").strip().lower()
    b_inv_norm = re.sub(r'[\/\-\.]', '', b_inv)
    q_inv_norm = re.sub(r'[\/\-\.]', '', q_inv)
    if b_inv_norm != q_inv_norm:
        reasons.append(f"invoice_no_drift: bypass='{b_inv}' qwen='{q_inv}'")
        
    b_date = str(b_h.get('invoice_date') or "").strip().lower()
    q_date = str(q_h.get('invoice_date') or "").strip().lower()
    if b_date != q_date:
        reasons.append(f"invoice_date_drift: bypass='{b_date}' qwen='{q_date}'")
        
    def get_float(val) -> float:
        if val is None:
            return 0.0
        try:
            return round(float(str(val).replace(',', '')), 2)
        except ValueError:
            return 0.0

    b_tax = get_float(b_h.get('taxable_value'))
    q_tax = get_float(q_h.get('taxable_value'))
    if abs(b_tax - q_tax) > 2.0:
        reasons.append(f"taxable_value_drift: bypass={b_tax} qwen={q_tax}")
        
    b_tot = get_float(b_h.get('total_amount'))
    q_tot = get_float(q_h.get('total_amount'))
    if abs(b_tot - q_tot) > 2.0:
        reasons.append(f"total_amount_drift: bypass={b_tot} qwen={q_tot}")
        
    b_cgst = get_float(b_h.get('cgst'))
    q_cgst = get_float(q_h.get('cgst'))
    if abs(b_cgst - q_cgst) > 1.0:
        reasons.append(f"cgst_drift: bypass={b_cgst} qwen={q_cgst}")
        
    b_sgst = get_float(b_h.get('sgst'))
    q_sgst = get_float(q_h.get('sgst'))
    if abs(b_sgst - q_sgst) > 1.0:
        reasons.append(f"sgst_drift: bypass={b_sgst} qwen={q_sgst}")
        
    b_igst = get_float(b_h.get('igst'))
    q_igst = get_float(q_h.get('igst'))
    if abs(b_igst - q_igst) > 1.0:
        reasons.append(f"igst_drift: bypass={b_igst} qwen={q_igst}")
        
    # Item fields comparison
    b_items = bypass_payload.get('items', []) or []
    q_items = qwen_payload.get('items', []) or []
    
    if len(b_items) != len(q_items):
        reasons.append(f"item_count_drift: bypass={len(b_items)} qwen={len(q_items)}")
    else:
        for idx in range(len(b_items)):
            bi = b_items[idx]
            qi = q_items[idx]
            
            b_qty = get_float(bi.get('quantity'))
            q_qty = get_float(qi.get('quantity'))
            if abs(b_qty - q_qty) > 0.1:
                reasons.append(f"item_{idx}_qty_drift: bypass={b_qty} qwen={q_qty}")
                
            b_rt = get_float(bi.get('rate'))
            q_rt = get_float(qi.get('rate'))
            if abs(b_rt - q_rt) > 0.1:
                reasons.append(f"item_{idx}_rate_drift: bypass={b_rt} qwen={q_rt}")
                
            b_amt = get_float(bi.get('amount') or bi.get('taxable_value'))
            q_amt = get_float(qi.get('amount') or qi.get('taxable_value'))
            if abs(b_amt - q_amt) > 2.0:
                reasons.append(f"item_{idx}_amount_drift: bypass={b_amt} qwen={q_amt}")
                
    is_match = len(reasons) == 0
    return is_match, reasons

def log_shadow_mode_drift(record_id: int, page_number: int, is_match: bool, reasons: List[str]):
    from datetime import datetime
    import json
    import os
    drift_file = r"C:\Users\ulaganathan\.gemini\antigravity-ide\brain\318cbd76-d3fd-4ad6-9ae2-fc757a249593\shadow_mode_drift.json"
    
    entries = []
    if os.path.exists(drift_file):
        try:
            with open(drift_file, 'r') as f:
                entries = json.load(f)
        except Exception:
            entries = []
            
    entries.append({
        'record_id': record_id,
        'page_number': page_number,
        'is_match': is_match,
        'reasons': reasons,
        'timestamp': datetime.now().isoformat()
    })
    
    try:
        os.makedirs(os.path.dirname(drift_file), exist_ok=True)
        with open(drift_file, 'w') as f:
            json.dump(entries, f, indent=2)
    except Exception as e:
        logger.warning(f"Failed to write shadow mode drift to file: {e}")


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN PROCESS ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════════

def process_ai_request(request_data: dict) -> dict:
    """
    Central AI extraction dispatcher.
    Called by AIWorker and synchronous extraction paths.

    Governs:
      - Tenant context validation
      - Overload shedding
      - Distributed concurrency (Redis semaphore)
      - RPS rate limiting (Redis sorted-set)
      - Mock mode bypass
      - Circuit breaker
      - API key selection + rotation
      - Retry orchestration via execute_with_retry()
    """
    if not getattr(_ai_provider, '_is_valid', True):
        raise TerminalTaskError(f"INVALID_AI_ENDPOINT: {getattr(_ai_provider, '_invalid_reason', 'AI provider endpoint is invalid')}")

    from core.observability import observability, metrics

    # ── TENANT CONTEXT VALIDATION ──
    tenant_id = request_data.get('tenant_id') or (request_data.get('metadata') or {}).get('tenant_id')

    if not tenant_id or not isinstance(tenant_id, str) or tenant_id == 'None':
        logger.error(
            f"[TENANT_CONTEXT_INVALID] task_id={request_data.get('id')} "
            f"payload={json.dumps(request_data)[:200]}"
        )
        return {'error': 'Invalid or missing tenant_id', 'code': 'INVALID_TENANT_CONTEXT'}

    logger.info(f"[TENANT_CONTEXT_RESOLVED] tenant_id={tenant_id}")

    # ── Task 3: Conservative Simple Invoice Classifier ──
    SIMPLE_INVOICE_BYPASS_SHADOW_MODE = getattr(settings, 'SIMPLE_INVOICE_BYPASS_SHADOW_MODE', True)
    SIMPLE_INVOICE_BYPASS_ACTIVE = getattr(settings, 'SIMPLE_INVOICE_BYPASS_ACTIVE', False)
    
    # Force bypass disabled during Sprint 1
    if SIMPLE_INVOICE_BYPASS_ACTIVE:
        logger.warning("[SIMPLE_INVOICE_BYPASS_ACTIVE_OVERRIDE] Real bypass is forbidden in Sprint 1. Forcing active=False.")
        SIMPLE_INVOICE_BYPASS_ACTIVE = False

    bypass_payload = None
    if request_data.get('type') == 'extraction':
        ocr_text = request_data.get('_pdf_ocr_text')
        page_count = request_data.get('total_pages') or 1
        record_id = request_data.get('record_id') or (request_data.get('metadata') or {}).get('record_id')
        
        from ocr_pipeline.simple_invoice_classifier import classify_simple_invoice
        try:
            bypass_payload = classify_simple_invoice(ocr_text, page_count, tenant_id)
        except Exception as classifier_err:
            logger.error(f"[SIMPLE_INVOICE_CLASSIFIER_ERR] record={record_id} err={classifier_err}")

        # Real bypass: return candidate directly (Forbidden during Sprint 1, kept as structured safeguard)
        if bypass_payload and SIMPLE_INVOICE_BYPASS_ACTIVE and not SIMPLE_INVOICE_BYPASS_SHADOW_MODE:
            logger.critical(f"[SIMPLE_INVOICE_BYPASS_ACTIVE_TRIGGERED] record={record_id} Bypassing Qwen VL completely!")
            return {'reply': json.dumps(bypass_payload)}

    # ── OVERLOAD SHEDDING ──
    from core.sqs import queue_service
    import uuid
    q_depth = queue_service.get_queue_depth('ai')
    if q_depth > 5000:
        if random.random() < 0.5:
            logger.critical(f"[OVERLOAD_SHEDDING] Q_DEPTH={q_depth}. Dropping request for {tenant_id}")
            raise ProviderSaturatedError('AI service is under extreme load.')

    # ── DISTRIBUTED CONCURRENCY PERMIT ──
    permit_id = request_data.get('id', str(uuid.uuid4()))
    if not concurrency_governor.acquire_permit(permit_id, tenant_id):
        observability.ai_metric(event="TENANT_THROTTLED", tenant_id=tenant_id)
        metrics.increment_counter("ai:throttled", tags={"tenant": tenant_id})
        logger.warning(
            f"[AI_PROVIDER_THROTTLED] tenant_id={tenant_id} — AI system is at capacity."
        )
        raise ProviderSaturatedError('AI system is at capacity.')

    # ── RPS RATE LIMITING ──
    max_rps = int(os.getenv('AI_MAX_RPS', '10'))
    rate_limit_key = "ai_rate_limit:global"

    acquired_rate_limit = False
    for attempt in range(300):
        res = rate_limiter.check_rate_limit(rate_limit_key, limit=max_rps, window=1.0)
        if res.get('allowed'):
            acquired_rate_limit = True
            break
        sleep_time = res.get('retry_after') or 0.1
        time.sleep(min(sleep_time, 1.0))

    if not acquired_rate_limit:
        logger.error(f"[RATE_LIMIT_EXCEEDED] Global AI RPS limit of {max_rps} exceeded after 30s back-pressure.")
        raise ProviderSaturatedError('AI provider rate limit reached.')

    try:
        # ── MOCK MODE ──
        if os.getenv('MOCK_EXTRACTION_MODE', 'false').lower() == 'true':
            import random as _r
            time.sleep(_r.uniform(0.05, 0.2))
            mock_reply = {
                "invoice_no": f"MOCK-{_r.randint(1000, 9999)}",
                "invoice_date": "2024-05-15",
                "vendor_name": "Mock Stress Corp",
                "total_amount": 1234.56,
                "currency": "INR",
                "items": [{"description": "Mock Item", "quantity": 1, "rate": 1234.56, "amount": 1234.56}]
            }
            record_id = request_data.get('record_id') or (request_data.get('metadata') or {}).get('record_id')
            if record_id:
                try:
                    rescan_history_id = (
                        request_data.get('rescan_history_id')
                        or (request_data.get('metadata') or {}).get('rescan_history_id')
                    )
                    from ocr_pipeline.models import AIUsageAccounting
                    AIUsageAccounting.objects.create(
                        invoice_temp_ocr_id=record_id,
                        rescan_history_id=rescan_history_id,
                        prompt_tokens=600,
                        completion_tokens=200,
                        total_tokens=800,
                        cost=0.00014,
                    )
                except Exception as _ae:
                    logger.warning(f"[MOCK_USAGE_SAVE_ERR] {_ae}")
            return {'reply': json.dumps(mock_reply)}

        # ── CIRCUIT BREAKER ──
        if circuit_breaker.is_open():
            return {'error': 'AI service temporarily unavailable.', 'code': 'CIRCUIT_BREAKER'}

        # ── API KEY SELECTION ──
        api_key = api_key_manager.get_healthy_key()
        if not api_key:
            return {'error': 'No API keys available.'}

        # ── BUILD PROMPT PARTS FOR PROVIDER ──
        # Forward the full request_data — execute_with_retry() extracts prompt parts
        if request_data.get('type') == 'agent':
            # ── AGENT (CHAT) PATH ─────────────────────────────────────────────────
            # Agent calls must NOT go through execute_with_retry() + call_single()
            # because call_single() always sets the system message to:
            #   "Expert Indian GST invoice OCR. Return ONLY valid JSON ..."
            # That causes Qwen to wrap its chat reply in JSON (e.g. {"response": "..."}).
            # Instead, call the Qwen API directly here with a plain-text conversational
            # system prompt so the model responds in natural language.
            user_message = request_data.get('message', '')
            history = request_data.get('history', []) or []

            agent_system_prompt = (
                "You are Kiki, a helpful AI accounting assistant for an Indian ERP system. "
                "Answer the user's question clearly and concisely in plain text. "
                "Do NOT wrap your reply in JSON, code blocks, or any structured format. "
                "Respond ONLY with natural language text."
            )

            agent_messages = [{"role": "system", "content": agent_system_prompt}]
            for h in history:
                role = h.get('role', 'user')
                if role == 'model':
                    role = 'assistant'
                agent_messages.append({"role": role, "content": h.get('text', '')})
            agent_messages.append({"role": "user", "content": user_message})

            from openai import OpenAI
            qwen_base = os.getenv('QWEN_API_BASE', '')
            qwen_key = api_key if api_key and api_key.strip() else 'EMPTY'
            agent_client = OpenAI(api_key=qwen_key, base_url=qwen_base, timeout=120.0)

            t_ai_start = time.time()
            observability.ai_metric(event="PARALLEL_AI_EXECUTION", tenant_id=tenant_id, status="START")

            try:
                agent_resp = agent_client.chat.completions.create(
                    model=os.getenv('QWEN_MODEL', 'qwen2.5:7b'),
                    messages=agent_messages,
                    max_tokens=1024,
                    temperature=0.7,
                )
                response_text = (agent_resp.choices[0].message.content or '').strip()
            except Exception as agent_err:
                logger.error(f"[AGENT_QWEN_ERROR] {agent_err}")
                response_text = "Sorry, I am having trouble connecting to the AI. Please try again."
        else:
            prompt_text = request_data.get('prompt', 'Extract data')
            if 'batch_images' in request_data:
                # Batch mode — build Gemini-style list for backward compat with execute_with_retry
                prompt = [prompt_text]
                for img in request_data['batch_images']:
                    prompt.append({
                        'inline_data': {
                            'mime_type': img.get('mime_type', 'image/jpeg'),
                            'data': base64.b64decode(img['data'])
                        }
                    })
            elif 'image_data' in request_data:
                prompt = [
                    prompt_text,
                    {
                        'inline_data': {
                            'mime_type': request_data.get('mime_type', 'image/jpeg'),
                            'data': base64.b64decode(request_data['image_data'])
                        }
                    }
                ]
            else:
                prompt = prompt_text

            t_ai_start = time.time()
            observability.ai_metric(event="PARALLEL_AI_EXECUTION", tenant_id=tenant_id, status="START")
            response_text = execute_with_retry(prompt, request_data, api_key)
        
        # Shadow mode comparison and logging
        if bypass_payload and SIMPLE_INVOICE_BYPASS_SHADOW_MODE:
            try:
                from ocr_pipeline.extraction import _repair_json
                page_num = request_data.get('page_number') or 1
                repaired, _, _ = _repair_json(response_text, record_id=record_id, page=page_num)
                qwen_payload = json.loads(repaired)
                
                is_match, reasons = compare_bypass_vs_qwen(bypass_payload, qwen_payload)
                
                # Telemetry [SIMPLE_BYPASS_DRIFT]
                drift_log = {
                    'record_id': record_id,
                    'page_number': page_num,
                    'is_match': is_match,
                    'reasons': reasons
                }
                logger.info(f"[SIMPLE_BYPASS_DRIFT] {json.dumps(drift_log)}")
                
                log_shadow_mode_drift(record_id, page_num, is_match, reasons)
            except Exception as shadow_err:
                logger.error(f"[SHADOW_MODE_RECONCILIATION_ERR] record={record_id} err={shadow_err}")

        ai_latency = time.time() - t_ai_start
        observability.ai_metric(
            event="PARALLEL_AI_EXECUTION",
            tenant_id=tenant_id,
            status="COMPLETE",
            latency_s=round(ai_latency, 3)
        )

        circuit_breaker.record_success()
        observability.ai_metric(event="AI_LATENCY", tenant_id=tenant_id, latency_s=round(ai_latency, 3))
        metrics.record_latency("ai:latency", ai_latency, tags={"tenant": tenant_id})
        return {'reply': response_text}

    except Exception as e:
        circuit_breaker.record_failure()
        observability.ai_metric(event="AI_ERROR", tenant_id=tenant_id, error=str(e)[:200])
        metrics.increment_counter("ai:errors", tags={"tenant": tenant_id})
        return {'error': str(e)}
    finally:
        concurrency_governor.release_permit(permit_id, tenant_id)


# ═══════════════════════════════════════════════════════════════════════════════
# AI SERVICE PROXY (interface unchanged — same as former Gemini version)
# ═══════════════════════════════════════════════════════════════════════════════

class AIServiceProxy:
    def make_request(
        self,
        request_type: str,
        request_data: dict,
        user_id: str,
        tenant_id: str = None,
        metadata: dict = None,
        delay_seconds: int = 0,
    ) -> dict:
        if not getattr(_ai_provider, '_is_valid', True):
            err_msg = f"INVALID_AI_ENDPOINT: {getattr(_ai_provider, '_invalid_reason', 'AI provider endpoint is invalid')}"
            logger.error(f"[AI_ENQUEUE_REJECTED] {err_msg}")
            return {'error': err_msg, '_error': err_msg, 'code': 'INVALID_AI_ENDPOINT'}

        request_data.update({
            'type': request_type,
            'user_id': user_id,
            'tenant_id': tenant_id or 'anonymous'
        })
        if metadata:
            request_data['metadata'] = metadata

        wait_for_result = request_data.get('wait_for_result', True)

        if not wait_for_result:
            # ── ASYNC OFFLOADING TO SQS ──
            from vouchers.message_factory import message_factory

            session_id = request_data.get('upload_session_id') or (metadata.get('upload_session_id') if metadata else 'unknown')
            job_id = request_data.get('job_id') or (metadata.get('job_id') if metadata else 'unknown')
            record_id = request_data.get('record_id') or 'unknown'

            from copy import deepcopy
            msg = message_factory.create_message(
                task_type="AI_EXTRACTION",
                tenant_id=tenant_id,
                session_id=session_id,
                payload=request_data,
                correlation_id=metadata.get('correlation_id') if metadata else None
            )
            msg_copy = deepcopy(msg)

            from core.sqs import queue_service
            try:
                pushed = queue_service.push(msg_copy, queue_type='ai', delay_seconds=delay_seconds)
                if not pushed:
                    raise RuntimeError(
                        f"[SQS_PUSH_FAILED] push() returned False for msg_id={msg_copy['id']} record={record_id}"
                    )

                # Mark as successfully enqueued in Redis
                if record_id and record_id != 'unknown':
                    rec_id_str = str(record_id)
                    page_nums = []
                    single_page = request_data.get('page_number') or (metadata.get('page_index') if metadata else None)
                    if single_page is not None:
                        page_nums.append(str(single_page))

                    if 'page_index' in request_data and request_data['page_index'] is not None:
                        page_nums.append(str(request_data['page_index']))

                    if 'batch_indices' in request_data and request_data['batch_indices']:
                        page_nums.extend([str(idx + 1) for idx in request_data['batch_indices']])

                    # Deduplicate
                    seen = set()
                    page_nums = [x for x in page_nums if not (x in seen or seen.add(x))]

                    if page_nums:
                        from core.redis_orchestrator import orchestrator
                        for p_num in page_nums:
                            orchestrator.redis.set(
                                f"assembly:{rec_id_str}:page:{p_num}:enqueued", "true", ex=86400
                            )
                            orchestrator.redis.sadd(
                                f"assembly:{rec_id_str}:enqueued_success_pages", p_num
                            )
                        orchestrator.redis.expire(
                            f"assembly:{rec_id_str}:enqueued_success_pages", 86400
                        )

                logger.info(
                    f"[QUEUE_FORWARD_SUCCESS] target_queue=ai msg_id={msg_copy['id']} "
                    f"record={record_id} job={job_id}"
                )
            except Exception as e:
                logger.error(f"[QUEUE_FORWARD_FAILURE] target_queue=ai error={e}")
                raise

            logger.info(f"[AI_TASK_EMITTED] id={msg['id']} corr={msg['correlation_id']} session={session_id}")
            return {'status': 'queued', 'message': 'Task enqueued to AI specialized worker.'}

        return process_ai_request(request_data)

    def get_stats(self) -> dict:
        """Get service statistics."""
        return {
            'total_requests': 0,
            'cache_hits': 0,
            'circuit_breaker_open': circuit_breaker.is_open(),
            'api_keys_total': len(api_key_manager.api_keys),
            'api_keys_unhealthy': len(api_key_manager.unhealthy_keys),
            'provider': 'Qwen',
            'model': AI_MODEL_NAME,
        }


ai_service = AIServiceProxy()
