
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
    ERP document extraction engine — fully dynamic, column-driven.

    The frontend sends the selected voucher_type AND the exact column structure.
    This function builds an AI prompt using ONLY the provided `columns` list and
    returns output that maps directly to the target `table_name`.

    Input contract:
        {
          "voucher_type": "<SELECTED_VOUCHER>",
          "table_name":   "<TARGET_TABLE>",
          "columns":      ["Column 1", "Column 2", ...]
        }

    Output contract (from AI):
        {
          "voucher_type": "<SELECTED_VOUCHER>",
          "table":        "<TARGET_TABLE>",
          "data": {
            "Column 1": "value or null",
            "Column 2": "value or null",
            ...
          }
        }

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

        # Identify likely line-item columns to separate them into "items" array in output format
        # If any of these are in the requested columns, we expect multiple rows
        LINE_ITEM_HINTS = {"Item Name", "HSN/SAC", "Quantity", "UOM", "Rate", "Taxable Value", "Item Amount", "Description", "IGST Rate", "CGST Rate", "SGST Rate", "Cess Rate", "GST Rate"}
        
        has_items = any(col in LINE_ITEM_HINTS for col in columns)
        
        if has_items:
            header_cols = [c for c in columns if c not in LINE_ITEM_HINTS]
            item_cols = [c for c in columns if c in LINE_ITEM_HINTS]
            
            header_json = ",\n      ".join([f'"{c}": null' for c in header_cols])
            item_json = ",\n        ".join([f'"{c}": null' for c in item_cols])
            
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
- Invoice Date / Bill Date / Date             → Voucher Date
- Bill No / Invoice No / Ref No              → Supplier Invoice No
- Seller / Vendor / Supplier / Party Name    → Buyer/Supplier - Mailing Name
- GST No / GSTIN / UIN                       → Buyer/Supplier - GSTIN/UIN
- Address / Billing Address                  → Buyer/Supplier - Address
- State / Place of Supply                    → Buyer/Supplier - State
- Grand Total / Net Amount / Total Payable / Invoice Total / Bill Amount / Balance Due / Amount Payable / Total Amount Due / Net Payable / Final Amount → Total Invoice Value
- Sub Total / Taxable Total / Total Before Tax / Assessable Value → Total Taxable Value
- IGST Total / Integrated Tax Total          → Total IGST
- CGST Total / Central Tax Total             → Total CGST
- SGST Total / State Tax Total               → Total SGST
- Item / Description / Particulars           → Item Name
- HSN Code / SAC Code                        → HSN/SAC
- Qty / No. / Units                          → Quantity
- Unit / UOM / Pcs                           → UOM
- Unit Price / Price / Rate per unit         → Rate
- Taxable Amount / Line Total (pre-tax)      → Taxable Value
- Line Total / Amount / Item Value           → Item Amount
- Account / Ledger                           → Account
- Party / Payee / Received from             → Party
- Total / Net                                → Amount
- Remarks / Memo                            → Narration
- From / Dr Account                          → From Account / Ledger (Debit)
- To / Cr Account                            → To Account / Ledger (Credit)
- Expense Type / Expense Head                → Expense Ledger
- Paid From / Bank / Cash                    → Paid From

CRITICAL: "Total Invoice Value" is MANDATORY for Invoice/Purchase/Sales vouchers.
It is always the largest amount printed at the bottom of the invoice (the final payable figure including all taxes).
You MUST extract it even if it is labeled differently (Grand Total, Net Total, Invoice Amount, etc.).
"""

        prompt = f"""\
You are an ERP document extraction engine.

The frontend has selected a **{voucher_type} Voucher** targeting the table **"{table_name}"**.
You must extract data from the attached document and map values ONLY to the exact columns listed below.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STRICT RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. The "columns" list is the SINGLE SOURCE OF TRUTH.
2. Extract data ONLY for these columns — no others.
3. Do NOT add extra columns not in the list.
4. Do NOT remove columns from the list.
5. If a column's value is not found in the document, return null (not "").
6. Do NOT mix data from other voucher types.
7. Do NOT assume or invent values.
8. All values must be returned as strings (or null), e.g., "123.45", "Apple".
9. Dates must be formatted as dd/mm/yyyy.
10. Numeric values must be plain strings representing numbers only — no ₹, $, commas, or % symbols.
11. HSN/SAC must be 4–8 digit numeric code only.
12. Return ONLY valid JSON that precisely matches the OUTPUT format below.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TARGET COLUMNS (map ONLY these):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{json.dumps(columns, indent=2)}

{semantic_hints}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT — return this JSON structure exactly:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{output_template}

Return ONLY the raw JSON — no markdown, no code fences, no explanation.
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
