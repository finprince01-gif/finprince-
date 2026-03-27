# backend/vouchers/schema_config.py

VOUCHER_SCHEMAS = {
    'PURCHASE': {
        'sections': {
            'supplier_details': [
                {'name': 'invoice_date', 'label': 'Date', 'type': 'date', 'mandatory': True},
                {'name': 'supplier_invoice_no', 'label': 'Supplier Invoice No', 'type': 'text', 'mandatory': True},
                {'name': 'vendor_name', 'label': 'Vendor Name', 'type': 'text', 'mandatory': True},
                {'name': 'gstin', 'label': 'GSTIN', 'type': 'text', 'mandatory': True},
                {'name': 'branch', 'label': 'Branch', 'type': 'text'},
                {'name': 'place_of_supply', 'label': 'Place of Supply', 'type': 'text'},
                {'name': 'purchase_voucher_series', 'label': 'Purchase Voucher Series', 'type': 'text'},
                {'name': 'purchase_voucher_no', 'label': 'Purchase Voucher No', 'type': 'text'},
                {'name': 'grn_reference', 'label': 'GRN Reference', 'type': 'text'},
                {'name': 'bill_from', 'label': 'Bill From Address', 'type': 'text'},
                {'name': 'ship_from', 'label': 'Ship From Address', 'type': 'text'},
            ],
            'supply_details': [
                {'name': 'purchase_order_no', 'label': 'Purchase Order No', 'type': 'text'},
                {'name': 'purchase_ledger', 'label': 'Purchase Ledger', 'type': 'text'},
                {'name': 'exchange_rate', 'label': 'Exchange Rate', 'type': 'number'},
                {'name': 'total_taxable_value', 'label': 'Total Taxable Value', 'type': 'number'},
                {'name': 'total_igst', 'label': 'Total IGST', 'type': 'number'},
                {'name': 'total_cgst', 'label': 'Total CGST', 'type': 'number'},
                {'name': 'total_sgst', 'label': 'Total SGST/UTGST', 'type': 'number'},
                {'name': 'total_invoice_value', 'label': 'Total Invoice Value', 'type': 'number', 'mandatory': True},
            ],
            'items': [
                {'name': 'description', 'label': 'Item Name', 'type': 'text'},
                {'name': 'hsn_sac', 'label': 'HSN/SAC', 'type': 'text'},
                {'name': 'quantity', 'label': 'Qty', 'type': 'number'},
                {'name': 'uom', 'label': 'UOM', 'type': 'text'},
                {'name': 'rate', 'label': 'Item Rate', 'type': 'number'},
                {'name': 'taxable_value', 'label': 'Taxable Value', 'type': 'number'},
                {'name': 'igst', 'label': 'IGST', 'type': 'number'},
                {'name': 'cgst', 'label': 'CGST', 'type': 'number'},
                {'name': 'sgst', 'label': 'SGST/UTGST', 'type': 'number'},
                {'name': 'amount', 'label': 'Invoice Value', 'type': 'number'},
            ],
            'due_details': [
                {'name': 'tds_gst', 'label': 'TDS GST', 'type': 'number'},
                {'name': 'tds_it', 'label': 'TDS/TCS under IT', 'type': 'number'},
                {'name': 'advance_paid', 'label': 'Advance Paid', 'type': 'number'},
                {'name': 'to_pay', 'label': 'To Pay', 'type': 'number'},
                {'name': 'posting_note', 'label': 'Posting Note', 'type': 'text'},
                {'name': 'terms', 'label': 'Terms & Conditions', 'type': 'text'},
            ],
            'transit_details': [
                {'name': 'mode', 'label': 'Mode of Transport', 'type': 'text'},
                {'name': 'transporter_name', 'label': 'Transporter Name', 'type': 'text'},
                {'name': 'vehicle_no', 'label': 'Vehicle No.', 'type': 'text'},
                {'name': 'lr_gr_consignment', 'label': 'LR/GR/Consignment No', 'type': 'text'},
                {'name': 'irn', 'label': 'IRN', 'type': 'text'},
                {'name': 'ack_no', 'label': 'Ack. No.', 'type': 'text'},
                {'name': 'ack_date', 'label': 'Ack. Date', 'type': 'date'},
            ]
        }
    },
    'SALES': {
        'sections': {
            'invoice_details': [
                {'name': 'invoice_date', 'label': 'Date', 'type': 'date', 'mandatory': True},
                {'name': 'sales_invoice_no', 'label': 'Invoice No', 'type': 'text', 'mandatory': True},
                {'name': 'customer_name', 'label': 'Customer Name', 'type': 'text', 'mandatory': True},
                {'name': 'gstin', 'label': 'GSTIN', 'type': 'text', 'mandatory': True},
                {'name': 'branch', 'label': 'Branch', 'type': 'text'},
                {'name': 'place_of_supply', 'label': 'Place of Supply', 'type': 'text'},
                {'name': 'bill_to_address', 'label': 'Billing Address', 'type': 'text'},
                {'name': 'ship_to_address', 'label': 'Shipping Address', 'type': 'text'},
            ],
            'financial_details': [
                {'name': 'total_taxable_value', 'label': 'Total Taxable Value', 'type': 'number'},
                {'name': 'total_igst', 'label': 'Total IGST', 'type': 'number'},
                {'name': 'total_cgst', 'label': 'Total CGST', 'type': 'number'},
                {'name': 'total_sgst', 'label': 'Total SGST/UTGST', 'type': 'number'},
                {'name': 'total_invoice_value', 'label': 'Total Invoice Value', 'type': 'number', 'mandatory': True},
                {'name': 'sales_order_no', 'label': 'Sales Order No', 'type': 'text'},
            ],
            'items': [
                {'name': 'description', 'label': 'Item Name', 'type': 'text'},
                {'name': 'hsn_sac', 'label': 'HSN/SAC', 'type': 'text'},
                {'name': 'quantity', 'label': 'Qty', 'type': 'number'},
                {'name': 'uom', 'label': 'UOM', 'type': 'text'},
                {'name': 'rate', 'label': 'Item Rate', 'type': 'number'},
                {'name': 'taxable_value', 'label': 'Taxable Value', 'type': 'number'},
                {'name': 'igst', 'label': 'IGST', 'type': 'number'},
                {'name': 'cgst', 'label': 'CGST', 'type': 'number'},
                {'name': 'sgst', 'label': 'SGST/UTGST', 'type': 'number'},
                {'name': 'amount', 'label': 'Invoice Value', 'type': 'number'},
            ],
            'compliance_details': [
                {'name': 'irn', 'label': 'IRN', 'type': 'text'},
                {'name': 'ack_no', 'label': 'Ack. No.', 'type': 'text'},
                {'name': 'ack_date', 'label': 'Ack. Date', 'type': 'date'},
            ]
        }
    },
    'PAYMENT': {
        'sections': {
            'voucher_details': [
                {'name': 'invoice_date', 'label': 'Voucher Date', 'type': 'date', 'mandatory': True},
                {'name': 'account', 'label': 'Account', 'type': 'text', 'mandatory': True},
                {'name': 'party', 'label': 'Party', 'type': 'text', 'mandatory': True},
                {'name': 'total_invoice_value', 'label': 'Amount', 'type': 'number', 'mandatory': True},
                {'name': 'narration', 'label': 'Narration', 'type': 'text'},
                {'name': 'reference_no', 'label': 'Reference No', 'type': 'text'},
                {'name': 'bank_name', 'label': 'Bank Name', 'type': 'text'},
            ]
        }
    },
    'RECEIPT': {
        'sections': {
            'voucher_details': [
                {'name': 'invoice_date', 'label': 'Voucher Date', 'type': 'date', 'mandatory': True},
                {'name': 'account', 'label': 'Account', 'type': 'text', 'mandatory': True},
                {'name': 'party', 'label': 'Party', 'type': 'text', 'mandatory': True},
                {'name': 'total_invoice_value', 'label': 'Amount', 'type': 'number', 'mandatory': True},
                {'name': 'narration', 'label': 'Narration', 'type': 'text'},
                {'name': 'reference_no', 'label': 'Reference No', 'type': 'text'},
                {'name': 'bank_name', 'label': 'Bank Name', 'type': 'text'},
            ]
        }
    },
    'CONTRA': {
        'sections': {
            'voucher_details': [
                {'name': 'invoice_date', 'label': 'Voucher Date', 'type': 'date', 'mandatory': True},
                {'name': 'from_account', 'label': 'From Account', 'type': 'text', 'mandatory': True},
                {'name': 'to_account', 'label': 'To Account', 'type': 'text', 'mandatory': True},
                {'name': 'total_invoice_value', 'label': 'Amount', 'type': 'number', 'mandatory': True},
                {'name': 'narration', 'label': 'Narration', 'type': 'text'},
            ]
        }
    },
    'JOURNAL': {
        'sections': {
            'voucher_details': [
                {'name': 'invoice_date', 'label': 'Voucher Date', 'type': 'date', 'mandatory': True},
                {'name': 'ledger_debit', 'label': 'Ledger (Debit)', 'type': 'text', 'mandatory': True},
                {'name': 'ledger_credit', 'label': 'Ledger (Credit)', 'type': 'text', 'mandatory': True},
                {'name': 'total_invoice_value', 'label': 'Amount', 'type': 'number', 'mandatory': True},
                {'name': 'narration', 'label': 'Narration', 'type': 'text'},
            ]
        }
    }
}

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response

def get_schema(voucher_type):
    # Standardize to uppercase
    vt = (voucher_type or 'PURCHASE').upper()
    return VOUCHER_SCHEMAS.get(vt, VOUCHER_SCHEMAS['PURCHASE'])

@api_view(['GET'])
@permission_classes([AllowAny]) # For easier access or change to IsAuthenticated if needed
def get_voucher_schema_view(request):
    """
    Returns the full section-based schema for a specific voucher type.
    """
    v_type = request.query_params.get('type', 'PURCHASE').upper()
    schema = get_schema(v_type)
    return Response(schema)

def get_flat_fields(voucher_type):
    schema = get_schema(voucher_type)
    fields = []
    for section_name, section_fields in schema.get('sections', {}).items():
        if section_name == 'items':
            continue
        fields.extend(section_fields)
    return fields
