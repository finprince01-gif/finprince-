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
    raw_items = data.get("line_items", [])
    normalized_items = []
    for item in raw_items:
        normalized_items.append({
            "description": str(item.get("description") or "").strip(),
            "hsn_sac": str(item.get("hsn_code") or item.get("hsn_sac") or "").strip(),
            "quantity": normalize_amount(item.get("quantity")),
            "uom": str(item.get("uom") or "").strip(),
            "rate": normalize_amount(item.get("rate")),
            "taxable_value": normalize_amount(item.get("taxable_value")),
            "cgst": normalize_amount(item.get("cgst")),
            "sgst": normalize_amount(item.get("sgst")),
            "igst": normalize_amount(item.get("igst")),
            "amount": normalize_amount(item.get("amount") or item.get("total"))
        })

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
                "vendor_city": vendor_city,
                "gstin": str(data.get("gstin", "")).replace(" ", "").upper(),
                "supplier_invoice_no": str(inv_no).strip(),
                "invoice_date": normalize_date(inv_date),
                "place_of_supply": str(data.get("place_of_supply", "")).strip(),
                # Branch = derived city (editable in UI, never hallucinated)
                "branch": branch or None
            },
            "supply_details": {
                "total_invoice_value": normalize_amount(total_amt),
                "total_taxable_value": normalize_amount(tax_amt),
                "total_cgst": normalize_amount(data.get("cgst")),
                "total_sgst": normalize_amount(data.get("sgst")),
                "total_igst": normalize_amount(data.get("igst")),
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
