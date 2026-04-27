# Zoho Bulk Upload Pipeline: Full End-to-End Analysis

This document traces the complete data lifecycle of an invoice within the AI-Accounting system, from PDF ingestion to the final Zoho-compliant export.

---

## 🏗️ Pipeline Overview

`PDF` → `OCR` → `Segmentation` → `Extraction` → `Normalization` → `Reconstruction` → `Merge` → `FINAL_INVOICES` → `Mapping` → `UI` → `Export`

---

## 🔍 Stage-by-Stage Trace

### 1. OCR Stage
*   **Action**: PDF bytes are processed by the `fitz` (PyMuPDF) library.
*   **Input**: Raw binary PDF.
*   **Transformation**: Extracts text blocks with coordinates (X, Y).
*   **Failure Point**: Misidentification of characters (e.g., `0` vs `O`) due to low resolution.

### 2. Segmentation (`grouping.py`)
*   **Action**: Groups raw pages into logical "segments" representing individual invoices.
*   **Logic**: Uses context-bound extraction. It looks for labels (`Invoice No`) and validates candidates in the same/next line.
*   **Strict Split Rule**: New segment ONLY if `valid_inv_no` exists AND `new != prev`.
*   **Failure Point**: **HSN False Splits**. If an 8-digit HSN is misidentified as an invoice number, the invoice is fragmented.

### 3. Extraction (AI)
*   **Action**: Sends segmented text to AI (Gemini/GPT) to produce structured JSON.
*   **Input**: Raw text blocks from a single segment.
*   **Transformation**: Text → `{ "invoice_number": "...", "items": [...] }`.
*   **Failure Point**: AI merging multiple line items into one "summary" row, causing data loss.

### 4. Normalization
*   **Action**: Sanitizes fields for database consistency.
*   **Tasks**: Strips GSTIN non-alphanumerics, converts currency strings to floats, parses dates.
*   **Failure Point**: Ambiguous date formats (e.g., `01/02/2024` being interpreted differently).

### 5. Table Reconstruction (`table_reconstructor.py`)
*   **Action**: Fixes broken OCR tables.
*   **Logic**: Merges multi-line descriptions until a `[qty] + [rate] + [taxable]` pattern is found.
*   **Validation**: Enforces `qty * rate = taxable`. Auto-corrects minor discrepancies.
*   **Failure Point**: **Row Merging Failures**. If the engine incorrectly pairs a description from one row with the amounts from the next.

### 6. Forensic Merge (`forensic_merger.py`)
*   **Action**: Detects and merges duplicate invoice copies (Original vs Duplicate).
*   **Logic**: Groups by `(invoice_number + gstin + total_value)`.
*   **Header Selection**: Prioritizes `ORIGINAL FOR RECIPIENT`.
*   **Failure Point**: Selecting a lower-quality "Duplicate" page as the header if it appears more "complete" than a slightly blurry "Original".

### 7. FINAL_INVOICES (Source of Truth)
*   **Action**: The result of `IntegrityEnforcer.verify()`.
*   **Rule**: This is the immutable source for all downstream consumers.
*   **Audit**: Re-verifies uniqueness, item count > 0, and total reconciliation (±1 tolerance).

### 8. Zoho Mapping (`zoho_adapter.py`)
*   **Action**: Projects JSON fields into the 34-column Zoho Bulk Upload schema.
*   **Transformation**: Nested items are flattened into individual rows.
*   **Failure Point**: Incorrect mapping of complex tax structures (e.g., missing IGST vs CGST/SGST split).

### 9. UI Data Flow (`InvoiceScannerModal.tsx`)
*   **Action**: Displays the results in a high-density grid.
*   **Data Path**: `adapterRes.invoices` → `mappedResults` → `invoiceResults`.
*   **Failure Point**: State "Reflection" where editing one row accidentally updates another due to shared indices.

### 10. Export Flow
*   **Action**: Converts `invoiceResults` into `.xlsx` or `.csv`.
*   **Tool**: `XLSX` library for Excel generation.
*   **Failure Point**: Formatting errors (e.g., numbers stored as text in Excel).

---

## 📊 Data Consistency Check (Audit Protocol)

The pipeline is considered **BROKEN** if:
`OCR_ITEMS` ≠ `RECONSTRUCTED_ITEMS` ≠ `FINAL_ITEMS` ≠ `EXPORT_ROWS`

| Audit Metric | Threshold | Consequence of Failure |
| :--- | :--- | :--- |
| **Invoice Uniqueness** | 100% | Duplicate entries in Zoho |
| **Mathematical Integrity** | ±1 INR | Failed Zoho import / Audit flags |
| **Row Count Match** | Exact | Silent data loss (missing items) |

---

## 🚨 Root Cause Identification

1.  **Stage 1-2 (Segmentation)**: Most common cause of "Orphan Invoices" (items without a header).
2.  **Stage 5 (Reconstruction)**: Most common cause of "Collapsed Rows" (multi-line items merging incorrectly).
3.  **Stage 7 (Enforcer)**: This stage does not *cause* errors but is the first to *detect* them and stop the export.

---
**Document Status**: Finalized
**Auditor**: Senior Pipeline Execution Auditor
