import { httpClient } from '../services';

/**
 * Returns the current Indian financial year suffix as "YY-YY"
 * Financial year runs from 1 April to 31 March.
 * e.g. May 2026 -> "26-27", Feb 2027 -> "26-27", Apr 2027 -> "27-28"
 */
export const getCurrentFYSuffix = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // 1-based
  // Financial year starts April (month 4)
  const fyStart = month >= 4 ? year : year - 1;
  const fyEnd = fyStart + 1;
  return `${String(fyStart).slice(-2)}-${String(fyEnd).slice(-2)}`;
};

/** Default voucher configs per tab type */
export const getDefaultVoucherConfig = (voucherType: string) => {
  const fy = getCurrentFYSuffix();
  const map: Record<string, { voucher_name: string; prefix: string; suffix: string }> = {
    'sales':      { voucher_name: 'Sales Voucher',      prefix: 'SAL',  suffix: fy },
    'credit-note':{ voucher_name: 'Credit Note',        prefix: 'CRN',  suffix: fy },
    'receipts':   { voucher_name: 'Receipt Voucher',    prefix: 'REC',  suffix: fy },
    'purchases':  { voucher_name: 'Purchase Voucher',   prefix: 'PUR',  suffix: fy },
    'debit-note': { voucher_name: 'Debit Note',         prefix: 'DBN',  suffix: fy },
    'payments':   { voucher_name: 'Payment Voucher',    prefix: 'PAY',  suffix: fy },
    'expenses':   { voucher_name: 'Expense Voucher',    prefix: 'EXP',  suffix: fy },
    'journal':    { voucher_name: 'Journal Voucher',    prefix: 'JRN',  suffix: fy },
    'contra':     { voucher_name: 'Contra Voucher',     prefix: 'CON',  suffix: fy },
  };
  return map[voucherType] || { voucher_name: 'Voucher', prefix: 'VCH', suffix: fy };
};

export const autoInitializeVoucherConfig = async (
  voucherType: string,
  endpoint: string,
  configs: any[]
): Promise<any[]> => {
  if (configs && configs.length > 0) {
    return configs;
  }

  const def = getDefaultVoucherConfig(voucherType);
  const payload = {
    voucher_name: def.voucher_name,
    enable_auto_numbering: true,
    prefix: def.prefix,
    suffix: def.suffix,
    start_from: 1,
    required_digits: 4,
  };

  try {
    await httpClient.post(endpoint, payload);
    const refreshed = await httpClient.get<any[]>(endpoint);
    return refreshed || [];
  } catch (error) {
    console.error(`Failed to auto-initialize voucher config for ${voucherType}:`, error);
    return [];
  }
};
