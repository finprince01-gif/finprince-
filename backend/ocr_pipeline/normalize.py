import logging
import re
from typing import Dict, Any, Optional
from datetime import datetime

logger = logging.getLogger(__name__)

_OCR_DIGIT_MAP = str.maketrans({
    'o': '0', 'O': '0',
    'l': '1', 'I': '1',
    'S': '5', 'Z': '2',
    'G': '6', 'B': '8',
})

# Month name aliases — handles OCR-garbled month tokens like "J{N" or "JAN"
_MONTH_MAP = {
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
    'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12,
}

# Item description keywords — patterns found near rent/particulars labels
_PARTICULARS_PATTERNS = [
    r'(?:PARTICULARS?|NARRATION|DESCRIPTION)\s*[:\-]?\s*([^\n\r]{5,80})',
    r'(RENT\s+FOR\s+THE\s+MONTH\s+OF\s+\w+)',
    r'((?:MONTHLY\s+)?RENT\s+(?:FOR|OF)\s+[^\n\r]{3,60})',
]


def normalize_amount(amount: Any) -> float:
    """
    Convert various amount formats to float with OCR noise correction.
    Recovery steps (applied in order before the existing strip):
      1. If already numeric → return directly
      2. Remove internal spaces: '4 2o0o' → '4 2o0o'
      3. Apply OCR char substitutions: o→0, l→1, etc.
      4. Strip all non-digit / non-dot characters
      5. Parse as float
    """
    if amount is None or amount == "":
        return 0.0

    if isinstance(amount, (int, float)):
        return float(amount)

    raw = str(amount).strip()

    # Step 0: strip leading currency symbols / prefixes (Rs., ₹, $, €, etc.)
    # Do this BEFORE OCR substitution so 'Rs.' doesn't leave a stray '.'
    raw = re.sub(r'^(?:Rs\.?|INR|USD|EUR|GBP|₹|\$|€|£)\s*', '', raw, flags=re.IGNORECASE)

    # Step 1: collapse internal whitespace inside numbers ('4 2 0 0 0' → '42000')

    compacted = re.sub(r'(?<=\d)\s+(?=\d)', '', raw)
    compacted = re.sub(r'(?<=[A-Za-z])\s+(?=\d)', '', compacted)
    compacted = re.sub(r'(?<=\d)\s+(?=[A-Za-z])', '', compacted)

    # Step 2: apply OCR character substitutions (only inside what looks numeric)
    ocr_fixed = compacted.translate(_OCR_DIGIT_MAP)

    # Step 3: strip non-numeric chars (commas, currency symbols, etc.)
    try:
        cleaned = re.sub(r'[^\d.]', '', ocr_fixed)
        result = float(cleaned) if cleaned else 0.0
        if raw != str(result) and result != 0.0:
            logger.info(f"[AMOUNT] raw={raw!r} → normalized={result}")
        return result
    except (ValueError, TypeError):
        logger.warning(f"[AMOUNT] Failed to normalize: {amount!r}")
        return 0.0


def ocr_recover_amount(text: str) -> float:
    """
    High-confidence amount extractor from raw OCR text.
    Searches for the largest number near TOTAL/AMOUNT labels.
    Applies full OCR substitution before scanning.
    """
    if not text:
        return 0.0

    upper = text.upper()

    # Look for labelled amounts first (highest confidence)
    label_patterns = [
        r'(?:TOTAL|GRAND\s+TOTAL|AMOUNT|NET\s+AMOUNT)[^\d\n]{0,10}([\d,\s\.oOlI]+)',
    ]
    candidates = []
    for pat in label_patterns:
        for m in re.finditer(pat, upper):
            raw_num = m.group(1).strip()
            val = normalize_amount(raw_num)
            if val > 0:
                candidates.append(val)

    # Fallback: scan all standalone numbers (pick largest)
    if not candidates:
        all_nums = re.findall(r'[\d][\d,\s\.oOlI]{1,12}[\d]', upper)
        for n in all_nums:
            val = normalize_amount(n)
            if val > 0:
                candidates.append(val)

    return max(candidates) if candidates else 0.0


# ── STRICT INVOICE NUMBER VALIDATION ─────────────────────────────────────────
# Blacklist: words that OCR commonly misidentifies as invoice numbers.
# Add any domain-specific garbage tokens here.
_INV_BLACKLIST = {
    # Generic document labels
    "INVOICE", "INV", "BILL", "NO", "NUMBER", "NUM", "DATE", "TOTAL",
    "AMOUNT", "GST", "TAX", "GSTIN", "PAN", "REF", "SI", "DOC",
    # Common noise tokens seen in OCR output
    "ING", "INC", "LTD", "PVT", "AUTHORIZED", "SIGNATORY", "BANK",
    "DETAILS", "ORIGINAL", "DUPLICATE", "TRIPLICATE", "COPY",
    "RECEIPT", "PURCHASE", "SALES", "DEBIT", "CREDIT", "NOTE",
    "TAXABLE", "VALUE", "SUPPLY", "PLACE", "STATE", "CODE", "PAGE",
    "BALANCE", "DUE", "PAYMENT", "TERMS", "SUBTOTAL", "GRAND",
    "UNIT", "QTY", "QUANTITY", "RATE", "DESCRIPTION", "ITEM",
}

def is_valid_invoice_no(val: str, _source: str = "") -> bool:
    """
    STRICT Invoice Number Validator.

    Rules (ALL must pass):
      1. Must be a non-empty string.
      2. Length between 1 and 25 characters. Minimum is 1 because valid short invoice
         numbers like "7" or "18" exist. Garbage single characters ("A", "I") are
         blocked by Rule 3 (must contain a real digit) and Rule 5 (pure-alpha reject).
      3. Must contain at least ONE real digit (0-9). OCR character substitution
         (I→1, O→0) is intentionally NOT applied here because it was the root
         cause of "ING" being accepted — 'I' mapped to '1', producing a fake digit.
      4. Must match the allowed character set: alphanumeric + [-/_. ()]
      5. Must NOT be a pure-alphabetic string (all letters, no digits).
      6. Must NOT appear in the blacklist of known noise words.

    Returns True only when every rule passes.
    """
    if not val:
        return False

    cleaned = str(val).strip()
    upper   = cleaned.upper()

    # Rule 1 – length bounds (min=1 to allow short numerics like "7", "18")
    if not (1 <= len(cleaned) <= 25):
        logger.debug(f"[INV_VALIDATE] REJECT '{cleaned}' ({_source}) → length {len(cleaned)} out of [1,25]")
        return False

    # Rule 2 – must contain at least one REAL digit (no substitution)
    if not any(c.isdigit() for c in cleaned):
        logger.info(f"[INV_VALIDATE] REJECT '{cleaned}' ({_source}) → no real digits")
        return False

    # Rule 3 – allowed character set only
    if not re.match(r'^[A-Za-z0-9/\-._\s()]+$', cleaned):
        logger.info(f"[INV_VALIDATE] REJECT '{cleaned}' ({_source}) → illegal characters")
        return False

    # Rule 4 – blacklist exact match
    if upper in _INV_BLACKLIST:
        logger.info(f"[INV_VALIDATE] REJECT '{cleaned}' ({_source}) → blacklisted word")
        return False

    # Rule 5 – pure-alphabetic strings are never invoice numbers
    if upper.isalpha():
        logger.info(f"[INV_VALIDATE] REJECT '{cleaned}' ({_source}) → pure alphabetic, no digits")
        return False

    logger.debug(f"[INV_VALIDATE] ACCEPT '{cleaned}' ({_source}) — passed digit rule with min_length=1")
    return True

def normalize_date(date_val: Any) -> str:
    """
    Standardize various date formats to YYYY-MM-DD with OCR noise recovery.

    Recovery pipeline (applied in order):
      P1. Already a datetime object → format directly
      P2. Clean standard formats → parse directly
      P3. OCR character correction → retry standard parse
      P4. Structural digit extraction → reconstruct DD-MM-YYYY from raw digits
      P5. Give up → return original string (never return empty on non-empty input)
    """
    if not date_val:
        return ""

    if isinstance(date_val, datetime):
        return date_val.strftime("%Y-%m-%d")

    date_str = str(date_val).strip()
    if not date_str:
        return ""

    raw_input = date_str  # kept for logging

    # ── P2: Try standard formats on the raw string ──────────────────
    _FORMATS = [
        "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%d.%m.%Y",
        "%d-%b-%y", "%d-%b-%Y", "%d %b %Y", "%d %b %y",
        "%Y/%m/%d", "%m/%d/%Y", "%m-%d-%Y",
        "%d-%m-%y", "%d/%m/%y",
    ]
    for fmt in _FORMATS:
        try:
            result = datetime.strptime(date_str, fmt).strftime("%Y-%m-%d")
            return result
        except ValueError:
            continue

    # ── P3: OCR character correction then re-parse ───────────────────
    # Replace common OCR noise chars with plausible date separators or digits.
    # Strategy: keep only digits and known separators; replace everything else.
    def _ocr_clean_date(s: str) -> str:
        # Normalise separators first
        s = re.sub(r'[/\\.]', '-', s)
        # Replace OCR letter → digit substitutions
        s = s.replace('O', '0').replace('o', '0')\
             .replace('l', '1').replace('I', '1')\
             .replace('S', '5').replace('Z', '2')
        # Remove anything that's not a digit or separator now
        s = re.sub(r'[^\d\-\s]', '', s)
        # Collapse multiple separators/spaces to single '-'
        s = re.sub(r'[\-\s]+', '-', s).strip('-')
        return s

    cleaned = _ocr_clean_date(date_str)
    if cleaned and cleaned != date_str:
        for fmt in _FORMATS:
            try:
                result = datetime.strptime(cleaned, fmt).strftime("%Y-%m-%d")
                logger.info(f"[DATE] raw={raw_input!r} → cleaned={cleaned!r} → normalized={result}")
                return result
            except ValueError:
                continue

        # Also try regex-based group extraction on the cleaned string
        m = re.match(r'^(\d{1,2})-(\d{1,2})-(\d{2,4})$', cleaned)
        if m:
            day, mon, year = m.group(1), m.group(2), m.group(3)
            for fmt in ["%d-%m-%Y", "%d-%m-%y"]:
                try:
                    temp = f"{int(day):02d}-{int(mon):02d}-{year}"
                    result = datetime.strptime(temp, fmt).strftime("%Y-%m-%d")
                    logger.info(f"[DATE] raw={raw_input!r} → reconstructed={result}")
                    return result
                except ValueError:
                    continue

    # ── P4: Digit-sequence reconstruction ────────────────────────────
    # Pull out all digit runs; if we get exactly 3 (DD, MM, YY/YYYY) → reconstruct
    digit_groups = re.findall(r'\d+', date_str)
    if len(digit_groups) >= 3:
        d, m_part, y = digit_groups[0], digit_groups[1], digit_groups[2]
        # Sanity-check ranges before trusting the reconstruction
        try:
            dv, mv, yv = int(d), int(m_part), int(y)
            if 1 <= dv <= 31 and 1 <= mv <= 12:
                if yv < 100:  # two-digit year
                    yv += 2000 if yv <= 50 else 1900
                result = datetime(
                    year=yv, month=mv, day=dv
                ).strftime("%Y-%m-%d")
                logger.info(
                    f"[DATE] raw={raw_input!r} → digit-reconstructed={result} "
                    f"(groups={digit_groups[:3]})"
                )
                return result
        except (ValueError, OverflowError):
            pass

    # ── P5: Last-resort alpha-month extraction ───────────────────────
    # Handles garbled strings like "51-)A.J{" where letters hint at month
    # OCR-correct the string completely, then try alpha-month pattern
    alpha_attempt = re.sub(r'[^A-Za-z0-9\-/\s]', ' ', date_str)
    m_obj = re.search(
        r'(\d{1,2})\s*[-/\s]?\s*([A-Za-z]{3})[A-Za-z]*\s*[-/\s]?\s*(\d{2,4})',
        alpha_attempt
    )
    if m_obj:
        day_s, mon_s, year_s = m_obj.group(1), m_obj.group(2).lower(), m_obj.group(3)
        mon_num = _MONTH_MAP.get(mon_s)
        if mon_num:
            try:
                yv = int(year_s)
                if yv < 100:
                    yv += 2000 if yv <= 50 else 1900
                result = datetime(
                    year=yv, month=mon_num, day=int(day_s)
                ).strftime("%Y-%m-%d")
                logger.info(f"[DATE] raw={raw_input!r} → alpha-month-recovered={result}")
                return result
            except (ValueError, OverflowError):
                pass

    logger.warning(f"[DATE] All recovery attempts failed for: {raw_input!r}")
    return date_str


def recover_item_description(raw_text: str) -> str:
    """
    Extracts item description / narration from raw OCR text.

    Search order (highest → lowest confidence):
      1. Label-anchored: text under 'PARTICULARS', 'NARRATION', 'DESCRIPTION'
      2. Rent-pattern: 'RENT FOR THE MONTH OF <month>'
      3. First non-label, non-numeric line of reasonable length

    OCR correction applied: letter-substitution + casing normalisation.
    Returns empty string if nothing recoverable is found.
    """
    if not raw_text:
        return ""

    text  = str(raw_text)
    upper = text.upper()

    # ── Step 1: known label-anchored patterns ────────────────────────
    for pat in _PARTICULARS_PATTERNS:
        m = re.search(pat, upper)
        if m:
            raw_candidate = m.group(1).strip()
            corrected = _ocr_fix_description(raw_candidate)
            if corrected:
                logger.info(f"[ITEM] Extracted via pattern: {corrected!r}")
                return corrected

    # ── Step 2: scan lines for a plausible narration ─────────────────
    skip_labels = {
        'PARTICULARS', 'NARRATION', 'DESCRIPTION', 'INVOICE', 'BILL',
        'DATE', 'AMOUNT', 'TOTAL', 'GST', 'TAX', 'NO', 'SL', 'SR',
        'SGST', 'CGST', 'IGST', 'RATE', 'QTY', 'UNIT', 'HSN',
    }
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or len(stripped) < 8 or len(stripped) > 120:
            continue
        # Skip lines that are mostly numeric (amounts, dates)
        if sum(c.isdigit() for c in stripped) > len(stripped) * 0.6:
            continue
        # Skip known header/label lines
        if stripped.upper() in skip_labels:
            continue
        corrected = _ocr_fix_description(stripped)
        if corrected and sum(c.isalpha() for c in corrected) > 4:
            logger.info(f"[ITEM] Extracted via line scan: {corrected!r}")
            return corrected

    return ""


def _ocr_fix_description(text: str) -> str:
    """
    OCR correction for description/narration strings.
    Unlike numeric fields, this preserves alphabetic characters
    but fixes specific letter-substitution patterns and normalises casing.
    """
    if not text:
        return ""
    # Replace common OCR garble: [ → L, ] → ], { → G (in word context)
    s = text.upper()
    s = s.replace('[', 'L').replace(']', 'I').replace('{', 'G').replace('}', 'D')
    s = s.replace('|-|', 'H').replace('|\\|', 'N').replace('|V|', 'M')
    # Collapse multiple spaces
    s = re.sub(r'\s+', ' ', s).strip()
    # Title-case for readability
    # Use Python's str.title() then fix common apostrophe issues
    result = s.title()
    return result

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

    # Strategy 1 (Highest Priority): match known Indian cities in the address (case-insensitive)
    addr_lower = addr.lower()
    for city in sorted(_KNOWN_CITIES, key=len, reverse=True):  # longest match first
        if re.search(r'\b' + re.escape(city) + r'\b', addr_lower):
            result = city.title()
            logger.info(f"BRANCH (known city match): '{result}' from address")
            return result

    # Strategy 2 (Secondary): word(s) immediately before a 6-digit PIN code
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
        
        # FINAL CHECK: If candidate contains a known city, use that instead of the whole candidate
        cand_lower = candidate.lower()
        for city in sorted(_KNOWN_CITIES, key=len, reverse=True):
            if city in cand_lower:
                logger.info(f"BRANCH (PIN + City match): '{city.title()}' from candidate '{candidate}'")
                return city.title()

        if 2 <= len(candidate) <= 40:
            logger.info(f"BRANCH (PIN strategy): '{candidate.title()}' from address")
            return candidate.title()

    return ""

# ── Key Aliases for Robust Mapping (OCR Stability Layer) ─────
KEY_ALIASES = {
    "gstin": ["gstin", "vendor_gstin", "supplier_gstin", "gst_no", "tax_id", "GSTIN", "Supplier GSTIN", "Party GSTIN", "GSTIN/UIN"],
    "vendor_name": ["vendor_name", "supplier_name", "seller_name", "party_name", "vendor", "Vendor Name", "Supplier Name", "Party Name", "Seller Name"],
    "vendor_address": ["vendor_address", "supplier_address", "address", "bill_from", "seller_address", "Vendor Address", "Supplier Address", "Address", "Bill From"],
    "billing_address": ["billing_address", "bill_to_address", "customer_address", "buyer_address", "Billing Address", "Bill To Address", "Customer Address", "Buyer Address", "Bill To", "Shipping Address"],
    "vendor_state": ["vendor_state", "state", "place_of_supply", "vendor_place_of_supply", "Vendor State", "State", "Supplier State"],
    "place_of_supply": ["place_of_supply", "pos", "ship_to_state", "supply_state", "Place of Supply", "POS", "Supply State", "Place of supply"],
    "invoice_no": ["invoice_no", "invoice_number", "inv_no", "bill_no", "sales_invoice_no", "supplier_invoice_no", "reference_no", "tax_invoice_no", "Invoice No", "Invoice Number", "Bill No", "Bill Number", "Inv No", "Inv #", "Voucher Number", "Reference No"],
    "invoice_date": ["invoice_date", "date", "bill_date", "inv_date", "voucher_date", "tax_invoice_date", "Invoice Date", "Date", "Bill Date", "Inv Date", "Voucher Date"],
    "total_amount": ["total_amount", "total_invoice_value", "grand_total", "total", "invoice_value", "final_amount", "Total Amount", "Total Invoice Value", "Grand Total", "Total", "Invoice Value", "Invoice Amount", "Bill Amount"],
    "taxable_value": ["taxable_value", "subtotal", "taxable_amount", "assessable_value", "net_amount", "taxable_value_total", "Taxable Value", "Subtotal", "Taxable Amount", "Assessable Value", "Net Amount"],
    "total_cgst": ["total_cgst", "cgst", "cgst_amount", "central_tax", "cgst_value", "total_central_tax", "Total CGST", "CGST", "CGST Amount", "Central Tax"],
    "total_sgst": ["total_sgst", "sgst", "sgst_amount", "state_tax", "utgst", "sgst_value", "total_state_tax", "Total SGST", "SGST", "SGST Amount", "State Tax", "SGST/UTGST", "Total SGST/UTGST"],
    "total_igst": ["total_igst", "igst", "igst_amount", "integrated_tax", "igst_value", "igst_tax", "Total IGST", "IGST", "IGST Amount", "Integrated Tax"]
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
            
    # 2. Check inside 'header' (for new extraction schema)
    header = data.get("header", {})
    if isinstance(header, dict):
        for alt in aliases:
            if alt in header and header[alt] not in (None, ""):
                return header[alt]

    # 3. Check inside 'sections' (for re-normalization of already structured data)
    sections = data.get("sections", {})
    if sections:
        for section in sections.values():
            if isinstance(section, dict):
                for alt in aliases:
                    if alt in section and section[alt] not in (None, ""):
                        return section[alt]
    
    # 4. Last ditch: some models produce supply_details, supplier_details directly
    for k in ["supply_details", "supplier_details", "supplyDetails", "supplierDetails"]:
        sub = data.get(k, {})
        if isinstance(sub, dict):
            for alt in aliases:
                if alt in sub and sub[alt] not in (None, ""):
                    return sub[alt]

    return None

def resolve_address(data: Dict[str, Any], prefix: str = "vendor") -> Optional[str]:
    """
    Aggregates fragmented address fields if a single canonical string is missing.
    """
    # 1. Try canonical resolution first
    canonical = resolve_key(data, f"{prefix}_address")
    if canonical and str(canonical).strip() not in ("", "None", "—"):
        return str(canonical).strip()
        
    # 2. Look for fragments (address_line1, city, etc.)
    fragments = []
    # Try both snake_case and Title Case
    keys = ["address_line1", "address_line2", "address_line3", "city", "state", "pincode", "zip_code", "country"]
    
    # Also handle some variations without 'address_' prefix
    short_keys = ["line1", "line2", "city", "state", "pincode"]
    
    header = data.get("header", {})
    if not isinstance(header, dict): header = {}
    
    # Search order: header then top-level
    sources = [header, data]
    
    search_keys = []
    for k in keys:
        search_keys.extend([f"{prefix}_{k}", k, f"{prefix} {k}".replace("_", " ").title(), k.title()])
    for k in short_keys:
        search_keys.extend([f"{prefix}_{k}", k])

    seen_vals = set()
    for k in search_keys:
        for src in sources:
            val = src.get(k)
            if val and str(val).strip() and str(val).strip().lower() not in seen_vals:
                v_str = str(val).strip()
                fragments.append(v_str)
                seen_vals.add(v_str.lower())
                break # Move to next base key
                
    if fragments:
        res = ", ".join(fragments)
        logger.info(f"ADDRESS_AGGREGATOR ({prefix}): Built from {len(fragments)} fragments: {res[:50]}...")
        return res
        
    return None

def gst_state_lookup(gstin: str) -> str:
    if not gstin or len(gstin) < 2:
        return ""
    state_code = str(gstin)[:2]
    gst_state_codes = {
        "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab",
        "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana",
        "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh",
        "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh",
        "13": "Nagaland", "14": "Manipur", "15": "Mizoram",
        "16": "Tripura", "17": "Meghalaya", "18": "Assam",
        "19": "West Bengal", "20": "Jharkhand", "21": "Odisha",
        "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
        "26": "Dadra and Nagar Haveli and Daman and Diu", "27": "Maharashtra",
        "28": "Andhra Pradesh", "29": "Karnataka", "30": "Goa",
        "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu",
        "34": "Puducherry", "35": "Andaman and Nicobar Islands",
        "36": "Telangana", "37": "Andhra Pradesh (New)"
    }
    return gst_state_codes.get(state_code, "")

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
            "si_no": str(item.get("si_no") or item.get("s_no") or item.get("S.No") or (i+1)),
            "description": str(item.get("description") or item.get("item_name") or item.get("Item Name") or item.get("itemName") or item.get("Description") or "").strip(),
            "hsn_sac": str(item.get("hsn_code") or item.get("hsn_sac") or item.get("HSN/SAC") or item.get("HSN") or "").strip(),
            "quantity": qty,
            "uom": str(item.get("uom") or item.get("unit") or item.get("Unit") or item.get("UOM") or "").strip(),
            "rate": rate,
            "discount_percent": normalize_amount(item.get("discount_percent") or item.get("disc") or item.get("Discount %")),
            "taxable_value": item_taxable,
            "igst_rate": igst_r,
            "igst_amount": igst_a,
            "cgst_rate": cgst_r,
            "cgst_amount": cgst_a,
            "sgst_rate": sgst_r,
            "sgst_amount": sgst_a,
            "cess_rate": cess_r,
            "cess_amount": normalize_amount(item.get("cess_amount") or item.get("cess") or item.get("Cess Amount")),
            "amount": normalize_amount(item.get("amount") or item.get("total") or item.get("line_total") or item.get("invoice_value") or item.get("Invoice Value") or item.get("Amount"))
        })

    # ── STEP 4 & 5: DERIVE GST RATE & TAX TYPE DETECTION ──
    # DO NOT trust OCR percentage. Derive from amounts.
    for item in normalized_items:
        taxable = item["taxable_value"]
        cgst_a = item["cgst_amount"]
        sgst_a = item["sgst_amount"]
        igst_a = item["igst_amount"]
        
        if taxable > 0:
            # Step 4: Derive Rates
            if igst_a > 0:
                item["igst_rate"] = round((igst_a / taxable) * 100, 2)
                item["cgst_rate"] = 0
                item["sgst_rate"] = 0
            elif (cgst_a + sgst_a) > 0:
                item["cgst_rate"] = round((cgst_a / taxable) * 100, 2)
                item["sgst_rate"] = round((sgst_a / taxable) * 100, 2)
                item["igst_rate"] = 0
        
        # Step 5: Tax Type Detection & Final Rate Enforcing
        # Standardize rates to common GST tiers (5, 12, 18, 28) if close
        def snap_to_gst_tier(rate):
            tiers = [0, 5, 12, 18, 28]
            for t in tiers:
                if abs(rate - t) < 0.5: return float(t)
                # Also handle split rates (2.5, 6, 9, 14)
                if abs(rate - t/2) < 0.25: return float(t/2)
            return rate

        item["cgst_rate"] = snap_to_gst_tier(item["cgst_rate"])
        item["sgst_rate"] = snap_to_gst_tier(item["sgst_rate"])
        item["igst_rate"] = snap_to_gst_tier(item["igst_rate"])

        # Final Amount Re-calculation to enforce mathematical integrity
        if item["igst_rate"] > 0: 
            item["igst_amount"] = round((item["taxable_value"] * item["igst_rate"]) / 100, 2)
        else:
            if item["cgst_rate"] > 0: item["cgst_amount"] = round((item["taxable_value"] * item["cgst_rate"]) / 100, 2)
            if item["sgst_rate"] > 0: item["sgst_amount"] = round((item["taxable_value"] * item["sgst_rate"]) / 100, 2)
        
        item["amount"] = round(item["taxable_value"] + item["igst_amount"] + item["cgst_amount"] + item["sgst_amount"] + item["cess_amount"], 2)

    vendor_address = resolve_address(data, "vendor") or ""
    billing_address = resolve_address(data, "billing") or ""
    
    if not vendor_address:
        logger.warning("ADDRESS_RESOLUTION: vendor_address is EMPTY after aggregation attempts.")
    else:
        print(f"INFO VENDOR_ADDRESS_RAW: {vendor_address}")
        print(f"INFO VENDOR_ADDRESS_NORMALIZED: {vendor_address}")



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
    name  = str(resolve_key(data, "vendor_name") or "").strip()
    gstin = str(resolve_key(data, "gstin")       or "").replace(" ", "").upper()

    # ── PRIORITY-BASED INVOICE NUMBER SELECTION ────────────────
    # Trust Order:
    #   P1 → AI-extracted field (resolve_key: covers header, top-level, sections)
    #   P2 → Label-anchored regex (near recognised label tokens)
    #   P3 → Looser regex (doc-wide scan, validated only)
    # If all tiers fail → None (MISSING). Never guess.
    inv_no         = None
    invoice_status = "MISSING"   # surfaced to UI when invoice number is absent

    # ── P1: AI-extracted field ──
    raw_inv_no = str(resolve_key(data, "invoice_no") or "").strip()
    if raw_inv_no:
        if is_valid_invoice_no(raw_inv_no, _source="AI_EXTRACTED"):
            inv_no = raw_inv_no
            invoice_status = "FOUND"
        else:
            logger.info(
                f"[INV_SELECT] P1 REJECTED AI value '{raw_inv_no}' "
                f"— does not pass strict validation."
            )

    # ── Fallback Regex (for missing headers in unstructured responses) ─────
    full_text = str(data.get("_raw_text") or data.get("ocr_raw_text") or str(data)).upper()

    if not gstin:
        gst_match = re.search(r"\b\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}\b", full_text)
        if gst_match:
            gstin = gst_match.group(0)
            logger.info(f"FALLBACK: Found GSTIN via regex: {gstin}")

    if not inv_no:
        # ── P2 / P3: Label-anchored regex tiers ──
        # P2: tightly anchored to a recognised label — highest structural confidence
        # P3: looser anchor (REF/DOC) — lower structural confidence
        inv_patterns_p2 = [
            # Label-anchored (P2) — ordered by label specificity
            (r"(?:TAX\s*)?INVOICE\s*(?:NO|NUMBER|#|NUM|:)[\s.:]*([A-Z0-9][A-Z0-9\-/._]{2,24})",  "REGEX_P2_TAX_INVOICE"),
            (r"(?:SALES\s*)?INVOICE\s*(?:NO|NUMBER|#|NUM|:)[\s.:]*([A-Z0-9][A-Z0-9\-/._]{2,24})", "REGEX_P2_SALES_INVOICE"),
            (r"BILL\s*(?:NO|NUMBER|#|NUM|:)[\s.:]*([A-Z0-9][A-Z0-9\-/._]{2,24})",                 "REGEX_P2_BILL_NO"),
            (r"INV\s*(?:NO|NUMBER|#|NUM|:)[\s.:]*([A-Z0-9][A-Z0-9\-/._]{2,24})",                  "REGEX_P2_INV_NO"),
            (r"SI\s*(?:NO|NUMBER|#|NUM|:)[\s.:]*([A-Z0-9][A-Z0-9\-/._]{2,24})",                   "REGEX_P2_SI_NO"),
        ]
        inv_patterns_p3 = [
            # Loose anchors (P3) — only used if P2 fails
            (r"REF\s*(?:NO|#|NUM|:)[\s.:]*([A-Z0-9][A-Z0-9\-/._]{2,24})",  "REGEX_P3_REF"),
            (r"DOC\s*(?:NO|#|NUM|:)[\s.:]*([A-Z0-9][A-Z0-9\-/._]{2,24})",  "REGEX_P3_DOC"),
        ]

        def _try_patterns(patterns):
            """Returns the first validated candidate from a pattern list, or None."""
            for pattern, source_tag in patterns:
                m = re.search(pattern, full_text)
                if not m:
                    continue
                candidate = m.group(1).strip()
                if is_valid_invoice_no(candidate, _source=source_tag):
                    logger.info(
                        f"[INV_SELECT] {source_tag} ACCEPTED '{candidate}' "
                        f"— passed strict validation."
                    )
                    return candidate, source_tag
                else:
                    logger.info(
                        f"[INV_SELECT] {source_tag} REJECTED candidate '{candidate}' "
                        f"— failed strict validation. NOT used."
                    )
            return None, None

        result_p2, tag_p2 = _try_patterns(inv_patterns_p2)
        if result_p2:
            inv_no = result_p2
            invoice_status = "FOUND_VIA_REGEX"
        else:
            result_p3, tag_p3 = _try_patterns(inv_patterns_p3)
            if result_p3:
                inv_no = result_p3
                invoice_status = "FOUND_VIA_FALLBACK"

    # ── SAFE DEFAULT: prefer NULL over a wrong value ──
    if not inv_no:
        inv_no = None
        invoice_status = "MISSING"
        logger.warning(
            "[INV_SELECT] All tiers exhausted. No valid invoice number found. "
            "Setting invoice_number=NULL, invoice_status=MISSING."
        )

    inv_date = normalize_date(resolve_key(data, "invoice_date"))
    total_amt = normalize_amount(resolve_key(data, "total_amount"))
    tax_amt = normalize_amount(resolve_key(data, "taxable_value"))
    state_name = str(resolve_key(data, "vendor_state") or "").strip()
    if state_name:
        pos = state_name
    elif gstin:
        pos = gst_state_lookup(gstin)
    else:
        pos = ""

    state = state_name

    # ── Hierarchical structure for UI sections ──────────────────
    result = {
        "sections": {
            "supplier_details": {
                "vendor_name": name,
                "billing_address": billing_address,
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
                "place_of_supply": pos,
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
        "bill_from": vendor_address,
        "billing_address": billing_address,
        "gstin": gstin,
        # invoice_number is None when no valid number was found.
        # Consumers MUST check invoice_status == 'MISSING' before displaying.
        "invoice_number":     inv_no,
        "invoice_status":     invoice_status,
        "supplier_invoice_no": inv_no,
        "sales_invoice_no":   inv_no,   # Sales UI compatibility
        "bill_no":            inv_no,   # Generic UI compatibility
        "invoice_date":       inv_date,
        "total_invoice_value": total_amt,
        "place_of_supply":    pos,
        "currency": str(data.get("currency") or "INR").upper(),
        # Lossless backup
        "_raw_source": raw_source
    }

    logger.info(
        f"NORMALIZATION COMPLETE: GSTIN={gstin[:4] if gstin else 'NONE'}... "
        f"INV={inv_no!r} STATUS={invoice_status}"
    )
    return result

