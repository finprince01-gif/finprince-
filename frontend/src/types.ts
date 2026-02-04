export type Page = 'Dashboard' | 'Masters' | 'Inventory' | 'Vouchers' | 'Reports' | 'Settings' | 'MassUploadResult' | 'Vendor Portal' | 'Customer Portal' | 'Payroll' | 'Service' | 'GST' | 'Users & Roles';

export interface CompanyDetails {
  name: string;
  address: string;
  gstin: string;
  state: string;
  logo?: string;
  tax_id?: string; // Added tax_id
  email?: string;
  phone?: string;
  website?: string;
  pan?: string;
  cin?: string;
  voucherNumbering?: {
    [voucherType: string]: {
      autoIncrement: boolean;
      prefix: string;
      nextNumber: number;
      width: number;
      suffix: string;
    };
  };

}

export interface LedgerGroupMaster {
  id?: number;
  name: string;
  under: string; // references another group name, or is a primary group
}

export type LedgerGroup = 'Sundry Debtors' | 'Sundry Creditors' | 'Bank Accounts' | 'Cash-in-Hand' | 'Duties & Taxes' | 'Direct Expenses' | 'Indirect Incomes' | 'Sales Accounts' | 'Purchase Accounts' | 'Capital Account' | 'Current Assets' | 'Current Liabilities' | 'Fixed Assets' | 'Investments' | 'Loans (Liability)' | 'Misc. Expenses (ASSET)' | 'Branch / Divisions' | 'Reserves & Surplus' | 'Secured Loans' | 'Unsecured Loans' | 'Suspense A/c' | 'Bank OD A/c';

export interface Ledger {
  id?: number;
  name: string;
  group: string;

  // Hierarchy fields (required by backend)
  category?: string;
  sub_group_1?: string;
  sub_group_2?: string;
  sub_group_3?: string;
  ledger_type?: string;

  // Parent ledger for nested custom ledgers
  parent_ledger_id?: number;

  // Auto-generated code based on hierarchy
  ledger_code?: string;

  gstin?: string;
  registrationType?: 'Registered' | 'Unregistered' | 'Composition';
  state?: string;
  loanAccountNumber?: string;
  panGstin?: string;
  lenderName?: string;
  loanAmount?: string;
  interestType?: string;
  interestRate?: string;
  loanStartDate?: string;
  loanEndDate?: string;
  securityType?: string; // 'Collateral' or 'Guarantee'
  tenure?: string; // Backward compatibility - tenure in months
  tenureOption?: string; // 'dates' or 'tenure'
  tenureDays?: string;
  tenureMonths?: string;
  tenureYears?: string;
  bankAccountNumber?: string;
  gstinPan?: string;
  enableBankReconciliation?: boolean;
  bankName?: string;
  ifscCode?: string;
  branch?: string;
  bankingCurrency?: string;
  referenceWiseTracking?: string;
  creditPeriod?: string;
  isDepreciationPerIncomeTax?: string;
  depreciationPercentage?: string;
  isAmortizationPerIncomeTax?: string;
  amortizationPercentage?: string;
  companyCIN?: string;
  dividendRate?: string;
  equityInstrumentsCIN?: string;
  debentureBondCIN?: string;
  debentureBondInterestRate?: string;
  debentureBondMaturityDate?: string;
  inventoryType?: string;
  inventoryValuationMethod?: string;
  cashLocation?: string;
  question_answers?: Record<number, any>;
  additional_data?: {
    opening_balance?: number;
    current_balance?: number;
    [key: string]: any;
  };
  balance?: number;  // Computed balance from journal entries
}



export interface VoucherItem {
  name: string;
  qty: number;
  rate: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalAmount: number;
}
export interface StockItem {
  id: string | number;
  name: string;
  gstRate?: number;
  // Add other fields as needed based on backend/inventory/serializers.py or usage
}

export interface Unit {
  id: number;
  name: string;
  symbol: string;
}

export interface StockGroup {
  id: number;
  name: string;
  parent?: number | null;
}

export type VoucherType = 'Purchase' | 'Sales' | 'Payment' | 'Receipt' | 'Contra' | 'Journal' | 'Expenses' | 'Credit Note' | 'Debit Note';

export interface BaseVoucher {
  id: string;
  type: VoucherType;
  date: string;
  narration?: string;
  image?: string;
}

export interface SalesPurchaseVoucher extends BaseVoucher {
  type: 'Purchase' | 'Sales';
  isInterState: boolean;
  invoiceNo: string;
  dueDate?: string;
  party: string;
  items: VoucherItem[];
  totalTaxableAmount: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  total: number;
}

export interface PaymentReceiptVoucher extends BaseVoucher {
  type: 'Payment' | 'Receipt';
  account: string; // Bank or Cash ledger
  party: string;
  amount: number;
}

export interface ContraVoucher extends BaseVoucher {
  type: 'Contra';
  fromAccount: string; // From Cash/Bank
  toAccount: string;   // To Cash/Bank
  amount: number;
}

export interface JournalEntry {
  ledger: string;
  note: string;
  refNo: string;
  debit: number;
  credit: number;
}
export interface JournalVoucher extends BaseVoucher {
  type: 'Journal';
  entries: JournalEntry[];
  totalDebit: number;
  totalCredit: number;
};

export interface ExpensesVoucher extends BaseVoucher {
  type: 'Expenses';
  account: string; // Bank or Cash ledger (Paid From)
  party: string;   // Expense category ledger
  amount: number;
}


export type Voucher = SalesPurchaseVoucher | PaymentReceiptVoucher | ContraVoucher | JournalVoucher | ExpensesVoucher;

// Voucher Masters
export interface VoucherTypeMaster {
  id: number;
  name: string;
  description?: string;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
}

export interface VoucherNumbering {
  enableAuto: boolean;
  prefix: string;
  suffix: string;
  nextNumber: number;
  padding: number;
  preview?: string;
}

// For AI data extraction
export interface ExtractedLineItem {
  itemDescription: string;
  hsnCode: string;
  quantity: number;
  rate: number;
}

export interface ExtractedInvoiceData {
  sellerName: string;
  invoiceNumber: string;
  invoiceDate: string; // YYYY-MM-DD
  dueDate?: string; // YYYY-MM-DD
  subtotal: number;
  cgstAmount: number;
  sgstAmount: number;
  totalAmount: number;
  lineItems: ExtractedLineItem[];
}

// For AI Agent
export interface AgentMessage {
  role: 'user' | 'model';
  text: string;
  sources?: { uri: string; title: string; }[];
}

// For Mass Upload feature
export type MassUploadStatus = 'pending' | 'processing' | 'success' | 'error';

export interface MassUploadFile {
  id: string;
  file: File;
  status: MassUploadStatus;
  extractedData?: ExtractedInvoiceData;
  error?: string;
}

// For User Management
export interface User {
  id: number;
  username: string;
  name: string;
  email?: string;
  is_active: boolean;
  tenantId: string;
}

// Login response
export interface LoginResponse {
  success: boolean;
  user: {
    id: number;
    name: string;
    email?: string;
    tenantId: string;
  };
  tenantId: string;
  token: string;
}

// OTP verification response (includes auto-login tokens)
export interface OTPVerificationResponse {
  success: boolean;
  message?: string;
  access?: string;
  refresh?: string;
  user?: {
    id: number;
    username: string;
    email?: string;
    phone?: string;
    company_name?: string;
    tenant_id?: string;
  };
}

// For Module-Submodule UI
export interface Submodule {
  id: number;
  name: string;
  description?: string;
  user_table?: number;
  created_at?: string;
}

export interface UserTable {
  id: number;
  name: string;
  description?: string;
  submodules: Submodule[];
  created_at?: string;
}
