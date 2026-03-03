
import os
import json
import logging
import hashlib
import base64
from django.core.files.uploadedfile import UploadedFile

logger = logging.getLogger(__name__)


def extract_invoice_data(image_file: UploadedFile, mime_type='image/jpeg'):
    """
    Legacy function — kept for backward compatibility only.
    """
    try:
        image_content = image_file.read()
        file_hash = hashlib.md5(image_content).hexdigest()
        return {"error": "Invoice processing now requires user authentication, use API endpoint instead"}
    except Exception as e:
        logger.exception("Error preparing invoice data for AI processing")
        return {"error": str(e)}


def create_dynamic_voucher_extraction_request(
    image_file: UploadedFile,
    voucher_type: str,
    table_name: str,
    columns: list,
    mime_type: str = 'image/jpeg',
    user_id: str = '',
    tenant_id: str = '',
) -> dict:
    """
    Enterprise-Grade ERP Invoice Extraction Engine — 5-Phase Processing Pipeline.

    Phase 1 — OCR Normalization
    Phase 2 — Table Boundary Detection
    Phase 3 — Tax Structure Detection (line_level vs summary_level)
    Phase 4 — Mandatory Tax Population (CGST/SGST for intra-state, IGST for inter-state)
    Phase 5 — Summary Total Extraction & Validation

    Returns {'reply': json_string} on success or {'error': message} on failure.
    """
    try:
        if not columns:
            return {"error": "No columns provided for extraction."}

        # Read file content
        image_content = image_file.read()

        # MD5 hash for cache deduplication
        file_hash = hashlib.md5(image_content).hexdigest()

        # Base64-encode for passing through the proxy
        image_b64 = base64.b64encode(image_content).decode('utf-8')

        # ── Identify line-item columns vs header columns ──────────────────────────
        LINE_ITEM_HINTS = {
            "Item Name", "HSN/SAC", "Quantity", "Qty", "UOM", "Unit", "Rate", "Item Rate",
            "Taxable Value", "Item Amount", "Amount", "Description",
            "IGST Rate", "CGST Rate", "SGST Rate", "Cess Rate", "GST Rate",
            "IGST", "CGST", "SGST/UTGST", "Cess", "Invoice Value", "Disc%", "Disc Amount",
            "Item Code", "UQC", "Rate (FC)", "Amount (FC)", "Alternate Unit",
            "State Cess", "Sales Ledger"
        }

        has_items = any(col in LINE_ITEM_HINTS for col in columns)

        if has_items:
            header_cols = [c for c in columns if c not in LINE_ITEM_HINTS]
            item_cols = [c for c in columns if c in LINE_ITEM_HINTS]

            # Ensure tax fields are always in item_cols when present
            for c in columns:
                if c in ("Qty", "Item Rate", "IGST", "CGST", "SGST/UTGST", "Invoice Value", "Cess", "Taxable Value") and c not in item_cols:
                    item_cols.append(c)
                    if c in header_cols:
                        header_cols.remove(c)

            header_json = ",\n      ".join([f'"{c}": null' for c in header_cols])
            item_json   = ",\n        ".join([f'"{c}": null' for c in item_cols])

            output_template = f"""{{
  "voucher_type": "{voucher_type}",
  "table": "{table_name}",
  "data": {{
      {header_json},
      "items": [
        {{
          {item_json}
        }}
      ]
  }}
}}"""
        else:
            columns_json = ",\n      ".join([f'"{col}": null' for col in columns])
            output_template = f"""{{
  "voucher_type": "{voucher_type}",
  "table": "{table_name}",
  "data": {{
      {columns_json}
  }}
}}"""

        semantic_hints = """
SEMANTIC MAPPING GUIDE (map document labels → column names):
- Invoice Date / Bill Date / Date             → Date
- Bill No / Invoice No / Ref No / Supplier Bill No → Supplier Invoice No.
- Seller / Vendor / Supplier / Party Name    → Vendor Name
- Branch / Site / Location / Division / Sub-division → Branch
- GST No / GSTIN / UIN (Supplier)           → GSTIN
- Address / Billing Address                  → Bill From - Address Line 1
- State / Place of Supply                    → Place of Supply
- Grand Total / Net Amount / Total Payable / Invoice Total / Bill Amount / Balance Due → (Grand Total in summary)
- Sub Total / Taxable Total / Total Before Tax / Assessable Value → (Subtotal in summary)
- IGST Total / Integrated Tax Total          → (Total IGST in summary)
- CGST Total / Central Tax Total             → (Total CGST in summary)
- SGST/UTGST Total / State Tax Total         → (Total SGST in summary)
- Item / Description / Particulars           → Item Name
- HSN Code / SAC Code                        → HSN/SAC
- Qty / No. / Units                          → Qty
- Unit / UOM / Pcs                           → UOM
- Unit Price / Price / Rate per unit         → Item Rate
- Taxable Amount / Line Total (pre-tax)      → Taxable Value
- Line Total / Amount / Item Value           → Invoice Value
- IGST / Integrated Tax                      → IGST
- CGST / Central Tax                         → CGST
- SGST / State Tax / UTGST                   → SGST/UTGST
- Cess                                       → Cess
"""

        columns_json_list = json.dumps(columns)

        if voucher_type == 'Purchase':
            prompt = f"""\
You are an Enterprise Purchase Voucher Extraction Engine.

This invoice may use SUMMARY-LEVEL GST (tax shown only in footer).

You MUST extract footer totals even if item table does not contain tax columns.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCHEMA (TARGET COLUMNS)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{columns_json_list}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT STRUCTURE (MANDATORY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Return ONLY valid JSON:
{{
  "voucher_type": "{voucher_type}",
  "table": "{table_name}",
  "tax_structure_type": "line_level | summary_level",
  "data": {{
      {header_json},
      "items": [
        {{
          {item_json}
        }}
      ],
      "summary_totals": {{
        "Taxable Value": "0.00",
        "Total IGST": "0.00",
        "Total CGST": "0.00",
        "Total SGST/UTGST": "0.00",
        "Total Cess": "0.00",
        "Round Off": "0.00",
        "Grand Total": "0.00"
      }}
  }}
}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CRITICAL RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. If CGST/SGST appear only in footer (SUMMARY-LEVEL GST):
   → tax_structure_type = "summary_level"
   → You MUST proportionally or matching-by-rate distribute taxes to EVERY item in "items".

2. For EVERY row inside "items", you MUST populate:
   - IGST
   - CGST
   - SGST/UTGST
   - Cess
   - Invoice Value

3. TAX DERIVATION LOGIC:
   If summary-level (tax amounts only at bottom):
   a. Extract GST % per row (if printed) or use 18% as common default if unknown.
   b. Compare State Codes (first 2 digits of Supplier and Buyer GSTINs).
   c. If state codes match (Intra-state):
      CGST = Taxable × (GST% / 2) / 100
      SGST/UTGST = CGST
      IGST = "0.00"
   d. If state codes differ (Inter-state):
      IGST = Taxable × GST% / 100
      CGST = "0.00"
      SGST/UTGST = "0.00"

4. When summary_level:
   • Extract footer CGST amount exactly as printed into summary_totals.
   • Extract footer SGST amount exactly as printed into summary_totals.
   • Extract Round Off exactly as printed.
   • Extract Grand Total exactly as printed.
   • DO NOT set them to 0 if visible in footer.

5. ALL numeric values:
   • Must be STRINGS
   • Must have exactly 2 decimal places
   • Example: "897.95", "0.00"

6. PHASE 1 — OCR NORMALIZATION:
   • Convert text to UPPERCASE.
   • Remove commas from numbers (1,234.50 → 1234.50).
   • Standardize dates to DD/MM/YYYY.

7. PHASE 2 — TABLE BOUNDARY DETECTION:
   • START item extraction only when item headers appear.
   • STOP when footer labels appear (TOTAL, SUB TOTAL, GRAND TOTAL).

8. NEVER return null. NEVER skip footer totals. NEVER fabricate tax values.

Return raw JSON only. No explanation text.
"""
        else:
            prompt = f"""\
You are an Enterprise ERP {voucher_type} Voucher Extraction Engine.

Your output must be fully compatible with a strict frontend mapping engine.

CRITICAL REQUIREMENTS:
1. Do NOT invent new keys.
2. Do NOT rename keys.
3. Use ONLY the exact column names provided in the schema below.
4. Do NOT nest tax fields inside unknown objects.
5. All item-level values must be directly usable for mapping.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCHEMA (TARGET COLUMNS)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{columns_json_list}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT STRUCTURE (MANDATORY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{output_template}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 1 — OCR NORMALIZATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Convert text to UPPERCASE.
2. Remove commas from numbers (1,234.50 → 1234.50).
3. Standardize dates to DD/MM/YYYY.
4. Preserve decimal precision.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 2 — TABLE BOUNDARY DETECTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. START item extraction only when item headers appear (ITEM, QTY, RATE, HSN, etc).
2. STOP when footer labels appear (TOTAL, SUB TOTAL, GRAND TOTAL).
3. Do NOT treat footer or GST summary rows as line items.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MANDATORY TAX POPULATION RULE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
For EVERY row inside items:
• IGST must exist
• CGST must exist
• SGST/UTGST must exist
• Cess must exist
• Invoice Value must exist

If tax not applicable → return "0.00"
Never return null.
Never leave blank.

All numeric values:
• Must be STRINGS
• Must have exactly 2 decimal places
• Example: "678.00", "61.02", "0.00"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TAX DERIVATION LOGIC
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
If invoice is summary-level (tax amounts only at bottom):
1. Extract GST % per row.
2. Extract Supplier GSTIN.
3. Extract Buyer GSTIN.
4. Compare first 2 digits (State Code).

If state codes match:
    CGST = ROUND(Taxable × (GST% / 2) / 100, 2)
    SGST/UTGST = same
    IGST = "0.00"

If state codes differ:
    IGST = ROUND(Taxable × GST% / 100, 2)
    CGST = "0.00"
    SGST/UTGST = "0.00"

Invoice Value = ROUND(Taxable + CGST + SGST/UTGST + IGST + Cess, 2)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STRICT RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Do NOT include explanation text.
• Do NOT include markdown code blocks.
• Return raw JSON only.
"""

        request_data = {
            'prompt': prompt,
            'file_hash': file_hash,
            'image_data': image_b64,
            'mime_type': mime_type,
        }

        from .ai_proxy import ai_service
        return ai_service.make_request('invoice', request_data, user_id, tenant_id)

    except Exception as e:
        logger.exception(f"Error creating dynamic {voucher_type} processing request")
        return {"error": str(e)}


def create_tax_debug_request(
    image_file: UploadedFile,
    voucher_type: str,
    columns: list,
    mime_type: str = 'image/jpeg',
    user_id: str = '',
    tenant_id: str = '',
) -> dict:
    """
    Diagnostic endpoint — exposes the AI's internal tax detection and computation logic.
    Returns a detailed step-by-step audit of how tax fields were detected and computed.
    Used for auditing tax calculation discrepancies.
    """
    try:
        if not columns:
            return {"error": "No columns provided for debug extraction."}

        image_content = image_file.read()
        file_hash = hashlib.md5(image_content).hexdigest()
        image_b64 = base64.b64encode(image_content).decode('utf-8')

        columns_json_list = json.dumps(columns)

        prompt = f"""\
You are an Enterprise-Grade ERP Invoice Extraction Diagnostic Engine.

Your task is to extract invoice data AND expose your full internal tax detection and
computation logic in a structured debug audit trail.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DEBUG MODE — STEP-BY-STEP AUDIT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

For each invoice line item AND for the summary section, you MUST return:

1. RAW EXTRACTED VALUES (exactly as read from invoice):
   - raw_gstin_supplier: string or null
   - raw_gstin_buyer: string or null
   - raw_taxable_value: string or null (per row)
   - raw_gst_percent: string or null (per row)
   - raw_cgst_amount: string or null (per row, if column exists)
   - raw_sgst_amount: string or null (per row, if column exists)
   - raw_igst_amount: string or null (per row, if column exists)

2. DERIVED VALUES (computed by you):
   - supplier_state_code: first 2 digits of supplier GSTIN
   - buyer_state_code: first 2 digits of buyer GSTIN
   - state_match: true if supplier_state_code == buyer_state_code
   - tax_structure_type: "line_level" | "summary_level"
   - computed_cgst: string with 2 decimal places
   - computed_sgst: string with 2 decimal places
   - computed_igst: string with 2 decimal places
   - computed_invoice_value: string with 2 decimal places

3. MAPPING WARNINGS (list of strings):
   - Any discrepancies between printed values and computed values
   - Any missing or ambiguous field labels
   - Any validation failures (row math check, totals check)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TARGET COLUMNS (voucher_type: {voucher_type})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{columns_json_list}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT (strict JSON only)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{{
  "voucher_type": "{voucher_type}",
  "tax_debug": {{
    "raw_gstin_supplier": null,
    "raw_gstin_buyer": null,
    "supplier_state_code": null,
    "buyer_state_code": null,
    "state_match": null,
    "tax_structure_type": null,
    "items": [
      {{
        "raw_taxable_value": null,
        "raw_gst_percent": null,
        "raw_cgst_amount": null,
        "raw_sgst_amount": null,
        "raw_igst_amount": null,
        "computed_cgst": "0.00",
        "computed_sgst": "0.00",
        "computed_igst": "0.00",
        "computed_invoice_value": "0.00",
        "warnings": []
      }}
    ],
    "summary": {{
      "subtotal": null,
      "total_cgst": null,
      "total_sgst": null,
      "total_igst": null,
      "round_off": null,
      "grand_total": null,
      "validation_passed": null,
      "validation_notes": []
    }}
  }}
}}

Return ONLY raw JSON. No markdown, no code fences, no explanations.
"""

        request_data = {
            'prompt': prompt,
            'file_hash': file_hash,
            'image_data': image_b64,
            'mime_type': mime_type,
        }

        from .ai_proxy import ai_service
        return ai_service.make_request('invoice', request_data, user_id, tenant_id)

    except Exception as e:
        logger.exception("Error creating tax debug request")
        return {"error": str(e)}


def create_master_processing_request(
    image_file: UploadedFile,
    mime_type: str = 'image/jpeg',
    user_id: str = '',
    tenant_id: str = ''
) -> dict:
    """
    Creates a properly formatted request for Tally Master data extraction through the AI proxy.
    """
    try:
        image_content = image_file.read()
        file_hash = hashlib.md5(image_content).hexdigest()
        image_b64 = base64.b64encode(image_content).decode('utf-8')

        MANDATORY_FIELDS = [
            "Name", "Group", "State", "Address", "Registration Type", "GSTIN/UIN"
        ]

        DETAILED_FIELDS = [
            "GST Applicability", "Tax Type (GST)", "Bank Account Details - IFS Code",
            "Bank Account Details - BSR Code", "HSN/SAC - Applicable From",
            "HSN/SAC Details", "HSN - Classification", "HSN/SAC", "HSN Description",
            "GST Rate - Applicable From", "GST Rate Details", "GST - Classification",
            "GST - Taxability Type", "GST - Nature of Transaction", "IGST Rate",
            "CGST Rate", "SGST/UTGST Rate", "Cess Rate", "Cess Rate Per Unit",
            "State Cess Rate", "Applicable for Reverse Charge", "Eligible for Input Tax Credit",
            "Type of Supply", "PAN Effective Date", "Name on PAN", "PAN Status",
            "GST Registration Type", "GST Registration - GSTIN/UIN"
        ]

        all_fields = MANDATORY_FIELDS + [f for f in DETAILED_FIELDS if f not in MANDATORY_FIELDS]
        json_fields = ",\n  ".join([f'"{f}": ""' for f in all_fields])

        prompt = f"""\
You are a precision Tally Master data extraction system.
Your job is to extract ledger / party master configuration fields from the document image.
This document may be a Tally-exported master sheet, a GST registration certificate, or any ledger setup document.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXTRACTION RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Read ONLY what is explicitly printed. Do NOT invent or guess values.
2. All values must be returned as strings.
3. For any field not found in the document, return "" (empty string).
4. Do NOT add any key that is not in the JSON structure below.
5. Dates → format dd/mm/yyyy.
6. Rates → numeric strings only. No % symbols.
7. GSTIN → 15-character alphanumeric.
8. PAN → 10-character alphanumeric.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT — return this JSON object exactly:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{{
  {json_fields}
}}

Return ONLY the raw JSON object above — no markdown, no code fences, no explanation.
"""

        request_data = {
            'prompt': prompt,
            'file_hash': file_hash,
            'image_data': image_b64,
            'mime_type': mime_type,
        }

        from .ai_proxy import ai_service
        return ai_service.make_request('invoice', request_data, user_id, tenant_id)

    except Exception as e:
        logger.exception("Error creating master processing request")
        return {"error": str(e)}
