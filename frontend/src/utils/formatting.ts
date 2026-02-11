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
