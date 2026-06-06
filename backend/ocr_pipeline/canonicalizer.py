import re
import os
import logging
from typing import Dict, Any, Tuple, List
from django.conf import settings
from ocr_pipeline.services.item_identity_repair import repair_item_identity

logger = logging.getLogger(__name__)

def is_canonicalization_enabled() -> bool:
    """Check if document canonicalization feature flag is enabled."""
    env_val = os.environ.get('ENABLE_DOCUMENT_CANONICALIZATION', 'False').lower() in ('true', '1', 't')
    settings_val = getattr(settings, 'ENABLE_DOCUMENT_CANONICALIZATION', False)
    return env_val or settings_val

class DocumentIdentityCanonicalizer:
    """
    Stabilizes invoice fields (Invoice No, GSTIN, Date, Vendor, Items, HSN)
    by running deterministic repair rules, evaluating confidence, and
    preserving raw fields alongside canonical fields for forensic auditability.
    """

    @staticmethod
    def canonicalize_invoice_no(raw_val: str) -> Tuple[str, float, str]:
        """
        Repairs common OCR mutations in Invoice Numbers.
        Normalizations applied (in order):
          1. Uppercase + strip internal whitespace  (eliminates space-drift, e.g. 'SS 25' == 'SS25')
          2. digit+S/s → digit+5               (e.g. 'ss2s/26-22' → 'SS25/26-22')
          3. FY-separator repair                (e.g. '4216I25-26' → '4216/25-26')
        Returns: (canonical_value, confidence, repair_rule)
        """
        if not raw_val:
            return "", 1.0, "default_empty"

        # Step 1: Uppercase and remove all internal spaces
        raw = re.sub(r'\s+', '', str(raw_val).strip()).upper()
        rules_applied = []

        # Step 2: Repair digit followed by S misread as 5 (e.g. '2S' → '25', '0S' → '05')
        repaired = re.sub(r'(\d)S', r'\g<1>5', raw)
        if repaired != raw:
            logger.info(
                f"[CANONICALIZER_REPAIR_INVOICE_NO] raw='{raw}' repaired='{repaired}' rule='digit_s_to_5'"
            )
            raw = repaired
            rules_applied.append("digit_s_to_5")

        # Step 3: FY-separator repair — e.g. '4216I25-26' → '4216/25-26'
        pattern = re.compile(r'^([A-Z0-9_-]+)([1IL|\\/T])(\d{2,4}-\d{2,4})$')
        match = pattern.match(raw)
        if match:
            prefix, sep, suffix = match.group(1), match.group(2), match.group(3)
            if sep != '/':
                canonical = f"{prefix}/{suffix}"
                rules_applied.append("fy_separator_repair")
                rule_str = "+".join(rules_applied) if rules_applied else "fy_separator_repair"
                logger.info(
                    f"[CANONICALIZER_REPAIR_INVOICE_NO] raw='{raw_val}' canonical='{canonical}' rule='{rule_str}'"
                )
                return canonical, 0.98, rule_str

        rule_str = "+".join(rules_applied) if rules_applied else "none"
        confidence = 0.98 if rules_applied else 1.0
        return raw, confidence, rule_str

    @staticmethod
    def canonicalize_gstin(raw_val: str) -> Tuple[str, float, str]:
        """
        Repairs GSTIN using position-aware mapping, OCR digit translations,
        checksum validations, and best-candidate election.
        Returns: (canonical_value, confidence, repair_rule)
        """
        if not raw_val:
            return "", 1.0, "default_empty"
        raw = str(raw_val).strip().upper().replace(" ", "")
        
        # Clean non-alphanumeric noise
        raw = re.sub(r'[^A-Z0-9]', '', raw)
        
        from ocr_pipeline.normalize import GSTIN_PATTERN, validate_gstin_checksum, _OCR_DIGIT_MAP
        
        # 1. If already valid, do not mutate
        if GSTIN_PATTERN.match(raw) and validate_gstin_checksum(raw):
            return raw, 1.0, "none"

        # 2. If length 15, try basic OCR translate map
        if len(raw) == 15:
            corrected = raw.translate(_OCR_DIGIT_MAP)
            if validate_gstin_checksum(corrected) and GSTIN_PATTERN.match(corrected):
                logger.info(f"[CANONICALIZER_REPAIR_GSTIN] raw='{raw}' canonical='{corrected}' rule='standard_ocr_map'")
                return corrected, 0.98, "standard_ocr_map"

        # Position-aware character corrector (0-indexed)
        def fix_char_by_position(c: str, idx: int) -> str:
            if idx in [0, 1, 7, 8, 9, 10, 12]:
                # Should be digit
                digit_map = {'O': '0', 'o': '0', 'I': '1', 'l': '1', 'L': '1', 'S': '5', 'Z': '2', 'G': '6', 'B': '8'}
                return digit_map.get(c, c)
            elif idx in [2, 3, 4, 5, 6, 11, 13]:
                # Should be letter
                letter_map = {'0': 'O', '1': 'I', '5': 'S', '2': 'Z', '6': 'G', '8': 'B'}
                if idx == 13:
                    return 'Z'
                return letter_map.get(c, c)
            return c

        # 3. If length 16, try removing one char at a time to find the best candidate
        if len(raw) == 16:
            candidates = []
            for i in range(16):
                candidate = raw[:i] + raw[i+1:]
                fixed = "".join(fix_char_by_position(c, idx) for idx, c in enumerate(candidate))
                if GSTIN_PATTERN.match(fixed):
                    is_valid_chk = validate_gstin_checksum(fixed)
                    score = 2 if is_valid_chk else 1
                    candidates.append((fixed, score))
            if candidates:
                # Sort by score descending (checksum valid first)
                candidates.sort(key=lambda x: x[1], reverse=True)
                best_candidate, best_score = candidates[0]
                confidence = 0.97 if best_score == 2 else 0.90
                logger.info(f"[CANONICALIZER_REPAIR_GSTIN] raw='{raw}' canonical='{best_candidate}' rule='length_16_removal_and_position_fix' confidence={confidence}")
                return best_candidate, confidence, "length_16_removal_and_position_fix"

        # 4. Try position-aware fix on 15 chars if not already validated
        if len(raw) == 15:
            fixed = "".join(fix_char_by_position(c, idx) for idx, c in enumerate(raw))
            if validate_gstin_checksum(fixed) and GSTIN_PATTERN.match(fixed):
                logger.info(f"[CANONICALIZER_REPAIR_GSTIN] raw='{raw}' canonical='{fixed}' rule='position_aware_fix'")
                return fixed, 0.98, "position_aware_fix"

        # 5. Try position-aware fix and checksum calculation on 14 chars
        if len(raw) == 14:
            candidate = "".join(fix_char_by_position(c, idx) for idx, c in enumerate(raw))
            chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
            try:
                factor = 1
                total = 0
                for i in range(14):
                    val = chars.find(candidate[i])
                    if val != -1:
                        digit = val * factor
                        total += (digit // 36) + (digit % 36)
                        factor = 2 if factor == 1 else 1
                checksum = (36 - (total % 36)) % 36
                fixed = candidate + chars[checksum]
                if GSTIN_PATTERN.match(fixed) and validate_gstin_checksum(fixed):
                    logger.info(f"[CANONICALIZER_REPAIR_GSTIN] raw='{raw}' canonical='{fixed}' rule='length_14_checksum_append'")
                    return fixed, 0.98, "length_14_checksum_append"
            except Exception as e:
                logger.warning(f"Error computing check digit for length 14 GSTIN repair: {e}")

        # 6. Last fallback: return cleaned raw with moderate confidence
        return raw, 0.80, "none"

    @staticmethod
    def canonicalize_invoice_date(raw_val: str) -> Tuple[str, float, str]:
        """
        Repairs common OCR mutations in Invoice Dates (e.g. O ↔ 0, S ↔ 5, I ↔ 1).
        Returns: (canonical_value, confidence, repair_rule)
        """
        if not raw_val:
            return "", 1.0, "default_empty"
        raw = str(raw_val).strip()
        
        # Tokenize by date separators
        tokens = re.split(r'([./\s-])', raw)
        repaired = False
        
        for idx, token in enumerate(tokens):
            if not token or not token.isalnum():
                continue
            
            # Identify numeric or date part tokens (exclude alphabetic months like 'Aug', 'Sep')
            if len(token) == 3 and token.isalpha():
                continue
                
            is_year = len(token) == 4 and (token.startswith('20') or token.startswith('19') or token.endswith('2S') or token.endswith('202') or any(c.isdigit() for c in token))
            is_day_or_month = len(token) <= 2 and any(c.isdigit() for c in token)
            
            if is_year or is_day_or_month:
                new_token = ""
                for char in token:
                    if char in ('O', 'o'):
                        new_token += '0'
                        repaired = True
                    elif char == 'S':
                        new_token += '5'
                        repaired = True
                    elif char in ('I', 'l'):
                        new_token += '1'
                        repaired = True
                    else:
                        new_token += char
                tokens[idx] = new_token

        if repaired:
            canonical = "".join(tokens)
            logger.info(f"[CANONICALIZER_REPAIR_DATE] raw='{raw}' canonical='{canonical}' rule='digit_ocr_map'")
            return canonical, 0.98, "digit_ocr_map"
        return raw, 1.0, "none"

    @staticmethod
    def canonicalize_item_name(raw_val: str) -> Tuple[str, float, str]:
        """
        Repairs Item Description/Name using the existing item repair engine.
        Emits [ITEM_CANONICALIZATION] structured log for every invocation.
        Returns: (canonical_value, confidence, repair_rule)
        """
        if not raw_val:
            return "", 1.0, "default_empty"

        res = repair_item_identity(raw_val)
        canonical = res.get("canonical_name", raw_val)
        ops = res.get("repair_operations", [])
        confidence = res.get("confidence", 1.0)
        rule = "item_identity_repair" if ops else "none"

        # [PHASE 2] Structured telemetry — emitted for every item regardless of mutation
        logger.info(
            "[ITEM_CANONICALIZATION] field=item_name "
            f"raw_value='{raw_val}' canonical_value='{canonical}' "
            f"confidence={confidence:.3f} repair_rule='{rule}' ops_count={len(ops)}"
        )
        return canonical, confidence, rule

    @staticmethod
    def canonicalize_hsn(raw_val: str) -> Tuple[str, float, str]:
        """
        Repairs HSN/SAC numbers to correct digit misreads:
          G→6, O→0, S→5, I→1, l→1, Z→2, B→8
        Emits [ITEM_CANONICALIZATION] structured log.
        Returns: (canonical_value, confidence, repair_rule)
        """
        if not raw_val:
            return "", 1.0, "default_empty"
        raw = str(raw_val).strip().upper()
        raw = re.sub(r'[^A-Z0-9]', '', raw)

        digit_map = {'G': '6', 'O': '0', 'o': '0', 'S': '5', 'I': '1', 'l': '1', 'Z': '2', 'B': '8'}
        repaired = ""
        is_modified = False
        for c in raw:
            if c in digit_map:
                repaired += digit_map[c]
                is_modified = True
            else:
                repaired += c

        if is_modified:
            rule = "digit_ocr_map"
            confidence = 0.98
            canonical = repaired
        else:
            rule = "none"
            confidence = 1.0
            canonical = raw

        # [PHASE 2] Structured telemetry
        logger.info(
            "[ITEM_CANONICALIZATION] field=hsn "
            f"raw_value='{raw_val}' canonical_value='{canonical}' "
            f"confidence={confidence:.3f} repair_rule='{rule}'"
        )
        return canonical, confidence, rule

    @staticmethod
    def canonicalize_vendor_name(raw_val: str) -> Tuple[str, float, str]:
        """
        [PHASE 3] Safe vendor name normalization.
        Applies ONLY: trim whitespace, collapse duplicate spaces, uppercase.
        Does NOT strip business suffixes, does NOT perform fuzzy matching,
        does NOT merge or guess vendors.
        Emits [VENDOR_CANONICALIZATION] structured log.
        Returns: (canonical_value, confidence, repair_rule)
        """
        if not raw_val:
            return "", 1.0, "default_empty"

        raw = str(raw_val).strip()
        # Collapse duplicate internal spaces, then uppercase
        canonical = re.sub(r'\s+', ' ', raw).strip().upper()

        rules_applied = []
        if canonical != raw.upper():
            rules_applied.append("space_collapse")
        if raw != raw.upper():
            rules_applied.append("uppercase")

        rule_str = "+".join(rules_applied) if rules_applied else "none"
        confidence = 0.99 if rules_applied else 1.0

        # [PHASE 3] Structured telemetry
        logger.info(
            "[VENDOR_CANONICALIZATION] "
            f"raw_vendor_name='{raw}' canonical_vendor_name='{canonical}' "
            f"confidence={confidence:.3f} repair_rule='{rule_str}'"
        )
        return canonical, confidence, rule_str

    @classmethod
    def canonicalize_invoice(cls, invoice: Dict[str, Any], force_canonicalization: bool = False) -> Dict[str, Any]:
        """
        Pre-processing layer to normalize the invoice dict.
        Updates standard fields to canonical values if ENABLE_DOCUMENT_CANONICALIZATION is True
        and repair confidence >= 0.95.
        Generates raw_* and canonical_* fields.
        """
        import copy
        inv = copy.deepcopy(invoice)
        
        enabled = force_canonicalization or is_canonicalization_enabled()
        
        # 1. Invoice No
        orig_invoice_no = str(inv.get("invoice_no") or inv.get("invoice_number") or inv.get("supplier_invoice_no") or "").strip()
        canon_invoice_no, conf_inv, rule_inv = cls.canonicalize_invoice_no(orig_invoice_no)
        inv["raw_invoice_no"] = orig_invoice_no
        inv["canonical_invoice_no"] = canon_invoice_no
        if enabled and conf_inv >= 0.95:
            inv["invoice_no"] = canon_invoice_no
            inv["invoice_number"] = canon_invoice_no
            inv["supplier_invoice_no"] = canon_invoice_no
        else:
            inv["invoice_no"] = orig_invoice_no
            inv["invoice_number"] = orig_invoice_no
            inv["supplier_invoice_no"] = orig_invoice_no

        # 2. GSTIN
        orig_gstin = str(inv.get("gstin") or inv.get("vendor_gstin") or inv.get("supplier_gstin") or "").strip()
        canon_gstin, conf_gst, rule_gst = cls.canonicalize_gstin(orig_gstin)
        inv["raw_gstin"] = orig_gstin
        inv["canonical_gstin"] = canon_gstin
        if enabled and conf_gst >= 0.95:
            inv["gstin"] = canon_gstin
            inv["vendor_gstin"] = canon_gstin
            inv["supplier_gstin"] = canon_gstin
        else:
            inv["gstin"] = orig_gstin
            inv["vendor_gstin"] = orig_gstin
            inv["supplier_gstin"] = orig_gstin

        # 3. Invoice Date
        orig_date = str(inv.get("invoice_date") or inv.get("date") or inv.get("supplier_invoice_date") or "").strip()
        canon_date, conf_dt, rule_dt = cls.canonicalize_invoice_date(orig_date)
        inv["raw_invoice_date"] = orig_date
        inv["canonical_invoice_date"] = canon_date
        if enabled and conf_dt >= 0.95:
            inv["invoice_date"] = canon_date
            inv["date"] = canon_date
            inv["supplier_invoice_date"] = canon_date
        else:
            inv["invoice_date"] = orig_date
            inv["date"] = orig_date
            inv["supplier_invoice_date"] = orig_date

        # 4. Vendor Name
        orig_vendor = str(inv.get("vendor_name") or inv.get("supplier_name") or inv.get("vendor") or "").strip()
        canon_vendor, conf_vd, rule_vd = cls.canonicalize_vendor_name(orig_vendor)
        inv["raw_vendor_name"] = orig_vendor
        inv["canonical_vendor_name"] = canon_vendor
        if enabled and conf_vd >= 0.95:
            inv["vendor_name"] = canon_vendor
            inv["supplier_name"] = canon_vendor
            inv["vendor"] = canon_vendor
        else:
            inv["vendor_name"] = orig_vendor
            inv["supplier_name"] = orig_vendor
            inv["vendor"] = orig_vendor

        # 5. Items & HSN/SAC
        items = inv.get("items") or []
        new_items = []
        for item in items:
            if not isinstance(item, dict):
                new_items.append(item)
                continue
                
            orig_desc = str(item.get("description") or item.get("Item Name") or item.get("item_name") or "").strip()
            canon_desc, conf_item, rule_item = cls.canonicalize_item_name(orig_desc)
            
            orig_hsn = str(item.get("hsn_sac") or item.get("hsn_code") or item.get("hsn") or item.get("sac") or "").strip()
            canon_hsn, conf_hsn, rule_hsn = cls.canonicalize_hsn(orig_hsn)
            
            item["raw_item_name"] = orig_desc
            item["canonical_item_name"] = canon_desc
            item["raw_hsn"] = orig_hsn
            item["canonical_hsn"] = canon_hsn
            
            # Item name gate: 0.85 — item repair is rule-based; edit-distance confidence
            # can score below 0.95 even for safe TNG→ING class repairs.
            if enabled and conf_item >= 0.85:
                item["description"] = canon_desc
                if "Item Name" in item:
                    item["Item Name"] = canon_desc
                if "item_name" in item:
                    item["item_name"] = canon_desc
            else:
                item["description"] = orig_desc
                if "Item Name" in item:
                    item["Item Name"] = orig_desc
                if "item_name" in item:
                    item["item_name"] = orig_desc
                    
            if enabled and conf_hsn >= 0.95:
                item["hsn_sac"] = canon_hsn
                if "hsn_code" in item:
                    item["hsn_code"] = canon_hsn
                if "hsn" in item:
                    item["hsn"] = canon_hsn
                if "sac" in item:
                    item["sac"] = canon_hsn
            else:
                item["hsn_sac"] = orig_hsn
                if "hsn_code" in item:
                    item["hsn_code"] = orig_hsn
                if "hsn" in item:
                    item["hsn"] = orig_hsn
                if "sac" in item:
                    item["sac"] = orig_hsn
            new_items.append(item)
            
        inv["items"] = new_items
        return inv
