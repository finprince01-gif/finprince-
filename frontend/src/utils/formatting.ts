export const formatCurrency = (amount: number, currency = 'INR', maximumFractionDigits = 0) => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency,
        maximumFractionDigits,
    }).format(amount);
};

export const formatPercentage = (value: number, decimals = 1) => {
    return `${value.toFixed(decimals)}%`;
};

export const updateCurrencySymbol = (text: string) => {
    return text.replace('INR', '₹');
};

export const formatDate = (dateStr: string | null | undefined): string => {
    if (!dateStr || dateStr === '-') return '-';
    // Handle ISO string or YYYY-MM-DD
    const datePart = (dateStr && dateStr.includes('T')) ? dateStr.split('T')[0] : dateStr;
    const parts = datePart ? datePart.split('-') : [];
    if (parts.length === 3) {
        const [year, month, day] = parts;
        if (year.length === 4) {
            return `${day}-${month}-${year}`;
        }
    }
    return dateStr || '-';
};
