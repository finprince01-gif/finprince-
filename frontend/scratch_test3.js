
const original = {
    extracted_data: {
        vendor_name: "abc",
        vendor_address: "123 street",
        sections: {
            supplier_details: {
                vendor_address: "123 street"
            }
        }
    }
};

const reconstructed = {
    vendor_name: "abc",
    items: [],
    total_taxable_value: 100,
    total_invoice_value: 100,
    "Bill Address From": "123 street backend explicit" // NEW FROM API
};

const final = {
    ...original,
    extracted_data: {
        ...original.extracted_data,
        sections: {
            ...original.extracted_data?.sections,
            items: reconstructed.items,
            supply_details: {
                ...original.extracted_data?.sections?.supply_details,
                total_taxable_value: reconstructed.total_taxable_value,
                total_invoice_value: reconstructed.total_invoice_value
            }
        },
        ...reconstructed
    }
};

// Frontend Flattening
const resData = final.extracted_data;
const flattenedHeader = {
    ...(resData.sections?.supplier_details || {}),
    ...(resData.sections?.supply_details || {}),
    ...(resData.data || resData)
};

console.log("flattenedHeader['Bill Address From']:", flattenedHeader["Bill Address From"]);

function getCellValue(data, col) {
    if (data[col] !== undefined && data[col] !== null && data[col] !== '') return String(data[col]);
    return "FALLBACK";
}

const normalizedHeader = {};
['Bill Address From'].forEach(field => {
    normalizedHeader[field] = getCellValue(flattenedHeader, field);
});

console.log("normalizedHeader['Bill Address From']:", normalizedHeader["Bill Address From"]);
