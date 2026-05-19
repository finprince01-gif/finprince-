import boto3
import json
import os
import logging
import uuid
import time
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

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
        if self._queue_mapping is None:
             self._queue_mapping = {
                'ingestion': os.getenv('SQS_INGESTION_QUEUE_URL'),
                'ai': os.getenv('SQS_AI_QUEUE_URL'),
                'assembly': os.getenv('SQS_ASSEMBLY_QUEUE_URL'),
                'finalize': os.getenv('SQS_FINALIZE_QUEUE_URL'),
                'export': os.getenv('SQS_EXPORT_QUEUE_URL')
            }
             # Forensic Logging
             unique_urls = {v for v in self._queue_mapping.values() if v}
             if unique_urls:
                 logger.info(f"[SQS_MAPPING_LOADED] roles={list(self._queue_mapping.keys())} count={len(unique_urls)}")
             else:
                 logger.warning("[SQS_MAPPING_EMPTY] No physical SQS URLs resolved from environment.")
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
        
        try:
            # Phase 6G: SQS Fair Queuing Logic
            effective_delay = delay_seconds
            args = {}
            if effective_delay > 0:
                args['DelaySeconds'] = min(effective_delay, 900)

            sqs.send_message(
                QueueUrl=queue_url,
                MessageBody=json.dumps(message),
                MessageAttributes={'TenantID': {'StringValue': tenant_id, 'DataType': 'String'}},
                **args
            )
            
            latency = time.time() - t_start
            observability.queue_metric(event="PUSH", queue=queue_type, tenant_id=tenant_id, delay=delay_seconds, latency=latency)
            metrics.increment_counter("queue:push_total", tags={"queue": queue_type, "tenant": tenant_id})
            
            # [PHASE 11.9] Forensic Push Marker
            logger.info(f"[QUEUE_PUSH_SUCCESS] id={message.get('id')} queue={queue_type} url={queue_url} tenant={tenant_id}")
            logger.info(f"[SQS_MESSAGE_ENQUEUED] id={message.get('id')} queue={queue_type} physical_url={queue_url} tenant={tenant_id} delay={effective_delay}s type={message.get('task_type', 'unknown')}")
            return True
        except Exception as e:
            logger.error(f"[SQS_PUSH_ERR] {e}")
            return False

    def receive(self, queue_type: str, max_messages: int = 1, wait_time: int = 20) -> List[Dict[str, Any]]:
        """
        Hardened SQS Receiver with Phase 11.9 Forensics.
        """
        from core.observability import observability, metrics
        
        queue_url = self._get_queue_url(queue_type)
        sqs = self._get_sqs_client()
        
        if not sqs or not queue_url:
            return []
            
        if self.sqs and self.queue_url:
            try:
                response = self.sqs.receive_message(
                    QueueUrl=self.queue_url,
                    MaxNumberOfMessages=max_messages,
                    WaitTimeSeconds=wait_time,
                    AttributeNames=['All']
                )
                return response.get('Messages', [])
            except Exception as e:
                logger.error(f"SQS Receive Failed: {str(e)}")
                return []
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
                 # [PHASE 11.9] Empty Poll
                 logger.debug(f"[RECEIVE_MESSAGE_EMPTY] queue={queue_type}")
                 return []
            
            # [PHASE 11.9] Success
            logger.info(f"[RECEIVE_MESSAGE_SUCCESS] queue={queue_type} count={len(messages)}")
            
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
                return visible + invisible
            except Exception as e:
                logger.error(f"Failed to get queue depth for {queue_type}: {e}")
        return 0

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
