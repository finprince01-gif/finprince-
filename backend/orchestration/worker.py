import asyncio
import logging
from temporalio.client import Client
from temporalio.worker import Worker

from .workflows import InvoiceProcessingWorkflow
from .activities import (
    segment_pdf_activity,
    ai_extraction_activity,
    assemble_invoice_activity,
    finalize_record_activity,
    cleanup_compensation_activity
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("TemporalWorker")

async def main():
    """
    [PHASE 2] Durable Worker
    Connects to the Temporal Server and listens on the 'invoice-processing-task-queue'.
    """
    # Initialize Temporal Client (Assuming local dev server for now)
    # Start server locally: `temporal server start-dev`
    try:
        client = await Client.connect("localhost:7233")
    except Exception as e:
        logger.error(f"Failed to connect to Temporal server. Ensure 'temporal server start-dev' is running. Error: {e}")
        return

    logger.info("Connected to Temporal server.")

    # Create Worker
    worker = Worker(
        client,
        task_queue="invoice-processing-task-queue",
        workflows=[InvoiceProcessingWorkflow],
        activities=[
            segment_pdf_activity,
            ai_extraction_activity,
            assemble_invoice_activity,
            finalize_record_activity,
            cleanup_compensation_activity
        ],
        # [PHASE 11] Horizontal Scaling parameters
        max_concurrent_activities=100,
        max_concurrent_workflow_tasks=50,
    )

    logger.info("Starting Temporal Worker for Invoice Processing...")
    
    # Run the worker until interrupted
    await worker.run()

if __name__ == "__main__":
    asyncio.run(main())
