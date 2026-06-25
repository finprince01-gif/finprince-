# TRANSLATOR FORENSIC AUDIT REPORT
## Read-Only Investigation — Source Code Evidence Only

**Date:** 2026-06-22  
**Scope:** OCR/AI extraction layer — provider abstraction, DTO canonicalization, Textract compatibility  
**Constraint:** NO CODE CHANGES. Evidence from source files only.

---

## PHASE 1 — FILE INVENTORY & DEPENDENCY GRAPH

### 1.1 File Discovery Results

There is **no file named `translator.py`** in this codebase. The "translation" function is distributed across the following files:

| File | Path | Size | Role |
|------|------|------|------|
| `base.py` | `core/providers/base.py` | 2,556 B | Abstract AI provider interface |
| `qwen_provider.py` | `core/providers/qwen_provider.py` | 23,550 B | Sole concrete AI provider |
| `__init__.py` | `core/providers/__init__.py` | 315 B | Provider registry |
| `ai_proxy.py` | `core/ai_proxy.py` | 52,821 B | Central orchestrator (concurrency, rate limit, retry) |
| `ai_service.py` | `core/ai_service.py` | 29,659 B | Prompt builder + cache entry point |
| `extraction.py` | `ocr_pipeline/extraction.py` | 55,147 B | JSON repair pipeline (`_repair_json`) |
| `normalize.py` | `ocr_pipeline/normalize.py` | 56,607 B | **Canonical DTO factory** (`get_canonical_export_record`) |
| `canonicalizer.py` | `ocr_pipeline/canonicalizer.py` | 18,596 B | OCR correction layer (Invoice No, GSTIN, Date, Vendor, HSN) |
| `ai_worker.py` | `vouchers/ai_worker.py` | ~42,764 B | Async worker that calls the provider and persists results |

### 1.2 Dependency Graph

```
Upload → ingestion_worker
           └─→ SQS (ai queue)
                  └─→ AIWorker._handle_task_inner()
                         ├─→ OCRResponseCache.get()          [cache hit fast-path]
                         ├─→ process_ai_request()            [ai_proxy.py]
                         │      ├─→ DistributedConcurrencyManager.acquire_permit()
                         │      ├─→ RateLimiter.check_rate_limit()
                         │      ├─→ CircuitBreaker.is_open()
                         │      └─→ execute_with_retry()
                         │             └─→ _ai_provider.call_single()   ← QwenProvider
                         │                    └─→ OpenAI(base_url=QWEN_API_BASE)
                         │                           └─→ [Ollama/vLLM]
                         ├─→ _repair_json()                  [extraction.py]
                         ├─→ get_canonical_export_record()   [normalize.py]
                         │      ├─→ get_normalized_export_record()
                         │      ├─→ get_normalized_items()
                         │      ├─→ GSTINOwnershipClassifier.classify_gstins()
                         │      └─→ DocumentIdentityCanonicalizer.canonicalize_invoice()
                         │             └─→ [canonicalizer.py]
                         └─→ terminalize_page_state()
                                └─→ [coordinator.py → assembly_worker]
```

---

## PHASE 2 — EXECUTION FLOW (Upload → Finalization)

### Step 1 — Upload & Ingestion
- User uploads PDF to the Django API.
- `ingestion_worker` slices the PDF into pages and pushes one SQS message per page to the `ai` queue.

### Step 2 — AIWorker receives task
File: `vouchers/ai_worker.py`, `_handle_task_inner()` (line 137)
```python
payload = task['payload']
record_id = payload.get('record_id')
```

### Step 3 — Cache check (fast-path)
File: `vouchers/ai_worker.py`, lines 232–301
```python
cached_payload = OCRResponseCache.get(file_hash, page_idx)
if cached_payload:
    # Skip AI provider entirely
    terminalize_page_state(...)
    return
```

### Step 4 — AI provider call (core path)
File: `vouchers/ai_worker.py`, lines 322–325
```python
result = await loop.run_in_executor(
    self.executor,
    lambda cp=current_payload: process_ai_request(cp)
)
```

`process_ai_request()` is defined in `core/ai_proxy.py` (line 884).  
It governs: concurrency permits → rate limiter → circuit breaker → API key → `execute_with_retry()`.

### Step 5 — Provider call
File: `core/ai_proxy.py`, `execute_with_retry()` (line 634)
```python
result = _ai_provider.call_single(
    prompt_text=prompt_text,
    image_b64=image_b64,
    ...
    model_name=current_model,
)
```

`_ai_provider` is a singleton `QwenProvider()` instantiated at module load (line 42).

### Step 6 — Qwen HTTP call
File: `core/providers/qwen_provider.py`, `call_single()` (line 306)
```python
response = client.chat.completions.create(
    model=model_name,
    messages=messages,
    max_tokens=4096,
    temperature=0.0,
)
```

Returns: **raw model response string** (raw JSON text, possibly wrapped in markdown fences).

### Step 7 — JSON repair pipeline
File: `ocr_pipeline/extraction.py`, `_repair_json()` (line 334)

8-stage deterministic pipeline:
1. Strip markdown fences
2. Brace-balance isolation
3. Remove trailing commas
4. Repair invalid escape sequences
5. **Arithmetic expression repair** (prevents wasted 141s Qwen retries)
6. `json.loads()` first attempt
7. Smart-quote normalization
8. Quarantine log on failure

### Step 8 — Canonical DTO construction
File: `ocr_pipeline/normalize.py`, `get_canonical_export_record()` (line 927)

This is the **authoritative translation step**. It:
1. Calls `get_normalized_export_record()` — extracts header fields with 5-level fallback hierarchy (root → header → sections → aliases → item promotion)
2. Calls `get_normalized_items()` — extracts and normalizes line items
3. Calls `GSTINOwnershipClassifier.classify_gstins()` — resolves vendor/buyer/consignee GSTIN roles
4. Calls `DocumentIdentityCanonicalizer.canonicalize_invoice()` — OCR repair for Invoice No, GSTIN, Date, Vendor, HSN
5. Constructs `CanonicalInvoiceSchema` (Pydantic model)
6. Returns a `dict` — **this is the canonical DTO**

### Step 9 — Persistence & forwarding
File: `vouchers/ai_worker.py`, `_persist()` inner function (line 658)
```python
terminalize_page_state(
    record_id=..., page_number=..., is_failed=...,
    canonical_payload=canonical_payload, ...
)
trigger_next_fanout(record_id)
```

After all pages complete, `assembly_worker` → `finalize_worker` → export.

---

## PHASE 3 — RAW INPUT TO QWEN

### 3.1 Message format sent to Qwen

File: `core/providers/qwen_provider.py`, lines 256–296

**Single-image mode:**
```python
messages = [
    {
        "role": "system",
        "content": "Expert Indian GST invoice OCR. Return ONLY valid JSON per the given schema. No markdown, no explanation."
    },
    {
        "role": "user",
        "content": [
            {"type": "text", "text": prompt_text},
            {
                "type": "image_url",
                "image_url": {"url": f"data:{mime_type};base64,{image_b64}"}
            }
        ]
    }
]
```

**Batch-image mode (multi-page):**
```python
user_content = [{"type": "text", "text": prompt_text}]
for img in batch_images:
    user_content.append({
        "type": "image_url",
        "image_url": {"url": f"data:{img_mime};base64,{img_b64}"}
    })
```

### 3.2 Model parameters
- `temperature=0.0` — fully deterministic extraction
- `max_tokens=4096`
- Transport: OpenAI-compatible REST via `openai.OpenAI(base_url=QWEN_API_BASE)`

---

## PHASE 4 — TRANSLATOR OUTPUT & CANONICAL DTO STRUCTURE

### 4.1 Raw AI output
- **Type:** `str` — raw JSON text from the model
- **Format:** `{"header": {...}, "items": [...]}`
- **May contain:** markdown fences, arithmetic expressions, smart quotes, trailing commas

### 4.2 After `_repair_json()`
- **Type:** `str` — valid JSON string
- **Parsed to:** `dict`

### 4.3 After `get_canonical_export_record()` — Final canonical DTO

This is the **single authoritative DTO schema** all downstream systems consume:

```python
{
    # === HEADER FIELDS ===
    "invoice_no":           str,
    "invoice_date":         str,   # normalized to ISO / DD-MM-YYYY
    "vendor_name":          str,
    "gstin":                str,   # vendor GSTIN
    "raw_gstin":            str,   # as extracted, before repair
    "canonical_gstin":      str,   # after OCR correction
    "branch":               str,
    "bill_from":            str,
    "bill_to":              str,
    "place_of_supply":      str,
    "total_taxable_value":  float,
    "total_igst":           float,
    "total_cgst":           float,
    "total_sgst":           float,
    "total_cess":           float,
    "round_off":            float,
    "total_invoice_value":  float,
    "irn":                  str,
    "ack_no":               str,
    "ack_date":             str,
    # === GSTIN ROLE FIELDS ===
    "vendor_gstin":         str,
    "buyer_gstin":          str,
    "consignee_gstin":      str,
    "ship_to_gstin":        str,
    "bill_to_gstin":        str,
    "raw_vendor_gstin":     str,
    "raw_buyer_gstin":      str,
    # === CANONICALIZED AUDIT FIELDS ===
    "raw_invoice_no":           str,
    "canonical_invoice_no":     str,
    "raw_vendor_name":          str,
    "canonical_vendor_name":    str,
    "raw_invoice_date":         str,
    "canonical_invoice_date":   str,
    # === ITEMS ===
    "items": [
        {
            "description":      str,
            "hsn_sac":          str,
            "qty":              float,
            "uom":              str,
            "rate":             float,
            "taxable_value":    float,
            "igst":             float,
            "cgst":             float,
            "sgst":             float,
            "total_amount":     float,
            "igst_rate":        float,
            "cgst_rate":        float,
            "sgst_rate":        float,
            "cess_rate":        float,
            "computed_gst_rate": float,
            "raw_item_name":    str,
            "canonical_item_name": str,
            "raw_hsn":          str,
            "canonical_hsn":    str,
        }
    ],
    # === LIFECYCLE FIELDS (underscore-prefixed) ===
    "_pdf_ocr_text":        str,   # raw OCR text from PDF
    "_raw_text":            str,   # alias
    "_error":               str,   # set on failure
    "record_id":            str,
    "upload_session_id":    str,
    "tenant_id":            str,
    "job_id":               str,
    "warnings":             list,
}
```

**Evidence:** `ocr_pipeline/normalize.py` lines 975–1016 (schema_data construction), 1038–1075 (item coercion into `CanonicalInvoiceItem`), 1115–1118 (underscore field preservation).

---

## PHASE 5 — COMPONENTS THAT CONSUME THE CANONICAL DTO

All components listed below receive the `canonical_payload` dict from `terminalize_page_state()`. **None of them call the AI provider directly.** They are provider-agnostic by design.

| Component | File | What it consumes |
|-----------|------|-----------------|
| `assembly_worker` | `vouchers/assembly_worker.py` | Merges per-page canonical payloads into a session record |
| `forensic_merger.py` | `ocr_pipeline/forensic_merger.py` | Merges multi-page DTOs, resolves conflicts |
| `finalize_worker` | `vouchers/finalize_worker.py` | Writes final invoice record to DB |
| `pipeline.py` | `ocr_pipeline/pipeline.py` | Session state machine, barrier logic |
| `views.py` | `ocr_pipeline/views.py` | API egress — exposes `get_ui_payload()` |
| `normalize.py` | `ocr_pipeline/normalize.py` | `get_ui_payload()` passes through canonical DTO to UI |
| `integrity_enforcer.py` | `ocr_pipeline/integrity_enforcer.py` | Validates totals, tax math |
| `inventory_validation.py` | `ocr_pipeline/inventory_validation.py` | Item matching |
| `export_worker` | `vouchers/export_worker.py` | Serializes to Tally/Zoho/SAP format |

**Evidence:** `ai_worker.py` lines 658–707 (terminalize_page_state then trigger_next_fanout — no downstream component re-calls AI).

---

## PHASE 6 — PROVIDER ABSTRACTION ANALYSIS

### 6.1 The abstract contract

File: `core/providers/base.py` (complete file)

```python
class BaseAIProvider:
    def call_single(
        self,
        prompt_text: str,
        image_b64: Optional[str],
        mime_type: str,
        batch_images: Optional[List[dict]],
        request_data: dict,
        api_key: str,
        model_name: str,
        attempt_label: str = "Attempt 1",
    ) -> str:
        """Returns: Raw text response from the AI model (JSON string from model)."""
        raise NotImplementedError(...)

    def get_model_name(self) -> str: ...
    def recheck_key_health(self, api_key: str, model_name: str) -> bool: ...
```

**All provider-specific logic is isolated inside `call_single()`.**  
**The return value contract is identical across all providers: a raw JSON string.**

### 6.2 Provider registration

File: `core/providers/__init__.py`
```python
from .base import BaseAIProvider
from .qwen_provider import QwenProvider
__all__ = ["BaseAIProvider", "QwenProvider"]
```

### 6.3 Provider instantiation

File: `core/ai_proxy.py`, lines 41–42
```python
from core.providers.qwen_provider import QwenProvider
_ai_provider = QwenProvider()
```

This is a **module-level singleton**. `process_ai_request()` always calls `_ai_provider.call_single()`.

### 6.4 Provider hard-coupling points

The following locations **hard-reference `QwenProvider` or Qwen-specific config**:

| File | Line | Reference |
|------|------|-----------|
| `core/ai_proxy.py` | 35 | `AI_MODEL_NAME = os.getenv("QWEN_MODEL", "qwen-vl-max")` |
| `core/ai_proxy.py` | 41–42 | `from core.providers.qwen_provider import QwenProvider; _ai_provider = QwenProvider()` |
| `core/ai_proxy.py` | 357–359 | `concurrency_governor = DistributedConcurrencyManager(max_concurrent=int(os.getenv('AI_GLOBAL_CONCURRENCY', '1')))` |
| `core/ai_proxy.py` | 366–474 | `ensure_qwen_context_limit()` — Ollama-specific `/api/show` and `ollama create` |
| `core/ai_proxy.py` | 493–585 | `validate_ai_on_startup()` references `QWEN_API_BASE`, `QWEN_MODEL` |
| `core/ai_proxy.py` | 510 | `from core.providers.qwen_provider import check_endpoint_health` |
| `core/providers/__init__.py` | 8 | `from .qwen_provider import QwenProvider` |
| `core/ai_proxy.py` | 1200–1206 | `get_stats()` returns `'provider': 'Qwen'` and `'model': AI_MODEL_NAME` |
| `.env` | - | `QWEN_MODEL`, `QWEN_API_BASE`, `QWEN_API_KEY` |

**All other pipeline files are provider-agnostic.** They never import from `core/providers/`.

---

## PHASE 7 — THE CRITICAL QUESTION: IF QWEN IS REMOVED TOMORROW

### Files that MUST change (evidence-based)

| # | File | What must change | Evidence |
|---|------|-----------------|----------|
| 1 | `core/providers/qwen_provider.py` | **DELETE** entire file | It is the sole Qwen implementation |
| 2 | `core/providers/__init__.py` | Remove `from .qwen_provider import QwenProvider` and `__all__` reference | Lines 8, 10 |
| 3 | `core/ai_proxy.py` | Replace `from core.providers.qwen_provider import QwenProvider; _ai_provider = QwenProvider()` (lines 41–42) with new provider import | Lines 41–42 |
| 4 | `core/ai_proxy.py` | Replace `AI_MODEL_NAME = os.getenv("QWEN_MODEL", ...)` (line 35) with new env var | Line 35 |
| 5 | `core/ai_proxy.py` | Replace `ensure_qwen_context_limit()` (lines 366–474) — Ollama-specific, not applicable to Textract | Lines 366–474 |
| 6 | `core/ai_proxy.py` | Replace `validate_ai_on_startup()` QWEN_API_BASE/QWEN_MODEL checks (lines 493–537) | Lines 493–537 |
| 7 | `core/ai_proxy.py` | Remove `from core.providers.qwen_provider import check_endpoint_health` (line 510) | Line 510 |
| 8 | `core/ai_proxy.py` | Remove GPU startup validation block (lines 539–577) — Qwen-specific, Textract needs none | Lines 539–577 |
| 9 | `.env` | Remove `QWEN_MODEL`, `QWEN_API_BASE`, `QWEN_API_KEY`. Add new provider credentials | `.env` |

### Files that remain COMPLETELY UNTOUCHED (evidence-based)

| File | Reason |
|------|--------|
| `ocr_pipeline/extraction.py` | Only calls `_repair_json()` — provider-agnostic JSON repair |
| `ocr_pipeline/normalize.py` | Only processes the canonical DTO dict — no provider reference |
| `ocr_pipeline/canonicalizer.py` | Pure OCR field repair logic — no provider reference |
| `ocr_pipeline/pipeline.py` | Session state machine — calls `trigger_next_fanout()`, no AI |
| `ocr_pipeline/forensic_merger.py` | DTO merger — no AI reference |
| `ocr_pipeline/integrity_enforcer.py` | Tax math validator — no AI reference |
| `ocr_pipeline/models.py` | DB models — no AI reference |
| `vouchers/assembly_worker.py` | Reads canonical_payload from DB — no AI reference |
| `vouchers/finalize_worker.py` | Reads assembled record from DB — no AI reference |
| `vouchers/export_worker.py` | Serializes to ERP format — no AI reference |
| `vouchers/worker_base.py` | SQS poll loop — no AI reference |
| `core/redis_orchestrator.py` | Redis state — no AI reference |
| `core/sqs.py` | SQS transport — no AI reference |
| `ocr_pipeline/gstin_classifier.py` | Pure regex/rule classifier — no AI reference |

---

## PHASE 8 — TEXTRACT INTEGRATION COMPATIBILITY ASSESSMENT

### 8.1 What Textract returns vs what the pipeline expects

The pipeline expects `call_single()` to return a **raw JSON string** conforming to:
```json
{
  "header": {"vendor_name": "...", "invoice_no": "...", ...},
  "items": [{"description": "...", "quantity": ..., ...}]
}
```

Amazon Textract returns structured key-value pairs and table cells — **not this JSON schema**.

### 8.2 Integration approach

A `TextractProvider` would need to:
1. Call the Textract API (not a vision LLM)
2. Parse Textract's `AnalyzeDocument` or `ExpenseDocument` response
3. **Map Textract output → the Qwen JSON schema** (the DTO translator function)
4. Return the resulting JSON string from `call_single()`

Steps 1–3 are entirely inside a new `textract_provider.py`. Steps 4+ require **zero changes** to any downstream file.

### 8.3 Files that would need to change for Textract

| File | Change |
|------|--------|
| `core/providers/textract_provider.py` | **[NEW]** Implement `call_single()` using boto3 Textract API, map output to Qwen schema |
| `core/providers/__init__.py` | Add `from .textract_provider import TextractProvider` |
| `core/ai_proxy.py` | Swap `_ai_provider = QwenProvider()` → `_ai_provider = TextractProvider()` |
| `core/ai_proxy.py` | Replace Qwen-specific env var reads, remove GPU validation, remove Ollama health check |
| `.env` | Add `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `TEXTRACT_FEATURE_TYPE` |

**No other file changes.** The 8-stage JSON repair, canonical DTO, GSTIN classifier, assembly, finalization, and export layers are all completely agnostic to how the JSON was produced.

---

## SUMMARY TABLE

| Question | Answer | Evidence |
|----------|--------|----------|
| Does `translator.py` exist? | **No.** The function is distributed across `ai_proxy.py`, `normalize.py`, `canonicalizer.py` | `Get-ChildItem` search returned zero results |
| What is the canonical DTO layer? | `get_canonical_export_record()` in `normalize.py` (line 927) | Source code, function docstring: "DOWNSTREAM SYSTEMS MUST ONLY USE THIS" |
| What does `call_single()` return? | Raw JSON string from the model | `base.py` docstring: "Returns: Raw text response from the AI model (JSON string from model)" |
| Is the provider swappable? | **Yes**, at exactly 3 sites in `ai_proxy.py` (import, singleton, env vars) | Lines 35, 41–42, and startup validation |
| How many files must change if Qwen is removed? | **9** (3 core, 1 env) | Enumerated above with line numbers |
| How many files remain untouched? | **14+** (all downstream pipeline files) | Enumerated above |
| Can Textract be integrated? | **Yes**, via a new `TextractProvider` that maps Textract output to the Qwen JSON schema in `call_single()` | BaseAIProvider contract, lines 26–59 |
| Is GPU/Ollama logic coupled to the provider? | **Yes** — `ensure_qwen_context_limit()` and GPU startup validation are Qwen-specific. Must be removed or replaced | `ai_proxy.py` lines 366–577 |

---

*Report generated from source code only. No assumptions. No recommendations. Evidence only.*
