import os
import json
import tempfile
import uuid
import base64
from datetime import datetime
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings
import google.generativeai as genai
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill

# Configure Gemini
GEN_API_KEY = os.environ.get('GEMINI_API_KEY')
if GEN_API_KEY:
    genai.configure(api_key=GEN_API_KEY)

# Header-level fields (appear once per invoice, not per line item)
HEADER_FIELDS = [
    'Voucher Date', 'Invoice Number', 'Purchase Order No.', 'PO Date',
    'Supplier Name', 'Supplier Address - Bill from', 'Supplier Address - Ship from',
    'Email ID', 'Phone Number', 'Sales Person', 'GSTIN', 'PAN', 'MSME Number',
    'Mode/Terms of Payment', 'Terms of Delivery',
    'Ledger Amount', 'Ledger Rate', 'Ledger Amount Dr/Cr', 'Ledger Narration',
    'Description of Ledger', 'Type of Tax Payment',
    'HSN/SAC Details',
    'GST Rate', 'IGST Amount', 'CGST Amount', 'SGST/UTGST Amount',
    'Cess Rate', 'Cess Amount', 'State Cess Rate', 'State Cess Amount',
    'Applicable for Reverse Charge', 'Taxable Value', 'Invoice Value',
    'VAT Registration No.', 'VAT Tax Rate', 'VAT Taxable Value',
    'Mode of Transport', 'Freight Basis', 'Delivery Challan No.',
    'Delivery Challan Date', 'Carrier Name/Agent', 'LR RR No.', 'LR RR No. - Date',
    'Motor Vehicle No.', 'Vessel/Flight No.', 'Port of Loading', 'Port of Discharge',
    'Port Code (Discharge)', 'Additional Docs', 'Special Instructions',
    'Original Invoice No.', 'Original Invoice - Date',
    'e-Invoice - Ack No.', 'e-Invoice - Ack Date', 'e-Invoice - IRN',
    'e-Way Bill No.', 'e-Way Bill Date', 'Consolidated e-Way Bill No.',
    'Consolidated e-Way Bill Date', 'e-Way Bill Extension Details',
    'Advance Amount', 'Advance Taxable Value', 'Advance IGST Amount',
    'Advance SGST Amount', 'Advance CGST Amount', 'Advance Cess Amount',
    'Advance State Cess Amount',
    'TDS - Section', 'TDS - Description', 'TDS - Assessable Value',
    'Override TDS Exemption u/s 206C', 'Deductee Type',
    'TCS - Section', 'TCS - Description', 'TCS - Assessable Value',
    'Exemption from TCS for Buyer-Deductible TDS', 'TCS Party Details - Collectee Type',
    'Bank - A/c No.', 'Bank - Bank Name', 'Bank - Branch', 'Bank - IFS Code',
    'Payment Details (if any already paid)'
]

# Per-line-item fields (one value per printed row in the items table)
LINE_ITEM_FIELDS = [
    'S.No', 'Item Code', 'Item/Description', 'HSN/SAC',
    'Quantity', 'Quantity UOM',
    'Item Rate', 'Disc%', 'Taxable Amount',
    'GST Rate', 'IGST Amount', 'CGST Amount', 'SGST Amount',
    'Item Amount',
    'Marks', 'No. of Packages', 'Freight Charges',
]

# All column headers in final Excel (line-item fields first, then header fields)
ALL_HEADERS = LINE_ITEM_FIELDS + HEADER_FIELDS


@csrf_exempt
@require_http_methods(["POST"])
def extract_invoice(request):
    """
    1. Accept uploaded invoice image.
    2. Extract data via Gemini OCR.
    3. Generate temporary Excel with one row per line item.
    4. Provide for download and delete.
    """
    if not request.FILES.get('file'):
        return JsonResponse({'error': 'No file uploaded'}, status=400)

    uploaded_file = request.FILES['file']

    try:
        from core.ai_proxy import execute_with_retry, api_key_manager

        # Get healthy key
        api_key = api_key_manager.get_healthy_key()
        if not api_key:
            return JsonResponse({'error': 'AI service busy (No healthy keys)'}, status=503)

        # Read file bytes
        file_bytes = uploaded_file.read()

        # -----------------------------------------------------------------------
        # Prompt: separate header data from per-row line item data
        # -----------------------------------------------------------------------
        prompt_text = f"""
You are a precision invoice OCR and data-extraction system.
Extract every figure exactly where it is printed — correct column, correct row — with zero shifting, duplication, or guessing.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 1 — LOCK COLUMN BOUNDARIES (do this first)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Find the table header row (S.No, Description, HSN, Qty, Rate, Amount, etc.).
2. Record the left/right boundary of each column. LOCK them.
3. Typical order: S.No | Item Code | Description | HSN/SAC | Qty | UOM | Rate | Disc% | Taxable Amt | GST% | IGST | CGST | SGST | Amount

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 2 — EXTRACT BY LOCKED COLUMN (for every data row)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- A value belongs to a column ONLY if it falls inside that column's boundary.
- If no value is in a column for a row → use "" (empty). Do NOT borrow from adjacent columns.
- If alignment is ambiguous → return null instead of guessing.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIELD RULES (mandatory for every row)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HSN/SAC      → 4-8 digit classification code from HSN column. NOT a price.
Quantity     → numeric part only. "8 NOS" → "8".
Quantity UOM → unit part only. "8 NOS" → "NOS". Never combine with Quantity.
Item Rate    → per-unit price from Rate column only. Not the line total.
Taxable Amt  → pre-tax line total for THIS row only (Qty × Rate − disc). Not invoice total.
GST Rate     → percentage only (e.g. "18", "12"). NOT a rupee amount.
IGST/CGST/SGST → tax rupee amount from that column for THIS row only.
Item Amount  → final line total from Amount column for THIS row only.

ABSOLUTE PROHIBITIONS:
✗ NEVER put Grand Total / Invoice Total into any line_item field.
✗ NEVER swap Rate and Amount columns.
✗ NEVER put GST rupee amount into GST Rate (%) field.
✗ NEVER merge two printed rows into one object.
✗ NEVER concatenate descriptions from different rows.
✗ NEVER duplicate a row.
✗ NEVER carry values from previous row into next row.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ROW RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Each visually distinct printed data row = ONE object in "line_items".
2. Description wrapping → attach ALL wrapped text to the SAME object. No new object.
3. Summary rows (Sub Total, Grand Total, Tax Summary) → "header" fields ONLY, not line_items.
4. S.No increments 1, 2, 3 … by actual distinct item rows.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HEADER RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- "Supplier Address - Bill from" → join all address lines with ", ".
- "Taxable Value", "IGST Amount", etc. in header → invoice-level totals.
- "Invoice Value" → final grand-total payable.
- Dates → dd/mm/yyyy. All values → strings. Missing → "".

Return the data in this EXACT JSON structure:

{{
  "header": {{
    {', '.join([f'"{f}": ""' for f in HEADER_FIELDS])}
  }},
  "line_items": [
    {{
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
    }}
  ]
}}

Return ONLY the raw JSON object. No markdown, no code fences, no explanation.
"""

        raw_text = execute_with_retry(
            [
                prompt_text,
                {'mime_type': uploaded_file.content_type, 'data': file_bytes}
            ],
            {},
            api_key
        )

        # Strip markdown fences if present
        raw_text = raw_text.strip()
        if raw_text.startswith('```json'):
            raw_text = raw_text[7:]
        if raw_text.startswith('```'):
            raw_text = raw_text[3:]
        if raw_text.endswith('```'):
            raw_text = raw_text[:-3]
        raw_text = raw_text.strip()

        extracted_json = json.loads(raw_text)

        # -----------------------------------------------------------------------
        # Normalise extracted data
        # -----------------------------------------------------------------------
        import re as _re
        header_data = extracted_json.get('header', {})
        line_items = extracted_json.get('line_items', [])

        # Ensure line_items is a list even if AI returned a single object
        if isinstance(line_items, dict):
            line_items = [line_items]

        # Numeric-only fields — strip currency symbols, commas, stray units
        NUMERIC_FIELDS = {
            'Item Rate', 'Taxable Amount', 'IGST Amount', 'CGST Amount',
            'SGST Amount', 'Item Amount', 'Disc%',
        }

        for idx, item in enumerate(line_items, start=1):
            # 1. Sequential S.No
            item['S.No'] = str(idx)
            # 2. null → empty string
            for k, v in item.items():
                if v is None:
                    item[k] = ''
            # 3. Auto-split combined Qty+UOM (e.g. "8 NOS", "2.5 KG")
            qty_raw = str(item.get('Quantity', '')).strip()
            uom_raw = str(item.get('Quantity UOM', '')).strip()
            if qty_raw and not uom_raw:
                m = _re.match(r'^([\d.,]+)\s*([A-Za-z]+)$', qty_raw)
                if m:
                    item['Quantity'] = m.group(1)
                    item['Quantity UOM'] = m.group(2).upper()
            # 4. GST Rate must be a percentage ≤ 28, not a rupee amount
            gst_rate = str(item.get('GST Rate', '')).strip().replace('%', '').strip()
            if gst_rate:
                try:
                    gst_val = float(gst_rate.replace(',', ''))
                    item['GST Rate'] = '' if gst_val > 28 else gst_rate
                except ValueError:
                    item['GST Rate'] = ''
            # 5. Strip non-numeric chars from amount fields
            for field in NUMERIC_FIELDS:
                val = str(item.get(field, '')).strip()
                if val:
                    cleaned = _re.sub(r'[^\d.\-]', '', val.replace(',', ''))
                    item[field] = cleaned if cleaned else ''
            # 6. HSN/SAC must be 4-8 digits only
            hsn = str(item.get('HSN/SAC', '')).strip()
            if hsn:
                hsn_digits = _re.sub(r'[^\d]', '', hsn)
                item['HSN/SAC'] = hsn_digits if 4 <= len(hsn_digits) <= 8 else ''

        # Filter empty header fields for UI display
        filtered_header = {k: v for k, v in header_data.items() if v and str(v).strip()}

        # -----------------------------------------------------------------------
        # Build Excel: row 1 = headers, row 2..N = one row per line item
        # -----------------------------------------------------------------------
        temp_dir = tempfile.gettempdir()
        file_name = (
            f"Invoice_Export_{uuid.uuid4().hex[:8]}_"
            f"{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        )
        file_path = os.path.join(temp_dir, file_name)

        wb = Workbook()
        ws = wb.active
        ws.title = "Extracted Invoice"

        header_fill = PatternFill(start_color="1E40AF", end_color="1E40AF", fill_type="solid")
        header_font = Font(color="FFFFFF", bold=True)

        # Write column header row
        for col, header in enumerate(ALL_HEADERS, start=1):
            cell = ws.cell(row=1, column=col, value=header)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center", wrap_text=True)

        # Write one data row per line item
        # Header fields repeat on every row; line-item fields are unique per row
        if not line_items:
            # No line items found — write a single data row with header data only
            line_items = [{}]

        for row_idx, item in enumerate(line_items, start=2):
            for col, field in enumerate(ALL_HEADERS, start=1):
                if field in HEADER_FIELDS:
                    value = header_data.get(field, '')
                else:
                    value = item.get(field, '')
                ws.cell(row=row_idx, column=col, value=value)

        # Auto-adjust column widths
        for column in ws.columns:
            max_length = 0
            column_letter = column[0].column_letter
            for cell in column:
                try:
                    if cell.value and len(str(cell.value)) > max_length:
                        max_length = len(str(cell.value))
                except Exception:
                    pass
            ws.column_dimensions[column_letter].width = min(max_length + 4, 50)

        wb.save(file_path)

        # Encode to base64 for JSON response
        with open(file_path, "rb") as f:
            excel_base64 = base64.b64encode(f.read()).decode('utf-8')

        # Cleanup temp file
        if os.path.exists(file_path):
            os.remove(file_path)

        return JsonResponse({
            'success': True,
            'data': {
                'header': filtered_header,
                'line_items': line_items,
            },
            'excel_file': excel_base64,
            'file_name': file_name
        })

    except Exception as e:
        import traceback
        return JsonResponse({'error': str(e), 'trace': traceback.format_exc()}, status=500)
