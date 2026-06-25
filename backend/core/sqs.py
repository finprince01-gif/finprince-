import boto3
import json
import os
import logging
import uuid
import time
import platform
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class SQSEncoder(json.JSONEncoder):
    """
    [FIX] Custom JSON encoder that safely serialises any DynamicClusterEnv
    instance (or similar lazy-eval objects) to a plain string, preventing the
    'Object of type DynamicClusterEnv is not JSON serializable' push failure
    that silently drops AI/Assembly messages and stalls the barrier.
    """
    def default(self, obj):
        # DynamicClusterEnv defines __str__, use it.
        if hasattr(obj, '__class__') and obj.__class__.__name__ == 'DynamicClusterEnv':
            return str(obj)
        if isinstance(obj, uuid.UUID):
            # [UUID_COERCION_APPLIED] Forensic log/trace as requested
            logger.info(f"[UUID_COERCION_APPLIED] SQSEncoder converting UUID obj '{obj}' to string.")
            return str(obj)
        return super().default(obj)


def deep_coerce_uuids(obj):
    """
    Recursively coerces any UUID objects in dict keys, dict values, lists,
    tuples, or metadata structures into plain strings to ensure complete
    JSON serializability.
    """
    if isinstance(obj, dict):
        new_dict = {}
        for k, v in obj.items():
            new_key = str(k) if isinstance(k, uuid.UUID) else k
            if isinstance(k, uuid.UUID):
                logger.info(f"[UUID_COERCION_APPLIED] Coerced dictionary key UUID '{k}' to string.")
            new_dict[new_key] = deep_coerce_uuids(v)
        return new_dict
    elif isinstance(obj, list):
        return [deep_coerce_uuids(x) for x in obj]
    elif isinstance(obj, tuple):
        return tuple(deep_coerce_uuids(x) for x in obj)
    elif isinstance(obj, uuid.UUID):
        val_str = str(obj)
        logger.info(f"[UUID_COERCION_APPLIED] Coerced value UUID '{obj}' to string.")
        return val_str
    return obj

# [FORENSIC] Environment identity — MUST differ between local dev and EC2 production.
# If this is unset, local and production workers compete for the same SQS messages.
class DynamicClusterEnv:
    def __str__(self):
        return os.getenv('CLUSTER_ENV', 'UNSET')
    def __repr__(self):
        return os.getenv('CLUSTER_ENV', 'UNSET')
    def __eq__(self, other):
        return os.getenv('CLUSTER_ENV', 'UNSET') == other
    def __ne__(self, other):
        return os.getenv('CLUSTER_ENV', 'UNSET') != other
    def __add__(self, other):
        return os.getenv('CLUSTER_ENV', 'UNSET') + other
    def __radd__(self, other):
        return other + os.getenv('CLUSTER_ENV', 'UNSET')

_CLUSTER_ENV  = DynamicClusterEnv()
_HOSTNAME     = platform.node()

if os.getenv('CLUSTER_ENV', 'UNSET') == 'UNSET':
    logger.warning(
        "[CLUSTER_ENV_MISSING] CLUSTER_ENV is not set in .env. "
        "If local and EC2 share the same queue URLs, local workers WILL consume production messages. "
        "Set CLUSTER_ENV=local (dev) or CLUSTER_ENV=production (EC2) to identify competing consumers in logs."
    )

class QueueService:
    """
    Production-grade Queue Service for SQS.
    Hardened for Phase 11.9: Lazy Loading & Forensic Identity Trace.
    """
    def __init__(self):
        self._sqs = None
        self._topology_logged = set()
        self._queue_mapping = None

    def _get_queue_mapping(self):
        current_env = os.getenv('CLUSTER_ENV', 'UNSET')
        if self._queue_mapping is None or getattr(self, '_cached_env', None) != current_env:
             self._cached_env = current_env
             def get_url(base):
                 if not base:
                     return base
                 if current_env == 'local' and not base.endswith('-local'):
                     return base + '-local'
                 return base

             self._queue_mapping = {
                'ingestion': get_url(os.getenv('SQS_INGESTION_QUEUE_URL')),
                'ai': get_url(os.getenv('SQS_AI_QUEUE_URL')),
                'assembly': get_url(os.getenv('SQS_ASSEMBLY_QUEUE_URL')),
                'finalize': get_url(os.getenv('SQS_FINALIZE_QUEUE_URL')),
                'export': get_url(os.getenv('SQS_EXPORT_QUEUE_URL')),
                'materialization': get_url(os.getenv('SQS_MATERIALIZATION_QUEUE_URL'))
            }
             # Forensic Logging
             unique_urls = {v for v in self._queue_mapping.values() if v}
             if unique_urls:
                 logger.info(f"[SQS_MAPPING_LOADED] roles={list(self._queue_mapping.keys())} count={len(unique_urls)} cluster_env={current_env}")
             else:
                 logger.warning(f"[SQS_MAPPING_EMPTY] No physical SQS URLs resolved from environment. cluster_env={current_env}")
        return self._queue_mapping

    def _get_sqs_client(self):
        if self._sqs is None:
            if os.getenv('AWS_ACCESS_KEY_ID'):
                from botocore.config import Config
                try:
                    self._sqs = boto3.client(
                        'sqs',
                        aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'),
                        aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'),
                        region_name=os.getenv('AWS_REGION', 'ap-south-1'),
                        config=Config(max_pool_connections=50)
                    )
                except Exception as e:
                    logger.error(f"Failed to initialize SQS client: {e}")
        return self._sqs

    def _get_queue_url(self, queue_type: str) -> Optional[str]:
        mapping = self._get_queue_mapping()
        url = mapping.get(queue_type)
        if not url:
             logger.error(f"[QUEUE_ROUTING_FAILED] No physical URL for role={queue_type}")
             return None
        
        if queue_type not in self._topology_logged:
             # Forensic Identity Check
             try:
                 parts = url.split('/')
                 if len(parts) >= 4:
                     account = parts[3]
                     host_parts = parts[2].split('.')
                     region = host_parts[1] if len(host_parts) >= 2 else "unknown"
                     logger.info(f"[QUEUE_IDENTITY_MATCH] role={queue_type} account={account} region={region}")
             except:
                 pass
             self._topology_logged.add(queue_type)
        return url

    def push(self, message: Dict[str, Any], queue_type: str, delay_seconds: int = 0) -> bool:
        """
        Pushes a message strictly to SQS with Tenant Fair Queuing (Phase 6G).
        """
        from core.observability import observability, metrics
        t_start = time.time()
        
        queue_url = self._get_queue_url(queue_type)
        sqs = self._get_sqs_client()
        
        if not sqs or not queue_url:
            return False

        tenant_id = str(message.get('tenant_id', 'unknown'))
        
        # [SQS_SERIALIZATION_PAYLOAD] Log payload structure
        logger.info(f"[SQS_SERIALIZATION_PAYLOAD] queue={queue_type} message_id={message.get('id')} keys={list(message.keys())}")

        try:
            # Apply recursive UUID coercion
            coerced_message = deep_coerce_uuids(message)

            # Phase 6G: SQS Fair Queuing Logic
            effective_delay = delay_seconds
            args = {}
            if effective_delay > 0:
                args['DelaySeconds'] = min(effective_delay, 900)

            # Add message_created_at timestamp
            coerced_message['message_created_at'] = time.time()

            # Add ownership metadata
            coerced_message['_ownership'] = {
                'cluster_env': str(_CLUSTER_ENV),
                'cluster_id': os.getenv('CLUSTER_ID', 'default-cluster'),
                'origin_host': _HOSTNAME,
                'producer_role': 'system'
            }

            try:
                serialized_body = json.dumps(coerced_message, cls=SQSEncoder)
                logger.info(f"[SQS_SERIALIZATION_SUCCESS] queue={queue_type} message_id={coerced_message.get('id')}")
            except Exception as ser_err:
                logger.error(f"[SQS_SERIALIZATION_FAILURE] Failed to serialize message body: {ser_err}")
                raise

            result = sqs.send_message(
                QueueUrl=queue_url,
                MessageBody=serialized_body,
                MessageAttributes={'TenantID': {'StringValue': tenant_id, 'DataType': 'String'}},
                **args
            )
            sqs_message_id = result.get('MessageId', 'unknown')

            latency = time.time() - t_start
            observability.queue_metric(event="PUSH", queue=queue_type, tenant_id=tenant_id, delay=delay_seconds, latency=latency)
            metrics.increment_counter("queue:push_total", tags={"queue": queue_type, "tenant": tenant_id})

            # [FORENSIC] Log producer identity so we can detect cross-environment message theft
            logger.info(
                f"[QUEUE_PUSH_SUCCESS] id={coerced_message.get('id')} sqs_id={sqs_message_id} "
                f"queue={queue_type} url={queue_url} tenant={tenant_id} "
                f"cluster_env={_CLUSTER_ENV} host={_HOSTNAME}"
            )
            logger.info(
                f"[SQS_MESSAGE_ENQUEUED] id={coerced_message.get('id')} sqs_id={sqs_message_id} "
                f"queue={queue_type} physical_url={queue_url} tenant={tenant_id} "
                f"delay={effective_delay}s type={coerced_message.get('task_type', 'unknown')} "
                f"cluster_env={_CLUSTER_ENV} host={_HOSTNAME}"
            )
            return True
        except Exception as e:
            logger.error(f"[SQS_PUSH_ERR] {e}")
            return False

    def receive(self, queue_type: str, max_messages: int = 1, wait_time: int = 20, suppress_empty_log: bool = False) -> List[Dict[str, Any]]:
        """
        Hardened SQS Receiver with Phase 11.9 Forensics.
        """
        from core.observability import observability, metrics
        
        queue_url = self._get_queue_url(queue_type)
        sqs = self._get_sqs_client()
        
        if not sqs or not queue_url:
            return []
            
        # [PHASE 11.9] Forensic Receive Trace (DEBUG only to reduce noise)
        logger.debug(f"[RECEIVE_MESSAGE_CALL] queue={queue_type} url={queue_url} wait={wait_time}")
        
        try:
            response = sqs.receive_message(
                QueueUrl=queue_url,
                MaxNumberOfMessages=max_messages,
                WaitTimeSeconds=wait_time,
                VisibilityTimeout=300,
                AttributeNames=['All'],
                MessageAttributeNames=['All']
            )
 
            messages = response.get('Messages', [])
            if not messages:
                # [FORENSIC] Include url + env in empty-poll log — helps verify worker is polling correct queue
                if not suppress_empty_log:
                    logger.debug(
                        f"[RECEIVE_MESSAGE_EMPTY] queue={queue_type} url={queue_url} "
                        f"cluster_env={_CLUSTER_ENV} host={_HOSTNAME}"
                    )
                return []
            
            # [FORENSIC] Log consumer identity — if cluster_env=local appears in EC2 logs, a local worker stole the message
            logger.info(
                f"[RECEIVE_MESSAGE_SUCCESS] queue={queue_type} url={queue_url} count={len(messages)} "
                f"cluster_env={_CLUSTER_ENV} host={_HOSTNAME}"
            )

            # Record Receive Metric
            metrics.increment_counter("queue:receive_total", value=len(messages), tags={"queue": queue_type})
            observability.queue_metric(event="RECEIVE", queue=queue_type, count=len(messages))

            results = []
            for msg in messages:
                try:
                    body = json.loads(msg['Body'])
                    body['_sqs_handle'] = msg['ReceiptHandle']
                    body['_sqs_message_id'] = msg['MessageId']
                    body['_sqs_receive_count'] = msg['Attributes'].get('ApproximateReceiveCount', 1)
                    
                    # Phase 6: Calculate SQS latency / queue wait seconds
                    created_at = body.get('message_created_at')
                    if created_at:
                        received_at = time.time()
                        queue_wait_seconds = received_at - float(created_at)
                        body['message_created_at'] = created_at
                        body['message_received_at'] = received_at
                        body['queue_wait_seconds'] = queue_wait_seconds
                        
                        logger.info(
                            f"[QUEUE_LATENCY] queue={queue_type} msg_id={body.get('id', 'unknown')} "
                            f"message_created_at={created_at:.6f} message_received_at={received_at:.6f} "
                            f"queue_wait_seconds={queue_wait_seconds:.6f}"
                        )
                    
                    results.append(body)
                except Exception as e:
                    logger.error(f"Failed to parse SQS message body: {e}")
            return results
        except Exception as e:
            logger.error(f"[SQS_RECEIVE_ERR] {e}")
            return []

    def delete(self, receipt_handle: str, queue_type: str) -> bool:
        queue_url = self._get_queue_url(queue_type)
        sqs = self._get_sqs_client()
        if sqs and queue_url:
            try:
                sqs.delete_message(QueueUrl=queue_url, ReceiptHandle=receipt_handle)
                return True
            except Exception as e:
                logger.error(f"Failed to delete SQS message: {e}")
        return False

    def get_queue_depth(self, queue_type: str) -> int:
        visible, invisible = self.get_queue_stats(queue_type)
        return visible + invisible

    def get_queue_stats(self, queue_type: str) -> tuple[int, int]:
        queue_url = self._get_queue_url(queue_type)
        sqs = self._get_sqs_client()
        if sqs and queue_url:
            try:
                resp = sqs.get_queue_attributes(
                    QueueUrl=queue_url,
                    AttributeNames=['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible']
                )
                visible = int(resp['Attributes'].get('ApproximateNumberOfMessages', 0))
                invisible = int(resp['Attributes'].get('ApproximateNumberOfMessagesNotVisible', 0))
                
                # [PHASE 11.9] Forensic Snapshot (DEBUG to reduce noise)
                logger.debug(f"[QUEUE_DEPTH_SNAPSHOT] queue={queue_type} physical_url={queue_url} visible={visible} invisible={invisible}")
                return visible, invisible
            except Exception as e:
                logger.error(f"Failed to get queue stats for {queue_type}: {e}")
        return 0, 0

    def extend_visibility(self, receipt_handle: str, additional_seconds: int, queue_type: str) -> bool:
        queue_url = self._get_queue_url(queue_type)
        sqs = self._get_sqs_client()
        if sqs and queue_url:
            try:
                sqs.change_message_visibility(
                    QueueUrl=queue_url,
                    ReceiptHandle=receipt_handle,
                    VisibilityTimeout=additional_seconds
                )
                return True
            except Exception as e:
                logger.error(f"Failed to extend SQS visibility: {e}")
        return False

    def change_visibility(self, receipt_handle: str, timeout: int, queue_type: str) -> bool:
        queue_url = self._get_queue_url(queue_type)
        sqs = self._get_sqs_client()
        if sqs and queue_url:
            try:
                sqs.change_message_visibility(
                    QueueUrl=queue_url,
                    ReceiptHandle=receipt_handle,
                    VisibilityTimeout=timeout
                )
                return True
            except Exception as e:
                logger.error(f"Failed to change SQS visibility: {e}")
        return False

queue_service = QueueService()
