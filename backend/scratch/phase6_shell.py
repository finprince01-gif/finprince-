import os, time, json, redis as rlib, boto3
from botocore.config import Config
from datetime import datetime, timezone
from ocr_pipeline.models import InvoiceTempOCR, SessionFinalizationState, InvoicePageResult
from dotenv import load_dotenv
load_dotenv()

SESSION_ID = "2e284fad-c2ae-4be0-81c6-134203d0c313"
T0_TS = 1750565536.3203
MAX_WAIT = 600
POLL = 15

r = rlib.Redis(host='localhost', port=6379, db=0, decode_responses=True)
sqs = boto3.client('sqs', aws_access_key_id=os.getenv('AWS_ACCESS_KEY_ID'), aws_secret_access_key=os.getenv('AWS_SECRET_ACCESS_KEY'), region_name='ap-south-1', config=Config(max_pool_connections=10))

def sq(q):
    url = f"https://sqs.ap-south-1.amazonaws.com/620468690151/invoice-{q}-queue-local"
    try:
        a = sqs.get_queue_attributes(QueueUrl=url, AttributeNames=['ApproximateNumberOfMessages','ApproximateNumberOfMessagesNotVisible'])['Attributes']
        return int(a.get('ApproximateNumberOfMessages',0)), int(a.get('ApproximateNumberOfMessagesNotVisible',0))
    except: return -1,-1

trace = []
t0 = time.time()
poll_n = 0
done = False

print(f"[PHASE6] session={SESSION_ID}")

while time.time()-t0 < MAX_WAIT and not done:
    elapsed = time.time()-t0
    poll_n += 1
    ev = {'elapsed_s': round(elapsed), 'ts': datetime.now(timezone.utc).isoformat()}

    recs = list(InvoiceTempOCR.objects.filter(upload_session_id=SESSION_ID).values('id','status','supplier_invoice_no'))
    ev['records'] = [{'id':str(x['id']),'status':x['status'],'inv':x['supplier_invoice_no']} for x in recs]

    rec_ids = [str(x['id']) for x in recs]
    states = list(SessionFinalizationState.objects.filter(id__in=rec_ids).values('id','expected_pages','completed_pages','failed_pages','ai_complete','snapshot_created','status')) if rec_ids else []
    ev['states'] = [dict(s) for s in states]

    pages = list(InvoicePageResult.objects.filter(record_id__in=rec_ids).values('record_id','page_number','is_failed').order_by('page_number')) if rec_ids else []
    ev['pages'] = [{'pg':p['page_number'],'fail':p['is_failed'],'rec':str(p['record_id'])} for p in pages]

    ai_v, ai_i = sq('ai')
    asm_v, asm_i = sq('assembly')
    fin_v, fin_i = sq('finalize')
    ev['sqs'] = {'ai':(ai_v,ai_i),'assembly':(asm_v,asm_i),'finalize':(fin_v,fin_i)}

    ai_conc = r.zcard('ai_concurrency:global')
    ev['ai_conc'] = ai_conc

    trace.append(ev)

    print(f"\n[T+{elapsed:.0f}s] Poll#{poll_n} records={len(recs)}")
    for rec in ev['records']: print(f"  record={rec['id']} status={rec['status']} inv={rec['inv']}")
    for st in ev['states']: print(f"  barrier: exp={st['expected_pages']} done={st['completed_pages']} fail={st['failed_pages']} ai_ok={st['ai_complete']} snap={st['snapshot_created']} status={st['status']}")
    print(f"  pages_saved={len(pages)} success={sum(1 for p in pages if not p['is_failed'])} failed={sum(1 for p in pages if p['is_failed'])}")
    print(f"  ai_concurrency:global={ai_conc}  SQS ai=({ai_v}/{ai_i}) asm=({asm_v}/{asm_i}) fin=({fin_v}/{fin_i})")

    statuses = {x['status'] for x in recs}
    terminal = {'FINALIZED','VOUCHER_CREATED','COMPLETED','FAILED','ERROR'}
    if recs and statuses.issubset(terminal):
        print(f"\n[PHASE6] TERMINAL at T+{elapsed:.0f}s: {statuses}")
        done = True
        break
    for st in states:
        if st.get('snapshot_created') and st.get('ai_complete'):
            print(f"\n[PHASE6] PIPELINE COMPLETE at T+{elapsed:.0f}s")
            done = True
            break
    if done: break

    time.sleep(POLL)

with open('scratch/phase6_trace.json','w') as f: json.dump(trace,f,indent=2,default=str)
print(f"\n[PHASE6] Saved {len(trace)} polls to scratch/phase6_trace.json")
print(f"[PHASE6] done={done} elapsed={time.time()-t0:.0f}s")
