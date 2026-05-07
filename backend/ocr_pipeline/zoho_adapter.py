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

    def reconstruct_items(self, items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Delegates item reconstruction to the Senior Table Reconstruction Engine.
        Ensures multi-line descriptions and broken rows are handled correctly.
        """
        engine = get_table_reconstructor()
        return engine.reconstruct(items)

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
        Check sum(items.taxable_value) ≈ total_taxable_value.
        Flag mismatch but do not drop.
        """
        total_items_taxable = round(sum(item["taxable_value"] for item in items), 2)
        header_taxable = self._to_float(invoice.get("total_taxable_value"))
        
        if abs(total_items_taxable - header_taxable) > 1.0: # Allow 1.0 margin for rounding
            invoice["_validation_flag"] = "TAXABLE_VALUE_MISMATCH"
            invoice["_validation_message"] = f"Header taxable ({header_taxable}) != Items sum ({total_items_taxable})"
            logger.warning(f"VALIDATION FLAG for Invoice {invoice.get('invoice_number')}: {invoice['_validation_message']}")
        
        return invoice

    def resolve_zoho_row(self, invoice: Dict[str, Any], item: Dict[str, Any]) -> Dict[str, Any]:
        """
        Step 4: Redesigned Zoho Mapping
        Maps fields to FULLY COMPLIANT Zoho-template columns.
        Derives Tax Names and GST treatment dynamically.
        """
        # 1. GST Treatment & State Code
        # Use robust lookup for gstin
        gstin = str(invoice.get("gstin") or invoice.get("vendor_gstin") or "").strip().upper()
        gst_treatment = "business_registered_regular" if gstin else "business_unregistered"
        state_code = gstin[:2] if len(gstin) >= 2 else ""
        
        # Derive full state name from GSTIN state code (deterministic — eliminates OCR inconsistency)
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

        # 3. Robust Invoice Number Lookup (Root Cause Fix)
        inv_no = invoice.get("invoice_number") or invoice.get("supplier_invoice_no") or invoice.get("invoice_no") or "—"

        # 4. Extract more fields for the new schema
        sections = invoice.get("sections", {})
        supplier = sections.get("supplier_details", {})
        supply = sections.get("supply_details", {})
        
        bill_from = invoice.get("bill_from") or ""
        bill_to = supplier.get("billing_address") or invoice.get("billing_address") or ""
        
        branch = supplier.get("branch") or invoice.get("branch") or ""
        
        total_taxable = supply.get("total_taxable_value") or invoice.get("total_taxable_value") or invoice.get("taxable_value")
        total_invoice = supply.get("total_invoice_value") or invoice.get("total_invoice_value") or invoice.get("total_amount")
        
        total_igst = supply.get("total_igst") or invoice.get("total_igst")
        total_cgst = supply.get("total_cgst") or invoice.get("total_cgst")
        total_sgst = supply.get("total_sgst") or invoice.get("total_sgst")
        
        sales_order_no = invoice.get("sales_order_no") or invoice.get("purchase_order_no") or ""
        
        irn = invoice.get("irn") or ""
        ack_no = supply.get("ack_no") or invoice.get("ack_no") or ""
        ack_date = supply.get("ack_date") or invoice.get("ack_date") or ""

        return {
            "Date": invoice.get("invoice_date") or invoice.get("bill_date"),
            "Invoice No": inv_no,
            "Name": invoice.get("vendor_name") or invoice.get("supplier_name"),
            "GSTIN": gstin,
            "Branch": branch,
            "Place of Supply": pos_code,
            "Bill From": bill_from,
            "Bill Address To": bill_to,
            "Billing Address": bill_to, # Standard Zoho 'Billing Address' is for Customer
            "Total Taxable Value": total_taxable,
            "Total Invoice Value": total_invoice,
            "Total IGST": total_igst,
            "Total CGST": total_cgst,
            "Total SGST/UTGST": total_sgst,
            "Sales Order No": sales_order_no,
            "Item Name": item.get("description"),
            "HSN/SAC": item.get("hsn_sac") or item.get("hsn"),
            "Qty": item.get("quantity") or item.get("qty"),
            "UOM": item.get("uom") or "",
            "Item Rate": item.get("rate"),
            "Taxable Value": item.get("taxable_value"),
            "IGST": item.get("igst_amount") or item.get("igst"),
            "CGST": item.get("cgst_amount") or item.get("cgst"),
            "SGST/UTGST": item.get("sgst_amount") or item.get("sgst"),
            "Invoice Value": item.get("amount") or item.get("taxable_value"),
            "IRN": irn,
            "Ack. No.": ack_no,
            "Ack. Date": ack_date
        }

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

            if "_pages" in ext_data and isinstance(ext_data["_pages"], dict):
                logger.info(f"ADAPTER: Exploding {len(ext_data['_pages'])} pages from record {inv_id}")
                for p_idx, p_data in sorted(ext_data["_pages"].items(), key=lambda x: int(x[0])):
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
                
                if "sections" in final_inv and "items" in final_inv["sections"]:
                    final_inv["items"] = final_inv["sections"]["items"]
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
            # Step 1: Reconstruct
            raw_items = inv.get("items", [])
            logger.info(f"AUDIT: RAW ITEMS COUNT (Inv {inv.get('invoice_number')}) = {len(raw_items)}")
            
            # THE RECONSTRUCTOR CALL
            logger.info("AUDIT: RECONSTRUCTOR CALLED")
            reconstructed = self.reconstruct_items(raw_items)
            logger.info(f"AUDIT: RECONSTRUCTED ITEMS COUNT = {len(reconstructed)}")
            
            # Step 2: Normalize
            normalized = self.normalize_items(reconstructed)
            logger.info(f"AUDIT: NORMALIZED ITEMS COUNT = {len(normalized)}")
            
            # Step 3: Validate Invoice
            # Step 3: Validate Invoice
            validated_inv = self.validate_invoice(inv, normalized)
            
            # 🚀 FORCE canonical mapping directly on internal payload
            vendor_address = inv.get("vendor_address") or inv.get("bill_from") or ""
            validated_inv["bill_from"] = vendor_address
            
            # After mapping, delete vendor_address and any other alias to eliminate duplication
            if "vendor_address" in validated_inv:
                del validated_inv["vendor_address"]
            if "bill_address_from" in validated_inv:
                del validated_inv["bill_address_from"]

            # Assertion if missing
            if vendor_address and not validated_inv.get("bill_from"):
                logger.error(f"[MAPPING ERROR] bill_from is missing after mapping for invoice {inv.get('invoice_number')}")
                raise Exception("CRITICAL: Address lost in adapter mapping")

            print("AFTER VALIDATION:", validated_inv.get("bill_from"))
            print("ADAPTER OUTPUT:", validated_inv)
            print("FINAL API PAYLOAD:", validated_inv)
            print(f"INFO BILL_FROM_FINAL: {validated_inv.get('bill_from')}")







            validated_inv["Bill Address To"] = str(
                inv.get("billing_address") or 
                inv.get("bill_to_address") or 
                inv.get("sections", {}).get("invoice_details", {}).get("bill_to_address") or 
                ""
            ).strip()

            # Derive Place of Supply from GSTIN state code (deterministic)
            gstin = str(inv.get("gstin") or inv.get("vendor_gstin") or "").strip().upper()
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
            pos_code = GST_STATE_CODES.get(state_code) or inv.get("place_of_supply") or state_code
            validated_inv["Place of Supply"] = pos_code
            validated_inv["place_of_supply"] = pos_code
            
            logger.info(f"AUDIT EXPLICIT PAYLOAD: bill_from = '{(validated_inv.get('bill_from') or '')[:20]}...'")

            # Attach processed items - AUDIT: Define field used
            validated_inv["items"] = normalized
            logger.info(f"AUDIT: FIELD USED FOR EXPORT = invoice['items']")
            
            print("FINAL OBJECT BEFORE APPEND:", validated_inv)
            processed_invoices.append(validated_inv)


            
        return processed_invoices

    def transform(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Main Pipeline Auditor Entry (Steps 4-8)
        Ensures a SINGLE, fully deduplicated, and validated invoice dataset.
        """
        # Step 5: Define SINGLE SOURCE OF TRUTH (FINAL_INVOICES)
        final_invoices = self.reconstruct_invoices(data)
        
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
            for item in inv.get("items", []):
                # Step 7: Flatten
                row = self.resolve_zoho_row(inv, item)
                zoho_rows.append(row)

        # Step 8: Flatten Consistency Check via Enforcer
        flatten_check = enforcer.verify_flatten(zoho_rows, final_invoices)
        if flatten_check["validation"] == "FAIL":
             return {
                "validation": "FAIL",
                "ready_for_zoho": False,
                "stage": "FLATTEN_CONSISTENCY",
                "reason": flatten_check["reason"]
            }

        return {
            "invoices": final_invoices,
            "rows": zoho_rows,
            "validation": "PASS",
            "ready_for_zoho": True,
            "row_count": len(zoho_rows),
            "invoice_count": len(final_invoices),
            "debug_traces": getattr(self, "last_traces", [])
        }

def get_zoho_adapter():
    return ZohoAdapter()
