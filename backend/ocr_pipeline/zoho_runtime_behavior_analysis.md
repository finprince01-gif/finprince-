# Zoho Runtime Behavior Analysis: Execution Trace

This document explains the CURRENT behavioral logic of the Zoho Bulk Upload Pipeline. It describes how the system processes data and the rationale behind its decisions.

---

## 📡 Phase 1: High-Fidelity Segmentation Analysis

**Goal**: Identify unique invoices and prevent false splits.
**Logic**: Positional block-level extraction using `fitz`.

### Step 1: Candidate Selection
The system scans for labels (`Invoice No`, `Bill No`, etc.). When a label is found:
1. It looks at the text in the **same block**.
2. It looks at the text in the **immediately following block**.
3. It validates if the candidate matches the required format (mixed alpha-numeric or `/` and `-`).

### Step 2: Scoring Engine
Each candidate is assigned a priority score:
*   **Bonus (+100)**: If located in the top 25% of the page (header zone).
*   **Bonus (+50)**: If located near a "Date" label.
*   **Hard Rejection**: If the candidate matches `REJECTION_WORDS` (e.g., `HSN`, `Qty`, `Total`) or is a pure numeric string > 6 digits.

---

## 🧩 Phase 2: Segmentation Decision Trace

The segmentation engine maintains a state machine between pages.

| Decision Type | Trigger | Logic |
| :--- | :--- | :--- |
| **SPLIT** | Valid different number | A new valid invoice number is detected that does not match the current group. |
| **CONTINUE** | No valid number | Page has no identifiable header; it is force-merged with the previous page. |
| **CONTINUE** | Duplicate copy | Page is identified as `ORIGINAL` or `DUPLICATE` with the same number as previous. |

---

## 🛠️ Phase 3: Table Reconstruction Behavior

**Goal**: Fix broken OCR tables without data loss.
**Mechanism**: Pattern-based buffer.

1.  **Buffer Stage**: Rows containing only text (multi-line descriptions) are added to a `pending_desc` buffer.
2.  **Completion Stage**: Once a row with numeric values (`qty`, `rate`, `taxable`) is encountered:
    *   The `pending_desc` is merged with the current text.
    *   Validation `qty * rate = taxable` is performed.
    *   The buffer is cleared.
3.  **Filter Stage**: Rows matching tax or total labels (CGST, SGST, Subtotal) are discarded to prevent table pollution.

---

## 🏛️ Phase 4: Data Consistency Trace

The pipeline enforces a **Single Source of Truth** (`FINAL_INVOICES`).

*   **UI Parity**: The `mappedResults` in the scanner modal are generated using the same `ZohoAdapter.reconstruct_invoices` call used for final processing.
*   **Export Parity**: The Excel/CSV export utilizes the `invoiceResults` state, which is locked to the reconstructed output.
*   **Validation**: The `IntegrityEnforcer` re-audits the count of items in `FINAL_INVOICES` against the final `zoho_rows` count. If they diverge, the process stops.

---

## 🚨 Phase 5: First Point of Potential Corruption

In the current architecture, data integrity issues typically originate in:

1.  **Extraction (AI)**: If the AI "hallucinates" a summary row, the granular item data is lost before the `TableReconstructor` can process it.
2.  **Segmentation (Labels)**: If an invoice lacks clear labels (e.g., just a number in a box), the engine may fail to split correctly, leading to merged invoices.

---
**Status**: Behavioral Review Complete
**Analyst**: Senior Runtime Behavior Analyst
