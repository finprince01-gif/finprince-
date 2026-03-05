"""
PDF Multi-Invoice Splitter
==========================
Pre-processing layer that sits **before** the OCR pipeline.

When a PDF is uploaded it may contain multiple invoices (one or more pages
each).  This module:

  1. Opens the PDF with PyMuPDF (fitz).
  2. Extracts text from every page.
  3. Detects invoice-number boundaries using regex patterns common in Indian
     GST invoices (Invoice No / Invoice Number / Bill No / Tax Invoice).
  4. Groups consecutive pages that share the same detected invoice number.
  5. Creates a temporary single-PDF file for each group.
  6. Returns a list of (invoice_number, temp_file_path, page_list) tuples that
     the caller can feed into the existing OCR pipeline one by one.

IMPORTANT — this module ONLY adds a preprocessing step.
It does NOT touch:
  • OCR extraction logic
  • Gemini AI prompts
  • core.processing_engine (mapping engine)
  • vendor_validation_logic
  • invoicing / voucher creation
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
# Regex patterns – ordered from most-specific to least-specific
# ---------------------------------------------------------------------------
_INVOICE_NUM_PATTERNS: List[re.Pattern] = [
    # "Invoice No: INV-2024-0001" / "Invoice Number :  ABC/001/24"
    re.compile(
        r"(?:invoice\s*(?:no|number)|bill\s*no|tax\s*invoice)[:\s#\-]*([A-Za-z0-9\-\/\.]+)",
        re.IGNORECASE,
    ),
    # "Inv No: 5001-A"
    re.compile(
        r"inv\s*(?:no|number)[:\s#\-]*([A-Za-z0-9\-\/\.]+)",
        re.IGNORECASE,
    ),
]

# Minimum page-text length (chars) below which we assume the page is a
# trailer/continuation rather than a fresh invoice start.
_MIN_TEXT_FOR_NEW_INVOICE = 80

# If a page contains very little text AND no invoice number, it is considered
# a continuation of the previous invoice group.
_CONTINUATION_THRESHOLD = 20


@dataclass
class InvoiceGroup:
    """One logical invoice extracted from a multi-page PDF."""
    invoice_number: str          # detected number ("UNKNOWN-<n>" if not found)
    page_indices: List[int]      # 0-based page numbers from the source PDF
    temp_file_path: str = ""     # set after write_temp_pdf() is called
    original_filename: str = ""  # populated by the caller


def _extract_invoice_number(text: str) -> str | None:
    """
    Try each pattern in order and return the first match, or None.
    """
    for pat in _INVOICE_NUM_PATTERNS:
        m = pat.search(text)
        if m:
            candidate = m.group(1).strip().rstrip(".,")
            # Sanity-check: at least 3 chars, not just punctuation
            if len(candidate) >= 3:
                return candidate
    return None


def detect_invoice_groups(pdf_bytes: bytes) -> List[InvoiceGroup]:
    """
    Analyse a PDF's pages and return one InvoiceGroup per logical invoice.

    For a single-page PDF — or when no invoice boundaries are found — a
    single group covering all pages is returned (the whole PDF is treated as
    one invoice).

    Parameters
    ----------
    pdf_bytes : bytes
        Raw bytes of the uploaded PDF file.

    Returns
    -------
    List[InvoiceGroup]
        One entry per detected invoice.  Page indices are 0-based.
    """
    try:
        import fitz  # PyMuPDF
    except ImportError:
        logger.warning(
            "pdf_splitter: PyMuPDF is not installed — treating PDF as single invoice."
        )
        return [InvoiceGroup(invoice_number="UNKNOWN-1", page_indices=[0])]

    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception as exc:
        logger.error("pdf_splitter: Could not open PDF: %s", exc)
        return [InvoiceGroup(invoice_number="UNKNOWN-1", page_indices=[0])]

    total_pages = len(doc)
    logger.info("pdf_splitter: PDF has %d page(s)", total_pages)

    if total_pages == 1:
        # Fast-path: single-page PDF → always one invoice
        page_text = doc[0].get_text()
        inv_no = _extract_invoice_number(page_text) or "UNKNOWN-1"
        return [InvoiceGroup(invoice_number=inv_no, page_indices=[0])]

    # ------------------------------------------------------------------
    # Multi-page: extract text per page and detect boundaries
    # ------------------------------------------------------------------
    page_texts: List[str] = []
    for i in range(total_pages):
        try:
            text = doc[i].get_text()
        except Exception:
            text = ""
        page_texts.append(text)

    # Build groups: every time a NEW invoice number appears (different from
    # the active group), start a new group.
    groups: List[InvoiceGroup] = []
    current_inv_no: str | None = None
    current_pages: List[int] = []
    fallback_counter = 1

    for page_idx, text in enumerate(page_texts):
        detected = None

        if len(text.strip()) >= _MIN_TEXT_FOR_NEW_INVOICE:
            detected = _extract_invoice_number(text)

        if detected:
            if detected != current_inv_no:
                # New invoice number found → save previous group (if any)
                if current_pages:
                    groups.append(
                        InvoiceGroup(
                            invoice_number=current_inv_no or f"UNKNOWN-{fallback_counter}",
                            page_indices=current_pages,
                        )
                    )
                    if not current_inv_no:
                        fallback_counter += 1
                current_inv_no = detected
                current_pages = [page_idx]
            else:
                # Same invoice number → continuation of current group
                current_pages.append(page_idx)
        else:
            # No invoice number found on this page
            if len(text.strip()) < _CONTINUATION_THRESHOLD:
                # Blank / near-blank page → attach to current group
                current_pages.append(page_idx)
            elif current_pages:
                # Text-heavy but no invoice number → assume continuation
                current_pages.append(page_idx)
            else:
                # First page with no invoice number detectable
                current_pages = [page_idx]
                current_inv_no = None

    # Flush last group
    if current_pages:
        groups.append(
            InvoiceGroup(
                invoice_number=current_inv_no or f"UNKNOWN-{fallback_counter}",
                page_indices=current_pages,
            )
        )

    logger.info(
        "pdf_splitter: Detected %d invoice group(s) in %d pages",
        len(groups), total_pages,
    )
    return groups


def write_temp_pdf(pdf_bytes: bytes, page_indices: List[int]) -> str:
    """
    Extract the specified pages from *pdf_bytes* and write them as a new
    temporary PDF.  Returns the absolute path to the temp file.

    The caller is responsible for deleting the file after use (or letting the
    OCR cache cleanup handle it when it records the file path).
    """
    try:
        import fitz
    except ImportError:
        raise RuntimeError("PyMuPDF (fitz) is required for multi-invoice PDF splitting.")

    src_doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    new_doc = fitz.open()  # blank PDF

    for pi in page_indices:
        if pi < len(src_doc):
            new_doc.insert_pdf(src_doc, from_page=pi, to_page=pi)

    tmp = tempfile.NamedTemporaryFile(
        suffix=".pdf", prefix="inv_split_", delete=False
    )
    tmp_path = tmp.name
    tmp.close()

    new_doc.save(tmp_path)
    new_doc.close()
    src_doc.close()

    return tmp_path


def split_pdf_into_invoice_files(
    pdf_bytes: bytes,
    original_filename: str,
    *,
    force_single: bool = False,
) -> List[Tuple[str, str, InvoiceGroup]]:
    """
    High-level helper: detect groups + write temp files in one call.

    Parameters
    ----------
    pdf_bytes : bytes
        Raw PDF file bytes.
    original_filename : str
        The original uploaded filename (for display/logging only).
    force_single : bool
        Skip splitting and treat the whole PDF as one invoice.
        Useful for images or non-PDF files.

    Returns
    -------
    List of (invoice_number, temp_file_path, group) tuples.
    Each entry is ready to be fed into the existing OCR pipeline.
    """
    if force_single:
        groups = [InvoiceGroup(invoice_number="UNKNOWN-1", page_indices=list(range(len(pdf_bytes))))]
        # We can't meaningfully split non-PDF bytes, so return the original bytes
        tmp = tempfile.NamedTemporaryFile(suffix=".pdf", prefix="inv_nosplit_", delete=False)
        tmp.write(pdf_bytes)
        tmp.close()
        groups[0].temp_file_path = tmp.name
        groups[0].original_filename = original_filename
        return [(groups[0].invoice_number, tmp.name, groups[0])]

    groups = detect_invoice_groups(pdf_bytes)

    results: List[Tuple[str, str, InvoiceGroup]] = []
    for group in groups:
        try:
            tmp_path = write_temp_pdf(pdf_bytes, group.page_indices)
            group.temp_file_path = tmp_path
            group.original_filename = original_filename
            results.append((group.invoice_number, tmp_path, group))
            logger.info(
                "pdf_splitter: Wrote %d-page temp PDF for invoice %s → %s",
                len(group.page_indices), group.invoice_number, tmp_path,
            )
        except Exception as exc:
            logger.error(
                "pdf_splitter: Failed to write temp PDF for invoice %s (pages %s): %s",
                group.invoice_number, group.page_indices, exc,
            )

    return results


def cleanup_temp_pdf(path: str) -> None:
    """Delete a temporary split PDF file if it still exists."""
    if path and os.path.isfile(path):
        try:
            os.remove(path)
        except OSError as exc:
            logger.warning("pdf_splitter: Could not delete temp file %s: %s", path, exc)
