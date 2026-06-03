import logging
import re
from typing import Dict, Any, List, Tuple
from django.db.models import Q
from inventory.models import InventoryItem

try:
    from rapidfuzz import fuzz
except ImportError:
    pass

logger = logging.getLogger(__name__)

class InventoryItemValidationService:
    @staticmethod
    def clean_string(val: Any) -> str:
        if val is None:
            return ""
        s = str(val).strip().upper()
        return " ".join(s.split())

    @staticmethod
    def normalize_string(val: Any) -> str:
        """
        Canonical item-name normalization.
        Handles uppercase, OCR variations, and whitespace cleanup.
        """
        if not val:
            return ""
        s = str(val).strip().upper()
        
        # OCR character substitutions
        s = s.replace("O", "0")
        s = s.replace("L", "1")
        s = s.replace("I", "1")
        s = s.replace("RN", "M")
        
        # Punctuation and symbol cleanup
        s = re.sub(r'[^A-Z0-9\s]', ' ', s)
        
        # Collapse whitespace
        s = " ".join(s.split())
        return s

    @staticmethod
    def _evaluate_candidate(ocr_code: str, ocr_hsn: str, ocr_name_norm: str, db_item: InventoryItem) -> Tuple[float, str]:
        """
        Evaluates a single inventory candidate against the OCR fields.
        Returns (confidence_score, strategy).
        """
        db_code = getattr(db_item, '_clean_code', '')
        db_hsn = getattr(db_item, '_clean_hsn', '')
        db_name_norm = getattr(db_item, '_norm_name', '')
        
        # Exact item_code match
        if ocr_code and db_code and ocr_code == db_code:
            return 100.0, "EXACT_ITEM_CODE"
            
        # If no name provided, we can't do name matches
        if not ocr_name_norm or not db_name_norm:
            return 0.0, "NONE"
            
        # Calculate fuzzy similarity
        sim_score = fuzz.token_set_ratio(ocr_name_norm, db_name_norm)
        
        hsn_exact = (ocr_hsn and db_hsn and ocr_hsn == db_hsn)
        hsn_prefix = False
        if ocr_hsn and db_hsn:
            if ocr_hsn.startswith(db_hsn) or db_hsn.startswith(ocr_hsn):
                hsn_prefix = True

        if sim_score >= 95 and hsn_exact:
            return sim_score, "NAME_HSN_MATCH"
            
        if sim_score >= 90 and hsn_prefix:
            return sim_score, "FUZZY_NAME_HSN_MATCH"
            
        if sim_score >= 92:
            return sim_score, "FUZZY_NAME_MATCH"
            
        # Weak HSN fallback match
        if sim_score >= 80 and hsn_exact:
            return sim_score, "HSN_WEAK_MATCH"
            
        return sim_score, "NONE"

    @classmethod
    def validate_items(cls, tenant_id: str, items: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Validates extracted line items against the Inventory Master using intelligent item matching.
        """
        logger.info(f"[INVENTORY_VAL_START] tenant_id={tenant_id} items_count={len(items)}")
        
        if not items:
            logger.warning(f"[INVENTORY_VAL_EMPTY_ITEMS] No items provided for validation under tenant_id={tenant_id}")
            return {
                "item_status": None,
                "missing_items": [],
                "validation_results": [],
                "items": []
            }
            
        # Fetch all inventory items for this tenant to allow fuzzy matching
        tenant_inventory = list(InventoryItem.objects.filter(tenant_id=tenant_id))
        logger.info(f"[INVENTORY_FETCH] tenant_id={tenant_id} db_items_count={len(tenant_inventory)}")
        
        # Pre-compute normalization for db items
        for db_item in tenant_inventory:
            db_item._norm_name = cls.normalize_string(db_item.item_name)
            db_item._clean_code = cls.clean_string(db_item.item_code)
            db_item._clean_hsn = cls.clean_string(db_item.hsn_code)

        all_matched = True
        validation_results = []
        missing_items = []
        items_dto = []
        
        for idx, item in enumerate(items):
            ocr_code_raw = item.get("item_code") or item.get("itemCode") or ""
            ocr_hsn_raw = item.get("hsn_code") or item.get("hsn_sac") or item.get("hsnSac") or ""
            ocr_name_raw = item.get("description") or item.get("itemName") or item.get("item_name") or ""
            
            ocr_code = cls.clean_string(ocr_code_raw)
            ocr_hsn = cls.clean_string(ocr_hsn_raw)
            ocr_name_norm = cls.normalize_string(ocr_name_raw)
            
            # Rank candidates
            best_match = None
            best_score = 0.0
            best_strategy = "CREATE_ITEM"
            
            for db_item in tenant_inventory:
                score, strategy = cls._evaluate_candidate(ocr_code, ocr_hsn, ocr_name_norm, db_item)
                
                if strategy != "NONE" and score >= best_score:
                    if strategy == "EXACT_ITEM_CODE":
                        best_match = db_item
                        best_score = 100.0
                        best_strategy = strategy
                        break # Short circuit on exact code
                    
                    if score > best_score:
                        best_match = db_item
                        best_score = score
                        best_strategy = strategy

            if best_match:
                status = "ALREADY EXIST"
                matched_id = best_match.id
                logger.info(
                    f"\n[INVENTORY_MATCH_FOUND]\n"
                    f"OCR Item: name='{ocr_name_raw}' code='{ocr_code}' hsn='{ocr_hsn}'\n"
                    f"Matched DB Item: id={matched_id} name='{best_match.item_name}' code='{best_match.item_code}' hsn='{best_match.hsn_code}'\n"
                    f"Strategy: {best_strategy} | Score: {best_score:.2f}\n"
                    f"OCR Normalized: '{cls.normalize_string(ocr_name_raw)}'\n"
                    f"DB Normalized: '{cls.normalize_string(best_match.item_name)}'"
                )
            else:
                status = "CREATE ITEM"
                matched_id = None
                all_matched = False
                best_strategy = "CREATE_ITEM"
                best_score = 0.0
                logger.info(
                    f"\n[INVENTORY_MATCH_FAILED]\n"
                    f"OCR Item: name='{ocr_name_raw}' code='{ocr_code}' hsn='{ocr_hsn}'\n"
                    f"Normalized: '{cls.normalize_string(ocr_name_raw)}'\n"
                    f"Result: {status}"
                )
                
            desc = item.get("description") or item.get("item_name") or ""
            item_dto = {
                "line_index": item.get("line_index", idx),
                "item_name": item.get("item_name") or item.get("itemName") or desc or "—",
                "item_code": item.get("item_code") or item.get("itemCode") or "",
                "description": desc,
                "hsn_code": item.get("hsn_code") or item.get("hsn_sac") or item.get("hsnSac") or "",
                "qty": item.get("qty") or item.get("quantity") or 0.0,
                "uom": item.get("uom") or "nos",
                "rate": item.get("rate") or item.get("itemRate") or 0.0,
                "cgst_rate": item.get("cgst_rate") or item.get("cgst") or 0.0,
                "sgst_rate": item.get("sgst_rate") or item.get("sgst") or 0.0,
                "igst_rate": item.get("igst_rate") or item.get("igst") or 0.0,
                "cess_rate": item.get("cess_rate") or item.get("cess") or 0.0,
                "computed_gst_rate": item.get("computed_gst_rate") or item.get("gstRate") or item.get("gst_rate") or 0.0,
                "taxable_value": item.get("taxable_value") or item.get("taxableValue") or item.get("amount") or 0.0,
                "item_status": status,
                "inventory_item_id": matched_id,
                # Metadata persistence (Phase 9)
                "normalized_item_name": cls.normalize_string(ocr_name_raw),
                "inventory_match_confidence": best_score,
                "inventory_match_strategy": best_strategy
            }
            # Also keep any other unknown properties that might be present
            for k, v in item.items():
                if k not in item_dto:
                    item_dto[k] = v
                    
            items_dto.append(item_dto)
            
            if status == "CREATE ITEM":
                missing_items.append(item_dto)
                
            validation_results.append({
                "item_code": ocr_code,
                "hsn_code": ocr_hsn,
                "item_name": cls.clean_string(ocr_name_raw),
                "item_status": status
            })

        if not items_dto:
            logger.critical(f"[CRITICAL_PIPELINE_ERROR] Empty/missing items on validation for tenant {tenant_id}")
            raise ValueError("CRITICAL: Missing canonical items on validation")
        else:
            has_create_item = any(i.get("item_status") in ("CREATE ITEM", "CREATE_ITEM") for i in items_dto)
            if has_create_item:
                voucher_status = "CREATE ITEM"
            else:
                voucher_status = "ALREADY EXIST"
        
        logger.info(
            f"[INVENTORY_VAL_COMPLETE] tenant_id={tenant_id} "
            f"voucher_status={voucher_status} missing_count={len(missing_items)}"
        )
        
        return {
            "item_status": voucher_status,
            "missing_items": missing_items,
            "validation_results": validation_results,
            "items": items_dto
        }
