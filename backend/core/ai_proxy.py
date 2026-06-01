import os
import json
import re
import base64
import time
import hashlib
import logging
import threading
import queue
from typing import Dict, Any, Optional
from django.db import models
from django.core.cache import cache
from django.conf import settings
from google.api_core import exceptions
from google import genai
from google.genai import types
from dotenv import load_dotenv

# Ensure environment variables are loaded (especially for GEMINI_API_KEY)
load_dotenv(override=True)

logger = logging.getLogger(__name__)

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
            
    # 2. Brace-based boundary detection (if it's not already just a JSON string)
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
    repaired = text.replace('“', '"').replace('”', '"').replace('‘', "'").replace('’', "'")
    repaired = re.sub(r",\s*([\]}])", r"\1", repaired)
    brace_diff = repaired.count('{') - repaired.count('}')
    if brace_diff > 0: repaired += ('}' * brace_diff)
    bracket_diff = repaired.count('[') - repaired.count(']')
    if bracket_diff > 0: repaired += (']' * bracket_diff)
    return repaired

class APIKeyManager:
    """Rotates through multiple Gemini API keys and tracks health"""

    def __init__(self):
        self.api_keys = []
        self.unhealthy_keys = set()
        self.rotation_counter = 0
        self.recheck_interval = 600
        self._sync_keys()

    def _sync_keys(self):
        raw_keys = os.getenv('GEMINI_API_KEY', '')
        if not raw_keys:
            self.api_keys = []
            return
        self.api_keys = [k.strip() for k in raw_keys.split(',') if k.strip()]

    def get_healthy_key(self) -> Optional[str]:
        self._sync_keys()
        if not self.api_keys: return None
        healthy_keys = [k for k in self.api_keys if k not in self.unhealthy_keys]
        keys_to_use = healthy_keys if healthy_keys else self.api_keys
        if healthy_keys:
            self.rotation_counter += 1
            return healthy_keys[self.rotation_counter % len(healthy_keys)]
        return keys_to_use[0] if keys_to_use else None

    def mark_key_unhealthy(self, api_key: str):
        self.unhealthy_keys.add(api_key)
        threading.Timer(self.recheck_interval, lambda: self._recheck_key(api_key)).start()

    def _recheck_key(self, api_key: str):
        client = genai.Client(api_key=api_key)
        try:
            client.models.generate_content(model='gemini-2.0-flash', contents="test")
            self.unhealthy_keys.discard(api_key)
        except Exception:
            pass

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

class RateLimiter:
    def check_rate_limit(self, key: str, limit: int = None, window: float = 1.0) -> Dict[str, Any]:
        return {'allowed': True, 'retry_after': 0}

class DistributedConcurrencyManager:
    """
    Redis-backed atomic semaphore for distributed concurrency governance.
    Replaces brittle DB locks with auto-expiring lease tokens to prevent permit leaks.
    """
    def __init__(self, max_concurrent=20):
        self.global_max = max_concurrent
        # Lua script for atomic acquire and expiration cleanup
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
        expiration = now + 120 # 2 minute max lease (Gemini timeout is usually 60-90s)
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

# Global instances
api_key_manager = APIKeyManager()
circuit_breaker = CircuitBreaker()
rate_limiter = RateLimiter()
concurrency_governor = DistributedConcurrencyManager(max_concurrent=int(os.getenv('AI_GLOBAL_CONCURRENCY', '25')))

def validate_ai_on_startup() -> bool:
    api_key_manager._sync_keys()
    return bool(api_key_manager.api_keys)

def process_ai_request(request_data: dict) -> dict:
    from core.observability import observability, metrics
    
    # ── [PHASE 10: TENANT CONTEXT RESOLUTION] ──
    tenant_id = request_data.get('tenant_id') or request_data.get('metadata', {}).get('tenant_id')
    
    if not tenant_id or not isinstance(tenant_id, str) or tenant_id == 'None':
        logger.error(f"[TENANT_CONTEXT_INVALID] task_id={request_data.get('id')} payload={json.dumps(request_data)[:200]}")
        return {'error': 'Invalid or missing tenant_id', 'code': 'INVALID_TENANT_CONTEXT'}
    
    logger.info(f"[TENANT_CONTEXT_RESOLVED] tenant_id={tenant_id}")

    # ── [PHASE 9: OVERLOAD SHEDDING] ──
    from core.sqs import queue_service
    import uuid
    q_depth = queue_service.get_queue_depth('ai')
    if q_depth > 5000:
        # Extreme pressure: shed 50% of new requests to protect health
        if random.random() < 0.5:
            logger.critical(f"[OVERLOAD_SHEDDING] Q_DEPTH={q_depth}. Dropping request for {tenant_id}")
            raise ProviderSaturatedError('AI service is under extreme load.')

    permit_id = request_data.get('id', str(uuid.uuid4()))
    if not concurrency_governor.acquire_permit(permit_id, tenant_id):
        observability.ai_metric(event="TENANT_THROTTLED", tenant_id=tenant_id)
        metrics.increment_counter("ai:throttled", tags={"tenant": tenant_id})
        logger.warning(f"[QUEUE_MESSAGE_DEADLOCK] [AI_METRIC] TENANT_THROTTLED tenant_id={tenant_id} - AI system is at capacity.")
        raise ProviderSaturatedError('AI system is at capacity.')

    try:
        if os.getenv('MOCK_EXTRACTION_MODE', 'false').lower() == 'true':
            # Bypass quota and circuit breaker for mock mode
            import random
            # Simulate slight processing delay (50-200ms)
            time.sleep(random.uniform(0.05, 0.2))
            
            # We need a valid-looking JSON for the downstream normalization
            # Using a minimal but compliant structure
            mock_reply = {
                "invoice_no": f"MOCK-{random.randint(1000, 9999)}",
                "invoice_date": "2024-05-15",
                "vendor_name": "Mock Stress Corp",
                "total_amount": 1234.56,
                "currency": "INR",
                "items": [{"description": "Mock Item", "quantity": 1, "rate": 1234.56, "amount": 1234.56}]
            }
            return {'reply': json.dumps(mock_reply)}

        if circuit_breaker.is_open(): return {'error': 'AI service temporarily unavailable.', 'code': 'CIRCUIT_BREAKER'}
        api_key = api_key_manager.get_healthy_key()
        if not api_key: return {'error': 'No API keys found.'}

        if request_data.get('type') == 'agent':
            prompt = f"You are an expert accounting AI Agent... User query: {request_data['message']}"
        else:
            prompt_text = request_data.get('prompt', 'Extract data')
            if 'batch_images' in request_data:
                # PHASE 9: MULTI-IMAGE BATCHING
                prompt = [prompt_text]
                for img in request_data['batch_images']:
                    prompt.append({
                        'inline_data': {
                            'mime_type': img.get('mime_type', 'image/jpeg'), 
                            'data': base64.b64decode(img['data'])
                        }
                    })
            elif 'image_data' in request_data:
                prompt = [prompt_text, {'inline_data': {'mime_type': request_data.get('mime_type', 'image/jpeg'), 'data': base64.b64decode(request_data['image_data'])}}]
            else:
                prompt = prompt_text

        t_ai_start = time.time()
        observability.ai_metric(event="PARALLEL_AI_EXECUTION", tenant_id=tenant_id, status="START")
        response_text = execute_with_retry(prompt, request_data, api_key)
        ai_latency = time.time() - t_ai_start
        observability.ai_metric(event="PARALLEL_AI_EXECUTION", tenant_id=tenant_id, status="COMPLETE", latency_s=round(ai_latency, 3))
        
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


def _call_gemini_single(prompt: Any, request_data: dict, api_key: str, model_name: str, attempt_label: str, public_ip: str) -> str:
    # [PHASE 11.9: TIMEOUT ENFORCEMENT]
    # Set a 120s timeout to prevent thread leakage.
    client = genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=120000))
    response = client.models.generate_content(model=model_name, contents=prompt)
    
    # Economics Tracking (Log-only)
    try:
        usage = response.usage_metadata
        if usage:
            from core.observability import metrics
            cost = (usage.prompt_token_count * 0.10 / 1_000_000) + (usage.candidates_token_count * 0.40 / 1_000_000)
            metrics.increment_counter("ai:tokens", usage.total_token_count)
            metrics.record_latency("ai:cost", cost)
    except: pass

    return response.text

class TerminalTaskError(Exception):
    """Raised for non-retryable AI orchestration errors (Phase 4)."""
    pass

class ProviderSaturatedError(Exception):
    """Raised when the AI provider or local concurrency limits are saturated."""
    pass

def execute_with_retry(prompt: Any, request_data: dict, api_key: str) -> str:
    """
    Production-grade retry logic with exponential backoff and jitter.
    Specifically targets Phase 8 requirement: Gemini Retry Storm protection.
    STRICT RETRY RULE (Phase 4):
    - Do NOT retry: auth failures, IP restriction, invalid API keys, quota-disabled, malformed requests.
    - Retry ONLY: transient network failures, rate limits, 5xx provider failures.
    """
    import random
    MAX_ATTEMPTS = 5
    base_delay = 1
    
    # [PHASE 3: MULTI-PROVIDER FALLBACK ROUTING]
    fallback_models = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro']
    current_model_idx = 0
    
    last_error = None
    attempt = 0
    
    while attempt < MAX_ATTEMPTS:
        current_model = fallback_models[current_model_idx]
        try:
            return _call_gemini_single(prompt, request_data, api_key, current_model, f"Attempt {attempt+1}", "local")
        except Exception as e:
            last_error = e
            err_str = str(e).lower()
            
            # Non-retryable errors (Terminal Auth, IP, Quota Disabled, Malformed)
            terminal_keywords = [
                "invalid_argument", "permission_denied", "unauthenticated", 
                "invalid api key", "api key not valid", "quota_disabled",
                "billing not enabled", "ip space", "malformed"
            ]
            
            if any(k in err_str for k in terminal_keywords):
                logger.error(f"[AI_TERMINAL_ERROR] {e} - Matching keyword: {next((k for k in terminal_keywords if k in err_str), 'unknown')}")
                raise TerminalTaskError(str(e))
            
            # Retryable errors (429 Rate Limits, 5xx, timeouts)
            if '429' in err_str or 'too many requests' in err_str or 'capacity' in err_str:
                # [PHASE 3 FAILOVER] Try the next provider model instead of failing immediately
                if current_model_idx < len(fallback_models) - 1:
                    current_model_idx += 1
                    next_model = fallback_models[current_model_idx]
                    logger.warning(f"[PROVIDER_FAILOVER] {current_model} saturated (429). Failing over to {next_model}.")
                    from core.observability import observability
                    observability.ai_metric(event="AI_PROVIDER_FAILOVER", from_model=current_model, to_model=next_model)
                    continue # Try next model immediately without sleeping
                else:
                    logger.warning(f"[PROVIDER_SATURATED_EXHAUSTED] All fallback models saturated. Raising ProviderSaturatedError.")
                    raise ProviderSaturatedError(str(e))
                
            # Default fallback for unhandled exceptions is to assume transient network issue
            if attempt < MAX_ATTEMPTS - 1:
                delay = (base_delay * (2 ** attempt)) + (random.random() * 0.5)
                logger.warning(f"[AI_RETRY] {current_model} Attempt {attempt+1} failed: {e}. Retrying in {delay:.2f}s...")
                from core.observability import observability
                observability.ai_metric(event="AI_RETRY", attempt=attempt+1, error=str(e)[:100])
                time.sleep(delay)
                attempt += 1
            else:
                logger.error(f"[AI_EXHAUSTED] All {MAX_ATTEMPTS} attempts failed on {current_model}: {e}")
                from core.observability import observability
                observability.ai_metric(event="AI_EXHAUSTED", error=str(e)[:100])
                raise e
    
    raise last_error

class AIServiceProxy:
    def make_request(self, request_type: str, request_data: dict, user_id: str, tenant_id: str = None, metadata: dict = None, delay_seconds: int = 0) -> dict:
        request_data.update({'type': request_type, 'user_id': user_id, 'tenant_id': tenant_id or 'anonymous'})
        if metadata:
            request_data['metadata'] = metadata
            
        # Check if we should offload to SQS
        wait_for_result = request_data.get('wait_for_result', True)
        
        if not wait_for_result:
            # [PHASE 5E] ASYNC OFFLOADING
            from vouchers.message_factory import message_factory
            
            # Note: request_data here is the payload
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
                    raise RuntimeError(f"[SQS_PUSH_FAILED] push() returned False for msg_id={msg_copy['id']} record={record_id}")
                
                # Mark as successfully enqueued in Redis to prevent enqueue_fail execution
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
                            orchestrator.redis.set(f"assembly:{rec_id_str}:page:{p_num}:enqueued", "true", ex=86400)
                            orchestrator.redis.sadd(f"assembly:{rec_id_str}:enqueued_success_pages", p_num)
                        orchestrator.redis.expire(f"assembly:{rec_id_str}:enqueued_success_pages", 86400)
                
                logger.info(f"[QUEUE_FORWARD_SUCCESS] target_queue=ai msg_id={msg_copy['id']} record={record_id} job={job_id}")
            except Exception as e:
                logger.error(f"[QUEUE_FORWARD_FAILURE] target_queue=ai error={e}")
                raise
            logger.info(f"[AI_TASK_EMITTED] id={msg['id']} corr={msg['correlation_id']} session={session_id}")
            return {'status': 'queued', 'message': 'Task enqueued to AI specialized worker.'}

        return process_ai_request(request_data)

ai_service = AIServiceProxy()
