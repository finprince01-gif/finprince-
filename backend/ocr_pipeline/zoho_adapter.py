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
        pos_code = gstin[:2] if len(gstin) >= 2 else "" # State code from GSTIN

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

        return {
            "Vendor Name": invoice.get("vendor_name") or invoice.get("supplier_name"),
            "Bill#": inv_no,
            "Bill Date": invoice.get("invoice_date") or invoice.get("bill_date"),
            "GST Treatment": gst_treatment,
            "GSTIN": gstin,
            "Place of Supply": pos_code,
            "Item Name": item.get("description"),
            "HSN/SAC": item.get("hsn"),
            "Quantity": item.get("qty"),
            "Rate": item.get("rate"),
            "Taxable Value": item.get("taxable_value"),
            "Tax Name": tax_name,
            "Purchase Account": "Cost of Goods Sold", # Default required for Zoho
            "Invoice Value": invoice.get("total_invoice_value") or invoice.get("total_amount")
        }

    def reconstruct_invoices(self, data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Runs the full reconstruction and normalization pipeline on a set of invoices.
        Returns a list of invoices with reconstructed items.
        """
        raw_invoices = data.get("invoices", [])
        logger.info(f"AUDIT: RAW OCR INVOICES COUNT = {len(raw_invoices)}")
        
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
            validated_inv = self.validate_invoice(inv.copy(), normalized)
            
            # Attach processed items - AUDIT: Define field used
            validated_inv["items"] = normalized
            logger.info(f"AUDIT: FIELD USED FOR EXPORT = invoice['items']")
            
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
