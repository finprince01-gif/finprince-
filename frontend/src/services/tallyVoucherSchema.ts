// ════════════════════════════════════════════════════════════════════════════════
// OFFICIAL TALLY VOUCHER HEADERS  — Strict Schema v1.0
// ════════════════════════════════════════════════════════════════════════════════
//
// ⚠️  SCOPE:  Upload Invoices → Tally → Voucher  ONLY
//
// Contract Rules:
//   ✅  Must contain ONLY official Tally export column names
//   ✅  Case-sensitive, space-sensitive matching enforced
//   ❌  Must NOT reuse internal DB names
//   ❌  Must NOT reuse Finpixe AI Scan headers
//   ❌  Must NOT include calculated fields (e.g., Total IGST, Total Taxable Value)
//   ❌  Must NOT include system/convenience fields (e.g., Vendor Name, Customer Name)
//   ❌  Must NOT share constants with Sales / Purchase / Payment schemas
//   ❌  Must NOT depend on VOUCHER_COLUMN_SCHEMAS or any other voucher schema
//
// Any modification must preserve strict Tally compliance.
// ════════════════════════════════════════════════════════════════════════════════

export const OFFICIAL_TALLY_VOUCHER_HEADERS: readonly string[] = [
    // ── Voucher Identification ────────────────────────────────────────────────
    "Voucher Type Name",
    "Voucher Date",
    "Voucher Number",
    "Voucher Number Series Name",
    "Reference No.",
    "Reference Date",
    "Voucher Narration",
    "Cost Centre/Classes",
    "Voucher Class",
    "Voucher Effective Date",
    "Voucher Applicable Upto",
    "Price Level",
    "Name on Receipt",

    // ── GST Registration ──────────────────────────────────────────────────────
    "GST Registration",

    // ── Ledger Details ────────────────────────────────────────────────────────
    "Ledger Name",
    "Ledger Amount",
    "Ledger Rate",
    "Ledger Amount Dr/Cr",
    "Ledger Narration",
    "Description of Ledger",
    "Type of Tax Payment",

    // ── Inventory / Item Details ──────────────────────────────────────────────
    "Item Name",
    "Item Description",
    "Actual Quantity",
    "Billed Quantity",
    "Quantity UOM",
    "Item Rate",
    "Item Rate per",
    "Disc%",
    "Item Amount",
    "MRP/Marginal",
    "Discount Rate (Cash/Trade)",
    "Discount Amount (Cash/Trade)",

    // ── Shipping / Dispatch ───────────────────────────────────────────────────
    "Marks",
    "No. of Packages",
    "Order No(s)",
    "Order - Date",
    "Mode/Terms of Payment",
    "Other References",
    "Terms of Delivery",
    "Delivery Note No./Receipt Note No./Challan No./Tracking No.",
    "Delivery Note Date/Receipt Note Date/Challan Date/Tracking Date",
    "Dispatch Doc No. /Receipt Doc No./Challan Doc No.",
    "Dispatched through",
    "Destination",
    "Carrier Name/Agent",
    "Bill of lading/LR RR No.",
    "Bill of lading/LR RR No. - Date",
    "Motor Vehicle No.",
    "Place of Receipt by Shipper",
    "Vessel/Flight No.",
    "Port of Loading",
    "Port of Discharge",
    "Country to",
    "Shipping Bill No.",
    "Shipping Bill Date",
    "Port Code",
    "Bill of Entry No.",
    "Bill of Entry Date",

    // ── Debit / Credit Note ───────────────────────────────────────────────────
    "Buyer's Debit Note No.",
    "Buyer's Debit Note - Date",
    "Supplier's Debit/Credit Note No.",
    "Supplier's Debit/Credit Note - Date",
    "Reason for Issuing Note",

    // ── Item Allocations ──────────────────────────────────────────────────────
    "Item Allocations - Tracking No.",
    "Item Allocations - Order No.",
    "Item Allocations - Batch/Lot No.",
    "Item Allocations - Actual Quantity",
    "Item Allocations - Billed Quantity",
    "Item Allocations - UOM",
    "Item Allocations - Rate",
    "Item Allocations - Rate per",
    "Item Allocations - Amount",
    "Item Allocations - Mfg. Date",
    "Item Allocations - Expiry Date",
    "Item Allocations - Order Due on",
    "Item Allocations - Pre-Close Quantity",
    "Item Allocations - Reason for Pre-Close",
    "Item Allocations - Pre-Close Date",
    "Item Allocations - Disc%",
    "Item Allocations - Cost Tracking To",

    // ── Bill / Reference Allocations ──────────────────────────────────────────
    "Bill Type of Ref",
    "Bill Name",
    "Bill Amount",
    "Bill Amount - Dr/Cr",
    "Bill Due Dt or Credit Days",

    // ── Interest Details ──────────────────────────────────────────────────────
    "Interest - on",
    "Interest - From Date",
    "Interest - To Date",
    "Interest - % per",
    "Interest - Rate",
    "Interest - Applicability",
    "Interest - By",
    "Interest - Rounding",
    "Interest - Limit",

    // ── Cost Centre Allocations ───────────────────────────────────────────────
    "Category Name",
    "Cost Allocation for - Cost Centre",
    "Cost Allocation for - Amount",

    // ── Credit Note References ────────────────────────────────────────────────
    "Original Invoice No.",
    "Original Invoice - Date",
    "Original Sales Invoice Value for Credit Note",

    // ── e-Invoice ─────────────────────────────────────────────────────────────
    "e-Invoice - Ack No.",
    "e-Invoice - Ack Date",
    "e-Invoice - IRN",
    "e-Invoice - Bill to place",
    "e-Invoice - Ship to place",
    "e-Invoice - Dispatch From Name",
    "e-Invoice - Dispatch From Address",
    "e-Invoice - Dispatch From State",
    "e-Invoice - Dispatch From Pincode",
    "e-Invoice - Dispatch From Place",
    "e-Invoice Cancellation - Reason for Cancellation",
    "e-Invoice Cancellation - Remarks",

    // ── e-Way Bill ────────────────────────────────────────────────────────────
    "e-Way Bill No.",
    "e-Way Bill Date",
    "Consolidated e-Way Bill No.",
    "Consolidated e-Way Bill Date",
    "e-Way Bill - Sub-Type",
    "e-Way Bill - Document Type",

    // ── Consignor Details ─────────────────────────────────────────────────────
    "Consignor Details (From) - Address-1",
    "Consignor Details (From) - Address-2",
    "Consignor Details (From) - Address Type",
    "Consignor Details (From) - Pincode",
    "Consignor Details (From) - Place",
    "Consignor Details (From) - Actual State",

    // ── Consignee Details ─────────────────────────────────────────────────────
    "Consignee Details (To) - Address-1",
    "Consignee Details (To) - Address-2",
    "Consignee Details (To) - Address Type",
    "Consignee Details (To) - Place",
    "Consignee Details (To) - Actual State",
    "Consignee Details (To) - Pincode",

    // ── e-Way Bill Transport Details ──────────────────────────────────────────
    "e-Way Bill Transport Details - Pin to Pin Distance as per Portal",
    "e-Way Bill Transport Details - Transporter Name",
    "e-Way Bill Transport Details - Transporter ID",
    "e-Way Bill Transport Details - Mode",
    "e-Way Bill Transport Details - Doc/Lading/RR/Airway No.",
    "e-Way Bill Transport Details - Doc/Lading/RR/Airway Date",
    "e-Way Bill Transport Details - Vehicle Number",
    "e-Way Bill Transport Details - Vehicle Type",
    "e-Way Bill Transport Details - Place",
    "e-Way Bill Transport Details - State",
    "e-Way Bill Transport Details - Reason",
    "e-Way Bill Transport Details - Remarks",

    // ── e-Way Bill Extension Details ──────────────────────────────────────────
    "e-Way Bill Extension Details - Remaining Distance(in KM)",
    "e-Way Bill Extension Details - Mode",
    "e-Way Bill Extension Details - Doc/Lading/RR/Airway No.",
    "e-Way Bill Extension Details - Doc/Lading/RR/Airway - Date",
    "e-Way Bill Extension Details - Vehicle Number",
    "e-Way Bill Extension Details - Vehicle Type",
    "e-Way Bill Extension Details - Transit Type",
    "e-Way Bill Extension Details - Address 1",
    "e-Way Bill Extension Details - Address 2",
    "e-Way Bill Extension Details - Address 3",
    "e-Way Bill Extension Details - Current Pincode",
    "e-Way Bill Extension Details - Current Place",
    "e-Way Bill Extension Details - Current State",
    "e-Way Bill Extension Details - Reason",
    "e-Way Bill Extension Details - Remarks",

    // ── e-Way Bill Cancellation ───────────────────────────────────────────────
    "e-Way Bill Cancellation Details - Reason",
    "e-Way Bill Cancellation Details - Remarks",

    // ── GST Rate Details ──────────────────────────────────────────────────────
    "GST Rate Details",
    "GST Source of Details",
    "GST Source Type of Master",
    "GST Taxability Type",
    "GST Nature of Transaction",
    "GST Classification",
    "IGST Rate",
    "CGST Rate",
    "SGST/UTGST Rate",
    "Cess Rate",
    "Cess Rate Per Unit",
    "State Cess Rate",
    "Applicable for Reverse Charge",
    "Eligible for Input Tax Credit",
    "Taxable Value",

    // ── HSN / SAC Details ─────────────────────────────────────────────────────
    "HSN/SAC Details",
    "HSN/SAC Source of Details",
    "HSN/SAC Source Type of Master",
    "HSN/SAC Classification",
    "HSN/SAC",
    "HSN Description",

    // ── Buyer / Supplier ──────────────────────────────────────────────────────
    "Buyer/Supplier - Bill to/from",
    "Buyer/Supplier - Address Type",
    "Buyer/Supplier - Mailing Name",
    "Buyer/Supplier - Address",
    "Buyer/Supplier - Country",
    "Buyer/Supplier - State",
    "Buyer/Supplier - GST Registration Type",
    "Buyer/Supplier - Assessee of Other Territory",
    "Buyer/Supplier - GSTIN/UIN",
    "Buyer/Supplier - Is Bill of Entry available",
    "Buyer/Supplier - Supplies under section 7 of IGST Act",
    "Buyer/Supplier - Place of Supply",

    // ── Consignee (Ship To) ───────────────────────────────────────────────────
    "Consignee (ship to)",
    "Consignee - Mailing Name",
    "Consignee - Address Type",
    "Consignee - Address",
    "Consignee - State",
    "Consignee - Country",
    "Consignee - GSTIN/UIN",

    // ── Stat Adjustment (GST) ─────────────────────────────────────────────────
    "Stat Adjustment (GST) - Type of Duty/Tax",
    "Stat Adjustment (GST) - Nature of Adjustment",
    "Stat Adjustment (GST) - Additional Nature of Adjustment",
    "Stat Adjustment (GST) - Rate",
    "Stat Adjustment (GST) - Taxable Value",
    "Stat Adjustment (GST) - ISD Invoice/Debit/Credit Note No.",
    "Stat Adjustment (GST) - ISD Invoice/Debit/Credit Note Date",
    "Stat Adjustment (GST) - Eligible for Input Tax Credit",
    "Stat Adjustment (GST) - Type of Supply",

    // ── Type of Supply ────────────────────────────────────────────────────────
    "Type of Supply",

    // ── Advance Payment / Receipt / Refund Details ────────────────────────────
    "Advance Payment/Receipt/Refund Details - IGST Rate",
    "Advance Payment/Receipt/Refund Details - IGST Amount",
    "Advance Payment/Receipt/Refund Details - SGST Rate",
    "Advance Payment/Receipt/Refund Details - SGST Amount",
    "Advance Payment/Receipt/Refund Details - CGST Rate",
    "Advance Payment/Receipt/Refund Details - CGST Amount",
    "Advance Payment/Receipt/Refund Details - Cess Rate",
    "Advance Payment/Receipt/Refund Details - Cess Amount",
    "Advance Payment/Receipt/Refund Details - Cess Rate Per Unit",
    "Advance Payment/Receipt/Refund Details - Cess per Unit Amount",

    // ── Tax Type Allocations ──────────────────────────────────────────────────
    "Tax Type Allocations - IGST Liability",
    "Tax Type Allocations - CGST Liability",
    "Tax Type Allocations - SGST/UTGST Liability",
    "Tax Type Allocations - Cess Liability",

    // ── GST Advance Details ───────────────────────────────────────────────────
    "GST Advance Details - Month Year",
    "GST Advance Details - Place of Supply",
    "GST Advance Details - GST Rate",
    "GST Advance Details - Cess Rate",
    "GST Advance Details - Advance Amount",

    // ── TDS Details ───────────────────────────────────────────────────────────
    "TDS - Nature of Payments",
    "TDS - Assessable Value",
    "TDS Party Details - Party Name",
    "TDS Party Details - Deductee Type",
    "TDS Party Details - PAN Number",
    "TDS Bill Allocations - Type of Ref",
    "TDS Bill Allocations - Name",
    "TDS Bill Allocations - TDS Nature of Payment",
    "TDS Bill Allocations - Party Ledger",
    "TDS Bill Allocations - Expenses Ledger",
    "TDS Bill Allocations - Duty Ledger",
    "TDS Bill Allocations - Assessable Amount",
    "TDS Bill Allocations - Payable Amount",
    "TDS Bill Allocations - Paid Amount",

    // ── TCS Details ───────────────────────────────────────────────────────────
    "TCS - Nature of Goods",
    "TCS - Assessable Value",
    "Exemption from TCS for Buyer-Deductible TDS",
    "TCS Party Details - Party Name",
    "TCS Party Details - Collectee Type",
    "TCS Party Details - PAN Number",
    "TCS Bill Allocations - Type of Ref",
    "TCS Bill Allocations - Name",
    "TCS Bill Allocations - TCS Nature of Goods",
    "TCS Bill Allocations - Party Ledger",
    "TCS Bill Allocations - Income Ledger",
    "TCS Bill Allocations - Duty Ledger",
    "TCS Bill Allocations - Assessable Amount",
    "TCS Bill Allocations - Payable Amount",
    "TCS Bill Allocations - Paid Amount",

    // ── Stat Payment (GST) ────────────────────────────────────────────────────
    "Stat Payment (GST) - Tax Type",
    "Stat Payment (GST) - Type of Payment",
    "Stat Payment (GST) - Period From",
    "Stat Payment (GST) - Period To",

    // ── Stat Payment (TDS) ────────────────────────────────────────────────────
    "Stat Payment (TDS) - Tax Type",
    "Stat Payment (TDS) - Period From",
    "Stat Payment (TDS) - Period To",
    "Stat Payment (TDS) - Section",
    "Stat Payment (TDS) - Nature of Payment",
    "Stat Payment (TDS) - Deductee Status",
    "Stat Payment (TDS) - Residential Status",
    "Stat Payment (TDS) - Cheque No.",
    "Stat Payment (TDS) - Cheque Date",
    "Stat Payment (TDS) - BSR Code",
    "Stat Payment (TDS) - Challan No.",
    "Stat Payment (TDS) - Challan Date",
    "Stat Payment (TDS) - Bank Name",
    "Stat Payment (TDS) - Branch Name",

    // ── Stat Payment (TCS) ────────────────────────────────────────────────────
    "Stat Payment (TCS) - Tax Type",
    "Stat Payment (TCS) - Period From",
    "Stat Payment (TCS) - Period To",
    "Stat Payment (TCS) - Section",
    "Stat Payment (TCS) - Nature of Goods",
    "Stat Payment (TCS) - Deductee Status",
    "Stat Payment (TCS) - Residential Status",
    "Stat Payment (TCS) - Cheque No.",
    "Stat Payment (TCS) - Cheque Date",
    "Stat Payment (TCS) - BSR Code",
    "Stat Payment (TCS) - Challan No.",
    "Stat Payment (TCS) - Challan Date",
    "Stat Payment (TCS) - Bank Name",
    "Stat Payment (TCS) - Branch Name",
] as const;

// ── O(1) whitelist Set for strict case-sensitive validation ──────────────────
export const OFFICIAL_TALLY_VOUCHER_SET: ReadonlySet<string> =
    new Set(OFFICIAL_TALLY_VOUCHER_HEADERS);

// ════════════════════════════════════════════════════════════════════════════════
// STRICT VALIDATION UTILITIES
//   - Case-sensitive match (no toUpperCase/toLowerCase)
//   - Space-sensitive match (no trim on the header key)
//   - Reject entire upload if ANY invalid column exists
//   - Show exact invalid column name in error
// ════════════════════════════════════════════════════════════════════════════════

export interface TallyVoucherValidationResult {
    valid: boolean;
    invalidColumns: string[];
    errorMessage: string | null;
}

/**
 * Validates an array of column names against the OFFICIAL_TALLY_VOUCHER_HEADERS.
 * Matching is STRICT — case-sensitive and space-sensitive.
 * A single invalid column causes the entire upload to be rejected.
 *
 * @param columns - The actual column headers from the uploaded file
 * @returns TallyVoucherValidationResult
 */
export const validateTallyVoucherColumns = (
    columns: string[]
): TallyVoucherValidationResult => {
    const invalidColumns = columns.filter(
        (col) => !OFFICIAL_TALLY_VOUCHER_SET.has(col)
    );

    if (invalidColumns.length === 0) {
        return { valid: true, invalidColumns: [], errorMessage: null };
    }

    const errorMessage =
        `Tally Voucher upload rejected: ${invalidColumns.length} invalid column(s) found.\n` +
        `Invalid columns: ${invalidColumns.map((c) => `"${c}"`).join(', ')}.\n` +
        `Only official Tally Voucher headers are permitted. No trimming, aliasing, or auto-correction is applied.`;

    return { valid: false, invalidColumns, errorMessage };
};
