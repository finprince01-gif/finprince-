
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
    Actual extraction now routes through create_invoice_processing_request.
    """
    try:
        image_content = image_file.read()
        file_hash = hashlib.md5(image_content).hexdigest()
        return {"error": "Invoice processing now requires user authentication, use API endpoint instead"}
    except Exception as e:
        logger.exception("Error preparing invoice data for AI processing")
        return {"error": str(e)}


def create_invoice_processing_request(
    image_file: UploadedFile,
    mime_type: str = 'image/jpeg',
    user_id: str = '',
    tenant_id: str = ''
) -> dict:
    """
    Creates a properly formatted request for invoice processing through the AI proxy.
    Returns {'reply': json_string} on success or {'error': message} on failure.
    """
    try:
        # Read file content
        image_content = image_file.read()

        # MD5 hash for cache deduplication
        file_hash = hashlib.md5(image_content).hexdigest()

        # Base64-encode for passing through the proxy
        image_b64 = base64.b64encode(image_content).decode('utf-8')

        # ──────────────────────────────────────────────────────────────────────
        # PRECISION EXTRACTION PROMPT
        # Two-phase approach:
        #   Phase 1 → identify and lock column boundaries from the table header
        #   Phase 2 → extract each cell value strictly within its locked boundary
        # ──────────────────────────────────────────────────────────────────────
        prompt = """\
You are a precision invoice OCR and data-extraction system.
Your job is to extract every figure exactly where it is printed — correct column, correct row — with zero shifting, duplication, or guessing.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 1 — LOCK COLUMN BOUNDARIES (do this first, before extracting any value)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Locate the table header row (the row that labels S.No, Description, HSN, Qty, Rate, Amount, etc.).
2. For EACH printed column header, note its exact horizontal center and its left/right edges.
3. Record these as locked column zones. Every value you extract MUST fall inside one of these zones.
4. Typical column order (actual invoice may differ):
   S.No | Item Code | Description | HSN/SAC | Qty | UOM | Rate | Disc% | Taxable Amt | GST% | IGST | CGST | SGST | Total Amt

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 2 — EXTRACT CELL VALUES BY LOCKED COLUMN POSITION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
For every data row, read the value that sits inside each locked column zone.
Rules:
  • A value belongs to a column ONLY if its printed position falls INSIDE that column's boundary.
  • If no value is printed inside a column for a given row → use "" (empty). Do NOT borrow from adjacent columns.
  • If the alignment is genuinely ambiguous → return null (not a guessed value).
  • Never shift a value one column left or right.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIELD-SPECIFIC EXTRACTION RULES (mandatory for every row)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

HSN/SAC
  → Extract the 4-8 digit code printed inside the HSN column boundary.
  → It is a product classification code, NOT a price. Example: "6006", "99041".
  → Do NOT put any price or amount here.

Quantity  (field: "Quantity")
  → Extract the NUMERIC PART ONLY from the Qty column.
  → Example: "8 NOS" → Quantity = "8"
  → Example: "2.500 KG" → Quantity = "2.500"
  → NEVER include the unit abbreviation in this field.

Quantity UOM  (field: "Quantity UOM")
  → Extract the UNIT ABBREVIATION ONLY from the Qty column.
  → Example: "8 NOS" → Quantity UOM = "NOS"
  → Example: "2.500 KG" → Quantity UOM = "KG"
  → NEVER combine the number with the unit in one field.

Item Rate  (field: "Item Rate")
  → The per-unit selling price printed in the Rate/Price column.
  → Example: if Qty=8, Rate=125.00, Amount=1000.00 → Item Rate = "125.00"
  → Do NOT put the line total (1000.00) into Item Rate.
  → Do NOT put the invoice grand total here.

Taxable Amount  (field: "Taxable Amount")
  → The pre-tax line total for THIS specific row (Qty × Rate − discount).
  → Example: 8 × 125.00 = 1000.00 → Taxable Amount = "1000.00"
  → Do NOT use the invoice-level taxable total here.
  → Do NOT repeat across rows unless each row genuinely has the same value.

GST Rate  (field: "GST Rate")
  → The tax PERCENTAGE printed in the GST%/Tax Rate column. Example: "18", "12", "5".
  → This is a percentage, NOT a rupee amount.
  → Do NOT put "180.00" (a rupee figure) into this field — that belongs in a tax amount field.

IGST Amount  (field: "IGST Amount")
  → Rupee tax amount from the IGST column for THIS row only.
  → Do NOT use the invoice-level IGST total.

CGST Amount  (field: "CGST Amount")
  → Rupee tax amount from the CGST column for THIS row only.

SGST Amount  (field: "SGST Amount")
  → Rupee tax amount from the SGST/UTGST column for THIS row only.

Item Amount  (field: "Item Amount")
  → The final grand total for THIS row (Taxable + all taxes) from the Amount/Total column.
  → Do NOT use the invoice overall total here.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ABSOLUTE PROHIBITIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✗ NEVER put Grand Total / Invoice Total / Invoice Value into any line_item field.
✗ NEVER repeat any invoice-level total inside a line_items row — totals go in "header" only.
✗ NEVER swap the Rate and Amount columns.
✗ NEVER put a GST rupee amount into the GST Rate (%) field.
✗ NEVER put an HSN code into a price/amount field or vice versa.
✗ NEVER merge two separate printed rows into one line_items object.
✗ NEVER concatenate descriptions from different printed rows into one "Item/Description".
✗ NEVER duplicate a row — each printed item row appears exactly once in line_items.
✗ NEVER carry forward any content from the previous row into the current row.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ROW STRUCTURE RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Each visually distinct printed data row → exactly ONE object in "line_items".
2. Description text that wraps to a second print line → attach ALL wrapped text to the SAME object. Do NOT create a new object for wrapped continuation lines.
3. Summary/footer rows (Sub Total, Taxable Total, Grand Total, Tax Summary, Freight, Round Off) → go into "header" fields ONLY — never into line_items.
4. S.No increments 1, 2, 3 … strictly in order of actual distinct item rows in the table.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HEADER FIELD RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"Supplier Address - Bill from" → join all printed address lines with ", " into one string.
"Taxable Value"               → invoice-level total taxable value (sum of all rows).
"IGST Amount"                 → invoice-level IGST total.
"CGST Amount"                 → invoice-level CGST total.
"SGST/UTGST Amount"           → invoice-level SGST/UTGST total.
"Invoice Value"               → final grand total payable amount on the invoice.
Dates                         → format dd/mm/yyyy.
All values                    → strings (even numeric ones).
Missing / unreadable fields   → "" (empty string).

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT — return this JSON structure exactly (filled in):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  "header": {
    "Voucher Date": "",
    "Invoice Number": "",
    "Purchase Order No.": "",
    "PO Date": "",
    "Supplier Name": "",
    "Supplier Address - Bill from": "",
    "Supplier Address - Ship from": "",
    "Email ID": "",
    "Phone Number": "",
    "GSTIN": "",
    "PAN": "",
    "MSME Number": "",
    "Mode/Terms of Payment": "",
    "HSN/SAC Details": "",
    "GST Rate": "",
    "IGST Amount": "",
    "CGST Amount": "",
    "SGST/UTGST Amount": "",
    "Taxable Value": "",
    "Invoice Value": "",
    "e-Way Bill No.": "",
    "Motor Vehicle No.": "",
    "Bank - A/c No.": "",
    "Bank - Bank Name": "",
    "Bank - Branch": "",
    "Bank - IFS Code": "",
    "Party Type": "",
    "Party Name": "",
    "Party ID": "",
    "Paid Amount": "",
    "Paid Date": "",
    "Payment Mode": "",
    "Payment Reference No": "",
    "State": "",
    "Email": ""
  },
  "line_items": [
    {
      "S.No": "1",
      "Item Code": "",
      "Item/Description": "",
      "HSN/SAC": "",
      "Quantity": "",
      "Quantity UOM": "",
      "Item Rate": "",
      "Disc%": "",
      "Taxable Amount": "",
      "GST Rate": "",
      "IGST Amount": "",
      "CGST Amount": "",
      "SGST Amount": "",
      "Item Amount": "",
      "Marks": "",
      "No. of Packages": "",
      "Freight Charges": ""
    }
  ]
}

Return ONLY the raw JSON object above — no markdown, no code fences, no explanation before or after it.
"""

        request_data = {
            'prompt': prompt,
            'file_hash': file_hash,
            'mime_type': mime_type,
            'image_data': image_b64,
        }

        # Import here to avoid circular imports
        from .ai_proxy import ai_service

        return ai_service.make_request('invoice', request_data, user_id, tenant_id)

    except Exception as e:
        logger.exception("Error creating invoice processing request")
        return {"error": str(e)}
