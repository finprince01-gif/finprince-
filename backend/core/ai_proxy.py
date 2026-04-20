import os
import json
import base64
import time
import hashlib
import logging
import threading
from typing import Dict, Any, Optional
from django.core.cache import cache
from google.api_core import exceptions
from google import genai
from google.genai import types
from dotenv import load_dotenv

# Ensure environment variables are loaded (especially for GEMINI_API_KEY)
load_dotenv(override=True)

logger = logging.getLogger(__name__)


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
    """Per-user, tenant, IP rate limiting using in-memory storage"""

    def __init__(self):
        self.limits = {}  # key -> (count, window_start)
        self.lock = threading.Lock()

    def check_rate_limit(self, key: str, limit: int, window: int = 60) -> Dict[str, Any]:
        """Check if request is allowed. Returns {'allowed': bool, 'retry_after': int}"""
        now = time.time()
        
        with self.lock:
            if key in self.limits:
                count, window_start = self.limits[key]
                
                # Check if window has expired
                if now - window_start >= window:
                    # Reset window
                    self.limits[key] = (1, now)
                    return {'allowed': True, 'retry_after': 0}
                
                # Within window
                if count >= limit:
                    retry_after = int(window - (now - window_start))
                    return {'allowed': False, 'retry_after': retry_after}
                
                # Increment count
                self.limits[key] = (count + 1, window_start)
                return {'allowed': True, 'retry_after': 0}
            else:
                # First request
                self.limits[key] = (1, now)
                return {'allowed': True, 'retry_after': 0}


# Global instances
api_key_manager = APIKeyManager()
circuit_breaker = CircuitBreaker()
rate_limiter = RateLimiter()


def generate_cache_key(request_data: dict) -> str:
    """Generate cache key from request data"""
    cacheable_data = json.dumps({
        'type': request_data.get('type'),
        'message': request_data.get('message', ''),
        'contextData': request_data.get('contextData', ''),
        'useGrounding': request_data.get('useGrounding', False),
        'file_hash': request_data.get('file_hash')  # For invoice files
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
            prompt_text = request_data.get('prompt', 'Extract invoice data from this image')
            if 'image_data' in request_data:
                try:
                    image_bytes = base64.b64decode(request_data['image_data'])
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

        # Log request
        msg_content = request_data.get('message', 'invoice_processing')
        request_hash = hashlib.md5(msg_content.encode()).hexdigest()[:8]
        logger.info(f"AI Call: user={user_id}, tenant={tenant_id}, hash={request_hash}")

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


def execute_with_retry(prompt: Any, request_data: dict, api_key: str) -> str:
    """Execute AI request with exponential backoff and valid Gemeni model selection."""
    max_attempts = 3
    base_delay = 2
    api_key_used = api_key
    
    # VALID MODELS (Compatible with the 2026 environment)
    candidate_models = [
        'gemini-2.0-flash',
        'gemini-2.5-flash',
        'gemini-3.1-flash-lite-preview'
    ]

    # Get public IP for debugging (Log once or occasionally)
    try:
        import urllib.request
        # Cache IP for 10 minutes to avoid overhead
        now = time.time()
        if not hasattr(execute_with_retry, '_public_ip') or now - getattr(execute_with_retry, '_ip_time', 0) > 600:
            execute_with_retry._public_ip = urllib.request.urlopen('https://api.ipify.org').read().decode('utf8')
            execute_with_retry._ip_time = now
        public_ip = execute_with_retry._public_ip
    except Exception:
        public_ip = "unknown"

    # Log prompt size
    prompt_str = str(prompt)
    logger.info(f"AI Prompt Size: {len(prompt_str)} chars")

    for attempt in range(max_attempts):
        # Initialize client
        client = genai.Client(
            api_key=api_key_used,
            http_options=types.HttpOptions(timeout=None)
        )
        
        # Try each model in the list
        last_error = None
        for model_name in candidate_models:
            try:
                logger.info(f"AI Call Attempt {attempt+1}: {model_name} (IP: {public_ip})")
                
                t_start = time.monotonic()
                
                # Determine if we need AFC (Only for agentic chat)
                is_agent = request_data.get('type') == 'agent'
                
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=not is_agent)
                    )
                )
                t_end = time.monotonic()
                
                # Check for successful response
                if not response.text:
                    logger.warning(f"AI returned empty response for {model_name}. Check safety filters.")
                    continue
                
                logger.info(f"AI Response Status: SUCCESS | Model: {model_name} | Time: {time.monotonic() - t_start:.2f}s")
                return response.text.strip()

            except exceptions.NotFound as e:
                # 404 -> Model not found or not supported
                logger.warning(f"[CONFIG] Model {model_name} not found or unsupported. Trying next candidate...")
                last_error = e
                continue

            except exceptions.ResourceExhausted as e:
                # 429 -> RATE LIMIT. Mark key as unhealthy so rotation picks a different one.
                logger.warning(f"[RATE LIMIT] Key {api_key_used[:8]}... exhausted for {model_name}. Marking unhealthy.")
                api_key_manager.mark_key_unhealthy(api_key_used)
                last_error = e
                continue

            except exceptions.InvalidArgument as e:
                if "not supported" in str(e).lower():
                    logger.warning(f"[NOT SUPPORTED] Model {model_name} doesn't support request features.")
                    continue
                raise e

            except exceptions.DeadlineExceeded as e:
                # 504 -> TIMEOUT
                logger.warning(f"[TIMEOUT] Timeout (504) for model {model_name}. Attempt {attempt+1}")
                last_error = e
                continue

            except Exception as e:
                logger.error(f"[ERROR] Unexpected Error for {model_name}: {str(e)}")
                last_error = e
                continue
        
        # If we get here, all models in candidate_models failed for this attempt
        if attempt < max_attempts - 1:
            # Check if we should retry based on error type
            is_retryable = isinstance(last_error, (exceptions.ResourceExhausted, exceptions.DeadlineExceeded))
            
            # Check for generic timeout/connection errors
            err_msg = str(last_error).lower()
            if "timeout" in err_msg or "handshake" in err_msg or "connection" in err_msg:
                is_retryable = True

            if is_retryable:
                sleep_time = base_delay * (2 ** attempt)
                logger.info(f"Retrying AI pipeline in {sleep_time}s due to service busy or timeout... (Retry count: {attempt+1})")
                time.sleep(sleep_time)
                
                # Try switching key for the next attempt
                new_key = api_key_manager.get_healthy_key()
                if new_key and new_key != api_key_used:
                    logger.info("Switching to fresh API key for retry attempt.")
                    api_key_used = new_key
                continue
            else:
                # For other errors (except 404 which is raised immediately), if we tried all models and failed, raise
                raise last_error if last_error else Exception("All models failed")
        else:
            logger.error(f"[ERROR] AI retries exhausted. Last Error: {last_error}")
            raise last_error if last_error else Exception("AI request retries exhausted")

    raise Exception("All retries failed")


class AIServiceProxy:
    """Main AI service interface"""

    def __init__(self):
        self.concurrency_semaphore = threading.Semaphore(20)

    def make_request(self, request_type: str, request_data: dict,
                    user_id: str, tenant_id: str = None) -> dict:
        """Main entry point for AI requests (In-process)"""

        # ── BLOCK DIRECT INVOICE PROCESSING ────────────────────────────────
        if request_type == 'invoice':
            # Production MUST use the Kafka pipeline (/api/vouchers/upload).
            # Note: We allow 'master' type to continue directly as it skips the heavy pipeline.
            logger.critical(f"SECURITY ERROR: Blocked direct invoice processing for user {user_id}. All OCR must use Kafka.")
            return {
                'error': 'Service Unavailable: Direct AI Extraction has been disabled. Please upload invoices via the standard pipeline (Kafka).',
                'code': 'SERVICE_UNAVAILABLE',
                'status': 503
            }

        # Check circuit breaker
        if circuit_breaker.is_open():
            return {'error': 'AI service is temporarily unavailable. Please try again later.', 'code': 'CIRCUIT_BREAKER'}

        # Check rate limits
        try:
            user_limit = rate_limiter.check_rate_limit(f"user:{user_id}", 100)
            if not user_limit['allowed']:
                return {'error': 'Rate limit exceeded.', 'code': 'RATE_LIMIT', 'retryAfter': user_limit['retry_after']}

            global_limit = rate_limiter.check_rate_limit('global', 1000)
            if not global_limit['allowed']:
                return {'error': 'Service is busy.', 'code': 'RATE_LIMIT', 'retryAfter': global_limit['retry_after']}
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
            'cache_key': cache_key
        })

        # Process directly (only for 'agent' requests now)
        if not self.concurrency_semaphore.acquire(blocking=True, timeout=30):
            return {'error': 'AI service is busy.', 'code': 'CONCURRENCY_LIMIT'}

        try:
            logger.info(f"Processing {request_type} request for user {user_id}")
            result = process_ai_request(full_request)
            return result
        finally:
            self.concurrency_semaphore.release()

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
