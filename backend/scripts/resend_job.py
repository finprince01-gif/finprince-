import sys
import os
import asyncio
import django

# Setup Django
sys.path.insert(0, os.getcwd())
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
os.environ["DJANGO_ALLOW_ASYNC_UNSAFE"] = "true"
django.setup()


from vouchers.models import BulkInvoiceJob, InvoiceProcessingItem
from vouchers.pipeline import kafka_client

def get_items(job_id):
    # Run DB ops in sync
    job = BulkInvoiceJob.objects.get(id=job_id)
    items_qs = InvoiceProcessingItem.objects.filter(job=job, parent_item_id=None, status='pending')
    items_list = []
    for item in items_qs:
        items_list.append({
            'job_id':      job.id,
            'tenant_id':   job.tenant_id,
            'item_id':     item.id,
            'storage_key': item.file_path,
            'filename':    os.path.basename(item.file_path),
            'file_hash':   item.file_hash,
        })
    return items_list, job.tenant_id

async def resend_job(job_id):
    try:
        items, tenant_id = get_items(job_id)
        print(f"Resending {len(items)} items for Job {job_id}...")
        
        for payload in items:
            await kafka_client.publish('upload', payload, key=str(tenant_id))
            print(f"  Published Item {payload['item_id']}")
            
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"Error resending job {job_id}: {e}")

if __name__ == "__main__":
    jid = int(sys.argv[1]) if len(sys.argv) > 1 else 11
    asyncio.run(resend_job(jid))
