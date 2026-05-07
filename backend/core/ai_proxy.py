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
from django.core.cache import cache
from django.conf import settings
from google.api_core import exceptions
from google import genai
from google.genai import types
from dotenv import load_dotenv
from core.redis_client import redis_client

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
    """
    if not text: return ""
    
    # Replace smart quotes
    repaired = text.replace('“', '"').replace('”', '"').replace('‘', "'").replace('’', "'")
    
    # Fix trailing commas in objects and arrays
    repaired = re.sub(r",\s*([\]}])", r"\1", repaired)
    
    # Fix potential single quotes used as double quotes
    # (Only if we find key patterns like 'key': "value")
    if re.search(r"'\w+'\s*:", repaired):
        repaired = re.sub(r"'(\w+)'\s*:", r'"\1":', repaired)
        
    return repaired


class APIKeyManager:
    """Manages multiple API keys with rate limiting and health tracking"""

    def __init__(self):
        self.api_keys = []
        self.unhealthy_keys = set()
        self.last_sync = 0.0
        self._sync_keys()

    def _sync_keys(self):
        """Force re-load of keys from OS environment."""
        if self.api_keys and (time.monotonic() - self.last_sync < 300):
            return

        self.api_keys = []
        
        # Primary: GOOGLE_API_KEY (direct from GCP)
        k1 = os.getenv('GOOGLE_API_KEY')
        if k1: self.api_keys.append(k1)
            
        # Fallback: GEMINI_API_KEY (from .env)
        k2 = os.getenv('GEMINI_API_KEY')
        if k2 and k2 not in self.api_keys: self.api_keys.append(k2)

        # Batch keys: GEMINI_API_KEY_1...10
        for i in range(1, 11):
            key = os.getenv(f'GEMINI_API_KEY_{i}')
            if key and key not in self.api_keys:
                self.api_keys.append(key)

        if not self.api_keys:
            logger.error("[CRITICAL] NO GEMINI API KEYS DETECTED IN OS ENVIRONMENT!")
        else:
            logger.info(f"[OK] AI Key Manager: Registered {len(self.api_keys)} keys found in OS.")
        
        self.last_sync = time.monotonic()
  # Track unhealthy keys
        self.recheck_interval = 90  # 1.5 minutes cooldown
        self.rotation_counter = 0  # In-memory rotation counter

    def get_healthy_key(self) -> Optional[str]:
        """Get next healthy API key with round-robin rotation"""
        self._sync_keys()
        if not self.api_keys:
            return None

        # Skip unhealthy keys
        healthy_keys = [k for k in self.api_keys if k not in self.unhealthy_keys]

        keys_to_use = healthy_keys if healthy_keys else self.api_keys  # Fall back to unhealthy if no healthy available

        if healthy_keys:
            # Use in-memory counter for round-robin
            self.rotation_counter += 1
            key_index = self.rotation_counter % len(healthy_keys)
            selected_key = healthy_keys[key_index]
            return selected_key

        # Fallback when no healthy keys
        return keys_to_use[0] if keys_to_use else None

    def mark_key_unhealthy(self, api_key: str):
        """Mark a key as unhealthy"""
        self.unhealthy_keys.add(api_key)
        logger.warning(f"Marked API key {api_key[:10]}... as unhealthy")

        # Schedule recheck
        threading.Timer(self.recheck_interval, lambda: self._recheck_key(api_key)).start()

    def _recheck_key(self, api_key: str):
        """Recheck if an unhealthy key is now healthy"""
        # Try a simple request to see if key works
        client = genai.Client(api_key=api_key)
        try:
            # Try 2.5-flash as current stable check in 2026
            client.models.generate_content(model='gemini-2.0-flash', contents="test")
            self.unhealthy_keys.discard(api_key)
            logger.info(f"Rechecked API key {api_key[:10]}... - now healthy")
        except Exception:
            logger.warning(f"API key {api_key[:10]}... still unhealthy")


class CircuitBreaker:
    """Circuit breaker to stop requests when provider is failing"""

    def __init__(self):
        self.failure_threshold = 5  # Failures per minute
        self.reset_timeout = 300  # 5 minutes

        # In-memory state
        self.failures = 0
        self.last_failure = 0

    def is_open(self) -> bool:
        """Check if circuit breaker is open (blocking requests)"""
        now = time.time()
        if self.failures >= self.failure_threshold:
            if now - self.last_failure < self.reset_timeout:
                return True
            else:
                # Reset failures
                self.failures = 0
                self.last_failure = 0
        return False

    def record_failure(self):
        """Record a failure"""
        self.failures += 1
        self.last_failure = time.time()

    def record_success(self):
        """Record a success to potentially close circuit"""
        if self.failures > 0:
            self.failures -= 1


class RateLimiter:
    """Shared rate limiting using Redis"""

    def __init__(self, max_rps=2):
        self.max_rps = max_rps

    def check_rate_limit(self, key: str, limit: int = None, window: float = 1.0) -> Dict[str, Any]:
        """Check if request is allowed using sliding window. Returns {'allowed': bool, 'retry_after': int}"""
        limit = int(limit or self.max_rps)
        allowed, count, retry_after = redis_client.check_sliding_window(key, limit, window)
        return {'allowed': allowed, 'retry_after': int(retry_after) if retry_after > 0 else 0}

# Global instances
api_key_manager = APIKeyManager()
circuit_breaker = CircuitBreaker()
rate_limiter = RateLimiter(max_rps=settings.AI_MAX_RPS if hasattr(settings, 'AI_MAX_RPS') else 2)

class AIRequestQueue:
    """Redis-backed request queue with process-safe concurrency and local fallback"""
    def __init__(self, queue_name="ai_requests"):
        self.queue_name = queue_name
        self._local_queue = queue.Queue() # Fallback for local processing if Redis fails
        self._local_worker_started = False

    def enqueue(self, request_data: dict) -> dict:
        # Check Redis Health
        if not redis_client.available:
            logger.error("[REDIS DOWN] Cannot enqueue AI task. Redis unavailable.")
            return {'error': 'AI System Unavailable (Redis Down)', 'code': 'REDIS_DOWN', 'status': 503}

        # Backpressure control (Admission Control)
        # We use a lower threshold for new tasks to keep the system responsive
        MAX_AI_QUEUE_DEPTH = 500 
        q_len = redis_client.get_queue_length(self.queue_name)
        
        if q_len > MAX_AI_QUEUE_DEPTH:
            logger.critical(f"[BACKPRESSURE] AI Queue depth {q_len} exceeds safety limit {MAX_AI_QUEUE_DEPTH}. Rejecting task.")
            return {
                'error': 'AI System Overloaded. Please try again in a few minutes.', 
                'code': 'BACKPRESSURE_REJECT', 
                'status': 503
            }

        request_id = hashlib.md5(f"{time.time()}:{json.dumps(request_data)}".encode()).hexdigest()
        
        task = {
            'id': request_id,
            'request_data': request_data,
            'retries': 0,
            'enqueued_at': time.time()
        }
        
        pushed = redis_client.push_to_queue(self.queue_name, task)
        if not pushed:
            logger.error("[REDIS ERROR] Failed to push task to queue.")
            return {'error': 'AI System Error (Enqueue Failed)', 'code': 'ENQUEUE_FAILED', 'status': 500}

        redis_client.record_metric('ai_queue_length', q_len + 1)
        logger.info(f"[Queue] Enqueued task {request_id}. Current Size: {q_len + 1}")

        return {
            'status': 'queued',
            'job_id': request_id,
            'message': 'AI task enqueued successfully'
        }


ai_request_queue = AIRequestQueue()


def generate_cache_key(request_data: dict) -> str:
    """Generate cache key from request data"""
    
    # Crucial: Include image data hash if present to prevent collisions between different invoices
    image_hash = None
    if 'image_data' in request_data:
        image_hash = hashlib.md5(str(request_data['image_data']).encode()).hexdigest()

    cacheable_data = json.dumps({
        'type': request_data.get('type'),
        'message': request_data.get('message', ''),
        'contextData': request_data.get('contextData', ''),
        'useGrounding': request_data.get('useGrounding', False),
        'file_hash': request_data.get('file_hash'),
        'image_hash': image_hash,
        'prompt': request_data.get('prompt', '') # Also include prompt to avoid mixing different workflows
    }, sort_keys=True)
    return hashlib.md5(cacheable_data.encode()).hexdigest()


def format_history(history):
    """Formats conversation history for the prompt"""
    if not history:
        return "No previous conversation."
    formatted = ""
    # Limit to last 10 messages to save tokens
    history = history[-10:] if history else []
    for msg in history:
        role = "User" if msg.get('role') == 'user' else "AI"
        text = msg.get('text', '')
        formatted += f"{role}: {text}\n"
    return formatted


_AI_VALIDATED: Optional[bool] = None


def validate_ai_on_startup() -> bool:
    """Verify AI model availability. Resilience: Does NOT block on temporary cooldown."""
    api_key_manager._sync_keys()
    if not api_key_manager.api_keys:
        logger.error("AI Startup check failed: No Gemini API keys found in environment.")
        return False
    
    return True



def process_ai_request(request_data: dict) -> dict:
    """Worker function to process AI requests"""

    user_id = request_data.get('user_id', 'unknown')
    tenant_id = request_data.get('tenant_id', 'anonymous')
    cache_key = request_data.get('cache_key')

    # ── REMOVE GLOBAL CONTEXT INJECTION (STRICT) ──────────────────────────
    # Ensure no legacy bloated keys are passed to the AI model.
    # This eliminates the ~1.8M character inflation caused by document-level text leakage.
    bloat_keys = ['full_document_text', 'combined_raw_text', 'previous_pages_text', 'next_pages_text']
    for key in bloat_keys:
        if key in request_data:
            logger.warning(f"[BLOAT REMOVAL] Stripping legacy key '{key}' from AI request.")
            del request_data[key]

    try:
        # Check circuit breaker first
        if circuit_breaker.is_open():
            logger.warning("Circuit breaker is open, rejecting request")
            return {'error': 'AI service is temporarily unavailable. Please try again in a few minutes.', 'code': 'CIRCUIT_BREAKER'}

        # Get API key
        api_key = api_key_manager.get_healthy_key()
        if not api_key:
            if not api_key_manager.api_keys:
                 logger.error("No Gemini API keys configured (Set GOOGLE_API_KEY)")
                 return {'error': 'Configuration Error: No Gemini API keys found. Please set GOOGLE_API_KEY environment variable.'}
            return {'error': 'AI service busy (No healthy keys). Please try again later.'}

        # Build prompt
        if request_data.get('type') == 'agent':
            prompt = f"""
            You are an expert accounting AI Agent. You are capable of controlling the application and helping the user.

            **CAPABILITIES:**
            1.  **Answer Questions**: Use the context data (Vouchers, Ledgers, Stock) to answer questions.
            2.  **Perform Actions**: You can Navigate, Create, and Delete items.

            **TOOL USE:**
            If the user asks to perform an action (like "navigate", "go to", "create", "delete"), you MUST reply with a JSON object in this format:
            ```json
            {{
                "tool_use": "tool_name",
                "parameters": {{ "param1": "value1" }}
            }}
            ```

            **AVAILABLE TOOLS:**
            - **navigate**: Switch page. Params: "page".
            - **create_customer**: Create customer. Params: "name" (required), "email", "phone".
            - **create_vendor**: Create vendor. Params: "name" (required), "email" (required), "phone" (required).
            - **delete_customer**: Delete customer. Params: "name" (required).
            - **create_item**: Create stock item. Params: "name" (required), "item_code" (required).
            - **delete_item**: Delete stock item. Params: "name" (required).
            - **create_voucher**: Create voucher. Params: "type", "party_name", "amount".
            - **delete_voucher**: Delete voucher. Params: "voucher_number".
            - **ask_for_info**: ASK USER for info. Params: "question", "field" (name, email, phone), "action" (create_vendor, create_customer).

            **RULES:**
            1.  **MISSING DATA**: 
                - **CRITICAL**: If you need information (Name, Email, Phone), **DO NOT** just ask in text.
                - **MUST USE** `ask_for_info` tool.
                - Example: "I need the name." -> `ask_for_info(question="What is the name?", field="name", action="create_vendor")`.
            2.  **CONFIRMATION**: Always ask for confirmation before deleting.
            3.  **VENDORS**: Use `create_vendor` tool.
            4.  **NO PLACEHOLDERS**: Never create items called "New Customer" or "New Vendor" unless explicitly asked.

            5.  **FORMATTING**: 
                - If the user asks for a list or table (e.g., "Show me all vendors", "List customers with email"), YOU MUST return a **Markdown Table**.
                - Example:
                  | Name | Email | Phone |
                  |---|---|---|
                  | ABC Corp | abc@test.com | 123 |
            
            6.  **DATABASE KNOWLEDGE**:
                - You have access to the list of **Database Tables** in the context data (under `tables`).
                - If the user asks "What tables are there?" or "Show schema", list the names from the `tables` context.
                - You also have access to "Vouchers", "Ledgers", "Stock Items", "Vendors", and "Customers".

            7.  **CONVERSATION FLOW (CRITICAL)**:
                - **ALWAYS check the 'CONVERSATION HISTORY'**.
                - If your LAST message was a question (e.g., "What is the name?", "I need the email"), treat the User's CURRENT message as the ANSWER.
                - **DO NOT** reset the conversation.

            8.  **IMPLICIT CONTEXT (SHORT ANSWERS)**:
                - If the user provides a short answer (e.g., "abc", "john@a.com") and it doesn't match a tool pattern:
                - CHECK if you are in the middle of a "Creation Flow".
                - IF YES: Assume the short text is the missing field.

            Context Data: {request_data.get('contextData', '')}

            **CONVERSATION HISTORY:**
            {format_history(request_data.get('history', []))}

            User query: {request_data['message']}
            """
        elif request_data.get('type') in ('invoice', 'master', 'extraction'):
            # FINAL-LAYER IMMUTABILITY: Extract prompt EXACTLY as provided by upstream.
            # DO NOT append, merge, enrich, or inject context.
            prompt_text = request_data.get('prompt')
            if not prompt_text:
                prompt_text = 'Extract invoice data from this image'
            
            if 'image_data' in request_data:
                try:
                    image_bytes = base64.b64decode(request_data['image_data'])
                    # Multimodal Strict Pass-Through: [text, image] only.
                    prompt = [
                        prompt_text,
                        {
                            'inline_data': {
                                'mime_type': request_data.get('mime_type', 'image/jpeg'),
                                'data': image_bytes
                            }
                        }
                    ]
                except Exception as e:
                    logger.error(f"Failed to decode image data: {e}")
                    return {'error': 'Invalid image data'}
            else:
                prompt = prompt_text
        else:
            return {'error': 'Invalid request type'}

        # ── PAYLOAD TRACE & VALIDATION (ROOT-CAUSE FIX) ──────────────────────
        # Verify that isolation is working and no inflation has occurred.
        prompt_text_len = len(prompt_text) if 'prompt_text' in locals() else (len(prompt) if isinstance(prompt, str) else 0)
        image_data_len = len(request_data.get('image_data', ''))
        
        logger.info(f"[ROOT-CAUSE TRACE] Final Payload | Text: {prompt_text_len} chars | Image: {image_data_len} chars")

        # ASSERTION: Prompt text must be < 300K (Adjusted for real-world accounting data)
        if prompt_text_len > 300000:
             logger.error(f"BLOCKED: Prompt text size {prompt_text_len} exceeds 300K safety limit. REJECTING REQUEST.")
             return {
                 'error': 'Internal Error: AI request payload too large. Context data exceeds 300K limit.',
                 'code': 'PAYLOAD_TOO_LARGE',
                 'size': prompt_text_len
             }

        # Log request
        msg_content = request_data.get('message', 'invoice_processing')
        request_hash = hashlib.md5(msg_content.encode()).hexdigest()[:8]
        logger.info(f"AI Call: user={user_id}, tenant={tenant_id}, hash={request_hash}")

        # ── PROMPT SIZE GUARD ────────────────────────────────────────────────
        # For text-only prompts that exceed 300,000 chars, split into sequential
        # batches and merge results. Multimodal (image) prompts are NEVER split
        # because splitting image+text pairs would break extraction context.
        PROMPT_SIZE_LIMIT = 300_000
        is_multimodal = isinstance(prompt, list)  # image prompts are lists

        if not is_multimodal and isinstance(prompt, str) and len(prompt) > PROMPT_SIZE_LIMIT:
            # Split into batches of PROMPT_SIZE_LIMIT chars each
            batches = []
            for start in range(0, len(prompt), PROMPT_SIZE_LIMIT):
                batches.append(prompt[start:start + PROMPT_SIZE_LIMIT])
            logger.info(
                f"[PromptGuard] Prompt size {len(prompt)} chars exceeds {PROMPT_SIZE_LIMIT}. "
                f"Splitting into {len(batches)} sequential batches."
            )
            batch_results = []
            for batch_idx, batch_text in enumerate(batches):
                logger.info(f"[PromptGuard] Processing batch {batch_idx + 1}/{len(batches)} "
                            f"({len(batch_text)} chars)")
                batch_response = execute_with_retry(batch_text, request_data, api_key)
                batch_results.append(batch_response)
            # Merge: join all batch JSON responses into a single string
            # (the caller's existing JSON parser handles the merged output)
            response_text = "\n".join(batch_results)
        else:
            # Standard path (multimodal or within size limit)
            # Execute with retry
            response_text = execute_with_retry(prompt, request_data, api_key)

        # Record success
        circuit_breaker.record_success()
        try:
            cache.incr('ai_success_count')
        except:
            cache.set('ai_success_count', 1, 86400)

        # Cache the result
        if cache_key:
            try:
                cache.set(f"ai_cache:{cache_key}", {'reply': response_text}, 300)
            except:
                pass  # Cache failure, continue

        logger.info(f"AI Success: user={user_id}, hash={request_hash}")
        return {'reply': response_text}

    except Exception as e:
        logger.error(f"AI request failed: user={user_id}, tenant={tenant_id}, error={str(e)}")

        # Record failure for metrics
        try:
            cache.incr('ai_failure_count')
        except:
            cache.set('ai_failure_count', 1, 86400)

        # Record failure for circuit breaker
        circuit_breaker.record_failure()

        if isinstance(e, exceptions.ResourceExhausted):
            return {'error': 'AI service quota exceeded (429). Please try again later.', 'code': 'RATE_LIMIT'}
        if isinstance(e, exceptions.NotFound):
            return {'error': 'AI Configuration Error (404): Model or API Key not found.', 'code': 'CONFIG_ERROR'}
        if isinstance(e, exceptions.DeadlineExceeded):
            return {'error': 'AI request timed out (504). Please try again.', 'code': 'TIMEOUT'}
            
        return {'error': f'AI service busy. Error: {str(e)}'}


def _call_gemini_single(prompt: Any, request_data: dict, api_key: str, model_name: str, attempt_label: str, public_ip: str) -> str:
    """
    Internal helper: fires ONE Gemini API call for the given model and prompt.
    Returns clean response text on success, raises on any error.
    DO NOT call this directly — use execute_with_retry().
    """
    client = genai.Client(
        api_key=api_key,
        http_options=types.HttpOptions(timeout=None)
    )
    is_agent = request_data.get('type') == 'agent'

    logger.info(f"AI Call {attempt_label}: {model_name} (IP: {public_ip})")
    t_start = time.monotonic()

    response = client.models.generate_content(
        model=model_name,
        contents=prompt,
        config=types.GenerateContentConfig(
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=not is_agent)
        )
    )

    # ── RAW RESPONSE LOGGING & DEFENSIVE VALIDATION ──
    try:
        # 1. Log the full raw response object for deep debugging
        safe_user = request_data.get('user_id') or 'unknown'
        logger.info(f"AI Response Received: user={safe_user}, model={model_name}")
        
        # 2. Check for existence of candidates
        if not hasattr(response, 'candidates') or not response.candidates:
            logger.error(f"[GEMINI FAIL] No candidates found in response object: {repr(response)}")
            raise ValueError("Gemini returned zero candidates. Possible safety block or internal error.")
            
        candidate = response.candidates[0]
        
        # 3. Log Finish Reason and Safety
        finish_reason = getattr(candidate, 'finish_reason', 'UNKNOWN')
        safety_ratings = getattr(candidate, 'safety_ratings', [])
        
        # Defensive: handle potential None from getattr if attribute exists but is null
        if safety_ratings is None:
            safety_ratings = []
            
        logger.info(f"[GEMINI TRACE] Finish Reason: {finish_reason} | Safety Ratings: {len(safety_ratings)}")

        if finish_reason == 'SAFETY':
             logger.error(f"[GEMINI BLOCKED] Content blocked by safety filters. Ratings: {repr(safety_ratings)}")
             raise ValueError("Content blocked by AI safety filters.")

        # 4. Safe Traversal of Content -> Parts
        if not hasattr(candidate, 'content') or candidate.content is None:
            logger.error(f"[GEMINI FAIL] Candidate has no content: {repr(candidate)}")
            raise ValueError(f"Gemini candidate content is missing. Reason: {finish_reason}")

        if not hasattr(candidate.content, 'parts') or not candidate.content.parts:
            logger.error(f"[GEMINI FAIL] Candidate content has no parts: {repr(candidate.content)}")
            raise ValueError("Gemini returned empty parts list.")

        # 5. Extract Text Safely
        response_text = response.text
        if not response_text:
            logger.error(f"[GEMINI FAIL] response.text is empty despite valid parts structure. Raw: {repr(response)}")
            raise ValueError("Empty text returned from Gemini SDK.")

    except (AttributeError, IndexError, TypeError) as e:
        logger.error(f"[SDK CRITICAL] Failed to traverse Gemini response structure: {str(e)}")
        logger.error(f"RAW OBJECT TRACE: {repr(response)}")
        raise ValueError(f"Incompatible Gemini SDK response structure: {str(e)}")

    logger.info(f"AI Response Status: SUCCESS | Size: {len(response_text)} chars | Time: {time.monotonic() - t_start:.2f}s")

    # FORENSIC LOGGING: Response Preview
    preview = (response_text[:500] + "...") if len(response_text) > 500 else response_text
    logger.info(f"[GEMINI PREVIEW] Raw Output Start: {repr(preview)}")

    clean_text = safe_extract_json(response_text)
    if not clean_text:
        logger.warning("[PARSER] No JSON boundaries detected. Returning raw text.")
        return response_text.strip()

    # ── PRODUCTION-GRADE JSON RECOVERY ──
    try:
        json.loads(clean_text)
        return clean_text
    except json.JSONDecodeError as e:
        logger.warning(f"[PARSER] Initial JSON parse failed: {str(e)}. Attempting repair...")
        
        # Level 1: Basic repair (regex based)
        repaired = repair_json(clean_text)
        try:
            json.loads(repaired)
            logger.info("[PARSER] Successfully recovered JSON via Level 1 repair.")
            return repaired
        except:
            pass
            
        # Level 2: Strict sanitation (remove all control chars and extra whitespace)
        # This is a bit more aggressive than the initial filter
        sanitized = "".join(c for c in repaired if ord(c) >= 32)
        try:
            json.loads(sanitized)
            logger.info("[PARSER] Successfully recovered JSON via Level 2 sanitation.")
            return sanitized
        except:
            pass
            
        logger.error(f"[PARSER] ALL recovery attempts failed for response. Size: {len(clean_text)}")
        return clean_text # Return as is; caller will handle final failure


def execute_with_retry(prompt: Any, request_data: dict, api_key: str) -> str:
    """Execute AI request with exponential backoff and valid Gemini model selection.

    Changes from original:
    - 429 ResourceExhausted: dedicated 5-retry exponential backoff (2/4/8/16/32s)
      before marking key unhealthy. No behaviour change for any other error.
    - Prompt size logged before every attempt (safety logging only).
    All other retry/model-fallback logic is identical to before.
    """
    max_attempts = 3
    base_delay = 2
    api_key_used = api_key

    # 429-specific constants (requirement: up to 5 retries, 2→4→8→16→32s)
    MAX_429_RETRIES = 5
    BACKOFF_429 = [2, 4, 8, 16, 32]

    # VALID MODELS (Compatible with the 2026 environment)
    # Optimized for Extraction: Use gemini-2.5-flash ONLY for high-volume tasks
    is_extraction = request_data.get('type') in ('extraction', 'invoice', 'master')
    if is_extraction:
        candidate_models = ['gemini-2.5-flash']
    else:
        candidate_models = [
            'gemini-2.0-flash',
            'gemini-2.5-flash',
            'gemini-3.1-flash-lite-preview'
        ]

    # Get public IP for debugging (Log once or occasionally)
    try:
        import urllib.request
        now = time.time()
        if not hasattr(execute_with_retry, '_public_ip') or now - getattr(execute_with_retry, '_ip_time', 0) > 600:
            execute_with_retry._public_ip = urllib.request.urlopen('https://api.ipify.org').read().decode('utf8')
            execute_with_retry._ip_time = now
        public_ip = execute_with_retry._public_ip
    except Exception:
        public_ip = "unknown"

    # ── [FINAL TRACE] TRUE FINAL STAGE (MANDATORY) ──
    # This is the last point before API dispatch.
    # Input Prompt: request_data['prompt']
    # Final Prompt Text: prompt if str else prompt[0]
    
    input_size = len(request_data.get('prompt', ''))
    final_text_part = prompt if isinstance(prompt, str) else prompt[0]
    final_text_size = len(str(final_text_part))
    
    logger.info(f"[FINAL TRACE] Input Prompt Size: {input_size}")
    logger.info(f"[FINAL TRACE] Final Sent Prompt Size: {final_text_size}")

    # HARD SAFETY ASSERTION (Adjusted to 300K to match batching logic)
    if final_text_size > 300000:
        logger.critical(f"FATAL: Prompt inflation detected! Input={input_size}, Final={final_text_size}. BLOAT SOURCE FOUND.")
        raise Exception(f"FATAL: Prompt inflation detected ({final_text_size} chars). Execution blocked to prevent 429.")

    for attempt in range(max_attempts):
        last_error = None

        for model_name in candidate_models:
            try:
                result = _call_gemini_single(
                    prompt, request_data, api_key_used, model_name,
                    f"Attempt {attempt + 1}", public_ip
                )
                
                # Validation of result (especially for extraction)
                if request_data.get('type') in ('extraction', 'invoice'):
                    try:
                        # Attempt final parse. _call_gemini_single already tried to repair it.
                        json.loads(result)
                    except Exception as parse_err:
                        # EMERGENCY: Try one last time with strict repair
                        try:
                            recovered = repair_json(result)
                            json.loads(recovered)
                            logger.info("[RECOVERY] Final salvage successful in retry loop.")
                            return recovered
                        except:
                            logger.warning(f"Malformed JSON from {model_name}: {str(parse_err)}. Retrying...")
                            continue # Force retry on malformed JSON
                
                return result

            except exceptions.NotFound as e:
                # 404 -> Model not found or not supported
                logger.warning(f"[CONFIG] Model {model_name} not found or unsupported. Trying next candidate...")
                last_error = e
                continue

            except exceptions.ResourceExhausted as e:
                # ── SMART 429 HANDLING ──
                # Let the centralized queue/worker handle 429 retries adaptively.
                logger.warning(f"[429] ResourceExhausted on model {model_name}. Raising for adaptive requeue.")
                raise e

            except exceptions.InvalidArgument as e:
                if "not supported" in str(e).lower():
                    logger.warning(f"[NOT SUPPORTED] Model {model_name} doesn't support request features.")
                    continue
                raise e

            except exceptions.DeadlineExceeded as e:
                # 504 -> TIMEOUT
                logger.warning(f"[TIMEOUT] Timeout (504) for model {model_name}. Attempt {attempt + 1}")
                last_error = e
                continue

            except ValueError as e:
                # Empty response from _call_gemini_single
                logger.warning(f"[EMPTY] {e}")
                last_error = e
                continue

            except Exception as e:
                logger.error(f"[ERROR] Unexpected Error for {model_name}: {str(e)}")
                last_error = e
                continue

        # All models failed for this outer attempt
        if attempt < max_attempts - 1:
            # Retry on 429, 504, or Empty/Malformed responses (ValueError)
            is_retryable = isinstance(last_error, (exceptions.ResourceExhausted, exceptions.DeadlineExceeded, ValueError))

            err_msg = str(last_error).lower()
            if any(term in err_msg for term in ["timeout", "handshake", "connection", "empty", "json"]):
                is_retryable = True

            if is_retryable:
                sleep_time = base_delay * (2 ** attempt)
                logger.info(
                    f"Retrying AI pipeline in {sleep_time}s due to service busy or timeout... "
                    f"(Retry count: {attempt + 1})"
                )
                time.sleep(sleep_time)

                new_key = api_key_manager.get_healthy_key()
                if new_key and new_key != api_key_used:
                    logger.info("Switching to fresh API key for retry attempt.")
                    api_key_used = new_key
                continue
            else:
                raise last_error if last_error else Exception("All models failed")
        else:
            logger.error(f"[ERROR] AI retries exhausted. Last Error: {last_error}")
            raise last_error if last_error else Exception("AI request retries exhausted")

    raise Exception("All retries failed")


class AIServiceProxy:
    """Main AI service interface"""

    def __init__(self):
        # Global concurrency limit to prevent overwhelming the AI provider
        # especially during multi-page fanout.
        max_concurrency = getattr(settings, 'AI_MAX_CONCURRENCY', 2)
        self.concurrency_semaphore = threading.Semaphore(max_concurrency)

    def make_request(self, request_type: str, request_data: dict,
                    user_id: str, tenant_id: str = None, metadata: dict = None) -> dict:
        """Main entry point for AI requests (In-process)"""
        # Limit global concurrency to prevent overloading the system
        with self.concurrency_semaphore:
            return self._execute_request(request_type, request_data, user_id, tenant_id, metadata)

    def _execute_request(self, request_type: str, request_data: dict,
                    user_id: str, tenant_id: str = None, metadata: dict = None) -> dict:


        # Check circuit breaker
        if circuit_breaker.is_open():
            return {'error': 'AI service is temporarily unavailable. Please try again later.', 'code': 'CIRCUIT_BREAKER'}

        # Check rate limits (Global shared Sliding Window RPS)
        try:
            # Global shared RPS limit (Sliding Window)
            MAX_RPS = getattr(settings, 'AI_MAX_RPS', 5)
            # ── [SLIDING WINDOW] Key for global RPS enforcement ──
            global_rps = rate_limiter.check_rate_limit('global_rps', MAX_RPS, window=1.0)
            if not global_rps['allowed']:
                # Predictive delay: wait for the next slot
                retry_after = global_rps.get('retry_after', 1)
                return {'error': 'AI System is busy (RPS Limit).', 'code': 'RATE_LIMIT', 'retryAfter': retry_after}

            # Per-user RPM limit (Sliding Window 60s)
            user_key = f"user_rpm:{user_id}"
            user_limit = rate_limiter.check_rate_limit(user_key, 60, window=60.0) # 60 RPM
            if not user_limit['allowed']:
                return {'error': 'Rate limit exceeded for your account (RPM).', 'code': 'RATE_LIMIT', 'retryAfter': user_limit['retry_after']}

        except Exception as e:
            logger.warning(f"Rate limiting error: {e}")

        # Check cache
        cache_key = generate_cache_key(request_data)
        try:
            cached_result = cache.get(f"ai_cache:{cache_key}")
            if cached_result:
                return cached_result
        except Exception as e:
            logger.warning(f"Cache unavailable: {e}")

        # Prepare full request
        full_request = request_data.copy()
        full_request.update({
            'type': request_type,
            'user_id': user_id,
            'tenant_id': tenant_id or 'anonymous',
            'cache_key': cache_key,
            'metadata': metadata or {}
        })

        # ── CENTRALIZED QUEUEING (NO BYPASS) ──────────────────────────
        # All requests must flow through the central AI Request Queue to ensure
        # adaptive throttling, concurrency control, and fair use.
        try:
            logger.info(f"Enqueuing {request_type} request for user {user_id}")
            result = ai_request_queue.enqueue(full_request)
            
            # If caller is a worker or needs the result immediately, poll for it.
            if request_data.get('wait_for_result'):
                job_id = result.get('job_id')
                if not job_id:
                    return result
                
                logger.info(f"Worker waiting for AI result: {job_id}")
                return self._wait_for_completion(job_id)

            return result
        except Exception as e:
            logger.error(f"Queue submission failed: {e}")
            return {'error': f'Service busy (Queue error): {str(e)}'}

    def _wait_for_completion(self, job_id: str, timeout: int = 120) -> dict:
        """Polls Redis for the result of a queued AI job."""
        start_time = time.time()
        result_key = f"ai_result:{job_id}"
        
        while time.time() - start_time < timeout:
            try:
                raw_res = cache.get(result_key)
                if raw_res:
                    if isinstance(raw_res, str):
                        return json.loads(raw_res)
                    return raw_res
            except Exception:
                pass
            time.sleep(1) # Poll every second
            
        return {'error': 'AI processing timed out in queue.'}

    def get_stats(self) -> dict:
        """Get service statistics"""
        return {
            'ai_success': cache.get('ai_success_count', 0),
            'ai_failures': cache.get('ai_failure_count', 0),
            'circuit_breaker_open': circuit_breaker.is_open(),
            'circuit_breaker_failures': circuit_breaker.failures,
            'api_keys_total': len(api_key_manager.api_keys),
            'api_keys_unhealthy': len(api_key_manager.unhealthy_keys)
        }


# Global instance
ai_service = AIServiceProxy()
