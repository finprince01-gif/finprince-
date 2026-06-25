# Qwen Runtime Prompt Forensic Report

This forensic report analyzes the actual, exact prompt constructed and sent to Qwen during the visual data extraction process of the invoice `IMG_20260406_0006.pdf`.

---

## 1. Forensic Path: Trace of Prompt Creation

The execution path traces as follows:

1. **Ingestion & Text Extraction Entrypoint:**
   * **File:** [ocr_pipeline/pipeline.py](file:///c:/108/AI-accounting-0.03/backend/ocr_pipeline/pipeline.py)
   * **Function:** `execute_isolated_ocr_pipeline()` or batch paths
   * **Line Number:** ~580-600
   * **Action:** Triggers isolated OCR reading of the target PDF pages.

2. **OCR Parsing & Page Preparation:**
   * **File:** [ocr_pipeline/isolated_ocr_service.py](file:///c:/108/AI-accounting-0.03/backend/ocr_pipeline/isolated_ocr_service.py)
   * **Function:** `run_isolated_page_extraction()`
   * **Action:** Returns image bytes (`image_bytes`) and OCR string (`text`) for each page using PaddleOCR.

3. **Prompt Construction:**
   * **File:** [ocr_pipeline/extraction.py](file:///c:/108/AI-accounting-0.03/backend/ocr_pipeline/extraction.py)
   * **Function:** `extract_invoice()` (Step 2 prepares `base_prompt`, and `_call_ai_for_page()` compiles `page_isolated_prompt` by combining `base_prompt` with the page-specific OCR data).
   * **Line Numbers:** [L640-L648](file:///c:/108/AI-accounting-0.03/backend/ocr_pipeline/extraction.py#L640-L648) (`base_prompt` assembly) and [L690-L691](file:///c:/108/AI-accounting-0.03/backend/ocr_pipeline/extraction.py#L690-L691) (`page_isolated_prompt` concatenation).

4. **SQS Task Dispatching & AI Worker Pickup:**
   * **File:** [vouchers/ai_worker.py](file:///c:/108/AI-accounting-0.03/backend/vouchers/ai_worker.py) or [vouchers/unified_worker.py](file:///c:/108/AI-accounting-0.03/backend/vouchers/unified_worker.py)
   * **Function:** `process_task()` / `_handle_task_inner()`
   * **Action:** Dequeues the message task payload and passes the variables to the AI Proxy.

5. **AI Gateway Proxy Routing:**
   * **File:** [core/ai_proxy.py](file:///c:/108/AI-accounting-0.03/backend/core/ai_proxy.py)
   * **Function:** `call_ai_for_extractions()`
   * **Action:** Decides on using the designated `QwenProvider` model backend.

6. **Final API Delivery:**
   * **File:** [core/providers/qwen_provider.py](file:///c:/108/AI-accounting-0.03/backend/core/providers/qwen_provider.py)
   * **Function:** `call_single()`
   * **Line Number:** [L306-L311](file:///c:/108/AI-accounting-0.03/backend/core/providers/qwen_provider.py#L306-L311)
   * **Action:** Calls `client.chat.completions.create` to transmit the messages payload (System + User prompt including text and image) to the self-hosted Ollama/vLLM backend.

---

## 2. Base Prompt (`base_prompt`)

Below is the complete base prompt source code containing extraction instructions, rules, JSON schema, and validation guidance:

```text
Extract PURCHASE invoice data into this exact JSON schema:

{"header":{"vendor_name":"","vendor_address":"","billing_address":"","vendor_gstin":"","vendor_state":"","place_of_supply":"","invoice_no":"","invoice_date":"","total_amount":0,"taxable_value":0,"cgst":0,"sgst":0,"igst":0,"gst_taxability_type":"Taxable","gst_nature_of_transaction":"","sales_order_no":"","irn":"","ack_no":"","ack_date":""},"items":[{"description":"","hsn_code":"","quantity":0,"uom":"","rate":0,"discount_percent":0,"taxable_value":0,"igst_rate":0,"igst_amount":0,"cgst_rate":0,"cgst_amount":0,"sgst_rate":0,"sgst_amount":0,"cess_rate":0,"cess_amount":0,"amount":0}]}

RULES:
1. header: one entry per invoice; items: one row per line item.
2. vendor_address = "Consignee/Ship To" block; billing_address = "Buyer/Bill To" block only. Never mix them. Null if absent.
3. invoice_no: prefer label "Invoice No"/"Bill No", near top/date, must have ≥1 digit, 3-25 chars.
4. place_of_supply: state name or code (e.g. "33-Tamil Nadu").
5. total_amount = taxable_value + cgst + sgst + igst. item amount = taxable_value + taxes.
6. HSN/SAC and UOM per item if visible.
7. Continuation page: extract invoice_no and vendor_name from top labels; markers: "continued","amount chargeable","authorised signatory","rounded off".
8. Missing field → null. No hallucination. All numeric fields must be numbers.
Return ONLY valid JSON.
```

---

## 3. OCR Text Injection Code

The page-specific OCR text is appended directly below the base prompt in [ocr_pipeline/extraction.py:L690-L691](file:///c:/108/AI-accounting-0.03/backend/ocr_pipeline/extraction.py#L690-L691):

```python
        # Ensure ONLY this page's OCR text is included. 
        # Prefix caching requires base_prompt (rules & schema) to be placed BEFORE page_ocr_text.
        page_isolated_prompt = f"{base_prompt}\n\n### [PAGE {page_idx+1} OCR DATA]\n{page_ocr_text}"
```

---

## 4. Real Runtime Prompt (for `IMG_20260406_0006.pdf`, Page 1)

### A. System Prompt
```text
Expert Indian GST invoice OCR. Return ONLY valid JSON per the given schema. No markdown, no explanation.
```

### B. User Prompt
```text
Extract PURCHASE invoice data into this exact JSON schema:

{"header":{"vendor_name":"","vendor_address":"","billing_address":"","vendor_gstin":"","vendor_state":"","place_of_supply":"","invoice_no":"","invoice_date":"","total_amount":0,"taxable_value":0,"cgst":0,"sgst":0,"igst":0,"gst_taxability_type":"Taxable","gst_nature_of_transaction":"","sales_order_no":"","irn":"","ack_no":"","ack_date":""},"items":[{"description":"","hsn_code":"","quantity":0,"uom":"","rate":0,"discount_percent":0,"taxable_value":0,"igst_rate":0,"igst_amount":0,"cgst_rate":0,"cgst_amount":0,"sgst_rate":0,"sgst_amount":0,"cess_rate":0,"cess_amount":0,"amount":0}]}

RULES:
1. header: one entry per invoice; items: one row per line item.
2. vendor_address = "Consignee/Ship To" block; billing_address = "Buyer/Bill To" block only. Never mix them. Null if absent.
3. invoice_no: prefer label "Invoice No"/"Bill No", near top/date, must have ≥1 digit, 3-25 chars.
4. place_of_supply: state name or code (e.g. "33-Tamil Nadu").
5. total_amount = taxable_value + cgst + sgst + igst. item amount = taxable_value + taxes.
6. HSN/SAC and UOM per item if visible.
7. Continuation page: extract invoice_no and vendor_name from top labels; markers: "continued","amount chargeable","authorised signatory","rounded off".
8. Missing field → null. No hallucination. All numeric fields must be numbers.
Return ONLY valid JSON.


### [PAGE 1 OCR DATA]
Tax Invoice | (ORIGINAL FOR RECIPIENT) | e-Invoice IRN | : 57bd9abf89e1d6f519d0b5e49b4175eefbc9206d96c50e1. 2cd721b5541c76642 Ack No. : 152523027902150 Ack Date: 13-Sep-2025 SRI VISHNU HEAT TREATERS | Invoice No. | Dated 4742/25-26 | 13-Sep-2025 BRANCH OFFICE SF NO 75/2 B SITe | 24/1 COSMOFAN FO Delivery Note | Mode/Terms of Payment rUnnatur viLLage annur pin 641107 | 2601/25-26 BRANCH OFI | NO.2/166 SF NO 472/1D | Reference No. & Date. | Other References BALAJ! INDUSTRIAL PARK MGCP VILLAGE SENTHAMPALAYAMGSTIN/UIN: 33ABYI | 4742 dt. 13-Sep-2025 Buyer's Order No. Consignee (Ship to) | JC/043/25-26 | 8-Sep-2025 N.S.SOLUTION | Dispatch Doc No. | Delivery Note Date SF NO: 195, VILANKURICHI RD, SUNDHARAR STREET, | Dispatched through | Destination COIMBATORE I State NameGSTIN/UIN | Tamil Nadu, Code : 33 33CKJPS6256F1ZW | Terms of Delivery Buyer (Bill to) Accuturn Machiners Private Limited 13 A,THUDIYALUR-KANUVAI ROAD APPANAICKENPALAYAM K.VADAMADURAI POST Coimbatore | 33ABACA5718R1ZD State Name Place of Supply .Tamil Nadu SI | Description of | HSN/SAC Quantity Rate per | Amount No. | Services 1 SQF - CASEHARDENING & TEMPERING(KGS) 998898 910.740 kgs 60.00kgs | 54,644.40 B65-6008 PIN 1059-NOS 2 SHOT BLASTINGS(KGS) 12.00kgs | 10,928.88 65,573.28 OUTPUT CGST@6% | 6% | 3,934.39 OUTPUT SgST@6% continued to page number 2 This is a Computer Generated Invoice
```

---

## 5. Prompt Metrics

* **System Prompt character count:** 104 chars
* **User Prompt character count:** 2782 chars
* **Prefix text character count (cached portion):** 1391 chars
* **OCR text character count (dynamic portion):** 1388 chars (includes `### [PAGE 1 OCR DATA]` header)
* **Total request character count:** 2886 chars (System + User prompt)

---

## 6. Exact Payload Sent to Qwen

```json
{
  "model": "qwen2.5vl:7b",
  "messages": [
    {
      "role": "system",
      "content": "Expert Indian GST invoice OCR. Return ONLY valid JSON per the given schema. No markdown, no explanation."
    },
    {
      "role": "user",
      "content": [
        {
          "type": "text",
          "text": "Extract PURCHASE invoice data into this exact JSON schema:\n\n{\"header\":{\"vendor_name\":\"\",\"vendor_address\":\"\",\"billing_address\":\"\",\"vendor_gstin\":\"\",\"vendor_state\":\"\",\"place_of_supply\":\"\",\"invoice_no\":\"\",\"invoice_date\":\"\",\"total_amount\":0,\"taxable_value\":0,\"cgst\":0,\"sgst\":0,\"igst\":0,\"gst_taxability_type\":\"Taxable\",\"gst_nature_of_transaction\":\"\",\"sales_order_no\":\"\",\"irn\":\"\",\"ack_no\":\"\",\"ack_date\":\"\"},\"items\":[{\"description\":\"\",\"hsn_code\":\"\",\"quantity\":0,\"uom\":\"\",\"rate\":0,\"discount_percent\":0,\"taxable_value\":0,\"igst_rate\":0,\"igst_amount\":0,\"cgst_rate\":0,\"cgst_amount\":0,\"sgst_rate\":0,\"sgst_amount\":0,\"cess_rate\":0,\"cess_amount\":0,\"amount\":0}]}\n\nRULES:\n1. header: one entry per invoice; items: one row per line item.\n2. vendor_address = \"Consignee/Ship To\" block; billing_address = \"Buyer/Bill To\" block only. Never mix them. Null if absent.\n3. invoice_no: prefer label \"Invoice No\"/\"Bill No\", near top/date, must have \u22651 digit, 3-25 chars.\n4. place_of_supply: state name or code (e.g. \"33-Tamil Nadu\").\n5. total_amount = taxable_value + cgst + sgst + igst. item amount = taxable_value + taxes.\n6. HSN/SAC and UOM per item if visible.\n7. Continuation page: extract invoice_no and vendor_name from top labels; markers: \"continued\",\"amount chargeable\",\"authorised signatory\",\"rounded off\".\n8. Missing field \u2192 null. No hallucination. All numeric fields must be numbers.\nReturn ONLY valid JSON.\n\n\n### [PAGE 1 OCR DATA]\nTax Invoice | (ORIGINAL FOR RECIPIENT) | e-Invoice IRN | : 57bd9abf89e1d6f519d0b5e49b4175eefbc9206d96c50e1. 2cd721b5541c76642 Ack No. : 152523027902150 Ack Date: 13-Sep-2025 SRI VISHNU HEAT TREATERS | Invoice No. | Dated 4742/25-26 | 13-Sep-2025 BRANCH OFFICE SF NO 75/2 B SITe | 24/1 COSMOFAN FO Delivery Note | Mode/Terms of Payment rUnnatur viLLage annur pin 641107 | 2601/25-26 BRANCH OFI | NO.2/166 SF NO 472/1D | Reference No. & Date. | Other References BALAJ! INDUSTRIAL PARK MGCP VILLAGE SENTHAMPALAYAMGSTIN/UIN: 33ABYI | 4742 dt. 13-Sep-2025 Buyer's Order No. Consignee (Ship to) | JC/043/25-26 | 8-Sep-2025 N.S.SOLUTION | Dispatch Doc No. | Delivery Note Date SF NO: 195, VILANKURICHI RD, SUNDHARAR STREET, | Dispatched through | Destination COIMBATORE I State NameGSTIN/UIN | Tamil Nadu, Code : 33 33CKJPS6256F1ZW | Terms of Delivery Buyer (Bill to) Accuturn Machiners Private Limited 13 A,THUDIYALUR-KANUVAI ROAD APPANAICKENPALAYAM K.VADAMADURAI POST Coimbatore | 33ABACA5718R1ZD State Name Place of Supply .Tamil Nadu SI | Description of | HSN/SAC Quantity Rate per | Amount No. | Services 1 SQF - CASEHARDENING & TEMPERING(KGS) 998898 910.740 kgs 60.00kgs | 54,644.40 B65-6008 PIN 1059-NOS 2 SHOT BLASTINGS(KGS) 12.00kgs | 10,928.88 65,573.28 OUTPUT CGST@6% | 6% | 3,934.39 OUTPUT SgST@6% continued to page number 2 This is a Computer Generated Invoice"
        },
        {
          "type": "image_url",
          "image_url": {
            "url": "data:image/jpeg;base64,<BASE64_IMAGE_BYTES_REDACTED>"
          }
        }
      ]
    }
  ],
  "max_tokens": 4096,
  "temperature": 0.0
}
```

---

## 7. Prefix Cache Boundary

### A. Hashed Prefix Text (`prefix_text`)
```text
Extract PURCHASE invoice data into this exact JSON schema:

{"header":{"vendor_name":"","vendor_address":"","billing_address":"","vendor_gstin":"","vendor_state":"","place_of_supply":"","invoice_no":"","invoice_date":"","total_amount":0,"taxable_value":0,"cgst":0,"sgst":0,"igst":0,"gst_taxability_type":"Taxable","gst_nature_of_transaction":"","sales_order_no":"","irn":"","ack_no":"","ack_date":""},"items":[{"description":"","hsn_code":"","quantity":0,"uom":"","rate":0,"discount_percent":0,"taxable_value":0,"igst_rate":0,"igst_amount":0,"cgst_rate":0,"cgst_amount":0,"sgst_rate":0,"sgst_amount":0,"cess_rate":0,"cess_amount":0,"amount":0}]}

RULES:
1. header: one entry per invoice; items: one row per line item.
2. vendor_address = "Consignee/Ship To" block; billing_address = "Buyer/Bill To" block only. Never mix them. Null if absent.
3. invoice_no: prefer label "Invoice No"/"Bill No", near top/date, must have ≥1 digit, 3-25 chars.
4. place_of_supply: state name or code (e.g. "33-Tamil Nadu").
5. total_amount = taxable_value + cgst + sgst + igst. item amount = taxable_value + taxes.
6. HSN/SAC and UOM per item if visible.
7. Continuation page: extract invoice_no and vendor_name from top labels; markers: "continued","amount chargeable","authorised signatory","rounded off".
8. Missing field → null. No hallucination. All numeric fields must be numbers.
Return ONLY valid JSON.
```

### B. Appended Page-Specific Text (`page_specific_text`)
```text
### [PAGE 1 OCR DATA]
Tax Invoice | (ORIGINAL FOR RECIPIENT) | e-Invoice IRN | : 57bd9abf89e1d6f519d0b5e49b4175eefbc9206d96c50e1. 2cd721b5541c76642 Ack No. : 152523027902150 Ack Date: 13-Sep-2025 SRI VISHNU HEAT TREATERS | Invoice No. | Dated 4742/25-26 | 13-Sep-2025 BRANCH OFFICE SF NO 75/2 B SITe | 24/1 COSMOFAN FO Delivery Note | Mode/Terms of Payment rUnnatur viLLage annur pin 641107 | 2601/25-26 BRANCH OFI | NO.2/166 SF NO 472/1D | Reference No. & Date. | Other References BALAJ! INDUSTRIAL PARK MGCP VILLAGE SENTHAMPALAYAMGSTIN/UIN: 33ABYI | 4742 dt. 13-Sep-2025 Buyer's Order No. Consignee (Ship to) | JC/043/25-26 | 8-Sep-2025 N.S.SOLUTION | Dispatch Doc No. | Delivery Note Date SF NO: 195, VILANKURICHI RD, SUNDHARAR STREET, | Dispatched through | Destination COIMBATORE I State NameGSTIN/UIN | Tamil Nadu, Code : 33 33CKJPS6256F1ZW | Terms of Delivery Buyer (Bill to) Accuturn Machiners Private Limited 13 A,THUDIYALUR-KANUVAI ROAD APPANAICKENPALAYAM K.VADAMADURAI POST Coimbatore | 33ABACA5718R1ZD State Name Place of Supply .Tamil Nadu SI | Description of | HSN/SAC Quantity Rate per | Amount No. | Services 1 SQF - CASEHARDENING & TEMPERING(KGS) 998898 910.740 kgs 60.00kgs | 54,644.40 B65-6008 PIN 1059-NOS 2 SHOT BLASTINGS(KGS) 12.00kgs | 10,928.88 65,573.28 OUTPUT CGST@6% | 6% | 3,934.39 OUTPUT SgST@6% continued to page number 2 This is a Computer Generated Invoice
```

### C. Caching Assessment
* **What portion is cached?** 
  The entire static `prefix_text` (System prompt + `base_prompt` rules + schema). This yields the hash `0d4e4febb51ff816d64f5582586f1759d58c3d39a4d39a17440683d247b53390`.
* **What portion changes per page?** 
  The page boundary block `### [PAGE X OCR DATA]` and the parsed `page_ocr_text` (which represents the dynamic portion).

---

## 8. Answers to Final Questions

1. **What exact prompt reaches Qwen?**
   The combined prompt (System prompt: 104 characters; User prompt: 2782 characters).

2. **What exact OCR text is injected?**
   The PaddleOCR-extracted page text (1366 characters for Page 1), prefixed by the `### [PAGE 1 OCR DATA]` block.

3. **What exact payload is sent to Qwen?**
   The OpenAI-compatible completions JSON payload containing `model`, `messages` (System + User parts), `temperature: 0.0`, and the base64-encoded image attachment (in the `user` role content list).

4. **What exact text is hashed for prefix caching?**
   The static base prompt ending with `Return ONLY valid JSON.\n`.

5. **How many characters/tokens are static vs dynamic?**
   * **Static portion:** 1391 characters (~50%)
   * **Dynamic portion:** 1388 characters (~50%)
   * **Total:** 2782 characters
