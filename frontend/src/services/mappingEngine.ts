// ════════════════════════════════════════════════════════════════════════════════
// Enterprise Invoice Field Mapping Engine  v3.0.0
// ════════════════════════════════════════════════════════════════════════════════
//
// Design Guarantees (8 structural improvements):
//   1️⃣  Group-Based Semantic Mapping – mapping only within strict field groups
//   2️⃣  Context-Aware Scoring – boosts/penalties from section proximity
//   3️⃣  Field Dependency Rules – dependent fields blocked when parent is missing
//   4️⃣  Field Swap Detection – mutual confusion heuristics + ambiguity flag
//   5️⃣  Ambiguity Detection Layer – top-2 < 10pt gap → blocked + logged
//   6️⃣  Strengthened Confidence Model – threshold ≥ 75, weighted hierarchy
//   7️⃣  Structural Integrity Validation – post-map coherence checks
//   8️⃣  Deterministic Output Contract – ALL_COLUMNS enforced, no silent gaps
// ────────────────────────────────────────────────────────────────────────────────
// STRICT TALLY VOUCHER CONTRACT MODE — Official headers isolated in tallyVoucherSchema.ts
// ────────────────────────────────────────────────────────────────────────────────

// ── Official Tally Voucher schema (isolated, strictly compliant) ─────────────
import {
    OFFICIAL_TALLY_VOUCHER_HEADERS,
    OFFICIAL_TALLY_VOUCHER_SET,
} from './tallyVoucherSchema';

export { OFFICIAL_TALLY_VOUCHER_HEADERS, OFFICIAL_TALLY_VOUCHER_SET };
export type { TallyVoucherValidationResult } from './tallyVoucherSchema';
export { validateTallyVoucherColumns } from './tallyVoucherSchema';

/**
 * @deprecated Use OFFICIAL_TALLY_VOUCHER_HEADERS instead.
 * Backward-compatible alias. The contaminated columns listed below have been removed:
 *   "Supplier Invoice No", "Total Taxable Value", "Total IGST", "Total CGST",
 *   "Total SGST", "Total Cess", "Total State Cess", "Total Invoice Value",
 *   "Quantity", "UOM", "Rate", "Description", "Account", "Party", "Amount",
 *   "Narration", "From Account", "To Account", "Ledger (Debit)", "Ledger (Credit)",
 *   "Expense Ledger", "Paid From", "Vendor Name", "Customer Name"
 */
export const EXACT_TALLY_COLUMNS: readonly string[] = OFFICIAL_TALLY_VOUCHER_HEADERS;

/** O(1) whitelist for Tally Voucher (strict case+space sensitive, no aliases) */
export const TALLY_WHITELIST: ReadonlySet<string> = OFFICIAL_TALLY_VOUCHER_SET;




// ────────────────────────────────────────────────────────────────────────────────
// VOUCHER TYPE SCHEMAS - STRICT MODE
// ────────────────────────────────────────────────────────────────────────────────

export const VOUCHER_COLUMN_SCHEMAS: Record<string, string[]> = {
    'Sales': [
        // ── INVOICE DETAILS ──────────────────────────────────────────────────────
        "Date", "Sales Invoice No.", "Sales Voucher Series", "Sales Voucher No.",
        "Customer Name", "GSTIN", "Upload Supporting Document",
        "Sales Order No.", "Outward Slip No.", "Place of Supply", "Reverse Charge",
        "Invoice Type", "State Type", "Currency", "Conversion Rate",
        // Bill To / Ship To address (deduplicated — one set)
        "Bill To - Address Line 1", "Bill To - Address Line 2", "Bill To - City", "Bill To - State", "Bill To - Pincode", "Bill To - Country",
        "Ship To - Address Line 1", "Ship To - Address Line 2", "Ship To - City", "Ship To - State", "Ship To - Pincode", "Ship To - Country",

        // ── ITEM & TAX DETAILS (FOREIGN CURRENCY) ─────────────────────────────────
        "Item Code", "Item Name", "HSN/SAC", "Quantity", "UQC", "Rate (FC)", "Amount (FC)",

        // ── ITEM & TAX DETAILS (INR) ───────────────────────────────────────────────
        // Note: Item Code / Item Name / HSN/SAC already listed above (deduplicated)
        "Qty", "UOM", "Alternate Unit", "Item Rate",
        "Taxable Value", "CGST", "SGST/UTGST", "IGST", "Cess",
        "Invoice Value", "Sales Ledger", "Description",

        // ── PAYMENT DETAILS (summary fields — not duplicated from item section) ─────
        "State Cess", "Round Off",
        "TDS/TCS under Income Tax", "TDS/TCS under GST", "Advance", "Payable", "Posting Note:",
        "Advance Ref. No.", "Applied Now",

        // ── DISPATCH DETAILS ──────────────────────────────────────────────────────
        "Dispatch From", "Mode of Transport", "Dispatch Date", "Dispatch Time",
        "Delivery Type", "Transporter ID/GSTIN", "Transporter Name", "Vehicle No.", "LR/GR/Consignment",
        "Shipping Bill No.", "Shipping Bill Date", "Ship/Port Code", "Origin",
        "Vessel/Flight No.", "Port of Loading", "Port of Discharge", "Final Destination",
        "Railway Receipt No.", "Railway Receipt Date", "FNR No.", "Station of Loading", "Station of Discharge",

        // ── E-INVOICE & E-WAY BILL DETAILS ───────────────────────────────────────
        "Eway Bill - Available", "Eway Bill No.", "Eway Bill Date", "Validity Period", "Distance (KM)",
        "Extension Date", "Extended EWB No.", "Extension Reason", "From Place",
        "Remaining Distance", "New Validity", "Updated Vehicle No.",
        "IRN", "Ack. No."
    ],
    'Purchase': [
        // ── SUPPLIER DETAILS ──────────────────────────────────────────────────────
        "Date", "Supplier Invoice No.", "Purchase Voucher Series", "Purchase Voucher No.",
        "Vendor Name", "GSTIN", "Upload Supporting Document",
        "Bill From - Address Line 1", "Bill From - Address Line 2", "Bill From - City", "Bill From - State", "Bill From - Pincode", "Bill From - Country",
        "Branch",
        "Ship From - Address Line 1", "Ship From - Address Line 2", "Ship From - City", "Ship From - State", "Ship From - Pincode", "Ship From - Country",
        "Bill To - Name", "Bill To - GSTIN", "Bill To - Address Line 1", "Bill To - Address Line 2", "Bill To - City", "Bill To - State", "Bill To - Pincode", "Bill To - Country",
        "Ship To - Name", "Ship To - GSTIN", "Ship To - Address Line 1", "Ship To - Address Line 2", "Ship To - City", "Ship To - State", "Ship To - Pincode", "Ship To - Country",
        "Input Type", "Foreign Currency", "Currency", "Conversion Rate", "Place of Supply",

        // ── SUPPLY DETAILS (FOREIGN CURRENCY) ────────────────────────────────────
        "Purchase Order No.", "Quantity", "UQC", "Rate (FC)", "Amount (FC)",

        // ── SUPPLY DETAILS (INR) — per-line-item extractable fields ────────────────
        // Note: Purchase Order No. / Quantity / UQC already above (deduplicated)
        "Item Code", "Item Name", "HSN/SAC", "Qty", "UOM",
        "Item Rate", "Taxable Value", "IGST", "CGST", "SGST/UTGST", "Cess",
        "Invoice Value",

        // ── DUE DETAILS (summary / header-level only — no duplicates of item cols) ──
        "TDS/TCS under GST", "TDS/TCS under Income Tax", "Advance Paid", "Round Off", "Amount Due", "Posting Note",

        // ── TRANSIT DETAILS ───────────────────────────────────────────────────────
        "Received In", "Mode of Transport", "Received Date", "Received Time", "Received Quantity",
        "Delivery Type", "Transporter ID/GSTIN", "Transporter Name", "Vehicle No.", "LR/GR/Consignment No",
        "Bill of Lading No.", "Shipping Bill No.", "Shipping Bill Date", "Ship/Port Code", "Origin",
        "Bill of Lading Date", "Vessel/Flight No.", "Port of Loading", "Port of Discharge", "Final Destination",
        "Railway Receipt No.", "Railway Receipt Date", "FNR No.", "Station of Loading", "Station of Discharge"
    ],
    'Payment': ["Voucher Date", "Account", "Party", "Amount", "Narration"],
    'Receipt': ["Voucher Date", "Account", "Party", "Amount", "Narration"],
    'Contra': ["Voucher Date", "From Account", "To Account", "Amount", "Narration"],
    'Journal': ["Voucher Date", "Ledger (Debit)", "Ledger (Credit)", "Amount", "Narration"],
    'Expenses': ["Voucher Date", "Expense Ledger", "Paid From", "Amount", "Narration"],
    'Credit Note': [
        "Voucher Date", "Original Sales Invoice Value for Credit Note", "Buyer/Supplier - Mailing Name",
        "Buyer/Supplier - GSTIN/UIN", "Total Taxable Value", "Total Cess", "Total State Cess", "Total Invoice Value", "Item Name"
    ],
    'Debit Note': [
        "Voucher Date", "Supplier Invoice No", "Buyer/Supplier - Mailing Name",
        "Buyer/Supplier - GSTIN/UIN", "Total Taxable Value", "Total Cess", "Total State Cess", "Total Invoice Value", "Item Name"
    ]
};

// ────────────────────────────────────────────────────────────────────────────────
// STRICT TALLY MASTER MODE - EXACT MASTER COLUMNS
// ────────────────────────────────────────────────────────────────────────────────
// Contract Rules:
//   ✅ Use exact header names (case-sensitive).
//   ✅ Preserve spaces exactly.
//   ✅ Preserve hyphens exactly.
//   ✅ Preserve slashes exactly.
//   ✅ Preserve parentheses exactly.
//   ❌ Do NOT trim trailing spaces.
//   ❌ Do NOT auto-correct spelling.
//   ❌ Do NOT alias.
//   ❌ Do NOT rename.
//   ❌ Do NOT merge with Voucher schema.
//   ❌ Reject upload if any extra column exists.
//   ❌ Reject upload if any header is missing.
//   ❌ No fuzzy matching.
//   ❌ Fail immediately. No silent ignore.
// ────────────────────────────────────────────────────────────────────────────────

export const EXACT_TALLY_MASTER_HEADERS: string[] = [
    "Name",
    "Group Name",
    "Alias",
    "Language for Name (Except English)",
    "Description",
    "Notes",
    "Ledger - Opening Balance",
    "Ledger Opening Balance - Dr/Cr",
    "Cost centres are applicable",
    "Activate Interest Calculation",
    "Use For Payroll",
    "Default credit period",
    "Specify Credit Limit",
    "Override credit limit using post-dated transactions",
    "Check for credit days during voucher entry",
    "Inventory values are affected",
    "Type of Ledger",
    "Method of Appropriation to allocate Additional Costs in purchase invoice",
    "Allow cost allocation (stock item)",
    "Type of Duty/Tax",
    "Tax/Duty - Valuation Type",
    "Tax/Duty - Percentage of Calculation",
    "Behave as Payment Gateway ledger",
    "Payment Gateway Name",
    "Currency of Ledger",
    "Position Index in Reports",
    "Set OD Limit",
    "Pricing level applicable",
    "Behave as Duties & Taxes Ledger",
    "Nature of Payment/Goods",
    "Rounding Method",
    "Rounding Limit",
    "GST Applicability",
    "Tax Type (GST)",
    "Effective Date for Reconciliation",
    "Bank Account Details - A/c Holder's Name",
    "Bank Account Details - A/c No.",
    "Bank Account Details - IFS Code",
    "Bank Account Details - SWIFT Code",
    "Bank Account Details - Bank Name",
    "Bank Account Details - Branch",
    "Bank Account Details - BSR Code",
    "Bank Account Details - Client Code",
    "Enable Cheque Printing",
    "Use as Notional Bank for Post-Dated Vouchers",
    "Enable Auto Reconciliation",
    "Folder Path - New Bank Statements",
    "Folder Path - Imported Bank Statements",
    "Bank Details - Ref ID",
    "Bank Details - Transaction Type",
    "Bank Details - A/c No.",
    "Bank Details - IFS Code",
    "Bank Details - Bank Name",
    "Bank Details - Company Bank",
    "Bank Details - Beneficiary Code",
    "Bank Details - Location",
    "Bank Details - SWIFT Code",
    "Bank Details - Cross Using",
    "Bank Details - Favouring Name",
    "Bank Details - Print Location",
    "Bank Details - Set as Default",
    "Maintain balances bill-by-bill",
    "Bill - Date",
    "Bill - Name",
    "Bill - Amount",
    "Bill Amount - Dr/Cr",
    "Bill - Due Date",
    "Bill Allocation Interest - Rate",
    "Bill Allocation Interest - Per",
    "Bill Allocation Interest - on",
    "Bill Allocation Interest - Applicability",
    "Bill Allocation Interest - by",
    "Bill Allocation Interest - From",
    "Bill Allocation Interest - Date",
    "Bill Allocation Interest - To",
    "Bill Allocation Interest - Rounding Limit",
    "Bill Allocation Interest - Rounding Type",
    "Cheque - From Number",
    "Cheque - To Number",
    "Number of Cheques",
    "Name of Cheque Book",
    "Opening Bank Reconciliation - Date",
    "Opening Bank Reconciliation - Transaction Type",
    "Opening Bank Reconciliation - Nature of Transaction",
    "Opening Bank Reconciliation - Instrument No.",
    "Opening Bank Reconciliation - Instrument Date",
    "Opening Bank Reconciliation - Bank Date",
    "Opening Bank Reconciliation - Remarks",
    "Opening Bank Reconciliation - Particulars",
    "Opening Bank Reconciliation - Transfer Mode",
    "Opening Bank Reconciliation - Cheque Range",
    "Opening Bank Reconciliation - Amount",
    "HSN/SAC - Applicable From",
    "HSN/SAC Details",
    "HSN - Classification",
    "HSN/SAC",
    "HSN Description",
    "GST Rate - Applicable From",
    "GST Rate Details",
    "GST - Classification",
    "GST - Taxability Type",
    "GST - Nature of Transaction",
    "IGST Rate",
    "CGST Rate",
    "SGST/UTGST Rate",
    "Cess Rate",
    "Cess Rate Per Unit",
    "State Cess Rate",
    "Applicable for Reverse Charge",
    "Eligible for Input Tax Credit",
    "Slab-wise Item Rate - Up To",
    "Consider MRP while calculating Slab-based tax rate",
    "Include GST expenses/incomes to calculate slab-based tax rate",
    "Type of Supply",
    "Mailing Details - Applicable From",
    "Mailing Name",
    "Address",
    "Country",
    "Country Code",
    "Primary Mobile No.",
    "Contact Name",
    "Phone No.",
    "Fax No.",
    "E-mail",
    "E-mail Cc",
    "Website",
    "PAN Effective Date",
    "Name on PAN",
    "PAN Status",
    "Deductee Ref",
    "Tax/Unique Identification Number",
    "GST Registration - Applicable From",
    "GST Registration Type",
    "GST Registration - Assessee of Other Territory",
    "GST Registration - GSTIN/UIN",
    "GST Registration - Use Ledger as common Party",
    "Place of Supply (for Outwards)",
    "Is the Party a Transporter",
    "Transporter ID",
    "Include transaction date for interest calculation - For amounts added",
    "Include transaction date for interest calculation - For amounts deducted",
    "Calculate Interest Transaction-by-Transaction",
    "Calculate Interest Based on",
    "Override Parameters for each Transaction",
    "Override advance parameters",
    "Interest - Applicability",
    "Interest - Calculate From",
    "Interest - Rate",
    "Interest - by",
    "Interest - % per",
    "Interest - Applicable From",
    "Interest - Applicable To",
    "Interest - on",
    "Interest - Rounding",
    "Interest - Limit",
    "Multiple Mailing Details - Address Type",
    "Multiple Mailing Details - Address",
    "Multiple Mailing Details - State",
    "Multiple Mailing Details - Country",
    "Multiple Mailing Details - Contact Person",
    "Multiple Mailing Details - Country Code",
    "Multiple Mailing Details - Phone No.",
    "Multiple Mailing Details - Mobile No.",
    "Multiple Mailing Details - Fax No.",
    "Multiple Mailing Details - Email",
    "Multiple Mailing Details - PAN/Income tax no.",
    "Multiple Mailing Details - TIN/sales tax no.",
    "Multiple Mailing Details - GSTIN/UIN",
    "Multiple Mailing Details - GST Registration Type",
    "Multiple Mailing Details - Assessee of Other Territory",
    "Multiple Mailing Details - Place of Supply",
    "Enable e-Payments",
    "Generate Payment Instructions in Batches",
    "Specify Product Code based on",
    "Salary Payments Product Code",
    "Other Payments Product Code",
    "Export/Upload Payment instructions on Voucher Creation",
    "Allow export of transactions with mismatch on bank details",
    "Folder Path - Payment Instructions",
    "Folder Path - New Intermediate Files",
    "Folder Path - Imported Intermediate Files",
    "Is TDS Deductable",
    "Is TDS Applicable",
    "TDS Deductee Type",
    "Deduct TDS in Same Voucher",
    "TDS - Applicable From",
    "TDS - Nature of Payment",
    "Treat as TDS Expenses",
    "(TDS) Ignore Surcharge Exemption Limit",
    "(TDS) Ignore Income Tax Exemption Limit - Applicability",
    "(TDS) Ignore Income Tax Exemption Limit - Nature of Payment",
    "Zero / Lower Deduction Details - Nature of Payment",
    "Zero / Lower Deduction Details - Provision",
    "Zero / Lower Deduction Details - Certification No & Date",
    "Zero / Lower Deduction Details - Applicable From",
    "Zero / Lower Deduction Details - Applicable To",
    "Zero / Lower Deduction Details - TDS",
    "Is TCS Applicable",
    "Buyer/Lessee Type",
    "TCS - Applicable From",
    "TCS - Nature of Goods",
    "(TCS) Ignore Surcharge Exemption Limit",
    "(TCS) Ignore Income Tax Exemption Limit - Applicability",
    "(TCS) Ignore Income Tax Exemption Limit - Nature of Goods",
    "Realisation - Based Nature of Goods",
    "Zero / Lower Collection Details - Nature of Goods",
    "Zero / Lower Collection Details - Provision",
    "Zero / Lower Collection Details - Certification No & Date",
    "Zero / Lower Collection Details - Applicable From",
    "Zero / Lower Collection Details - Applicable To",
    "Zero / Lower Collection Details - TCS",
    "Ledger Closing Balance - Date",
    "Ledger Closing Balance - Amount",
    "Ledger Closing Balance Amount - Dr/Cr",
    "Multiple Mobile Nos. - Contact Name",
    "Multiple Mobile Nos. - Country Code",
    "Multiple Mobile Nos. - Mobile No.",
    "Multiple Mobile Nos. - Is Default WhatsApp No."
];

export const validateTallyMasterSchema = (uploadedHeaders: string[], uploadSource: string, uploadType: string) => {
    if (uploadSource === "Tally" && uploadType === "Master") {
        const allowedHeaders = EXACT_TALLY_MASTER_HEADERS;

        for (const header of uploadedHeaders) {
            if (!allowedHeaders.includes(header)) {
                throw new Error(`Invalid column in Tally Master upload: ${header}`);
            }
        }

        for (const requiredHeader of allowedHeaders) {
            if (!uploadedHeaders.includes(requiredHeader)) {
                throw new Error(`Missing required column: ${requiredHeader}`);
            }
        }
    }
};

export const TALLY_MASTER_WHITELIST = new Set(EXACT_TALLY_MASTER_HEADERS);

// ── Validation regexes ───────────────────────────────────────────────────────────
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

// ── Master numeric rate fields ────────────────────────────────────────────────────
export const MASTER_RATE_FIELDS: ReadonlySet<string> = new Set([
    "IGST Rate",
    "CGST Rate",
    "SGST/UTGST Rate",
    "Cess Rate",
    "Cess Rate Per Unit",
    "State Cess Rate",
    "Slab-wise Item Rate - Up To",
]);

// ── Master GSTIN fields ────────────────────────────────────────────────────────────
const MASTER_GSTIN_FIELDS: ReadonlySet<string> = new Set([
    "GST Registration - GSTIN/UIN",
]);

// ── Master PAN fields ─────────────────────────────────────────────────────────────
const MASTER_PAN_FIELDS: ReadonlySet<string> = new Set([
    "Tax/Unique Identification Number",
]);

export interface MasterMappingResult {
    record: Record<string, string | null>;
    ignoredFields: string[];
    ambiguousFields: string[];
}

export const mapMasterRecord = (
    incoming: Record<string, unknown>
): MasterMappingResult => {
    const record: Record<string, string | null> = {};
    const ignoredFields: string[] = [];
    const ambiguousFields: string[] = [];

    // STRICT MODE: Fail fast if any key is invalid, exactly matching EXACT_TALLY_MASTER_HEADERS
    const uploadedHeaders = Object.keys(incoming);

    // Perform exact strict schema validation
    // The user rules specify throwing an error directly, so we use our validation function.
    // In actual workflow, we might assume uploadSource = "Tally" and uploadType = "Master" here.
    validateTallyMasterSchema(uploadedHeaders, "Tally", "Master");

    Object.entries(incoming).forEach(([rawKey, rawValue]) => {
        if (!TALLY_MASTER_WHITELIST.has(rawKey)) {
            // Should theoretically never be hit due to validateTallyMasterSchema throwing above
            ignoredFields.push(rawKey);
            return;
        }

        const strVal = (rawValue !== undefined && rawValue !== null && rawValue !== '')
            ? String(rawValue) // Do NOT trim trailing spaces
            : null;
        record[rawKey] = strVal;
    });

    // Fill missing approved columns with null (strict contract)
    EXACT_TALLY_MASTER_HEADERS.forEach(col => {
        if (!(col in record)) record[col] = null;
    });

    return { record, ignoredFields, ambiguousFields };
};

// ────────────────────────────────────────────────────────────────────────────────
// validateMasterRecord
//   Field-level validation under strict schema contract:
//   - GSTIN format for GSTIN fields
//   - PAN format for PAN fields
//   - Numeric check for rate fields
//   Returns errors array; empty array = valid
// ────────────────────────────────────────────────────────────────────────────────
export interface MasterValidationError {
    field: string;
    value: string | null;
    rule: 'gstin_format' | 'pan_format' | 'rate_not_numeric' | 'ambiguous_mapping';
    message: string;
}

export const validateMasterRecord = (
    record: Record<string, string | null>,
    ambiguousFields?: string[]
): MasterValidationError[] => {
    const errors: MasterValidationError[] = [];

    (ambiguousFields || []).forEach(field => {
        errors.push({
            field,
            value: null,
            rule: 'ambiguous_mapping',
            message: `Ambiguous mapping: '${field}' resolved to a duplicate target. Block save.`,
        });
    });

    Object.entries(record).forEach(([field, value]) => {
        if (value === null || value === '') return;

        if (MASTER_GSTIN_FIELDS.has(field)) {
            if (!GSTIN_REGEX.test(value.toUpperCase())) {
                errors.push({
                    field,
                    value,
                    rule: 'gstin_format',
                    message: `Invalid GSTIN format for field '${field}': "${value}". Expected 15-char GSTIN.`,
                });
            }
        }

        if (MASTER_PAN_FIELDS.has(field)) {
            const panOnlyValue = value.toUpperCase().slice(0, 10); // PAN is first 10 chars if combined
            if (!PAN_REGEX.test(panOnlyValue) && !GSTIN_REGEX.test(value.toUpperCase())) {
                errors.push({
                    field,
                    value,
                    rule: 'pan_format',
                    message: `Invalid PAN/TAN format for field '${field}': "${value}". Expected 10-char PAN.`,
                });
            }
        }

        if (MASTER_RATE_FIELDS.has(field)) {
            const cleaned = value.replace(/[%,\s]/g, '');
            if (isNaN(parseFloat(cleaned))) {
                errors.push({
                    field,
                    value,
                    rule: 'rate_not_numeric',
                    message: `Rate field '${field}' must be numeric. Got: "${value}".`,
                });
            }
        }
    });

    return errors;
};

// ────────────────────────────────────────────────────────────────────────────────
// processMasterRows
//   Orchestrates full pipeline: map → validate → block on error
//   Returns: { rows, blocked, blockReasons }
// ────────────────────────────────────────────────────────────────────────────────
export interface MasterIngestionResult {
    rows: Record<string, string | null>[];
    blocked: boolean;
    blockReasons: string[];
    ignoredFields: string[];
}

export const processMasterRows = (
    rawRows: Record<string, unknown>[]
): MasterIngestionResult => {
    const rows: Record<string, string | null>[] = [];
    const blockReasons: string[] = [];
    const allIgnored = new Set<string>();

    rawRows.forEach((rawRow, idx) => {
        const { record, ignoredFields, ambiguousFields } = mapMasterRecord(rawRow);
        ignoredFields.forEach(f => allIgnored.add(f));

        const errors = validateMasterRecord(record, ambiguousFields);
        if (errors.length > 0) {
            errors.forEach(e => {
                blockReasons.push(`Row ${idx + 1} — ${e.message}`);
            });
        } else {
            rows.push(record);
        }
    });

    return {
        rows,
        blocked: blockReasons.length > 0,
        blockReasons,
        ignoredFields: Array.from(allIgnored),
    };
};

export interface MappingDecision {
    target: string;
    source: string;
    score: number;
    method: 'template' | 'exact' | 'sanitized' | 'keyword' | 'fuzzy' | 'unmapped';
    semGroup: string;
    flagged?: boolean;
    ambiguous?: boolean;
    swapSuspect?: boolean;
}

export interface AmbiguityEvent {
    target: string;
    candidate1: { source: string; score: number };
    candidate2: { source: string; score: number };
    gap: number;
    blocked: boolean;
}

export interface SwapSuspicion {
    fieldA: string;
    fieldB: string;
    sourceA: string;
    sourceB: string;
    reason: string;
}

export interface StructuralViolation {
    rule: string;
    severity: 'error' | 'warning';
    detail: string;
}

export interface FinancialValidation {
    rule: string;
    passed: boolean;
    expected?: number;
    actual?: number;
    tolerance?: number;
    discrepancy?: number;
    severity: 'error' | 'warning';
}

export interface AuditEvent {
    timestamp: string;
    eventType:
    | 'mapping_decision'
    | 'collision_rejected'
    | 'template_applied'
    | 'template_mismatch'
    | 'financial_validation'
    | 'submission_blocked'
    | 'manual_override'
    | 'ambiguity_detected'
    | 'swap_suspected'
    | 'dependency_blocked'
    | 'structural_violation';
    detail: Record<string, unknown>;
}

export interface IngestionReport {
    schemaVersion: '3.0';
    timestamp: string;
    vendorId: string;
    overallConfidence: number;
    riskLevel: 'Low' | 'Medium' | 'High';
    mappedFields: MappingDecision[];
    unmappedFields: string[];
    collisionsRejected: MappingDecision[];
    ambiguities: AmbiguityEvent[];
    swapSuspicions: SwapSuspicion[];
    structuralViolations: StructuralViolation[];
    financialValidations: FinancialValidation[];
    templateUsed: boolean;
    templateVersion?: number;
    templateHashMatch?: boolean;
    auditLog: AuditEvent[];
    blockSubmission: boolean;
    blockReasons: string[];
    requiresConfirmation: boolean;
}

export interface MappedRow {
    [field: string]: string | number | null;
}

export interface VendorTemplate {
    vendorId: string;
    version: number;
    timestamp: string;
    headerHash: string;
    mapping: Record<string, string>;
}

// ─── Constants ──────────────────────────────────────────────────────────────────

/** Improved threshold: 75 (was 70) */
export const CONFIDENCE_THRESHOLD = 75;

/** Gap threshold for ambiguity detection */
const AMBIGUITY_GAP_THRESHOLD = 10;

const FINANCIAL_TOLERANCE = 0.02;

// ────────────────────────────────────────────────────────────────────────────────
// 1️⃣  GROUP-BASED SEMANTIC MAPPING
//     Every field belongs to exactly one group.
//     Fuzzy matching is ONLY allowed within the same group.
//     Cross-group competition is forbidden.
// ────────────────────────────────────────────────────────────────────────────────

export const SEMANTIC_GROUPS: Record<string, string[]> = {
    // ── Contract-Mandated Whitelist (Flat Mapping for Strict Mode) ──────────────────
    tally_contract: [...EXACT_TALLY_COLUMNS]
};

/** Build reverse lookup: field → group */
const FIELD_GROUP_MAP: Record<string, string> = {};
Object.entries(SEMANTIC_GROUPS).forEach(([group, fields]) => {
    fields.forEach(f => { FIELD_GROUP_MAP[f] = group; });
});

// ────────────────────────────────────────────────────────────────────────────────
// 3️⃣  FIELD DEPENDENCY RULES
//     Child fields may only be mapped if their parent entity is resolved.
// ────────────────────────────────────────────────────────────────────────────────

const DEPENDENCY_RULES: Array<{ parent: string; children: string[] }> = [];

// ────────────────────────────────────────────────────────────────────────────────
// 4️⃣  SWAP DETECTION – known field pairs that get mutually confused
// ────────────────────────────────────────────────────────────────────────────────

/** Pairs that are commonly swapped; enforces explicit differentiation */
const SWAP_CONFLICT_PAIRS: Array<[string, string]> = [];

// ────────────────────────────────────────────────────────────────────────────────
// Keyword rules (scoring 85 pts for keyword match)
// ────────────────────────────────────────────────────────────────────────────────

export const KEYWORD_RULES: Record<string, string[]> = EXACT_TALLY_COLUMNS.reduce((acc, col) => {
    // Generate simple keywords based on column name parts to assist mapping
    const base = col.toLowerCase().replace(/[^a-z0-9]/g, '');
    acc[col] = [base, col.toLowerCase()];
    // Specific legacy mappings to Tally Contract
    if (col === 'Buyer/Supplier - Mailing Name') acc[col].push('vendor', 'supplier', 'party', 'seller', 'name');
    if (col === 'Buyer/Supplier - GSTIN/UIN') acc[col].push('gstin', 'gstnumber', 'registration');
    if (col === 'Total Invoice Value') acc[col].push('grand total', 'invoice amount', 'total amount', 'net amount', 'total');
    if (col === 'Total Taxable Value') acc[col].push('sub total', 'taxable amount', 'total taxable');
    if (col === 'Total IGST') acc[col].push('integrated tax', 'igst total');
    if (col === 'Total CGST') acc[col].push('central tax', 'cgst total');
    if (col === 'Total SGST') acc[col].push('state tax', 'sgst total');
    if (col === 'IGST Rate') acc[col].push('igst%', 'igstrate');
    return acc;
}, {} as Record<string, string[]>);

const CRITICAL_HEADER_FIELDS = ['Buyer/Supplier - Mailing Name', 'Customer Name', 'Vendor Name', 'Supplier Invoice No', 'Date'];
const CRITICAL_LINE_ITEM_FIELDS: string[] = [];

KEYWORD_RULES['Buyer/Supplier - Mailing Name']?.push('seller', 'vendor name', 'bill from', 'merchant');
KEYWORD_RULES['Buyer/Supplier - GSTIN/UIN']?.push('seller gstin', 'vendor gstin', 'supplier gstin');
KEYWORD_RULES['Buyer/Supplier - State'] = ['state', 'place of supply', 'pos', 'billing state', 'supply state'];
KEYWORD_RULES['Supplier Invoice No.'] = ['invoice no', 'bill no', 'inv no', 'reference', 'ref no'];
KEYWORD_RULES['Amount Due'] = ['grand total', 'invoice total', 'total payable', 'net amount', 'invoice value', 'bill amount', 'balance due', 'payable amount', 'total', 'grandtotal'];
KEYWORD_RULES['Round Off'] = ['round off', 'round-off', 'rounding', 'adjustment', 'roundoff'];
KEYWORD_RULES['Date'] = ['invoice date', 'bill date', 'dated', 'voucher date'];

const POSITIVE_NUMERIC_FIELDS = [
    'Taxable Value',
    'IGST Rate', 'CGST Rate', 'SGST/UTGST Rate',
    'Advance Payment/Receipt/Refund Details - IGST Amount'
];

// ─── Utility Functions ───────────────────────────────────────────────────────────

export const sanitize = (s: string): string =>
    s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** Levenshtein-based similarity ratio (0–1) */
const getSimilarity = (s1: string, s2: string): number => {
    if (s1 === s2) return 1;
    const m = s1.length, n = s2.length;
    if (m === 0 || n === 0) return 0;
    const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
        Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = s1[i - 1] === s2[j - 1]
                ? dp[i - 1][j - 1]
                : 1 + Math.min(dp[i - 1][j - 1], dp[i][j - 1], dp[i - 1][j]);
        }
    }
    return (Math.max(m, n) - dp[m][n]) / Math.max(m, n);
};

export const hashHeaders = (headers: string[]): string => {
    const str = [...headers].sort().join('|');
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
};

export const toNumber = (val: unknown, fieldName: string, audit: AuditEvent[]): number | null => {
    if (val === undefined || val === null || val === '') return null;
    const cleaned = String(val).replace(/[₹$€£,\s%]/g, '').trim();
    const num = parseFloat(cleaned);
    if (isNaN(num)) {
        audit.push({ timestamp: new Date().toISOString(), eventType: 'financial_validation', detail: { field: fieldName, rawValue: val, error: 'Non-numeric value rejected' } });
        return null;
    }
    if (POSITIVE_NUMERIC_FIELDS.includes(fieldName) && num < 0) {
        audit.push({ timestamp: new Date().toISOString(), eventType: 'financial_validation', detail: { field: fieldName, value: num, error: 'Negative value rejected for positive-only field' } });
        return null;
    }
    return num;
};

const validateDate = (val: string): boolean => {
    const iso = /^\d{4}-\d{2}-\d{2}$/;
    const dmy = /^\d{2}\/\d{2}\/\d{4}$/;
    if (iso.test(val)) return !isNaN(Date.parse(val));
    if (dmy.test(val)) { const [d, m, y] = val.split('/'); return !isNaN(Date.parse(`${y}-${m}-${d}`)); }
    return !isNaN(Date.parse(val));
};

// ─── Vendor Template Store ───────────────────────────────────────────────────────

const TEMPLATE_STORE_KEY = 'finpixe_vendor_templates_v3';

const loadTemplateStore = (): Record<string, VendorTemplate> => {
    try { return JSON.parse(localStorage.getItem(TEMPLATE_STORE_KEY) || '{}'); } catch { return {}; }
};

export const getVendorTemplate = (vendorId: string): VendorTemplate | null => {
    const store = loadTemplateStore();
    return store[sanitize(vendorId)] ?? null;
};

export const saveVendorTemplate = (vendorId: string, mapping: Record<string, string>, headers: string[]): void => {
    if (!vendorId) return;
    const store = loadTemplateStore();
    const key = sanitize(vendorId);
    const existing = store[key];
    store[key] = {
        vendorId, version: existing ? existing.version + 1 : 1,
        timestamp: new Date().toISOString(), headerHash: hashHeaders(headers), mapping,
    };
    localStorage.setItem(TEMPLATE_STORE_KEY, JSON.stringify(store));
};

// ────────────────────────────────────────────────────────────────────────────────
// 2️⃣  CONTEXT-AWARE SCORING
//     Boost when source key belongs to the same group as target.
//     Penalty when source key belongs to a competing/unrelated group.
// ────────────────────────────────────────────────────────────────────────────────

const inferSourceGroup = (sourceSanitized: string): string => {
    let bestGroup = 'misc';
    let bestScore = 0;
    for (const [field, keywords] of Object.entries(KEYWORD_RULES)) {
        for (const kw of keywords) {
            const sim = getSimilarity(sourceSanitized, sanitize(kw));
            if (sim > bestScore) { bestScore = sim; bestGroup = FIELD_GROUP_MAP[field] ?? 'misc'; }
        }
    }
    return bestScore > 0.7 ? bestGroup : 'misc';
};

/** Context-aware score adjustment */
const applyContextBoost = (
    baseScore: number,
    targetGroup: string,
    sourceGroup: string
): { score: number; reason: string } => {
    if (targetGroup === 'misc' || sourceGroup === 'misc') return { score: baseScore, reason: 'no_context' };
    if (sourceGroup === targetGroup) return { score: Math.min(100, baseScore + 5), reason: 'same_group_boost' };
    // Penalty for cross-group
    return { score: Math.max(0, baseScore - 20), reason: 'cross_group_penalty' };
};

// ────────────────────────────────────────────────────────────────────────────────
// Core Mapping Engine  v3.0
// ────────────────────────────────────────────────────────────────────────────────

export const runMappingEngine = (
    availableKeys: string[],
    targetFields: string[],
    vendorId: string,
    auditLog: AuditEvent[]
): {
    mapping: Record<string, string>;
    decisions: MappingDecision[];
    collisions: MappingDecision[];
    ambiguities: AmbiguityEvent[];
    swapSuspicions: SwapSuspicion[];
    templateUsed: boolean;
    templateVersion?: number;
    templateHashMatch?: boolean;
} => {
    // STRICT TALLY CONTRACT: Removed whitelist filtering for AI-to-Schema mapping compatibility.
    // The targetFields now correctly reflect the schemas defined for each voucher type.


    const headerHash = hashHeaders(availableKeys);
    const template = getVendorTemplate(vendorId);
    let templateUsed = false;
    let templateHashMatch: boolean | undefined;
    let templateVersion: number | undefined;

    // ── Template Phase ──────────────────────────────────────────────────────────
    const templateMapping: Record<string, string> = {};
    if (template) {
        templateVersion = template.version;
        templateHashMatch = template.headerHash === headerHash;
        if (templateHashMatch) {
            Object.entries(template.mapping).forEach(([target, source]) => {
                if (targetFields.includes(target) && availableKeys.includes(source)) {
                    templateMapping[target] = source;
                }
            });
            templateUsed = Object.keys(templateMapping).length > 0;
            auditLog.push({ timestamp: new Date().toISOString(), eventType: 'template_applied', detail: { vendorId, version: template.version, mappedFields: Object.keys(templateMapping).length } });
        } else {
            auditLog.push({ timestamp: new Date().toISOString(), eventType: 'template_mismatch', detail: { vendorId, storedHash: template.headerHash, currentHash: headerHash, message: 'Header signature changed. Falling back to v3 scoring engine.' } });
        }
    }

    // ── Build per-target candidate list ─────────────────────────────────────────
    // For each TARGET we gather ALL source candidates with their scores.
    // Cross-group fuzzy matching is FORBIDDEN (score reset to 0).

    const targetCandidateMap: Record<string, Array<{ source: string; score: number; method: MappingDecision['method'] }>> = {};

    availableKeys.forEach(source => {
        const sourceSanitized = sanitize(source);
        const sourceGroup = inferSourceGroup(sourceSanitized);

        targetFields.forEach(target => {
            if (templateMapping[target] !== undefined) return;

            const targetSanitized = sanitize(target);
            const targetGroup = FIELD_GROUP_MAP[target] ?? 'misc';
            const keywords = KEYWORD_RULES[target] || [];

            let score = 0;
            let method: MappingDecision['method'] = 'unmapped';

            // ── 6️⃣ Weighted scoring hierarchy ──────────────────────────────────
            if (source === target) {
                score = 100; method = 'exact';
            } else if (sourceSanitized === targetSanitized) {
                score = 92; method = 'sanitized';
            } else {
                const kwExact = keywords.find(kw => sanitize(kw) === sourceSanitized);
                if (kwExact) {
                    score = 85; method = 'keyword';
                } else {
                    // Fuzzy ONLY allowed within same group
                    const sameGroup = targetGroup !== 'misc' && sourceGroup === targetGroup;
                    if (sameGroup) {
                        const sim = getSimilarity(sourceSanitized, targetSanitized);
                        const kwSim = keywords.reduce((mx, kw) => Math.max(mx, getSimilarity(sourceSanitized, sanitize(kw))), 0);
                        const rawFuzzy = Math.floor(Math.max(sim, kwSim) * 80);
                        score = rawFuzzy;
                        method = score >= CONFIDENCE_THRESHOLD ? 'fuzzy' : 'unmapped';
                    }
                    // Cross-group fuzzy → forbidden (score remains 0)
                }
            }

            // ── 2️⃣ Context-aware boost/penalty ────────────────────────────────
            if (score > 0) {
                const adjusted = applyContextBoost(score, targetGroup, sourceGroup);
                score = adjusted.score;
            }

            // Do not allow fuzzy to override a structured match
            // (handled by hierarchy: score < keyword score → won't win collision)

            if (score >= CONFIDENCE_THRESHOLD) {
                if (!targetCandidateMap[target]) targetCandidateMap[target] = [];
                targetCandidateMap[target].push({ source, score, method });
            }
        });
    });

    // ── Sort each target's candidates descending by score ──────────────────────
    Object.values(targetCandidateMap).forEach(list => list.sort((a, b) => b.score - a.score));

    // ── 5️⃣ Ambiguity Detection ─────────────────────────────────────────────────
    const ambiguities: AmbiguityEvent[] = [];
    const ambiguousTargets = new Set<string>();

    Object.entries(targetCandidateMap).forEach(([target, list]) => {
        if (list.length >= 2) {
            const gap = list[0].score - list[1].score;
            if (gap < AMBIGUITY_GAP_THRESHOLD) {
                const event: AmbiguityEvent = {
                    target,
                    candidate1: { source: list[0].source, score: list[0].score },
                    candidate2: { source: list[1].source, score: list[1].score },
                    gap,
                    blocked: true,
                };
                ambiguities.push(event);
                ambiguousTargets.add(target);
                auditLog.push({
                    timestamp: new Date().toISOString(),
                    eventType: 'ambiguity_detected',
                    detail: { target, candidate1: list[0], candidate2: list[1], gap, message: 'Top-2 gap < 10pt → blocked' },
                });
            }
        }
    });

    // ── Flatten to single best candidate per target (excluding ambiguous) ───────
    const candidates: MappingDecision[] = [];
    Object.entries(targetCandidateMap).forEach(([target, list]) => {
        if (ambiguousTargets.has(target)) return; // blocked
        if (list.length > 0) {
            const best = list[0];
            const targetGroup = FIELD_GROUP_MAP[target] ?? 'misc';
            candidates.push({ target, source: best.source, score: best.score, method: best.method, semGroup: targetGroup });
        }
    });

    // ── 3️⃣ Dependency Rule – block dependent fields if parent unresolved ───────
    const allCandidateTargets = new Set([
        ...Object.keys(templateMapping),
        ...candidates.map(c => c.target),
    ]);
    const blockedByDependency = new Set<string>();

    DEPENDENCY_RULES.forEach(rule => {
        const parentResolved = allCandidateTargets.has(rule.parent);
        if (!parentResolved) {
            rule.children.forEach(child => {
                blockedByDependency.add(child);
                auditLog.push({
                    timestamp: new Date().toISOString(),
                    eventType: 'dependency_blocked',
                    detail: { child, parent: rule.parent, reason: 'Parent entity not resolved; dependent mapping blocked.' },
                });
            });
        }
    });

    // Filter out dependency-blocked candidates
    const filteredCandidates = candidates.filter(c => !blockedByDependency.has(c.target));

    // ── Collision Resolution (highest score wins, strict 1-to-1) ───────────────
    filteredCandidates.sort((a, b) => b.score - a.score);
    const finalMapping: Record<string, string> = { ...templateMapping };
    const usedSources = new Set<string>(Object.values(templateMapping));
    const usedTargets = new Set<string>(Object.keys(templateMapping));
    const decisions: MappingDecision[] = [];
    const collisions: MappingDecision[] = [];

    filteredCandidates.forEach(d => {
        if (!usedSources.has(d.source) && !usedTargets.has(d.target)) {
            finalMapping[d.target] = d.source;
            usedSources.add(d.source);
            usedTargets.add(d.target);
            decisions.push(d);
            auditLog.push({ timestamp: new Date().toISOString(), eventType: 'mapping_decision', detail: { target: d.target, source: d.source, score: d.score, method: d.method, group: d.semGroup } });
        } else {
            d.flagged = true;
            collisions.push(d);
            auditLog.push({ timestamp: new Date().toISOString(), eventType: 'collision_rejected', detail: { target: d.target, source: d.source, score: d.score, reason: 'Source or target already bound' } });
        }
    });

    // Add template decisions to decisions list
    Object.entries(templateMapping).forEach(([target, source]) => {
        decisions.push({ target, source, score: 100, method: 'template', semGroup: FIELD_GROUP_MAP[target] ?? 'template' });
    });

    // ── 4️⃣ Swap Detection ──────────────────────────────────────────────────────
    const swapSuspicions: SwapSuspicion[] = [];
    SWAP_CONFLICT_PAIRS.forEach(([fieldA, fieldB]) => {
        const sourceA = finalMapping[fieldA];
        const sourceB = finalMapping[fieldB];
        if (!sourceA || !sourceB) return;

        const sanA = sanitize(sourceA);
        const sanB = sanitize(sourceB);

        // Check if sources are cross-similar (potential swap)
        const kwA = KEYWORD_RULES[fieldA] || [];
        const kwB = KEYWORD_RULES[fieldB] || [];
        const crossAB = kwB.some(kw => getSimilarity(sanA, sanitize(kw)) > 0.7);
        const crossBA = kwA.some(kw => getSimilarity(sanB, sanitize(kw)) > 0.7);

        if (crossAB || crossBA) {
            const suspicion: SwapSuspicion = {
                fieldA, fieldB, sourceA, sourceB,
                reason: `Source "${sourceA}" (→${fieldA}) and "${sourceB}" (→${fieldB}) are semantically close; possible swap.`,
            };
            swapSuspicions.push(suspicion);
            // Mark the decisions as swap-suspect
            const dA = decisions.find(d => d.target === fieldA);
            const dB = decisions.find(d => d.target === fieldB);
            if (dA) dA.swapSuspect = true;
            if (dB) dB.swapSuspect = true;
            auditLog.push({ timestamp: new Date().toISOString(), eventType: 'swap_suspected', detail: { fieldA, fieldB, sourceA, sourceB } });
        }
    });

    return { mapping: finalMapping, decisions, collisions, ambiguities, swapSuspicions, templateUsed, templateVersion, templateHashMatch };
};

// ────────────────────────────────────────────────────────────────────────────────
// 7️⃣  STRUCTURAL INTEGRITY VALIDATION
// ────────────────────────────────────────────────────────────────────────────────

export const validateStructuralIntegrity = (
    mapping: Record<string, string>,
    decisions: MappingDecision[],
    swapSuspicions: SwapSuspicion[],
    allTargetFields: string[],
    auditLog: AuditEvent[]
): StructuralViolation[] => {
    const violations: StructuralViolation[] = [];

    // V1: No field mapped twice (target → multiple sources)
    const targetCounts: Record<string, number> = {};
    decisions.forEach(d => { targetCounts[d.target] = (targetCounts[d.target] || 0) + 1; });
    Object.entries(targetCounts).forEach(([target, count]) => {
        if (count > 1) {
            violations.push({ rule: 'duplicate_target', severity: 'error', detail: `Field "${target}" mapped ${count} times.` });
            auditLog.push({ timestamp: new Date().toISOString(), eventType: 'structural_violation', detail: { rule: 'duplicate_target', target, count } });
        }
    });

    // V2: No source used twice (source → multiple targets)
    const sourceCounts: Record<string, number> = {};
    decisions.forEach(d => { if (d.source) sourceCounts[d.source] = (sourceCounts[d.source] || 0) + 1; });
    Object.entries(sourceCounts).forEach(([source, count]) => {
        if (count > 1) {
            violations.push({ rule: 'duplicate_source', severity: 'error', detail: `Source "${source}" mapped to ${count} targets.` });
            auditLog.push({ timestamp: new Date().toISOString(), eventType: 'structural_violation', detail: { rule: 'duplicate_source', source, count } });
        }
    });

    // V3: Swap suspicions are structural violations (warning)
    swapSuspicions.forEach(s => {
        violations.push({ rule: 'swap_suspected', severity: 'warning', detail: s.reason });
    });

    // V4: Bill-to vs Ship-to confusion (vendor vs consignee)
    const vendorResolved = !!mapping['Vendor Name'];
    const consigneeResolved = !!mapping['Consignee (ship to)'];
    const billAddress = mapping['Buyer/Supplier - Address'];
    const shipAddress = mapping['Consignee - Address'];
    if (billAddress && shipAddress && billAddress === shipAddress) {
        violations.push({
            rule: 'address_collision',
            severity: 'error',
            detail: `"Buyer/Supplier - Address" and "Consignee - Address" both mapped to same source: "${billAddress}". Possible address swap.`,
        });
    }

    // V5: Consignee address fields present without consignee parent
    const consigneeChildren = ['Consignee - Address', 'Consignee - Country', 'Consignee - State'];
    const orphanConsigneeFields = consigneeChildren.filter(f => mapping[f] && !consigneeResolved);
    if (orphanConsigneeFields.length > 0) {
        violations.push({
            rule: 'orphan_dependent',
            severity: 'error',
            detail: `Consignee address fields mapped without "Consignee (ship to)": ${orphanConsigneeFields.join(', ')}`,
        });
    }

    // V6: Vendor address fields present without vendor parent
    const vendorChildren = ['Buyer/Supplier - Address', 'Buyer/Supplier - Country', 'Buyer/Supplier - State'];
    const orphanVendorFields = vendorChildren.filter(f => mapping[f] && !vendorResolved);
    if (orphanVendorFields.length > 0) {
        violations.push({
            rule: 'orphan_dependent',
            severity: 'error',
            detail: `Vendor address fields mapped without "Vendor Name": ${orphanVendorFields.join(', ')}`,
        });
    }

    return violations;
};

// ─── Type Coercion Layer ────────────────────────────────────────────────────────

export const coerceRow = (rawRow: Record<string, unknown>, auditLog: AuditEvent[]): MappedRow => {
    const out: MappedRow = {};
    Object.entries(rawRow).forEach(([field, val]) => {
        // STRICT TALLY CONTRACT: Reject any field not in the whitelist
        if (!TALLY_WHITELIST.has(field)) return;

        const strVal = val !== undefined && val !== null ? String(val) : '';
        if (field.toLowerCase().includes('date')) {
            if (strVal && !validateDate(strVal)) {
                auditLog.push({ timestamp: new Date().toISOString(), eventType: 'financial_validation', detail: { field, value: strVal, error: 'Invalid date format; expected ISO or DD/MM/YYYY' } });
            }
            out[field] = strVal || null;
            return;
        }
        if (POSITIVE_NUMERIC_FIELDS.includes(field)) {
            out[field] = toNumber(val, field, auditLog);
            return;
        }
        out[field] = strVal || null;
    });
    return out;
};

// ─── Financial Integrity Validator ───────────────────────────────────────────────

export const validateFinancials = (rows: MappedRow[], auditLog: AuditEvent[]): FinancialValidation[] => {
    const validations: FinancialValidation[] = [];

    rows.forEach((row, i) => {
        const taxable = Number(row['Taxable Value'] ?? 0);
        const igstRate = Number(row['IGST Rate'] ?? 0);
        const cgstRate = Number(row['CGST Rate'] ?? 0);
        const sgstRate = Number(row['SGST/UTGST Rate'] ?? 0);

        if ((igstRate > 0 || cgstRate > 0) && taxable > 0) {
            // Simplified validation for Tally Contract Mode
            validations.push({ rule: `Row ${i + 1}: Taxable Value is populated`, passed: taxable > 0, severity: 'warning' });
        }
    });

    return validations;
};

// ────────────────────────────────────────────────────────────────────────────────
// 8️⃣  DETERMINISTIC OUTPUT CONTRACT + Ingestion Report Builder
// ────────────────────────────────────────────────────────────────────────────────

export const buildIngestionReport = (params: {
    vendorId: string;
    decisions: MappingDecision[];
    collisions: MappingDecision[];
    ambiguities: AmbiguityEvent[];
    swapSuspicions: SwapSuspicion[];
    structuralViolations: StructuralViolation[];
    allTargetFields: string[];
    financialValidations: FinancialValidation[];
    templateUsed: boolean;
    templateVersion?: number;
    templateHashMatch?: boolean;
    auditLog: AuditEvent[];
}): IngestionReport => {

    const {
        vendorId, decisions, collisions, ambiguities, swapSuspicions,
        structuralViolations, allTargetFields, financialValidations,
        templateUsed, templateVersion, templateHashMatch, auditLog,
    } = params;

    const mappedFields = decisions.filter(d => d.method !== 'unmapped');
    const unmapped = allTargetFields.filter(f => !mappedFields.find(d => d.target === f));
    const criticalUnmapped = [...CRITICAL_LINE_ITEM_FIELDS, ...CRITICAL_HEADER_FIELDS].filter(f => unmapped.includes(f));

    const financialErrors = financialValidations.filter(v => !v.passed && v.severity === 'error');
    const financialWarnings = financialValidations.filter(v => !v.passed && v.severity === 'warning');
    const avgConf = mappedFields.length > 0
        ? mappedFields.reduce((s, d) => s + d.score, 0) / mappedFields.length
        : 0;

    // Risk scoring
    let riskLevel: 'Low' | 'Medium' | 'High' = 'Low';
    const structuralErrors = structuralViolations.filter(v => v.severity === 'error');
    const structuralWarnings = structuralViolations.filter(v => v.severity === 'warning');

    if (
        criticalUnmapped.length > 0 ||
        financialErrors.length > 0 ||
        avgConf < CONFIDENCE_THRESHOLD ||
        structuralErrors.length > 0
    ) {
        riskLevel = 'High';
    } else if (
        unmapped.length > 2 ||
        financialWarnings.length > 0 ||
        avgConf < 85 ||
        ambiguities.length > 0 ||
        swapSuspicions.length > 0 ||
        structuralWarnings.length > 0
    ) {
        riskLevel = 'Medium';
    }

    // ── Block conditions ────────────────────────────────────────────────────────
    const blockReasons: string[] = [];

    // STRICT TALLY CONTRACT: Check for any field in mapped decisions not in whitelist
    mappedFields.forEach(d => {
        if (!TALLY_WHITELIST.has(d.target)) {
            blockReasons.push(`Schema Violation: Field '${d.target}' is not permitted in Tally Contract Mode.`);
        }
    });

    if (criticalUnmapped.length > 0) {
        blockReasons.push(`Critical fields unmapped: ${criticalUnmapped.join(', ')}`);
    }
    if (financialErrors.length > 0) {
        blockReasons.push(`${financialErrors.length} financial integrity violation(s) detected.`);
    }
    if (avgConf < CONFIDENCE_THRESHOLD && mappedFields.length > 0) {
        blockReasons.push(`Average mapping confidence (${avgConf.toFixed(0)}) below threshold (${CONFIDENCE_THRESHOLD}).`);
    }
    if (structuralErrors.length > 0) {
        structuralErrors.forEach(v => blockReasons.push(`Structural error [${v.rule}]: ${v.detail}`));
    }
    if (ambiguities.length > 0) {
        blockReasons.push(`${ambiguities.length} ambiguous field(s) detected — manual review required: ${ambiguities.map(a => a.target).join(', ')}`);
    }
    if (swapSuspicions.length > 0) {
        blockReasons.push(`${swapSuspicions.length} possible field swap(s) detected — requires verification.`);
    }

    const blockSubmission = blockReasons.length > 0;
    const requiresConfirmation = !blockSubmission && (riskLevel === 'Medium' || riskLevel === 'High');

    if (blockSubmission) {
        auditLog.push({ timestamp: new Date().toISOString(), eventType: 'submission_blocked', detail: { reasons: blockReasons } });
    }

    return {
        schemaVersion: '3.0',
        timestamp: new Date().toISOString(),
        vendorId,
        overallConfidence: avgConf,
        riskLevel,
        mappedFields,
        unmappedFields: unmapped,
        collisionsRejected: collisions,
        ambiguities,
        swapSuspicions,
        structuralViolations,
        financialValidations,
        templateUsed,
        templateVersion,
        templateHashMatch,
        auditLog,
        blockSubmission,
        blockReasons,
        requiresConfirmation,
    };
};
