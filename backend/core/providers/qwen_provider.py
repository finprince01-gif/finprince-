"""
QwenProvider — Qwen-VL AI Extraction Provider
==============================================
Implements BaseAIProvider using a self-hosted Qwen-VL model server
that exposes an OpenAI-compatible API (vLLM, Ollama, etc.).

Configuration (set in .env):
    QWEN_MODEL    = qwen2.5vl:7b         (deployed model name)
    QWEN_API_BASE = http://localhost:11434/v1  (Ollama OpenAI-compat URL)
    QWEN_API_KEY  = EMPTY                (set to a real key if your server requires one)

Contract:
    - Input:  prompt text + JPEG image (base64) or batch of images
    - Output: raw JSON string from model
    - Errors: TerminalTaskError (non-retryable), Exception (retryable)

Token Accounting:
    - Maps OpenAI-compat usage.prompt_tokens / completion_tokens / total_tokens
    - Saves to AIUsageAccounting (same table as Gemini, fully compatible)

GPU Enforcement:
    - Per-request GPU status emitted via [QWEN_GPU_STATUS]
    - CPU inference triggers RuntimeError (never silently falls back to CPU)
    - Compute mode thresholds calibrated for multi-image vision inference
      on RTX 4050 (6 GB VRAM), not text-only throughput.
"""

import os
import base64
import logging
import time
from typing import Optional, List

from .base import BaseAIProvider

logger = logging.getLogger(__name__)

# Import TerminalTaskError lazily to avoid circular imports at module level
_TERMINAL_ERROR_CLS = None

def _get_terminal_error():
    global _TERMINAL_ERROR_CLS
    if _TERMINAL_ERROR_CLS is None:
        from core.ai_proxy import TerminalTaskError
        _TERMINAL_ERROR_CLS = TerminalTaskError
    return _TERMINAL_ERROR_CLS


class QwenProvider(BaseAIProvider):
    """
    Qwen-VL extraction provider via OpenAI-compatible REST API.

    This provider is completely interchangeable with the former Gemini provider.
    All input/output contracts are identical:
      - Same prompt format
      - Same response format (raw JSON string)
      - Same token accounting schema (AIUsageAccounting)
      - Same error classification (retryable vs terminal)
    """

    # Non-retryable HTTP status codes / error strings
    NON_RETRYABLE_PATTERNS = [
        "400", "401", "403", "404",
        "invalid api key", "api key not valid",
        "malformed", "invalid_argument",
        "permission_denied", "unauthenticated",
        "quota_disabled", "billing not enabled",
        "model not found", "model_not_found",
        "invalid_ai_endpoint",
    ]

    def __init__(self):
        self._client = None  # Lazy init — avoids import at module load
        self._is_valid = True
        self._invalid_reason = ""

    def mark_invalid(self, classification: str, reason: str):
        self._is_valid = False
        self._invalid_reason = f"{classification}: {reason}"

    def mark_valid(self):
        self._is_valid = True
        self._invalid_reason = ""

    def _get_client(self, api_key: str):
        """
        Lazily instantiate the OpenAI-compatible client.
        Creates a fresh client per call to support key rotation cleanly.
        """
        if not getattr(self, '_is_valid', True):
            TerminalTaskError = _get_terminal_error()
            raise TerminalTaskError(f"INVALID_AI_ENDPOINT: {self._invalid_reason}")

        from openai import OpenAI

        base_url = os.getenv("QWEN_API_BASE")
        if not base_url:
            TerminalTaskError = _get_terminal_error()
            raise TerminalTaskError("INVALID_AI_ENDPOINT: QWEN_API_BASE environment variable is missing.")

        # Some self-hosted vLLM servers accept any non-empty string as API key.
        # If QWEN_API_KEY is unset or empty, fall back to 'EMPTY' which vLLM accepts.
        effective_key = api_key if api_key and api_key.strip() else "EMPTY"

        return OpenAI(
            api_key=effective_key,
            base_url=base_url,
            timeout=1800.0,  # Match former Gemini 120s timeout (increased to 1800 for self-hosted CPU/GPU Qwen)
        )

    def get_model_name(self) -> str:
        return os.getenv("QWEN_MODEL", "qwen-vl-max")

    def recheck_key_health(self, api_key: str, model_name: str) -> bool:
        """
        Test if the Qwen server is reachable with a minimal request.
        Used by APIKeyManager during key rehab after quarantine period.
        """
        try:
            client = self._get_client(api_key)
            # Send a tiny text-only request — just checks server reachability
            client.chat.completions.create(
                model=model_name,
                messages=[{"role": "user", "content": "ping"}],
                max_tokens=5,
            )
            return True
        except Exception as e:
            logger.warning(f"[QWEN_KEY_RECHECK_FAIL] key=...{api_key[-6:]} error={e}")
            return False

    def _is_terminal_error(self, error: Exception) -> bool:
        """Classify whether an error is terminal (non-retryable)."""
        err_str = str(error).lower()
        return any(pattern in err_str for pattern in self.NON_RETRYABLE_PATTERNS)

    def call_single(
        self,
        prompt_text: str,
        image_b64: Optional[str],
        mime_type: str,
        batch_images: Optional[List[dict]],
        request_data: dict,
        api_key: str,
        model_name: str,
        attempt_label: str = "Attempt 1",
    ) -> str:
        """
        Execute a single Qwen-VL extraction call.

        Supports two modes:
          1. Single-image:  image_b64 + prompt_text
          2. Batch-images:  batch_images list + prompt_text

        Returns:
            Raw model response text (JSON string).

        Raises:
            TerminalTaskError: For non-retryable errors.
            Exception:         For transient/retryable errors.
        """
        # ── TELEMETRY: PREFIX & PROMPT CACHE OBSERVABILITY ──
        import hashlib
        prefix_text = prompt_text.split("### [")[0].strip() if "### [" in prompt_text else prompt_text
        prefix_hash = hashlib.sha256(prefix_text.encode('utf-8')).hexdigest()
        prompt_hash = hashlib.sha256(prompt_text.encode('utf-8')).hexdigest()
        page_number = request_data.get('page_number') or request_data.get('page_index') or 1
        invoice_id = request_data.get('record_id') or (request_data.get('metadata') or {}).get('record_id')
        request_id = request_data.get('id') or (request_data.get('metadata') or {}).get('id') or attempt_label

        logger.info(
            f"[PREFIX_CACHE_TELEMETRY] "
            f"PREFIX_HASH={prefix_hash} "
            f"PROMPT_HASH={prompt_hash} "
            f"REQUEST_ID={request_id} "
            f"PAGE_NUMBER={page_number} "
            f"INVOICE_ID={invoice_id}"
        )

        if os.getenv('MOCK_EXTRACTION_MODE', 'false').lower() == 'true':
            import json
            time.sleep(0.1) # Simulate network delay
            mock_data = {
                "header": {
                    "vendor_name": "A M PALANISWAMY",
                    "vendor_address": "169/1C, Mill Thottam, K.Vadamadurai, Appanaickenpalayam, Coimbatore - 641017",
                    "billing_address": "13 A, Thudiyalur to Kanuvai Road",
                    "vendor_gstin": "33AFBPP3754N2Z5",
                    "vendor_state": "Tamil Nadu",
                    "place_of_supply": "33-Tamil Nadu",
                    "invoice_no": "18",
                    "invoice_date": "2026-01-05",
                    "total_amount": 9000.0,
                    "taxable_value": 7627.12,
                    "cgst": 686.44,
                    "sgst": 686.44,
                    "igst": 0.0,
                    "gst_taxability_type": "Taxable",
                    "gst_nature_of_transaction": "Intrastate",
                    "sales_order_no": "",
                    "irn": "",
                    "ack_no": "",
                    "ack_date": ""
                },
                "items": [
                    {
                        "description": "RENT FOR THE MONTH OF DECEMBER",
                        "hsn_code": "",
                        "quantity": 1.0,
                        "uom": "Month",
                        "rate": 7627.12,
                        "discount_percent": 0.0,
                        "taxable_value": 7627.12,
                        "igst_rate": 0.0,
                        "igst_amount": 0.0,
                        "cgst_rate": 9.0,
                        "cgst_amount": 686.44,
                        "sgst_rate": 9.0,
                        "sgst_amount": 686.44,
                        "cess_rate": 0.0,
                        "cess_amount": 0.0,
                        "amount": 9000.0
                    }
                ]
            }
            # Also handle token accounting for mock
            try:
                record_id = (
                    request_data.get("record_id")
                    or (request_data.get("metadata") or {}).get("record_id")
                )
                if record_id:
                    rescan_history_id = (
                        request_data.get("rescan_history_id")
                        or (request_data.get("metadata") or {}).get("rescan_history_id")
                    )
                    from ocr_pipeline.models import AIUsageAccounting
                    AIUsageAccounting.objects.create(
                        invoice_temp_ocr_id=record_id,
                        rescan_history_id=rescan_history_id,
                        prompt_tokens=800,
                        completion_tokens=250,
                        total_tokens=1050,
                        cost=0.00018,
                    )
            except Exception as acc_err:
                logger.error(f"[QWEN_USAGE_ACCOUNTING_ERR] {acc_err}")

            return json.dumps(mock_data)

        TerminalTaskError = _get_terminal_error()
        client = self._get_client(api_key)

        # ── BUILD MESSAGE CONTENT ──
        # OpenAI vision format: content is a list of typed parts
        user_content = []

        if batch_images:
            # BATCH MODE: multiple images + unified prompt
            user_content.append({"type": "text", "text": prompt_text})
            for img in batch_images:
                img_b64 = img.get("data", "")
                img_mime = img.get("mime_type", "image/jpeg")
                user_content.append({
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{img_mime};base64,{img_b64}"
                    }
                })
        elif image_b64:
            # SINGLE-IMAGE MODE: one image + prompt
            user_content = [
                {"type": "text", "text": prompt_text},
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{mime_type};base64,{image_b64}"
                    }
                }
            ]
        else:
            # TEXT-ONLY MODE: pure text (fallback)
            user_content = prompt_text

        messages = [
            {
                "role": "system",
                "content": (
                    "Expert Indian GST invoice OCR. Return ONLY valid JSON per the given schema. No markdown, no explanation."
                )
            },
            {
                "role": "user",
                "content": user_content
            }
        ]

        logger.info(
            f"[QWEN_REQUEST_START] {attempt_label} model={model_name} "
            f"mode={'batch' if batch_images else 'single'} "
            f"images={len(batch_images) if batch_images else (1 if image_b64 else 0)}"
        )

        t_start = time.time()
        try:
            response = client.chat.completions.create(
                model=model_name,
                messages=messages,
                max_tokens=4096,
                temperature=0.0,  # Deterministic extraction — no creativity needed
            )
        except Exception as e:
            latency = time.time() - t_start
            logger.error(
                f"[QWEN_API_ERROR] {attempt_label} model={model_name} "
                f"latency={latency:.2f}s error={str(e)[:200]}"
            )
            if self._is_terminal_error(e):
                raise TerminalTaskError(str(e))
            raise  # Retryable — propagate for execute_with_retry() to handle

        latency = time.time() - t_start
        logger.info(f"[QWEN_REQUEST_END] {attempt_label}")
        logger.info(f"[QWEN_DURATION] {latency:.2f}s")
        logger.info(f"[QWEN_MODEL] {model_name}")
        logger.info(
            f"[QWEN_REQUEST_COMPLETE] {attempt_label} model={model_name} "
            f"latency={latency:.2f}s"
        )

        # ── TOKEN ACCOUNTING ──
        # Maps directly to the same AIUsageAccounting table as the former Gemini provider.
        raise_gpu_error = None
        try:
            usage = response.usage
            if usage:
                from core.observability import metrics
                # Qwen pricing varies by model; use placeholder rates identical to former Gemini
                # rates until real Qwen pricing is confirmed. Update these constants as needed.
                cost = (
                    (usage.prompt_tokens * 0.10 / 1_000_000)
                    + (usage.completion_tokens * 0.40 / 1_000_000)
                )
                metrics.increment_counter("ai:tokens", usage.total_tokens)
                metrics.record_latency("ai:cost", cost)

                record_id = (
                    request_data.get("record_id")
                    or (request_data.get("metadata") or {}).get("record_id")
                )
                if record_id:
                    rescan_history_id = (
                        request_data.get("rescan_history_id")
                        or (request_data.get("metadata") or {}).get("rescan_history_id")
                    )
                    from ocr_pipeline.models import AIUsageAccounting
                    AIUsageAccounting.objects.create(
                        invoice_temp_ocr_id=record_id,
                        rescan_history_id=rescan_history_id,
                        prompt_tokens=usage.prompt_tokens,
                        completion_tokens=usage.completion_tokens,
                        total_tokens=usage.total_tokens,
                        cost=cost,
                    )

                # ── TASK 6: INFERENCE PERFORMANCE METRICS & GPU ENFORCEMENT ────────
                # Thresholds are calibrated for multi-image vision inference on RTX 4050.
                # Vision tasks produce 5-20 tok/s on GPU vs <3 tok/s on CPU for this model.
                # The previous ≥15 threshold was text-only and caused false CPU_ONLY reports.
                tokens_per_second = usage.completion_tokens / max(latency, 0.001)
                image_count = (
                    len(batch_images) if batch_images else (1 if image_b64 else 0)
                )
                image_size_b64_bytes = len(image_b64) if image_b64 else (
                    sum(len(img.get("data", "")) for img in (batch_images or []))
                )

                # ── [QWEN_GPU_STATUS] TELEMETRY ──────────────────────────────────────
                # Emit standardised GPU status log and derive compute_mode.
                # Also queries nvidia-smi for real-time VRAM snapshot.
                try:
                    from core.gpu_validator import emit_gpu_status, enforce_gpu_compute, query_nvidia_smi
                    smi = query_nvidia_smi() or {}
                    compute_mode = emit_gpu_status(
                        attempt_label=attempt_label,
                        model_name=model_name,
                        latency_s=latency,
                        tokens_per_second=tokens_per_second,
                        inference_time_s=latency,
                        vram_used_mib=smi.get("vram_used_mib", 0.0),
                        vram_total_mib=smi.get("vram_total_mib", 0.0),
                        gpu_name=smi.get("gpu_name", "unknown"),
                        gpu_layers="all",      # Ollama offloads all layers when VRAM allows
                        total_layers="all",
                    )
                except Exception as _gpu_telemetry_err:
                    logger.warning(f"[QWEN_GPU_STATUS_ERR] {_gpu_telemetry_err}")
                    # Fallback classification — vision-adjusted thresholds
                    from core.gpu_validator import GPU_MIN_TOKENS_PER_SECOND
                    compute_mode = "GPU_ONLY" if tokens_per_second >= GPU_MIN_TOKENS_PER_SECOND else "CPU_ONLY"

                logger.info(
                    f"[QWEN_INFERENCE_PERF] {attempt_label} "
                    f"model={model_name} "
                    f"latency_s={latency:.2f} "
                    f"prompt_tokens={usage.prompt_tokens} "
                    f"completion_tokens={usage.completion_tokens} "
                    f"total_tokens={usage.total_tokens} "
                    f"tokens_per_second={tokens_per_second:.2f} "
                    f"image_count={image_count} "
                    f"image_size_b64_bytes={image_size_b64_bytes} "
                    f"response_length={len(response.choices[0].message.content or '')} "
                    f"finish_reason={response.choices[0].finish_reason} "
                    f"compute_mode={compute_mode}"
                )

                # ── GPU-ONLY PRODUCTION GUARD ────────────────────────────────────────
                # If compute mode is CPU, abort the request immediately.
                # This makes silent CPU fallback IMPOSSIBLE in production.
                if compute_mode == "CPU_ONLY":
                    logger.critical(
                        f"[GPU_GUARD_ABORT] {attempt_label} compute_mode=CPU_ONLY detected. "
                        f"tokens_per_second={tokens_per_second:.2f}. Aborting request."
                    )
                    try:
                        from core.gpu_validator import enforce_gpu_compute
                        enforce_gpu_compute(tokens_per_second, attempt_label)
                    except RuntimeError as e:
                        raise_gpu_error = e
                        raise
                # ───────────────────────────────────────────────────────────────────

        except Exception as acc_err:
            if isinstance(acc_err, RuntimeError) and raise_gpu_error is not None:
                logger.error(f"[QWEN_USAGE_ACCOUNTING_ERR] Propagating GPU Guard Failure: {acc_err}")
            else:
                logger.error(f"[QWEN_USAGE_ACCOUNTING_ERR] {acc_err}")

        if raise_gpu_error is not None:
            raise raise_gpu_error

        # ── EXTRACT RESPONSE TEXT ──
        raw_text = response.choices[0].message.content or ""
        logger.info(
            f"[QWEN_RESPONSE_RECEIVED] {attempt_label} length={len(raw_text)} "
            f"finish_reason={response.choices[0].finish_reason}"
        )

        return raw_text



def check_endpoint_health(api_base: str, api_key: str = None) -> dict:
    """
    Performs GET requests to verify if the Qwen provider endpoint is valid.
    Checks <QWEN_API_BASE>/models and <QWEN_API_BASE>/v1/models.
    Detects HTML/Apache/nginx and classifies as INVALID_AI_ENDPOINT.
    """
    import requests
    import time

    if not api_base:
        return {
            'valid': False,
            'classification': 'INVALID_AI_ENDPOINT',
            'error_msg': 'QWEN_API_BASE environment variable is empty or not set.',
            'latency_ms': 0.0,
            'endpoint_used': ''
        }

    api_base = api_base.strip()
    urls_to_try = []
    
    # Try api_base/models
    url1 = api_base.rstrip('/') + '/models'
    urls_to_try.append(url1)
    
    # If /v1 is not in the base URL, try suffixing it
    if '/v1' not in api_base.lower():
        url2 = api_base.rstrip('/') + '/v1/models'
        urls_to_try.append(url2)

    headers = {}
    if api_key and api_key != 'EMPTY':
        headers['Authorization'] = f"Bearer {api_key}"

    last_err = None
    for url in urls_to_try:
        t0 = time.time()
        try:
            response = requests.get(url, headers=headers, timeout=5.0)
            latency = (time.time() - t0) * 1000.0
            
            content_type = response.headers.get('Content-Type', '').lower()
            server_header = response.headers.get('Server', '').lower()
            body_text = response.text or ''
            
            # Detect HTML/Apache/nginx responses
            is_html = 'text/html' in content_type or '<html' in body_text.lower() or '<!doctype html' in body_text.lower()
            is_apache_or_nginx = (
                'apache' in server_header or 
                'nginx' in server_header or 
                'apache' in body_text.lower() or 
                'nginx' in body_text.lower()
            )
            
            if is_html or is_apache_or_nginx:
                return {
                    'valid': False,
                    'classification': 'INVALID_AI_ENDPOINT',
                    'error_msg': f"Endpoint returned HTML/web server page (Apache/nginx). HTTP Status: {response.status_code}",
                    'latency_ms': latency,
                    'endpoint_used': url
                }
            
            # OpenAI /models response must be JSON. If it doesn't look like JSON, classify as INVALID_AI_ENDPOINT
            if 'application/json' not in content_type and not body_text.strip().startswith('{') and not body_text.strip().startswith('['):
                return {
                    'valid': False,
                    'classification': 'INVALID_AI_ENDPOINT',
                    'error_msg': f"Endpoint did not return JSON. Content-Type: {content_type}",
                    'latency_ms': latency,
                    'endpoint_used': url
                }
            
            if response.status_code in [200, 201, 401, 403]:
                return {
                    'valid': True,
                    'classification': 'OK',
                    'error_msg': '',
                    'latency_ms': latency,
                    'endpoint_used': url
                }
            
            if response.status_code == 404:
                last_err = f"HTTP 404 (JSON error) for {url}"
                continue
                
            return {
                'valid': False,
                'classification': 'GENERIC_AI_FAILURE',
                'error_msg': f"Endpoint returned status code {response.status_code}: {body_text[:200]}",
                'latency_ms': latency,
                'endpoint_used': url
            }
            
        except requests.exceptions.RequestException as req_err:
            latency = (time.time() - t0) * 1000.0
            last_err = f"RequestException: {req_err}"
            continue

    classification = 'INVALID_AI_ENDPOINT' if last_err and '404' in str(last_err) else 'CONNECTION_FAILURE'
    return {
        'valid': False,
        'classification': classification,
        'error_msg': last_err or "All endpoint URLs failed healthcheck",
        'latency_ms': 0.0,
        'endpoint_used': urls_to_try[0]
    }
