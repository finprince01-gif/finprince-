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
        
        # Split into tokens by whitespace, normalize each token using classifier
        from ocr_pipeline.services.item_identity_repair import classify_token
        
        tokens = s.split()
        normalized_tokens = []
        for token in tokens:
            token_type = classify_token(token)
            norm_token = token
            if token_type == "INDUSTRIAL":
                # Apply numeric substitutions
                norm_token = norm_token.replace("O", "0")
                norm_token = norm_token.replace("L", "1")
                norm_token = norm_token.replace("I", "1")
                norm_token = norm_token.replace("S", "5")
                norm_token = norm_token.replace("Z", "2")
            
            norm_token = norm_token.replace("RN", "M")
            logger.info(f"[SAFE_NORMALIZATION_BOUNDARY] Token='{token}' Type='{token_type}' Raw='{token}' Normalized='{norm_token}'")
            normalized_tokens.append(norm_token)
            
        s = " ".join(normalized_tokens)
        
        # Punctuation and symbol cleanup
        s = re.sub(r'[^A-Z0-9\s]', ' ', s)
        
        # Collapse whitespace
        s = " ".join(s.split())
        return s

    @classmethod
    def _evaluate_candidate_fields(cls, ocr_code: str, ocr_hsn: str, ocr_name_norm: str, ocr_tokens: set, 
                                   cand_code: str, cand_hsn: str, cand_name_norm: str, cand_tokens: set) -> Tuple[float, str]:
        """
        Evaluates candidate fields against the OCR fields.
        Returns (confidence_score, strategy).
        """
        # 1. EXACT_CANONICAL_MATCH:
        # Check normalized canonical name match or code match
        if (ocr_name_norm and cand_name_norm and ocr_name_norm == cand_name_norm) or (ocr_code and cand_code and ocr_code == cand_code):
            return 100.0, "EXACT_CANONICAL_MATCH"
            
        # 2. TOKEN_CANONICAL_MATCH:
        # Token set equality (order-independent)
        if ocr_tokens and cand_tokens and ocr_tokens == cand_tokens:
            return 95.0, "TOKEN_CANONICAL_MATCH"
            
        # Calculate fuzzy similarity
        sim_score = 0.0
        if ocr_name_norm and cand_name_norm:
            sim_score = fuzz.token_set_ratio(ocr_name_norm, cand_name_norm)
            
        hsn_exact = (ocr_hsn and cand_hsn and ocr_hsn == cand_hsn)
        hsn_prefix = False
        if ocr_hsn and cand_hsn:
            if ocr_hsn.startswith(cand_hsn) or cand_hsn.startswith(ocr_hsn):
                hsn_prefix = True
                
        # 3. HSN_NAME_MATCH:
        if (hsn_exact or hsn_prefix) and sim_score >= 90:
            return sim_score, "HSN_NAME_MATCH"
            
        # 4. FUZZY_CANONICAL_MATCH:
        if sim_score >= 85:
            return sim_score, "FUZZY_CANONICAL_MATCH"
            
        return sim_score, "NONE"

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
        return cls._evaluate_candidate_fields(ocr_code, ocr_hsn, ocr_name_norm, ocr_tokens, db_code, db_hsn, db_name_norm, db_tokens)

    @classmethod
    def validate_items(cls, tenant_id: str, items: List[Dict[str, Any]], vendor_id: Any = None, vendor_gstin: Any = None, record: Any = None) -> Dict[str, Any]:
        """
        Validates extracted line items against the Inventory Master using intelligent item matching
        and a 3-level hierarchical validation engine.
        """
        logger.info(f"[INVENTORY_VAL_START] tenant_id={tenant_id} items_count={len(items)} vendor_id={vendor_id} vendor_gstin={vendor_gstin}")
        
        if not items:
            logger.warning(f"[INVENTORY_VAL_EMPTY_ITEMS] No items provided for validation under tenant_id={tenant_id}")
            return {
                "item_status": None,
                "missing_items": [],
                "validation_results": [],
                "items": []
            }

        # Extract vendor_id or vendor_gstin from items if not provided
        if not vendor_id:
            for item in items:
                v_id = item.get("vendor_id") or item.get("vendor_basic_detail_id") or item.get("vendorBasicDetailId")
                if v_id:
                    vendor_id = v_id
                    break
        if not vendor_gstin:
            for item in items:
                v_gst = item.get("vendor_gstin") or item.get("gstin") or item.get("vendorGstin")
                if v_gst:
                    vendor_gstin = v_gst
                    break

        vendor_ids = set()
        if vendor_id:
            try:
                vendor_ids.add(int(vendor_id))
            except (ValueError, TypeError):
                vendor_ids.add(vendor_id)
        if vendor_gstin:
            try:
                from vendors.models import VendorMasterGSTDetails
                matched_gsts = VendorMasterGSTDetails.objects.filter(tenant_id=tenant_id, gstin__iexact=str(vendor_gstin).strip())
                for gst in matched_gsts:
                    if gst.vendor_basic_detail_id:
                        vendor_ids.add(gst.vendor_basic_detail_id)
            except Exception as e_gst:
                logger.error(f"[VENDOR_GST_RESOLVE_FAILED] gstin={vendor_gstin} error={e_gst}")

        po_items = []
        vp_items = []
        mapping_items = []

        if vendor_ids:
            # 1. Fetch Vendor PO History Items
            try:
                from vendors.models import VendorTransactionPOItem
                po_items = list(VendorTransactionPOItem.objects.filter(
                    tenant_id=tenant_id,
                    po__vendor_basic_detail_id__in=vendor_ids,
                    po__status__in=['Approved', 'Closed'],
                    is_active=True
                ).select_related('po'))
            except Exception as e_po:
                logger.error(f"[HISTORY_FETCH_PO_FAILED] tenant_id={tenant_id} error={e_po}")

            try:
                from accounting.models_voucher_purchase import VoucherPurchaseItem
                vp_items = list(VoucherPurchaseItem.objects.filter(
                    tenant_id=tenant_id,
                    supplier_details__vendor_basic_detail_id__in=vendor_ids
                ).select_related('supplier_details'))
            except Exception as e_vp:
                logger.error(f"[HISTORY_FETCH_VOUCHER_FAILED] tenant_id={tenant_id} error={e_vp}")

            # 2. Fetch Vendor Product/Service Mapping
            try:
                from vendors.vendorproduct_database import VendorProductServiceDatabase
                for v_id in vendor_ids:
                    mapping_res = VendorProductServiceDatabase.get_by_vendor(v_id)
                    if mapping_res and mapping_res.get('items'):
                        mapping_items.extend(mapping_res['items'])
            except Exception as e_map:
                logger.error(f"[MAPPING_FETCH_FAILED] tenant_id={tenant_id} error={e_map}")
        
        # Fallback to query voucher purchase items by gstin if vendor_ids set is empty but vendor_gstin is provided
        if not vendor_ids and vendor_gstin:
            try:
                from accounting.models_voucher_purchase import VoucherPurchaseItem
                vp_items = list(VoucherPurchaseItem.objects.filter(
                    tenant_id=tenant_id,
                    supplier_details__gstin__iexact=str(vendor_gstin).strip()
                ).select_related('supplier_details'))
            except Exception as e_vp:
                logger.error(f"[HISTORY_FETCH_VOUCHER_GSTIN_FAILED] tenant_id={tenant_id} error={e_vp}")
            
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

        # Build lookup tables for fast resolution of history/mapping items to InventoryItem
        inventory_by_code = {}
        inventory_by_name = {}
        inventory_by_norm_name = {}
        
        for db_item in tenant_inventory:
            if db_item._clean_code:
                inventory_by_code[db_item._clean_code] = db_item
            name_cleaned = cls.clean_string(db_item.item_name)
            if name_cleaned:
                inventory_by_name[name_cleaned] = db_item
            if db_item._norm_name:
                inventory_by_norm_name[db_item._norm_name] = db_item

        def resolve_to_inventory(cand_code, cand_supp_code, cand_name):
            # 1. Exact code
            c_code = cls.clean_string(cand_code)
            if c_code and c_code in inventory_by_code:
                return inventory_by_code[c_code]
            # 2. Supplier code
            s_code = cls.clean_string(cand_supp_code)
            if s_code and s_code in inventory_by_code:
                return inventory_by_code[s_code]
            # 3. Exact name
            c_name = cls.clean_string(cand_name)
            if c_name and c_name in inventory_by_name:
                return inventory_by_name[c_name]
            # 4. Normalized name
            cand_name_norm = cls.normalize_string(repair_item_identity(cand_name)["canonical_name"])
            if cand_name_norm and cand_name_norm in inventory_by_norm_name:
                return inventory_by_norm_name[cand_name_norm]
            return None

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
            
            # Rank candidates using Waterfall logic
            computed_match = None
            computed_score = 0.0
            computed_strategy = "CREATE_ITEM"
            computed_match_level = "New"

            # ── MANUAL MATCH BYPASS ──────────────────────────────────────────────────
            # If a user has manually linked this item to an inventory master record,
            # preserve their choice unconditionally. Vendor mapping is NOT required.
            if item.get("match_source") == "MANUAL_MATCH" and item.get("inventory_item_id"):
                manual_inv_id = item["inventory_item_id"]
                manual_name = item.get("matched_item_name") or item.get("canonical_name") or ocr_name_raw
                try:
                    manual_db_item = InventoryItem.objects.filter(id=int(manual_inv_id), tenant_id=tenant_id).first()
                except Exception:
                    manual_db_item = None
                if manual_db_item:
                    logger.info(
                        f"[MANUAL_MATCH_PRESERVED] item='{ocr_name_raw}' → "
                        f"inventory_item_id={manual_inv_id} name='{manual_db_item.item_name}'"
                    )
                    item_dto = {
                        "line_index": item.get("line_index", idx),
                        "item_name": ocr_name_raw or "—",
                        "item_code": item.get("item_code") or item.get("itemCode") or "",
                        "description": item.get("description") or ocr_name_raw or "",
                        "hsn_code": item.get("hsn_code") or item.get("hsn_sac") or item.get("hsnSac") or "",
                        "qty": item.get("qty") or item.get("quantity") or 0.0,
                        "uom": item.get("uom") or "nos",
                        "rate": item.get("rate") or item.get("itemRate") or 0.0,
                        "cgst_rate": item.get("cgst_rate") or item.get("cgst") or 0.0,
                        "sgst_rate": item.get("sgst_rate") or item.get("sgst") or 0.0,
                        "igst_rate": item.get("igst_rate") or item.get("igst") or 0.0,
                        "cess_rate": item.get("cess_rate") or item.get("cess") or 0.0,
                        "computed_gst_rate": item.get("computed_gst_rate") or item.get("gst_rate") or 0.0,
                        "taxable_value": item.get("taxable_value") or item.get("taxableValue") or item.get("amount") or 0.0,
                        "item_status": "ALREADY EXIST",
                        "inventory_item_id": manual_db_item.id,
                        "inventory_match_level": "MANUAL_MATCH",
                        "canonical_name": manual_db_item.item_name,
                        "matched_item_name": manual_db_item.item_name,
                        "match_source": "MANUAL_MATCH",
                        "inventory_match_confidence": 100.0,
                        "inventory_match_strategy": "MANUAL_MATCH",
                        "normalized_item_name": ocr_name_norm,
                    }
                    for k, v in item.items():
                        if k not in item_dto:
                            item_dto[k] = v
                    items_dto.append(item_dto)
                    continue  # Skip waterfall for this item
                else:
                    logger.warning(
                        f"[MANUAL_MATCH_ITEM_MISSING] inventory_item_id={manual_inv_id} "
                        f"not found in tenant={tenant_id}. Falling back to waterfall."
                    )
            # ── END MANUAL MATCH BYPASS ──────────────────────────────────────────────

            # --- LEVEL 1: PO History Match ---
            hist_best_match = None
            hist_best_score = 0.0
            hist_best_strategy = "NONE"
            hist_priority = 0
            
            for hist_item in (po_items + vp_items):
                cand_code = getattr(hist_item, 'item_code', '')
                cand_supp_code = getattr(hist_item, 'supplier_item_code', '')
                cand_name = getattr(hist_item, 'item_name', '')
                
                resolved_inv = resolve_to_inventory(cand_code, cand_supp_code, cand_name)
                if not resolved_inv:
                    continue
                
                cand_name_norm = cls.normalize_string(repair_item_identity(cand_name)["canonical_name"])
                cand_tokens = set(repair_item_identity(cand_name)["normalized_tokens"])
                cand_hsn = cls.clean_string(getattr(hist_item, 'hsn_sac', getattr(hist_item, 'hsn_code', '')))
                
                # Evaluate against canonical fields
                score1, strategy1 = cls._evaluate_candidate_fields(
                    ocr_code, ocr_hsn, ocr_name_norm, ocr_tokens,
                    cls.clean_string(cand_code), cand_hsn, cand_name_norm, cand_tokens
                )
                
                # Also evaluate against supplier/vendor fields if present in history
                score2, strategy2 = 0.0, "NONE"
                cand_supp_name = getattr(hist_item, 'supplier_item_name', '')
                if cand_supp_name or cand_supp_code:
                    supp_name_norm = cls.normalize_string(repair_item_identity(cand_supp_name)["canonical_name"]) if cand_supp_name else ""
                    supp_tokens = set(repair_item_identity(cand_supp_name)["normalized_tokens"]) if cand_supp_name else set()
                    score2, strategy2 = cls._evaluate_candidate_fields(
                        ocr_code, ocr_hsn, ocr_name_norm, ocr_tokens,
                        cls.clean_string(cand_supp_code), cand_hsn, supp_name_norm, supp_tokens
                    )
                
                if score1 >= score2:
                    score, strategy = score1, strategy1
                else:
                    score, strategy = score2, strategy2
                
                strat_priority = {
                    "EXACT_CANONICAL_MATCH": 5,
                    "TOKEN_CANONICAL_MATCH": 4,
                    "HSN_NAME_MATCH": 3,
                    "FUZZY_CANONICAL_MATCH": 2,
                    "NONE": 0
                }.get(strategy, 0)
                
                if strat_priority > 0:
                    if (strat_priority > hist_priority) or (strat_priority == hist_priority and score > hist_best_score):
                        hist_best_match = resolved_inv
                        hist_priority = strat_priority
                        hist_best_score = score
                        hist_best_strategy = strategy
            
            if hist_best_match:
                computed_match = hist_best_match
                computed_score = hist_best_score
                computed_strategy = hist_best_strategy
                computed_match_level = "History"
                
            # --- LEVEL 2: Vendor Product/Service Mapping Match ---
            if not computed_match:
                map_best_match = None
                map_best_score = 0.0
                map_best_strategy = "NONE"
                map_priority = 0
                
                for mapped_item in mapping_items:
                    # Resolve to inventory using the target/canonical mapping
                    resolved_inv = resolve_to_inventory(mapped_item.get('item_code'), '', mapped_item.get('item_name'))
                    if not resolved_inv:
                        continue
                    
                    # Evaluate against supplier representation (what the vendor calls it)
                    cand_name = mapped_item.get('supplier_item_name') or mapped_item.get('item_name') or ''
                    cand_code = mapped_item.get('supplier_item_code') or mapped_item.get('item_code') or ''
                    
                    cand_name_norm = cls.normalize_string(repair_item_identity(cand_name)["canonical_name"])
                    cand_tokens = set(repair_item_identity(cand_name)["normalized_tokens"])
                    cand_hsn = cls.clean_string(mapped_item.get('hsn_sac_code', ''))
                    
                    score1, strategy1 = cls._evaluate_candidate_fields(
                        ocr_code, ocr_hsn, ocr_name_norm, ocr_tokens,
                        cls.clean_string(cand_code), cand_hsn, cand_name_norm, cand_tokens
                    )
                    
                    # Also evaluate against canonical representation if it is different
                    score2, strategy2 = 0.0, "NONE"
                    canon_name = mapped_item.get('item_name', '')
                    canon_code = mapped_item.get('item_code', '')
                    if canon_name != cand_name or canon_code != cand_code:
                        canon_name_norm = cls.normalize_string(repair_item_identity(canon_name)["canonical_name"])
                        canon_tokens = set(repair_item_identity(canon_name)["normalized_tokens"])
                        score2, strategy2 = cls._evaluate_candidate_fields(
                            ocr_code, ocr_hsn, ocr_name_norm, ocr_tokens,
                            cls.clean_string(canon_code), cand_hsn, canon_name_norm, canon_tokens
                        )
                        
                    if score1 >= score2:
                        score, strategy = score1, strategy1
                    else:
                        score, strategy = score2, strategy2
                    
                    strat_priority = {
                        "EXACT_CANONICAL_MATCH": 5,
                        "TOKEN_CANONICAL_MATCH": 4,
                        "HSN_NAME_MATCH": 3,
                        "FUZZY_CANONICAL_MATCH": 2,
                        "NONE": 0
                    }.get(strategy, 0)
                    
                    if strat_priority > 0:
                        if (strat_priority > map_priority) or (strat_priority == map_priority and score > map_best_score):
                            map_best_match = resolved_inv
                            map_priority = strat_priority
                            map_best_score = score
                            map_best_strategy = strategy
                
                if map_best_match:
                    computed_match = map_best_match
                    computed_score = map_best_score
                    computed_strategy = map_best_strategy
                    computed_match_level = "Mapping"
            
            # --- LEVEL 3: Inventory Master Match ---
            if not computed_match:
                master_best_match = None
                master_best_score = 0.0
                master_best_strategy = "NONE"
                master_priority = 0
                
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
                        if (strat_priority > master_priority) or (strat_priority == master_priority and score > master_best_score):
                            master_best_match = db_item
                            master_priority = strat_priority
                            master_best_score = score
                            master_best_strategy = strategy
                
                if master_best_match:
                    computed_match = master_best_match
                    computed_score = master_best_score
                    computed_strategy = master_best_strategy
                    computed_match_level = "Master"
            
            if computed_match:
                computed_status = "ALREADY EXIST"
                computed_matched_id = computed_match.id
            else:
                computed_status = "CREATE ITEM"
                computed_matched_id = None
                computed_strategy = "CREATE_ITEM"
                computed_score = 0.0
                computed_match_level = "New"

            # Phase 4: Freeze validation output preservation
            existing_match_id = item.get("inventory_item_id")
            existing_strategy = item.get("inventory_match_strategy")
            existing_canonical = item.get("canonical_name")
            existing_confidence = item.get("inventory_match_confidence")
            existing_match_level = item.get("inventory_match_level")
            
            is_frozen = (item.get("is_canonical_frozen") == True or item.get("_is_canonical_frozen") == True)
            
            if is_frozen and record:
                is_voucher_created = bool(record.voucher_id or record.validation_status == 'VOUCHER_CREATED')
                if not is_voucher_created:
                    is_frozen = False
            
            if is_frozen:
                # Check for mutation on frozen item
                existing_conf_val = float(existing_confidence) if existing_confidence is not None else 0.0
                strategy_mutated = (existing_strategy != computed_strategy)
                identity_mutated = (existing_match_id != computed_matched_id)
                confidence_mutated = (existing_conf_val != float(computed_score))
                
                if strategy_mutated or identity_mutated or confidence_mutated:
                    logger.error(f"[IMMUTABILITY_ENFORCED] Attempted mutation on frozen item='{ocr_name_raw}'")
                    raise CriticalPipelineError(
                        f"Attempted mutation on frozen item='{ocr_name_raw}': "
                        f"strategy: {existing_strategy} -> {computed_strategy}, "
                        f"identity: {existing_match_id} -> {computed_matched_id}, "
                        f"confidence: {existing_confidence} -> {computed_score}"
                    )
                
                matched_id = existing_match_id
                best_strategy = existing_strategy
                best_score = float(existing_confidence or 100.0)
                canonical_name = existing_canonical or canonical_name
                status = "ALREADY EXIST" if matched_id else "CREATE ITEM"
                best_match_level = existing_match_level or computed_match_level
            else:
                # Non-frozen path
                matched_id = computed_matched_id
                best_strategy = computed_strategy
                best_score = computed_score
                status = computed_status
                best_match_level = computed_match_level

            # Phase 5: Forensic logging for every item
            logger.info(f"[ITEM_IDENTITY_REPAIR] raw='{ocr_name_raw}' canonical='{canonical_name}' repairs={repair_res.get('repair_operations')}")
            logger.info(f"[ITEM_CANONICALIZATION] canonical='{canonical_name}' tokens={list(ocr_tokens)}")
            logger.info(f"[ITEM_MATCH_DECISION] item='{canonical_name}' status={status} matched_id={matched_id}")
            logger.info(f"[ITEM_MATCH_STRATEGY] item='{canonical_name}' strategy={best_strategy} confidence={best_score}")
            logger.info(f"[ITEM_OCR_CORRUPTION] item='{canonical_name}' score={repair_res.get('ocr_corruption_score')}")
            
            # ITEM_MATCH_TRACE_REPORT logging
            logger.info(
                f"[ITEM_MATCH_TRACE_REPORT] "
                f"item_name='{ocr_name_raw}' "
                f"resolved_level='{best_match_level}' "
                f"matched_item_id={matched_id} "
                f"strategy='{best_strategy}' "
                f"confidence={best_score}"
            )

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
                "inventory_match_level": best_match_level,
                
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
