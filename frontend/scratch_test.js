
const ALIASES = {
    'invoice_date': ['Date', 'Voucher Date', 'Inv Date', 'Bill Date', 'Reference Date'],
    'invoice_no': ['Invoice No', 'Supplier Invoice No.', 'Supplier Invoice No', 'Voucher Number', 'Inv No', 'Bill No', 'Reference No.', 'Sales Invoice No'],
    'vendor_name': ['Name', 'Vendor Name', 'Supplier Name', 'Party Name', 'Party', 'Customer Name', 'Buyer/Supplier - Mailing Name'],
    'vendor_address': ['Bill Address From', 'Vendor Address', 'Address', 'Supplier Address', 'Bill From', 'Buyer/Supplier - Address', 'Buyer/Supplier - Bill to/from', 'Bill From Address', 'Ship From Address', 'Consignee Address', 'bill_from'],
    'bill_from': ['Bill Address From', 'Bill From', 'Bill From Address', 'Ship From Address', 'Dispatch From Address', 'vendor_address'],
    'bill_to_address': ['Bill Address To', 'Billing Address', 'Customer Address', 'Buyer Address', 'bill_to', 'billing_address'],
};

function getCellValue(data, col) {
    if (data[col] !== undefined && data[col] !== null && data[col] !== '') return String(data[col]);

    const snakeCol = col.toLowerCase().replace(/[\s\/\-\.]+/g, '_').replace(/^_|_$/g, '');
    if (data[snakeCol] !== undefined && data[snakeCol] !== null && data[snakeCol] !== '') return String(data[snakeCol]);

    for (const [key, altList] of Object.entries(ALIASES)) {
        if (key === snakeCol || altList.includes(col) || altList.some(a => a.toLowerCase().replace(/[\s\/\-\.]+/g, '_').replace(/^_|_$/g, '') === snakeCol)) {
            if (data[key] !== undefined && data[key] !== null && data[key] !== '') return String(data[key]);
            for (const alt of altList) {
                if (data[alt] !== undefined && data[alt] !== null && data[alt] !== '') return String(data[alt]);
            }
        }
    }
    return '';
}

const ZOHO_COLUMNS = [
    'Date', 'Invoice No', 'Name', 'GSTIN', 'Branch', 'Place of Supply', 'Bill Address From', 'Bill Address To'
];

// Mock API response data
const backendResponse = {
    "sections": {
        "supplier_details": {
            "vendor_name": "RAJHANS STEEL INDIA",
            "vendor_address": "NO. 123, COIMBATORE, TAMIL NADU - 641001",
            "bill_from": "NO. 123, COIMBATORE, TAMIL NADU - 641001"
        }
    },
    "vendor_name": "RAJHANS STEEL INDIA",
    "vendor_address": "NO. 123, COIMBATORE, TAMIL NADU - 641001"
};

// Frontend Flattening
const resData = backendResponse;
const flattenedHeader = {
    ...(resData.sections?.supplier_details || {}),
    ...(resData.sections?.supply_details || {}),
    ...(resData.data || resData)
};
console.log("Flattened Header:", flattenedHeader);

// Frontend Mapping
const normalizedHeader = {};
ZOHO_COLUMNS.forEach(field => {
    normalizedHeader[field] = getCellValue(flattenedHeader, field);
});
console.log("Normalized Header:", normalizedHeader);

// Frontend resolveZohoValue
function resolveZohoValue(header, item, col) {
    if (col === "Bill Address From") {
        return getCellValue(header, "Bill Address From") || getCellValue(header, "bill_from") || getCellValue(header, "vendor_address");
    }
    return getCellValue(header, col);
}

console.log("Resolved Bill Address From:", resolveZohoValue(normalizedHeader, {}, "Bill Address From"));
