from datetime import timedelta
import asyncio
from temporalio import workflow
from typing import List, Dict, Any

# Import activities
with workflow.unsafe.imports_passed_through():
    from .activities import (
        segment_pdf_activity,
        ai_extraction_activity,
        assemble_invoice_activity,
        finalize_record_activity,
        cleanup_compensation_activity
    )

@workflow.defn
class InvoiceProcessingWorkflow:
    """
    [PHASE 2] Durable Workflow Orchestrator
    Replaces the manual SQS + DB Barrier orchestration.
    """
    
    @workflow.run
    async def process_invoice(self, upload_session_id: str, tenant_id: str, file_path: str, record_id: str) -> Dict[str, Any]:
        """
        Main workflow orchestrating the lifecycle of an uploaded invoice.
        Provides exactly-once semantics and durable state checkpoints.
        """
        workflow.logger.info(f"Started InvoiceProcessingWorkflow for record={record_id}")
        
        # SAGA STATE TRACKING
        extracted_pages = []
        is_assembled = False
        
        try:
            # 1. INGESTION & OCR (Segmentation)
            # Replaces the Ingestion SQS queue
            total_pages = await workflow.execute_activity(
                segment_pdf_activity,
                args=[file_path, record_id, tenant_id],
                start_to_close_timeout=timedelta(minutes=5),
                retry_policy=workflow.RetryPolicy(
                    initial_interval=timedelta(seconds=5),
                    maximum_interval=timedelta(minutes=2),
                    maximum_attempts=3,
                    non_retryable_error_types=["FileNotFoundError", "InvalidPDFError"]
                )
            )
            
            if total_pages == 0:
                workflow.logger.warning(f"No pages found for record={record_id}")
                return {"status": "FAILED", "reason": "EMPTY_PDF"}

            # 2. PARALLEL AI EXTRACTION
            # Replaces the AI SQS queue and the DB Barrier
            # This is naturally durable. Temporal will gather all futures.
            extraction_futures = []
            for page_idx in range(1, total_pages + 1):
                future = workflow.execute_activity(
                    ai_extraction_activity,
                    args=[record_id, tenant_id, page_idx],
                    start_to_close_timeout=timedelta(minutes=3),
                    retry_policy=workflow.RetryPolicy(
                        initial_interval=timedelta(seconds=2),
                        backoff_coefficient=2.0,
                        maximum_interval=timedelta(minutes=1),
                        maximum_attempts=5,
                        # Maps to the TerminalTaskError we defined in Phase 4
                        non_retryable_error_types=["TerminalTaskError"] 
                    )
                )
                extraction_futures.append(future)

            # Await all pages (Implicit Barrier)
            # If a worker crashes, Temporal waits and reschedules automatically.
            extracted_pages = await asyncio.gather(*extraction_futures)
            
            # 3. SEMANTIC ASSEMBLY
            # Replaces the Assembly SQS queue
            assembly_result = await workflow.execute_activity(
                assemble_invoice_activity,
                args=[record_id, tenant_id, extracted_pages],
                start_to_close_timeout=timedelta(minutes=2),
                retry_policy=workflow.RetryPolicy(maximum_attempts=3)
            )
            is_assembled = True
            
            # 4. FINALIZATION & STORAGE
            # Replaces the Finalize SQS queue
            finalized_status = await workflow.execute_activity(
                finalize_record_activity,
                args=[record_id, tenant_id, assembly_result],
                start_to_close_timeout=timedelta(minutes=2)
            )
            
            workflow.logger.info(f"Workflow Complete for record={record_id}")
            return {"status": "COMPLETED", "result": finalized_status}

        except Exception as e:
            workflow.logger.error(f"Workflow Failed for record={record_id}: {str(e)}")
            
            # SAGA COMPENSATION (Self-Healing)
            # If we failed mid-flight, safely clean up staging tables
            try:
                await workflow.execute_activity(
                    cleanup_compensation_activity,
                    args=[record_id, tenant_id, is_assembled],
                    start_to_close_timeout=timedelta(minutes=1)
                )
            except Exception as comp_err:
                workflow.logger.error(f"Compensation failed for record={record_id}: {str(comp_err)}")
                
            raise e
