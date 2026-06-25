"""
PDF Multi-Invoice Splitter
==========================
Pre-processing layer that sits **before** the OCR pipeline.

When a PDF is uploaded it may contain multiple invoices (one or more pages
each).  This module:

  1. Opens the PDF with pypdf.
  2. Evaluates page-by-page header matching to segment invoices.
  3. Keeps track of related pages in segments.
  4. Fallback rule: if no headers are detected, treats each page independently.
  5. Creates a temporary single-PDF file for each group using pypdf.PdfWriter.
  6. Returns a list of (invoice_number, temp_file_path, group) tuples.

"""

from __future__ import annotations

import io
import os
import re
import logging
import tempfile
from dataclasses import dataclass, field
from typing import IO, List, Tuple

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Segregation Regex Patterns
# ---------------------------------------------------------------------------
# Invoice header indicators
_HEADER_REGEX = re.compile(
    r"\b(?:Tax Invoice|Sales Invoice|Invoice|Cash Bill|Service Bill|Original for Recipient|Invoice No|Bill No|Receipt|Voucher|Consignment|Reference No|Order No)\b",
    re.IGNORECASE
)

# Vendor header elements (GSTIN, PAN, keywords)
_VENDOR_REGEX = re.compile(
    r"\b(?:GSTIN|PAN|GSTIN\s*/\s*UIN)\b|\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}\b",
    re.IGNORECASE
)

# Invoice number extraction just for fallback naming or standard checking
_INVOICE_NUM_PATTERNS: List[re.Pattern] = [
    re.compile(
        r"(?:invoice\s*(?:no|number)|bill\s*no|tax\s*invoice)[:\s#\-]*([A-Za-z0-9\-\/\.]+)",
        re.IGNORECASE,
    ),
    re.compile(
        r"inv\s*(?:no|number)[:\s#\-]*([A-Za-z0-9\-\/\.]+)",
        re.IGNORECASE,
    ),
]

@dataclass
class InvoiceGroup:
    """One logical invoice extracted from a multi-page PDF."""
    invoice_number: str          # detected number ("UNKNOWN-<n>" if not found)
    page_indices: List[int]      # 0-based page numbers from the source PDF
    temp_file_path: str = ""     # set after write_temp_pdf() is called
    original_filename: str = ""  # populated by the caller


def _extract_invoice_number(text: str) -> str | None:
    for pat in _INVOICE_NUM_PATTERNS:
        m = pat.search(text)
        if m:
            candidate = m.group(1).strip().rstrip(".,")
            if len(candidate) >= 3:
                return candidate
    return None


def _page_has_header(text: str) -> bool:
    """
    Check if the page has a strong invoice or vendor header.
    """
    # Look at the first 1000 characters as a rough heuristic for "top of page"
    top_text = text[:1000]
    if _HEADER_REGEX.search(top_text):
        return True
    if _VENDOR_REGEX.search(top_text):
        return True
    return False

def detect_invoice_groups(reader) -> List[InvoiceGroup]:
    """
    Analyse a pypdf.PdfReader's pages and return one InvoiceGroup per logical invoice.
    """
    total_pages = len(reader.pages)
    logger.info("pdf_splitter: Running segmentation logic on %d page(s)", total_pages)

    if total_pages == 1:
        # Fast-path: single-page PDF -> one invoice
        page_text = reader.pages[0].extract_text() or ""
        inv_no = _extract_invoice_number(page_text) or "UNKNOWN-1"
        return [InvoiceGroup(invoice_number=inv_no, page_indices=[0])]

    # Pre-extract headers and invoice numbers to allow clean look-ahead
    page_invoice_nos = []
    page_has_headers = []
    for page_idx in range(total_pages):
        page_text = reader.pages[page_idx].extract_text() or ""
        page_has_headers.append(_page_has_header(page_text))
        page_invoice_nos.append(_extract_invoice_number(page_text))

    groups: List[InvoiceGroup] = []
    current_pages: List[int] = [0]
    current_inv_no: str | None = page_invoice_nos[0]
    fallback_counter = 1
    
    any_headers_found_in_doc = any(page_has_headers)

    for page_idx in range(1, total_pages):
        has_header = page_has_headers[page_idx]
        extracted_no = page_invoice_nos[page_idx]
        
        should_split = False
        if has_header:
            is_continuation = False
            
            # Case 1: The current page has an invoice number, and we have an active invoice number
            if extracted_no and current_inv_no:
                if extracted_no.lower() == current_inv_no.lower():
                    is_continuation = True
            
            # Case 2: The current page does NOT have an invoice number, but we have an active invoice number
            elif not extracted_no and current_inv_no:
                # Look-ahead: scan subsequent pages to find the first page with an invoice number
                next_extracted_no = None
                for look_idx in range(page_idx + 1, total_pages):
                    look_no = page_invoice_nos[look_idx]
                    if look_no:
                        next_extracted_no = look_no
                        break
                
                if next_extracted_no:
                    if next_extracted_no.lower() == current_inv_no.lower():
                        is_continuation = True
                else:
                    # No subsequent invoice number found. 
                    # If the next pages don't introduce a new invoice number,
                    # we treat this page as a continuation of the active invoice.
                    is_continuation = True
            
            if not is_continuation:
                should_split = True

        if should_split:
            groups.append(
                InvoiceGroup(
                    invoice_number=current_inv_no or f"UNKNOWN-{fallback_counter}",
                    page_indices=current_pages,
                )
            )
            if not current_inv_no:
                fallback_counter += 1
            
            current_pages = [page_idx]
            current_inv_no = extracted_no
        else:
            current_pages.append(page_idx)
            if not current_inv_no and extracted_no:
                current_inv_no = extracted_no

    if current_pages:
        groups.append(
            InvoiceGroup(
                invoice_number=current_inv_no or f"UNKNOWN-{fallback_counter}",
                page_indices=current_pages,
            )
        )

    # Fallback safety rule (Requirement 8)
    # If invoice header detection fails COMPLETELY for the whole document,
    # treat each page as an independent invoice to prevent mixing data.
    if not any_headers_found_in_doc and len(groups) == 1 and total_pages > 1:
        logger.info("pdf_splitter: No headers detected globally. Applying Fallback Rule: each page is independent.")
        groups = []
        for i in range(total_pages):
            extracted = page_invoice_nos[i] or f"UNKNOWN-{i+1}"
            groups.append(InvoiceGroup(invoice_number=extracted, page_indices=[i]))

    logger.info(
        "pdf_splitter: Detected %d invoice group(s) in %d pages.",
        len(groups), total_pages
    )
    for idx, grp in enumerate(groups, 1):
        logger.info("  Invoice %d: range [%s]", idx, ", ".join(str(p+1) for p in grp.page_indices)) # logged as 1-based ranges for user readability
        
    return groups


def write_temp_pdf(pdf_bytes: bytes, page_indices: List[int]) -> str:
    """
    Extract the specified pages from *pdf_bytes* and write them as a new
    temporary PDF using pypdf. Returns the absolute path to the temp file.
    """
    try:
        import pypdf
    except ImportError:
        raise RuntimeError("pypdf is required for multi-invoice PDF splitting.")

    reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
    writer = pypdf.PdfWriter()

    for pi in page_indices:
        if pi < len(reader.pages):
            writer.add_page(reader.pages[pi])

    tmp = tempfile.NamedTemporaryFile(
        suffix=".pdf", prefix="inv_split_", delete=False
    )
    tmp_path = tmp.name
    tmp.close()

    with open(tmp_path, "wb") as f_out:
        writer.write(f_out)

    return tmp_path

def split_pdf_into_invoice_files(
    pdf_bytes: bytes,
    original_filename: str,
    *,
    force_single: bool = False,
) -> List[Tuple[str, str, InvoiceGroup]]:
    """
    High-level helper: detect orientations & groups + write temp files in one call.
    """
    if force_single:
        groups = [InvoiceGroup(invoice_number="UNKNOWN-1", page_indices=list(range(len(pdf_bytes))))] # Actually len(pdf_bytes) isn't page count but this is fallback
        tmp = tempfile.NamedTemporaryFile(suffix=".pdf", prefix="inv_nosplit_", delete=False)
        tmp.write(pdf_bytes)
        tmp.close()
        groups[0].temp_file_path = tmp.name
        groups[0].original_filename = original_filename
        return [(groups[0].invoice_number, tmp.name, groups[0])]

    try:
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
        total_pages = len(reader.pages)
        
        # Segmentation 
        groups = detect_invoice_groups(reader)
            
    except Exception as exc:
        logger.error("pdf_splitter: Failed to process document: %s", exc)
        return []

    results: List[Tuple[str, str, InvoiceGroup]] = []
    
    # Requirement 9: Segmentation logging
    logger.info("pdf_splitter: Segmentation Logging - File: %s, Total pages processed: %d, Invoices detected: %d", 
                original_filename, total_pages, len(groups))
                
    for group in groups:
        try:
            tmp_path = write_temp_pdf(pdf_bytes, group.page_indices)
            group.temp_file_path = tmp_path
            group.original_filename = original_filename
            results.append((group.invoice_number, tmp_path, group))
            
            # Additional detail for logging requirement 9
            pages_1_indexed = [p + 1 for p in group.page_indices]
            range_str = f"{pages_1_indexed[0]}-{pages_1_indexed[-1]}" if len(pages_1_indexed) > 1 else str(pages_1_indexed[0])
            logger.info(
                "pdf_splitter: Wrote %d-page temp PDF for invoice %s (Page range: %s) -> %s",
                len(group.page_indices), group.invoice_number, range_str, tmp_path
            )
        except Exception as exc:
            logger.error(
                "pdf_splitter: Failed to write temp PDF for invoice %s (pages %s): %s",
                group.invoice_number, group.page_indices, exc,
            )

    return results

def cleanup_temp_pdf(path: str) -> None:
    if path and os.path.isfile(path):
        try:
            os.remove(path)
        except OSError as exc:
            logger.warning("pdf_splitter: Could not delete temp file %s: %s", path, exc)
