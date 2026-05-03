import redis
import os
import json
import time
import logging
from django.conf import settings

logger = logging.getLogger("RedisClient")

class RedisClient:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(RedisClient, cls).__new__(cls)
            cls._instance._initialized = False
            cls._instance.client = None
            cls._instance.available = False
            cls._instance._init_connection()
        return cls._instance

    def _init_connection(self):
        """Initialize Redis connection with retries, exponential backoff, and loud failures in production"""
        # Determine dev mode from settings
        try:
            is_dev = getattr(settings, 'DEBUG', True)
        except Exception:
            is_dev = os.getenv('DJANGO_DEBUG', 'False') == 'True'

        redis_url = getattr(settings, 'REDIS_URL', os.getenv('REDIS_URL', 'redis://localhost:6379/0'))

        base_delay = 1
        max_attempts = 4 if not is_dev else 2
        
        logger.info(f"[REDIS CONNECT] Attempting connection via URL={redis_url}, max_attempts={max_attempts}, dev_mode={is_dev}")
        
        for i in range(max_attempts):
            try:
                # Set dynamic timeout: slightly longer for production
                timeout = 5.0 if not is_dev else 1.0
                
                self.client = redis.from_url(redis_url, decode_responses=True, socket_timeout=timeout)
                self.client.ping()

                # MANDATORY VALIDATION: SET, GET, DELETE
                test_key = f"redis_test_startup_{int(time.time())}"
                self.client.set(test_key, "1", ex=10)
                val = self.client.get(test_key)
                if val != "1":
                    raise ValueError("Redis validation failed: GET test_key returned incorrect value")
                self.client.delete(test_key)

                self.available = True
                self._initialized = True
                logger.info(f"[REDIS SUCCESS] Production-grade Redis connected and validated successfully.")
                return
            except Exception as e:
                logger.warning(f"[REDIS ATTEMPT FAILED] Attempt {i+1}/{max_attempts} failed. Reason: {e}")
                if i == max_attempts - 1:
                    self.available = False
                    self._initialized = True
                    if not is_dev:
                        # Production mode: fail loudly
                        raise RuntimeError(f"CRITICAL: Production Redis is required but failed startup validation: {e}") from e
                    else:
                        logger.info(f"[REDIS FALLBACK] Falling back to local mode in development.")
                else:
                    sleep_time = base_delay * (2 ** i)
                    time.sleep(sleep_time)


    def get_client(self):
        if not self.available:
            return None
        return self.client

    def is_healthy(self):
        """Check if Redis is currently alive"""
        try:
            if self.client:
                self.client.ping()
                self.available = True
                return True
        except:
            pass
        self.available = False
        return False

    # --- Queueing Helpers (with Fallback) ---
    def push_to_queue(self, queue_name: str, data: dict):
        if not self.available:
            return False
        try:
            self.client.lpush(f"queue:{queue_name}", json.dumps(data))
            return True
        except Exception as e:
            logger.error(f"[REDIS ERROR] Push failed: {e}")
            self.available = False
            return False

    def pop_from_queue(self, queue_names: list, timeout: int = 0):
        if not self.available:
            return None, None
        try:
            if isinstance(queue_names, str):
                queue_names = [queue_names]
            keys = [f"queue:{name}" for name in queue_names]
            res = self.client.brpop(keys, timeout=timeout)
            if res:
                return json.loads(res[1]), res[0].replace("queue:", "")
        except Exception as e:
            logger.error(f"[REDIS ERROR] Pop failed: {e}")
            self.available = False
        return None, None

    def get_queue_length(self, queue_names: list):
        if not self.available:
            return 0
        try:
            if isinstance(queue_names, str):
                return self.client.llen(f"queue:{queue_names}")
            total = 0
            for name in queue_names:
                total += self.client.llen(f"queue:{name}")
            return total
        except:
            self.available = False
            return 0

    # --- Sliding Window Rate Limiter (with Fallback) ---
    def check_sliding_window(self, key: str, limit: int, window: float = 1.0):
        if not self.available:
            # Fallback to "always allow" or local logic in proxy
            return True, 0, 0
        try:
            now = time.time()
            key = f"rl:sw:{key}"
            pipeline = self.client.pipeline()
            pipeline.zremrangebyscore(key, 0, now - window)
            pipeline.zcard(key)
            results = pipeline.execute()
            count = results[1]
            if int(count) >= int(limit):
                oldest = self.client.zrange(key, 0, 0, withscores=True)
                retry_after = max(0, oldest[0][1] + window - now) if oldest else window
                return False, count, retry_after
            import uuid
            member = f"{now}:{uuid.uuid4()}"
            self.client.zadd(key, {member: now})
            self.client.expire(key, int(window) + 2)
            return True, count + 1, 0
        except Exception as e:
            logger.error(f"[REDIS ERROR] Rate limit check failed: {e}")
            self.available = False
            return True, 0, 0

    # --- Global Token Bucket (with Fallback) ---
    def acquire_token(self, key: str, max_tokens: int, refill_rate: float):
        if not self.available:
            return True
        try:
            now = time.time()
            bucket_key = f"tb:{key}"
            lua = """
            local key = KEYS[1]
            local max_tokens = tonumber(ARGV[1])
            local refill_rate = tonumber(ARGV[2])
            local now = tonumber(ARGV[3])
            local bucket = redis.call('hgetall', key)
            local tokens = max_tokens
            local last_refill = now
            if #bucket > 0 then
                local data = {}
                for i=1, #bucket, 2 do data[bucket[i]] = bucket[i+1] end
                tokens = tonumber(data['tokens'])
                last_refill = tonumber(data['last_refill'])
            end
            local delta = (now - last_refill) * refill_rate
            tokens = math.min(max_tokens, tokens + delta)
            if tokens >= 1 then
                tokens = tokens - 1
                redis.call('hmset', key, 'tokens', tokens, 'last_refill', now)
                return 1
            else return 0 end
            """
            res = self.client.register_script(lua)(keys=[bucket_key], args=[max_tokens, refill_rate, now])
            return bool(res)
        except:
            self.available = False
            return True

    def record_metric(self, name: str, value: float):
        if not self.available: return
        try:
            self.client.hset("metrics", name, value)
            self.client.lpush(f"metrics:history:{name}", f"{int(time.time())}:{value}")
            self.client.ltrim(f"metrics:history:{name}", 0, 99)
        except:
            self.available = False

redis_client = RedisClient()
