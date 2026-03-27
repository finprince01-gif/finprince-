// frontend/src/configs/schemaConfig.ts

export interface SchemaField {
    name: string;
    label: string;
    type: 'text' | 'date' | 'number';
    mandatory?: boolean;
}

export interface VoucherSchema {
    sections: Record<string, SchemaField[]>;
}

export const VOUCHER_SCHEMAS: Record<string, VoucherSchema> = {
    PURCHASE: {
        sections: {
            supplier_details: [
                { name: "invoice_date", label: "Date", type: "date", mandatory: true },
                { name: "supplier_invoice_no", label: "Supplier Invoice No.", type: "text", mandatory: true },
                { name: "vendor_name", label: "Vendor Name", type: "text", mandatory: true },
                { name: "gstin", label: "GSTIN", type: "text", mandatory: true },
                { name: "branch", label: "Branch", type: "text" },
                { name: "place_of_supply", label: "Place of Supply", type: "text" },
                { name: "bill_from", label: "Bill From Address", type: "text" },
            ],
            supply_details: [
                { name: "total_taxable_value", label: "Total Taxable Value", type: "number" },
                { name: "total_invoice_value", label: "Total Invoice Value", type: "number", mandatory: true },
                { name: "total_igst", label: "Total IGST", type: "number" },
                { name: "total_cgst", label: "Total CGST", type: "number" },
                { name: "total_sgst", label: "Total SGST/UTGST", type: "number" },
                { name: "purchase_order_no", label: "Purchase Order No", type: "text" },
            ],
            items: [
                { name: "description", label: "Item Name", type: "text" },
                { name: "hsn_sac", label: "HSN/SAC", type: "text" },
                { name: "quantity", label: "Qty", type: "number" },
                { name: "uom", label: "UOM", type: "text" },
                { name: "rate", label: "Item Rate", type: "number" },
                { name: "taxable_value", label: "Taxable Value", type: "number" },
                { name: "igst", label: "IGST", type: "number" },
                { name: "cgst", label: "CGST", type: "number" },
                { name: "sgst", label: "SGST/UTGST", type: "number" },
                { name: "amount", label: "Invoice Value", type: "number" }
            ],
            due_details: [
                { name: "tds_gst", label: "TDS GST", type: "number" },
                { name: "tds_it", label: "TDS/TCS under IT", type: "number" },
                { name: "advance_paid", label: "Advance Paid", type: "number" },
                { name: "to_pay", label: "To Pay", type: "number" },
            ],
            transit_details: [
                { name: "mode", label: "Mode of Transport", type: "text" },
                { name: "transporter_name", label: "Transporter Name", type: "text" },
                { name: "vehicle_no", label: "Vehicle No.", type: "text" },
                { name: "lr_gr_consignment", label: "LR/GR/Consignment No", type: "text" },
                { name: "irn", label: "IRN", type: "text" },
                { name: "ack_no", label: "Ack. No.", type: "text" },
                { name: "ack_date", label: "Ack. Date", type: "date" },
            ]
        }
    },
    SALES: {
        sections: {
            invoice_details: [
                { name: "invoice_date", label: "Date", type: "date", mandatory: true },
                { name: "sales_invoice_no", label: "Sales Invoice No", type: "text", mandatory: true },
                { name: "customer_name", label: "Customer Name", type: "text", mandatory: true },
                { name: "gstin", label: "GSTIN", type: "text", mandatory: true },
                { name: "branch", label: "Branch", type: "text" },
                { name: "place_of_supply", label: "Place of Supply", type: "text" },
                { name: "bill_to_address", label: "Billing Address", type: "text" },
            ],
            financial_details: [
                { name: "total_taxable_value", label: "Total Taxable Value", type: "number" },
                { name: "total_invoice_value", label: "Total Invoice Value", type: "number", mandatory: true },
                { name: "total_igst", label: "Total IGST", type: "number" },
                { name: "total_cgst", label: "Total CGST", type: "number" },
                { name: "total_sgst", label: "Total SGST/UTGST", type: "number" },
                { name: "sales_order_no", label: "Sales Order No", type: "text" },
            ],
            items: [
                { name: "description", label: "Item Name", type: "text" },
                { name: "hsn_sac", label: "HSN/SAC", type: "text" },
                { name: "quantity", label: "Qty", type: "number" },
                { name: "uom", label: "UOM", type: "text" },
                { name: "rate", label: "Item Rate", type: "number" },
                { name: "taxable_value", label: "Taxable Value", type: "number" },
                { name: "igst", label: "IGST", type: "number" },
                { name: "cgst", label: "CGST", type: "number" },
                { name: "sgst", label: "SGST/UTGST", type: "number" },
                { name: "amount", label: "Invoice Value", type: "number" },
            ],
            compliance_details: [
                { name: "irn", label: "IRN", type: "text" },
                { name: "ack_no", label: "Ack. No.", type: "text" },
                { name: "ack_date", label: "Ack. Date", type: "date" },
            ]
        }
    },
    PAYMENT: {
        sections: {
            voucher_details: [
                { name: "invoice_date", label: "Voucher Date", type: "date", mandatory: true },
                { name: "account", label: "Account", type: "text", mandatory: true },
                { name: "party", label: "Party", type: "text", mandatory: true },
                { name: "total_invoice_value", label: "Amount", type: "number", mandatory: true },
                { name: "narration", label: "Narration", type: "text" },
                { name: "reference_no", label: "Reference No", type: "text" },
                { name: "bank_name", label: "Bank Name", type: "text" },
            ]
        }
    },
    RECEIPT: {
        sections: {
            voucher_details: [
                { name: "invoice_date", label: "Voucher Date", type: "date", mandatory: true },
                { name: "account", label: "Account", type: "text", mandatory: true },
                { name: "party", label: "Party", type: "text", mandatory: true },
                { name: "total_invoice_value", label: "Amount", type: "number", mandatory: true },
                { name: "narration", label: "Narration", type: "text" },
                { name: "reference_no", label: "Reference No", type: "text" },
                { name: "bank_name", label: "Bank Name", type: "text" },
            ]
        }
    },
    CONTRA: {
        sections: {
            voucher_details: [
                { name: "invoice_date", label: "Voucher Date", type: "date", mandatory: true },
                { name: "from_account", label: "From Account", type: "text", mandatory: true },
                { name: "to_account", label: "To Account", type: "text", mandatory: true },
                { name: "total_invoice_value", label: "Amount", type: "number", mandatory: true },
                { name: "narration", label: "Narration", type: "text" },
            ]
        }
    },
    JOURNAL: {
        sections: {
            voucher_details: [
                { name: "invoice_date", label: "Voucher Date", type: "date", mandatory: true },
                { name: "ledger_debit", label: "Ledger (Debit)", type: "text", mandatory: true },
                { name: "ledger_credit", label: "Ledger (Credit)", type: "text", mandatory: true },
                { name: "total_invoice_value", label: "Amount", type: "number", mandatory: true },
                { name: "narration", label: "Narration", type: "text" },
            ]
        }
    }
};

export const getVoucherSchema = (voucherType: string): VoucherSchema => {
    return VOUCHER_SCHEMAS[voucherType.toUpperCase()] || VOUCHER_SCHEMAS.PURCHASE;
};

export const getVoucherFlatHeaders = (voucherType: string): string[] => {
    const schema = getVoucherSchema(voucherType);
    const headers: string[] = [];
    Object.values(schema.sections).forEach(fields => {
        fields.forEach(f => headers.push(f.label));
    });
    return headers;
};
