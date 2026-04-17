import logging
import re
from typing import Dict, Any, Optional
from datetime import datetime

logger = logging.getLogger(__name__)

def normalize_amount(amount: Any) -> float:
    """Helper to convert various amount formats to float."""
    if amount is None or amount == "":
        return 0.0
    
    if isinstance(amount, (int, float)):
        return float(amount)
        
    try:
        cleaned = re.sub(r'[^\d.]', '', str(amount))
        return float(cleaned) if cleaned else 0.0
    except (ValueError, TypeError):
        logger.warning(f"Failed to normalize amount: {amount}")
        return 0.0

def normalize_date(date_val: Any) -> str:
    """
    Standardize various date formats to YYYY-MM-DD for UI/HTML5 compatibility.
    """
    if not date_val:
        return ""
    
    if isinstance(date_val, (datetime)):
        return date_val.strftime("%Y-%m-%d")

    date_str = str(date_val).strip()
    if not date_str:
        return ""

    formats = [
        "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d.%m.%Y",
        "%d-%b-%y", "%d-%b-%Y", "%d %b %Y", "%d %b %y",
        "%Y/%m/%d", "%m/%d/%Y", "%m-%d-%Y"
    ]

    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
            
    try:
        match = re.search(r'(\d{1,2})[-./\s]([a-zA-Z]{3}|\d{1,2})[-./\s](\d{2,4})', date_str)
        if match:
            day, mon, year = match.groups()
            if mon.isalpha():
                for fmt in ["%d-%b-%y", "%d-%b-%Y"]:
                    try:
                        temp = f"{day}-{mon}-{year}"
                        return datetime.strptime(temp, fmt).strftime("%Y-%m-%d")
                    except ValueError: continue
            else:
                for fmt in ["%d-%m-%Y", "%d/%m/%Y", "%d-%m-%y"]:
                    try:
                        temp = f"{day}-{mon}-{year}"
                        return datetime.strptime(temp, fmt).strftime("%Y-%m-%d")
                    except ValueError: continue
    except Exception:
        pass

    logger.warning(f"Unrecognized date format: {date_str}")
    return date_str

# ─────────────────────────────────────────────────────────────
# Branch/City Derivation
# ─────────────────────────────────────────────────────────────

# Indian city name set — commonly found in vendor addresses
# Extensible: just add city names here
_KNOWN_CITIES = {
    "coimbatore", "chennai", "mumbai", "pune", "delhi", "bangalore", "bengaluru",
    "hyderabad", "kolkata", "ahmedabad", "surat", "jaipur", "lucknow", "kanpur",
    "nagpur", "visakhapatnam", "indore", "thane", "bhopal", "pimpri", "patna",
    "vadodara", "ghaziabad", "ludhiana", "agra", "nashik", "faridabad", "meerut",
    "rajkot", "bhilai", "kalyan", "madurai", "jabalpur", "jamshedpur", "asansol",
    "vasai", "virar", "allahabad", "dhanbad", "aurangabad", "amritsar", "tiruppur",
    "ranchi", "howrah", "kochi", "erode", "salem", "tirunelveli", "navi mumbai",
    "tirupur", "guwahati", "chandigarh", "hubli", "mysore", "bareilly",
    "raipur", "jalandhar", "kolhapur", "gwalior", "vijayawada", "warangal",
    "srinagar", "jodhpur", "madurai", "trichy", "tiruchirappalli", "pondicherry",
    "vellore", "cuddalore", "nellore", "kurnool",
}

def derive_city_from_address(address: str) -> str:
    """
    Fallback: parse city from vendor_address when vendor_city is absent.

    Strategy (in priority order):
    1. Match word before a 6-digit PIN code → e.g. "Coimbatore - 641 001"
    2. Match known Indian cities in the address text
    3. Return "" (never hallucinate)
    """
    if not address:
        return ""

    addr = address.strip()

    # Strategy 1: word(s) immediately before a 6-digit PIN code
    # Handles: "Coimbatore - 641001", "Coimbatore 641 001", "Coimbatore, 626 001"
    match = re.search(
        r'([A-Za-z][A-Za-z\s,\-]+?)\s*[-–,]?\s*(\d{3}\s?\d{3})\b',
        addr
    )
    if match:
        candidate = match.group(1).strip()
        # Take only the last segment after comma/newline
        candidate = re.split(r'[,\n]', candidate)[-1].strip()
        # Strip common non-city prefixes
        candidate = re.sub(
            r'^(Dist\.?|District|Taluk|Village|Ward|Area|Near|Opp\.?|S\.?\s?No\.?|Plot\.?|No\.?|Phase|Block)\s*',
            '', candidate, flags=re.IGNORECASE
        ).strip()
        if 2 <= len(candidate) <= 40:
            logger.info(f"BRANCH (PIN strategy): '{candidate}' from address")
            return candidate


    # Strategy 2: scan for known cities in the address (case-insensitive)
    addr_lower = addr.lower()
    for city in sorted(_KNOWN_CITIES, key=len, reverse=True):  # longest match first
        if re.search(r'\b' + re.escape(city) + r'\b', addr_lower):
            result = city.title()
            logger.info(f"BRANCH (known city match): '{result}' from address")
            return result

    return ""

def normalize(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Step 2: Correct Hierarchical Normalization.
    Directly produces the nested structure expected by the UI.

    Branch derivation rules:
      1. vendor_city (from AI extraction) → use directly
      2. Fallback: parse city from vendor_address
      3. Always editable in the UI after this point
    """
    # ── Line Items ──────────────────────────────────────────────
    raw_items = data.get("line_items", []) or data.get("items", [])
    normalized_items = []
    for i, item in enumerate(raw_items):
        # --- Failsafe: Derive Missing Values ---
        qty = normalize_amount(item.get("quantity"))
        hsn_sac = str(item.get("hsn_code") or item.get("hsn_sac") or "").strip()
        
        # Default quantity to 1 for Services (HSN/SAC starting with 99)
        if hsn_sac.startswith("99") and qty == 0:
            qty = 1.0

        rate = normalize_amount(item.get("rate"))
        item_taxable = normalize_amount(item.get("taxable_value") or item.get("taxable_amount"))
        
        # If taxable value is missing but we have Qty & Rate, derive it
        if item_taxable == 0 and qty > 0 and rate > 0:
            item_taxable = qty * rate
            
        # If tax rates are 0 in item but present in header (summary), distribute them
        igst_r = normalize_amount(item.get("igst_rate"))
        if igst_r == 0: igst_r = normalize_amount(data.get("igst_rate") or data.get("igst_percent"))
        
        cgst_r = normalize_amount(item.get("cgst_rate"))
        if cgst_r == 0: cgst_r = normalize_amount(data.get("cgst_rate") or data.get("cgst_percent"))
        
        sgst_r = normalize_amount(item.get("sgst_rate"))
        if sgst_r == 0: sgst_r = normalize_amount(data.get("sgst_rate") or data.get("sgst_percent"))

        cess_r = normalize_amount(item.get("cess_rate"))
        if cess_r == 0: cess_r = normalize_amount(data.get("cess_rate") or data.get("cess_percent"))

        normalized_items.append({
            "si_no": str(item.get("si_no") or (i+1)),
            "description": str(item.get("description") or "").strip(),
            "hsn_sac": str(item.get("hsn_code") or item.get("hsn_sac") or "").strip(),
            "quantity": qty,
            "uom": str(item.get("uom") or "").strip(),
            "rate": rate,
            "discount_percent": normalize_amount(item.get("discount_percent") or item.get("disc")),
            "taxable_value": item_taxable,
            "igst_rate": igst_r,
            "igst_amount": normalize_amount(item.get("igst_amount") or item.get("igst")),
            "cgst_rate": cgst_r,
            "cgst_amount": normalize_amount(item.get("cgst_amount") or item.get("cgst")),
            "sgst_rate": sgst_r,
            "sgst_amount": normalize_amount(item.get("sgst_amount") or item.get("sgst")),
            "cess_rate": cess_r,
            "cess_amount": normalize_amount(item.get("cess_amount") or item.get("cess")),
            "amount": normalize_amount(item.get("amount") or item.get("total"))
        })

    # Header-level tax rates for fallback distribution (Step 4: distribute summary GST)
    header_igst_r = normalize_amount(data.get("igst_rate") or data.get("igst_percent") or data.get("igst"))
    header_cgst_r = normalize_amount(data.get("cgst_rate") or data.get("cgst_percent") or data.get("cgst"))
    header_sgst_r = normalize_amount(data.get("sgst_rate") or data.get("sgst_percent") or data.get("sgst"))
    header_cess_r = normalize_amount(data.get("cess_rate") or data.get("cess_percent") or data.get("cess"))

    # Only distribute if summary rate looks like a percentage (e.g. 9, 18, 5)
    # If the summary value is very large, it's probably an amount, not a rate.
    def is_likely_rate(val): return 0 < val <= 28

    for item in normalized_items:
        if item["igst_rate"] == 0 and is_likely_rate(header_igst_r): item["igst_rate"] = header_igst_r
        if item["cgst_rate"] == 0 and is_likely_rate(header_cgst_r): item["cgst_rate"] = header_cgst_r
        if item["sgst_rate"] == 0 and is_likely_rate(header_sgst_r): item["sgst_rate"] = header_sgst_r
        if item["cess_rate"] == 0 and is_likely_rate(header_cess_r): item["cess_rate"] = header_cess_r
        
        # taxable_value failsafe (Qty * Rate) if still 0
        if item["taxable_value"] == 0 and item["quantity"] > 0 and item["rate"] > 0:
            item["taxable_value"] = item["quantity"] * item["rate"]

    vendor_address = str(data.get("vendor_address", "")).strip()

    # ── Branch Derivation (auto, NOT from direct OCR) ──────────
    vendor_city = str(data.get("vendor_city", "")).strip()
    manual_branch = str(data.get("branch") or data.get("Branch") or "").strip()
    
    if manual_branch:
        branch = manual_branch
        logger.info(f"BRANCH kept from manual entry: '{branch}'")
    elif vendor_city:
        branch = vendor_city
        logger.info(f"BRANCH set from vendor_city: '{branch}'")
    else:
        branch = derive_city_from_address(vendor_address)
        if branch:
            logger.info(f"BRANCH derived from address: '{branch}'")
        else:
            branch = ""
            logger.info("BRANCH: could not derive city from address — leaving empty for manual entry")

    # ── Hierarchical structure for UI sections ──────────────────
    # Helper to get field with aliases
    def get_field(keys, default=""):
        for k in keys:
            val = data.get(k)
            if val is not None and val != "":
                return val
        return default

    # Aliases for robust mapping
    inv_no = get_field(["invoice_number", "invoice_no", "inv_no", "bill_no", "supplier_invoice_no"])
    inv_date = get_field(["invoice_date", "date", "bill_date", "supplier_invoice_date"])
    total_amt = get_field(["total_amount", "total_invoice_value", "grand_total", "total"])
    tax_amt = get_field(["taxable_value", "subtotal", "taxable_amount"])

    result = {
        "sections": {
            "supplier_details": {
                "vendor_name": str(data.get("vendor_name", "")).strip(),
                "vendor_address": vendor_address,
                "bill_from": vendor_address,
                "ship_from": vendor_address,
                "vendor_city": vendor_city,
                "vendor_state": str(data.get("vendor_state") or data.get("state") or "").strip(),
                "vendor_country": str(data.get("vendor_country") or "India").strip(),
                "registration_type": str(data.get("registration_type") or ("Regular" if data.get("gstin") else "")).strip(),
                "gst_taxability_type": str(data.get("gst_taxability_type") or "Taxable").strip(),
                "gst_nature_of_transaction": str(data.get("gst_nature_of_transaction") or "").strip(),
                "gst_classification": str(data.get("gst_classification") or "").strip(),
                "gstin": str(data.get("gstin", "")).replace(" ", "").upper(),
                "supplier_invoice_no": str(inv_no).strip(),
                "invoice_date": normalize_date(inv_date),
                "place_of_supply": str(data.get("place_of_supply") or data.get("vendor_state") or "").strip(),
                # Branch = derived city (editable in UI, never hallucinated)
                "branch": branch or None
            },
            "supply_details": {
                "total_invoice_value": normalize_amount(total_amt),
                "total_taxable_value": normalize_amount(tax_amt),
                "total_cgst": normalize_amount(data.get("cgst") or data.get("total_cgst")),
                "total_sgst": normalize_amount(data.get("sgst") or data.get("total_sgst")),
                "total_igst": normalize_amount(data.get("igst") or data.get("total_igst")),
                "ack_no": str(data.get("ack_number", "")).strip(),
                "ack_date": normalize_date(data.get("ack_date"))
            },
            "due_details": {
                "due_date": normalize_date(data.get("due_date")),
                "payment_terms": str(data.get("payment_terms", "")).strip()
            },
            "transit_details": {
                "transporter_name": str(data.get("transporter_name", "")).strip(),
                "vehicle_no": str(data.get("vehicle_number", "")).strip(),
                "lr_gr_consignment": str(data.get("lr_number", "")).strip()
            },
            "items": normalized_items
        },
        # Top-level aliases for table display
        "vendor_name": str(data.get("vendor_name", "")).strip(),
        "vendor_address": vendor_address,
        "gstin": str(data.get("gstin", "")).replace(" ", "").upper(),
        "supplier_invoice_no": str(inv_no).strip(),
        "invoice_date": normalize_date(inv_date),
        "total_invoice_value": normalize_amount(total_amt),
        "currency": str(data.get("currency", "INR")).upper()
    }
    
    logger.info(f"NORMALIZED DATA: sections.supplier_details.branch = '{branch}'")
    return result
