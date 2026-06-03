import logging
import re
from typing import Dict, Any, List, Tuple
from django.db.models import Q
from inventory.models import InventoryItem
from ocr_pipeline.services.item_identity_repair import repair_item_identity

try:
    from rapidfuzz import fuzz
except ImportError:
    pass

logger = logging.getLogger(__name__)

class CriticalPipelineError(ValueError):
    """Exception raised when critical pipeline contracts or integrity rules are violated."""
    pass

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

    @classmethod
    def _evaluate_candidate(cls, ocr_code: str, ocr_hsn: str, ocr_name_norm: str, ocr_tokens: set, db_item: InventoryItem) -> Tuple[float, str]:
        """
        Evaluates a single inventory candidate against the OCR fields.
        Returns (confidence_score, strategy).
        """
        db_code = getattr(db_item, '_clean_code', '')
        db_hsn = getattr(db_item, '_clean_hsn', '')
        db_name_norm = getattr(db_item, '_norm_name', '')
        db_tokens = getattr(db_item, '_tokens', set())
        
        # 1. EXACT_CANONICAL_MATCH:
        # Check normalized canonical name match or code match
        if (ocr_name_norm and db_name_norm and ocr_name_norm == db_name_norm) or (ocr_code and db_code and ocr_code == db_code):
            return 100.0, "EXACT_CANONICAL_MATCH"
            
        # 2. TOKEN_CANONICAL_MATCH:
        # Token set equality (order-independent)
        if ocr_tokens and db_tokens and ocr_tokens == db_tokens:
            return 95.0, "TOKEN_CANONICAL_MATCH"
            
        # Calculate fuzzy similarity
        sim_score = 0.0
        if ocr_name_norm and db_name_norm:
            sim_score = fuzz.token_set_ratio(ocr_name_norm, db_name_norm)
            
        hsn_exact = (ocr_hsn and db_hsn and ocr_hsn == db_hsn)
        hsn_prefix = False
        if ocr_hsn and db_hsn:
            if ocr_hsn.startswith(db_hsn) or db_hsn.startswith(ocr_hsn):
                hsn_prefix = True
                
        # 3. HSN_NAME_MATCH:
        if (hsn_exact or hsn_prefix) and sim_score >= 90:
            return sim_score, "HSN_NAME_MATCH"
            
        # 4. FUZZY_CANONICAL_MATCH:
        if sim_score >= 85:
            return sim_score, "FUZZY_CANONICAL_MATCH"
            
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
            db_item_repair = repair_item_identity(db_item.item_name)
            db_item._canonical_name = db_item_repair["canonical_name"]
            db_item._norm_name = cls.normalize_string(db_item._canonical_name)
            db_item._clean_code = cls.clean_string(db_item.item_code)
            db_item._clean_hsn = cls.clean_string(db_item.hsn_code)
            db_item._tokens = set(db_item_repair["normalized_tokens"])

        all_matched = True
        items_dto = []
        
        for idx, item in enumerate(items):
            ocr_code_raw = item.get("item_code") or item.get("itemCode") or ""
            ocr_hsn_raw = item.get("hsn_code") or item.get("hsn_sac") or item.get("hsnSac") or ""
            ocr_name_raw = item.get("description") or item.get("itemName") or item.get("item_name") or ""
            
            ocr_code = cls.clean_string(ocr_code_raw)
            ocr_hsn = cls.clean_string(ocr_hsn_raw)
            
            # Phase 1 & 2: Pre-validation item canonicalization
            repair_res = repair_item_identity(ocr_name_raw)
            canonical_name = repair_res["canonical_name"]
            ocr_tokens = set(repair_res["normalized_tokens"])
            ocr_name_norm = cls.normalize_string(canonical_name)
            
            # Rank candidates
            best_match = None
            best_priority = 0
            best_score = 0.0
            best_strategy = "CREATE_ITEM"
            
            # Phase 4: Freeze validation output preservation
            existing_match_id = item.get("inventory_item_id")
            existing_strategy = item.get("inventory_match_strategy")
            existing_canonical = item.get("canonical_name")
            existing_confidence = item.get("inventory_match_confidence")
            
            if existing_match_id is not None and existing_strategy not in (None, "CREATE_ITEM"):
                # Preserve existing matched metadata
                matched_id = existing_match_id
                best_strategy = existing_strategy
                best_score = float(existing_confidence or 100.0)
                canonical_name = existing_canonical or canonical_name
                status = "ALREADY EXIST"
                best_match = next((db for db in tenant_inventory if db.id == matched_id), None)
                logger.info(f"[ITEM_MATCH_FROZEN] tenant_id={tenant_id} item='{ocr_name_raw}' strategy={best_strategy} id={matched_id}")
            else:
                for db_item in tenant_inventory:
                    score, strategy = cls._evaluate_candidate(ocr_code, ocr_hsn, ocr_name_norm, ocr_tokens, db_item)
                    
                    strat_priority = {
                        "EXACT_CANONICAL_MATCH": 5,
                        "TOKEN_CANONICAL_MATCH": 4,
                        "HSN_NAME_MATCH": 3,
                        "FUZZY_CANONICAL_MATCH": 2,
                        "NONE": 0
                    }.get(strategy, 0)
                    
                    if strat_priority > 0:
                        # Deterministic matching strategies precedence (Phase 3)
                        if (strat_priority > best_priority) or (strat_priority == best_priority and score > best_score):
                            best_match = db_item
                            best_priority = strat_priority
                            best_score = score
                            best_strategy = strategy

                if best_match:
                    status = "ALREADY EXIST"
                    matched_id = best_match.id
                else:
                    status = "CREATE ITEM"
                    matched_id = None
                    all_matched = False
                    best_strategy = "CREATE_ITEM"
                    best_score = 0.0

            # Phase 5: Forensic logging for every item
            logger.info(f"[ITEM_IDENTITY_REPAIR] raw='{ocr_name_raw}' canonical='{canonical_name}' repairs={repair_res.get('repair_operations')}")
            logger.info(f"[ITEM_CANONICALIZATION] canonical='{canonical_name}' tokens={list(ocr_tokens)}")
            logger.info(f"[ITEM_MATCH_DECISION] item='{canonical_name}' status={status} matched_id={matched_id}")
            logger.info(f"[ITEM_MATCH_STRATEGY] item='{canonical_name}' strategy={best_strategy} confidence={best_score}")
            logger.info(f"[ITEM_OCR_CORRUPTION] item='{canonical_name}' score={repair_res.get('ocr_corruption_score')}")

            desc = item.get("description") or item.get("item_name") or ""
            item_dto = {
                "line_index": item.get("line_index", idx),
                "item_name": ocr_name_raw or desc or "—", # Display raw name in UI
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
                
                # Frozen fields (Phase 4)
                "canonical_name": canonical_name,
                "inventory_match_confidence": best_score,
                "inventory_match_strategy": best_strategy,
                
                # Keep compatibility
                "normalized_item_name": ocr_name_norm
            }
            # Keep other unknown properties
            for k, v in item.items():
                if k not in item_dto:
                    item_dto[k] = v
                    
            # Phase 6: Hard Assertions in validation output
            if item_dto.get("inventory_item_id") is not None and not item_dto.get("item_status"):
                raise CriticalPipelineError("inventory_item_id exists but item_status is null")
            if item_dto.get("canonical_name") and not item_dto.get("inventory_match_strategy"):
                raise CriticalPipelineError("canonical_name exists but match strategy missing")
                
            items_dto.append(item_dto)

        # Phase 7: Duplicate Item Collapse
        collapsed_items = []
        seen_keys = set()
        for idx, itm in enumerate(items_dto):
            c_name = itm.get("canonical_name") or ""
            qty = float(itm.get("qty") or 0.0)
            tax_val = float(itm.get("taxable_value") or 0.0)
            inv_id = itm.get("inventory_item_id")
            
            key = (c_name.strip().upper(), qty, tax_val, inv_id)
            if key in seen_keys:
                logger.info(
                    f"[DUPLICATE_ITEM_COLLAPSED] Collapsing duplicate item: "
                    f"name='{c_name}' qty={qty} tax_val={tax_val} id={inv_id}"
                )
                continue
            seen_keys.add(key)
            collapsed_items.append(itm)
            
        items_dto = collapsed_items
        
        # Populate missing_items and validation_results from collapsed list
        missing_items = []
        validation_results = []
        for itm in items_dto:
            if itm.get("item_status") == "CREATE ITEM":
                missing_items.append(itm)
            validation_results.append({
                "item_code": itm.get("item_code"),
                "hsn_code": itm.get("hsn_code"),
                "item_name": cls.clean_string(itm.get("item_name")),
                "item_status": itm.get("item_status")
            })

        if not items_dto:
            voucher_status = None
        else:
            has_already_exist = any(i.get("item_status") in ("ALREADY EXIST", "ALREADY_EXIST") for i in items_dto)
            has_create_item = any(i.get("item_status") in ("CREATE ITEM", "CREATE_ITEM") for i in items_dto)
            if has_already_exist and has_create_item:
                voucher_status = "PARTIAL"
            elif has_create_item:
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
