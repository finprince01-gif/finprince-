# Zoho Pipeline Internal Mechanics: Technical Breakdown

This document provides a step-by-step internal explanation of the Zoho Bulk Upload Pipeline, describing how data is transformed and passed between stages.

---

## 🏗️ Stage 1: OCR (Text Generation)
*   **Action**: Ingests raw PDF bytes and uses `fitz` (PyMuPDF) to extract text.
*   **Output**: Unstructured text stream organized by "blocks".
*   **Behavior**: The output is inherently messy as it follows the PDF's internal object stream rather than its visual layout. Coordinates (X, Y) are preserved but not yet used for structuring.

---

## 🧩 Stage 2: Segmentation (Grouping)
*   **Action**: Groups raw pages into logical invoice segments.
*   **Logic**:
    *   **Label-Bound Search**: Searches for `Invoice No`, `Bill No`, etc.
    *   **Format Gating**: Candidates must contain a digit and be 2-25 chars. Special characters (`/`, `-`) or mixed alpha-numeric strings are high-priority.
    *   **Decision (SPLIT)**: A new segment is created if a valid, *different* invoice number is detected.
    *   **Decision (CONTINUE)**: Pages with no valid number or matching numbers (duplicates/copies) are merged with the previous page.

---

## 🤖 Stage 3: Extraction (AI Structuring)
*   **Action**: Converts unstructured text from a segment into a structured JSON object.
*   **Mapping**: The LLM (Gemini/GPT) maps textual patterns into specific fields:
    *   `header`: Invoice Date, Vendor, GSTIN, Total Value.
    *   `items`: Description, Quantity, Rate, Taxable Value.
*   **Nature**: This stage introduces "AI interpretation," where the model attempts to guess the meaning of ambiguous text.

---

## 🧹 Stage 4: Normalization
*   **Action**: Sanitizes the AI output for system consumption.
*   **Transformations**:
    *   **GSTIN**: Strips non-alphanumeric characters.
    *   **Numbers**: Cleans currency symbols and commas to ensure float compatibility.
    *   **Dates**: Standardizes various date formats into ISO standard.

---

## 🛠️ Stage 5: Table Reconstruction
*   **Action**: Fixes "broken" item tables where rows were split across OCR blocks.
*   **Logic (Buffer Engine)**:
    *   Stores descriptive text in a buffer until a numeric row is encountered.
    *   **Reconstruction**: Merges the buffered text with the numeric data.
    *   **Validation**: Re-calculates `qty * rate` to verify the row's numeric integrity.

---

## 🏛️ Stage 6: Forensic Merge
*   **Action**: Deduplicates multi-copy uploads at the object level.
*   **Logic**: Groups invoices by `(invoice_number + gstin + total_value)`.
*   **Consolidation**: Merges items from matching invoices and selects the most authoritative header (preferring `ORIGINAL`).

---

## 🎖️ Stage 7: FINAL_INVOICES
*   **Action**: Establishes the definitive "Source of Truth."
*   **Verification**: Performs a final 10-step runtime audit (Uniqueness, Item Presence, Total Reconciliation).
*   **Significance**: This dataset is immutable; all downstream UI and Export logic are locked to this state.

---

## 🗺️ Stage 8: Zoho Mapping
*   **Action**: Flattens the rich invoice objects into 34-column CSV/Excel rows.
*   **Transformation**: `1 Invoice -> N Item Rows`. Each row repeats the header data (Date, Vendor) for every line item.

---

## 💻 Stage 9: UI Data Flow
*   **Action**: Backend transmits the audited result to the React frontend.
*   **State Binding**: The frontend stores the results in the `invoiceResults` array.
*   **Rendering**: The UI components bind directly to this state, ensuring that edits in the table are reflected in the export.

---

## 📥 Stage 10: Export Flow
*   **Action**: Converts the `invoiceResults` state into a physical `.xlsx` or `.csv` file.
*   **Parity**: Since the UI and Export share the same state object, they are guaranteed to be identical.

---

## 🚨 Stage 11: Pipeline Nature
*   **Sequential Dependency**: The pipeline is linear. If **Segmentation** fails, the AI in **Extraction** receives a corrupt segment, and the **Table Reconstructor** attempt to fix a table that doesn't exist. There is no backward-propagation of corrections.

---
**Status**: Read-Only Analysis Complete
**Analyst**: Senior System Behavior Explainer
