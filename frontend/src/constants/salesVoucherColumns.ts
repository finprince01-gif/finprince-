/**
 * SALES VOUCHER COLUMN SCHEMA  –  Single Source of Truth
 * ==========================================================
 * This file defines every field that appears in the Sales Voucher
 * UI across ALL sub-tabs:
 *
 *   1. Invoice Details
 *   2. Item & Tax Details
 *   3. Payment Details
 *   4. Dispatch Details
 *   5. E-Invoice & E-Way Bill Details
 *
 * Used by:
 *   • Excel Template Download  – builds the header row dynamically
 *   • Excel Upload Processing  – validates & maps uploaded rows
 *   • (Future) Any report / export that needs the same field list
 *
 * TO ADD / RENAME A FIELD:
 *   Update only this file. The downloaded Excel template reflects the
 *   change automatically on the next download. No backend changes needed
 *   because the backend reads this schema via the /sales/schema/ API.
 * ==========================================================
 */

export type SalesVoucherTab =
    | 'Invoice Details'
    | 'Item & Tax Details'
    | 'Foreign Currency (Item & Tax Details)'
    | 'Payment Details'
    | 'Dispatch Details'
    | 'E-Invoice & E-Way Bill Details';

export interface SalesVoucherColumn {
    /** Exact label shown in the Excel header row (Row 1) */
    label: string;
    /** Internal field key used for mapping during upload */
    key: string;
    /** Sub-tab this field belongs to in the Sales Voucher UI */
    tab: SalesVoucherTab;
    /** Whether this field is required during upload validation */
    required?: boolean;
    /** Data type hint for client-side casting during upload */
    type?: 'string' | 'number' | 'date';
}

/**
 * SALES VOUCHER COLUMNS
 * Ordered tab-by-tab then field-by-field, exactly as they appear
 * in the UI (left-to-right within each tab).
 */
export const SALES_VOUCHER_COLUMNS: SalesVoucherColumn[] = [

    // ══════════════════════════════════════════════════════════════
    // TAB 1 — Invoice Details
    // ══════════════════════════════════════════════════════════════
    { label: 'Date', key: 'date', tab: 'Invoice Details', required: false, type: 'date' },
    { label: 'Sales Invoice Series', key: 'voucher_name', tab: 'Invoice Details', required: false, type: 'string' },
    { label: 'Sales Invoice No.', key: 'sales_invoice_no', tab: 'Invoice Details', required: true, type: 'string' },
    { label: 'Outward Slip No.', key: 'outward_slip_no', tab: 'Invoice Details', required: false, type: 'string' },
    { label: 'Customer Name', key: 'customer_name', tab: 'Invoice Details', required: false, type: 'string' },
    { label: 'Branch', key: 'customer_branch', tab: 'Invoice Details', required: true, type: 'string' },
    { label: 'GSTIN', key: 'gstin', tab: 'Invoice Details', required: true, type: 'string' },
    { label: 'Contact', key: 'contact', tab: 'Invoice Details', required: false, type: 'string' },
    { label: 'Place of Supply', key: 'place_of_supply', tab: 'Invoice Details', required: false, type: 'string' },
    { label: 'Reverse Charge', key: 'reverse_charge', tab: 'Invoice Details', required: false, type: 'string' },
    { label: 'Nature of Supply', key: 'invoice_type', tab: 'Invoice Details', required: false, type: 'string' },
    { label: 'Exchange Rate', key: 'exchange_rate', tab: 'Invoice Details', required: false, type: 'number' },

    // Bill To Address
    { label: 'Bill To - Address Line 1', key: 'bill_to_address_1', tab: 'Invoice Details', required: false, type: 'string' },
    { label: 'Bill To - Address Line 2', key: 'bill_to_address_2', tab: 'Invoice Details', required: false, type: 'string' },
    { label: 'Bill To - Address Line 3', key: 'bill_to_address_3', tab: 'Invoice Details', required: false, type: 'string' },
    { label: 'Bill To - City', key: 'bill_to_city', tab: 'Invoice Details', required: false, type: 'string' },
    { label: 'Bill To - State', key: 'bill_to_state', tab: 'Invoice Details', required: false, type: 'string' },
    { label: 'Bill To - Pincode', key: 'bill_to_pincode', tab: 'Invoice Details', required: false, type: 'string' },
    { label: 'Bill To - Country', key: 'bill_to_country', tab: 'Invoice Details', required: false, type: 'string' },

    // Ship To Address
    { label: 'Ship To - Address Line 1', key: 'ship_to_address_1', tab: 'Invoice Details', required: false, type: 'string' },
    { label: 'Ship To - Address Line 2', key: 'ship_to_address_2', tab: 'Invoice Details', required: false, type: 'string' },
    { label: 'Ship To - Address Line 3', key: 'ship_to_address_3', tab: 'Invoice Details', required: false, type: 'string' },
    { label: 'Ship To - City', key: 'ship_to_city', tab: 'Invoice Details', required: false, type: 'string' },
    { label: 'Ship To - State', key: 'ship_to_state', tab: 'Invoice Details', required: false, type: 'string' },
    { label: 'Ship To - Pincode', key: 'ship_to_pincode', tab: 'Invoice Details', required: false, type: 'string' },
    { label: 'Ship To - Country', key: 'ship_to_country', tab: 'Invoice Details', required: false, type: 'string' },

    // Export / E-Commerce (conditional but included for completeness)
    { label: 'Export Type', key: 'export_type', tab: 'Invoice Details', required: false, type: 'string' },
    { label: 'GST Export Type', key: 'gst_export_type', tab: 'Invoice Details', required: false, type: 'string' },
    { label: 'Port Code', key: 'port_code', tab: 'Invoice Details', required: false, type: 'string' },
    { label: 'Shipping Bill Number', key: 'shipping_bill_number', tab: 'Invoice Details', required: false, type: 'string' },
    { label: 'Shipping Bill Date', key: 'shipping_bill_date', tab: 'Invoice Details', required: false, type: 'date' },
    { label: 'E-Commerce Operator', key: 'ecommerce_operator', tab: 'Invoice Details', required: false, type: 'string' },
    { label: 'E-Commerce GSTIN', key: 'ecommerce_gstin', tab: 'Invoice Details', required: false, type: 'string' },

    // ══════════════════════════════════════════════════════════════
    // TAB 2 — Item & Tax Details
    // ══════════════════════════════════════════════════════════════
    { label: 'Sales Order/Quotation No.', key: 'sales_order_no', tab: 'Item & Tax Details', required: false, type: 'string' },
    { label: 'Item Code', key: 'item_code', tab: 'Item & Tax Details', required: false, type: 'string' },
    { label: 'Item Name', key: 'item_name', tab: 'Item & Tax Details', required: false, type: 'string' },
    { label: 'HSN / SAC', key: 'hsn_sac', tab: 'Item & Tax Details', required: false, type: 'string' },
    { label: 'Quantity', key: 'qty', tab: 'Item & Tax Details', required: false, type: 'number' },
    { label: 'UQC / UOM', key: 'uom', tab: 'Item & Tax Details', required: false, type: 'string' },
    { label: 'Alternate Unit', key: 'alternate_unit', tab: 'Item & Tax Details', required: false, type: 'string' },
    { label: 'Rate', key: 'item_rate', tab: 'Item & Tax Details', required: false, type: 'number' },
    { label: 'Taxable Value', key: 'taxable_value', tab: 'Item & Tax Details', required: false, type: 'number' },
    { label: 'CGST', key: 'cgst', tab: 'Item & Tax Details', required: false, type: 'number' },
    { label: 'SGST', key: 'sgst', tab: 'Item & Tax Details', required: false, type: 'number' },
    { label: 'IGST', key: 'igst', tab: 'Item & Tax Details', required: false, type: 'number' },
    { label: 'Cess', key: 'cess', tab: 'Item & Tax Details', required: false, type: 'number' },
    { label: 'Invoice Value', key: 'invoice_value', tab: 'Item & Tax Details', required: false, type: 'number' },
    { label: 'Sales Ledger', key: 'sales_ledger', tab: 'Item & Tax Details', required: false, type: 'string' },
    { label: 'ledger narration', key: 'description', tab: 'Item & Tax Details', required: false, type: 'string' },

    // ══════════════════════════════════════════════════════════════
    // TAB 2b — Foreign Currency (Item & Tax Details)
    // Shown only for Export invoices. Uses the same ItemRow shape as
    // Tab 2 but rates/amounts are in the customer's billing currency (FC).
    // ══════════════════════════════════════════════════════════════
    { label: 'Billing Currency', key: 'fc_billing_currency', tab: 'Foreign Currency (Item & Tax Details)', required: false, type: 'string' },
    { label: 'Exchange Rate (FC to INR)', key: 'fc_exchange_rate', tab: 'Foreign Currency (Item & Tax Details)', required: false, type: 'number' },
    { label: 'FC - Item Name', key: 'fc_item_name', tab: 'Foreign Currency (Item & Tax Details)', required: false, type: 'string' },
    { label: 'FC - Quantity', key: 'fc_qty', tab: 'Foreign Currency (Item & Tax Details)', required: false, type: 'number' },
    { label: 'FC - UQC / UOM', key: 'fc_uom', tab: 'Foreign Currency (Item & Tax Details)', required: false, type: 'string' },
    { label: 'FC - Alternate Unit', key: 'fc_alternate_unit', tab: 'Foreign Currency (Item & Tax Details)', required: false, type: 'string' },
    { label: 'FC - Rate (Foreign Currency)', key: 'fc_item_rate', tab: 'Foreign Currency (Item & Tax Details)', required: false, type: 'number' },
    { label: 'FC - Amount (Foreign Currency)', key: 'fc_invoice_value', tab: 'Foreign Currency (Item & Tax Details)', required: false, type: 'number' },
    { label: 'FC - Sales Ledger', key: 'fc_sales_ledger', tab: 'Foreign Currency (Item & Tax Details)', required: false, type: 'string' },
    { label: 'FC - ledger narration', key: 'fc_description', tab: 'Foreign Currency (Item & Tax Details)', required: false, type: 'string' },

    // ══════════════════════════════════════════════════════════════
    { label: 'Taxable Value', key: 'payment_taxable_value', tab: 'Payment Details', required: false, type: 'number' },
    { label: 'CGST', key: 'payment_cgst', tab: 'Payment Details', required: false, type: 'number' },
    { label: 'SGST/UTGST', key: 'payment_sgst', tab: 'Payment Details', required: false, type: 'number' },
    { label: 'IGST', key: 'payment_igst', tab: 'Payment Details', required: false, type: 'number' },
    { label: 'Cess', key: 'payment_cess', tab: 'Payment Details', required: false, type: 'number' },
    { label: 'State Cess', key: 'payment_state_cess', tab: 'Payment Details', required: false, type: 'number' },
    { label: 'Invoice Value', key: 'payment_invoice_value', tab: 'Payment Details', required: false, type: 'number' },
    { label: 'TDS/TCS Under Income Tax', key: 'payment_tds_income_tax', tab: 'Payment Details', required: false, type: 'number' },
    { label: 'TDS/TCS Under GST', key: 'payment_tds_gst', tab: 'Payment Details', required: false, type: 'number' },
    { label: 'Gross Amount Receivable', key: 'payment_gross_receivable', tab: 'Payment Details', required: false, type: 'number' },
    { label: 'Advance', key: 'payment_advance', tab: 'Payment Details', required: false, type: 'number' },
    { label: 'Payable', key: 'payment_payable', tab: 'Payment Details', required: false, type: 'number' },
    { label: 'Posting Note', key: 'posting_note', tab: 'Payment Details', required: false, type: 'string' },
    { label: 'Terms & Conditions', key: 'terms_conditions', tab: 'Payment Details', required: false, type: 'string' },

    // ══════════════════════════════════════════════════════════════
    // TAB 4 — Dispatch Details
    // ══════════════════════════════════════════════════════════════
    // Basic
    { label: 'Dispatch From', key: 'dispatch_from', tab: 'Dispatch Details', required: false, type: 'string' },
    { label: 'Mode of Transport', key: 'mode_of_transport', tab: 'Dispatch Details', required: false, type: 'string' },
    { label: 'Dispatch Date', key: 'dispatch_date', tab: 'Dispatch Details', required: false, type: 'date' },
    { label: 'Dispatch Time', key: 'dispatch_time', tab: 'Dispatch Details', required: false, type: 'string' },
    { label: 'Delivery Type', key: 'delivery_type', tab: 'Dispatch Details', required: false, type: 'string' },
    { label: 'Self / Third Party', key: 'self_third_party', tab: 'Dispatch Details', required: false, type: 'string' },
    { label: 'Transporter ID', key: 'transporter_id', tab: 'Dispatch Details', required: false, type: 'string' },
    { label: 'Transporter Name', key: 'transporter_name', tab: 'Dispatch Details', required: false, type: 'string' },
    { label: 'Vehicle No', key: 'vehicle_no', tab: 'Dispatch Details', required: false, type: 'string' },
    { label: 'LR / GR / Consignment No', key: 'lr_gr_consignment', tab: 'Dispatch Details', required: false, type: 'string' },

    // Port Details – Upto Port (Air / Sea)
    { label: 'Upto Port - Shipping Bill No', key: 'upto_port_shipping_bill_no', tab: 'Dispatch Details', required: false, type: 'string' },
    { label: 'Upto Port - Shipping Bill Date', key: 'upto_port_shipping_bill_date', tab: 'Dispatch Details', required: false, type: 'date' },
    { label: 'Upto Port - Port Code', key: 'upto_port_ship_port_code', tab: 'Dispatch Details', required: false, type: 'string' },
    { label: 'Upto Port - Origin', key: 'upto_port_origin', tab: 'Dispatch Details', required: false, type: 'string' },

    // Port Details – Beyond Port (Air / Sea)
    { label: 'Beyond Port - Shipping Bill No', key: 'beyond_port_shipping_bill_no', tab: 'Dispatch Details', required: false, type: 'string' },
    { label: 'Beyond Port - Shipping Bill Date', key: 'beyond_port_shipping_bill_date', tab: 'Dispatch Details', required: false, type: 'date' },
    { label: 'Beyond Port - Port Code', key: 'beyond_port_ship_port_code', tab: 'Dispatch Details', required: false, type: 'string' },
    { label: 'Beyond Port - Vessel / Flight No', key: 'beyond_port_vessel_flight_no', tab: 'Dispatch Details', required: false, type: 'string' },
    { label: 'Beyond Port - Port of Loading', key: 'beyond_port_port_of_loading', tab: 'Dispatch Details', required: false, type: 'string' },
    { label: 'Beyond Port - Port of Discharge', key: 'beyond_port_port_of_discharge', tab: 'Dispatch Details', required: false, type: 'string' },
    { label: 'Beyond Port - Final Destination', key: 'beyond_port_final_destination', tab: 'Dispatch Details', required: false, type: 'string' },
    { label: 'Beyond Port - Origin', key: 'beyond_port_origin', tab: 'Dispatch Details', required: false, type: 'string' },
    { label: 'Beyond Port - Origin Country', key: 'beyond_port_origin_country', tab: 'Dispatch Details', required: false, type: 'string' },
    { label: 'Beyond Port - Destination Country', key: 'beyond_port_dest_country', tab: 'Dispatch Details', required: false, type: 'string' },

    // Rail Details – Upto Port
    { label: 'Rail Upto Port - Delivery Type', key: 'rail_upto_port_delivery_type', tab: 'Dispatch Details', required: false, type: 'string' },
    { label: 'Rail Upto Port - Transporter ID', key: 'rail_upto_port_transporter_id', tab: 'Dispatch Details', required: false, type: 'string' },
    { label: 'Rail Upto Port - Transporter Name', key: 'rail_upto_port_transporter_name', tab: 'Dispatch Details', required: false, type: 'string' },
    { label: 'Rail Upto Port - Vehicle No', key: 'rail_upto_port_vehicle_no', tab: 'Dispatch Details', required: false, type: 'string' },
    { label: 'Rail Upto Port - LR / GR / Consignment No', key: 'rail_upto_port_lr_gr', tab: 'Dispatch Details', required: false, type: 'string' },

    // Rail Details – Beyond Port
    { label: 'Rail Beyond Port - Railway Receipt No', key: 'rail_beyond_port_receipt_no', tab: 'Dispatch Details', required: false, type: 'string' },
    { label: 'Rail Beyond Port - Railway Receipt Date', key: 'rail_beyond_port_receipt_date', tab: 'Dispatch Details', required: false, type: 'date' },
    { label: 'Rail Beyond Port - Origin', key: 'rail_beyond_port_origin', tab: 'Dispatch Details', required: false, type: 'string' },
    { label: 'Rail Beyond Port - Origin Country', key: 'rail_beyond_port_origin_country', tab: 'Dispatch Details', required: false, type: 'string' },
    { label: 'Rail Beyond Port - Rail No', key: 'rail_beyond_port_rail_no', tab: 'Dispatch Details', required: false, type: 'string' },
    { label: 'Rail Beyond Port - FNR No', key: 'rail_beyond_port_fnr_no', tab: 'Dispatch Details', required: false, type: 'string' },
    { label: 'Rail Beyond Port - Station of Loading', key: 'rail_beyond_port_station_loading', tab: 'Dispatch Details', required: false, type: 'string' },
    { label: 'Rail Beyond Port - Station of Discharge', key: 'rail_beyond_port_station_discharge', tab: 'Dispatch Details', required: false, type: 'string' },
    { label: 'Rail Beyond Port - Final Destination', key: 'rail_beyond_port_final_destination', tab: 'Dispatch Details', required: false, type: 'string' },
    { label: 'Rail Beyond Port - Destination Country', key: 'rail_beyond_port_dest_country', tab: 'Dispatch Details', required: false, type: 'string' },

    // ══════════════════════════════════════════════════════════════
    // TAB 5 — E-Invoice & E-Way Bill Details
    // ══════════════════════════════════════════════════════════════

    // E-Invoice details
    { label: 'IRN', key: 'irn', tab: 'E-Invoice & E-Way Bill Details', required: false, type: 'string' },
    { label: 'Acknowledgement No', key: 'ack_no', tab: 'E-Invoice & E-Way Bill Details', required: false, type: 'string' },
    { label: 'Acknowledgement Date', key: 'ack_date', tab: 'E-Invoice & E-Way Bill Details', required: false, type: 'date' },

    // E-Way Bill Entry 1 (all EwayBillEntry fields)
    { label: 'EWB 1 - Available', key: 'ewb1_available', tab: 'E-Invoice & E-Way Bill Details', required: false, type: 'string' },
    { label: 'EWB 1 - E-Way Bill No', key: 'ewb1_eway_bill_no', tab: 'E-Invoice & E-Way Bill Details', required: false, type: 'string' },
    { label: 'EWB 1 - Date', key: 'ewb1_date', tab: 'E-Invoice & E-Way Bill Details', required: false, type: 'date' },
    { label: 'EWB 1 - Validity Period', key: 'ewb1_validity_period', tab: 'E-Invoice & E-Way Bill Details', required: false, type: 'string' },
    { label: 'EWB 1 - Distance (km)', key: 'ewb1_distance', tab: 'E-Invoice & E-Way Bill Details', required: false, type: 'number' },
    { label: 'EWB 1 - Extension Date', key: 'ewb1_extension_date', tab: 'E-Invoice & E-Way Bill Details', required: false, type: 'date' },
    { label: 'EWB 1 - Extended EWB No', key: 'ewb1_extended_ewb_no', tab: 'E-Invoice & E-Way Bill Details', required: false, type: 'string' },
    { label: 'EWB 1 - Extension Reason', key: 'ewb1_extension_reason', tab: 'E-Invoice & E-Way Bill Details', required: false, type: 'string' },
    { label: 'EWB 1 - From Place', key: 'ewb1_from_place', tab: 'E-Invoice & E-Way Bill Details', required: false, type: 'string' },
    { label: 'EWB 1 - Remaining Distance', key: 'ewb1_remaining_distance', tab: 'E-Invoice & E-Way Bill Details', required: false, type: 'number' },
    { label: 'EWB 1 - New Validity', key: 'ewb1_new_validity', tab: 'E-Invoice & E-Way Bill Details', required: false, type: 'string' },
    { label: 'EWB 1 - Updated Vehicle No', key: 'ewb1_updated_vehicle_no', tab: 'E-Invoice & E-Way Bill Details', required: false, type: 'string' },

    // E-Way Bill Entry 2
    { label: 'EWB 2 - Available', key: 'ewb2_available', tab: 'E-Invoice & E-Way Bill Details', required: false, type: 'string' },
    { label: 'EWB 2 - E-Way Bill No', key: 'ewb2_eway_bill_no', tab: 'E-Invoice & E-Way Bill Details', required: false, type: 'string' },
    { label: 'EWB 2 - Date', key: 'ewb2_date', tab: 'E-Invoice & E-Way Bill Details', required: false, type: 'date' },
    { label: 'EWB 2 - Validity Period', key: 'ewb2_validity_period', tab: 'E-Invoice & E-Way Bill Details', required: false, type: 'string' },
    { label: 'EWB 2 - Distance (km)', key: 'ewb2_distance', tab: 'E-Invoice & E-Way Bill Details', required: false, type: 'number' },
    { label: 'EWB 2 - Extension Date', key: 'ewb2_extension_date', tab: 'E-Invoice & E-Way Bill Details', required: false, type: 'date' },
    { label: 'EWB 2 - Extended EWB No', key: 'ewb2_extended_ewb_no', tab: 'E-Invoice & E-Way Bill Details', required: false, type: 'string' },
    { label: 'EWB 2 - Extension Reason', key: 'ewb2_extension_reason', tab: 'E-Invoice & E-Way Bill Details', required: false, type: 'string' },
    { label: 'EWB 2 - From Place', key: 'ewb2_from_place', tab: 'E-Invoice & E-Way Bill Details', required: false, type: 'string' },
    { label: 'EWB 2 - Remaining Distance', key: 'ewb2_remaining_distance', tab: 'E-Invoice & E-Way Bill Details', required: false, type: 'number' },
    { label: 'EWB 2 - New Validity', key: 'ewb2_new_validity', tab: 'E-Invoice & E-Way Bill Details', required: false, type: 'string' },
    { label: 'EWB 2 - Updated Vehicle No', key: 'ewb2_updated_vehicle_no', tab: 'E-Invoice & E-Way Bill Details', required: false, type: 'string' },

    // E-Way Bill Entry 3
    { label: 'EWB 3 - Available', key: 'ewb3_available', tab: 'E-Invoice & E-Way Bill Details', required: false, type: 'string' },
    { label: 'EWB 3 - E-Way Bill No', key: 'ewb3_eway_bill_no', tab: 'E-Invoice & E-Way Bill Details', required: false, type: 'string' },
    { label: 'EWB 3 - Date', key: 'ewb3_date', tab: 'E-Invoice & E-Way Bill Details', required: false, type: 'date' },
    { label: 'EWB 3 - Validity Period', key: 'ewb3_validity_period', tab: 'E-Invoice & E-Way Bill Details', required: false, type: 'string' },
    { label: 'EWB 3 - Distance (km)', key: 'ewb3_distance', tab: 'E-Invoice & E-Way Bill Details', required: false, type: 'number' },
    { label: 'EWB 3 - Extension Date', key: 'ewb3_extension_date', tab: 'E-Invoice & E-Way Bill Details', required: false, type: 'date' },
    { label: 'EWB 3 - Extended EWB No', key: 'ewb3_extended_ewb_no', tab: 'E-Invoice & E-Way Bill Details', required: false, type: 'string' },
    { label: 'EWB 3 - Extension Reason', key: 'ewb3_extension_reason', tab: 'E-Invoice & E-Way Bill Details', required: false, type: 'string' },
    { label: 'EWB 3 - From Place', key: 'ewb3_from_place', tab: 'E-Invoice & E-Way Bill Details', required: false, type: 'string' },
    { label: 'EWB 3 - Remaining Distance', key: 'ewb3_remaining_distance', tab: 'E-Invoice & E-Way Bill Details', required: false, type: 'number' },
    { label: 'EWB 3 - New Validity', key: 'ewb3_new_validity', tab: 'E-Invoice & E-Way Bill Details', required: false, type: 'string' },
    { label: 'EWB 3 - Updated Vehicle No', key: 'ewb3_updated_vehicle_no', tab: 'E-Invoice & E-Way Bill Details', required: false, type: 'string' },
];

// ── Derived helpers (re-exported for convenience) ──────────────────────────

/** Ordered list of header labels — use this to build Excel Row 1 */
export const SALES_VOUCHER_HEADER_LABELS: string[] = SALES_VOUCHER_COLUMNS.map(c => c.label);

/** Set of required column labels — use this for upload validation */
export const SALES_VOUCHER_REQUIRED_LABELS: Set<string> = new Set(
    SALES_VOUCHER_COLUMNS.filter(c => c.required).map(c => c.label)
);

/** Map from label → column definition — O(1) lookup during upload */
export const SALES_VOUCHER_COLUMN_MAP: Map<string, SalesVoucherColumn> = new Map(
    SALES_VOUCHER_COLUMNS.map(c => [c.label, c])
);

/** Map from key → column definition — O(1) lookup by field key */
export const SALES_VOUCHER_KEY_MAP: Map<string, SalesVoucherColumn> = new Map(
    SALES_VOUCHER_COLUMNS.map(c => [c.key, c])
);

/** Columns grouped by tab — useful for rendering tab-aware UI */
export const SALES_VOUCHER_COLUMNS_BY_TAB: Record<SalesVoucherTab, SalesVoucherColumn[]> = {
    'Invoice Details': SALES_VOUCHER_COLUMNS.filter(c => c.tab === 'Invoice Details'),
    'Item & Tax Details': SALES_VOUCHER_COLUMNS.filter(c => c.tab === 'Item & Tax Details'),
    'Foreign Currency (Item & Tax Details)': SALES_VOUCHER_COLUMNS.filter(c => c.tab === 'Foreign Currency (Item & Tax Details)'),
    'Payment Details': SALES_VOUCHER_COLUMNS.filter(c => c.tab === 'Payment Details'),
    'Dispatch Details': SALES_VOUCHER_COLUMNS.filter(c => c.tab === 'Dispatch Details'),
    'E-Invoice & E-Way Bill Details': SALES_VOUCHER_COLUMNS.filter(c => c.tab === 'E-Invoice & E-Way Bill Details'),
};
