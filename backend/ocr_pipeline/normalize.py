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

# ── Key Aliases for Robust Mapping (OCR Stability Layer) ─────
KEY_ALIASES = {
    # Canonical : [Possible AI variations]
    "gstin": ["gstin", "vendor_gstin", "supplier_gstin", "gst_no", "tax_id"],
    "vendor_name": ["vendor_name", "supplier_name", "seller_name", "party_name", "vendor"],
    "vendor_address": ["vendor_address", "supplier_address", "address", "bill_from", "seller_address"],
    "vendor_state": ["vendor_state", "state", "place_of_supply", "vendor_place_of_supply"],
    "invoice_no": ["invoice_no", "invoice_number", "inv_no", "bill_no", "supplier_invoice_no", "reference_no"],
    "invoice_date": ["invoice_date", "date", "bill_date", "inv_date", "voucher_date", "tax_invoice_date"],
    "total_amount": ["total_amount", "total_invoice_value", "grand_total", "total", "invoice_value", "final_amount"],
    "taxable_value": ["taxable_value", "subtotal", "taxable_amount", "assessable_value", "net_amount", "taxable_value_total"],
    "total_cgst": ["total_cgst", "cgst", "cgst_amount", "central_tax", "cgst_value", "total_central_tax"],
    "total_sgst": ["total_sgst", "sgst", "sgst_amount", "state_tax", "utgst", "sgst_value", "total_state_tax"],
    "total_igst": ["total_igst", "igst", "igst_amount", "integrated_tax", "igst_value", "igst_tax"]
}

def resolve_key(data: Dict[str, Any], canonical_key: str) -> Any:
    """
    Looks up a value in data based on a list of aliases.
    Recursive search inside 'sections' if present.
    """
    aliases = KEY_ALIASES.get(canonical_key, [canonical_key])
    
    # 0. DIRECT MATCH PRIORITY (for structured inputs)
    if canonical_key in data and data[canonical_key] not in (None, ""):
        return data[canonical_key]

    # 1. Check top level
    for alt in aliases:
        if alt in data and data[alt] not in (None, ""):
            return data[alt]
            
    # 2. Check inside 'sections' (for re-normalization of already structured data)
    sections = data.get("sections", {})
    if sections:
        for section in sections.values():
            if isinstance(section, dict):
                for alt in aliases:
                    if alt in section and section[alt] not in (None, ""):
                        return section[alt]
    
    # 3. Last ditch: some models produce supply_details, supplier_details directly
    for k in ["supply_details", "supplier_details", "supplyDetails", "supplierDetails"]:
        sub = data.get(k, {})
        if isinstance(sub, dict):
            for alt in aliases:
                if alt in sub and sub[alt] not in (None, ""):
                    return sub[alt]

    return None

def normalize(data_in: Dict[str, Any]) -> Dict[str, Any]:
    """
    Step 2: Correct Hierarchical Normalization (Lossless Adapter).
    Directly produces the nested structure expected by the UI.
    """
    # ── RAW BACKUP (Lossless) ──────────────────────────────────
    # Always work on the rawest data available (original OCR output)
    data = data_in.get("_raw_source") or data_in.copy()
    raw_source = data.copy()

    # Define likely rate check here for reuse
    def is_likely_rate(val): return 0 < val <= 28

    # ── HEURISTIC HEADER DETECTION ──
    # Aggressively find header amounts to drive reconciliation
    hdr_taxable = normalize_amount(resolve_key(data, "taxable_value"))
    
    # Try multiple common keys for taxes if resolve_key missed some
    hdr_cgst_amt = normalize_amount(resolve_key(data, "total_cgst") or data.get("cgst"))
    hdr_sgst_amt = normalize_amount(resolve_key(data, "total_sgst") or data.get("sgst"))
    hdr_igst_amt = normalize_amount(resolve_key(data, "total_igst") or data.get("igst"))
    hdr_cess_amt = normalize_amount(resolve_key(data, "total_cess") or data.get("cess"))
    
    # Fallback for structured data where resolve_key might have skipped subsections
    if "sections" in data:
        sec = data["sections"].get("supply_details", {})
        if not hdr_cgst_amt: hdr_cgst_amt = normalize_amount(sec.get("total_cgst") or sec.get("cgst"))
        if not hdr_sgst_amt: hdr_sgst_amt = normalize_amount(sec.get("total_sgst") or sec.get("sgst"))
        if not hdr_igst_amt: hdr_igst_amt = normalize_amount(sec.get("total_igst") or sec.get("igst"))
        if not hdr_cess_amt: hdr_cess_amt = normalize_amount(sec.get("total_cess") or sec.get("cess"))
        if not hdr_taxable: hdr_taxable = normalize_amount(sec.get("total_taxable_value") or sec.get("taxable_value"))

    # Header-level tax rates for fallback distribution
    header_igst_r = normalize_amount(resolve_key(data, "igst_rate") or data.get("igst_percent"))
    header_cgst_r = normalize_amount(resolve_key(data, "cgst_rate") or data.get("cgst_percent"))
    header_sgst_r = normalize_amount(resolve_key(data, "sgst_rate") or data.get("sgst_percent"))
    header_cess_r = normalize_amount(resolve_key(data, "cess_rate") or data.get("cess_percent"))

    # ── Line Items ──────────────────────────────────────────────
    # Try multiple places: top-level, inside sections (standard UI format), or via aliases
    raw_items = data.get("items")
    if not raw_items and "sections" in data:
        raw_items = data["sections"].get("items")
    
    if not raw_items:
        raw_items = resolve_key(data, "line_items") or []
    
    if not isinstance(raw_items, list): raw_items = []
    
    normalized_items = []
    item_sum_cgst = 0
    item_sum_sgst = 0
    item_sum_igst = 0

    for i, item in enumerate(raw_items):
        qty = normalize_amount(item.get("quantity") or item.get("qty"))
        rate = normalize_amount(item.get("rate") or item.get("item_rate"))
        item_taxable = normalize_amount(item.get("taxable_value") or item.get("taxable_amount") or item.get("amount") or item.get("net_amount"))
        
        if item_taxable == 0 and qty > 0 and rate > 0:
            item_taxable = qty * rate
            
        igst_r = normalize_amount(item.get("igst_rate") or item.get("igst_percent") or item.get("igst_tax_rate"))
        cgst_r = normalize_amount(item.get("cgst_rate") or item.get("cgst_percent") or item.get("cgst_tax_rate"))
        sgst_r = normalize_amount(item.get("sgst_rate") or item.get("sgst_percent") or item.get("sgst_tax_rate"))
        cess_r = normalize_amount(item.get("cess_rate") or item.get("cess_percent"))

        igst_a = normalize_amount(item.get("igst_amount") or item.get("igst"))
        cgst_a = normalize_amount(item.get("cgst_amount") or item.get("cgst"))
        sgst_a = normalize_amount(item.get("sgst_amount") or item.get("sgst"))

        item_sum_cgst += cgst_a
        item_sum_sgst += sgst_a
        item_sum_igst += igst_a

        normalized_items.append({
            "si_no": str(item.get("si_no") or item.get("s_no") or (i+1)),
            "description": str(item.get("description") or item.get("item_name") or item.get("itemName") or "").strip(),
            "hsn_sac": str(item.get("hsn_code") or item.get("hsn_sac") or "").strip(),
            "quantity": qty,
            "uom": str(item.get("uom") or item.get("unit") or "").strip(),
            "rate": rate,
            "discount_percent": normalize_amount(item.get("discount_percent") or item.get("disc")),
            "taxable_value": item_taxable,
            "igst_rate": igst_r,
            "igst_amount": igst_a,
            "cgst_rate": cgst_r,
            "cgst_amount": cgst_a,
            "sgst_rate": sgst_r,
            "sgst_amount": sgst_a,
            "cess_rate": cess_r,
            "cess_amount": normalize_amount(item.get("cess_amount") or item.get("cess")),
            "amount": normalize_amount(item.get("amount") or item.get("total") or item.get("line_total") or item.get("invoice_value"))
        })

    # ── INTEGRATED TAX TYPE RECONCILIATION ──
    # If header taxes are missing, derive them from item sums
    if hdr_cgst_amt == 0 and item_sum_cgst > 0: hdr_cgst_amt = item_sum_cgst
    if hdr_sgst_amt == 0 and item_sum_sgst > 0: hdr_sgst_amt = item_sum_sgst
    if hdr_igst_amt == 0 and item_sum_igst > 0: hdr_igst_amt = item_sum_igst

    # Now reconcile based on confirmed header types
    for item in normalized_items:
        # Case A: Conclusive Intrastate (CGST/SGST present, IGST absent at header)
        if (hdr_cgst_amt > 0 or hdr_sgst_amt > 0) and hdr_igst_amt == 0:
            if item["igst_rate"] > 0 and item["cgst_rate"] == 0:
                rate = item["igst_rate"]
                item["cgst_rate"], item["sgst_rate"] = rate / 2, rate / 2
                item["igst_rate"], item["igst_amount"] = 0, 0
            
            if item["cgst_rate"] == 0 and is_likely_rate(header_cgst_r): item["cgst_rate"] = header_cgst_r
            if item["sgst_rate"] == 0 and is_likely_rate(header_sgst_r): item["sgst_rate"] = header_sgst_r

        # Case B: Conclusive Interstate (IGST present, CGST/SGST absent at header)
        elif hdr_igst_amt > 0 and (hdr_cgst_amt == 0 and hdr_sgst_amt == 0):
            if (item["cgst_rate"] > 0 or item["sgst_rate"] > 0) and item["igst_rate"] == 0:
                item["igst_rate"] = item["cgst_rate"] + item["sgst_rate"]
                item["cgst_rate"], item["cgst_amount"] = 0, 0
                item["sgst_rate"], item["sgst_amount"] = 0, 0
            
            if item["igst_rate"] == 0 and is_likely_rate(header_igst_r): item["igst_rate"] = header_igst_r

        # ── Final Amount Recalculation ──
        # Re-calculate amounts based on the reconciled rates
        if item["igst_rate"] > 0: item["igst_amount"] = round((item["taxable_value"] * item["igst_rate"]) / 100, 2)
        if item["cgst_rate"] > 0: item["cgst_amount"] = round((item["taxable_value"] * item["cgst_rate"]) / 100, 2)
        if item["sgst_rate"] > 0: item["sgst_amount"] = round((item["taxable_value"] * item["sgst_rate"]) / 100, 2)
        
        # Final row total
        item["amount"] = round(item["taxable_value"] + item["igst_amount"] + item["cgst_amount"] + item["sgst_amount"] + item["cess_amount"], 2)

    vendor_address = str(resolve_key(data, "vendor_address") or "").strip()

    # ── Branch Derivation ──────────────────────────────────────
    vendor_city = str(data.get("vendor_city") or "").strip()
    manual_branch = str(data.get("branch") or data.get("Branch") or "").strip()
    
    if manual_branch:
        branch = manual_branch
    elif vendor_city:
        branch = vendor_city
    else:
        branch = derive_city_from_address(vendor_address)

    # ── Robust Field Resolution (Aliases Applied) ─────────────
    name = str(resolve_key(data, "vendor_name") or "").strip()
    gstin = str(resolve_key(data, "gstin") or "").replace(" ", "").upper()
    inv_no = str(resolve_key(data, "invoice_no") or "").strip()
    inv_date = normalize_date(resolve_key(data, "invoice_date"))
    total_amt = normalize_amount(resolve_key(data, "total_amount"))
    tax_amt = normalize_amount(resolve_key(data, "taxable_value"))
    state = str(resolve_key(data, "vendor_state") or "").strip()

    # ── Hierarchical structure for UI sections ──────────────────
    result = {
        "sections": {
            "supplier_details": {
                "vendor_name": name,
                "vendor_address": vendor_address,
                "bill_from": vendor_address,
                "ship_from": vendor_address,
                "vendor_city": vendor_city,
                "vendor_state": state,
                "vendor_country": str(data.get("vendor_country") or "India").strip(),
                "registration_type": str(data.get("registration_type") or ("Regular" if gstin else "")).strip(),
                "gst_taxability_type": str(data.get("gst_taxability_type") or "Taxable").strip(),
                "gst_nature_of_transaction": str(data.get("gst_nature_of_transaction") or "").strip(),
                "gst_classification": str(data.get("gst_classification") or "").strip(),
                "gstin": gstin,
                "supplier_invoice_no": inv_no,
                "invoice_date": inv_date,
                "place_of_supply": str(data.get("place_of_supply") or state or "").strip(),
                "branch": branch or None
            },
            "supply_details": {
                "total_invoice_value": total_amt,
                "total_taxable_value": tax_amt,
                "total_cgst": normalize_amount(resolve_key(data, "total_cgst")),
                "total_sgst": normalize_amount(resolve_key(data, "total_sgst")),
                "total_igst": normalize_amount(resolve_key(data, "total_igst")),
                "ack_no": str(data.get("ack_number") or "").strip(),
                "ack_date": normalize_date(data.get("ack_date"))
            },
            "due_details": {
                "due_date": normalize_date(data.get("due_date")),
                "payment_terms": str(data.get("payment_terms") or "").strip()
            },
            "transit_details": {
                "transporter_name": str(data.get("transporter_name") or "").strip(),
                "vehicle_no": str(data.get("vehicle_number") or "").strip(),
                "lr_gr_consignment": str(data.get("lr_number") or "").strip()
            },
            "items": normalized_items
        },
        # Top-level aliases for table display (Consistency with UI)
        "vendor_name": name,
        "vendor_address": vendor_address,
        "gstin": gstin,
        "supplier_invoice_no": inv_no,
        "invoice_date": inv_date,
        "total_invoice_value": total_amt,
        "currency": str(data.get("currency") or "INR").upper(),
        # Lossless backup
        "_raw_source": raw_source
    }
    
    logger.info(f"NORMALIZATION COMPLETE: Validated GSTIN={gstin[:4]}... INV={inv_no}")
    return result

