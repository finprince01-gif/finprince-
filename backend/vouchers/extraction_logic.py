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

def perform_ocr_extraction(file_bytes, mime_type, api_key=None, pre_extracted_text=None, hint_data=None):
    if not api_key:
        api_key = api_key_manager.get_healthy_key()
    
    if not api_key:
        raise Exception("No healthy AI keys available")

    prompt_text = """
You are a high-precision enterprise data extraction engine.
Return ONLY valid JSON. No conversational text.

STRICT SCHEMA RULE:
{
  "supplier_invoice_no": string,
  "purchase_voucher_series": string,
  "purchase_voucher_no": string,
  "invoice_date": string (YYYY-MM-DD),
  "due_date": string (YYYY-MM-DD),
  "vendor_name": string,
  "gstin": string,
  "branch": string,
  "input_type": "Goods" | "Services" | null,
  "place_of_supply": string,
  "currency": string,
  "conversion_rate": number,
  "purchase_order_no": string,

  "bill_from_address_line_1": string,
  "bill_from_address_line_2": string,
  "bill_from_city": string,
  "bill_from_state": string,
  "bill_from_pincode": string,
  "bill_from_country": string,

  "ship_from_address_line_1": string,
  "ship_from_address_line_2": string,
  "ship_from_city": string,
  "ship_from_state": string,
  "ship_from_pincode": string,
  "ship_from_country": string,

  "total_taxable_value": number,
  "total_igst": number,
  "total_cgst": number,
  "total_sgst": number,
  "total_invoice_value": number,

  "line_items": [
    {
      "item_code": string,
      "description": string,
      "hsn_sac": string,
      "quantity": number,
      "uom": string,
      "rate": number,
      "taxable_value": number,
      "igst": number,
      "cgst": number,
      "sgst": number,
      "amount": number
    }
  ]
}

EXTRACTION RULES:
1. Normalize keys to snake_case.
2. For dates, use YYYY-MM-DD format if possible.
3. For addresses, break them down into Line 1, Line 2, City, State, Pincode.
4. If a field is not found, use null or an empty string.
5. Extract numeric parts only for currency/rate/quantity. Do not include ₹ or units in numeric fields.
6. For 'Voucher Series' or 'Voucher Number', if missing, leave blank.
7. Be extremely accurate with GSTIN (15 chars) and Invoice Number.

8. EVEN IF THE PAGE LOOKS BLANK, BLURRY, OR UNRELATED, YOU MUST RETURN A VALID JSON OBJECT {}.
9. NEVER include conversational text or markdown blocks (```json) outside the main result.
10. If an invoice is clearly present but hard to read, provide your BEST GUESS for the most important fields (GSTIN, Invoice No, Vendor, Total) based on any visible text.
"""

    hint = ""
    if hint_data and 'columns' in hint_data:
        cols = hint_data['columns']
        hint += f"\nSTRICT VOUCHER-TYPE HEADER LIST (FOCUS ON THESE):\n{', '.join(cols)}\n"
        hint += "\nIMPORTANT: The above list is the source of truth for the fields required for this specific voucher type. Ensure you prioritize these headers.\n"
        hint += "Note: If you find 'Reference No' and it looks like an Order Number, map it to 'Sales Order No' or 'Purchase Order No' respectively.\n"

    if pre_extracted_text:
        hint += f"\nOCR RAW TEXT (FOR REFERENCE):\n{pre_extracted_text}\n"
    
    final_prompt = prompt_text + hint

    raw_text = execute_with_retry(
        [final_prompt, {'mime_type': mime_type, 'data': file_bytes}],
        {},
        api_key
    )

    try:
        # This will now use the standardized parser which enforces snake_case and flattens structure
        processed_data = parse_and_process_ocr(raw_text)
        return processed_data
    except Exception as e:
        logger.error(f"OCR Parsing Error: {str(e)}\nRaw text: {raw_text[:500]}")
        raise

