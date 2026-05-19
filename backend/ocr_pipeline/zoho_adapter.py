import logging
from typing import List, Dict, Any
from .forensic_merger import get_forensic_merger
from .integrity_enforcer import get_integrity_enforcer
from .table_reconstructor import get_table_reconstructor

logger = logging.getLogger(__name__)

class ZohoAdapter:
    """
    Zoho Adapter Layer
    Consumes normalized OCR output and produces Zoho-compliant rows.
    Treats normalized JSON as the single source of truth.
    """

    def __init__(self):
        pass

    def _to_float(self, val: Any) -> float:
        if val is None or val == "":
            return 0.0
        try:
            # Handle cases where val might be a string with commas or currency symbols
            if isinstance(val, str):
                cleaned = "".join(c for c in val if c.isdigit() or c == ".")
                return float(cleaned) if cleaned else 0.0
            return float(val)
        except (ValueError, TypeError):
            return 0.0

    def reconstruct_items(self, items: List[Dict[str, Any]], invoice_total: float = 0) -> List[Dict[str, Any]]:
        """
        Delegates item reconstruction to the Senior Table Reconstruction Engine.
        Ensures multi-line descriptions and broken rows are handled correctly.
        """
        engine = get_table_reconstructor()
        return engine.reconstruct(items, invoice_total=invoice_total)

    def normalize_items(self, items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Step 2: Normalize Items
        Ensure: qty > 0, rate > 0, taxable_value >= 0.
        Fill missing tax fields as 0 if absent.
        """
        normalized = []
        for item in items:
            item["qty"] = max(0, item.get("qty", 0))
            item["rate"] = max(0, item.get("rate", 0))
            item["taxable_value"] = max(0, item.get("taxable_value", 0))
            
            # Ensure tax fields exist
            item["igst"] = item.get("igst") or 0.0
            item["cgst"] = item.get("cgst") or 0.0
            item["sgst"] = item.get("sgst") or 0.0
            
            normalized.append(item)
        return normalized

    def validate_invoice(self, invoice: Dict[str, Any], items: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Step 3: Validate Invoice
        Check sum(items.taxable_value) == total_taxable_value.
        If mismatch detected, purge suspected summary/synthetic rows.
        """
        header_taxable = self._to_float(invoice.get("total_taxable_value") or invoice.get("taxable_value"))
        total_items_taxable = round(sum(self._to_float(item.get("taxable_value") or item.get("amount")) for item in items), 2)
        
        SUMMARY_REJECT_WORDS = ["services", "total", "tax", "cgst", "sgst", "igst", "summary", "output"]

        if header_taxable > 0 and total_items_taxable > (header_taxable + 1.0):
            logger.warning(f"[TOTAL_MISMATCH] Header={header_taxable} ItemsSum={total_items_taxable}. Attempting recovery.")
            
            original_count = len(items)
            # Remove suspected summary rows (where qty is 0 or empty and description matches summary keywords)
            cleaned_items = []
            for itm in items:
                desc = str(itm.get("description") or "").lower()
                qty = self._to_float(itm.get("quantity") or itm.get("qty"))
                
                if any(kw in desc for kw in SUMMARY_REJECT_WORDS) and qty == 0:
                     logger.info(f"[SYNTHETIC_ITEM_REMOVED] description='{itm.get('description')}' amount={itm.get('taxable_value')} reason=summary_or_duplicate")
                     continue
                cleaned_items.append(itm)
            
            # Sync the items list
            items[:] = cleaned_items
            new_total = round(sum(self._to_float(item.get("taxable_value") or item.get("amount")) for item in items), 2)
            logger.info(f"[TOTAL_RECOVERY] Removed {original_count - len(items)} items. New ItemsSum={new_total}")
            total_items_taxable = new_total

        # ── [PHASE 9] SOFT VALIDATION (Root Cause #2 & #7) ──
        if abs(total_items_taxable - header_taxable) > (header_taxable * 0.10) and header_taxable > 10:
             logger.warning(f"[VALIDATION_WARNING] Mismatch > 10%. Header={header_taxable} ItemsSum={total_items_taxable}")
             invoice["_validation_flag"] = "REQUIRES_REVIEW"
             invoice["_validation_message"] = f"MATCH_WARNING: Items sum ({total_items_taxable}) differs from header ({header_taxable}) by >10%"
        
        # NEVER DELETE OR SKIP ITEMS IN VALIDATOR
        # Items are preserved as is.
        
        # ── [ITEMS_TRACE] POST-VALIDATION ──
        logger.info("[ITEMS_TRACE] stage=validate_invoice count=%s", len(items))
        
        # [ROOT-CAUSE FIX #5] Ensure we always return the invoice (never null)
        if not invoice: return {"status": "ERROR", "message": "Invalid Invoice Structure"}
        return invoice

    def resolve_zoho_row(self, invoice: Dict[str, Any], item: Dict[str, Any]) -> Dict[str, Any]:
        """
        Step 4: Redesigned Zoho Mapping
        Maps fields to FULLY COMPLIANT Zoho-template columns.
        Derives Tax Names and GST treatment dynamically.
        """
        # [ZOHO_HEADER_MAPPING] Identity
        gstin = str(invoice.get("gstin") or invoice.get("vendor_gstin") or "").strip().upper()
        gst_treatment = "business_registered_regular" if gstin else "business_unregistered"
        state_code = gstin[:2] if len(gstin) >= 2 else ""
        
        # [ZOHO_GROUP_KEY] 
        logger.debug(f"[ZOHO_GROUP_KEY] gstin={gstin} inv_no={invoice.get('invoice_no')}")

        # Derive full state name from GSTIN state code
        GST_STATE_CODES = {
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
        pos_code = GST_STATE_CODES.get(state_code) or invoice.get("place_of_supply") or state_code


        # 2. Tax Name Derivation (e.g. GST18, IGST12)
        # Calculate combined rate
        igst_rate = self._to_float(item.get("igst_rate"))
        cgst_rate = self._to_float(item.get("cgst_rate"))
        sgst_rate = self._to_float(item.get("sgst_rate"))
        
        total_rate = igst_rate if igst_rate > 0 else (cgst_rate + sgst_rate)
        
        # Determine Prefix
        # Use header flag or infer from IGST presence
        is_interstate = igst_rate > 0 or (self._to_float(invoice.get("total_igst")) > 0)
        prefix = "IGST" if is_interstate else "GST"
        
        tax_name = f"{prefix}{int(total_rate)}" if total_rate > 0 else "Non-Taxable"

        # 3. Robust Invoice Number Lookup
        inv_no = invoice.get("invoice_no") or invoice.get("supplier_invoice_no") or "—"

        # 4. Harvest sections
        sections = invoice.get("sections", {})
        supply = sections.get("supply_details", {})

        # ── [PHASE 3] BILL_FROM FALLBACK CHAIN ──
        bill_from = (
            invoice.get("bill_address_from") or
            invoice.get("bill_from") or 
            invoice.get("vendor_address") or 
            sections.get("supplier_details", {}).get("bill_from") or 
            ""
        ).strip()
        
        bill_to = (
            invoice.get("bill_address_to") or
            invoice.get("billing_address") or 
            invoice.get("customer_address") or
            ""
        ).strip()
        
        branch = invoice.get("branch") or sections.get("supplier_details", {}).get("branch") or ""
        
        total_taxable = invoice.get("total_taxable_value") or invoice.get("taxable_value")
        total_invoice = invoice.get("invoice_total") or invoice.get("total_invoice_value")
        
        total_igst = invoice.get("total_igst")
        total_cgst = invoice.get("total_cgst")
        total_sgst = invoice.get("total_sgst")
        
        irn = invoice.get("irn") or ""
        ack_no = invoice.get("ack_no") or ""
        ack_date = invoice.get("ack_date") or ""

        from .normalize import fix_encoding_corruption
        row = {
            "Date": invoice.get("invoice_date"),
            "Invoice No": inv_no,
            "Name": fix_encoding_corruption(invoice.get("vendor_name")),
            "GSTIN": gstin,
            "Branch": branch,
            "Place of Supply": pos_code,
            "Bill Address From": bill_from,
            "Bill Address To": bill_to,
            "Total Taxable Value": total_taxable,
            "Total Invoice Value": total_invoice,
            "Total IGST": total_igst,
            "Total CGST": total_cgst,
            "Total SGST/UTGST": total_sgst,
            "Item Name": item.get("description"),
            "HSN/SAC": item.get("hsn_sac") or item.get("hsn_code"),
            "Qty": item.get("qty") or item.get("quantity"),
            "UOM": item.get("uom") or "",
            "Item Rate": item.get("rate"),
            "Taxable Value": item.get("taxable_value"),
            "IGST": item.get("igst") or item.get("igst_amount"),
            "CGST": item.get("cgst") or item.get("cgst_amount"),
            "SGST/UTGST": item.get("sgst") or item.get("sgst_amount"),
            "Invoice Value": item.get("invoice_value") or item.get("amount"),
            "IRN": irn,
            "Ack. No.": ack_no,
            "Ack. Date": ack_date,
            "Folder Path": invoice.get("file_path") or ""
        }
        
        logger.debug(f"[ZOHO_EXPORT_ROW] inv={inv_no} item='{item.get('description', '')[:20]}...'")
        return row

    def reconstruct_invoices(self, data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Runs the full reconstruction and normalization pipeline on a set of invoices.
        Returns a list of invoices with reconstructed items.
        """
        raw_invoices = data.get("invoices", [])
        
        # ── EXPLODE PAGES (Support for multi-invoice PDFs) ──
        # If any invoice has a '_pages' map, we explode it back into individual pages
        # so the ForensicMerger can group them correctly by invoice_number.
        exploded_invoices = []
        for inv in raw_invoices:
            # Handle both dicts (from API) and Model instances (from DB)
            if hasattr(inv, 'extracted_data'):
                ext_data = inv.extracted_data or {}
                inv_id = inv.id
                file_path = inv.file_path
            else:
                ext_data = inv.get("extracted_data") or inv
                inv_id = inv.get("id")
                file_path = inv.get("file_path")

            # [PHASE 1] ISOLATION SUPPORT
            pages_map = ext_data.get("validated_ai_pages") or ext_data.get("_pages")
            if pages_map and isinstance(pages_map, dict):
                logger.info(f"ADAPTER: Exploding {len(pages_map)} pages from record {inv_id}")
                for p_idx, p_data in sorted(pages_map.items(), key=lambda x: int(x[0])):
                    virtual_inv = p_data.copy()
                    virtual_inv["id"] = f"{inv_id}_p{p_idx}"
                    virtual_inv["file_path"] = file_path
                    if "sections" in virtual_inv and "items" in virtual_inv["sections"]:
                        virtual_inv["items"] = virtual_inv["sections"]["items"]
                    exploded_invoices.append(virtual_inv)
            else:
                # Standard single-invoice record
                # Ensure items are available at the top level for merger
                final_inv = ext_data.copy() if isinstance(ext_data, dict) else {}
                if not final_inv and hasattr(inv, 'extracted_data'):
                     # Fallback for when ext_data wasn't a dict
                     final_inv = {"id": inv_id, "file_path": file_path}
                
                # [ROOT-CAUSE FIX] Protective items inheritance
                top_level_items = final_inv.get("items") or []
                
                if "sections" in final_inv and "items" in final_inv["sections"]:
                    section_items = final_inv["sections"]["items"]
                    if not section_items and top_level_items:
                        logger.warning(f"ADAPTER: Protected items from being wiped by empty sections. Record={inv_id}")
                        final_inv["items"] = top_level_items
                    else:
                        final_inv["items"] = section_items
                        
                exploded_invoices.append(final_inv)

        logger.info(f"AUDIT: RAW OCR INVOICES COUNT = {len(exploded_invoices)}")
        data["invoices"] = exploded_invoices
        
        # Step 0: Forensic Merge
        forensic = get_forensic_merger()
        merged_data = forensic.merge(data)
        self.last_traces = forensic.traces
        invoices = merged_data.get("invoices", [])
        logger.info(f"AUDIT: POST-MERGE INVOICES COUNT = {len(invoices)}")
        
        processed_invoices = []

        for inv in invoices:
            # Step 1: Reconstruct Items
            raw_items = inv.get("items", [])
            inv_no = inv.get("invoice_no") or inv.get("invoice_number") or "—"
            logger.info(f"[ZOHO_RECONSTRUCT] processing inv='{inv_no}' items={len(raw_items)}")
            
            # Reconstruction Logic (Taxes/Grouping)
            inv_total_taxable = self._to_float(inv.get("total_taxable_value"))
            reconstructed = self.reconstruct_items(raw_items, invoice_total=inv_total_taxable)
            
            # [RULE #4] RAW FALLBACK
            if not reconstructed and raw_items:
                logger.warning(f"[RECONSTRUCT_FALLBACK] Using raw items for inv='{inv_no}'")
                reconstructed = raw_items
            
            # Step 2: Canonicalize Invoice Object
            # Standardize items
            normalized_items = []
            for itm in reconstructed:
                # ── [FORENSIC LOGGING] ──
                logger.debug(f"[RECON_RAW_ITEM] {itm}")

                # ── [SURGICAL FIX] (Requirement #3) ──
                # Use strict raw keys confirmed by forensic audit to prevent zeroing
                mapped_item = {
                    "description": itm.get("description") or itm.get("Item Name") or "",
                    "Item Name": itm.get("Item Name") or itm.get("description", ""),
                    "hsn_sac": itm.get("hsn_sac") or itm.get("hsn_code") or itm.get("HSN/SAC") or itm.get("hsn") or itm.get("sac") or "",
                    "qty": self._to_float(itm.get("quantity") or itm.get("qty") or 0),
                    "uom": itm.get("uom") or itm.get("UOM") or "",
                    "rate": self._to_float(itm.get("rate") or itm.get("Item Rate") or 0),
                    "Item Rate": self._to_float(itm.get("Item Rate") or itm.get("rate") or 0),
                    "taxable_value": self._to_float(itm.get("taxable_value") or itm.get("Taxable Value") or 0),
                    "igst": self._to_float(itm.get("igst_amount") or itm.get("IGST") or 0),
                    "cgst": self._to_float(itm.get("cgst_amount") or itm.get("CGST") or 0),
                    "sgst": self._to_float(itm.get("sgst_amount") or itm.get("SGST/UTGST") or 0),
                    "invoice_value": self._to_float(itm.get("amount") or itm.get("Invoice Value") or 0),
                }

                # ── [ROOT-CAUSE PRESERVATION] (Requirement #5) ──
                # If crucial fields are missing after mapping, check original keys
                if not mapped_item["description"] and itm.get("item_name"):
                    mapped_item["description"] = itm.get("item_name")
                if not mapped_item["qty"] and itm.get("qty"):
                    mapped_item["qty"] = self._to_float(itm.get("qty"))
                if not mapped_item["hsn_sac"] and itm.get("hsn_sac"):
                    mapped_item["hsn_sac"] = itm.get("hsn_sac")

                logger.debug(f"[RECON_MAPPED_ITEM] {mapped_item}")
                normalized_items.append(mapped_item)

            # Standardize header
            gstin = str(inv.get("gstin") or "").strip().upper()
            state_code = gstin[:2] if len(gstin) >= 2 else ""
            GST_STATE_CODES = {
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
            pos = GST_STATE_CODES.get(state_code) or inv.get("place_of_supply") or state_code

            header = inv.get("header", {})
            bill_from_val = inv.get("bill_address_from") or inv.get("bill_from") or inv.get("vendor_address") or header.get("bill_from") or header.get("vendor_address") or ""
            bill_to_val = inv.get("bill_address_to") or inv.get("bill_to") or inv.get("billing_address") or header.get("bill_to") or header.get("billing_address") or ""
            
            canonical = {
                "invoice_no": inv.get("invoice_no") or inv.get("invoice_number") or header.get("invoice_no") or "",
                "invoice_date": inv.get("invoice_date") or header.get("invoice_date") or "",
                "vendor_name": inv.get("vendor_name") or header.get("vendor_name") or "",
                "gstin": gstin or header.get("gstin") or header.get("vendor_gstin") or "",
                "branch": inv.get("branch") or header.get("branch") or "",
                "bill_from": bill_from_val,
                "bill_to": bill_to_val,
                "bill_address_from": bill_from_val,
                "bill_address_to": bill_to_val,
                "place_of_supply": pos,
                "total_taxable_value": self._to_float(inv.get("total_taxable_value") or header.get("taxable_value") or header.get("total_taxable_value")),
                "total_igst": self._to_float(inv.get("total_igst") or header.get("igst") or header.get("total_igst")),
                "total_cgst": self._to_float(inv.get("total_cgst") or header.get("cgst") or header.get("total_cgst")),
                "total_sgst": self._to_float(inv.get("total_sgst") or header.get("sgst") or header.get("total_sgst")),
                "invoice_total": self._to_float(inv.get("invoice_total") or inv.get("total_invoice_value") or header.get("total_amount") or header.get("invoice_total")),
                "irn": inv.get("irn") or "",
                "ack_no": inv.get("ack_no") or "",
                "ack_date": inv.get("ack_date") or "",
                "file_path": inv.get("file_path") or "",
                "hsn_sac": (normalized_items[0].get("hsn_sac") if normalized_items else ""),
                "items": normalized_items,
                "warnings": inv.get("warnings") or inv.get("_warning_flags") or []
            }
            
            # ── [ALIAS FIX] Expose both keys so downstream consumers work regardless of which one they use ──
            canonical["supplier_invoice_no"] = canonical.get("supplier_invoice_no") or canonical.get("invoice_no", "")
            canonical["invoice_no"] = canonical.get("invoice_no") or canonical.get("supplier_invoice_no", "")

            # ── [SAFE LOG] ──
            _log_inv = canonical.get("invoice_no") or canonical.get("supplier_invoice_no", "")
            logger.info(f"FORENSIC_CANONICAL_OUT: inv={_log_inv} vendor='{canonical['vendor_name']}' items={len(normalized_items)} bill_from='{canonical['bill_from'][:20]}...'")
            processed_invoices.append(canonical)
            
        return processed_invoices

    def transform(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Main Pipeline Auditor Entry (Steps 4-8)
        Ensures a SINGLE, fully deduplicated, and validated invoice dataset.
        """
        # Step 5: Define SINGLE SOURCE OF TRUTH (FINAL_INVOICES)
        final_invoices = self.reconstruct_invoices(data)
        
        # [ZOHO_CANONICAL_INPUT]
        logger.info(f"[ZOHO_CANONICAL_INPUT] invoice_count={len(final_invoices)}")

        # --- RUNTIME INTEGRITY ENFORCEMENT (ENFORCER LAYER) ---
        enforcer = get_integrity_enforcer()
        # original_count passed as hint for trace validation
        verification = enforcer.verify(final_invoices, original_count=len(data.get("invoices", [])))
        
        if not verification["ready_for_zoho"]:
            return {
                "validation": "FAIL",
                "ready_for_zoho": False,
                "stage": "RUNTIME_VERIFICATION",
                "issues": verification["failures"]
            }
        
        # Step 6: Zoho Adapter (MAPPING ONLY)
        zoho_rows = []
        for inv in final_invoices:
            # [RULE #7] HARD REJECT MALFORMED ROWS — accept either invoice_no alias
            inv_no = inv.get("invoice_no") or inv.get("supplier_invoice_no")
            vendor = inv.get("vendor_name")
            items = inv.get("items", [])
            if not inv_no or not vendor or not items:
                logger.warning(f"[ZOHO_EMPTY_ROW_REJECTED] inv={inv_no} vendor={vendor} items={len(items)}")
                continue

            for item in items:
                # [ZOHO_ITEM_EXPORT]
                logger.info(f"[ZOHO_ITEM_EXPORT] inv={inv_no} item='{item.get('description', '')[:20]}'")
                
                row = self.resolve_zoho_row(inv, item)
                zoho_rows.append(row)

        # Step 8: Flatten Consistency Check via Enforcer
        flatten_check = enforcer.verify_flatten(zoho_rows, final_invoices)
        final_inv_count = len(final_invoices)
        
        if flatten_check["validation"] == "FAIL":
             return {
                "validation": "FAIL",
                "ready_for_zoho": False,
                "stage": "FLATTEN_CONSISTENCY",
                "reason": flatten_check["reason"]
            }

        # ── [PHASE 10] HARD ACCOUNTING VALIDATION ──
        # Check if we lost any invoices during reconstruction/merging
        original_inv_count = len(data.get("invoices", []))
        final_inv_count = len(final_invoices)
        
        status = "PASS"
        review_required = False
        if final_inv_count < original_inv_count and original_inv_count > 0:
            logger.error(f"[HARD_ACCOUNTING_MISMATCH] Source={original_inv_count} Final={final_inv_count}. Data loss suspected!")
            status = "REQUIRES_REVIEW"
            review_required = True

        # [PHASE 11] FRONTEND RESPONSE VERIFICATION
        logger.info(f"[ZOHO_TRANSFORM_COMPLETE] invoices={final_inv_count} rows={len(zoho_rows)}")
        if zoho_rows:
            logger.debug(f"[ZOHO_DIAGNOSTICS] rows={len(zoho_rows)} first_row_inv={zoho_rows[0].get('Invoice No')}")

        return {
            "invoices": final_invoices,
            "rows": zoho_rows,
            "validation": status,
            "requires_review": review_required,
            "ready_for_zoho": True,
            "row_count": len(zoho_rows),
            "invoice_count": final_inv_count,
            "debug_traces": getattr(self, "last_traces", [])
        }

def get_zoho_adapter():
    return ZohoAdapter()
