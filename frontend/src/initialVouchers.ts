import type { Voucher } from './types';

export const initialVouchers: Voucher[] = [
  // Sales Vouchers
  {
    id: 'sales-001',
    type: 'Sales',
    date: '2024-01-15',
    isInterState: false,
    invoiceNo: 'INV-0001/24-25',
    party: 'Customer A',
    items: [
      {
        name: 'Product A',
        qty: 10,
        rate: 100,
        taxableAmount: 1000,
        cgstAmount: 90,
        sgstAmount: 90,
        igstAmount: 0,
        totalAmount: 1180
      }
    ],
    totalTaxableAmount: 1000,
    totalCgst: 90,
    totalSgst: 90,
    totalIgst: 0,
    total: 1180,
    narration: 'Being sales made to Customer A'
  },
  {
    id: 'sales-002',
    type: 'Sales',
    date: '2024-01-20',
    isInterState: true,
    invoiceNo: 'INV-0002/24-25',
    party: 'Customer B',
    items: [
      {
        name: 'Product B',
        qty: 5,
        rate: 200,
        taxableAmount: 1000,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 180,
        totalAmount: 1180
      }
    ],
    totalTaxableAmount: 1000,
    totalCgst: 0,
    totalSgst: 0,
    totalIgst: 180,
    total: 1180,
    narration: 'Being inter-state sales to Customer B'
  },

  // Purchase Vouchers
  {
    id: 'purchase-001',
    type: 'Purchase',
    date: '2024-01-10',
    isInterState: false,
    invoiceNo: 'PO-0001/24-25',
    party: 'Supplier A',
    items: [
      {
        name: 'Raw Material A',
        qty: 20,
        rate: 50,
        taxableAmount: 1000,
        cgstAmount: 90,
        sgstAmount: 90,
        igstAmount: 0,
        totalAmount: 1180
      }
    ],
    totalTaxableAmount: 1000,
    totalCgst: 90,
    totalSgst: 90,
    totalIgst: 0,
    total: 1180,
    narration: 'Being purchase from Supplier A'
  },

  // Payment Voucher
  {
    id: 'payment-001',
    type: 'Payment',
    date: '2024-01-12',
    account: 'HDFC Bank',
    party: 'Supplier A',
    amount: 1180,
    narration: 'Payment made to Supplier A against invoice PO-0001/24-25'
  },

  // Receipt Voucher
  {
    id: 'receipt-001',
    type: 'Receipt',
    date: '2024-01-18',
    account: 'HDFC Bank',
    party: 'Customer A',
    amount: 1180,
    narration: 'Receipt from Customer A against invoice INV-0001/24-25'
  },

  // Journal Voucher
  {
    id: 'journal-001',
    type: 'Journal',
    date: '2024-01-25',
    entries: [
      { ledger: 'Salary', note: '', refNo: '', debit: 50000, credit: 0 },
      { ledger: 'Cash', note: '', refNo: '', debit: 0, credit: 50000 }
    ],
    totalDebit: 50000,
    totalCredit: 50000,
    narration: 'Salary payment for January 2024'
  },

  // Contra Voucher
  {
    id: 'contra-001',
    type: 'Contra',
    date: '2024-01-05',
    fromAccount: 'HDFC Bank',
    toAccount: 'Cash',
    amount: 10000,
    narration: 'Cash withdrawal from HDFC Bank'
  }
];
