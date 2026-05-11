import logging
import re
import json
from typing import Dict, Any, Optional, List
from datetime import datetime

logger = logging.getLogger(__name__)

# ── OCR & MAPPING CONSTANTS ──────────────────────────────────────────────────
_OCR_DIGIT_MAP = str.maketrans({
    'o': '0', 'O': '0',
    'l': '1', 'I': '1',
    'S': '5', 'Z': '2',
    'G': '6', 'B': '8',
})

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
    [PHASE 2] Non-destructive GSTIN normalization.
    Only applies OCR heuristics if the original checksum fails.
    """
    if is_empty(gstin): return ""
    raw = str(gstin).strip().upper().replace(" ", "")
    
    # 1. If already valid, DO NOT MUTATE
    if validate_gstin_checksum(raw):
        return raw
    
    # 2. Try OCR corrections
    corrected = raw.translate(_OCR_DIGIT_MAP)
    if validate_gstin_checksum(corrected):
        logger.info(f"[GSTIN_CORRECTED] original='{raw}' corrected='{corrected}'")
        return corrected
        
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
    """Robust date normalization to dd-mm-yyyy with OCR noise handling."""
    if is_empty(date_val): return ""
    if isinstance(date_val, datetime): 
        res = date_val.strftime("%d-%m-%Y")
        logger.info(f"[FORENSIC_DATE] source='datetime' raw='{date_val}' normalized='{res}'")
        return res
    
    raw = str(date_val).strip()
    # Pre-clean: remove non-alphanumeric noise from boundaries
    raw_clean = re.sub(r'^[^a-zA-Z0-9]+', '', raw)
    raw_clean = re.sub(r'[^a-zA-Z0-9]+$', '', raw_clean)
    
    # Standardize common OCR-corrupted separators
    clean_str = re.sub(r'[./\\]', '-', raw_clean)
    
    _FORMATS = [
        "%d-%m-%Y", "%Y-%m-%d", "%d-%m-%y", "%m-%d-%Y",
        "%d %b %Y", "%d-%b-%Y", "%d-%b-%y", "%b %d %Y",
        "%d %B %Y", "%d-%B-%Y", "%d.%m.%Y", "%d/%m/%Y"
    ]
    
    for fmt in _FORMATS:
        try: 
            res = datetime.strptime(clean_str, fmt).strftime("%d-%m-%Y")
            logger.info(f"[FORENSIC_DATE] source='string_clean' fmt='{fmt}' raw='{raw}' normalized='{res}'")
            return res
        except:
            try: 
                res = datetime.strptime(raw, fmt).strftime("%d-%m-%Y")
                logger.info(f"[FORENSIC_DATE] source='string_raw' fmt='{fmt}' raw='{raw}' normalized='{res}'")
                return res
            except: continue
            
    logger.warning(f"[FORENSIC_DATE_FAIL] Could not parse date: '{raw}'")
    return raw

def normalize_state(state: Any) -> str:
    """Normalized Place of Supply stripping state codes and numeric prefixes."""
    if is_empty(state): return ""
    raw = str(state).strip().upper()
    # Strip numeric prefixes/suffixes (e.g. 33-TAMIL NADU or TAMIL NADU / 33)
    raw = re.sub(r'^\d+\s*[-/]?\s*', '', raw)
    raw = re.sub(r'\s*[-/]?\s*\d+$', '', raw)
    return raw.strip()

def sanitize_description(desc: Any) -> str:
    """Isolates item descriptions from HSN/SAC codes and OCR table noise."""
    if is_empty(desc): return ""
    raw = str(desc).strip()
    # Remove SAC/HSN codes and labels
    raw = re.sub(r'(?i)\b(HSN|SAC|HSN/SAC)(\s*CODE)?\s*[:/-]?\s*\d+', '', raw)
    # Remove common meta-noise
    raw = re.sub(r'(?i)\bGST\s*\d+\s*%', '', raw)
    raw = re.sub(r'[|]', '', raw)
    res = re.sub(r'\s+', ' ', raw).strip()
    if res != desc:
        logger.info(f"[FORENSIC_ITEM_SAN] original='{desc[:20]}' sanitized='{res[:20]}'")
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
    """
    if is_empty(existing) and not is_empty(incoming):
        return incoming
    if not is_empty(existing) and is_empty(incoming):
        return existing
    if not is_empty(incoming):
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
    
    REJECT_PATTERNS = [
        r'(?i)\b(Phone|Mobile|Mob|Ph|Tel|Fax|Email|E-mail|Mail|GSTIN|PAN|URL|WWW|Website)\s*[:/-]?\s*.*',
        r'[\w.-]+@[\w.-]+\.\w+',
        r'\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}',
        r'[A-Z]{5}\d{4}[A-Z]{1}',
    ]
    
    cleaned_lines = []
    for line in raw_lines:
        line = line.strip()
        if not line: continue
        
        is_rejected = False
        for pattern in REJECT_PATTERNS:
            if re.search(pattern, line):
                line = re.sub(pattern, '', line).strip()
                if not line:
                    is_rejected = True
                    break
        
        if is_rejected: continue
        
        line = line.strip().strip(',').strip()
        if line:
            cleaned_lines.append(line)
    
    final_addr = ", ".join(cleaned_lines)
    # Ensure no leading/trailing commas or extra spaces
    final_addr = re.sub(r',\s*,', ',', final_addr).strip().strip(',')
    
    # ── [PHASE 3] SANITIZATION SAFETY (Root Cause #1) ──
    if is_empty(final_addr) and not is_empty(addr):
        logger.warning(f"[ADDRESS_RECOVERY] Sanitization wiped address. Preserving raw. original='{addr[:30]}...'")
        return addr.strip()
    
    logger.info(f"[ADDRESS_SANITIZED] original_len={len(addr)} final_len={len(final_addr)}")
    return final_addr

def derive_branch_from_address(addr: str) -> str:
    """Infers branch from known location keywords."""
    if is_empty(addr): return ""
    upper_addr = addr.upper()
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
    CENTRALIZED EXPORT NORMALIZER (Requirement #1, #2, #3, #6, #7)
    ONE source of truth for header mapping with strict address bypass checks.
    """
    # ── [ROOT-CAUSE FIX] DEFENSIVE UNWRAPPING ──
    # If passed a wrapped AI result, unwrap it and merge metadata (like _pdf_ocr_text)
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

    # ── MAPPING PRIORITY HELPER ──
    def get_strict(keys, default=""):
        # 1. Check top-level
        for k in keys:
            val = getattr(invoice, k, None) if not isinstance(invoice, dict) else invoice.get(k)
            if not is_empty(val): 
                logger.info(f"[GET_STRICT_HIT] key='{k}' source='root' val='{str(val)[:20]}'")
                return val, k
        # 2. Check 'header'
        header = getattr(invoice, 'header', {}) if not isinstance(invoice, dict) else invoice.get('header', {})
        if isinstance(header, dict):
            for k in keys:
                val = header.get(k)
                if not is_empty(val): 
                    logger.info(f"[GET_STRICT_HIT] key='{k}' source='header' val='{str(val)[:20]}'")
                    return val, f"header.{k}"
        # 3. Check 'sections.supplier_details'
        sections = getattr(invoice, 'sections', {}) if not isinstance(invoice, dict) else invoice.get('sections', {})
        if isinstance(sections, dict):
            sub = sections.get('supplier_details', {})
            if isinstance(sub, dict):
                for k in keys:
                    mapped_k = "supplier_invoice_no" if k == "invoice_no" else k
                    val = sub.get(mapped_k) or sub.get(k)
                    if not is_empty(val): return val, f"sections.supplier.{k}"
            # [ROOT-CAUSE FIX #7] Check sections.bill_from directly
            for k in keys:
                val = sections.get(k)
                if not is_empty(val): return val, f"sections.{k}"
        return default, "NONE"

    # ── [PHASE 3] BILL_FROM FALLBACK CHAIN (Root Cause #1) ──
    # [ROOT-CAUSE FIX #7] Exhaustive Address Extraction
    # Prioritized: bill_from -> vendor_address -> supplier_address -> seller_address -> address -> vendor_address_block -> raw_ocr.vendor_block
    raw_from, source_from = get_strict(["bill_address_from", "Bill Address From", "bill_from", "vendor_address", "supplier_address", "seller_address", "address", "vendor_address_block", "vendor_details", "supplier_details"])
    
    # ── [PHASE 3] BILL_TO FALLBACK CHAIN ──
    raw_to, source_to = get_strict(["bill_address_to", "Bill Address To", "billing_address", "customer_address", "buyer_address", "bill_to_address"])

    # ── [ADDRESS_EXTRACTION_FORENSIC] (Tracing the root cause of NONE) ──
    logger.info(f"[FORENSIC_MAPPING_INPUT] raw_from='{str(raw_from)[:20]}' source_from='{source_from}'")
    logger.info(f"[FORENSIC_MAPPING_INPUT] raw_to='{str(raw_to)[:20]}' source_to='{source_to}'")

    # ── [WINDOW_SLICER_FALLBACK] (Requirement: Fix empty address extraction) ──
    # If Gemini failed to extract but OCR text is present, slice via known anchors.
    if is_empty(raw_from) or is_empty(raw_to):
        ocr_text = ""
        if isinstance(invoice, dict):
            ocr_text = invoice.get("_pdf_ocr_text") or invoice.get("_raw_text") or ""
        
        if ocr_text:
            logger.info(f"[WINDOW_SLICER_START] ocr_len={len(ocr_text)}")
            
            # SHIP_TO Window -> Bill Address From (Requirement)
            if is_empty(raw_from):
                # Pattern: Consignee (Ship to) ... Buyer (Bill to)
                ship_match = re.search(r"Consignee\s*\(Ship\s*to\)(.*?)Buyer\s*\(Bill\s*to\)", ocr_text, re.DOTALL | re.IGNORECASE)
                if ship_match:
                    raw_from = ship_match.group(1).strip()
                    source_from = "window_slicer_ship_to"
                    logger.info(f"[WINDOW_SLICER_HIT] From='{source_from}' length={len(raw_from)}")
            
            # BILL_TO Window -> Bill Address To (Requirement)
            if is_empty(raw_to):
                # Pattern: Buyer (Bill to) ... Place of Supply (or other common end anchors)
                bill_match = re.search(r"Buyer\s*\(Bill\s*to\)(.*?)(?:Place\s*of\s*Supply|Dated|Delivery\s*Note|Invoice\s*No|Voucher\s*No)", ocr_text, re.DOTALL | re.IGNORECASE)
                if bill_match:
                    raw_to = bill_match.group(1).strip()
                    source_to = "window_slicer_bill_to"
                    logger.info(f"[WINDOW_SLICER_HIT] To='{source_to}' length={len(raw_to)}")
                else:
                    logger.info(f"[WINDOW_SLICER_MISS] regex did not match anchors in ocr_text. snippet='{ocr_text[:100]}'")
        else:
            logger.warning(f"[WINDOW_SLICER_SKIPPED] ocr_text is empty or missing in invoice object. Keys: {list(invoice.keys()) if isinstance(invoice, dict) else 'N/A'}")

    # ── FINAL FALLBACKS (Consolidating source logging) ──
    if is_empty(raw_from):
        sections = invoice.get("sections", {}) if isinstance(invoice, dict) else {}
        header = invoice.get("header", {}) if isinstance(invoice, dict) else {}
        supplier_sub = sections.get("supplier_details", {}) if isinstance(sections, dict) else {}
        
        raw_from = (
            supplier_sub.get("bill_from") or 
            supplier_sub.get("address") or 
            supplier_sub.get("vendor_address") or
            header.get("vendor_address") or
            header.get("billing_address") or
            ""
        )
        if raw_from: source_from = "deep_supplier_details_or_header"
    
    if is_empty(raw_from):
         # Last resort: take a snippet of the OCR if it's still completely empty
         raw_from = (invoice.get("_pdf_ocr_text", "")[:150] if isinstance(invoice, dict) else "").strip()
         if raw_from: source_from = "raw_ocr_snippet"

    logger.info(f"[BILL_FROM_SOURCE] source='{source_from}' length={len(raw_from)}")
    logger.info(f"[BILL_TO_SOURCE] source='{source_to}' length={len(raw_to)}")
    
    logger.info(f"[SESSION_FORENSIC] stage='normalize_address' From='{source_from}' To='{source_to}'")

    bill_from_sanitized = sanitize_address(raw_from)
    bill_to_sanitized = sanitize_address(raw_to)
    
    # ── [PHASE 3] NEVER OVERWRITE WITH BLANK (Root Cause #1 & #6) ──
    if not is_empty(raw_from) and is_empty(bill_from_sanitized):
        logger.warning(f"[BILL_FROM_RECOVERED] Sanitization wiped address. Reverting to raw. record='{raw_from[:20]}'")
        bill_from_sanitized = raw_from

    logger.info(f"[BILL_FROM_FINAL] length={len(bill_from_sanitized)} snippet='{bill_from_sanitized[:30]}...'")

    # ── BRANCH LOGIC ──
    branch_val, _ = get_strict(["branch", "branch_name", "Branch"])
    if is_empty(branch_val):
        branch_val = derive_branch_from_address(bill_to_sanitized) or derive_branch_from_address(bill_from_sanitized)

    record = {
        "Date": normalize_date(get_strict(["invoice_date", "date", "bill_date"])[0]),
        "Invoice No": get_strict(["invoice_no", "invoice_number", "bill_no"])[0],
        "Name": get_strict(["vendor_name", "supplier_name", "name"])[0],
        "GSTIN": normalize_gstin_safe(get_strict(["gstin", "vendor_gstin", "supplier_gstin"])[0]),
        "Branch": branch_val,
        "branch": branch_val, # Add lowercase for frontend compatibility
        "Place of Supply": normalize_state(get_strict(["place_of_supply", "vendor_state", "state"])[0]),
        "Bill Address From": bill_from_sanitized,
        "Bill Address To": bill_to_sanitized,
        "bill_address_from": bill_from_sanitized, # Add snake_case for frontend/DTO compatibility
        "bill_address_to": bill_to_sanitized,   # Add snake_case for frontend/DTO compatibility
        "Total Taxable Value": normalize_amount(get_strict(["total_taxable_value", "taxable_value", "subtotal"])[0]),
        "Total Invoice Value": normalize_amount(get_strict(["invoice_total", "total_invoice_value", "total_amount", "grand_total"])[0]),
        "Total IGST": normalize_amount(get_strict(["total_igst", "igst"])[0]),
        "Total CGST": normalize_amount(get_strict(["total_cgst", "cgst"])[0]),
        "Total SGST/UTGST": normalize_amount(get_strict(["total_sgst", "sgst", "utgst"])[0]),
        "IRN": get_strict(["irn", "irn_no"])[0],
        "Ack. No.": get_strict(["ack_no", "acknowledgement_number"])[0],
        "Ack. Date": normalize_date(get_strict(["ack_date", "acknowledgement_date"])[0]),
        "Folder Path": get_strict(["file_path", "folder_path", "path"])[0]
    }

    # ── [ROOT-CAUSE FIX] Preserve Underscore Fields for Lifecycle Continuity ──
    if isinstance(invoice, dict):
        for k, v in invoice.items():
            if k.startswith("_") and k not in record:
                record[k] = v
    
    logger.info(f"[ADDRESS_AFTER_EXPORT] From='{record['Bill Address From'][:50]}...'")
    logger.info(f"[EXPORT_FINAL_ROW] inv={record['Invoice No']} name={record['Name']} total={record['Total Invoice Value']}")
    return record

def get_normalized_items(invoice: Any) -> List[Dict[str, Any]]:
    """
    CENTRALIZED ITEM NORMALIZER (Requirement #3)
    Extracts and canonicalizes line items.
    """
    items_source = []
    if isinstance(invoice, dict):
        items_source = invoice.get('items') or invoice.get('sections', {}).get('items') or invoice.get('reconstructed_items') or []
    else:
        items_source = getattr(invoice, 'items', []) or getattr(invoice, 'extracted_data', {}).get('sections', {}).get('items', [])
        
    normalized_items = []
    for item in items_source:
        if not isinstance(item, dict): continue
        
        desc = item.get("description") or item.get("item_name") or item.get("name") or ""
        if not desc: continue
        
        # ── [PHASE 5] QUANTITY/RATE MAPPING ──
        raw_qty = item.get("qty") or item.get("quantity") or 0
        raw_rate = item.get("rate") or item.get("item_rate") or item.get("unit_price") or 0
        raw_taxable = item.get("taxable_value") or item.get("amount") or item.get("line_total")
        
        qty = normalize_amount(raw_qty)
        rate = normalize_amount(raw_rate)
        taxable = normalize_amount(raw_taxable)
        
        igst = normalize_amount(item.get("igst") or item.get("igst_amount") or 0)
        cgst = normalize_amount(item.get("cgst") or item.get("cgst_amount") or 0)
        sgst = normalize_amount(item.get("sgst") or item.get("sgst_amount") or item.get("utgst") or 0)
        
        normalized_items.append({
            "Item Name": desc,
            "HSN/SAC": str(item.get("hsn_sac") or item.get("hsn") or item.get("hsn_code") or ""),
            "Qty": qty,
            "UOM": item.get("uom") or item.get("unit") or "",
            "Item Rate": rate,
            "Taxable Value": taxable,
            "IGST": igst,
            "CGST": cgst,
            "SGST/UTGST": sgst,
            "Invoice Value": taxable + igst + cgst + sgst
        })
        
    # ── [ROOT-CAUSE FIX] Centralized Multiline Merging ──
    # This ensures UI, Canonical, and Export all see the same merged data
    final_items = merge_item_continuations(normalized_items)
    
    logger.info(f"[ITEM_EXPORT_COUNT] count={len(final_items)}")
    return final_items

def get_canonical_export_record(invoice: Any) -> Dict[str, Any]:
    """
    PHASE 4: CANONICAL SCHEMA STABILIZATION
    Provides ONE authoritative normalized export record.
    DOWNSTREAM SYSTEMS MUST ONLY USE THIS.
    """
    # ── [DEFENSIVE UNWRAPPING] ──
    # If passed a string, try to parse it.
    if isinstance(invoice, str):
        try:
            invoice = json.loads(invoice)
        except: pass
    
    # If passed a wrapped AI result, unwrap it.
    if isinstance(invoice, dict):
        unwrapped = invoice.get('reply_json') or invoice.get('data') or invoice.get('reply')
        if unwrapped:
            if isinstance(unwrapped, str):
                try:
                    parsed = json.loads(unwrapped)
                    if isinstance(parsed, dict):
                        # Merge metadata from wrapper (e.g. _pdf_ocr_text)
                        for k, v in invoice.items():
                            if k not in ['reply_json', 'data', 'reply'] and k not in parsed:
                                parsed[k] = v
                        invoice = parsed
                except: pass
            elif isinstance(unwrapped, dict):
                # Already a dict, just merge metadata
                for k, v in invoice.items():
                    if k not in ['reply_json', 'data', 'reply'] and k not in unwrapped:
                        unwrapped[k] = v
                invoice = unwrapped

    raw_header = get_normalized_export_record(invoice)
    raw_items = get_normalized_items(invoice)
    
    logger.info(f"[SERIALIZER_INPUT] invoice_no='{invoice.get('invoice_no') if isinstance(invoice, dict) else 'N/A'}' items={len(raw_items)}")
    
    canonical_items = []
    for item in raw_items:
        # raw_items already contains "Item Name", "Qty", etc. from get_normalized_items
        canonical_items.append({
            "description": item.get("Item Name", ""),
            "hsn_sac": item.get("HSN/SAC", ""),
            "qty": item.get("Qty", 0),
            "uom": item.get("UOM", ""),
            "rate": item.get("Item Rate", 0),
            "taxable_value": item.get("Taxable Value", 0),
            "igst": item.get("IGST", 0),
            "cgst": item.get("CGST", 0),
            "sgst": item.get("SGST/UTGST", 0),
            "total_amount": item.get("Invoice Value", 0)
        })
    
    # ── [FORENSIC_CANONICAL_CHECK] ──
    logger.info(f"[CANONICAL_ITEMS_READY] count={len(canonical_items)}")

    canonical_record = {
        # Identity
        "invoice_no": raw_header.get("Invoice No", ""),
        "invoice_date": raw_header.get("Date", ""),
        "vendor_name": raw_header.get("Name", ""),
        "gstin": raw_header.get("GSTIN", ""),
        "branch": raw_header.get("Branch", ""),
        
        # Address
        "bill_address_from": raw_header.get("Bill Address From", ""),
        "bill_address_to": raw_header.get("Bill Address To", ""),
        "place_of_supply": raw_header.get("Place of Supply", ""),
        
        # Totals
        "total_taxable_value": normalize_amount(raw_header.get("Total Taxable Value", 0)),
        "total_igst": normalize_amount(raw_header.get("Total IGST", 0)),
        "total_cgst": normalize_amount(raw_header.get("Total CGST", 0)),
        "total_sgst": normalize_amount(raw_header.get("Total SGST/UTGST", 0)),
        "invoice_total": normalize_amount(raw_header.get("Total Invoice Value", 0)),
        
        # Metadata
        "items": canonical_items,
        "warnings": invoice.get("_warning_flags", []) if isinstance(invoice, dict) else []
    }
    
    # ── [ROOT-CAUSE FIX] Preserve Underscore Fields for Assembly Continuity ──
    if isinstance(invoice, dict):
        for k, v in invoice.items():
            if k.startswith("_") and k not in canonical_record:
                canonical_record[k] = v

    logger.info(f"[SERIALIZER_OUTPUT] inv={canonical_record['invoice_no']} total={canonical_record['invoice_total']} items={len(canonical_items)}")
    return canonical_record

def get_ui_payload(invoice: Any) -> Dict[str, Any]:
    """
    Produces a UI-compatible payload with Capitalized Keys.
    Essential for frontend table mapping.
    """
    header = get_normalized_export_record(invoice)
    items = get_normalized_items(invoice)
    header["items"] = items
    
    # Preserve underscore fields for UI persistence (Requirement: Trace ONLY OCR payload lifecycle)
    if isinstance(invoice, dict):
        for k, v in invoice.items():
            if k.startswith("_") and k not in header:
                header[k] = v
                
    return header

# ── CORE NORMALIZATION (RETAINED FOR PIPELINE) ───────────────────────────────

def normalize(payload: Any) -> Dict[str, Any]:
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
    
    # ── SAFE OVERWRITE PROTECTION (Root Cause #6) ──
    norm_rec = get_normalized_export_record(payload)
    for k, v in norm_rec.items():
        internal_key = k.lower().replace(" ", "_").replace(".", "")
        existing = result.get(internal_key)
        
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
    # [ROOT-CASE FIX] Ensure underscore fields are preserved
    for k, v in payload.items():
        if k.startswith("_") and k not in result:
            result[k] = v

    return result

print("[NORMALIZE_EXPORT_CHECK]", "lossless_preserve" in globals())
