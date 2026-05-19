from .schema import CanonicalInvoiceSchema, CanonicalInvoiceItem
import logging
import re
import json
from typing import Dict, Any, Optional, List, Union
from datetime import datetime

logger = logging.getLogger(__name__)

def log_canonical_schema_locked(invoice_no: str):
    logger.info(f"[CANONICAL_SCHEMA_LOCKED] invoice_no='{invoice_no}'")

def log_schema_drift_detected(field: str, expected_type: str, actual_type: str):
    logger.warning(f"[SCHEMA_DRIFT_DETECTED] field='{field}' expected='{expected_type}' actual='{actual_type}'")

# ── OCR & MAPPING CONSTANTS ──────────────────────────────────────────────────
_OCR_DIGIT_MAP = str.maketrans({
    'o': '0', 'O': '0',
    'l': '1', 'I': '1',
    'S': '5', 'Z': '2',
    'G': '6', 'B': '8',
})

# [GSTIN_REGEX] (Requirement #1)
GSTIN_PATTERN = re.compile(r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$')

def validate_gstin_checksum(gstin: str) -> bool:
    """
    Validates GSTIN using checksum digit (Mod 36).
    """
    if not gstin or len(gstin) != 15:
        return False
    
    chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    try:
        factor = 1
        total = 0
        for i in range(14):
            val = chars.find(gstin[i])
            if val == -1: return False
            digit = val * factor
            total += (digit // 36) + (digit % 36)
            factor = 2 if factor == 1 else 1
        
        checksum = (36 - (total % 36)) % 36
        return chars[checksum] == gstin[14]
    except:
        return False

def normalize_gstin_safe(gstin: Any) -> str:
    """
    [PHASE 4] Non-destructive GSTIN normalization.
    Only applies OCR heuristics if the original fails checksum AND the 
    result of correction yields a valid checksum.
    """
    if is_empty(gstin): return ""
    raw = str(gstin).strip().upper().replace(" ", "")
    
    # Clean noise: remove common OCR artifacts like leading/trailing special chars
    raw = re.sub(r'[^A-Z0-9]', '', raw)

    # 1. If already valid by REGEX or CHECKSUM, DO NOT MUTATE (Requirement #1)
    if GSTIN_PATTERN.match(raw) or validate_gstin_checksum(raw):
        logger.info(f"[GSTIN_VALIDATED] '{raw}' (Normalization skipped)")
        return raw
    
    # 2. Try OCR corrections only if the length is plausible (15)
    if len(raw) == 15:
        corrected = raw.translate(_OCR_DIGIT_MAP)
        if validate_gstin_checksum(corrected) or GSTIN_PATTERN.match(corrected):
            logger.info(f"[GSTIN_CORRECTED] original='{raw}' corrected='{corrected}'")
            return corrected
    
    # 3. If still invalid, return raw but log warning
    logger.warning(f"[GSTIN_INVALID] checksum/regex failed for '{raw}'")
    return raw

EMPTY_VALUES = [None, "", [], {}, 0, 0.0, "0.0", "0.00", "—", "N/A", "null", "MISSING", "nan", "NaN"]

# ── UTILITIES ────────────────────────────────────────────────────────────────

def is_empty(val: Any) -> bool:
    """Strict check for empty values to prevent destructive overwrites."""
    if val in EMPTY_VALUES:
        return True
    if isinstance(val, str) and not val.strip():
        return True
    if isinstance(val, str) and val.lower() == "missing":
        return True
    return False

def normalize_amount(amount: Any) -> float:
    if is_empty(amount):
        return 0.0
    if isinstance(amount, (int, float)):
        return float(amount)
    raw = str(amount).strip()
    raw = re.sub(r'^(?:Rs\.?|INR|USD|EUR|GBP|₹|\$|€|£)\s*', '', raw, flags=re.IGNORECASE)
    compacted = re.sub(r'(?<=\d)\s+(?=\d)', '', raw)
    ocr_fixed = compacted.translate(_OCR_DIGIT_MAP)
    try:
        cleaned = re.sub(r'[^\d.-]', '', ocr_fixed)
        result = float(cleaned) if cleaned else 0.0
        return result
    except (ValueError, TypeError):
        return 0.0

def normalize_date(date_val: Any) -> str:
    """Robust date normalization to dd-mm-yyyy with exhaustive format support."""
    if is_empty(date_val): return ""
    if isinstance(date_val, datetime): 
        return date_val.strftime("%d-%m-%Y")
    
    raw = str(date_val).strip()
    logger.info(f"[DATE_PARSE_ATTEMPT] '{raw}'")
    
    # Remove boundary noise
    raw_clean = re.sub(r'^[^a-zA-Z0-9]+', '', raw)
    raw_clean = re.sub(r'[^a-zA-Z0-9]+$', '', raw_clean)
    
    # Standardize separators
    clean_str = re.sub(r'[./\\]', '-', raw_clean)
    
    _FORMATS = [
        "%d-%m-%Y", "%Y-%m-%d", "%d-%m-%y", "%m-%d-%Y",
        "%d %b %Y", "%d-%b-%Y", "%d-%b-%y", "%b %d %Y",
        "%d %B %Y", "%d-%B-%Y", "%B %d, %Y", "%d/%m/%Y",
        "%Y/%m/%d", "%m/%d/%Y", "%d.%m.%Y", "%d %b %y",
        "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"
    ]
    
    for fmt in _FORMATS:
        try:
            dt = datetime.strptime(clean_str, fmt)
            res = dt.strftime("%d-%m-%Y")
            logger.info(f"[DATE_PARSE_SUCCESS] '{raw}' -> '{res}' (fmt: {fmt})")
            return res
        except:
            try:
                dt = datetime.strptime(raw, fmt)
                res = dt.strftime("%d-%m-%Y")
                logger.info(f"[DATE_PARSE_SUCCESS] '{raw}' -> '{res}' (fmt: {fmt})")
                return res
            except: continue
            
    logger.warning(f"[DATE_PARSE_FAIL] Could not parse: '{raw}'")
    return raw

def normalize_state(state: Any) -> str:
    """Canonical mapping for Indian States and UTs."""
    if is_empty(state): return ""
    raw = str(state).strip().upper()
    
    # Strip numeric prefixes (GST State Codes)
    raw = re.sub(r'^\d+\s*[-/]?\s*', '', raw)
    raw = re.sub(r'\s*[-/]?\s*\d+$', '', raw)

    STATE_MAP = {
        "TN": "Tamil Nadu", "TAMIL NADU": "Tamil Nadu", "TAMILNADU": "Tamil Nadu",
        "KA": "Karnataka", "KARNATAKA": "Karnataka",
        "KL": "Kerala", "KERALA": "Kerala",
        "AP": "Andhra Pradesh", "ANDHRA PRADESH": "Andhra Pradesh",
        "TS": "Telangana", "TELANGANA": "Telangana",
        "MH": "Maharashtra", "MAHARASHTRA": "Maharashtra",
        "DL": "Delhi", "DELHI": "Delhi", "NEW DELHI": "Delhi",
        "GJ": "Gujarat", "GUJARAT": "Gujarat",
        "HR": "Haryana", "HARYANA": "Haryana",
        "PB": "Punjab", "PUNJAB": "Punjab",
        "RJ": "Rajasthan", "RAJASTHAN": "Rajasthan",
        "UP": "Uttar Pradesh", "UTTAR PRADESH": "Uttar Pradesh",
        "WB": "West Bengal", "WEST BENGAL": "West Bengal",
    }
    
    for kw, canonical in STATE_MAP.items():
        if raw == kw or raw == canonical.upper():
            return canonical
            
    return raw.title()

def fix_encoding_corruption(val: Any) -> str:
    """
    [PHASE 11.9] Heuristic to fix common UTF-8 -> Latin-1 double-encoding corruption.
    Example: "Zoho â€“ Invoice" -> "Zoho – Invoice"
    """
    if not isinstance(val, str) or not val:
        return val
    
    # Common corruption sequences for en-dash, em-dash, smart quotes
    corrupt_chars = ["\u00e2", "\u0080", "\u0093", "\u0094", "\u0099", "\u0082", "\u00ac"]
    if any(c in val for c in corrupt_chars):
        try:
            # Re-encode as Latin-1 then decode as UTF-8
            fixed = val.encode('latin-1').decode('utf-8')
            logger.info(f"[ENCODING_RECOVERY] Fixed corrupted string: '{val[:20]}...' -> '{fixed[:20]}...'")
            return fixed
        except Exception:
            pass
    return val

def sanitize_description(desc: Any) -> str:
    """Isolates item descriptions from HSN/SAC codes and OCR table noise."""
    if is_empty(desc): return ""
    raw = fix_encoding_corruption(str(desc).strip())
    # Remove SAC/HSN codes and labels
    raw = re.sub(r'(?i)\b(HSN|SAC|HSN/SAC)(\s*CODE)?\s*[:/-]?\s*\d+', '', raw)
    # Remove common meta-noise
    raw = re.sub(r'(?i)\bGST\s*\d+\s*%', '', raw)
    raw = re.sub(r'[|]', '', raw)
    res = re.sub(r'\s+', ' ', raw).strip()
    return res

def merge_item_continuations(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Structurally merges multiline descriptions that were split into separate rows."""
    if not items: return []
    logger.info(f"[FORENSIC_MERGE_START] items_in={len(items)}")
    merged = []
    for item in items:
        # Support both snake_case and Title Case
        desc = item.get("description") or item.get("Item Name") or ""
        qty = item.get("qty") or item.get("Qty") or 0
        taxable = item.get("taxable_value") or item.get("Taxable Value") or 0
        rate = item.get("rate") or item.get("Item Rate") or 0
        
        # A continuation row typically has a description but no financial participation
        is_continuation = False
        if not is_empty(desc) and is_empty(qty) and is_empty(taxable) and is_empty(rate):
            is_continuation = True
            
        if is_continuation and merged:
            prev_desc = merged[-1].get("description") or merged[-1].get("Item Name") or ""
            new_desc = prev_desc + " " + desc
            # Update whichever key exists
            if "description" in merged[-1]: merged[-1]["description"] = new_desc
            if "Item Name" in merged[-1]: merged[-1]["Item Name"] = new_desc
            logger.info(f"[FORENSIC_MERGE_HIT] Merged continuation: '{desc[:15]}...' into '{prev_desc[:15]}...'")
        else:
            merged.append(item)
            
    # Post-merge cleanup
    for item in merged:
        if "description" in item: item["description"] = sanitize_description(item["description"])
        if "Item Name" in item: item["Item Name"] = sanitize_description(item["Item Name"])
        
    logger.info(f"[FORENSIC_MERGE_END] items_out={len(merged)}")
    return merged

def lossless_preserve(existing: Any, incoming: Any, field_name: str = "") -> Any:
    """
    STRICT preservation logic: Valid values must NEVER be replaced by empty defaults.
    If both are present, prioritizes 'existing' unless 'incoming' is significantly better.
    """
    if is_empty(existing):
        return incoming
    if is_empty(incoming):
        return existing
    
    # If both are non-empty, prefer the one with more content (for strings)
    if isinstance(existing, str) and isinstance(incoming, str):
        if len(incoming.strip()) > len(existing.strip()):
            return incoming
    
    return existing

def sanitize_address(addr: str) -> str:
    """
    CRITICAL ADDRESS SANITIZATION (Requirement #4 & #5)
    Preserves locality, city, state while removing regulatory noise.
    Converts multiline to comma-separated preserving order.
    """
    if is_empty(addr): return ""
    raw_lines = re.split(r'[\n\r]', str(addr))
    
    # [PHASE 11.9] FORENSIC: Log raw address before sanitization
    logger.debug(f"[ADDRESS_SANITIZE_INPUT] lines={len(raw_lines)} first_line='{raw_lines[0][:30] if raw_lines else ''}'")

    REJECT_PATTERNS = [
        r'(?i)\b(Phone|Mobile|Mob|Ph|Tel|Fax|Email|E-mail|Mail|PAN|URL|WWW|Website)\s*[:/-]?\s*.*',
        r'[\w.-]+@[\w.-]+\.\w+',
        r'[A-Z]{5}\d{4}[A-Z]{1}',
    ]
    # Keep GSTIN if it's the only thing there, but strip the label
    GSTIN_REJECT = r'(?i)\bGSTIN\s*[:/-]?\s*'
    
    cleaned_lines = []
    for line in raw_lines:
        line = line.strip()
        if not line: continue
        
        # Strip GSTIN label but keep the value
        line = re.sub(GSTIN_REJECT, '', line).strip()
        
        is_rejected = False
        for pattern in REJECT_PATTERNS:
            if re.search(pattern, line):
                # Try to remove the pattern but keep the rest of the line
                new_line = re.sub(pattern, '', line).strip()
                if not new_line:
                    is_rejected = True
                    break
                else:
                    line = new_line
        
        if is_rejected: continue
        
        line = line.strip().strip(',').strip()
        if line:
            cleaned_lines.append(line)
    
    final_addr = ", ".join(cleaned_lines)
    # Ensure no leading/trailing commas or extra spaces
    final_addr = re.sub(r',\s*,', ',', final_addr).strip().strip(',')
    
    # ── [PHASE 3] SANITIZATION SAFETY (Root Cause #1) ──
    if is_empty(final_addr) and not is_empty(addr):
        logger.warning(f"[ADDRESS_RECOVERY] Sanitization wiped address. Preserving raw. original='{str(addr)[:30]}...'")
        return str(addr).strip()
    
    logger.info(f"[ADDRESS_SANITIZED] original_len={len(str(addr))} final_len={len(final_addr)}")
    return final_addr

def derive_branch_from_address(addr: str) -> str:
    """Infers branch from known location keywords."""
    if is_empty(addr): return ""
    upper_addr = str(addr).upper()
    BRANCH_MAP = {
        "ANNUR": "ANNUR",
        "COIMBATORE": "COIMBATORE",
        "CHENNAI": "CHENNAI",
        "HOSUR": "HOSUR",
        "POLLACHI": "POLLACHI"
    }
    for kw, branch in BRANCH_MAP.items():
        if kw in upper_addr:
            logger.info(f"[BRANCH_DERIVED] Found '{kw}' in address -> '{branch}'")
            return branch
    return ""

def get_normalized_export_record(invoice: Any) -> Dict[str, Any]:
    """
    STRICT CANONICAL NORMALIZER.
    Provides ONE authoritative snake_case record.
    """
    def get_strict(keys, default=""):
        if isinstance(invoice, dict):
            # 1. Root level
            for k in keys:
                if not is_empty(invoice.get(k)): return invoice.get(k), f"root.{k}"
            # 2. Header level
            header = invoice.get('header', {})
            if isinstance(header, dict):
                for k in keys:
                    if not is_empty(header.get(k)): return header.get(k), f"header.{k}"
            # 3. Sections level
            sections = invoice.get('sections', {})
            if isinstance(sections, dict):
                sub = sections.get('supplier_details', {})
                if isinstance(sub, dict):
                    for k in keys:
                        mapped_k = "supplier_invoice_no" if k == "invoice_no" else k
                        if not is_empty(sub.get(mapped_k)): return sub.get(mapped_k), f"sections.supplier.{k}"
                        if not is_empty(sub.get(k)): return sub.get(k), f"sections.supplier.{k}"
            # 4. Check Title Case Aliases (Idempotency)
            TITLE_ALIASES = {
                "invoice_no": "Invoice No", "invoice_date": "Date", "vendor_name": "Name",
                "gstin": "GSTIN", "branch": "Branch", "place_of_supply": "Place of Supply",
                "total_taxable_value": "Total Taxable Value", "invoice_total": "Total Invoice Value",
                "total_igst": "Total IGST", "total_cgst": "Total CGST", "total_sgst": "Total SGST/UTGST",
                "irn": "IRN", "ack_no": "Ack. No.", "ack_date": "Ack. Date", "hsn_sac": "HSN/SAC"
            }
            for k in keys:
                alias = TITLE_ALIASES.get(k)
                if alias and not is_empty(invoice.get(alias)):
                    return invoice.get(alias), f"alias.{alias}"
            
            # 5. Item Level Promotion (Last Resort Fallback)
            items = invoice.get('items') or invoice.get('sections', {}).get('items') or []
            if items and isinstance(items, list) and len(items) > 0:
                primary = items[0]
                if isinstance(primary, dict):
                    for k in keys:
                        if not is_empty(primary.get(k)): return primary.get(k), f"items[0].{k}"
                        # Check Title Case as well
                        alias = TITLE_ALIASES.get(k)
                        if alias and not is_empty(primary.get(alias)):
                            return primary.get(alias), f"items[0].alias.{alias}"

        return default, "NONE"

    raw_from, _ = get_strict(["bill_address_from", "bill_from", "vendor_address", "billing_address", "supplier_address"])
    raw_to, _ = get_strict(["bill_address_to", "bill_to", "customer_address", "billing_address_to", "billing_address"])
    
    # ── [PHASE 11.9] WINDOW_SLICER FALLBACK (HARDENED) ──
    if is_empty(raw_from) or is_empty(raw_to):
        ocr_text = invoice.get("_pdf_ocr_text") if isinstance(invoice, dict) else ""
        if ocr_text:
            if is_empty(raw_from):
                logger.info("[BILL_FROM_WINDOW_ATTEMPT]")
                # Consignee (Ship to) -> Buyer (Bill to)
                match = re.search(r"Consignee\s*\(Ship\s*to\)(.*?)Buyer\s*\(Bill\s*to\)", ocr_text, re.DOTALL | re.IGNORECASE)
                if match: 
                    raw_from = match.group(1).strip()
                    logger.info(f"[BILL_FROM_WINDOW_HIT] len={len(raw_from)}")

            if is_empty(raw_to):
                logger.info("[BILL_TO_WINDOW_ATTEMPT]")
                # Buyer (Bill to) -> Stop Tokens
                # Expanded end tokens to handle multiline/collapsed OCR better
                stop_tokens = r"(?:Place\s*of\s*Supply|Dated|Delivery\s*Note|Invoice\s*No|Voucher\s*No|Total|Description|Sl\s*No)"
                match = re.search(fr"Buyer\s*\(Bill\s*to\)(.*?){stop_tokens}", ocr_text, re.DOTALL | re.IGNORECASE)
                if match: 
                    raw_to = match.group(1).strip()
                    logger.info(f"[BILL_TO_WINDOW_HIT] len={len(raw_to)}")
                else:
                    # Try a more desperate match if the above failed
                    match = re.search(r"Buyer\s*\(Bill\s*to\)(.{1,500}?)", ocr_text, re.DOTALL | re.IGNORECASE)
                    if match:
                        raw_to = match.group(1).strip()
                        logger.info(f"[BILL_TO_WINDOW_DESPERATE_HIT] len={len(raw_to)}")
    bill_from = sanitize_address(raw_from)
    bill_to = sanitize_address(raw_to)
    
    branch = get_strict(["branch"])[0] or derive_branch_from_address(bill_to) or derive_branch_from_address(bill_from)

    record = {
        "invoice_no": fix_encoding_corruption(str(get_strict(["invoice_no", "invoice_number", "bill_no", "supplier_invoice_no"])[0])),
        "invoice_date": normalize_date(get_strict(["invoice_date", "date", "bill_date", "supplier_invoice_date"])[0]),
        "vendor_name": fix_encoding_corruption(str(get_strict(["vendor_name", "supplier_name", "name"])[0])),
        "gstin": normalize_gstin_safe(get_strict(["gstin", "vendor_gstin", "supplier_gstin"])[0]),
        "branch": fix_encoding_corruption(str(branch)),
        "bill_from": fix_encoding_corruption(str(bill_from)),
        "bill_to": fix_encoding_corruption(str(bill_to)),
        "place_of_supply": normalize_state(get_strict(["place_of_supply", "vendor_state", "state"])[0]),
        "total_taxable_value": normalize_amount(get_strict(["total_taxable_value", "taxable_value", "subtotal"])[0]),
        "total_igst": normalize_amount(get_strict(["total_igst", "igst"])[0]),
        "total_cgst": normalize_amount(get_strict(["total_cgst", "cgst"])[0]),
        "total_sgst": normalize_amount(get_strict(["total_sgst", "sgst", "utgst"])[0]),
        "total_invoice_value": normalize_amount(get_strict(["total_invoice_value", "invoice_total", "total_amount", "grand_total"])[0]),
        "irn": str(get_strict(["irn"])[0]).strip(),
        "ack_no": str(get_strict(["ack_no"])[0]).strip(),
        "ack_date": normalize_date(get_strict(["ack_date"])[0]),
        "hsn_sac": str(get_strict(["hsn_sac", "hsn", "sac"])[0]).strip(),
    }

    # ── [TOTALS & POS OCR REGION EXTRACTION FALLBACK] (Requirement D) ──
    if isinstance(invoice, dict):
        ocr_text = invoice.get("_pdf_ocr_text") or invoice.get("_raw_text") or ""
        if ocr_text:
            # 1. Place of Supply / State
            if is_empty(record.get("place_of_supply")):
                # Check different variations
                pos_match = re.search(r'(?i)Place\s*of\s*(?:Supply|Su|S)?\s*[:/-]?\s*([0-9a-zA-Z\s-]+)', ocr_text)
                if pos_match:
                    pos_val = pos_match.group(1).strip()
                    record["place_of_supply"] = normalize_state(pos_val)
                    logger.info(f"[REGION_FALLBACK_EXTRACTED] Place of Supply='{record['place_of_supply']}' (source='{pos_val}')")
                
                # State Name fallback
                if is_empty(record.get("place_of_supply")):
                    # Search for known states in the billing address first
                    bill_to_str = str(record.get("bill_to", "")).upper()
                    found_state = None
                    states = [
                        "Tamil Nadu", "Karnataka", "Kerala", "Andhra Pradesh", "Telangana",
                        "Maharashtra", "Delhi", "Gujarat", "Haryana", "Punjab", "Rajasthan",
                        "Uttar Pradesh", "West Bengal"
                    ]
                    for st in states:
                        if st.upper() in bill_to_str:
                            found_state = st
                            break
                    if found_state:
                        record["place_of_supply"] = found_state
                        logger.info(f"[STATE_FALLBACK_BILL_TO] Place of Supply derived from billing address: '{found_state}'")
                    else:
                        # Search for explicit State: Tamil Nadu or State Code: Tamil Nadu or similar in ocr_text
                        state_match = re.search(r'(?i)(?:State|State\s*Name|State\s*Code|POS)\s*[:/-]?\s*([0-9a-zA-Z\s-]+)', ocr_text)
                        if state_match:
                            pos_val = state_match.group(1).strip()
                            record["place_of_supply"] = normalize_state(pos_val)
                            logger.info(f"[STATE_FALLBACK_STATE_MATCH] Place of Supply='{record['place_of_supply']}' (source='{pos_val}')")
            
            # 2. Total Taxable Value
            if normalize_amount(record.get("total_taxable_value")) == 0.0:
                taxable_match = re.search(r'(?i)(?:Total\s*Taxable\s*Value|Taxable\s*Amt|Taxable\s*Value|Subtotal|Sub\s*Total)\s*[:/-]?\s*([0-9,.]+)', ocr_text)
                if taxable_match:
                    record["total_taxable_value"] = normalize_amount(taxable_match.group(1))
                    logger.info(f"[REGION_FALLBACK_EXTRACTED] Total Taxable Value={record['total_taxable_value']}")
            
            # 3. Total CGST
            if normalize_amount(record.get("total_cgst")) == 0.0:
                cgst_match = re.search(r'(?i)(?:CGST\s*Total|Total\s*CGST|CGST)\s*[:/-]?\s*([0-9,.]+)', ocr_text)
                if cgst_match:
                    record["total_cgst"] = normalize_amount(cgst_match.group(1))
                    logger.info(f"[REGION_FALLBACK_EXTRACTED] Total CGST={record['total_cgst']}")
            
            # 4. Total SGST
            if normalize_amount(record.get("total_sgst")) == 0.0:
                sgst_match = re.search(r'(?i)(?:SGST\s*Total|Total\s*SGST|SGST|UTGST)\s*[:/-]?\s*([0-9,.]+)', ocr_text)
                if sgst_match:
                    record["total_sgst"] = normalize_amount(sgst_match.group(1))
                    logger.info(f"[REGION_FALLBACK_EXTRACTED] Total SGST={record['total_sgst']}")
            
            # 5. Total IGST
            if normalize_amount(record.get("total_igst")) == 0.0:
                igst_match = re.search(r'(?i)(?:IGST\s*Total|Total\s*IGST|IGST)\s*[:/-]?\s*([0-9,.]+)', ocr_text)
                if igst_match:
                    record["total_igst"] = normalize_amount(igst_match.group(1))
                    logger.info(f"[REGION_FALLBACK_EXTRACTED] Total IGST={record['total_igst']}")
            
            # 6. Total Invoice Value
            if normalize_amount(record.get("total_invoice_value")) == 0.0:
                total_match = re.search(r'(?i)(?:Total\s*Invoice\s*Value|Total\s*Amount|Grand\s*Total|Total|Amount\s*Chargeable)\s*[:/-]?\s*([0-9,.]+)', ocr_text)
                if total_match:
                    record["total_invoice_value"] = normalize_amount(total_match.group(1))
                    logger.info(f"[REGION_FALLBACK_EXTRACTED] Total Invoice Value={record['total_invoice_value']}")

    # Preserve underscores
    if isinstance(invoice, dict):
        for k, v in invoice.items():
            if k.startswith("_"): record[k] = v
            
    # [PHASE 11.9] FORENSIC EXPORT LOG
    logger.info(f"[HSN_EXPORT_READY] inv={record.get('invoice_no')} hsn_sac='{record.get('hsn_sac')}'")
    logger.info(f"[EXPORT_FINAL_ROW] inv={record.get('invoice_no')} name={record.get('vendor_name')} total={record.get('total_invoice_value')}")
    
    return record

def get_normalized_items(invoice: Any) -> List[Dict[str, Any]]:
    """
    CANONICAL ITEM NORMALIZER.
    """
    items_source = []
    if isinstance(invoice, dict):
        items_source = invoice.get('items') or invoice.get('sections', {}).get('items') or []
    
    normalized_items = []
    for item in items_source:
        if not isinstance(item, dict): continue
        
        desc = (item.get("description") or item.get("desc") or item.get("particulars") or item.get("item_name") or item.get("Item Name") or "")
        if not desc: continue
        
        normalized_items.append({
            "description": desc,
            "hsn_sac": str(item.get("hsn_sac") or item.get("hsn_code") or item.get("HSN/SAC") or item.get("hsn") or item.get("sac") or ""),
            "qty": normalize_amount(item.get("qty") or item.get("quantity") or item.get("Qty")),
            "uom": str(item.get("uom") or item.get("unit") or item.get("UOM") or ""),
            "rate": normalize_amount(item.get("rate") or item.get("unit_price") or item.get("Item Rate")),
            "taxable_value": normalize_amount(item.get("taxable_value") or item.get("amount") or item.get("Taxable Value")),
            "igst": normalize_amount(item.get("igst") or item.get("igst_amount") or item.get("IGST")),
            "cgst": normalize_amount(item.get("cgst") or item.get("cgst_amount") or item.get("CGST")),
            "sgst": normalize_amount(item.get("sgst") or item.get("sgst_amount") or item.get("SGST/UTGST")),
            "total_amount": normalize_amount(item.get("total_amount") or item.get("Invoice Value"))
        })
        
    return merge_item_continuations(normalized_items)

def get_canonical_export_record(invoice: Any) -> Dict[str, Any]:
    """
    PHASE 4: CANONICAL SCHEMA STABILIZATION
    Provides ONE authoritative normalized export record using CanonicalInvoiceSchema.
    DOWNSTREAM SYSTEMS MUST ONLY USE THIS.
    """
    # ── [DEFENSIVE UNWRAPPING] ──
    if isinstance(invoice, str):
        try:
            invoice = json.loads(invoice)
        except: pass
    
    if isinstance(invoice, dict):
        unwrapped = invoice.get('reply_json') or invoice.get('data') or invoice.get('reply')
        if unwrapped:
            if isinstance(unwrapped, str):
                try:
                    parsed = json.loads(unwrapped)
                    if isinstance(parsed, dict):
                        for k, v in invoice.items():
                            if k not in ['reply_json', 'data', 'reply'] and k not in parsed:
                                parsed[k] = v
                        invoice = parsed
                except: pass
            elif isinstance(unwrapped, dict):
                for k, v in invoice.items():
                    if k not in ['reply_json', 'data', 'reply'] and k not in unwrapped:
                        unwrapped[k] = v
                invoice = unwrapped

    # ── [PHASE 11.9] FORENSIC DTO AUDIT ──
    logger.info(f"[DTO_PRE_VALIDATION] record_id={invoice.get('record_id')} keys={list(invoice.keys())}")

    raw_header = get_normalized_export_record(invoice)
    raw_items = get_normalized_items(invoice)
    
    canonical_items = []
    for item in raw_items:
        # Map to CanonicalInvoiceItem using snake_case keys from raw_items
        try:
            c_item = CanonicalInvoiceItem(
                description=str(item.get("description", "")),
                hsn_sac=str(item.get("hsn_sac", "")),
                qty=normalize_amount(item.get("qty", 0.0)),
                uom=str(item.get("uom", "")),
                rate=normalize_amount(item.get("rate", 0.0)),
                taxable_value=normalize_amount(item.get("taxable_value", 0.0)),
                igst=normalize_amount(item.get("igst", 0.0)),
                cgst=normalize_amount(item.get("cgst", 0.0)),
                sgst=normalize_amount(item.get("sgst", 0.0)),
                total_amount=normalize_amount(item.get("total_amount", 0.0))
            )
            canonical_items.append(c_item)
        except Exception as ie:
            logger.error(f"[DTO_ITEM_COERCION_FAIL] item={item} error={ie}")

    # Create Canonical Schema Instance
    schema_data = {
        "invoice_no": str(raw_header.get("invoice_no", "")),
        "invoice_date": str(raw_header.get("invoice_date", "")),
        "vendor_name": str(raw_header.get("vendor_name", "")),
        "gstin": str(raw_header.get("gstin", "")),
        "branch": str(raw_header.get("branch", "")),
        "bill_from": str(raw_header.get("bill_from", "")),
        "bill_to": str(raw_header.get("bill_to", "")),
        "place_of_supply": str(raw_header.get("place_of_supply", "")),
        "total_taxable_value": normalize_amount(raw_header.get("total_taxable_value", 0)),
        "total_igst": normalize_amount(raw_header.get("total_igst", 0)),
        "total_cgst": normalize_amount(raw_header.get("total_cgst", 0)),
        "total_sgst": normalize_amount(raw_header.get("total_sgst", 0)),
        "total_invoice_value": normalize_amount(raw_header.get("total_invoice_value", 0)),
        "irn": str(raw_header.get("irn", "")),
        "ack_no": str(raw_header.get("ack_no", "")),
        "ack_date": str(raw_header.get("ack_date", "")),
        "items": canonical_items,
        "warnings": invoice.get("_warning_flags", []) if isinstance(invoice, dict) else []
    }
    
    # ── [PHASE 11.9] HSN/SAC HYDRATION GATE ──
    # Promote HSN/SAC from the first item if missing in header
    primary_item = raw_items[0] if raw_items else {}
    logger.info(f"[HSN_TRACE_INPUT] primary_item_keys={list(primary_item.keys())}")
    
    if is_empty(schema_data.get("hsn_sac")):
        schema_data["hsn_sac"] = (
            primary_item.get("hsn_sac")
            or primary_item.get("hsn")
            or primary_item.get("sac")
            or ""
        )
        logger.info(f"[HSN_CANONICALIZED] value='{schema_data['hsn_sac']}' source=primary_item")
    else:
        logger.info(f"[HSN_CANONICALIZED] value='{schema_data['hsn_sac']}' source=header")
    
    try:
        canonical_obj = CanonicalInvoiceSchema(**schema_data)
        logger.info(f"[DTO_POST_VALIDATION] record_id={invoice.get('record_id')} status=VALID")
    except Exception as se:
        logger.error(f"[DTO_VALIDATION_ERROR] record_id={invoice.get('record_id')} error={se} payload={json.dumps(schema_data, default=str)[:1000]}")
        # Fallback to dictionary if Pydantic fails, but don't wipe data
        canonical_obj = type('Obj', (object,), {"dict": lambda: schema_data, "invoice_no": schema_data.get("invoice_no")})
    
    # Forensic Log
    log_canonical_schema_locked(canonical_obj.invoice_no)

    # Convert back to dict for pipeline compatibility but ensure it's frozen
    canonical_record = canonical_obj.dict()

    # Preserve internal lifecycle fields (underscore fields)
    if isinstance(invoice, dict):
        for k, v in invoice.items():
            if k.startswith("_") and k not in canonical_record:
                canonical_record[k] = v

    return canonical_record

def get_ui_payload(invoice: Any) -> Dict[str, Any]:
    """
<<<<<<< HEAD
    UI EGRESS MAPPING.
    STRICT CANONICAL PASSTHROUGH.
    [PHASE 11.9] Removed Title Case conversion. Frontend now expects canonical keys.
    ui_payload = get_canonical_export_record(invoice)
    
    # Forensic Row Audit
    logger.debug(f"[CANONICAL_ROW_KEYS] keys={list(ui_payload.keys())}")
    logger.debug(f"[TABLE_RENDER_VALUE] invoice_no='{ui_payload.get('invoice_no')}' total='{ui_payload.get('total_invoice_value')}'")
                
    return ui_payload
=======
    Produces a UI-compatible payload with Capitalized Keys.
    Essential for frontend table mapping.
    """
    """
    Retained for backward compatibility in the async pipeline.
    Uses the new centralized normalization where applicable.
    """
    if not isinstance(payload, dict):
        return {"_status": "AI_FAILED", "_error": "Payload is not a dictionary"}

    # 1. Deserialize if needed
    if "reply" in payload and isinstance(payload["reply"], str):
        try:
            parsed = json.loads(payload["reply"])
            if isinstance(parsed, dict):
                logger.info(f"[NORMALIZE_PARSE] merging keys from payload: {list(payload.keys())}")
                for k, v in payload.items():
                    if k != "reply" and k not in parsed: 
                        parsed[k] = v
                payload = parsed
                logger.info(f"[NORMALIZE_PARSE_DONE] keys now: {list(payload.keys())}")
        except Exception as pe:
            logger.error(f"[NORMALIZE_PARSE_ERROR] {str(pe)}")

    # 2. Multi-page result stability
    # The real stabilization happens in the export functions
    result = payload.copy()
    
<<<<<<< HEAD
    # ── [ROOT-CAUSE FIX] Preserve Both Title Case & Snake Case for UI Mapping ──
    norm_rec = get_normalized_export_record(payload)
    # 1. First merge the full record to preserve Title Case keys (e.g., "Total Invoice Value")
    result.update(norm_rec)
    
    # 2. Then ensure snake_case aliases exist for backward compatibility and internal logic
=======
    # ── SAFE OVERWRITE PROTECTION (Root Cause #6) ──
    norm_rec = get_normalized_export_record(payload)
>>>>>>> 0216b6ff128cdd98f62573fd77aa18c48169590d
    for k, v in norm_rec.items():
        internal_key = k.lower().replace(" ", "_").replace(".", "")
        existing = result.get(internal_key)
        
<<<<<<< HEAD
        # Never overwrite populated field with empty
        if not is_empty(v):
            if is_empty(existing):
                result[internal_key] = v
            elif str(v) != str(existing):
                 logger.info(f"[PAYLOAD_OVERWRITE_DETECTED] field={internal_key} existing='{str(existing)[:20]}' incoming='{str(v)[:20]}'")
                 if isinstance(v, str) and len(str(v)) > len(str(existing)):
                     result[internal_key] = v
    # 3. Normalize items if present
    items = result.get("items") or result.get("sections", {}).get("items")
    if items:
        result["items"] = get_normalized_items(result)
        
=======
        # [ROOT-CAUSE FIX #6] Never overwrite populated field with empty
        if not is_empty(v):
            if is_empty(existing):
                logger.info(f"[FIELD_POPULATED] key='{internal_key}'")
                result[internal_key] = v
            elif isinstance(v, str) and len(str(v)) > len(str(existing)):
                logger.info(f"[FIELD_UPGRADED] key='{internal_key}' length {len(str(existing))} -> {len(str(v))}")
                result[internal_key] = v
            else:
                logger.info(f"[FIELD_OVERWRITE_BLOCKED] key='{internal_key}' preserved existing='{existing}' over incoming='{v}'")
>>>>>>> 0216b6ff128cdd98f62573fd77aa18c48169590d
    # [ROOT-CASE FIX] Ensure underscore fields are preserved
    for k, v in payload.items():
        if k.startswith("_") and k not in result:
            result[k] = v

<<<<<<< HEAD
    # [NORMALIZE_STAGE_DONE] (Requirement #3)
    logger.info(f"[NORMALIZE_STAGE_DONE] item_count={len(result.get('items', []))}")
=======
>>>>>>> 0216b6ff128cdd98f62573fd77aa18c48169590d
    return result

print("[NORMALIZE_EXPORT_CHECK]", "lossless_preserve" in globals())
