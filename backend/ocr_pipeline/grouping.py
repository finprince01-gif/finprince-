import re
import logging
from typing import List, Dict, Any
from django.db import transaction
from .repository import InvoiceTempOCR

logger = logging.getLogger(__name__)

def normalize_gstin(gstin: str) -> str:
    """Uppercase and trim spaces."""
    if not gstin: return ""
    return str(gstin).strip().upper()

def normalize_invoice_no(inv_no: str) -> str:
    """
    Uppercase, remove spaces, replace multiple separators with single standard separator.
    Remove non-alphanumeric except / and -.
    """
    if not inv_no: return ""
    # 1. Uppercase
    s = str(inv_no).upper()
    # 2. Remove spaces
    s = s.replace(" ", "")
    # 3. Handle separators: replace multiple occurrences of - or / with a single one
    s = re.sub(r'[-/]+', lambda m: m.group(0)[0], s)
    # 4. Remove non-alphanumeric except / and -
    s = re.sub(r'[^A-Z0-9/-]', '', s)
    return s

def normalize_branch(branch: str) -> str:
    """Lowercase, trim, remove punctuation, collapse spaces."""
    if not branch: return ""
    # 1. Lowercase & Trim
    s = str(branch).lower().strip()
    # 2. Remove punctuation (.,-/)
    s = re.sub(r'[.,-/]', ' ', s)
    # 3. Collapse multiple spaces
    s = re.sub(r'\s+', ' ', s).strip()
    return s

def normalize_date_strict(date_val: str) -> str:
    """Standardize to YYYY-MM-DD."""
    if not date_val: return ""
    from .normalize import normalize_date
    return normalize_date(date_val)

def run_grouping_logic(tenant_id: str, upload_session_id: str = None):
    """
    Core implementation of STEP 3-7: Grouping and Merging.
    """
    logger.info(f"STARTING GROUPING PREPROCESSOR: tenant={tenant_id}, session={upload_session_id}")
    
    # 1. Fetch relevant unprocessed records
    query = InvoiceTempOCR.objects.filter(tenant_id=tenant_id, processed=False)
    if upload_session_id:
        query = query.filter(upload_session_id=upload_session_id)
    
    records = list(query.order_by('created_at', 'id'))
    if not records:
        logger.info("No records found to group.")
        return

    groups = {} # key -> list of records

    for r in records:
        data = r.extracted_data or {}
        sections = data.get("sections", {})
        supplier = sections.get("supplier_details", {})
        
        # Field Extraction (Step 1)
        gstin_raw = r.gstin or supplier.get("gstin")
        inv_no_raw = r.supplier_invoice_no or supplier.get("supplier_invoice_no")
        branch_raw = r.branch or supplier.get("branch")
        invoice_date_raw = data.get("invoice_date") or supplier.get("invoice_date")

        # Edge Cases (Step 8): If any mandatory field is missing, DO NOT group
        if not gstin_raw or not inv_no_raw or not branch_raw or not invoice_date_raw:
            logger.info(f"Skipping grouping for record {r.id}: Missing mandatory fields.")
            r.group_id = None
            r.is_primary = True # Treat as standalone
            r.save()
            continue

        # Normalization (Step 2)
        gstin = normalize_gstin(gstin_raw)
        inv_no = normalize_invoice_no(inv_no_raw)
        branch = normalize_branch(branch_raw)
        inv_date = normalize_date_strict(invoice_date_raw)

        # Re-check after normalization
        if not gstin or not inv_no or not branch or not inv_date:
            logger.info(f"Skipping grouping for record {r.id}: Empty fields after normalization.")
            r.group_id = None
            r.is_primary = True
            r.save()
            continue

        # Grouping Key (Step 3)
        group_key = f"{gstin}|{inv_no}|{branch}|{inv_date}"
        
        if group_key not in groups:
            groups[group_key] = []
        groups[group_key].append(r)

    # Merging Logic (Step 4 & 6)
    for key, group_records in groups.items():
        if len(group_records) < 1: continue # Should not happen
        
        try:
            with transaction.atomic():
                if len(group_records) == 1:
                    # Single page invoice
                    primary = group_records[0]
                    primary.group_id = key
                    primary.is_primary = True
                    primary.save()
                    logger.info(f"Merged SINGLE: {key}")
                    continue

                # Multi-page invoice
                logger.info(f"Merging group {key} with {len(group_records)} pages.")
                
                primary = group_records[0] # FIRST record for Header
                last = group_records[-1]    # LAST record for Totals/Taxes/Charges
                
                # Combine Line Items
                merged_items = []
                for r in group_records:
                    items = (r.extracted_data or {}).get("sections", {}).get("items", [])
                    merged_items.extend(items)
                
                # Create merged_data structure (Step 5)
                merged_data = primary.extracted_data.copy()
                if "sections" not in merged_data: merged_data["sections"] = {}
                
                # Update Header from Primary (already there)
                # Update Line Items
                merged_data["sections"]["items"] = merged_items
                
                # Update Totals, Taxes, Charges from LAST record
                last_sections = (last.extracted_data or {}).get("sections", {})
                merged_data["sections"]["supply_details"] = last_sections.get("supply_details", {})
                merged_data["sections"]["due_details"] = last_sections.get("due_details", {})
                merged_data["sections"]["transit_details"] = last_sections.get("transit_details", {})
                
                # Update top-level fields for consistency
                if last.extracted_data:
                    merged_data["total_invoice_value"] = last.extracted_data.get("total_invoice_value")
                
                # Update Primary record
                primary.extracted_data = merged_data
                primary.group_id = key
                primary.is_primary = True
                primary.save()
                
                # Mark others as secondary
                for r in group_records[1:]:
                    r.group_id = key
                    r.is_primary = False
                    r.save()
                
                logger.info(f"SUCCESS: Group {key} merged ({len(group_records)} pages).")
        except Exception as e:
            logger.error(f"FAILURE: Merging group {key}: {str(e)}")

    logger.info("GROUPING PREPROCESSOR FINISHED.")
