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
    # Voucher Details
    'Voucher Date', 'Supplier Invoice No', 'Purchase Voucher No', 'Vendor Name', 'GSTIN', 'PAN', 'MSME Number',
    'Bill From', 'Ship From', 'Input Type', 'Invoice in Foreign Currency', 'Supporting Document',
    
    # Dispatch Details
    'Dispatch From', 'Mode of Transport', 'Dispatch Date', 'Dispatch Time', 'Delivery Type',
    'Self/Third Party', 'Transporter ID', 'Transporter Name', 'Vehicle No', 'LR/GR Consignment', 'Dispatch Document',
    
    # e-Way Bill Details
    'e-Way Bill Available', 'e-Way Bill No', 'e-Way Bill Date', 'Validity Period', 'Distance',
    'Extension Date', 'Extended EWB No', 'Extension Reason', 'From Place', 'Remaining Distance',
    'New Validity', 'Updated Vehicle No', 'IRN', 'Ack No',
    
    # Total Details
    'Total Taxable Value', 'Total IGST', 'Total CGST', 'Total SGST', 'Total Cess', 'Total State Cess',
    'Total Invoice Value', 'TDS Income Tax', 'TDS GST', 'Advance Paid', 'To Pay', 'Posting Note', 'Terms & Conditions',
    'Advance References',

    # Additional Required Fields
    'GST Registration',
    'Original Sales Invoice Value for Credit Note',
    'e-Invoice - Ack No.',
    'e-Invoice - Ack Date',
    'e-Invoice - IRN',
    'e-Invoice - Bill to place',
    'e-Invoice - Ship to place',
    'e-Invoice - Dispatch From Name',
    'e-Invoice - Dispatch From Address',
    'e-Invoice - Dispatch From State',
    'e-Invoice - Dispatch From Pincode',
    'e-Invoice - Dispatch From Place',
    'e-Invoice Cancellation - Reason for Cancellation',
    'e-Invoice Cancellation - Remarks',
    'e-Way Bill No.',
    'e-Way Bill Date',
    'Consolidated e-Way Bill No.',
    'Consolidated e-Way Bill Date',
    'e-Way Bill - Sub-Type',
    'e-Way Bill - Document Type',
    'Consignor Details (From) - Address-1',
    'Consignor Details (From) - Address-2',
    'Consignor Details (From) - Address Type',
    'Consignor Details (From) - Pincode',
    'Consignor Details (From) - Place',
    'Consignor Details (From) - Actual State',
    'Consignee Details (To) - Address-1',
    'Consignee Details (To) - Address-2',
    'Consignee Details (To) - Address Type',
    'Consignee Details (To) - Place',
    'Consignee Details (To) - Actual State',
    'Consignee Details (To) - Pincode',
    'e-Way Bill Transport Details - Pin to Pin Distance as per Portal',
    'e-Way Bill Transport Details - Transporter Name',
    'e-Way Bill Transport Details - Transporter ID',
    'e-Way Bill Transport Details - Mode',
    'e-Way Bill Transport Details - Doc/Lading/RR/Airway No.',
    'e-Way Bill Transport Details - Doc/Lading/RR/Airway Date',
    'e-Way Bill Transport Details - Vehicle Number',
    'e-Way Bill Transport Details - Vehicle Type',
    'e-Way Bill Transport Details - Place',
    'e-Way Bill Transport Details - State',
    'e-Way Bill Transport Details - Reason',
    'e-Way Bill Transport Details - Remarks',
    'e-Way Bill Extension Details - Remaining Distance(in KM)',
    'e-Way Bill Extension Details - Mode',
    'e-Way Bill Extension Details - Doc/Lading/RR/Airway No.',
    'e-Way Bill Extension Details - Doc/Lading/RR/Airway - Date',
    'e-Way Bill Extension Details - Vehicle Number',
    'e-Way Bill Extension Details - Vehicle Type',
    'e-Way Bill Extension Details - Transit Type',
    'e-Way Bill Extension Details - Address 1',
    'e-Way Bill Extension Details - Address 2',
    'e-Way Bill Extension Details - Address 3',
    'e-Way Bill Extension Details - Current Pincode',
    'e-Way Bill Extension Details - Current Place',
    'e-Way Bill Extension Details - Current State',
    'e-Way Bill Extension Details - Reason',
    'e-Way Bill Extension Details - Remarks',
    'e-Way Bill Cancellation Details - Reason',
    'e-Way Bill Cancellation Details - Remarks',
    'GST Rate Details',
    'GST Source of Details',
    'GST Source Type of Master',
    'GST Taxability Type',
    'GST Nature of Transaction',
    'GST Classification',
    'IGST Rate',
    'CGST Rate',
    'SGST/UTGST Rate',
    'Cess Rate',
    'Cess Rate Per Unit',
    'State Cess Rate',
    'Applicable for Reverse Charge',
    'Eligible for Input Tax Credit',
    'Taxable Value',
    'HSN/SAC Details',
    'HSN/SAC Source of Details',
    'HSN/SAC Source Type of Master',
    'HSN/SAC Classification',
    'HSN/SAC',
    'HSN Description',
    'Buyer/Supplier - Bill to/from',
    'Buyer/Supplier - Address Type',
    'Buyer/Supplier - Mailing Name',
    'Buyer/Supplier - Address',
    'Buyer/Supplier - Country',
    'Buyer/Supplier - State',
    'Buyer/Supplier - GST Registration Type',
    'Buyer/Supplier - Assessee of Other Territory',
    'Buyer/Supplier - GSTIN/UIN',
    'Buyer/Supplier - Is Bill of Entry available',
    'Buyer/Supplier - Supplies under section 7 of IGST Act',
    'Buyer/Supplier - Place of Supply',
    'Consignee (ship to)',
    'Consignee - Mailing Name',
    'Consignee - Address Type',
    'Consignee - Address',
    'Consignee - State',
    'Consignee - Country',
    'Consignee - GSTIN/UIN',
    'Stat Adjustment (GST) - Type of Duty/Tax',
    'Stat Adjustment (GST) - Nature of Adjustment',
    'Stat Adjustment (GST) - Additional Nature of Adjustment',
    'Stat Adjustment (GST) - Rate',
    'Stat Adjustment (GST) - Taxable Value',
    'Stat Adjustment (GST) - ISD Invoice/Debit/Credit Note No.',
    'Stat Adjustment (GST) - ISD Invoice/Debit/Credit Note Date',
    'Stat Adjustment (GST) - Eligible for Input Tax Credit',
    'Stat Adjustment (GST) - Type of Supply',
    'Type of Supply',
    'Advance Payment/Receipt/Refund Details - IGST Rate',
    'Advance Payment/Receipt/Refund Details - IGST Amount',
    'Advance Payment/Receipt/Refund Details - SGST Rate',
    'Advance Payment/Receipt/Refund Details - SGST Amount',
    'Advance Payment/Receipt/Refund Details - CGST Rate',
    'Advance Payment/Receipt/Refund Details - CGST Amount',
    'Advance Payment/Receipt/Refund Details - Cess Rate',
    'Advance Payment/Receipt/Refund Details - Cess Amount',
    'Advance Payment/Receipt/Refund Details - Cess Rate Per Unit',
    'Advance Payment/Receipt/Refund Details - Cess per Unit Amount',
    'Tax Type Allocations - IGST Liability',
    'Tax Type Allocations - CGST Liability',
    'Tax Type Allocations - SGST/UTGST Liability',
    'Tax Type Allocations - Cess Liability',
    'GST Advance Details - Month Year',
    'GST Advance Details - Place of Supply',
    'GST Advance Details - GST Rate',
    'GST Advance Details - Cess Rate',
    'GST Advance Details - Advance Amount',
    'TDS - Nature of Payments',
    'TDS - Assessable Value',
    'TDS Party Details - Party Name',
    'TDS Party Details - Deductee Type',
    'TDS Party Details - PAN Number',
    'TDS Bill Allocations - Type of Ref',
    'TDS Bill Allocations - Name',
    'TDS Bill Allocations - TDS Nature of Payment',
    'TDS Bill Allocations - Party Ledger',
    'TDS Bill Allocations - Expenses Ledger',
    'TDS Bill Allocations - Duty Ledger',
    'TDS Bill Allocations - Assessable Amount',
    'TDS Bill Allocations - Payable Amount',
    'TDS Bill Allocations - Paid Amount',
    'TCS - Nature of Goods',
    'TCS - Assessable Value',
    'Exemption from TCS for Buyer-Deductible TDS',
    'TCS Party Details - Party Name',
    'TCS Party Details - Collectee Type',
    'TCS Party Details - PAN Number',
    'TCS Bill Allocations - Type of Ref',
    'TCS Bill Allocations - Name',
    'TCS Bill Allocations - TCS Nature of Goods',
    'TCS Bill Allocations - Party Ledger',
    'TCS Bill Allocations - Income Ledger',
    'TCS Bill Allocations - Duty Ledger',
    'TCS Bill Allocations - Assessable Amount',
    'TCS Bill Allocations - Payable Amount',
    'TCS Bill Allocations - Paid Amount',
    'Stat Payment (GST) - Tax Type',
    'Stat Payment (GST) - Type of Payment',
    'Stat Payment (GST) - Period From',
    'Stat Payment (GST) - Period To',
    'Stat Payment (TDS) - Tax Type',
    'Stat Payment (TDS) - Period From',
    'Stat Payment (TDS) - Period To',
    'Stat Payment (TDS) - Section',
    'Stat Payment (TDS) - Nature of Payment',
    'Stat Payment (TDS) - Deductee Status',
    'Stat Payment (TDS) - Residential Status',
    'Stat Payment (TDS) - Cheque No.',
    'Stat Payment (TDS) - Cheque Date',
    'Stat Payment (TDS) - BSR Code',
    'Stat Payment (TDS) - Challan No.',
    'Stat Payment (TDS) - Challan Date',
    'Stat Payment (TDS) - Bank Name',
    'Stat Payment (TDS) - Branch Name',
    'Stat Payment (TCS) - Tax Type',
    'Stat Payment (TCS) - Period From',
    'Stat Payment (TCS) - Period To',
    'Stat Payment (TCS) - Section',
    'Stat Payment (TCS) - Nature of Goods',
    'Stat Payment (TCS) - Deductee Status',
    'Stat Payment (TCS) - Residential Status',
    'Stat Payment (TCS) - Cheque No.',
    'Stat Payment (TCS) - Cheque Date',
    'Stat Payment (TCS) - BSR Code',
    'Stat Payment (TCS) - Challan No.',
    'Stat Payment (TCS) - Challan Date',
    'Stat Payment (TCS) - Bank Name',
    'Stat Payment (TCS) - Branch Name'
]

# Per-line-item fields (one value per printed row in the items table)
LINE_ITEM_FIELDS = [
    'S.No', 'Item Name', 'Purchase Ledger', 'HSN/SAC', 'Quantity', 'UOM', 'Rate', 
    'Disc %', 'Disc Amount', 'Taxable Value', 'GST %', 'Integrated Tax (IGST)', 
    'Central Tax (CGST)', 'State Tax (SGST)', 'Cess', 'Item Amount', 'Description'
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
3. Typical order: S.No | Item Name | Purchase Ledger | HSN/SAC | Qty | UOM | Rate | Disc% | Taxable Amt | GST% | IGST | CGST | SGST | Cess | Amount

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SEMANTIC MAPPING GUIDE (Strict Schema Enforcement)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Every extracted field MUST be assigned to its matching header key.

- Voucher Date                <- The invoice date printed on the document.
- Supplier Invoice No         <- The main invoice/bill number.
- Vendor Name                 <- The seller/company providing the invoice.
- GSTIN                       <- The seller's GST number.
- PAN                         <- The seller's PAN (if printed).
- Bill From                   <- The seller's full address.
- Ship From                   <- The shipping origin address.
- Total Invoice Value         <- The final grand total payable amount.
- Total Taxable Value         <- The sum of pre-tax item amounts.
- Total IGST/CGST/SGST        <- Corresponding invoice-level tax totals.

- Item Name                   <- The main product name or description. MANDATORY.
- Description                 <- Extra details ONLY.
- Quantity                    <- The numeric unit count.
- UOM                         <- The unit abbreviation (PCS, BOX, KGS, etc.).
- Rate                        <- The unit price.
- Taxable Value (Item)        <- Item pre-tax total (Qty x Rate).
- GST %                       <- The tax percentage for that item row.

For any field not explicitly printed, leave as "".
Never shift a value into the wrong column key.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PHASE 2 — EXTRACT BY LOCKED COLUMN (for every data row)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
For every row, read the value that sits inside each locked column boundary.
Rules:
  • A value belongs to a column ONLY if its center falls INSIDE that zone.
  • No dynamic key creation. Use provided keys only.
  • Ambiguous? -> null.
  • Strict header-based mapping — NO positional shifting.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FIELD RULES (mandatory for every row)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Item Name
  → The main product name or description. MANDATORY.
  → Map "Description", "Particulars", or "Item Name" to this field.

HSN/SAC
  → Map the 4-8 digit code here.
Quantity     → numeric part only. "8 NOS" → "8".
UOM          → unit part only. "8 NOS" → "NOS". Never combine with Quantity.
Rate         → per-unit price from Rate column only. Not the line total.
Taxable Value → pre-tax line total for THIS row only (Qty × Rate − disc). Not invoice total.
Item Amount  → final line total from Amount column for THIS row only.

ABSOLUTE PROHIBITIONS:
✗ NEVER put Grand Total / Invoice Total into any line_item field.
✗ NEVER swap Rate and Amount columns.
✗ NEVER merge two printed rows into one object.
✗ NEVER concatenate descriptions from different rows.
✗ NEVER duplicate a row.
✗ NEVER carry values from previous row into next row.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ROW RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Each visually distinct printed data row = ONE object in "line_items".
2. Description wrapping → attach ALL wrapped text to the "Description" field of the same object.
3. Summary rows (Sub Total, Grand Total, Tax Summary) → "invoice" fields ONLY, not items.
4. S.No increments 1, 2, 3 … by actual distinct item rows.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HEADER RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- "Bill From" & "Ship From" → join all address lines with ", ".
- Dates → dd/mm/yyyy. All values → strings. Missing → "".

Return the data in this EXACT JSON structure:

{{
  "invoice": {{
    {', '.join([f'"{f}": ""' for f in HEADER_FIELDS])}
  }},
  "items": [
    {{
      "S.No": "1",
      "Item Name": "",
      "Purchase Ledger": "",
      "HSN/SAC": "",
      "Quantity": "",
      "UOM": "",
      "Rate": "",
      "Disc %": "",
      "Disc Amount": "",
      "Taxable Value": "",
      "GST %": "",
      "Integrated Tax (IGST)": "",
      "Central Tax (CGST)": "",
      "State Tax (SGST)": "",
      "Cess": "",
      "Item Amount": "",
      "Description": ""
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
        # Support both {invoice, items} and legacy {header, line_items} formats
        if isinstance(extracted_json, dict) and ('invoice' in extracted_json or 'header' in extracted_json):
            invoice_data = extracted_json.get('invoice', extracted_json.get('header', {}))
            items = extracted_json.get('items', extracted_json.get('line_items', []))
        else:
            invoice_data = extracted_json if isinstance(extracted_json, dict) else {}
            items = []

        # Ensure items is a list even if AI returned a single object
        if isinstance(items, dict):
            items = [items]

        # Numeric-only fields — strip currency symbols, commas, stray units
        NUMERIC_FIELDS = {
            'Rate', 'Taxable Value', 'Integrated Tax (IGST)', 'Central Tax (CGST)',
            'State Tax (SGST)', 'Cess', 'Item Amount', 'Disc %', 'Disc Amount', 'GST %',
            'Total Taxable Value', 'Total IGST', 'Total CGST', 'Total SGST', 'Total Cess', 
            'Total State Cess', 'Total Invoice Value', 'TDS Income Tax', 'TDS GST', 
            'Advance Paid', 'To Pay', 'IGST Rate', 'CGST Rate', 'SGST/UTGST Rate', 
            'Cess Rate', 'Cess Rate Per Unit', 'State Cess Rate',
            'Advance Payment/Receipt/Refund Details - IGST Rate',
            'Advance Payment/Receipt/Refund Details - IGST Amount',
            'Advance Payment/Receipt/Refund Details - SGST Rate',
            'Advance Payment/Receipt/Refund Details - SGST Amount',
            'Advance Payment/Receipt/Refund Details - CGST Rate',
            'Advance Payment/Receipt/Refund Details - CGST Amount',
            'Tax Type Allocations - IGST Liability',
            'Tax Type Allocations - CGST Liability',
            'Tax Type Allocations - SGST/UTGST Liability',
            'GST Advance Details - GST Rate',
            'GST Advance Details - Cess Rate',
            'GST Advance Details - Advance Amount',
            'TDS - Assessable Value', 'TCS - Assessable Value',
        }

        for idx, item in enumerate(items, start=1):
            # 1. Sequential S.No
            item['S.No'] = str(idx)
            # 2. null → empty string
            for k, v in item.items():
                if v is None:
                    item[k] = ''
            # 3. Auto-split combined Qty+UOM (e.g. "8 NOS", "2.5 KG")
            qty_raw = str(item.get('Quantity', '')).strip()
            uom_raw = str(item.get('UOM', '')).strip()
            if qty_raw and not uom_raw:
                # Try to split "8 NOS" or "2.500 KGS"
                m = _re.match(r'^([\d.,]+)\s*([A-Za-z]+)$', qty_raw)
                if m:
                    item['Quantity'] = m.group(1)
                    item['UOM'] = m.group(2).upper()
            
            # 4. Item Name promote logic (Safety net)
            if not item.get('Item Name') and item.get('Description'):
                item['Item Name'] = item['Description']
                item['Description'] = ''
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
        filtered_header = {k: v for k, v in invoice_data.items() if v and str(v).strip()}

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
        if not items:
            # No line items found — write a single data row with header data only
            items = [{}]

        for row_idx, item in enumerate(items, start=2):
            for col, field in enumerate(ALL_HEADERS, start=1):
                if field in HEADER_FIELDS:
                    value = invoice_data.get(field, '')
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
                'line_items': items,
            },
            'excel_file': excel_base64,
            'file_name': file_name
        })

    except Exception as e:
        import traceback
        return JsonResponse({'error': str(e), 'trace': traceback.format_exc()}, status=500)
