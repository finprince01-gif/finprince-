import re
import logging
from typing import Dict, Any, List, Tuple
from vendors.models import VendorMasterBasicDetail, VendorMasterGSTDetails
from vendors.vendor_validation_logic import canonicalize_gstin_ocr

logger = logging.getLogger(__name__)

class GSTINOwnershipClassifier:
    @classmethod
    def classify_gstins(cls, raw_text: str, extracted_data: Dict[str, Any], tenant_id: str) -> Dict[str, Any]:
        """
        Classifies all extracted GSTINs by document role (VENDOR, BUYER, CONSIGNEE, etc.).
        Returns a dictionary containing raw and canonical GSTINs assigned to their roles.
        """
        raw_text = raw_text or ""
        extracted_data = extracted_data or {}
        
        # Construct space-stripped string and its index mapping to raw_text
        s_chars = []
        s_to_raw = []
        for idx, char in enumerate(raw_text):
            if not char.isspace():
                s_chars.append(char)
                s_to_raw.append(idx)
        s = "".join(s_chars).upper()

        # Candidates map: { canon_gstin: { "scores": { VENDOR, BUYER, CONSIGNEE }, "raw_values": set() } }
        candidates_info = {}

        # 1. Slide window of size 15 to find all potential GSTINs in space-stripped text
        for i in range(len(s) - 14):
            chunk = s[i:i+15]
            if re.match(r'^[0-9IOLB]{2}[A-Z0-9]{13}$', chunk):
                canon = canonicalize_gstin_ocr(chunk)
                if re.match(r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[Z0-9]{1}[0-9A-Z]{1}$', canon):
                    orig_start = s_to_raw[i]
                    orig_end = s_to_raw[i+14]
                    raw_val = raw_text[orig_start:orig_end+1].strip()
                    
                    if canon not in candidates_info:
                        candidates_info[canon] = {
                            "scores": {
                                "VENDOR": 0.0,
                                "BUYER": 0.0,
                                "CONSIGNEE": 0.0
                            },
                            "raw_values": set()
                        }
                    candidates_info[canon]["raw_values"].add(raw_val)

                    # Extract window of 250 characters before this GSTIN in raw text
                    window_start = max(0, orig_start - 250)
                    window = raw_text[window_start:orig_start].lower()

                    # Proximity keywords scoring
                    buyer_kws = ["buyer", "uyer", "bill to", "bill-to", "billed to", "billed-to", "billing address", "buyer address", "customer", "purchaser", "ili to"]
                    consignee_kws = ["consignee", "consigne", "consign", "ship to", "ship-to", "shipped to", "shipping address", "delivery to", "delivered to"]
                    vendor_kws = ["supplier", "seller", "vendor", "tax invoice", "company's gstin", "supplier's ref"]

                    def get_proximity_score(keywords: List[str]) -> float:
                        max_score = 0.0
                        for kw in keywords:
                            idx = window.rfind(kw)
                            if idx != -1:
                                dist = len(window) - idx
                                score = 1.0 + (100.0 / dist)
                                if score > max_score:
                                    max_score = score
                        return max_score

                    candidates_info[canon]["scores"]["BUYER"] += get_proximity_score(buyer_kws)
                    candidates_info[canon]["scores"]["CONSIGNEE"] += get_proximity_score(consignee_kws)
                    candidates_info[canon]["scores"]["VENDOR"] += get_proximity_score(vendor_kws)

        # Include already extracted GSTIN fields by Gemini if not yet in candidates
        ext_gstin = extracted_data.get("gstin") or extracted_data.get("vendor_gstin") or ""
        ext_buyer = extracted_data.get("buyer_gstin") or extracted_data.get("bill_to_gstin") or ""
        ext_consignee = extracted_data.get("consignee_gstin") or extracted_data.get("ship_to_gstin") or ""

        for val in [ext_gstin, ext_buyer, ext_consignee]:
            if val:
                canon = canonicalize_gstin_ocr(val)
                if canon and re.match(r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[Z0-9]{1}[0-9A-Z]{1}$', canon):
                    if canon not in candidates_info:
                        candidates_info[canon] = {
                            "scores": {"VENDOR": 0.0, "BUYER": 0.0, "CONSIGNEE": 0.0},
                            "raw_values": {val}
                        }

        logger.info(f"[GSTIN_CLASSIFIER_CANDIDATES] tenant_id={tenant_id} candidates={list(candidates_info.keys())}")

        # 2. Database Lookup by Vendor Name
        vendor_name = extracted_data.get("vendor_name") or ""
        registered_vendor_gstins = []
        if vendor_name and tenant_id:
            try:
                vendor_objs = VendorMasterBasicDetail.objects.filter(tenant_id=tenant_id, vendor_name__iexact=vendor_name)
                for v in vendor_objs:
                    gst_details = VendorMasterGSTDetails.objects.filter(vendor_basic_detail=v)
                    for g in gst_details:
                        g_canon = canonicalize_gstin_ocr(g.gstin)
                        if g_canon:
                            registered_vendor_gstins.append(g_canon)
                            if g_canon in candidates_info:
                                candidates_info[g_canon]["scores"]["VENDOR"] += 100.0
                            else:
                                candidates_info[g_canon] = {
                                    "scores": {"VENDOR": 100.0, "BUYER": 0.0, "CONSIGNEE": 0.0},
                                    "raw_values": {g.gstin}
                                }
            except Exception as e:
                logger.warning(f"[GSTIN_CLASSIFIER_DB_NAME_ERR] {e}")

        # 3. Database Lookup by GSTIN alone
        for c in list(candidates_info.keys()):
            if tenant_id:
                try:
                    is_vendor = VendorMasterGSTDetails.objects.filter(tenant_id=tenant_id, gstin__iexact=c).exists()
                    if is_vendor:
                        candidates_info[c]["scores"]["VENDOR"] += 50.0
                except Exception as e:
                    logger.warning(f"[GSTIN_CLASSIFIER_DB_GSTIN_ERR] {e}")

        logger.info(f"[GSTIN_CLASSIFIER_SCORES] tenant_id={tenant_id} scores={ {k: v['scores'] for k, v in candidates_info.items()} }")

        # 4. Resolve Winners
        # Vendor first
        vendor_gstin = ""
        best_vendor_score = -1.0
        for c, info in candidates_info.items():
            if info["scores"]["VENDOR"] > best_vendor_score:
                best_vendor_score = info["scores"]["VENDOR"]
                vendor_gstin = c
        if best_vendor_score <= 0.0:
            vendor_gstin = ""

        # Remaining candidates for buyer and consignee
        remaining = [c for c in candidates_info.keys() if c != vendor_gstin]

        # Buyer
        buyer_gstin = ""
        best_buyer_score = -1.0
        for c in remaining:
            info = candidates_info[c]
            if info["scores"]["BUYER"] > best_buyer_score:
                best_buyer_score = info["scores"]["BUYER"]
                buyer_gstin = c
        if best_buyer_score <= 0.0:
            buyer_gstin = ""

        # Consignee
        consignee_gstin = ""
        best_consignee_score = -1.0
        for c in remaining:
            if c == buyer_gstin and len(remaining) > 1:
                continue
            info = candidates_info[c]
            if info["scores"]["CONSIGNEE"] > best_consignee_score:
                best_consignee_score = info["scores"]["CONSIGNEE"]
                consignee_gstin = c
        if best_consignee_score <= 0.0:
            consignee_gstin = ""

        # Fallback to registered vendor GSTIN if not resolved from text
        if not vendor_gstin and registered_vendor_gstins:
            vendor_gstin = registered_vendor_gstins[0]

        # Helper to get the best raw value for a canonical GSTIN
        def get_raw_value(canon_val: str, ext_val: str) -> str:
            if not canon_val:
                return ""
            if canon_val in candidates_info and candidates_info[canon_val]["raw_values"]:
                # Prefer the one with spaces or closer to the text
                return list(candidates_info[canon_val]["raw_values"])[0]
            return ext_val or canon_val

        raw_vendor_gstin = get_raw_value(vendor_gstin, ext_gstin)
        raw_buyer_gstin = get_raw_value(buyer_gstin, ext_buyer)
        raw_consignee_gstin = get_raw_value(consignee_gstin, ext_consignee)

        result = {
            "vendor_gstin": vendor_gstin,
            "buyer_gstin": buyer_gstin,
            "consignee_gstin": consignee_gstin,
            "ship_to_gstin": consignee_gstin,
            "bill_to_gstin": buyer_gstin,
            
            "raw_vendor_gstin": raw_vendor_gstin,
            "raw_buyer_gstin": raw_buyer_gstin,
            "raw_consignee_gstin": raw_consignee_gstin,
            
            "canonical_vendor_gstin": vendor_gstin,
            "canonical_buyer_gstin": buyer_gstin,
            "canonical_consignee_gstin": consignee_gstin,
        }

        logger.info(f"[GSTIN_CLASSIFIER_RESULT] tenant_id={tenant_id} result={result}")
        return result
