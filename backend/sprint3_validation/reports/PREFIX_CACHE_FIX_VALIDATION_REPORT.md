# Prefix Cache Fix Validation Report — Sprint 3

## 1. Files Modified

The following file was modified:
* [ocr_pipeline/extraction.py](file:///c:/108/AI-accounting-0.03/backend/ocr_pipeline/extraction.py#L640-L648)

---

## 2. Exact Code Diff

The following diff reflects the exact code modification applied to normalise the `voucher_type` before the prompt string is constructed:

```diff
     # ── STEP 2: PREPARE BASE PROMPT (OPTIMIZED — 59.7% token reduction) ──
     # Schema keys and types are UNCHANGED. Instructions compressed from 6 verbose
     # markdown sections into 8 numbered single-line rules (~562 tokens saved/call).
-    base_prompt = f"""Extract {voucher_type} invoice data into this exact JSON schema:
+    normalized_voucher_type = (
+        str(voucher_type or "PURCHASE")
+        .strip()
+        .upper()
+    )
+    base_prompt = f"""Extract {normalized_voucher_type} invoice data into this exact JSON schema:
```

---

## 3. Prefix Hashes Before Fix

Prior to this modification, two distinct prefix cache hashes were generated for Purchase invoices due to casing variations:

* **Title Case (`Purchase`):**
  * Hash: `9e3dc329126df12ee8215ddc38f240b08805020c40233724e6829c68a066b718`
* **Uppercase (`PURCHASE`):**
  * Hash: `0d4e4febb51ff816d64f5582586f1759d58c3d39a4d39a17440683d247b53390`

This casing drift caused prefix cache fragmentation (cache misses and duplicate cache entries).

---

## 4. Prefix Hashes After Fix

Following the application of the casing normalization, the prompt prefix constructed for both pages of the uploaded invoice `IMG_20260406_0006.pdf` consistently formatted to `Extract PURCHASE invoice data...`. 

* **Hashed Result (all pages & requests):**
  * Hash: `0d4e4febb51ff816d64f5582586f1759d58c3d39a4d39a17440683d247b53390`

Both pages successfully hit/share a single cache entry for `PURCHASE` invoice requests.

---

## 5. Metrics & Status

* **Cache fragmentation eliminated:** YES
* **Extraction parity maintained:** YES

The extraction outputs (including Vendor Name, GSTIN, Invoice Number, and Item Count) match the baseline results with 100% precision:
* **Vendor Name:** `SRI VISHNU HEAT TREATERS`
* **GSTIN (Page 1):** `33ABYFS6343M1ZC`
* **Invoice Number:** `4742/25-26`
* **Item Count:** `2` items (SQF - CASEHARDENING & TEMPERING and SHOT BLASTINGS)

---

## 6. Final Verdict

```text
Prefix cache normalization successful.
No downstream behavior changed.
```
