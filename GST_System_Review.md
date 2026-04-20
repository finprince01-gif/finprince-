# GST System Blueprint & Technical Review

## 1. Overview
The GST (Goods and Services Tax) module in **AI-accounting-0.03** is designed to automate the generation of statutory tax returns from operational accounting data. Currently, the system provides comprehensive support for **GSTR-1 (Outward Supplies)**, while GSTR-2 and GSTR-3B are planned for future releases.

---

## 2. Core Functional Flow

### A. Data Capture
GST data is not entered separately; it is derived automatically from the **Sales Voucher Pipeline**:
1. **Sales Invoice Creation**: When a Sales Voucher is created, the system captures:
   - Customer GSTIN (Registered vs. Unregistered classification).
   - Place of Supply (POS) derived from GSTIN or State Type.
   - Item-level taxes (CGST, SGST, IGST, Cess).
   - HSN/SAC codes for each line item.
2. **Tax Computation**: The system calculates taxes based on the `state_type` ('within' for CGST/SGST, 'other' for IGST, and 'export' for Export Zero-rated/WPAY).

### B. GSTR-1 Engine (Outward Supplies)
The GSTR-1 engine classifies sales into government-mandated categories:

| Category | Logical Condition | Aggregation Level |
| :--- | :--- | :--- |
| **B2B** | Customer has a valid GSTIN | Invoice Level |
| **B2CL (B2C Large)** | No GSTIN + Interstate Supply + Value > ₹2.5L | Invoice Level |
| **B2C Small (B2CS)** | No GSTIN + (Intrastate OR Interstate < ₹2.5L) | Aggregated by POS |
| **Export (EXP)** | `state_type` = 'export' | Invoice Level |
| **HSN Summary** | All sales items | Aggregated by HSN + UOM + Rate |
| **DOC Details** | Sequence range of vouchers | Summary (Start/End No) |

---

## 3. Technical Architecture

### Backend implementation (`views_gst.py`)
- **Controller**: `GSTR1ViewSet` (Django Rest Framework).
- **Data Access**: Directly queries `VoucherSalesInvoiceDetails` and `VoucherSalesItems`.
- **Date Logic**: Implements Indian Financial Year logic (April to March).
- **Pandas Integration**: Uses the **Pandas** library for complex HSN aggregations to avoid database-level performance bottlenecks and ensure precision.

### Frontend implementation (`GSTR1.tsx`)
- **React State Management**: Tracks data for over 30 sub-tabs covering all GST schedules.
- **Dynamic Stats**: Real-time counter on tabs showing the number of records in each category.
- **Export Drivers**: 
  - `handleDownloadExcel`: Generates a multi-sheet .xlsx file compatible with the GST Offline Utility.
  - `handleDownloadJson`: Generates a .json file ready for direct upload to the GST Portal.

---

## 4. Current Implementation Status

### ✅ Completed (GSTR-1)
- [x] B2B, B2CL, B2CS classification logic.
- [x] Export (EXP) data extraction.
- [x] HSN/SAC Summary (Split by B2B/B2C).
- [x] Document sequence tracking.
- [x] Advance Tax Adjustment (ATADJ) basic tracking.
- [x] Government-compliant Excel template generation.
- [x] GST Portal compatible JSON export.

### ⏳ In Progress / Future Scope
- **GSTR-2 (Inward Supplies)**: Planned for Purchase/Input Tax Credit (ITC) reconciliation.
- **GSTR-3B (Monthly Summary)**: Planned for auto-computation of liabilities and ITC set-off.
- **Amendments (B2BA, B2CLA, etc.)**: Shells are ready in the UI; backend logic for historical amendments is pending.
- **E-commerce (ECO)**: Shells for e-commerce supplies are included in the UI.

---

## 5. Summary Recommendation
The GST flow is robustly integrated into the sales cycle. To maximize the value of this module, users should ensure that:
1. **GSTINs** are correctly entered in the Customer Master.
2. **HSN codes** are mandatory for all products in the Inventory/Item Master.
3. **State Type** (Within/Other/Export) is accurately set during invoice creation.
