import re
import logging
from datetime import datetime
from typing import Dict, Any, Optional, List, Tuple
from django.db import transaction

logger = logging.getLogger(__name__)

# Standard GST tax rates in India
STANDARD_GST_RATES = {0.0, 0.05, 0.12, 0.18, 0.28}

# Prohibited keywords to exclude complex/extra charge invoices
PROHIBITED_KEYWORDS = {
    "discount": ["discount", "disc", "less", "rebate", "scheme"],
    "freight": ["freight", "transport", "shipping", "delivery charges", "handling charges", "postage", "carriage", "cartage"],
    "tcs": ["tcs", "tax collected at source"],
    "tds": ["tds", "tax deducted at source"],
    "round_off": ["round off", "rounded off", "round-off"],
    "additional_charges": ["additional charges", "loading", "unloading", "other charges", "insurance", "packing", "forwarding"]
}

def extract_dates(text: str) -> List[str]:
    """Finds and returns parsed dates in YYYY-MM-DD format from OCR text."""
    # Pattern 1: DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
    p1 = re.findall(r'\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})\b', text)
    # Pattern 2: YYYY-MM-DD or YYYY/MM/DD
    p2 = re.findall(r'\b(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})\b', text)
    # Pattern 3: DD-MMM-YYYY or DD MMM YYYY
    p3 = re.findall(r'\b(\d{1,2})[\/\-\.\s](Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\/\-\.\s,]+(\d{2,4})\b', text, re.IGNORECASE)

    candidates = []

    # Map month name to number
    months = {"jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6, "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12}

    for d, m, y in p1:
        try:
            day = int(d)
            month = int(m)
            year = int(y)
            if year < 100:
                year += 2000
            dt = datetime(year, month, day)
            candidates.append(dt.strftime("%Y-%m-%d"))
        except ValueError:
            pass

    for y, m, d in p2:
        try:
            day = int(d)
            month = int(m)
            year = int(y)
            dt = datetime(year, month, day)
            candidates.append(dt.strftime("%Y-%m-%d"))
        except ValueError:
            pass

    for d, m_name, y in p3:
        try:
            day = int(d)
            month = months[m_name.lower()[:3]]
            year = int(y)
            if year < 100:
                year += 2000
            dt = datetime(year, month, day)
            candidates.append(dt.strftime("%Y-%m-%d"))
        except (ValueError, KeyError):
            pass

    return candidates

def extract_invoice_numbers(text: str) -> List[str]:
    """Finds potential invoice numbers following labels."""
    patterns = [
        r'invoice\s*no\.?\s*[:\-#]?\s*([A-Za-z0-9\-/]+)',
        r'invoice\s*number\s*[:\-#]?\s*([A-Za-z0-9\-/]+)',
        r'bill\s*no\.?\s*[:\-#]?\s*([A-Za-z0-9\-/]+)',
        r'bill\s*number\s*[:\-#]?\s*([A-Za-z0-9\-/]+)',
        r'inv\s*no\.?\s*[:\-#]?\s*([A-Za-z0-9\-/]+)',
        r'invoice\s*[:\-#]?\s*([A-Za-z0-9\-/]+)',
        r'tax\s*invoice\s*no\.?\s*[:\-#]?\s*([A-Za-z0-9\-/]+)'
    ]
    candidates = []
    for pat in patterns:
        for m in re.finditer(pat, text, re.IGNORECASE):
            inv_no = m.group(1).strip()
            # Invoice number must contain at least one digit and be 3 to 25 characters long
            if re.search(r'\d', inv_no) and 3 <= len(inv_no) <= 25:
                candidates.append(inv_no)
    return candidates

def parse_all_numbers(text: str) -> List[float]:
    """Extracts all numbers in the text that look like currency or integer totals."""
    # Find numbers with decimals like 12,345.67 or 12345.67
    decimals = re.findall(r'\b\d{1,3}(?:,\d{3})*\.\d{2}\b|\b\d+\.\d{2}\b', text)
    numbers = []
    for d in decimals:
        try:
            val = float(d.replace(',', ''))
            numbers.append(val)
        except ValueError:
            pass
            
    # Also find integer numbers (but exclude small counts and HSN codes)
    integers = re.findall(r'\b\d+\b', text)
    for i in integers:
        try:
            val = float(i)
            # Exclude large numbers that look like dates/HSN or small ones that are index/counts
            if 10.0 <= val < 1000000.0 and val not in numbers:
                # Make sure it isn't an HSN-like or year-like number
                if not (4 <= len(i) <= 8 and i.startswith(('202', '199', '201', '99', '84', '73'))):
                    numbers.append(val)
        except ValueError:
            pass
            
    return sorted(list(set(numbers)))

def find_math_combination(numbers: List[float]) -> Optional[Tuple[float, float, float, float, float]]:
    """
    Finds a combination of (taxable_value, cgst, sgst, igst, total_amount) from numbers
    that reconciles mathematically within 1.0 rupee tolerance.
    """
    # Try Intrastate first (CGST + SGST)
    for total in numbers:
        for taxable in numbers:
            if taxable >= total:
                continue
            for tax in numbers:
                if tax >= total or tax >= taxable:
                    continue
                # Intrastate: cgst = tax, sgst = tax, igst = 0
                # Formula: total = taxable + cgst + sgst
                calc_total = taxable + tax + tax
                if abs(total - calc_total) < 1.0:
                    # Validate tax rate
                    rate = (tax + tax) / taxable
                    # Standard rates: e.g. 5%, 12%, 18%, 28% (so rate is 0.05, 0.12, 0.18, 0.28)
                    # Round to nearest percent
                    rounded_rate = round(rate, 2)
                    if rounded_rate in STANDARD_GST_RATES and rounded_rate > 0:
                        return taxable, tax, tax, 0.0, total

    # Try Interstate next (IGST only)
    for total in numbers:
        for taxable in numbers:
            if taxable >= total:
                continue
            for tax in numbers:
                if tax >= total or tax >= taxable:
                    continue
                # Interstate: cgst = 0, sgst = 0, igst = tax
                # Formula: total = taxable + igst
                calc_total = taxable + tax
                if abs(total - calc_total) < 1.0:
                    rate = tax / taxable
                    rounded_rate = round(rate, 2)
                    if rounded_rate in STANDARD_GST_RATES and rounded_rate > 0:
                        return taxable, 0.0, 0.0, tax, total

    return None

def extract_hsn_code(text: str, exclude_numbers: List[float]) -> str:
    """Finds a single HSN/SAC code of length 4 to 8."""
    # HSN codes are digit strings of length 4 to 8
    matches = re.findall(r'\b\d{4,8}\b', text)
    hsn_candidates = []
    for m in matches:
        # Exclude years and numbers that matched currency totals
        if m.startswith(('202', '199', '201')):
            continue
        try:
            val = float(m)
            if val in exclude_numbers:
                continue
            hsn_candidates.append(m)
        except ValueError:
            pass
            
    unique_hsn = list(set(hsn_candidates))
    if len(unique_hsn) == 1:
        return unique_hsn[0]
    elif len(unique_hsn) > 1:
        # Multiple HSN codes imply multiple line items or complex table structures
        raise ValueError("MULTIPLE_HSN_CODES")
    return ""

def extract_item_qty_rate(text: str, taxable_value: float) -> Tuple[Optional[float], Optional[float]]:
    """Attempts to find a Quantity and Rate combination that multiplies to taxable_value."""
    # Find all floats/ints in the text
    nums = re.findall(r'\b\d+\.\d{2,3}\b|\b\d+\b', text)
    candidate_nums = []
    for n in nums:
        try:
            val = float(n)
            if val > 0.0 and val != taxable_value:
                candidate_nums.append(val)
        except ValueError:
            pass
            
    # Try combinations of Q * R = taxable_value
    for q in candidate_nums:
        for r in candidate_nums:
            if abs(q * r - taxable_value) < 1.0:
                return q, r
                
    return None, None

def classify_simple_invoice(ocr_text: str, page_count: int, tenant_id: str) -> Optional[Dict[str, Any]]:
    """
    Deterministic simple invoice classifier (Safe version).
    Checks all conservative conditions, and if they pass, returns the parsed canonical JSON structure.
    If any check fails, returns None.
    """
    if not ocr_text:
        return None

    # Condition 1: Single page document
    if page_count != 1:
        logger.info("[BYPASS_REJECT] Not a single-page document.")
        return None

    # Condition 2: Check prohibited keywords (discounts, freight, TCS, TDS, round-off, adjustments)
    ocr_text_lower = ocr_text.lower()
    for category, kw_list in PROHIBITED_KEYWORDS.items():
        for kw in kw_list:
            if kw in ocr_text_lower:
                logger.info(f"[BYPASS_REJECT] Prohibited keyword found in text: '{kw}' (Category: {category})")
                return None

    # Condition 3: GSTIN present and classified
    from ocr_pipeline.gstin_classifier import GSTINOwnershipClassifier
    try:
        gstin_results = GSTINOwnershipClassifier.classify_gstins(ocr_text, {}, tenant_id)
        vendor_gstin = gstin_results.get('vendor_gstin')
        buyer_gstin = gstin_results.get('buyer_gstin')
    except Exception as ge:
        logger.warning(f"[BYPASS_REJECT] GSTIN classifier error: {ge}")
        return None

    if not vendor_gstin:
        logger.info("[BYPASS_REJECT] Vendor GSTIN not found in text.")
        return None

    # Condition 4: Vendor GSTIN matches master records
    from vendors.vendor_validation_logic import resolve_vendor_for_gstin_branch
    try:
        vendor_info = resolve_vendor_for_gstin_branch(tenant_id, vendor_gstin, "Main Branch")
    except Exception as ve:
        logger.warning(f"[BYPASS_REJECT] Vendor master resolution error: {ve}")
        return None

    if vendor_info.get("status") != "EXISTING_VENDOR":
        logger.info(f"[BYPASS_REJECT] Vendor GSTIN {vendor_gstin} is not registered in master records.")
        return None

    vendor_name = vendor_info.get("vendor_name")

    # Condition 5: Invoice date present
    dates = extract_dates(ocr_text)
    if not dates:
        logger.info("[BYPASS_REJECT] No valid invoice date found.")
        return None
    # Use the first date found as the invoice date candidate
    invoice_date = dates[0]

    # Condition 6: Invoice number present
    invoice_nos = extract_invoice_numbers(ocr_text)
    if not invoice_nos:
        logger.info("[BYPASS_REJECT] No valid invoice number found.")
        return None
    invoice_no = invoice_nos[0]

    # Condition 7: Mathematical reconciliation passes
    all_numbers = parse_all_numbers(ocr_text)
    reconciled = find_math_combination(all_numbers)
    if not reconciled:
        logger.info("[BYPASS_REJECT] Mathematical reconciliation failed. Numbers in text do not balance.")
        return None

    taxable_value, cgst, sgst, igst, total_amount = reconciled

    # Condition 8: Item count <= 1 & Single GST rate check
    try:
        # Exclude matched math amounts from HSN selection to avoid false positives
        hsn_code = extract_hsn_code(ocr_text, [taxable_value, cgst, sgst, igst, total_amount])
    except ValueError as e:
        if str(e) == "MULTIPLE_HSN_CODES":
            logger.info("[BYPASS_REJECT] Multiple HSN/SAC codes found. Implies multiple items.")
            return None
        hsn_code = ""

    # Estimate item description
    item_desc = "Service Charges" if igst > 0 or (cgst > 0 and sgst > 0) else "Purchase Item"
    # Find text on the same line as the HSN code if it exists
    if hsn_code:
        for line in ocr_text.split('\n'):
            if hsn_code in line:
                # Strip out numbers and common formatting to get description
                clean_line = re.sub(r'\b\d+\b|\b\d+[\.,]\d{2}\b|[\/\|\:\-#]', '', line).strip()
                if len(clean_line) > 5:
                    item_desc = clean_line
                    break

    # Determine Quantity and Rate
    qty, rate = extract_item_qty_rate(ocr_text, taxable_value)
    if qty is None or rate is None:
        qty = 1.0
        rate = taxable_value

    # Compute tax rates
    cgst_rate = 0.0
    sgst_rate = 0.0
    igst_rate = 0.0
    if cgst > 0:
        cgst_rate = round((cgst / taxable_value) * 100.0, 1)
        sgst_rate = round((sgst / taxable_value) * 100.0, 1)
    elif igst > 0:
        igst_rate = round((igst / taxable_value) * 100.0, 1)

    # Output canonical extraction payload
    payload = {
        "header": {
            "vendor_name": vendor_name,
            "vendor_address": "",
            "billing_address": "",
            "vendor_gstin": vendor_gstin,
            "vendor_state": "",
            "place_of_supply": "",
            "invoice_no": invoice_no,
            "invoice_date": invoice_date,
            "total_amount": total_amount,
            "taxable_value": taxable_value,
            "cgst": cgst,
            "sgst": sgst,
            "igst": igst,
            "gst_taxability_type": "Taxable",
            "gst_nature_of_transaction": "Intrastate" if cgst > 0 else "Interstate",
            "sales_order_no": "",
            "irn": "",
            "ack_no": "",
            "ack_date": ""
        },
        "items": [
            {
                "description": item_desc,
                "hsn_code": hsn_code,
                "quantity": qty,
                "uom": "NOS",
                "rate": rate,
                "discount_percent": 0.0,
                "taxable_value": taxable_value,
                "igst_rate": igst_rate,
                "igst_amount": igst,
                "cgst_rate": cgst_rate,
                "cgst_amount": cgst,
                "sgst_rate": sgst_rate,
                "sgst_amount": sgst,
                "cess_rate": 0.0,
                "cess_amount": 0.0,
                "amount": total_amount
            }
        ]
    }

    logger.info(f"[SIMPLE_INVOICE_BYPASS_CANDIDATE] Reconciled simple invoice: InvNo={invoice_no} Date={invoice_date} Total={total_amount} Vendor={vendor_name}")
    return payload
