Perform a STRICT forensic migration of Purchase Scan onto the existing distributed cluster architecture while creating COMPLETELY SEPARATE Purchase Scan persistence tables.

IMPORTANT:
Use the SAME distributed cluster engine:

* ingestion queue
* AI worker
* assembly worker
* finalize worker
* QueueService
* Redis orchestration
* DTO normalization
* extraction engine

BUT store Purchase Scan results in NEW dedicated Purchase Scan tables ONLY.

DO NOT use:

* Zoho reconstruction tables
* FinalizedSnapshot
* Zoho export tables
* Zoho hydration records

DO NOT change:

* existing Purchase Scan UI
* existing Purchase mapping headers
* existing Purchase rendering logic
* existing Purchase frontend behavior
* existing Purchase column names

OBJECTIVE:
Purchase Scan should behave exactly the same visually,
but internally use:
distributed workers + separate Purchase Scan tables.

CREATE NEW TABLES:
Example:

```python id="6j8gv1"
PurchaseScanJob
PurchaseScanSnapshot
PurchaseScanLineItem
PurchaseScanResult
```

RULES:

1. Purchase Scan uploads MUST enqueue into:

```python id="t9d6bb"
queue_type="ingestion"
task_type="INGESTION"
pipeline_source="PURCHASE_SCAN"
```

2. Distributed workers must process Purchase jobs using:

* same extraction engine
* same OCR
* same AI extraction
* same assembly
* same concurrency system

3. Finalize worker must branch by:

```python id="r3g79p"
pipeline_source
```

Example:

```python id="zncv9t"
if pipeline_source == "PURCHASE_SCAN":
    save_to_purchase_tables()

elif pipeline_source == "ZOHO":
    save_to_zoho_tables()
```

4. Purchase Scan frontend must hydrate ONLY from:

```python id="m9frqn"
PurchaseScanSnapshot
PurchaseScanResult
```

5. Keep ALL Purchase headers EXACTLY unchanged:

```python id="p93j6r"
HSN/SAC
Bill Address To
GSTIN
Branch
Invoice Value
IRN
Ack No
Ack Date
```

6. Preserve current Purchase rendering logic.
   ONLY replace backend persistence source.

7. Add forensic markers:

```text id="lf9msv"
[PURCHASE_SCAN_QUEUE_PUSH]
[PURCHASE_SCAN_AI]
[PURCHASE_SCAN_ASSEMBLY]
[PURCHASE_SCAN_FINALIZE]
[PURCHASE_SCAN_DB_WRITE]
```

8. Remove any legacy sync OCR execution paths used ONLY by Purchase Scan.

9. Verify Purchase Scan now produces:

```text id="ib2j1x"
[QUEUE_PUSH_SUCCESS]
[SQS_MESSAGE_RECEIVED]
[AI_PAGE_SUCCESS]
[ASSEMBLY_PAGE_MERGED]
[PURCHASE_SCAN_FINALIZE]
```

VALIDATION:

1. Upload invoices through Purchase Scan.

2. Verify:

* distributed queues active
* workers processing
* assembly executing
* finalize executing

3. Verify DB isolation:

* Purchase Scan data ONLY in PurchaseScan tables
* Zoho data ONLY in Zoho tables

4. Verify frontend remains visually identical.

IMPORTANT:
There must still be ONLY ONE distributed cluster system.

The separation happens ONLY at final persistence/storage level.
