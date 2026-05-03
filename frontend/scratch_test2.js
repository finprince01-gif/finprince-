
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
    total_invoice_value: 100
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

console.log(final.extracted_data.vendor_address);
console.log(final.extracted_data.sections.supplier_details.vendor_address);
