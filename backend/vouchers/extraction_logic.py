import os
import json
import logging
from core.ai_proxy import execute_with_retry, api_key_manager
from core.processing_engine import parse_and_process_ocr

logger = logging.getLogger(__name__)

HEADER_FIELDS = [
    'Voucher Date', 'Supplier Invoice No', 'Purchase Voucher No', 'Vendor Name', 'GSTIN', 'PAN', 'MSME Number',
    'Bill From', 'Ship From', 'Input Type', 'Invoice in Foreign Currency', 'Supporting Document',
    'Dispatch From', 'Mode of Transport', 'Dispatch Date', 'Dispatch Time', 'Delivery Type',
    'Self/Third Party', 'Transporter ID', 'Transporter Name', 'Vehicle No', 'LR/GR Consignment', 'Dispatch Document',
    'e-Way Bill Available', 'e-Way Bill No', 'e-Way Bill Date', 'Validity Period', 'Distance',
    'Extension Date', 'Extended EWB No', 'Extension Reason', 'From Place', 'Remaining Distance',
    'New Validity', 'Updated Vehicle No', 'IRN', 'Ack No',
    'Total Taxable Value', 'Total IGST', 'Total CGST', 'Total SGST', 'Total Cess', 'Total State Cess',
    'Total Invoice Value', 'TDS Income Tax', 'TDS GST', 'Advance Paid', 'To Pay', 'Posting Note', 'Terms & Conditions',
    'Advance References', 'GST Registration', 'Original Sales Invoice Value for Credit Note',
    'e-Invoice - Ack No.', 'e-Invoice - Ack Date', 'e-Invoice - IRN', 'e-Invoice - Bill to place',
    'e-Invoice - Ship to place', 'e-Invoice - Dispatch From Name', 'e-Invoice - Dispatch From Address',
    'e-Invoice - Dispatch From State', 'e-Invoice - Dispatch From Pincode', 'e-Invoice - Dispatch From Place',
    'e-Invoice Cancellation - Reason for Cancellation', 'e-Invoice Cancellation - Remarks',
    'e-Way Bill No.', 'e-Way Bill Date', 'Consolidated e-Way Bill No.', 'Consolidated e-Way Bill Date',
    'e-Way Bill - Sub-Type', 'e-Way Bill - Document Type', 'Consignor Details (From) - Address-1',
    'Consignor Details (From) - Address-2', 'Consignor Details (From) - Address Type',
    'Consignor Details (From) - Pincode', 'Consignor Details (From) - Place', 'Consignor Details (From) - Actual State',
    'Consignee Details (To) - Address-1', 'Consignee Details (To) - Address-2', 'Consignee Details (To) - Address Type',
    'Consignee Details (To) - Place', 'Consignee Details (To) - Actual State', 'Consignee Details (To) - Pincode',
    'e-Way Bill Transport Details - Pin to Pin Distance as per Portal', 'e-Way Bill Transport Details - Transporter Name',
    'e-Way Bill Transport Details - Transporter ID', 'e-Way Bill Transport Details - Mode',
    'e-Way Bill Transport Details - Doc/Lading/RR/Airway No.', 'e-Way Bill Transport Details - Doc/Lading/RR/Airway Date',
    'e-Way Bill Transport Details - Vehicle Number', 'e-Way Bill Transport Details - Vehicle Type',
    'e-Way Bill Transport Details - Place', 'e-Way Bill Transport Details - State',
    'e-Way Bill Transport Details - Reason', 'e-Way Bill Transport Details - Remarks',
    'e-Way Bill Extension Details - Remaining Distance(in KM)', 'e-Way Bill Extension Details - Mode',
    'e-Way Bill Extension Details - Doc/Lading/RR/Airway No.', 'e-Way Bill Extension Details - Doc/Lading/RR/Airway - Date',
    'e-Way Bill Extension Details - Vehicle Number', 'e-Way Bill Extension Details - Vehicle Type',
    'e-Way Bill Extension Details - Transit Type', 'e-Way Bill Extension Details - Address 1',
    'e-Way Bill Extension Details - Address 2', 'e-Way Bill Extension Details - Address 3',
    'e-Way Bill Extension Details - Current Pincode', 'e-Way Bill Extension Details - Current Place',
    'e-Way Bill Extension Details - Current State', 'e-Way Bill Extension Details - Reason',
    'e-Way Bill Extension Details - Remarks', 'e-Way Bill Cancellation Details - Reason',
    'e-Way Bill Cancellation Details - Remarks', 'GST Rate Details', 'GST Source of Details',
    'GST Source Type of Master', 'GST Taxability Type', 'GST Nature of Transaction', 'GST Classification',
    'IGST Rate', 'CGST Rate', 'SGST/UTGST Rate', 'Cess Rate', 'Cess Rate Per Unit', 'State Cess Rate',
    'Applicable for Reverse Charge', 'Eligible for Input Tax Credit', 'Taxable Value', 'HSN/SAC Details',
    'HSN/SAC Source of Details', 'HSN/SAC Source Type of Master', 'HSN/SAC Classification', 'HSN/SAC',
    'HSN Description', 'Buyer/Supplier - Bill to/from', 'Buyer/Supplier - Address Type',
    'Buyer/Supplier - Mailing Name', 'Buyer/Supplier - Address', 'Buyer/Supplier - Country',
    'Buyer/Supplier - State', 'Buyer/Supplier - GST Registration Type',
    'Buyer/Supplier - Assessee of Other Territory', 'Buyer/Supplier - GSTIN/UIN',
    'Buyer/Supplier - Is Bill of Entry available', 'Buyer/Supplier - Supplies under section 7 of IGST Act',
    'Buyer/Supplier - Place of Supply', 'Consignee (ship to)', 'Consignee - Mailing Name',
    'Consignee - Address Type', 'Consignee - Address', 'Consignee - State', 'Consignee - Country',
    'Consignee - GSTIN/UIN', 'Stat Adjustment (GST) - Type of Duty/Tax', 'Stat Adjustment (GST) - Nature of Adjustment',
    'Stat Adjustment (GST) - Additional Nature of Adjustment', 'Stat Adjustment (GST) - Rate',
    'Stat Adjustment (GST) - Taxable Value', 'Stat Adjustment (GST) - ISD Invoice/Debit/Credit Note No.',
    'Stat Adjustment (GST) - ISD Invoice/Debit/Credit Note Date', 'Stat Adjustment (GST) - Eligible for Input Tax Credit',
    'Stat Adjustment (GST) - Type of Supply', 'Type of Supply', 'Advance Payment/Receipt/Refund Details - IGST Rate',
    'Advance Payment/Receipt/Refund Details - IGST Amount', 'Advance Payment/Receipt/Refund Details - SGST Rate',
    'Advance Payment/Receipt/Refund Details - SGST Amount', 'Advance Payment/Receipt/Refund Details - CGST Rate',
    'Advance Payment/Receipt/Refund Details - CGST Amount', 'Advance Payment/Receipt/Refund Details - Cess Rate',
    'Advance Payment/Receipt/Refund Details - Cess Amount', 'Advance Payment/Receipt/Refund Details - Cess Rate Per Unit',
    'Advance Payment/Receipt/Refund Details - Cess per Unit Amount', 'Tax Type Allocations - IGST Liability',
    'Tax Type Allocations - CGST Liability', 'Tax Type Allocations - SGST/UTGST Liability',
    'Tax Type Allocations - Cess Liability', 'GST Advance Details - Month Year',
    'GST Advance Details - Place of Supply', 'GST Advance Details - GST Rate', 'GST Advance Details - Cess Rate',
    'GST Advance Details - Advance Amount', 'TDS - Nature of Payments', 'TDS - Assessable Value',
    'TDS Party Details - Party Name', 'TDS Party Details - Deductee Type', 'TDS Party Details - PAN Number',
    'TDS Bill Allocations - Type of Ref', 'TDS Bill Allocations - Name', 'TDS Bill Allocations - TDS Nature of Payment',
    'TDS Bill Allocations - Party Ledger', 'TDS Bill Allocations - Expenses Ledger', 'TDS Bill Allocations - Duty Ledger',
    'TDS Bill Allocations - Assessable Amount', 'TDS Bill Allocations - Payable Amount', 'TDS Bill Allocations - Paid Amount',
    'TCS - Nature of Goods', 'TCS - Assessable Value', 'Exemption from TCS for Buyer-Deductible TDS',
    'TCS Party Details - Party Name', 'TCS Party Details - Collectee Type', 'TCS Party Details - PAN Number',
    'TCS Bill Allocations - Type of Ref', 'TCS Bill Allocations - Name', 'TCS Bill Allocations - TCS Nature of Goods',
    'TCS Bill Allocations - Party Ledger', 'TCS Bill Allocations - Income Ledger', 'TCS Bill Allocations - Duty Ledger',
    'TCS Bill Allocations - Assessable Amount', 'TCS Bill Allocations - Payable Amount', 'TCS Bill Allocations - Paid Amount',
    'Stat Payment (GST) - Tax Type', 'Stat Payment (GST) - Type of Payment', 'Stat Payment (GST) - Period From',
    'Stat Payment (GST) - Period To', 'Stat Payment (TDS) - Tax Type', 'Stat Payment (TDS) - Period From',
    'Stat Payment (TDS) - Period To', 'Stat Payment (TDS) - Section', 'Stat Payment (TDS) - Nature of Payment',
    'Stat Payment (TDS) - Deductee Status', 'Stat Payment (TDS) - Residential Status', 'Stat Payment (TDS) - Cheque No.',
    'Stat Payment (TDS) - Cheque Date', 'Stat Payment (TDS) - BSR Code', 'Stat Payment (TDS) - Challan No.',
    'Stat Payment (TDS) - Challan Date', 'Stat Payment (TDS) - Bank Name', 'Stat Payment (TDS) - Branch Name',
    'Stat Payment (TCS) - Tax Type', 'Stat Payment (TCS) - Period From', 'Stat Payment (TCS) - Period To',
    'Stat Payment (TCS) - Section', 'Stat Payment (TCS) - Nature of Goods', 'Stat Payment (TCS) - Deductee Status',
    'Stat Payment (TCS) - Residential Status', 'Stat Payment (TCS) - Cheque No.', 'Stat Payment (TCS) - Cheque Date',
    'Stat Payment (TCS) - BSR Code', 'Stat Payment (TCS) - Challan No.', 'Stat Payment (TCS) - Challan Date',
    'Stat Payment (TCS) - Bank Name', 'Stat Payment (TCS) - Branch Name'
]

def perform_ocr_extraction(file_bytes, mime_type, api_key=None):
    if not api_key:
        api_key = api_key_manager.get_healthy_key()
    
    if not api_key:
        raise Exception("No healthy AI keys available")

    # The official 230-line prompt from scan_api.py
    header_json_fields = ', '.join([f'"{f}": ""' for f in HEADER_FIELDS])
    
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
    {header_json_fields}
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
        [prompt_text, {'mime_type': mime_type, 'data': file_bytes}],
        {},
        api_key
    )

    try:
        processed_data = parse_and_process_ocr(raw_text)
        return processed_data
    except Exception as e:
        logger.error(f"OCR Parsing Error: {str(e)}\nRaw text: {raw_text[:500]}")
        raise
