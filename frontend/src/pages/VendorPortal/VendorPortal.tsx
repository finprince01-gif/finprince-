// Vendor Portal - Master Configuration
import React, { useState, useEffect, useMemo } from 'react';
import { ChevronDown, Eye, Pencil, Trash2, Plus, Search, Filter, ChevronLeft, X } from 'lucide-react';
import { Country, State, City } from 'country-state-city';
import { usePermissions } from '../../hooks/usePermissions';
import { httpClient } from '../../services/httpClient';
import { apiService } from '../../services/api';
import CategoryHierarchicalDropdown from '../../components/CategoryHierarchicalDropdown';
import { InventoryCategoryWizard } from '../../components/InventoryCategoryWizard';
import SearchableDropdown from '../../components/SearchableDropdown';
import { showError, showSuccess, showInfo, showWarning, confirm } from '../../utils/toast';
import { handleApiError } from '../../utils/errorHandler';
import { BILLING_CURRENCIES } from '../../constants/customerPortalConstants';
import { formatDate } from '../../utils/formatting';
import VendorViewModal from '../../components/VendorViewModal';
import NetoffProcessModal from '../../components/NetoffProcessModal';


type VendorTab = 'Master' | 'Transaction';
type MasterSubTab = 'Category' | 'PO Settings' | 'Vendor Creation' | 'Basic Details' | 'Branch details' | 'Products/Services' | 'TDS & Other Statutory' | 'Banking Info' | 'Terms & Conditions';
type TransactionSubTab = 'Purchase Orders' | 'Procurement' | 'Payment';
type POSubTab = 'Dashboard' | 'Create PO' | 'Pending PO' | 'Executed PO';
type CreatePOSubTab = 'Pending for Approval' | 'Mail PO';
type ProcurementSubTab = string;

// Category Interface (Mirrors Inventory)
const VENDOR_SYSTEM_CATEGORIES = [
    'Raw Material',
    'Stores and Spares',
    'Packing Material',
    'Stock-in Trade',
    'Fixed Assets',
    'Capital Goods',
    'Consumables',
    'Services',
    'Jobwork'
];


const VENDOR_DEFAULT_GROUPS = [
    {
        name: 'Within Country (Indigenous)',
        subgroups: ['Consumables', 'Machinery Spares', 'Others']
    },
    {
        name: 'Import',
        subgroups: ['Consumables', 'Machinery Spares', 'Others']
    }
];

// TDS Rates Master Data
const TDS_RATES_MASTER: { [key: string]: { tdsRate: string; penaltyRate: string; description: string } } = {
    'Section 194C - Individual/HUF': { tdsRate: '1%', penaltyRate: '20%', description: 'Payment to Contractors who are Individuals or Hindu Undivided Family (HUF)' },
    'Section 194C - Others': { tdsRate: '2%', penaltyRate: '20%', description: 'Payment to Contractors other than Individuals & HUF' },
    'Section 194C': { tdsRate: '1% / 2%', penaltyRate: '20%', description: 'Payment to Contractors who are Individuals or Hindu Undivided Family (HUF) / Payment to Contractors other than Individuals & HUF' },
    'Section 194H': { tdsRate: '2%', penaltyRate: '20%', description: 'Commission and Brokerage to agents' },
    'Section 194-I - Rent- Land, Building, Furniture & fitting': { tdsRate: '2%', penaltyRate: '20%', description: 'Rent on Land, Building, or Furniture & Fitting paid to any entity' },
    'Section 194-I - Rent- Plant & Machinery, Equipment': { tdsRate: '10%', penaltyRate: '20%', description: 'Rent on Plant & Machinery, or Equipment paid to any entity' },
    'Section 194J - Technical Services': { tdsRate: '2%', penaltyRate: '20%', description: 'Fees for Technical Services, Call Center Operations, Royalty on sale & distribution of films' },
    'Section 194J - Professional Services': { tdsRate: '10%', penaltyRate: '20%', description: 'Professional Services, Royalty from other than films, Non-Compete Fees, etc.' },
    "Section 194J - Director's Remuneration": { tdsRate: '10%', penaltyRate: '20%', description: "Director's Remuneration (other than salary)" },
    'Section 194Q': { tdsRate: '0.10%', penaltyRate: '5%', description: 'Purchase of Goods of aggregate value exceeding Rs. 50 Lakhs' },
    'Section 194A': { tdsRate: '10%', penaltyRate: '20%', description: 'Interest payments made on loans, FDs, advances, etc., other than interest on securities' },
    'Section 194R': { tdsRate: '10%', penaltyRate: '20%', description: 'Benefit or Perquisite given by a business or professional exceeding Rs 20,000' },
    'Section 194-IA': { tdsRate: '1%', penaltyRate: '20%', description: 'Transfer of immovable property valuing Rs 50 lakhs or more' },
    'Section 194-IB': { tdsRate: '2%', penaltyRate: '20%', description: 'Rent exceeding Rs 50,000 per month paid by Individual & HUFs who are not subject to tax audit' },
    'Section 194-IC': { tdsRate: '10%', penaltyRate: '20%', description: 'Payment of monetary consideration under a specified Joint Development Agreements' },
    'Section 194M': { tdsRate: '5%', penaltyRate: '20%', description: 'Payment exceeding Rs 50 Lakhs to contractors or professionals by Individuals & HUFs who are not subject to tax audit' },
    'Section 194-O': { tdsRate: '1%', penaltyRate: '5%', description: 'Facilitating sales or services by an E-commerce operator for an E-commerce participant' },
    'Section 195': { tdsRate: 'Specify "Rate" & "Nature"', penaltyRate: '-', description: 'Any payment subject to tax made to a Non-Resident or Foreign Company' }
};

const getTDSRateInfo = (section: string) => TDS_RATES_MASTER[section] || { tdsRate: '-', penaltyRate: '-', description: 'No info available' };

// TCS Rates Master Data
const TCS_RATES_MASTER: { [key: string]: { tcsRate: string; penaltyRate: string; description: string } } = {
    'Section 206C(1) - Sale of Scrap, Alcoholic Liquor, Minerals': { tcsRate: '1%', penaltyRate: '5%', description: 'Sale of Scrap, Alcoholic Liquor, or Minerals' },
    'Section 206C(1) - Sale of Tendu Leaves': { tcsRate: '5%', penaltyRate: '5%', description: 'Sale of Tendu Leaves' },
    'Section 206C(1) - Sale of Forest Produce': { tcsRate: '2%', penaltyRate: '5%', description: 'Sale of Forest Produce (other than Tendu Leaves & Timber)' },
    'Section 206C(1) - Sale of Timber': { tcsRate: '2%', penaltyRate: '5%', description: 'Sale of Timber obtained under a forest lease or by any mode' },
    'Section 206C(1F) - Sale of Motor Vehicles': { tcsRate: '1%', penaltyRate: '5%', description: 'Sale of Motor Vehicles exceeding Rs. 10 Lakhs' },
    'Section 206C(1F) - Sale of Specified Luxury Goods': { tcsRate: '1%', penaltyRate: '5%', description: 'Sale of Specified Luxury Goods (watches, art, bags, etc.) exceeding Rs. 10 Lakhs' },
};

const getTCSRateInfo = (section: string) => TCS_RATES_MASTER[section] || null;

interface Category {
    id: number;
    category: string;
    group: string | null;
    subgroup: string | null;
    is_active: boolean;
    full_path: string;
    tenant_id: string;
    created_at: string;
    updated_at: string;
}

// PO Series Interface
interface POSeries {
    id: number;
    name: string;
    category: number; // Category ID
    category_name?: string; // Category name (read-only from API)
    category_path?: string; // Full category path (read-only from API)
    prefix: string;
    suffix: string;
    auto_year: boolean;  // Changed from auto_financial_year
    digits: number;
    current_number: number;  // Changed from current_value
    is_active: boolean;
}

// Vendor Basic Detail Interface
interface VendorBasicDetail {
    id: number;
    tenant_id: string;
    vendor_code: string;
    vendor_name: string;
    pan_no?: string;
    contact_person?: string;
    email: string;
    contact_no: string;
    is_also_customer: boolean;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

interface VendorPortalProps {
    onLogout?: () => void;
    onNavigate?: (page: any) => void;
    setPrefilledVoucherData?: (data: any) => void;
}

const VendorPortalPage: React.FC<VendorPortalProps> = ({ onLogout, onNavigate, setPrefilledVoucherData }) => {
    const { hasTabAccess, isSuperuser } = usePermissions();
    // GST Details Interfaces (Defined inside to avoid placement issues, or better moved out if stable)
    // Actually, moving them here
    interface PlaceOfBusiness {
        id: string;
        referenceName: string;
        address: string;
        addressLine1: string;
        addressLine2: string;
        addressLine3: string;
        contactPerson: string;
        email: string;
        contactNumber: string;
        pincode: string;
        city: string;
        state: string;
        country: string;
        isExpanded?: boolean;
    }

    interface GSTRecord {
        id: string;
        gstin: string;
        registrationType: 'Regular' | 'Composition' | 'SEZ' | 'Unregistered';
        tradeName?: string;
        legalName?: string;
        placesOfBusiness: PlaceOfBusiness[];
        isExpanded?: boolean;
    }
    // Tab State
    const allTabs: VendorTab[] = ['Master', 'Transaction'];
    const availableTabs = isSuperuser
        ? allTabs
        : allTabs.filter(tab => {
            const masterSubs = ['Category', 'PO Settings', 'Vendor Creation'];
            const transSubs = ['Purchase Orders', 'Procurement', 'Payment'];
            if (tab === 'Master') return masterSubs.some(t => hasTabAccess('Vendor Portal', t));
            if (tab === 'Transaction') return transSubs.some(t => hasTabAccess('Vendor Portal', t));
            return false;
        });

    const [activeTab, setActiveTab] = useState<VendorTab>(availableTabs.length > 0 ? availableTabs[0] : 'Master');

    useEffect(() => {
        if (availableTabs.length > 0 && !availableTabs.includes(activeTab)) {
            setActiveTab(availableTabs[0]);
        }
    }, [availableTabs, activeTab]);

    const [activeMasterSubTab, setActiveMasterSubTab] = useState<MasterSubTab>('Category');
    const [activeTransactionSubTab, setActiveTransactionSubTab] = useState<TransactionSubTab>('Purchase Orders');
    const [activePOSubTab, setActivePOSubTab] = useState<POSubTab>('Dashboard');
    const [activeCreatePOSubTab, setActiveCreatePOSubTab] = useState<CreatePOSubTab>('Pending for Approval');
    const [activeProcurementSubTab, setActiveProcurementSubTab] = useState<ProcurementSubTab>('Dashboard');
    const [activePaymentSubTab, setActivePaymentSubTab] = useState<ProcurementSubTab>('Dashboard');

    // Procurement View State (New)
    const [procurementViewMode, setProcurementViewMode] = useState<'list' | 'ledger' | 'month' | 'journal'>('list');
    const [selectedProcurementVendor, setSelectedProcurementVendor] = useState<any>(null);

    // Month Filter State
    const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
    const [isMonthFilterOpen, setIsMonthFilterOpen] = useState(false);

    const [ledgerFilters, setLedgerFilters] = useState({
        date: '',
        dateFrom: '',
        dateTo: '',
        transferFrom: '',
        referenceNo: '',
        ledger: '',
        status: '',
        debit: '',
        credit: '',
        runningBalance: ''
    });

    const [activeFilter, setActiveFilter] = useState<string | null>(null);
    const [procurementSearchTerm, setProcurementSearchTerm] = useState('');
    const [paymentSearchTerm, setPaymentSearchTerm] = useState('');

    const toggleFilter = (filterName: string) => setActiveFilter(prev => prev === filterName ? null : filterName);

    // Filter vendor aging data based on search term
    const getFilteredVendorAging = (data: any[]) => {
        if (!procurementSearchTerm) return data;
        return data.filter(vendor =>
            vendor.name.toLowerCase().includes(procurementSearchTerm.toLowerCase()) ||
            vendor.code.toLowerCase().includes(procurementSearchTerm.toLowerCase())
        );
    };

    // Live Procurement Aging State (replaces mock data)
    const [purchaseVouchers, setPurchaseVouchers] = useState<any[]>([]);
    const [advancePayments, setAdvancePayments] = useState<any[]>([]);
    const [allAdvancePayments, setAllAdvancePayments] = useState<any[]>([]); // For dashboard tiles
    const [loadingProcurementAging, setLoadingProcurementAging] = useState(false);

    // Fetch purchase vouchers and advances when Procurement tab is active
    useEffect(() => {
        if (activeTransactionSubTab === 'Procurement') {
            const fetchProcurementData = async () => {
                setLoadingProcurementAging(true);
                try {
                    const [pvRes, advResAll, advResSpecific] = await Promise.all([
                        httpClient.get('/api/vouchers/purchase/'),
                        apiService.getAdvances(),
                        activeProcurementSubTab !== 'Dashboard' ? apiService.getAdvances(undefined, activeProcurementSubTab) : Promise.resolve([])
                    ]);

                    const pvList: any[] = Array.isArray(pvRes) ? pvRes : ((pvRes as any)?.results || []);
                    setPurchaseVouchers(pvList);

                    const advListAll: any[] = Array.isArray(advResAll) ? advResAll : ((advResAll as any)?.results || []);
                    setAllAdvancePayments(advListAll);

                    if (activeProcurementSubTab !== 'Dashboard') {
                         const advListSpec: any[] = Array.isArray(advResSpecific) ? advResSpecific : ((advResSpecific as any)?.results || []);
                         setAdvancePayments(advListSpec);
                    }
                } catch (error) {
                    handleApiError(error, 'Fetch Procurement Data');
                } finally {
                    setLoadingProcurementAging(false);
                }
            };
            fetchProcurementData();
        }
    }, [activeTransactionSubTab, activeProcurementSubTab]);

    // Compute aging from real purchase vouchers, filtered by category
    const getVendorAgingData = (categoryName: string) => {
        if (!vendorList.length) return [];

        const vendorGroups: Record<string, {
            id: string; code: string; name: string; ledger_id?: string;
            days0to45: number; days45to90: number; months6: number; year1: number;
            advances: number;
        }> = {};

        purchaseVouchers.forEach((pv: any) => {
            const vendorId = pv.vendor_id;
            if (!vendorId) return;

            // Match vendor from vendorList
            const vendor = vendorList.find((v: any) => v.id === vendorId);
            if (!vendor) return;

            // Filter by current procurement category
            const vendorCat = ((vendor as any).vendor_category_name || (vendor as any).vendor_category || '').toLowerCase();
            if (!vendorCat.includes(categoryName.toLowerCase())) return;

            // Amount = due_details.to_pay
            const amount = parseFloat(pv.due_details?.to_pay || 0);
            if (amount <= 0) return;

            const vendorCode = vendor.vendor_code || `VEN-${vendorId}`;
            const vendorName = vendor.vendor_name || pv.vendor_name || 'Unknown Vendor';

            if (!vendorGroups[vendorId]) {
                vendorGroups[vendorId] = {
                    id: vendorId.toString(),
                    code: vendorCode,
                    name: vendorName,
                    ledger_id: (vendor as any).ledger_id || (vendor as any).ledger,
                    days0to45: 0,
                    days45to90: 0,
                    months6: 0,
                    year1: 0,
                    advances: 0,
                };
            }

            // Aging by days from purchase date
            const invDate = new Date(pv.date);
            const today = new Date();
            const diffDays = Math.ceil(Math.abs(today.getTime() - invDate.getTime()) / (1000 * 60 * 60 * 24));

            if (diffDays <= 45) {
                vendorGroups[vendorId].days0to45 += amount;
            } else if (diffDays <= 90) {
                vendorGroups[vendorId].days45to90 += amount;
            } else if (diffDays <= 180) {
                vendorGroups[vendorId].months6 += amount;
            } else {
                vendorGroups[vendorId].year1 += amount;
            }
        });

        // Add Advance Payments (negative outstanding or separate bucket)
        const advancesToUse = advancePayments.length > 0
            ? advancePayments
            : allAdvancePayments.filter((adv: any) => {
                const cat = (adv.category || '').toLowerCase();
                return cat.includes(categoryName.toLowerCase());
            });

        advancesToUse.forEach((adv: any) => {
            const ledgerId = adv.pay_to_ledger; // Unified Source of Truth
            if (!ledgerId) return;

            // Match by ledger_id
            const vendor = vendorList.find((v: any) => v.ledger_id === ledgerId || v.ledger === ledgerId);
            if (!vendor) return;

            const vendorId = vendor.id;
            const vendorCode = vendor.vendor_code || `VEN-${vendorId}`;
            const vendorName = vendor.vendor_name || adv.pay_to_name || 'Unknown Vendor';

            if (!vendorGroups[vendorId]) {
                vendorGroups[vendorId] = {
                    id: vendorId.toString(),
                    code: vendorCode,
                    name: vendorName,
                    days0to45: 0,
                    days45to90: 0,
                    months6: 0,
                    year1: 0,
                    advances: 0,
                };
            }

            const amount = parseFloat(adv.amount || 0);
            vendorGroups[vendorId].advances += amount;
        });

        return Object.values(vendorGroups);
    };

    const formatProcurementCurrency = (amount: number): string =>
        amount > 0 ? `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-';

    // Dynamic Ledger Data State
    const [vendorLedgerData, setVendorLedgerData] = useState<any[]>([]);
    const [loadingLedger, setLoadingLedger] = useState(false);

    // View Modal State
    const [viewVendorId, setViewVendorId] = useState<number | null>(null);
    const [showNetoffModal, setShowNetoffModal] = useState(false);


    // Fetch ledger data for a selected vendor, enriching Payment/Receipt entries with voucher numbers
    const fetchVendorLedger = async (vendorId: number | string, vendorName: string) => {
        setLoadingLedger(true);
        try {
            // Fetch aggregated transactions from the new Vendor Portal endpoint
            const res: any = await httpClient.get(`/api/vendors/transactions/by_vendor/?vendor_id=${vendorId}`);
            const transactions = Array.isArray(res) ? res : (res.results || []);

            const allEntries = transactions.map((t: any) => {
                const transactionType = (t.transaction_type || t.type || '').toLowerCase();
                const isDebit = ['payment', 'debit_note'].includes(transactionType);
                const amt = parseFloat(t.total_amount || t.total || t.amount || 0);

                // Map backend transaction type to frontend-friendly label
                const typeMap: Record<string, string> = {
                    'purchase': 'Purchase Voucher',
                    'payment': 'Payment Voucher',
                    'receipt': 'Receipt Voucher',
                    'debit_note': 'Debit Note',
                    'credit_note': 'Credit Note',
                    'journal': 'Journal'
                };
                const type = typeMap[transactionType] || transactionType;

                return {
                    id: `t-${t.id}`,
                    date: t.transaction_date || t.date,
                    transferFrom: type,
                    referenceNo: t.reference_number || t.transaction_number || t.number || '-',
                    ledger: transactionType === 'receipt' ? 'Receipt' : (t.ledger_name || (transactionType === 'purchase' ? 'Purchase A/c' : '-')),
                    status: (() => {
                        const refType = (t.reference_type || '').toUpperCase();
                        const txType = transactionType;
                        const amount = amt;
                        const paidAmount = parseFloat(t.paid_amount || t.used_amount || 0);

                        // ── PURCHASE: use backend credit-period due status ──────────
                        // ── PURCHASE: use backend credit-period due status ──────────
                        if (txType === 'purchase') {
                            const isFullyPaid = paidAmount >= amount && amount > 0;
                            const isPartiallyPaid = (paidAmount > 0 && paidAmount < amount) || t.status?.toLowerCase().includes('partial');

                            if (isFullyPaid || t.due_status === 'Paid') return 'Received';
                            if (isPartiallyPaid || t.due_status === 'Partially Received') return 'Partially Received';

                            // If not paid, use the due status calculated from credit period
                            if (t.due_status === 'Due') return 'Due';
                            if (t.due_status === 'Not Due') return 'Not Due';

                            return 'Not Due';
                        }

                        // ── ADVANCE entries ────────────────────────────────────────
                        if (refType === 'ADVANCE' || t.is_advance) {
                            return paidAmount > 0 ? 'Utilized' : 'Not Utilized';
                        }
                        // ── PAYMENT / RECEIPT ──────────────────────────────────────
                        if (txType === 'payment' || txType === 'receipt') {
                            return paidAmount >= amount ? 'Received' : paidAmount > 0 ? 'Partially Received' : 'Not Due';
                        }
                        // ── Fallback ───────────────────────────────────────────────
                        const s = (t.status || '').toLowerCase();
                        if (s === 'paid' || s === 'received') return 'Received';
                        if (s === 'advance') return 'Utilized';
                        return 'Not Due';
                    })(),
                    debit: isDebit ? amt : 0,
                    credit: !isDebit ? amt : 0,
                    rawVoucher: t
                };
            });

            // Calculate running balance using numeric data (Credit balance = Liability for vendors)
            const sortedEntries = allEntries.sort((a, b) => {
                const dateA = new Date(a.date).getTime();
                const dateB = new Date(b.date).getTime();
                if (dateA !== dateB) return dateA - dateB;
                return parseInt(a.id.replace('t-', '')) - parseInt(b.id.replace('t-', ''));
            });

            let balance = 0;
            const updatedEntries = sortedEntries.map(entry => {
                const pCredit = typeof entry.credit === 'number' ? entry.credit : 0;
                const pDebit = typeof entry.debit === 'number' ? entry.debit : 0;
                balance += pCredit - pDebit;

                const balanceLeft = typeof entry.rawVoucher?.payment_balance === 'number'
                    ? entry.rawVoucher.payment_balance
                    : (pCredit - pDebit); // Fallback to basic ledger math

                return {
                    ...entry,
                    // Format for display only at the final step
                    debit: entry.debit > 0 ? entry.debit.toLocaleString('en-IN') : '-',
                    credit: entry.credit > 0 ? entry.credit.toLocaleString('en-IN') : '-',
                    runningBalance: balance.toLocaleString('en-IN') + (balance >= 0 ? ' Cr' : ' Dr')
                };
            });

            setVendorLedgerData(updatedEntries);
        } catch (error) {
            console.error('Error fetching vendor ledger:', error);
            setVendorLedgerData([]);
        } finally {
            setLoadingLedger(false);
        }
    };

    const handleActionPay = (entry: any) => {
        if (!onNavigate || !setPrefilledVoucherData) {
            showError("Navigation/Payment interface is not available.");
            return;
        }

        const amt = parseFloat(entry.rawVoucher.total || entry.rawVoucher.amount || 0);

        const prefill: any = {
            sellerName: entry.rawVoucher.vendor_name || selectedProcurementVendor.name,
            invoiceNumber: entry.referenceNo,
            invoiceDate: entry.date,
            totalAmount: amt,
            account: entry.rawVoucher.pay_from_name || '', // Suggesting previous account if possible
            narration: `Payment against ${entry.transferFrom} ref: ${entry.referenceNo}`,
            reference_number: entry.referenceNo,
            bank_transaction_id: null
        };

        setPrefilledVoucherData(prefill);
        onNavigate('Vouchers');
    };


    const filteredLedgerData = vendorLedgerData.filter(entry => {
        let isDateMatch = true;
        if (ledgerFilters.date) {
            isDateMatch = entry.date.toLowerCase().includes(ledgerFilters.date.toLowerCase());
        }
        if (ledgerFilters.dateFrom && entry.date < ledgerFilters.dateFrom) isDateMatch = false;
        if (ledgerFilters.dateTo && entry.date > ledgerFilters.dateTo) isDateMatch = false;

        return (
            isDateMatch &&
            entry.transferFrom.toLowerCase().includes(ledgerFilters.transferFrom.toLowerCase()) &&
            entry.referenceNo.toLowerCase().includes(ledgerFilters.referenceNo.toLowerCase()) &&
            entry.ledger.toLowerCase().includes(ledgerFilters.ledger.toLowerCase()) &&
            entry.status.toLowerCase().includes(ledgerFilters.status.toLowerCase()) &&
            (entry.debit !== '-' ? entry.debit : '').toLowerCase().includes(ledgerFilters.debit.toLowerCase()) &&
            (entry.credit !== '-' ? entry.credit : '').toLowerCase().includes(ledgerFilters.credit.toLowerCase()) &&
            entry.runningBalance.toLowerCase().includes(ledgerFilters.runningBalance.toLowerCase())
        );
    });

    const totalDebit = filteredLedgerData.reduce((sum, entry) => {
        const val = entry.debit !== '-' ? parseFloat(entry.debit.replace(/,/g, '')) : 0;
        return sum + val;
    }, 0);

    const totalCredit = filteredLedgerData.reduce((sum, entry) => {
        const val = entry.credit !== '-' ? parseFloat(entry.credit.replace(/,/g, '')) : 0;
        return sum + val;
    }, 0);

    // Helper: map month name → zero-padded month number string (for date filtering)
    const monthNameToNumber: Record<string, string> = {
        'January': '01', 'February': '02', 'March': '03', 'April': '04',
        'May': '05', 'June': '06', 'July': '07', 'August': '08',
        'September': '09', 'October': '10', 'November': '11', 'December': '12'
    };

    const vendorMonthData = useMemo(() => {
        const months = [
            'April', 'May', 'June', 'July', 'August', 'September',
            'October', 'November', 'December', 'January', 'February', 'March'
        ];

        let cumulativeBalance = 0;

        return months.map(month => {
            const monthStr = monthNameToNumber[month];
            const entriesInMonth = vendorLedgerData.filter(entry => entry.date && entry.date.split('-')[1] === monthStr);

            const mDebit = entriesInMonth.reduce((sum, entry) => sum + (entry.debit !== '-' ? parseFloat(entry.debit.replace(/,/g, '')) : 0), 0);
            const mCredit = entriesInMonth.reduce((sum, entry) => sum + (entry.credit !== '-' ? parseFloat(entry.credit.replace(/,/g, '')) : 0), 0);

            cumulativeBalance += mCredit - mDebit;

            return {
                month,
                debit: mDebit > 0 ? mDebit.toLocaleString('en-IN') : '-',
                credit: mCredit > 0 ? mCredit.toLocaleString('en-IN') : '-',
                closingBalance: cumulativeBalance !== 0
                    ? Math.abs(cumulativeBalance).toLocaleString('en-IN') + (cumulativeBalance >= 0 ? ' Cr' : ' Dr')
                    : '-'
            };
        });
    }, [vendorLedgerData]);

    // Handler: clicking a month row → switch to bill-wise ledger view filtered by that month
    const handleMonthRowClick = (monthName: string) => {
        const monthNum = monthNameToNumber[monthName];
        if (monthNum) {
            // Filter date column: dates are YYYY-MM-DD, so match on "-MM-"
            setLedgerFilters(prev => ({ ...prev, date: `-${monthNum}-` }));
        }
        setProcurementViewMode('ledger');
    };

    // Defaulting logic for sub-tabs
    const availableMasterSubTabs = ['Category', 'PO Settings', 'Vendor Creation'].filter(subTab => isSuperuser || hasTabAccess('Vendor Portal', subTab));
    const availableTransactionSubTabs = ['Purchase Orders', 'Procurement', 'Payment'].filter(subTab => isSuperuser || hasTabAccess('Vendor Portal', subTab));

    useEffect(() => {
        // Vendor creation inner tabs are valid states — don't reset them to availableMasterSubTabs[0]
        const vendorFormTabs = ['Basic Details', 'Branch details', 'Products/Services', 'TDS & Other Statutory', 'Banking Info', 'Terms & Conditions'];
        const isInsideVendorForm = vendorFormTabs.includes(activeMasterSubTab as string);
        if (!isSuperuser && availableMasterSubTabs.length > 0 && !availableMasterSubTabs.includes(activeMasterSubTab as string) && !isInsideVendorForm) {
            setActiveMasterSubTab(availableMasterSubTabs[0] as MasterSubTab);
        }
    }, [availableMasterSubTabs, activeMasterSubTab, isSuperuser]);

    useEffect(() => {
        if (!isSuperuser && availableTransactionSubTabs.length > 0 && !availableTransactionSubTabs.includes(activeTransactionSubTab as string)) {
            setActiveTransactionSubTab(availableTransactionSubTabs[0] as TransactionSubTab);
        }
    }, [availableTransactionSubTabs, activeTransactionSubTab, isSuperuser]);

    // Category Management State
    const [categories, setCategories] = useState<Category[]>([]);
    const [loadingCategories, setLoadingCategories] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
    const [isEditModeCategory, setIsEditModeCategory] = useState(false);

    // Category Form State
    const [categoryName, setCategoryName] = useState('');
    const [parentCategoryId, setParentCategoryId] = useState<number | null>(null);
    const [parentCategoryPath, setParentCategoryPath] = useState<string>('');
    const [categoryDescription, setCategoryDescription] = useState('');
    const [categorySearchQuery, setCategorySearchQuery] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Optimized Merged Categories for Dashboards
    const allDisplayCategories = useMemo(() => {
        const userCats = categories.filter(c => c.is_active).map(c => c.category);
        return Array.from(new Set([...VENDOR_SYSTEM_CATEGORIES, ...userCats]));
    }, [categories, VENDOR_SYSTEM_CATEGORIES]);


    // PO Settings State
    const [poSeriesList, setPoSeriesList] = useState<POSeries[]>([]);
    const [loadingPOSeries, setLoadingPOSeries] = useState(false);
    const [selectedPOSeries, setSelectedPOSeries] = useState<POSeries | null>(null);
    const [isEditModePO, setIsEditModePO] = useState(false);

    // PO Form Field State
    const [poName, setPoName] = useState('');
    const [poCategoryId, setPoCategoryId] = useState<number | string | null>(null);
    const [poCategoryPath, setPoCategoryPath] = useState('');
    const [poPrefix, setPoPrefix] = useState('');
    const [poSuffix, setPoSuffix] = useState('');
    const [poAutoYear, setPoAutoYear] = useState(false);
    const [poDigits, setPoDigits] = useState(4);

    // Products/Services State
    interface VendorItem {
        id: number;
        hsnSacCode: string;
        itemCode: string;
        itemName: string;
        supplierItemCode: string;
        supplierItemName: string;
    }

    // Create PO Modal State
    const [showCreatePOModal, setShowCreatePOModal] = useState(false);
    const [createPOForm, setCreatePOForm] = useState({
        poSeriesName: '',
        poNumber: 'New PO',
        vendorName: '',
        branch: '',
        addressLine1: '',
        addressLine2: '',
        addressLine3: '',
        city: '',
        state: '',
        country: '',
        pincode: '',
        emailAddress: '',
        contractNo: '',
        receiveBy: '',
        receiveAt: '',
        deliveryTerms: '',
        supplyType: 'intrastate',  // 'intrastate' => CGST+SGST, 'interstate' => IGST
        poDate: new Date().toISOString().split('T')[0]
    });

    // PO Items State
    interface POItem {
        id: number;
        itemCode: string;
        itemName: string;
        supplierItemCode: string;
        quantity: string;
        negotiatedRate: string;
        finalRate: string;
        taxableValue: string;
        igst: string;     // IGST Amount (auto-calculated)
        cgst: string;     // CGST Amount (auto-calculated)
        sgst: string;     // SGST/UTGST Amount (auto-calculated)
        cess: string;     // Cess Amount (auto-calculated)
        netValue: string;
        uom: string;
        gstRate: string;  // GST Rate % from Item Master
        cessRate: string; // Cess Rate % from Item Master
    }

    const [poItems, setPOItems] = useState<POItem[]>([
        {
            id: 1,
            itemCode: '',
            itemName: '',
            supplierItemCode: '',
            quantity: '',
            negotiatedRate: '',
            finalRate: '',
            taxableValue: '',
            igst: '',
            cgst: '',
            sgst: '',
            cess: '',
            netValue: '',
            uom: '',
            gstRate: '',
            cessRate: ''
        }
    ]);

    // GST Details State
    const [gstRecords, setGstRecords] = useState<GSTRecord[]>([
        {
            id: '1',
            gstin: '',
            registrationType: 'Regular',
            placesOfBusiness: [],
            isExpanded: true
        }
    ]);
    const [loadingGstFetch, setLoadingGstFetch] = useState(false);

    // Vendor List State for Dropdowns
    const [vendorList, setVendorList] = useState<VendorBasicDetail[]>([]);
    const [loadingVendors, setLoadingVendors] = useState(false);
    const [vendorSearchTerm, setVendorSearchTerm] = useState('');
    const [vendorStatusFilter, setVendorStatusFilter] = useState('All Status');
    const [vendorCategoryFilter, setVendorCategoryFilter] = useState('All Categories');
    const [isCreatingVendor, setIsCreatingVendor] = useState(false);

    const fetchPurchaseOrders = async () => {
        try {
            const response: any = await httpClient.get('/api/vendors/purchase-orders/');
            const payload = response?.data?.data || response?.data || response || [];
            if (Array.isArray(payload)) {
                const mapped = payload.map((po: any) => ({
                    id: po.id,
                    poNumber: po.po_number,
                    poDate: po.po_date || (po.created_at ? po.created_at.split('T')[0] : new Date().toISOString().split('T')[0]),
                    vendorName: po.vendor_name,
                    branch: po.branch,
                    address: po.address_line1 || '',
                    status: po.status || 'Pending Approval',
                    receiveBy: po.receive_by,
                    receiveAt: po.receive_at,
                    deliveryTerms: po.delivery_terms,
                    category: po.category_name || po.category || po.po_category || '',
                    amount: po.total_value ? po.total_value.toString() : '0.00'
                }));
                // Combine with hardcoded if needed, or just replace
                // For now, let's keep hardcoded as fallback if empty
                if (mapped.length > 0) {
                    setPurchaseOrders(mapped);
                }
            }
        } catch (error) {
            console.error('Error fetching POs:', error);
        }
    };

    // Fetch Vendors
    const fetchVendors = async () => {
        try {
            setLoadingVendors(true);
            const response = await httpClient.get<VendorBasicDetail[] | any>('/api/vendors/basic-details/?page_size=10000&limit=10000');
            // Handle pagination or list
            const data = Array.isArray(response) ? response : (response.results || []);
            setVendorList(data);
        } catch (error) {
            handleApiError(error, 'Fetch Vendors');
        } finally {
            setLoadingVendors(false);
        }
    };

    useEffect(() => {
        fetchVendors();
        fetchPurchaseOrders();
    }, []);

    // Filtered Vendors for Management List
    const filteredVendors = vendorList.filter(vendor => {
        const matchesSearch =
            (vendor.vendor_name || '').toLowerCase().includes(vendorSearchTerm.toLowerCase()) ||
            (vendor.vendor_code || '').toLowerCase().includes(vendorSearchTerm.toLowerCase());
        const matchesStatus =
            vendorStatusFilter === 'All Status' ||
            (vendor.is_active ? 'Live' : 'Dormant') === vendorStatusFilter;
        // Vendor category filter (handle object or string if needed)
        const matchesCategory =
            vendorCategoryFilter === 'All Categories' ||
            (vendor as any).vendor_category === vendorCategoryFilter;

        return matchesSearch && matchesStatus && matchesCategory;
    });

    const handleCreateNewVendor = () => {
        resetVendorCreationFlow();
        // Set a new generated code
        setVendorCode(`VEN-${Date.now().toString().slice(-6)}`);
        setIsCreatingVendor(true);
        setActiveMasterSubTab('Vendor Creation');
    };

    const handleEditVendor = async (vendor: VendorBasicDetail) => {
        try {
            // Reset state first to be clean
            resetVendorCreationFlow();
            setIsCreatingVendor(true);

            // Populate Basic Details
            setCreatedVendorId(vendor.id);
            setVendorCode(vendor.vendor_code || '');
            setVendorName(vendor.vendor_name || '');
            setPanNo(vendor.pan_no || '');
            setContactPerson(vendor.contact_person || '');
            setVendorEmail(vendor.email || '');
            setContactNo(vendor.contact_no || '');
            setVendorCategory((vendor as any).vendor_category || '');
            setBillingCurrency((vendor as any).billing_currency || '');
            setIsAlsoCustomer(vendor.is_also_customer || false);
            setTcsApplicable((vendor as any).tcs_applicable || false);

            showInfo('Loading vendor details...');

            // 1. GST Details
            try {
                const gstRes: any = await httpClient.get(`/api/vendors/gst-details/?vendor_basic_detail=${vendor.id}`);
                const gstList = Array.isArray(gstRes) ? gstRes : (gstRes.data || gstRes.results || []);
                if (gstList.length > 0) {
                    const groupedGst: Record<string, GSTRecord> = {};
                    gstList.forEach((g: any) => {
                        const gstin = (g.gstin || '').trim();
                        if (!groupedGst[gstin]) {
                            groupedGst[gstin] = {
                                id: gstin || g.id?.toString() || `gst-${Math.random().toString(36).substr(2, 9)}`,
                                gstin: gstin,
                                registrationType: g.registration_type || 'Regular',
                                tradeName: g.trade_name || '',
                                legalName: g.legal_name || '',
                                placesOfBusiness: [],
                                isExpanded: false
                            };
                        }
                        if (g.reference_name) {
                            groupedGst[gstin].placesOfBusiness.push({
                                id: (g.id || '').toString(),
                                referenceName: g.reference_name || '',
                                addressLine1: g.branch_address_line1 || '',
                                addressLine2: g.branch_address_line2 || '',
                                addressLine3: g.branch_address_line3 || '',
                                address: g.branch_address || '',
                                contactPerson: g.branch_contact_person || '',
                                email: g.branch_email || '',
                                contactNumber: g.branch_contact_no || '',
                                pincode: g.branch_pincode || '',
                                city: g.branch_city || '',
                                state: g.branch_state || '',
                                country: g.branch_country || '',
                                isExpanded: false
                            });
                        }
                    });
                    const finalGstRecords = Object.values(groupedGst);
                    if (finalGstRecords.length > 0) {
                        setGstRecords(finalGstRecords);
                    }
                }
                // Also fetch and set availableBranches state for dual-sync
                fetchVendorBranches(vendor.id);
            } catch (e) {
                console.error('Error fetching existing GST details:', e);
            }

            // 2. TDS Details
            try {
                const tdsRes: any = await httpClient.get(`/api/vendors/tds-details/by-vendor/${vendor.id}/`);
                const tdsArray = tdsRes.data || (Array.isArray(tdsRes) ? tdsRes : []);
                if (tdsArray.length > 0) {
                    const tds = tdsArray[0];
                    setMsmeUdyamNo(tds.msme_udyam_no || '');
                    setFssaiLicenseNo(tds.fssai_license_no || '');
                    setImportExportCode(tds.import_export_code || '');
                    setEouStatus(tds.eou_status || '');
                    setTdsSectionApplicable(tds.tds_section_applicable || '');
                    setTcsSectionApplicable(tds.tcs_section_applicable || '');
                    if (tds.tds_section_applicable) setTaxApplicableType('TDS');
                    else if (tds.tcs_section_applicable) setTaxApplicableType('TCS');
                    else setTaxApplicableType('');
                    setEnableAutomaticTdsPosting(tds.enable_automatic_tds_posting || false);
                }
            } catch (e) {
                console.error('Error fetching existing TDS details:', e);
            }

            // 3. Banking Details
            try {
                const bankingRes: any = await httpClient.get(`/api/vendors/banking-details/by-vendor/${vendor.id}/`);
                const bankingList = bankingRes.data || (Array.isArray(bankingRes) ? bankingRes : []);
                if (bankingList.length > 0) {
                    const mappedBanks = bankingList.map((b: any, idx: number) => ({
                        id: b.id,
                        accountNumber: b.bank_account_no || '',
                        bankName: b.bank_name || '',
                        ifscCode: b.ifsc_code || '',
                        branchName: b.branch_name || '',
                        swiftCode: b.swift_code || '',
                        vendorBranch: b.vendor_branch ? b.vendor_branch.split(',') : [],
                        accountType: b.account_type ? (b.account_type.charAt(0).toUpperCase() + b.account_type.slice(1).replace('_', ' ')) : 'Savings'
                    }));
                    setBankAccounts(mappedBanks);
                }
            } catch (e) {
                console.error('Error fetching existing banking details:', e);
            }

            // 4. Terms & Conditions
            try {
                const termsRes: any = await httpClient.get(`/api/vendors/terms/by_vendor/${vendor.id}/`);
                const termsArray = termsRes.data || (Array.isArray(termsRes) ? termsRes : []);
                if (termsArray.length > 0) {
                    const t = termsArray[0];
                    setCreditLimit(t.credit_limit || '');
                    setCreditPeriod(t.credit_period || '');
                    setCreditTerms(t.credit_terms || '');
                    setPenaltyTerms(t.penalty_terms || '');
                }
            } catch (e) {
                console.error('Error fetching existing terms:', e);
            }

            // 5. Products/Services Details
            try {
                const prodRes: any = await httpClient.get(`/api/vendors/product-services/?vendor_basic_detail=${vendor.id}`);
                const prodData = prodRes.items || [];
                if (prodData.length > 0) {
                    const mappedItems = prodData.map((item: any, idx: number) => ({
                        id: idx + 1,
                        hsnSacCode: item.hsn_sac_code || '',
                        itemCode: item.item_code || '',
                        itemName: item.item_name || '',
                        supplierItemCode: item.supplier_item_code || '',
                        supplierItemName: item.supplier_item_name || ''
                    }));
                    setItems(mappedItems);
                }
            } catch (e) {
                console.error('Error fetching existing products/services:', e);
            }

            setActiveMasterSubTab('Vendor Creation');
        } catch (error) {
            handleApiError(error, 'Edit Vendor');
        }
    };

    const handleDeleteVendor = async (vendorId: number) => {
        if (!await confirm('Are you sure you want to delete this vendor?')) return;
        try {
            await httpClient.delete(`/api/vendors/basic-details/${vendorId}/`);
            showSuccess('Vendor deleted successfully!');
            fetchVendors();
        } catch (error) {
            handleApiError(error, 'Delete Vendor');
        }
    };



    // Vendor Branch State
    const [availableBranches, setAvailableBranches] = useState<any[]>([]);

    const fetchVendorBranches = async (vendorId: number) => {
        try {
            const response = await httpClient.get<any>(`/api/vendors/gst-details/?vendor_basic_detail=${vendorId}`);
            // Robustly handle different response formats
            const data = Array.isArray(response) ? response : (response.data || response.results || []);
            setAvailableBranches(data);
        } catch (error) {
            handleApiError(error, 'Fetch Vendor Branches');
            setAvailableBranches([]);
        }
    };

    // Vendor Items State (for PO)
    const [availableVendorItems, setAvailableVendorItems] = useState<any[]>([]);

    const fetchAvailableVendorItems = async (vendorId: number) => {
        try {
            const response = await httpClient.get<any>(`/api/vendors/product-services/?vendor_basic_detail=${vendorId}`);
            // Assuming the response structure is similar to others
            const data = Array.isArray(response) ? response : (response.results || []);
            setAvailableVendorItems(data);
        } catch (error) {
            handleApiError(error, 'Fetch Vendor Items');
            setAvailableVendorItems([]);
        }
    };

    // GST Handler Functions
    const handleAddGstRecord = () => {
        setGstRecords([...gstRecords, {
            id: Date.now().toString(),
            gstin: '',
            registrationType: 'Regular',
            placesOfBusiness: [],
            isExpanded: true
        }]);
    };

    const handleRemoveGstRecord = (id: string) => {
        if (gstRecords.length > 1) {
            setGstRecords(gstRecords.filter(record => record.id !== id));
        }
    };

    const handleGstChange = (id: string, field: keyof GSTRecord, value: any) => {
        setGstRecords(gstRecords.map(record => {
            if (record.id === id) {
                if (field === 'registrationType' && value === 'Unregistered') {
                    return { ...record, [field]: value, gstin: '', placesOfBusiness: [] };
                }

                // Enforce GSTIN max length and uppercase
                if (field === 'gstin') {
                    const formattedValue = typeof value === 'string' ? value.slice(0, 15).toUpperCase() : value;
                    return { ...record, [field]: formattedValue };
                }

                return { ...record, [field]: value };
            }
            return record;
        }));
    };

    const handleFetchGstDetails = async (id: string) => {
        setLoadingGstFetch(true);
        // Simulate API call
        setTimeout(() => {
            setGstRecords(gstRecords.map(r => {
                if (r.id === id) {
                    return {
                        ...r,
                        tradeName: 'Mock Trade Name Ltd',
                        legalName: 'Mock Legal Name Ltd',
                        placesOfBusiness: [
                            {
                                id: Date.now().toString() + '_1',
                                referenceName: 'Main Branch', // Default populated
                                addressLine1: '123, Business Park',
                                addressLine2: 'Tech City',
                                addressLine3: 'India',
                                address: '123, Business Park, Tech City, India',
                                contactPerson: 'John Doe',
                                email: 'john@example.com',
                                contactNumber: '9876543210',
                                pincode: '600001',
                                city: 'Tech City',
                                state: 'Tamil Nadu',
                                country: 'India',
                                isExpanded: true
                            },
                            {
                                id: Date.now().toString() + '_2',
                                referenceName: 'Warehouse 1',
                                addressLine1: '456, Industrial Area',
                                addressLine2: 'Tech City',
                                addressLine3: 'India',
                                address: '456, Industrial Area, Tech City, India',
                                contactPerson: 'Jane Smith',
                                email: 'jane@example.com',
                                contactNumber: '9876541111',
                                pincode: '600002',
                                city: 'Tech City',
                                state: 'Tamil Nadu',
                                country: 'India',
                                isExpanded: false
                            }
                        ]
                    };
                }
                return r;
            }));
            setLoadingGstFetch(false);
        }, 1000);
    };

    const toggleGstExpand = (id: string) => {
        setGstRecords(gstRecords.map(r => r.id === id ? { ...r, isExpanded: !r.isExpanded } : r));
    };

    const togglePobExpand = (recordId: string, pobId: string) => {
        setGstRecords(gstRecords.map(r => {
            if (r.id === recordId) {
                return {
                    ...r,
                    placesOfBusiness: r.placesOfBusiness.map(p =>
                        p.id === pobId ? { ...p, isExpanded: !p.isExpanded } : p
                    )
                };
            }
            return r;
        }));
    };

    const updatePobField = (recordId: string, pobId: string, field: keyof PlaceOfBusiness, value: string) => {
        setGstRecords(prev => prev.map(r => {
            if (r.id === recordId) {
                return {
                    ...r,
                    placesOfBusiness: r.placesOfBusiness.map(p =>
                        p.id === pobId ? { ...p, [field]: value } : p
                    )
                };
            }
            return r;
        }));
    };

    const handleAddPob = (recordId: string) => {
        setGstRecords(gstRecords.map(r => {
            if (r.id === recordId) {
                return {
                    ...r,
                    placesOfBusiness: [
                        ...r.placesOfBusiness,
                        {
                            id: Date.now().toString(),
                            referenceName: '',
                            addressLine1: '',
                            addressLine2: '',
                            addressLine3: '',
                            address: '',
                            contactPerson: '',
                            email: '',
                            contactNumber: '',
                            pincode: '',
                            city: '',
                            state: '',
                            country: '',
                            isExpanded: true
                        }
                    ]
                };
            }
            return r;
        }));
    };

    const handleRemovePob = (recordId: string, pobId: string) => {
        setGstRecords(gstRecords.map(r => {
            if (r.id === recordId) {
                return {
                    ...r,
                    placesOfBusiness: r.placesOfBusiness.filter(p => p.id !== pobId)
                };
            }
            return r;
        }));
    };

    const handleSubmitGST = (e: React.FormEvent) => {
        e.preventDefault();

        setActiveMasterSubTab('Products/Services');
    };

    // View PO Modal State
    const [showViewPOModal, setShowViewPOModal] = useState(false);
    const [selectedPO, setSelectedPO] = useState<any>(null);
    const [isEditingPO, setIsEditingPO] = useState(false);

    // Cancel PO Modal State
    const [showCancelPOModal, setShowCancelPOModal] = useState(false);
    const [cancelReason, setCancelReason] = useState('');

    // Local showToast removed in favor of global toast utility




    // Purchase Order Data State
    interface PurchaseOrder {
        id: number;
        poNumber: string;
        poDate: string;
        vendorName: string;
        address: string;
        status: 'Draft' | 'Pending Approval' | 'Approved' | 'Mailed' | 'Closed';
        receiveBy?: string;
        receiveAt?: string;
        deliveryTerms?: string;
        category?: string;
        branch?: string;
        deliveryDate?: string;
        amount?: string;
    }

    const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([
        { id: 1, poNumber: 'PO-2023-001', poDate: '2023-10-26', vendorName: 'Tech Solutions Inc.', address: '123 Innovation Dr, Tech City', status: 'Pending Approval', category: 'Raw Material', branch: 'Main Branch', deliveryDate: '2023-11-10', amount: '12500.00' },
        { id: 2, poNumber: 'PO-2023-002', poDate: '2023-10-27', vendorName: 'Global Supplies Ltd.', address: '456 Logistics Way, Port Town', status: 'Pending Approval', category: 'Stock-in Trade', branch: 'West Wing', deliveryDate: '2023-11-15', amount: '8750.50' },
        { id: 3, poNumber: 'PO-2023-003', poDate: '2023-10-28', vendorName: 'Quality Materials Co.', address: '789 Industrial Park, Mfg Zone', status: 'Approved', category: 'Consumables', branch: 'East Warehouse', deliveryDate: '2023-11-20', amount: '3400.00' },
        { id: 4, poNumber: 'PO-2023-004', poDate: '2023-10-29', vendorName: 'Office Depot', address: '101 Corporate Blvd, Biz Dist', status: 'Mailed', category: 'Stores & Spares', branch: 'HQ', deliveryDate: '2023-11-05', amount: '1200.00' },
        { id: 5, poNumber: 'PO-2023-005', poDate: '2023-10-30', vendorName: 'Fast Track Logistics', address: '222 Speedy Ln, Transit Hub', status: 'Approved', category: 'Services', branch: 'Main Branch', deliveryDate: '2023-11-25', amount: '5600.00' },
        { id: 6, poNumber: 'PO-2023-006', poDate: '2023-10-15', vendorName: 'Old World Imports', address: '88 Antiques Rd, Old Town', status: 'Closed', category: 'Raw Material', branch: 'West Wing', deliveryDate: '2023-10-30', amount: '9800.00' },
    ]);

    const handleApproveAndMail = async (poId: number) => {
        try {
            const po = purchaseOrders.find(p => p.id === poId);
            if (!po) return;

            const nextStatus = po.status === 'Approved' ? 'Mailed' : 'Approved';

            // Sync with backend
            await httpClient.post(`/api/vendors/purchase-orders/${poId}/update_status/`, {
                status: nextStatus
            });

            // Update local state
            setPurchaseOrders(prevOrders => prevOrders.map(p => {
                if (p.id === poId) {
                    return { ...p, status: nextStatus };
                }
                return p;
            }));

            // Switch to the Mail PO tab
            setActiveCreatePOSubTab('Mail PO');
            showSuccess(`PO status updated successfully to ${nextStatus}.`);
        } catch (error) {
            handleApiError(error, 'Update PO Status');
        }
    };

    // PO Item Handlers
    const handleAddPOItem = () => {
        const newItem: POItem = {
            id: poItems.length + 1,
            itemCode: '',
            itemName: '',
            supplierItemCode: '',
            quantity: '',
            negotiatedRate: '',
            finalRate: '',
            taxableValue: '',
            igst: '',
            cgst: '',
            sgst: '',
            cess: '',
            netValue: '',
            uom: '',
            gstRate: '',
            cessRate: ''
        };
        setPOItems([...poItems, newItem]);
    };

    const handleRemovePOItem = (id: number) => {
        if (poItems.length > 1) {
            setPOItems(poItems.filter(item => item.id !== id));
        }
    };

    const handlePOItemChange = (id: number, field: keyof POItem, value: string) => {
        const supplyType = createPOForm.supplyType || 'intrastate';
        setPOItems(prevItems => prevItems.map(item => {
            if (item.id === id) {
                const updatedItem = { ...item, [field]: value };

                const quantity = parseFloat(field === 'quantity' ? value : item.quantity) || 0;
                const finalRate = parseFloat(field === 'finalRate' ? value : item.finalRate) || 0;
                const gstRateVal = parseFloat(item.gstRate) || 0;
                const cessRateVal = parseFloat(item.cessRate) || 0;

                // Taxable Value = Quantity × Final Rate
                const taxableVal = quantity * finalRate;
                updatedItem.taxableValue = taxableVal.toFixed(2);

                // GST Amounts from Item Master Rate
                let igstAmt = 0, cgstAmt = 0, sgstAmt = 0;
                if (supplyType === 'interstate') {
                    igstAmt = (taxableVal * gstRateVal) / 100;
                } else {
                    cgstAmt = (taxableVal * gstRateVal) / 2 / 100;
                    sgstAmt = (taxableVal * gstRateVal) / 2 / 100;
                }
                const cessAmt = (taxableVal * cessRateVal) / 100;

                updatedItem.igst = igstAmt.toFixed(2);
                updatedItem.cgst = cgstAmt.toFixed(2);
                updatedItem.sgst = sgstAmt.toFixed(2);
                updatedItem.cess = cessAmt.toFixed(2);
                updatedItem.netValue = (taxableVal + igstAmt + cgstAmt + sgstAmt + cessAmt).toFixed(2);

                return updatedItem;
            }
            return item;
        }));
    };

    const handleCreatePOFormChange = (field: string, value: string) => {
        setCreatePOForm(prev => {
            const updated = { ...prev, [field]: value };

            if (field === 'vendorName') {
                const selectedVendor = vendorList.find(v => v.vendor_name === value);
                if (selectedVendor) {
                    fetchVendorBranches(selectedVendor.id);
                    fetchAvailableVendorItems(selectedVendor.id);
                } else {
                    setAvailableBranches([]);
                    setAvailableVendorItems([]);
                }
            }

            if (field === 'branch') {
                const selectedBranch = availableBranches.find(b => (b.reference_name || b.id.toString()) === value);
                if (selectedBranch) {
                    updated.addressLine1 = selectedBranch.branch_address || '';
                    updated.emailAddress = selectedBranch.branch_email || '';
                    updated.state = selectedBranch.gst_state || '';
                    updated.pincode = selectedBranch.branch_pincode || selectedBranch.pincode || '';
                    updated.city = selectedBranch.branch_city || selectedBranch.city || '';
                    updated.state = selectedBranch.branch_state || selectedBranch.state || selectedBranch.gst_state || '';
                    updated.country = selectedBranch.branch_country || selectedBranch.country || '';
                    updated.contractNo = selectedBranch.branch_contact_no || selectedBranch.contactNumber || '';
                    // Reset other address fields or try to parse if possible, for now just basic fill
                }
            }

            return updated;
        });
    };

    const handleSubmitPO = async () => {
        try {




            // Prepare items data
            const items = poItems.map(item => ({
                item_code: item.itemCode,
                item_name: item.itemName,
                supplier_item_code: item.supplierItemCode,
                quantity: parseFloat(item.quantity) || 0,
                uom: item.uom || 'PCS',
                negotiated_rate: parseFloat(item.negotiatedRate) || 0,
                final_rate: parseFloat(item.finalRate) || 0,
                taxable_value: parseFloat(item.taxableValue) || 0,
                gst_rate: parseFloat(item.gstRate) || 0,
                igst_amount: parseFloat(item.igst) || 0,
                cgst_amount: parseFloat(item.cgst) || 0,
                sgst_amount: parseFloat(item.sgst) || 0,
                cess_amount: parseFloat(item.cess) || 0,
                gst_amount: (parseFloat(item.igst) || 0) + (parseFloat(item.cgst) || 0) + (parseFloat(item.sgst) || 0) + (parseFloat(item.cess) || 0),
                invoice_value: parseFloat(item.netValue) || 0
            }));

            const selectedVendorObj = vendorList.find(v => v.vendor_name === createPOForm.vendorName);
            const vendorId = selectedVendorObj ? selectedVendorObj.id : null;
            const vendorName = selectedVendorObj ? selectedVendorObj.vendor_name : createPOForm.vendorName;

            // Prepare PO payload
            const payload = {
                po_series_id: createPOForm.poSeriesName ? parseInt(createPOForm.poSeriesName) : null,
                po_date: createPOForm.poDate,
                vendor_id: vendorId,
                vendor_name: vendorName,
                status: 'Pending Approval',
                branch: createPOForm.branch,
                address_line1: createPOForm.addressLine1,
                address_line2: createPOForm.addressLine2,
                address_line3: createPOForm.addressLine3,
                city: createPOForm.city,
                state: createPOForm.state,
                country: createPOForm.country,
                pincode: createPOForm.pincode,
                email_address: createPOForm.emailAddress,
                contract_no: createPOForm.contractNo,
                receive_by: createPOForm.receiveBy || null,
                receive_at: createPOForm.receiveAt,
                delivery_terms: createPOForm.deliveryTerms,
                items: items
            };



            // Send to API
            const response = await httpClient.post('/api/vendors/purchase-orders/', payload);



            const poNumber = (response as any)?.data?.data?.po_number || (response as any)?.data?.po_number || 'Generated';
            showSuccess(`Purchase Order created successfully! PO Number: ${poNumber}`);

            // Add the new PO to the state list
            const totalAmount = poItems.reduce((acc, item) => acc + (parseFloat(item.netValue) || 0), 0);
            const vendorNameDisplay = vendorList.find(v => v.id.toString() === createPOForm.vendorName)?.vendor_name || createPOForm.vendorName || '';

            const newPO: PurchaseOrder = {
                id: (response as any)?.data?.data?.id || (response as any)?.data?.id || Date.now(),
                poNumber: poNumber,
                poDate: new Date().toISOString().split('T')[0],
                vendorName: vendorNameDisplay,
                address: createPOForm.addressLine1 || '',
                status: 'Pending Approval',
                receiveBy: createPOForm.receiveBy || undefined,
                receiveAt: createPOForm.receiveAt || undefined,
                deliveryTerms: createPOForm.deliveryTerms || undefined,
                branch: createPOForm.branch || undefined,
                deliveryDate: createPOForm.receiveBy || undefined,
                amount: totalAmount.toFixed(2)
            };

            setPurchaseOrders(prevOrig => [newPO, ...prevOrig]);
            setActiveCreatePOSubTab('Pending for Approval');

            // Reset form
            setCreatePOForm({
                poSeriesName: '',
                poNumber: 'New PO',
                vendorName: '',
                branch: '',
                addressLine1: '',
                addressLine2: '',
                addressLine3: '',
                city: '',
                state: '',
                country: '',
                pincode: '',
                emailAddress: '',
                contractNo: '',
                receiveBy: '',
                receiveAt: '',
                deliveryTerms: '',
                supplyType: 'intrastate',
                poDate: new Date().toISOString().split('T')[0]
            });

            setPOItems([{
                id: 1,
                itemCode: '',
                itemName: '',
                supplierItemCode: '',
                quantity: '',
                negotiatedRate: '',
                finalRate: '',
                taxableValue: '',
                igst: '',
                cgst: '',
                sgst: '',
                cess: '',
                netValue: '',
                uom: '',
                gstRate: '',
                cessRate: ''
            }]);

            setShowCreatePOModal(false);

        } catch (error: any) {
            handleApiError(error, 'Create Purchase Order');
        }
    };

    const handleViewPO = (po: any) => {
        setSelectedPO(po);
        setShowViewPOModal(true);
        setIsEditingPO(false);
    };

    const handleEditPODetails = () => {
        setIsEditingPO(true);
    };

    const handleSavePODetails = () => {
        // Handle save logic here


        // Update the purchaseOrders list with the modified PO
        setPurchaseOrders(purchaseOrders.map(po => po.id === selectedPO.id ? selectedPO : po));

        setIsEditingPO(false);
        // In real implementation, you would call an API to save the changes
    };

    const handleCancelEditPO = () => {
        // Revert to original data from purchaseOrders list
        const originalPO = purchaseOrders.find(po => po.id === selectedPO.id);
        if (originalPO) {
            setSelectedPO(originalPO);
        }
        setIsEditingPO(false);
    };

    const handleApprovePO = () => {
        const updatedPO = { ...selectedPO, status: 'Approved' };
        setPurchaseOrders(purchaseOrders.map(po => po.id === selectedPO.id ? updatedPO : po));
        setSelectedPO(updatedPO);
    };

    const handleMailPO = () => {
        const updatedPO = { ...selectedPO, status: 'Mailed' };
        setPurchaseOrders(purchaseOrders.map(po => po.id === selectedPO.id ? updatedPO : po));
        setSelectedPO(updatedPO);
        setShowViewPOModal(false);
    };

    const handleCancelPOClick = () => {
        // Open the cancel reason modal
        setShowCancelPOModal(true);
    };

    const handleConfirmCancelPO = () => {
        // Validate that reason is provided
        if (!cancelReason.trim()) {
            showError('Please provide a reason for cancellation');
            return;
        }


        // Remove the PO from the list (or update status to 'Cancelled')
        setPurchaseOrders(purchaseOrders.filter(po => po.id !== selectedPO.id));



        // Close both modals and reset state
        setShowCancelPOModal(false);
        setShowViewPOModal(false);
        setCancelReason('');
        setSelectedPO(null);
    };

    const handleCloseCancelModal = () => {
        setShowCancelPOModal(false);
        setCancelReason('');
    };

    // Navigate to next tab in Vendor Creation workflow
    const handleNextVendorTab = () => {
        const tabSequence: MasterSubTab[] = [
            'Basic Details',
            'Branch details',
            'Products/Services',
            'TDS & Other Statutory',
            'Banking Info',
            'Terms & Conditions'
        ];

        const currentIndex = tabSequence.indexOf(activeMasterSubTab);
        if (currentIndex >= 0 && currentIndex < tabSequence.length - 1) {
            setActiveMasterSubTab(tabSequence[currentIndex + 1]);
        } else {
            // Last tab - go back to Vendor Creation dashboard
            setActiveMasterSubTab('Vendor Creation');
        }
    };


    // Banking Information State
    interface BankAccount {
        id: number;
        accountNumber: string;
        ifscCode: string;
        bankName: string;
        branchName: string;
        swiftCode: string;
        vendorBranch: string[];
        accountType: 'Savings' | 'Current';
    }

    // Procurement Aging Data Interface




    // Date formatting helper function
    const formatDate = (dateString: string): string => {
        const [year, month, day] = dateString.split('-');
        return `${day}-${month}-${year}`;
    };



    const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([
        { id: 1, accountNumber: '', bankName: '', ifscCode: '', branchName: '', swiftCode: '', vendorBranch: [], accountType: 'Savings' }
    ]);

    // Payment Bills Interface and Data
    interface LogEntry {
        action: string;
        user: string;
        date: string;
    }

    interface PaymentBill {
        id: number;
        date: string;
        vendorReferenceName: string;
        branch?: string;
        voucherNo: string;
        supplierInvoiceNo: string;
        amount: string;
        status: 'Pending' | 'Approved' | 'Posted' | 'Initiated';
        actionLog?: LogEntry[];
        category: string;
    }

    const [paymentBills, setPaymentBills] = useState<PaymentBill[]>([
        { id: 1, date: '2023-11-15', vendorReferenceName: 'Alpha Raw Materials', branch: 'Chennai (HO)', voucherNo: 'V-001', supplierInvoiceNo: 'INV-2023-001', amount: '? 45,000', status: 'Pending', category: 'Raw Material', actionLog: [] },
        { id: 2, date: '2023-11-10', vendorReferenceName: 'Beta Supplies', branch: 'Mumbai Branch', voucherNo: 'V-002', supplierInvoiceNo: 'INV-2023-002', amount: '? 12,500', status: 'Pending', category: 'Raw Material', actionLog: [] },
        {
            id: 3, date: '2023-11-05', vendorReferenceName: 'Gamma Corp', branch: 'Delhi Branch', voucherNo: 'V-003', supplierInvoiceNo: 'INV-2023-003', amount: '? 78,000', status: 'Approved', category: 'Services',
            actionLog: [{ action: 'Approved', user: 'John Doe', date: '2023-11-06 10:30 AM' }]
        },
        {
            id: 4, date: '2023-10-28', vendorReferenceName: 'Delta Industries', branch: 'Chennai (HO)', voucherNo: 'V-004', supplierInvoiceNo: 'INV-2023-004', amount: '? 1,20,000', status: 'Posted', category: 'Stock-in Trade',
            actionLog: [{ action: 'Approved', user: 'Jane Smith', date: '2023-10-29 02:15 PM' }]
        },
        {
            id: 5, date: '2023-10-20', vendorReferenceName: 'Epsilon Trading', branch: 'Bangalore Branch', voucherNo: 'V-005', supplierInvoiceNo: 'INV-2023-005', amount: '? 56,700', status: 'Initiated', category: 'Consumables',
            actionLog: [{ action: 'Approved', user: 'Mike Johnson', date: '2023-10-21 09:45 AM' }]
        },
    ]);

    const [paymentSortOrder, setPaymentSortOrder] = useState<'recent' | 'earliest'>('recent');
    const [showPostPaymentModal, setShowPostPaymentModal] = useState(false);
    const [selectedBillForPayment, setSelectedBillForPayment] = useState<PaymentBill | null>(null);
    const [selectedVoucherForView, setSelectedVoucherForView] = useState<PaymentBill | null>(null);
    const [ifscCache, setIfscCache] = useState<Record<string, { bank: string, branch: string }>>({});

    // Payment Bills Filters State
    const [paymentBillFilters, setPaymentBillFilters] = useState({
        date: '',
        vendorReferenceName: '',
        branch: '',
        voucherNo: '',
        supplierInvoiceNo: '',
        amount: '',
        status: ''
    });

    const handleViewVoucher = (bill: PaymentBill) => {
        setSelectedVoucherForView(bill);
    };

    const [postPaymentForm, setPostPaymentForm] = useState({
        dateOfPayment: '',
        bankAccount: '',
        bankReferenceNo: ''
    });

    const handleAddBank = () => {
        const newBank: BankAccount = {
            id: bankAccounts.length + 1,
            accountNumber: '',
            bankName: '',
            ifscCode: '',
            branchName: '',
            swiftCode: '',
            vendorBranch: [],
            accountType: 'Savings'
        };
        setBankAccounts([...bankAccounts, newBank]);
    };

    // Remove bank account
    const handleRemoveBank = (id: number) => {
        if (bankAccounts.length > 1) {
            setBankAccounts(bankAccounts.filter(bank => bank.id !== id));
        }
    };

    const handleBankChange = async (id: number, field: keyof BankAccount, value: string | string[]) => {
        // Update the field first in local state
        const updatedAccounts = bankAccounts.map(bank =>
            bank.id === id ? { ...bank, [field]: value } : bank
        );
        setBankAccounts(updatedAccounts);

        const currentBank = updatedAccounts.find(b => b.id === id);
        if (!currentBank) return;

        const checkMismatch = (ifsc: string, bName: string, brName: string, cachedData: { bank: string, branch: string }) => {
            if (ifsc.length !== 11) return;
            const bMismatch = bName && cachedData.bank.toLowerCase() !== bName.toLowerCase();
            const brMismatch = brName && cachedData.branch.toLowerCase() !== brName.toLowerCase();
            if (bMismatch || brMismatch) {
                showError('Bank Name, Branch Name, & IFSC Code mismatch');
            }
        };

        // If field being updated is bankName or branchName, check against existing cache if any
        if (field === 'bankName' || field === 'branchName' || field === 'ifscCode') {
            const ifsc = currentBank.ifscCode;
            if (ifsc.length === 11) {
                if (ifscCache[ifsc]) {
                    // Check against cache
                    checkMismatch(ifsc, currentBank.bankName, currentBank.branchName, ifscCache[ifsc]);

                    // If it was the IFSC that was just filled, we also update the names
                    if (field === 'ifscCode') {
                        handleBankChange(id, 'bankName', ifscCache[ifsc].bank);
                        handleBankChange(id, 'branchName', ifscCache[ifsc].branch);
                    }
                } else if (field === 'ifscCode') {
                    // Fetch for first time
                    try {
                        const res = await fetch(`https://ifsc.razorpay.com/${ifsc}`);
                        if (res.ok) {
                            const data = await res.json();
                            const fetched = { bank: data.BANK, branch: data.BRANCH };
                            setIfscCache(prev => ({ ...prev, [ifsc]: fetched }));

                            checkMismatch(ifsc, currentBank.bankName, currentBank.branchName, fetched);

                            // Automatically fill/suggest
                            setBankAccounts(prev => prev.map(b => b.id === id ? {
                                ...b,
                                bankName: fetched.bank,
                                branchName: fetched.branch
                            } : b));
                        } else {
                            showError('Invalid IFSC Code or lookup failed');
                        }
                    } catch (error) {
                        console.error('IFSC Lookup Error:', error);
                    }
                }
            }
        }
    };


    // Vendor Basic Details State
    const [vendorCode, setVendorCode] = useState('');
    const [vendorName, setVendorName] = useState('');
    const [panNo, setPanNo] = useState('');
    const [contactPerson, setContactPerson] = useState('');
    const [vendorEmail, setVendorEmail] = useState('');
    const [contactNo, setContactNo] = useState('');
    const [vendorCategory, setVendorCategory] = useState('');
    const [billingCurrency, setBillingCurrency] = useState('');
    const [isAlsoCustomer, setIsAlsoCustomer] = useState(false);
    const [tcsApplicable, setTcsApplicable] = useState(false);
    const [createCustomerPrompt, setCreateCustomerPrompt] = useState<boolean | null>(null);

    // Customer search states
    const [matchingCustomer, setMatchingCustomer] = useState<any | null>(null);
    const [isLoadingCustomer, setIsLoadingCustomer] = useState(false);
    const [linkVendorToCustomer, setLinkVendorToCustomer] = useState<boolean | null>(null);
    const [createCustomerOption, setCreateCustomerOption] = useState<boolean | null>(null);
    const [customerSearchAttempted, setCustomerSearchAttempted] = useState(false);
    const [ledgerId, setLedgerId] = useState<number | null>(null);
    const [allLedgers, setAllLedgers] = useState<any[]>([]);


    // Handle Basic Details Form Submit (Navigation Only)
    const handleBasicDetailsSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (!vendorName || !vendorEmail || !contactNo || !vendorCategory) {
            showError('Please fill in all required fields (Vendor Name, Email, Contact No, Vendor Category)');
            return;
        }

        // Validation for Also Customer logic
        if (isAlsoCustomer) {
            if (matchingCustomer && linkVendorToCustomer === null) {
                showError('Please decide whether to link the vendor to the existing customer.');
                return;
            }
            if (!matchingCustomer && createCustomerOption === null) {
                showError('Please decide whether to create a new customer.');
                return;
            }
            if (matchingCustomer && linkVendorToCustomer === false && createCustomerOption === null) {
                showError('Please decide whether to create a new customer.');
                return;
            }
        }

        setActiveMasterSubTab('Branch details');
    };

    // Customer search function
    const searchCustomer = async (name: string, pan: string) => {
        if (!name || !pan) return;

        setIsLoadingCustomer(true);
        setCustomerSearchAttempted(true);
        try {
            // Using search or filter query params
            const res: any = await httpClient.get(`/api/customerportal/customer-master/?pan_number=${pan}&customer_name=${name}`);
            const data = Array.isArray(res) ? res : (res.results || []);

            // Filter manually for exact match to be safe
            const match = data.find((c: any) =>
                (c.pan_number === pan || c.pan === pan) &&
                c.customer_name.toLowerCase() === name.toLowerCase()
            );

            if (match) {
                setMatchingCustomer(match);
                setLinkVendorToCustomer(null);
            } else {
                setMatchingCustomer(null);
                setCreateCustomerOption(null);
            }
        } catch (error) {
            console.error('Error searching customer:', error);
            // Non-fatal error
            setMatchingCustomer(null);
        } finally {
            setIsLoadingCustomer(false);
        }
    };

    // Trigger search when relevant fields change
    useEffect(() => {
        if (isAlsoCustomer && vendorName && panNo) {
            const delayDebounceFn = setTimeout(() => {
                searchCustomer(vendorName, panNo);
            }, 500); // Small debounce
            return () => clearTimeout(delayDebounceFn);
        } else if (!isAlsoCustomer) {
            setMatchingCustomer(null);
            setCustomerSearchAttempted(false);
            setLinkVendorToCustomer(null);
            setCreateCustomerOption(null);
        }
    }, [isAlsoCustomer, vendorName, panNo]);


    // Vendor GST Details State
    const [gstin, setGstin] = useState('');
    const [gstRegistrationType, setGstRegistrationType] = useState('regular');
    const [legalName, setLegalName] = useState('');
    const [tradeName, setTradeName] = useState('');
    const [createdVendorId, setCreatedVendorId] = useState<number | null>(() => {
        const saved = sessionStorage.getItem('currentVendorId') || localStorage.getItem('currentVendorId');
        return saved ? parseInt(saved) : null;
    });

    // Persist vendor ID
    useEffect(() => {
        if (createdVendorId) {
            sessionStorage.setItem('currentVendorId', createdVendorId.toString());
            localStorage.removeItem('currentVendorId');
        }
    }, [createdVendorId]);

    // TDS & Other Statutory Details State
    const [msmeUdyamNo, setMsmeUdyamNo] = useState('');
    const [fssaiLicenseNo, setFssaiLicenseNo] = useState('');
    const [importExportCode, setImportExportCode] = useState('');
    const [eouStatus, setEouStatus] = useState('');
    const [tdsSectionApplicable, setTdsSectionApplicable] = useState('');
    const [tcsSectionApplicable, setTcsSectionApplicable] = useState('');
    // 'TDS' | 'TCS' | '' — mutually exclusive selection
    const [taxApplicableType, setTaxApplicableType] = useState<'TDS' | 'TCS' | ''>('');
    const [enableAutomaticTdsPosting, setEnableAutomaticTdsPosting] = useState(false);

    // File Upload State for Statutory Documents
    const [uploadedFiles, setUploadedFiles] = useState<{
        msmeFile: File | null;
        fssaiFile: File | null;
        iecFile: File | null;
        eouFile: File | null;
    }>({
        msmeFile: null,
        fssaiFile: null,
        iecFile: null,
        eouFile: null
    });

    // Handle File Upload
    const handleFileUpload = (fileType: 'msmeFile' | 'fssaiFile' | 'iecFile' | 'eouFile', file: File | null) => {
        if (file) {
            setUploadedFiles(prev => ({ ...prev, [fileType]: file }));
            showSuccess(`${file.name} uploaded successfully!`);
        }

    };

    // Handle TDS Details Form Submit (Navigation Only)
    const handleTDSDetailsSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        // 1. MSME Validation (UDYAM-TN-0123456)
        if (msmeUdyamNo) {
            const msmeRegex = /^(UDYAM|UDHYAM)-[A-Z]{2}-\d{2}-\d{7}$/;
            if (!msmeRegex.test(msmeUdyamNo)) {
                showError('Invalid MSME Udyam No format. Expected: UDYAM-TN-01-2345678 (or UDHYAM)');
                return;
            }
        }

        // 2. FSSAI Validation (14 digit numeric code)
        if (fssaiLicenseNo) {
            if (fssaiLicenseNo.length !== 14 || !/^\d+$/.test(fssaiLicenseNo)) {
                showError('Invalid FSSAI License No. Must be exactly 14 digits.');
                return;
            }
        }

        // 3. Import Export Code (IEC) Validation (5 Letters, 4 Numbers, 1 Letter)
        if (importExportCode) {
            const iecRegex = /^[A-Z]{5}\d{4}[A-Z]{1}$/;
            if (!iecRegex.test(importExportCode)) {
                showError('Invalid IEC format. Expected: ABCDE1234F (5 Letters, 4 Numbers, 1 Letter)');
                return;
            }
        }

        setActiveMasterSubTab('Banking Info');
    };


    // Handle Banking Details Submit
    // Handle Banking Details Submit (Navigation Only)
    const handleBankingDetailsSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        setActiveMasterSubTab('Terms & Conditions');
    };

    // Terms & Conditions State
    const [creditLimit, setCreditLimit] = useState('');
    const [creditPeriod, setCreditPeriod] = useState('');
    const [creditTerms, setCreditTerms] = useState('');
    const [penaltyTerms, setPenaltyTerms] = useState('');
    const [deliveryTerms, setDeliveryTerms] = useState('');
    const [warrantyGuaranteeDetails, setWarrantyGuaranteeDetails] = useState('');
    const [forceMajeure, setForceMajeure] = useState('');
    const [disputeRedressalTerms, setDisputeRedressalTerms] = useState('');

    const resetVendorCreationFlow = () => {
        setVendorCode('');
        setVendorName('');
        setPanNo('');
        setContactPerson('');
        setVendorEmail('');
        setContactNo('');
        setVendorCategory('');
        setBillingCurrency('');
        setIsAlsoCustomer(false);
        setTcsApplicable(false);
        setGstRecords([
            {
                id: '1',
                gstin: '',
                registrationType: 'Regular',
                placesOfBusiness: [],
                isExpanded: true
            }
        ]);
        setItems([
            { id: 1, hsnSacCode: '', itemCode: '', itemName: '', supplierItemCode: '', supplierItemName: '' },
            { id: 2, hsnSacCode: '', itemCode: '', itemName: '', supplierItemCode: '', supplierItemName: '' },
        ]);
        setMsmeUdyamNo('');
        setFssaiLicenseNo('');
        setImportExportCode('');
        setEouStatus('');
        setTdsSectionApplicable('');
        setTcsSectionApplicable('');
        setTaxApplicableType('');
        setEnableAutomaticTdsPosting(false);
        setUploadedFiles({
            msmeFile: null,
            fssaiFile: null,
            iecFile: null,
            eouFile: null
        });
        setBankAccounts([
            { id: 1, accountNumber: '', bankName: '', ifscCode: '', branchName: '', swiftCode: '', vendorBranch: [], accountType: 'Savings' }
        ]);
        setCreditLimit('');
        setCreditPeriod('');
        setCreditTerms('');
        setPenaltyTerms('');
        setDeliveryTerms('');
        setWarrantyGuaranteeDetails('');
        setForceMajeure('');
        setDisputeRedressalTerms('');
        setGstin('');
        setGstRegistrationType('regular');
        setLegalName('');
        setTradeName('');
        setTradeName('');
        setLedgerId(null);
        setCreatedVendorId(null);
        sessionStorage.removeItem('currentVendorId');
        localStorage.removeItem('currentVendorId');
    };

    // Handle Finish (Total Save)
    const handleFinish = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();

        if (!vendorName) {
            showError('Vendor Name is required in Basic Details');
            setActiveMasterSubTab('Basic Details');
            return;
        }

        if (isSubmitting) return;
        setIsSubmitting(true);

        try {
            // 1. Save / Update Basic Details
            const basicPayload = {
                vendor_code: vendorCode || undefined,
                vendor_name: vendorName,
                pan_no: panNo || undefined,
                contact_person: contactPerson || undefined,
                email: vendorEmail,
                contact_no: contactNo,
                vendor_category: vendorCategory || null,
                billing_currency: billingCurrency || null,
                is_also_customer: isAlsoCustomer,
                tcs_applicable: tcsApplicable,
                link_to_customer_id: (isAlsoCustomer && linkVendorToCustomer && matchingCustomer) ? matchingCustomer.id : null,
                create_new_customer: (isAlsoCustomer && createCustomerOption) ? true : false,
                ledger_id: ledgerId || undefined
            };

            let newId = createdVendorId;
            let isNewVendor = false;
            if (!createdVendorId) {
                isNewVendor = true;
                console.log('Wizard Summary: Creating new vendor basic details...');
                const basicRes: any = await httpClient.post('/api/vendors/basic-details/', basicPayload);
                newId = basicRes.id;
                setCreatedVendorId(newId);
                sessionStorage.setItem('currentVendorId', newId.toString());
                localStorage.removeItem('currentVendorId');
                console.log('✅ Basic details created. Vendor ID:', newId);
            } else {
                console.log('Wizard Summary: Updating existing vendor basic details for ID:', newId);
                await httpClient.patch(`/api/vendors/basic-details/${newId}/`, basicPayload);
                console.log('✅ Basic details updated.');
            }

            // 2. GST Details
            console.log('Saving GST details...');
            try {
                const existingGst: any = await httpClient.get(`/api/vendors/gst-details/?vendor_basic_detail=${newId}`);
                const existingGstList = Array.isArray(existingGst) ? existingGst : (existingGst.results || []);

                for (const gst of gstRecords) {
                    if (!gst.gstin) continue;

                    const branches = gst.placesOfBusiness && gst.placesOfBusiness.length > 0
                        ? gst.placesOfBusiness
                        : [{ id: '', referenceName: '', addressLine1: '', addressLine2: '', addressLine3: '', address: '', contactPerson: '', email: '', contactNumber: '', pincode: '', city: '', state: '', country: '' } as PlaceOfBusiness];

                    for (const branch of branches) {
                        const mapRegistrationType = (type: string) => {
                            const mapping: Record<string, string> = {
                                'Regular': 'regular',
                                'Composition': 'composition',
                                'SEZ': 'special_economic_zone',
                                'Special Economic Zone (SEZ)': 'special_economic_zone',
                                'Unregistered': 'unregistered',
                                'Consumer': 'consumer',
                                'Overseas': 'overseas',
                                'Deemed Export': 'deemed_export'
                            };
                            return mapping[type] || type.toLowerCase();
                        };

                        const gstPayload = {
                            vendor_basic_detail: newId,
                            gstin: gst.gstin,
                            gst_registration_type: mapRegistrationType(gst.registrationType),
                            legal_name: gst.legalName || 'N/A',
                            trade_name: gst.tradeName || gst.legalName || 'N/A',
                            reference_name: branch.referenceName || '',
                            branch_address: [branch.addressLine1, branch.addressLine2, branch.addressLine3].filter(Boolean).join(', ') || branch.address || '',
                            branch_address_line1: branch.addressLine1 || '',
                            branch_address_line2: branch.addressLine2 || '',
                            branch_address_line3: branch.addressLine3 || '',
                            branch_contact_person: branch.contactPerson || '',
                            branch_email: branch.email || '',
                            branch_contact_no: branch.contactNumber || '',
                            branch_pincode: branch.pincode || '',
                            branch_city: branch.city || '',
                            branch_state: branch.state || '',
                            branch_country: branch.country || ''
                        };

                        const existingRecord = existingGstList.find((g: any) => {
                            // Match by ID if available (from database)
                            if (branch.id && !branch.id.startsWith('gst-')) {
                                return g.id.toString() === branch.id.toString();
                            }
                            // Fallback to GSTIN + Name match for new entries or when ID is missing
                            return g.gstin === gst.gstin && g.reference_name === (branch.referenceName || '');
                        });

                        if (existingRecord) {
                            await httpClient.patch(`/api/vendors/gst-details/${existingRecord.id}/`, gstPayload);
                            console.log(`GST updated: ${gst.gstin}`);
                        } else {
                            await httpClient.post('/api/vendors/gst-details/', gstPayload);
                            console.log(`GST created: ${gst.gstin}`);
                        }
                    }
                }
            } catch (gstError: any) {
                // Log but DO NOT throw — let other sections still save
                console.error('Error saving GST details (continuing):', gstError);
            }


            // 3. Products/Services — always upsert (even if items array is empty)
            console.log('Saving products/services... items state:', JSON.stringify(items));
            try {
                const cleanItems = items
                    .filter(i => i.itemName && i.itemName.trim() !== '')
                    .map(item => ({
                        hsn_sac_code: item.hsnSacCode || '',
                        item_code: item.itemCode || '',
                        item_name: item.itemName.trim(),
                        supplier_item_code: item.supplierItemCode || '',
                        supplier_item_name: item.supplierItemName || '',
                    }));

                // Always save – even if no items filled yet (saves empty [] to DB)
                const prodPayload = {
                    vendor_basic_detail: newId,
                    items: cleanItems,
                    is_active: true,
                };
                console.log(`Upserting product-services for vendor ${newId} with ${cleanItems.length} item(s)`);
                await httpClient.post('/api/vendors/product-services/', prodPayload);
                console.log('Products/services saved successfully.');
            } catch (prodError: any) {
                console.error('Error saving products/services:', prodError);
                showError(`Failed to save products/services: ${prodError.message || 'Unknown error'}`);
            }


            // 4. TDS - Always save (even if empty)
            console.log('Saving TDS details...');
            try {
                let existingTdsRecord = null;
                try {
                    const existingTds: any = await httpClient.get(`/api/vendors/tds-details/by-vendor/${newId}/`);
                    // API returns {} (empty) if not found, or the TDS object with an `id` if found
                    existingTdsRecord = existingTds && existingTds.id ? existingTds : null;
                } catch (e) {
                    // Ignore 404 or other errors
                }

                const tdsFormData = new FormData();
                tdsFormData.append('vendor_basic_detail', newId.toString());

                // Map TDS section to backend keys - Send exact value as requested
                const mappedTdsSection = tdsSectionApplicable || '';
                const rateInfo = getTDSRateInfo(mappedTdsSection);

                tdsFormData.append('msme_udyam_no', msmeUdyamNo || '');
                tdsFormData.append('fssai_license_no', fssaiLicenseNo || '');
                tdsFormData.append('import_export_code', importExportCode || '');
                tdsFormData.append('eou_status', eouStatus || '');
                tdsFormData.append('tds_section_applicable', mappedTdsSection);
                tdsFormData.append('tds_section', mappedTdsSection); // Also send as tds_section
                tdsFormData.append('tds_rate', rateInfo.tdsRate);
                tdsFormData.append('penalty_rate', rateInfo.penaltyRate);
                tdsFormData.append('pan_number', panNo || '');
                // TCS
                const tcsMappedSection = tcsSectionApplicable || '';
                const tcsRateInfo = getTCSRateInfo(tcsMappedSection);
                tdsFormData.append('tcs_section_applicable', tcsMappedSection);
                tdsFormData.append('tcs_rate', tcsRateInfo ? tcsRateInfo.tcsRate : '');
                tdsFormData.append('enable_automatic_tds_posting', enableAutomaticTdsPosting ? 'true' : 'false');

                if (uploadedFiles.msmeFile) tdsFormData.append('msme_file', uploadedFiles.msmeFile);
                if (uploadedFiles.fssaiFile) tdsFormData.append('fssai_file', uploadedFiles.fssaiFile);
                if (uploadedFiles.iecFile) tdsFormData.append('import_export_file', uploadedFiles.iecFile);
                if (uploadedFiles.eouFile) tdsFormData.append('eou_file', uploadedFiles.eouFile);

                if (existingTdsRecord) {
                    await httpClient.patchFormData(`/api/vendors/tds-details/${existingTdsRecord.id}/`, tdsFormData);
                    console.log('✅ TDS details updated');
                } else {
                    await httpClient.postFormData('/api/vendors/tds-details/', tdsFormData);
                    console.log('✅ TDS details created');
                }
            } catch (error) {
                console.error('❌ Error saving TDS details:', error);
                // Don't throw - continue with other sections
            }

            // 5. Banking - Always save (even if empty)
            console.log('Saving banking info...');
            try {
                const existingBanking: any = await httpClient.get(`/api/vendors/banking-details/by-vendor/${newId}/`);
                const existingBankingList = Array.isArray(existingBanking) ? existingBanking : (existingBanking.results || []);

                // Filter out empty rows from frontend state
                const validBanks = bankAccounts.filter(b => b.accountNumber && b.accountNumber.trim() !== '');

                for (const bank of validBanks) {
                    const bankPayload = {
                        vendor_basic_detail: newId,
                        bank_account_no: bank.accountNumber,
                        bank_name: bank.bankName || '',
                        ifsc_code: bank.ifscCode || '',
                        branch_name: bank.branchName || '',
                        swift_code: bank.swiftCode || '',
                        vendor_branch: Array.isArray(bank.vendorBranch) ? bank.vendorBranch.join(',') : (bank.vendorBranch || ''),
                        account_type: bank.accountType ? bank.accountType.toLowerCase().replace(' ', '_') : 'savings',
                        is_active: true
                    };

                    // Check if this branch/account already exists
                    const existingRecord = existingBankingList.find((b: any) => b.id === bank.id);

                    if (existingRecord) {
                        // Update existing
                        await httpClient.patch(`/api/vendors/banking-details/${existingRecord.id}/`, bankPayload);
                        console.log(`✅ Bank account updated: ${bank.accountNumber}`);
                    } else {
                        // Create new
                        await httpClient.post('/api/vendors/banking-details/', bankPayload);
                        console.log(`✅ Bank account created: ${bank.accountNumber}`);
                    }
                }

                if (validBanks.length === 0) {
                    console.log('ℹ️  No banking details data to save');
                }

            } catch (error) {
                console.error('❌ Error saving banking details:', error);
                // Don't throw - continue with other sections
            }

            // 6. Terms - Always save (even if empty)
            console.log('Saving terms & conditions...');
            try {
                let existingTermsId = null;
                try {
                    const termsRes: any = await httpClient.get(`/api/vendors/terms/by_vendor/${newId}/`);
                    // Backend returns { success: true, data: [...], count: X }
                    const termsArray = termsRes.data || (Array.isArray(termsRes) ? termsRes : []);
                    if (termsArray.length > 0 && termsArray[0].id) {
                        existingTermsId = termsArray[0].id;
                    }
                } catch (e) {
                    // Ignore 404
                }

                const termsPayload = {
                    vendor_basic_detail: newId,
                    credit_limit: creditLimit && !isNaN(parseFloat(creditLimit)) ? parseFloat(creditLimit) : null,
                    credit_period: creditPeriod || null,
                    credit_terms: creditTerms || null,
                    penalty_terms: penaltyTerms || null,
                    delivery_terms: deliveryTerms || null,
                    warranty_guarantee_details: warrantyGuaranteeDetails || null,
                    force_majeure: forceMajeure || null,
                    dispute_redressal_terms: disputeRedressalTerms || null
                };

                if (existingTermsId) {
                    await httpClient.patch(`/api/vendors/terms/${existingTermsId}/`, termsPayload);
                    console.log('✅ Terms updated');
                } else {
                    await httpClient.post('/api/vendors/terms/', termsPayload);
                    console.log('✅ Terms created');
                }
            } catch (error) {
                console.error('❌ Error saving terms & conditions:', error);
                // Don't throw - continue
            }

            showSuccess('Vendor Onboarded Successfully!');

            // Cleanup on full success
            setCreatedVendorId(null);
            sessionStorage.removeItem('currentVendorId');
            localStorage.removeItem('currentVendorId');

            // Reset all form states
            setVendorCode('');
            setVendorName('');
            setPanNo('');
            setContactPerson('');
            setVendorEmail('');
            setContactNo('');
            setVendorCategory('');
            setBillingCurrency('');
            setIsAlsoCustomer(false);
            setTcsApplicable(false);

            setGstRecords([
                { id: '1', gstin: '', registrationType: 'Regular', placesOfBusiness: [], isExpanded: true }
            ]);

            setItems([
                { id: 1, hsnSacCode: '', itemCode: '', itemName: '', supplierItemCode: '', supplierItemName: '' },
                { id: 2, hsnSacCode: '', itemCode: '', itemName: '', supplierItemCode: '', supplierItemName: '' },
            ]);

            setBankAccounts([
                { id: 1, accountNumber: '', bankName: '', ifscCode: '', branchName: '', swiftCode: '', vendorBranch: [], accountType: 'Savings' }
            ]);

            setMsmeUdyamNo('');
            setFssaiLicenseNo('');
            setImportExportCode('');
            setEouStatus('');
            setTdsSectionApplicable('');
            setTcsSectionApplicable('');
            setTaxApplicableType('');
            setEnableAutomaticTdsPosting(false);
            setUploadedFiles({
                msmeFile: null,
                fssaiFile: null,
                iecFile: null,
                eouFile: null
            });

            setCreditLimit('');
            setCreditPeriod('');
            setCreditTerms('');
            setPenaltyTerms('');
            setDeliveryTerms('');
            setWarrantyGuaranteeDetails('');
            setForceMajeure('');
            setDisputeRedressalTerms('');

            // Back to first tab and close wizard
            setActiveMasterSubTab('Vendor Creation'); // Go back to the hub/list tab
            setIsCreatingVendor(false); // Close the wizard and return to management list

            // Cleanup on full success
            setCreatedVendorId(null);
            sessionStorage.removeItem('currentVendorId');
            localStorage.removeItem('currentVendorId');

            // Refresh vendor list
            fetchVendors();

        } catch (error: any) {
            console.error('❌ Error during vendor onboarding:', error);
            handleApiError(error, 'Save Vendor');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Product Services State
    interface ProductServiceItem {
        id: number;
        hsnSacCode: string;
        itemCode: string; // This will hold the SELECTED VALUE (string)
        itemName: string; // This will hold the SELECTED VALUE (string)
        supplierItemCode: string;
        supplierItemName: string;
    }

    interface SimplifiedInventoryItem {
        id: number;
        item_code: string;
        item_name: string;
        hsn_code?: string;
        uom?: string;
        alternate_uom?: string;
        unit?: string;
        gst_rate?: number | string;
        cess_rate?: number | string;
    }

    const [inventoryItems, setInventoryItems] = useState<SimplifiedInventoryItem[]>([]);
    const [items, setItems] = useState<ProductServiceItem[]>([
        { id: 1, hsnSacCode: '', itemCode: '', itemName: '', supplierItemCode: '', supplierItemName: '' },
        { id: 2, hsnSacCode: '', itemCode: '', itemName: '', supplierItemCode: '', supplierItemName: '' },
    ]);

    // Fetch Inventory Items for Dropdown (used by Products/Services tab and Create PO modal)
    useEffect(() => {
        const fetchItems = async () => {
            try {
                const response = await httpClient.get<SimplifiedInventoryItem[]>('/api/inventory/items/');
                setInventoryItems(Array.isArray(response) ? response : []);
            } catch (error) {
                handleApiError(error, 'Fetch Inventory Items');
            }
        };
        fetchItems();

        const fetchLedgers = async () => {
            try {
                const res: any = await httpClient.get('/api/accounting/ledgers/?group=Sundry Creditors');
                setAllLedgers(Array.isArray(res) ? res : (res.results || []));
            } catch (err) {
                console.error('Error fetching ledgers:', err);
            }
        };
        fetchLedgers();
    }, []);

    // Recalculate GST amounts when supply type changes (Intrastate ↔ Interstate)
    useEffect(() => {
        if (!showCreatePOModal) return;
        const supplyType = createPOForm.supplyType || 'intrastate';
        setPOItems(prevItems => prevItems.map(item => {
            const quantity = parseFloat(item.quantity) || 0;
            const finalRate = parseFloat(item.finalRate) || 0;
            const gstRateVal = parseFloat(item.gstRate) || 0;
            const cessRateVal = parseFloat(item.cessRate) || 0;
            const taxableVal = quantity * finalRate;

            let igstAmt = 0, cgstAmt = 0, sgstAmt = 0;
            if (supplyType === 'interstate') {
                igstAmt = (taxableVal * gstRateVal) / 100;
            } else {
                cgstAmt = (taxableVal * gstRateVal) / 2 / 100;
                sgstAmt = (taxableVal * gstRateVal) / 2 / 100;
            }
            const cessAmt = (taxableVal * cessRateVal) / 100;

            return {
                ...item,
                taxableValue: taxableVal.toFixed(2),
                igst: igstAmt.toFixed(2),
                cgst: cgstAmt.toFixed(2),
                sgst: sgstAmt.toFixed(2),
                cess: cessAmt.toFixed(2),
                netValue: (taxableVal + igstAmt + cgstAmt + sgstAmt + cessAmt).toFixed(2),
            };
        }));
    }, [createPOForm.supplyType]);

    const handleAddItem = () => {
        setItems([...items, {
            id: items.length + 1,
            hsnSacCode: '',
            itemCode: '',
            itemName: '',
            supplierItemCode: '',
            supplierItemName: ''
        }]);
    };

    const handleRemoveItem = (id: number) => {
        if (items.length > 1) {
            setItems(items.filter(item => item.id !== id));
        }
    };

    const handleItemChange = (id: number, field: keyof ProductServiceItem, value: string) => {
        setItems(prevItems => prevItems.map(item => {
            if (item.id !== id) return item;

            const newItem = { ...item, [field]: value };

            // Auto-fill logic
            if (field === 'itemCode') {
                const foundItem = inventoryItems.find(i => i.item_code === value);
                if (foundItem) {
                    newItem.itemName = foundItem.item_name;
                    newItem.hsnSacCode = foundItem.hsn_code || '';
                }
            } else if (field === 'itemName') {
                const foundItem = inventoryItems.find(i => i.item_name === value);
                if (foundItem) {
                    newItem.itemCode = foundItem.item_code;
                    newItem.hsnSacCode = foundItem.hsn_code || '';
                }
            }

            return newItem;
        }));
    };

    // Update createdVendorId when basic details are saved
    useEffect(() => {
        // This is where you'd normally persist the vendor ID if moving between tabs
        // For now we rely on the user completing the flow sequentially
    }, []);

    // Handle GST Details Form Submit (Navigation Only)
    const handleGSTDetailsSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        // Validate that if GSTIN is provided, it is exactly 15 chars
        const invalidRecord = gstRecords.find(r =>
            r.registrationType !== 'Unregistered' &&
            r.gstin &&
            r.gstin.length !== 15
        );

        if (invalidRecord) {
            showError(`Invalid GSTIN format for record ${gstRecords.indexOf(invalidRecord) + 1}. Must be exactly 15 characters.`);
            return;
        }

        setActiveMasterSubTab('Products/Services');
    };

    // Handle Product Services Submit (Navigation Only)
    const handleProductServicesSubmit = () => {

        if (items.length === 0) {
            showError('Please add at least one item.');
            return;
        }
        setActiveMasterSubTab('TDS & Other Statutory'); // Correct next tab
    };


    // Category Management Handlers
    const fetchCategories = async () => {
        try {
            setLoadingCategories(true);
            const response = await httpClient.get('/api/vendors/categories/');
            setCategories(Array.isArray(response) ? response : []);
        } catch (error) {
            handleApiError(error, 'Fetch Categories');
            setCategories([]);
        } finally {
            setLoadingCategories(false);
        }
    };

    const handleCategorySubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!categoryName) {
            showError('Category name is required');
            return;
        }

        const payload = {
            category: categoryName,
            group: parentCategoryPath || null,
            subgroup: categoryDescription || null,
            is_active: true
        };

        try {
            if (isEditModeCategory && selectedCategory) {
                await httpClient.put(`/api/vendors/categories/${selectedCategory.id}/`, payload);
                showSuccess('Category updated successfully!');
            } else {
                await httpClient.post('/api/vendors/categories/', payload);
                showSuccess('Category created successfully!');
            }
            fetchCategories();
            resetCategoryForm();
        } catch (error: any) {
            handleApiError(error, 'Save Category');
        }
    };

    const handleEditCategory = (category: Category) => {
        setSelectedCategory(category);
        setCategoryName(category.category);
        setParentCategoryPath(category.group || '');
        setCategoryDescription(category.subgroup || '');
        setIsEditModeCategory(true);
    };

    const handleDeleteCategory = async (id: number) => {
        if (!await confirm('Are you sure you want to delete this category?')) return;
        try {
            await httpClient.delete(`/api/vendors/categories/${id}/`);
            showSuccess('Category deleted successfully!');
        } catch (error: any) {
            handleApiError(error, 'Delete Category');
        } finally {
            fetchCategories();
        }
    };

    const resetCategoryForm = () => {
        setCategoryName('');
        setParentCategoryId(null);
        setParentCategoryPath('');
        setCategoryDescription('');
        setIsEditModeCategory(false);
        setSelectedCategory(null);
    };

    // Fetch PO Series
    const fetchPOSeries = async () => {
        try {
            setLoadingPOSeries(true);
            const response = await httpClient.get('/api/vendors/po-settings/');
            // httpClient.get() returns the data directly, not wrapped in .data
            setPoSeriesList(Array.isArray(response) ? response : []);
        } catch (error) {
            handleApiError(error, 'Fetch PO Series');
            setPoSeriesList([]);
        } finally {
            setLoadingPOSeries(false);
        }
    };

    // Load categories on tab switch to Category or Vendor Creation
    useEffect(() => {
        if (activeTab === 'Master') {
            if (activeMasterSubTab === 'Category' || activeMasterSubTab === 'Vendor Creation' || activeMasterSubTab === 'PO Settings') {
                fetchCategories();
            }
            if (activeMasterSubTab === 'PO Settings') {
                fetchPOSeries();
            }
        }
        // Always keep PO Series loaded for the Create PO modal dropdown
        if (activeTab === 'Transaction' && activeTransactionSubTab === 'Purchase Orders') {
            fetchPOSeries();
        }
    }, [activeTab, activeMasterSubTab, activeTransactionSubTab]);

    // Derived Preview
    const getPreview = () => {
        const numPart = '0'.repeat(Math.max(0, poDigits - 1)) + '1';
        return `${poPrefix}${numPart}${poSuffix}`;
    };

    // Handle PO Submit
    const handlePOSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!poCategoryId) {
            showError('Please select a category');
            return;
        }

        const payload = {
            name: poName,
            category: poCategoryId,
            prefix: poPrefix,
            suffix: poSuffix,
            auto_year: poAutoYear,
            digits: poDigits,
            is_active: true
        };

        console.log("Submitting PO settings payload:", payload);

        try {
            if (isEditModePO && selectedPOSeries) {
                await httpClient.put(`/api/vendors/po-settings/${selectedPOSeries.id}/`, payload);
            } else {
                await httpClient.post('/api/vendors/po-settings/', payload);
            }
            fetchPOSeries();
            resetPOForm();
        } catch (error: any) {
            handleApiError(error, 'Save PO Series');
        }
    };

    const handleDeletePO = async (id: number) => {
        if (!await confirm('Are you sure you want to delete this series?')) return;
        try {
            await httpClient.delete(`/api/vendors/po-settings/${id}/`);
            showSuccess('PO Series deleted successfully!');
        } catch (error: any) {
            handleApiError(error, 'Delete PO Series');
        } finally {
            fetchPOSeries();
        }
    };

    const handleEditPO = (series: POSeries) => {
        setSelectedPOSeries(series);
        setPoName(series.name);
        setPoCategoryId(series.category);
        setPoCategoryPath(series.category_path || '');
        setPoPrefix(series.prefix);
        setPoSuffix(series.suffix);
        setPoAutoYear(series.auto_year);
        setPoDigits(series.digits);
        setIsEditModePO(true);
    };

    const resetPOForm = () => {
        setPoName('');
        setPoCategoryId(null);
        setPoCategoryPath('');
        setPoPrefix('');
        setPoSuffix('');
        setPoAutoYear(false);
        setPoDigits(4);
        setIsEditModePO(false);
        setSelectedPOSeries(null);
    };

    return (
        <div className="space-y-8">
            <div className="erp-section-title flex items-end justify-between">
                <div>
                    <h1 className="page-title">Vendor Portal</h1>
                    <p className="helper-text">Procurement management</p>
                </div>
            </div>

            {/* Main Tabs */}
            <div className="erp-tab-container">
                {availableTabs.map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab as VendorTab)}
                        className={`erp-tab ${activeTab === tab ? 'active' : ''}`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {activeTab === 'Master' && (
                <>
                    <div className="erp-card p-0 overflow-hidden">
                        <div className="erp-tab-container !mb-0 px-6 pt-4">
                            <nav className="flex space-x-2">
                                {['Category', 'PO Settings', 'Vendor Creation']
                                    .filter(subTab => isSuperuser || hasTabAccess('Vendor Portal', subTab))
                                    .map((subTab) => {
                                        const isVendorCreationActive = subTab === 'Vendor Creation' &&
                                            ['Vendor Creation', 'Basic Details', 'Branch details', 'Products/Services', 'TDS & Other Statutory', 'Banking Info', 'Terms & Conditions'].includes(activeMasterSubTab);
                                        const isActive = activeMasterSubTab === subTab || isVendorCreationActive;

                                        return (
                                            <button
                                                key={subTab}
                                                onClick={() => setActiveMasterSubTab(subTab as MasterSubTab)}
                                                className={`erp-tab ${isActive ? 'active' : ''}`}
                                            >
                                                {subTab}
                                            </button>
                                        );
                                    })}
                            </nav>
                        </div>

                        {activeMasterSubTab === 'Category' && (
                            <InventoryCategoryWizard
                                apiEndpoint="/api/vendors/categories/"
                                allowCreateGroup={false}
                                allowCreateItem={false}
                                systemCategories={VENDOR_SYSTEM_CATEGORIES}
                                defaultGroups={VENDOR_DEFAULT_GROUPS}
                                defaultSubgroupsOnlyFor={['Stores and Spares']}
                                onCreateCategory={async (data) => {
                                    try {
                                        await httpClient.post('/api/vendors/categories/', {
                                            category: data.category,
                                            group: data.group,
                                            subgroup: data.subgroup,
                                            is_active: true
                                        });
                                        showSuccess('Category created successfully!');
                                    } catch (error: any) {
                                        // Error propagated to component
                                        throw error;
                                    }
                                }}
                                onEditCategory={async (data) => {
                                    try {
                                        await httpClient.put(`/api/vendors/categories/${data.id}/`, {
                                            category: data.category,
                                            group: data.group,
                                            subgroup: data.subgroup,
                                            is_active: true
                                        });
                                    } catch (error: any) {
                                        console.error('Error updating category:');
                                        throw error;
                                    }
                                }}
                                onDeleteCategory={async (id) => {
                                    try {
                                        await httpClient.delete(`/api/vendors/categories/${id}/`);
                                    } catch (error: any) {
                                        console.error('Error deleting category:');
                                        throw error;
                                    }
                                }}
                            />
                        )}

                        {activeMasterSubTab === 'PO Settings' && (
                            <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
                                {/* Left Box: Form (Questions) */}
                                <div className="lg:col-span-1 border-r border-gray-200 pr-0 lg:pr-8">
                                    <h3 className="section-title mb-4">
                                        {isEditModePO ? 'Edit Series' : 'New PO Series'}
                                    </h3>
                                    <form onSubmit={handlePOSubmit} className="space-y-4">
                                        {/* Name */}
                                        <div>
                                            <label className="label-text">
                                                Name of PO Series <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                value={poName}
                                                onChange={(e) => setPoName(e.target.value)}
                                                className="w-full px-4 py-2 border border-slate-200 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                placeholder="e.g. Standard PO"
                                                required
                                            />
                                        </div>

                                        {/* Category */}
                                        <div>
                                            <label className="label-text">
                                                Category <span className="text-red-500">*</span>
                                            </label>
                                            <CategoryHierarchicalDropdown
                                                apiEndpoint="/api/vendors/categories/"
                                                systemCategories={VENDOR_SYSTEM_CATEGORIES}
                                                mergeSystem={true}
                                                onSelect={(selection) => {
                                                    setPoCategoryId(selection.id);
                                                    setPoCategoryPath(selection.fullPath);
                                                }}
                                                value={poCategoryPath}
                                            />
                                        </div>

                                        {/* Prefix & Suffix */}
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="label-text">Prefix</label>
                                                <input
                                                    type="text"
                                                    value={poPrefix}
                                                    onChange={(e) => setPoPrefix(e.target.value)}
                                                    className="w-full px-4 py-2 border border-slate-200 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                    placeholder="PO/"
                                                />
                                            </div>
                                            <div>
                                                <label className="label-text">Suffix</label>
                                                <input
                                                    type="text"
                                                    value={poSuffix}
                                                    onChange={(e) => setPoSuffix(e.target.value)}
                                                    className="w-full px-4 py-2 border border-slate-200 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                    placeholder="/23-24"
                                                />
                                            </div>
                                        </div>

                                        {/* Digits Only */}
                                        <div className="mt-4">
                                            <label className="label-text">Digits</label>
                                            <input
                                                type="number"
                                                min="1"
                                                max="10"
                                                value={poDigits}
                                                onChange={(e) => setPoDigits(Number(e.target.value))}
                                                className="w-full px-4 py-2 border border-slate-200 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                            />
                                        </div>

                                        {/* Preview Box */}
                                        <div className="bg-gray-100 p-6 rounded-[4px] text-center">
                                            <p className="text-xs uppercase text-gray-500 font-semibold mb-2">SAMPLE PREVIEW</p>
                                            <p className="text-xl font-bold text-gray-800">
                                                {getPreview()}
                                            </p>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex gap-3 pt-4">
                                            <button
                                                type="submit"
                                                className="flex-1 px-4 py-2 border border-transparent text-sm font-medium rounded-[4px] shadow-none border border-slate-200 text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none"
                                            >
                                                {isEditModePO ? 'Update Series' : 'Save Series'}
                                            </button>
                                            {isEditModePO && (
                                                <button
                                                    type="button"
                                                    onClick={resetPOForm}
                                                    className="px-4 py-2 border border-slate-200 text-sm font-medium rounded-[4px] shadow-none border border-slate-200 text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
                                                >
                                                    Cancel
                                                </button>
                                            )}
                                        </div>
                                    </form>
                                </div>

                                {/* Right Box: Existing Locations (Existing Series) */}
                                <div className="lg:col-span-2">
                                    <h3 className="section-title mb-4">Existing Series</h3>
                                    <div className="border border-slate-200 rounded-[4px] overflow-hidden">
                                        <table className="erp-table min-w-full">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th className="table-header">Name</th>
                                                    <th className="table-header">Category</th>
                                                    <th className="table-header">Details</th>
                                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="bg-white divide-y divide-gray-200">
                                                {loadingPOSeries ? (
                                                    <tr><td colSpan={4} className="px-6 py-4 text-center text-gray-500">Loading...</td></tr>
                                                ) : poSeriesList.length === 0 ? (
                                                    <tr><td colSpan={4} className="px-6 py-4 text-center text-gray-500">No series found.</td></tr>
                                                ) : (
                                                    poSeriesList.map(series => (
                                                        <tr key={series.id} className="hover:bg-gray-50">
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                                {series.name}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                                {series.category_path || series.category_name || '-'}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-indigo-600">
                                                                {/* Show sample preview */}
                                                                {(series.prefix || '') + '0'.repeat(Math.max(0, series.digits - 1)) + '1' + (series.suffix || '')}
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                                <button
                                                                    onClick={() => handleEditPO(series)}
                                                                    className="text-indigo-600 hover:text-indigo-900 mr-4"
                                                                >
                                                                    Edit
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDeletePO(series.id)}
                                                                    className="text-red-600 hover:text-red-900"
                                                                >
                                                                    Delete
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeMasterSubTab === 'Vendor Creation' && (
                            <div className="p-8">
                                {!isCreatingVendor ? (
                                    <>
                                        <div className="flex justify-between items-center mb-6">
                                            <h3 className="text-xl font-bold text-gray-900">Vendor Management</h3>
                                            <button
                                                onClick={handleCreateNewVendor}
                                                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-[4px] hover:bg-indigo-700 transition-colors flex items-center gap-2"
                                            >
                                                <Plus className="w-4 h-4" /> Create New Vendor
                                            </button>
                                        </div>

                                        {/* Filters */}
                                        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-4">
                                            <div className="md:col-span-8 relative">
                                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                    <Search className="h-4 w-4 text-gray-400" />
                                                </div>
                                                <input
                                                    type="text"
                                                    placeholder="Search by vendor name or code..."
                                                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                    value={vendorSearchTerm}
                                                    onChange={(e) => setVendorSearchTerm(e.target.value)}
                                                />
                                            </div>
                                            <div className="md:col-span-2">
                                                <div className="relative">
                                                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                                        <Filter className="h-3 w-3 text-gray-400" />
                                                    </div>
                                                    <select
                                                        className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm text-gray-700 appearance-none bg-white"
                                                        value={vendorStatusFilter}
                                                        onChange={(e) => setVendorStatusFilter(e.target.value)}
                                                    >
                                                        <option>All Status</option>
                                                        <option>Live</option>
                                                        <option>Dormant</option>
                                                    </select>
                                                </div>
                                            </div>
                                            <div className="md:col-span-2">
                                                <select
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm text-gray-700 bg-white"
                                                    value={vendorCategoryFilter}
                                                    onChange={(e) => setVendorCategoryFilter(e.target.value)}
                                                >
                                                    <option>All Categories</option>
                                                    {categories.map((cat) => (
                                                        <option key={cat.id} value={cat.full_path || cat.category}>
                                                            {cat.full_path || [cat.category, cat.group, cat.subgroup].filter(Boolean).join(' > ')}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        <p className="text-sm text-gray-500 mb-4">Showing {filteredVendors.length} of {vendorList.length} vendors</p>

                                        {/* Table */}
                                        <div className="bg-white border border-gray-200 rounded-[4px] overflow-hidden">
                                            <table className="min-w-full divide-y divide-gray-200">
                                                <thead className="bg-gray-50">
                                                    <tr>
                                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CATEGORY</th>
                                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">VENDOR CODE</th>
                                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">VENDOR NAME</th>
                                                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">ALSO CUSTOMER?</th>
                                                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">STATUS</th>
                                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">ACTIONS</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="bg-white divide-y divide-gray-200">
                                                    {loadingVendors ? (
                                                        <tr>
                                                            <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                                                                <div className="flex flex-col items-center gap-2">
                                                                    <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                                                                    <span>Loading vendors...</span>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ) : filteredVendors.length === 0 ? (
                                                        <tr>
                                                            <td colSpan={5} className="px-6 py-12 text-center text-gray-500 italic">
                                                                No vendors found matching your criteria.
                                                            </td>
                                                        </tr>
                                                    ) : (
                                                        filteredVendors.map((vendor) => (
                                                            <tr key={vendor.id} className="hover:bg-gray-50 transition-colors">
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                                    {(vendor as any).vendor_category || '-'}
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                                    {vendor.vendor_code}
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                                                                    {vendor.vendor_name}
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-center">
                                                                    {vendor.is_also_customer ? (
                                                                        <span className="px-2 py-1 inline-flex text-[10px] leading-4 font-bold rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200 uppercase tracking-tighter">
                                                                            Yes
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-gray-300 text-xs">—</span>
                                                                    )}
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-center">
                                                                    <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-[4px] ${vendor.is_active
                                                                        ? 'bg-green-100 text-green-800'
                                                                        : 'bg-gray-100 text-gray-600'
                                                                        }`}>
                                                                        {vendor.is_active ? 'Live' : 'Dormant'}
                                                                    </span>
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                                                                    <div className="flex items-center justify-end gap-3">
                                                                        <button
                                                                            className="text-indigo-600 hover:text-indigo-900 transition-colors"
                                                                            title="View"
                                                                            onClick={() => setViewVendorId(vendor.id)}
                                                                        >
                                                                            <Eye className="w-5 h-5" />
                                                                        </button>
                                                                        <button
                                                                            className="text-blue-600 hover:text-blue-900 transition-colors"
                                                                            title="Edit"
                                                                            onClick={() => handleEditVendor(vendor)}
                                                                        >
                                                                            <Pencil className="w-5 h-5" />
                                                                        </button>
                                                                        <button
                                                                            className="text-red-600 hover:text-red-900 transition-colors"
                                                                            title="Delete"
                                                                            onClick={() => handleDeleteVendor(vendor.id)}
                                                                        >
                                                                            <Trash2 className="w-5 h-5" />
                                                                        </button>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        ))
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="mb-6">
                                            <button
                                                onClick={() => setIsCreatingVendor(false)}
                                                className="text-indigo-600 hover:text-indigo-800 text-xs font-semibold flex items-center gap-1 uppercase tracking-wider mb-4"
                                            >
                                                <ChevronDown className="w-4 h-4 rotate-90" /> BACK TO VENDOR LIST
                                            </button>
                                            <h3 className="text-xl font-bold text-gray-900">
                                                {createdVendorId ? 'Edit Vendor Details' : 'Create New Vendor'}
                                            </h3>
                                            <p className="text-sm text-gray-500 mt-1">
                                                {createdVendorId
                                                    ? `Editing active vendor: ${vendorName}`
                                                    : 'Select a tab below to configure vendor details:'
                                                }
                                            </p>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                            {[
                                                { id: 'Basic Details', title: 'BASIC DETAILS', desc: 'CONFIGURE BASIC DETAILS' },
                                                { id: 'Branch details', title: 'BRANCH DETAILS', desc: 'CONFIGURE BRANCH DETAILS' },
                                                { id: 'Products/Services', title: 'PRODUCTS/SERVICES', desc: 'CONFIGURE PRODUCTS/SERVICES' },
                                                { id: 'TDS & Other Statutory', title: 'TDS & OTHER STATUTORY DETAILS', desc: 'CONFIGURE TDS & OTHER STATUTORY' },
                                                { id: 'Banking Info', title: 'BANKING INFO', desc: 'CONFIGURE BANKING INFO' },
                                                { id: 'Terms & Conditions', title: 'TERMS & CONDITIONS', desc: 'CONFIGURE TERMS & CONDITIONS' },
                                            ].map((card) => (
                                                <button
                                                    key={card.id}
                                                    onClick={() => setActiveMasterSubTab(card.id as MasterSubTab)}
                                                    className="p-8 border border-gray-200 rounded-[4px] hover:border-indigo-500 hover:bg-indigo-50/30 transition-all text-left group"
                                                >
                                                    <div className="font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">{card.title}</div>
                                                    <div className="text-xs text-gray-400 mt-1 uppercase tracking-tight">{card.desc}</div>
                                                </button>
                                            ))}
                                        </div>

                                        <div className="mt-12 text-center text-gray-400 italic text-sm">
                                            content coming soon.
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {activeMasterSubTab === 'Basic Details' && (
                            <div className="p-6">
                                <div className="mb-6">
                                    <button
                                        onClick={() => setActiveMasterSubTab('Vendor Creation')}
                                        className="text-indigo-600 hover:text-indigo-800 text-xs font-semibold flex items-center gap-1 uppercase tracking-wider mb-4"
                                    >
                                        <ChevronDown className="w-4 h-4 rotate-90" /> BACK TO VENDOR CREATION HUB
                                    </button>
                                    <h3 className="text-xl font-bold text-gray-900">Basic Details</h3>
                                </div>

                                <form className="space-y-6" onSubmit={handleBasicDetailsSubmit}>
                                    {/* Row 1: Vendor Code and Vendor Name */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {/* Vendor Code */}
                                        <div>
                                            <label className="label-text">
                                                Vendor Code
                                            </label>
                                            <input
                                                type="text"
                                                value={vendorCode}
                                                onChange={(e) => setVendorCode(e.target.value)}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-teal-500 focus:border-teal-500"
                                                placeholder="Auto-generated or manual"
                                            />
                                        </div>

                                        {/* Vendor Name */}
                                        <div>
                                            <label className="label-text">
                                                Vendor Name <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                value={vendorName}
                                                onChange={(e) => setVendorName(e.target.value)}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-teal-500 focus:border-teal-500"
                                                placeholder="Enter vendor name"
                                                required
                                            />
                                        </div>

                                        {/* Vendor Category */}
                                        <div>
                                            <label className="label-text">
                                                Vendor Category <span className="text-red-500">*</span>
                                            </label>
                                            <CategoryHierarchicalDropdown
                                                apiEndpoint="/api/vendors/categories/"
                                                systemCategories={VENDOR_SYSTEM_CATEGORIES}
                                                mergeSystem={true}
                                                value={vendorCategory}
                                                onSelect={(selection) => setVendorCategory(selection.fullPath)}
                                                placeholder="Select Category"
                                                className="w-full"
                                            />
                                        </div>

                                        {/* Billing Currency */}
                                        <div>
                                            <label className="label-text">
                                                Billing Currency
                                            </label>
                                            <select
                                                value={billingCurrency}
                                                onChange={(e) => setBillingCurrency(e.target.value)}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-teal-500 focus:border-teal-500"
                                            >
                                                <option value="">Select Currency</option>
                                                {BILLING_CURRENCIES.map((curr) => (
                                                    <option key={curr.code} value={curr.code}>
                                                        {curr.code} - {curr.name} ({curr.symbol})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* PAN No */}
                                        <div>
                                            <label className="label-text">
                                                PAN No.
                                            </label>
                                            <input
                                                type="text"
                                                value={panNo}
                                                onChange={(e) => setPanNo(e.target.value)}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-teal-500 focus:border-teal-500"
                                                placeholder="AAAAA0000A"
                                                maxLength={10}
                                            />
                                        </div>

                                        {/* Contact Person */}
                                        <div>
                                            <label className="label-text">
                                                Contact Person
                                            </label>
                                            <input
                                                type="text"
                                                value={contactPerson}
                                                onChange={(e) => setContactPerson(e.target.value)}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-teal-500 focus:border-teal-500"
                                                placeholder="Primary contact name"
                                            />
                                        </div>

                                        {/* Email address */}
                                        <div>
                                            <label className="label-text">
                                                Email address <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="email"
                                                value={vendorEmail}
                                                onChange={(e) => setVendorEmail(e.target.value)}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-teal-500 focus:border-teal-500"
                                                placeholder="vendor@example.com"
                                                required
                                            />
                                        </div>

                                        {/* Contact No */}
                                        <div>
                                            <label className="label-text">
                                                Contact No <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="tel"
                                                value={contactNo}
                                                onChange={(e) => {
                                                    const value = e.target.value;
                                                    if (/^\d*$/.test(value)) {
                                                        setContactNo(value);
                                                    }
                                                }}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-teal-500 focus:border-teal-500"
                                                placeholder="+91 XXXXX XXXXX"
                                                required
                                            />
                                        </div>
                                    </div>

                                    {/* Is Also Customer & TCS Applicable */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                                        <div className="col-span-1">
                                            <label className="label-text">
                                                Is this vendor also a customer?
                                            </label>
                                            <div className="flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setIsAlsoCustomer(true)}
                                                    className={`px-6 py-1.5 text-sm border-2 rounded focus:outline-none transition-colors ${isAlsoCustomer
                                                        ? 'border-teal-500 bg-teal-50 text-teal-700 font-medium'
                                                        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                                                        }`}
                                                >
                                                    Yes
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setIsAlsoCustomer(false)}
                                                    className={`px-6 py-1.5 text-sm border-2 rounded focus:outline-none transition-colors ${!isAlsoCustomer
                                                        ? 'border-teal-500 bg-teal-50 text-teal-700 font-medium'
                                                        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                                                        }`}
                                                >
                                                    No
                                                </button>
                                            </div>
                                            {isAlsoCustomer && (
                                                <div className="mt-4 space-y-4">
                                                    {isLoadingCustomer ? (
                                                        <div className="flex items-center gap-2 text-xs text-gray-500">
                                                            <div className="w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                                                            Searching for matching customer...
                                                        </div>
                                                    ) : matchingCustomer ? (
                                                        <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-[4px]">
                                                            <label className="label-text text-indigo-700">
                                                                Link the Vendor to this Customer &lt;{matchingCustomer.customer_code}- {matchingCustomer.customer_name}&gt;
                                                            </label>
                                                            <div className="flex gap-2 mt-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setLinkVendorToCustomer(true)}
                                                                    className={`px-4 py-1 text-xs border rounded transition-colors ${linkVendorToCustomer === true
                                                                        ? 'border-indigo-600 bg-indigo-600 text-white font-medium'
                                                                        : 'border-indigo-300 text-indigo-600 bg-white hover:bg-indigo-50'
                                                                        }`}
                                                                >
                                                                    Yes
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setLinkVendorToCustomer(false)}
                                                                    className={`px-4 py-1 text-xs border rounded transition-colors ${linkVendorToCustomer === false
                                                                        ? 'border-indigo-600 bg-indigo-600 text-white font-medium'
                                                                        : 'border-indigo-300 text-indigo-600 bg-white hover:bg-indigo-50'
                                                                        }`}
                                                                >
                                                                    No
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : customerSearchAttempted && vendorName && panNo ? (
                                                        <div className="p-4 bg-orange-50 border border-orange-100 rounded-[4px]">
                                                            <p className="text-xs text-orange-700 mb-2 font-medium italic">No matching customer found in Masters.</p>
                                                        </div>
                                                    ) : null}

                                                    {/* Create Customer Prompt: shown if mismatch or linking declined */}
                                                    {((matchingCustomer && linkVendorToCustomer === false) || (!matchingCustomer && customerSearchAttempted && vendorName && panNo)) && (
                                                        <div className="p-4 bg-teal-50 border border-teal-100 rounded-[4px]">
                                                            <label className="label-text text-teal-700">
                                                                Create a Customer?
                                                            </label>
                                                            <div className="flex gap-2 mt-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setCreateCustomerOption(true)}
                                                                    className={`px-4 py-1 text-xs border rounded transition-colors ${createCustomerOption === true
                                                                        ? 'border-teal-600 bg-teal-600 text-white font-medium'
                                                                        : 'border-teal-300 text-teal-600 bg-white hover:bg-teal-50'
                                                                        }`}
                                                                >
                                                                    Yes
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setCreateCustomerOption(false)}
                                                                    className={`px-4 py-1 text-xs border rounded transition-colors ${createCustomerOption === false
                                                                        ? 'border-teal-600 bg-teal-600 text-white font-medium'
                                                                        : 'border-teal-300 text-teal-600 bg-white hover:bg-teal-50'
                                                                        }`}
                                                                >
                                                                    No
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <div className="col-span-1">
                                            <label className="label-text">
                                                TCS Applicable?
                                            </label>
                                            <div className="flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setTcsApplicable(true)}
                                                    className={`px-6 py-1.5 text-sm border-2 rounded focus:outline-none transition-colors ${tcsApplicable
                                                        ? 'border-teal-500 bg-teal-50 text-teal-700 font-medium'
                                                        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                                                        }`}
                                                >
                                                    Yes
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setTcsApplicable(false)}
                                                    className={`px-6 py-1.5 text-sm border-2 rounded focus:outline-none transition-colors ${!tcsApplicable
                                                        ? 'border-teal-500 bg-teal-50 text-teal-700 font-medium'
                                                        : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                                                        }`}
                                                >
                                                    No
                                                </button>
                                            </div>
                                        </div>

                                    </div>




                                    {/* Action Buttons */}

                                    <div className="flex justify-between pt-4">
                                        <button
                                            type="button"
                                            onClick={() => setActiveMasterSubTab('Vendor Creation')}
                                            className="px-6 py-2 border border-slate-200 text-sm font-semibold rounded-[4px] shadow-none border border-slate-200 text-gray-700 bg-white hover:bg-gray-50 focus:outline-none uppercase tracking-wider"
                                        >
                                            BACK TO VENDOR CREATION HUB
                                        </button>
                                        <button
                                            type="submit"
                                            className="px-6 py-2 border border-transparent text-sm font-medium rounded-[4px] shadow-none border border-slate-200 text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none"
                                        >
                                            Next
                                        </button>
                                    </div>
                                </form>
                            </div>
                        )}



                        {activeMasterSubTab === 'Branch details' && (
                            <div className="p-6">
                                <div className="mb-6">
                                    <button
                                        onClick={() => setActiveMasterSubTab('Vendor Creation')}
                                        className="text-indigo-600 hover:text-indigo-800 text-xs font-semibold flex items-center gap-1 uppercase tracking-wider mb-4"
                                    >
                                        <ChevronDown className="w-4 h-4 rotate-90" /> BACK TO VENDOR CREATION HUB
                                    </button>
                                    <div className="flex justify-between items-center">
                                        <h3 className="text-xl font-bold text-gray-900">Branch details</h3>
                                        <button
                                            type="button"
                                            onClick={handleAddGstRecord}
                                            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-[4px] hover:bg-indigo-700 transition-colors flex items-center gap-2 shadow-none border border-slate-200"
                                        >
                                            <Plus className="w-4 h-4" /> Add Branch Record
                                        </button>
                                    </div>
                                </div>
                                <form className="space-y-8" onSubmit={handleGSTDetailsSubmit}>
                                    {gstRecords.map((record, index) => (
                                        <div key={record.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                                            {/* GSTIN Accordion Header */}
                                            <div className="flex justify-between items-center cursor-pointer mb-4" onClick={() => toggleGstExpand(record.id)}>
                                                <div className="flex items-center gap-2">
                                                    <svg className={`w-5 h-5 transition-transform ${record.isExpanded ? 'transform rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                    </svg>
                                                    <h4 className="font-medium text-gray-800">GSTIN #{index + 1} {record.gstin ? `- ${record.gstin}` : ''}</h4>
                                                </div>
                                                {index > 0 && (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => { e.stopPropagation(); handleRemoveGstRecord(record.id); }}
                                                        className="text-red-500 hover:text-red-700 text-sm"
                                                    >
                                                        Remove
                                                    </button>
                                                )}
                                            </div>

                                            {/* GSTIN Body */}
                                            {record.isExpanded && (
                                                <div className="space-y-6 pl-4 border-l-2 border-slate-100">

                                                    {/* GSTIN & Fetch */}
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                        <div>
                                                            <label className="label-text">GSTIN</label>
                                                            <div className="flex gap-2">
                                                                <input
                                                                    type="text"
                                                                    value={record.gstin}
                                                                    onChange={(e) => handleGstChange(record.id, 'gstin', e.target.value)}
                                                                    className="flex-1 px-4 py-2 border border-slate-200 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100"
                                                                    placeholder="22AAAAA0000A1Z5"
                                                                    disabled={record.registrationType === 'Unregistered'}
                                                                    maxLength={15}
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleFetchGstDetails(record.id)}
                                                                    disabled={record.registrationType === 'Unregistered' || loadingGstFetch || !record.gstin}
                                                                    className="px-4 py-2 border border-indigo-500 text-indigo-600 rounded-[4px] hover:bg-indigo-50/50 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                                                                >
                                                                    {loadingGstFetch ? 'Fetching...' : 'Fetch Branch Details'}
                                                                </button>
                                                            </div>
                                                        </div>

                                                        <div>
                                                            <label className="label-text">Registration Type</label>
                                                            <select
                                                                value={record.registrationType}
                                                                onChange={(e) => handleGstChange(record.id, 'registrationType', e.target.value)}
                                                                className="w-full px-4 py-2 border border-slate-200 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                            >
                                                                <option value="Regular">Regular</option>
                                                                <option value="Composition">Composition</option>
                                                                <option value="SEZ">Special Economic Zone (SEZ)</option>
                                                                <option value="Unregistered">Unregistered</option>
                                                            </select>
                                                        </div>

                                                        {record.registrationType !== 'Unregistered' && (
                                                            <>
                                                                <div>
                                                                    <label className="label-text">Legal Name</label>
                                                                    <input
                                                                        type="text"
                                                                        value={record.legalName || ''}
                                                                        readOnly
                                                                        className="w-full px-4 py-2 border border-slate-200 rounded-[4px] bg-gray-100 cursor-not-allowed"
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="label-text">Trade Name</label>
                                                                    <input
                                                                        type="text"
                                                                        value={record.tradeName || ''}
                                                                        readOnly
                                                                        className="w-full px-4 py-2 border border-slate-200 rounded-[4px] bg-gray-100 cursor-not-allowed"
                                                                    />
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                    {/* Places of Business */}
                                                    <div className="mt-6">
                                                        <h5 className="font-medium text-gray-700 mb-3 flex items-center justify-between">
                                                            <span>Places of Business</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleAddPob(record.id)}
                                                                className="text-xs font-medium text-indigo-600 hover:text-slate-700 border border-indigo-600 rounded px-2 py-1 hover:bg-indigo-50/50 transition-colors"
                                                            >
                                                                + Add Manual Branch
                                                            </button>
                                                        </h5>

                                                        {
                                                            record.placesOfBusiness.length > 0 ? (
                                                                <div className="space-y-4">
                                                                    {record.placesOfBusiness.map((pob, pIndex) => (
                                                                        <div key={pob.id} className="border border-slate-200 rounded p-3 bg-white">
                                                                            {/* POB Accordion */}
                                                                            <div className="flex justify-between items-center cursor-pointer" onClick={() => togglePobExpand(record.id, pob.id)}>
                                                                                <div className="flex items-center gap-2">
                                                                                    <svg className={`w-4 h-4 transition-transform ${pob.isExpanded ? 'transform rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                                                    </svg>
                                                                                    <span className="font-medium text-sm text-gray-800">{pob.referenceName || `Branch ${pIndex + 1}`} - {[pob.addressLine1, pob.addressLine2, pob.addressLine3].filter(Boolean).join(', ')}</span>
                                                                                </div>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={(e) => { e.stopPropagation(); handleRemovePob(record.id, pob.id); }}
                                                                                    className="text-red-500 hover:text-red-700 text-xs px-2 border border-transparent hover:border-red-200 rounded"
                                                                                >
                                                                                    Remove
                                                                                </button>
                                                                            </div>

                                                                            {/* POB Fields */}
                                                                            {pob.isExpanded && (
                                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                                                                                    <div>
                                                                                        <label className="label-text mb-1 uppercase">Reference Name</label>
                                                                                        <input type="text" value={pob.referenceName} onChange={(e) => updatePobField(record.id, pob.id, 'referenceName', e.target.value)} className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm" />
                                                                                    </div>
                                                                                    <div className="col-span-1 md:col-span-2">
                                                                                        <label className="label-text mb-1 uppercase">Address Line 1</label>
                                                                                        <input type="text" value={pob.addressLine1 || ''} onChange={(e) => updatePobField(record.id, pob.id, 'addressLine1', e.target.value)} className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm" placeholder="Enter address line 1" />
                                                                                    </div>
                                                                                    <div className="col-span-1 md:col-span-2">
                                                                                        <label className="label-text mb-1 uppercase">Address Line 2</label>
                                                                                        <input type="text" value={pob.addressLine2 || ''} onChange={(e) => updatePobField(record.id, pob.id, 'addressLine2', e.target.value)} className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm" placeholder="Enter address line 2" />
                                                                                    </div>
                                                                                    <div className="col-span-1 md:col-span-2">
                                                                                        <label className="label-text mb-1 uppercase">Address Line 3</label>
                                                                                        <input type="text" value={pob.addressLine3 || ''} onChange={(e) => updatePobField(record.id, pob.id, 'addressLine3', e.target.value)} className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm" placeholder="Enter address line 3" />
                                                                                    </div>
                                                                                    <div>
                                                                                        <label className="label-text mb-1 uppercase">Country</label>
                                                                                        <select
                                                                                            className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm bg-white"
                                                                                            value={Country.getAllCountries().find(c => c.name === pob.country)?.isoCode || ''}
                                                                                            onChange={(e) => {
                                                                                                const countryCode = e.target.value;
                                                                                                const countryInfo = Country.getCountryByCode(countryCode);
                                                                                                updatePobField(record.id, pob.id, 'country', countryInfo?.name || '');
                                                                                                updatePobField(record.id, pob.id, 'state', '');
                                                                                                updatePobField(record.id, pob.id, 'city', '');
                                                                                            }}
                                                                                        >
                                                                                            <option value="">Select Country</option>
                                                                                            {Country.getAllCountries().map((country) => (
                                                                                                <option key={country.isoCode} value={country.isoCode}>
                                                                                                    {country.name}
                                                                                                </option>
                                                                                            ))}
                                                                                        </select>
                                                                                    </div>
                                                                                    <div>
                                                                                        <label className="label-text mb-1 uppercase">State</label>
                                                                                        <select
                                                                                            className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm bg-white"
                                                                                            value={(() => {
                                                                                                const countryCode = Country.getAllCountries().find(c => c.name === pob.country)?.isoCode;
                                                                                                if (!countryCode) return '';
                                                                                                return State.getStatesOfCountry(countryCode).find(s => s.name === pob.state)?.isoCode || '';
                                                                                            })()}
                                                                                            onChange={(e) => {
                                                                                                const countryCode = Country.getAllCountries().find(c => c.name === pob.country)?.isoCode;
                                                                                                const stateCode = e.target.value;
                                                                                                if (countryCode) {
                                                                                                    const stateInfo = State.getStatesOfCountry(countryCode).find(s => s.isoCode === stateCode);
                                                                                                    updatePobField(record.id, pob.id, 'state', stateInfo?.name || '');
                                                                                                    updatePobField(record.id, pob.id, 'city', '');
                                                                                                }
                                                                                            }}
                                                                                            disabled={!pob.country}
                                                                                        >
                                                                                            <option value="">Select State</option>
                                                                                            {(() => {
                                                                                                const countryCode = Country.getAllCountries().find(c => c.name === pob.country)?.isoCode;
                                                                                                return countryCode ? State.getStatesOfCountry(countryCode).map((state) => (
                                                                                                    <option key={state.isoCode} value={state.isoCode}>
                                                                                                        {state.name}
                                                                                                    </option>
                                                                                                )) : [];
                                                                                            })()}
                                                                                        </select>
                                                                                    </div>
                                                                                    <div>
                                                                                        <label className="label-text mb-1 uppercase">City</label>
                                                                                        {(() => {
                                                                                            const countryCode = Country.getAllCountries().find(c => c.name === pob.country)?.isoCode;
                                                                                            const stateCode = countryCode ? State.getStatesOfCountry(countryCode).find(s => s.name === pob.state)?.isoCode : null;
                                                                                            const cities = (countryCode && stateCode) ? City.getCitiesOfState(countryCode, stateCode) : [];

                                                                                            return cities.length > 0 ? (
                                                                                                <select
                                                                                                    className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm bg-white"
                                                                                                    value={pob.city || ''}
                                                                                                    onChange={(e) => updatePobField(record.id, pob.id, 'city', e.target.value)}
                                                                                                >
                                                                                                    <option value="">Select City</option>
                                                                                                    {cities.map((city) => (
                                                                                                        <option key={city.name} value={city.name}>
                                                                                                            {city.name}
                                                                                                        </option>
                                                                                                    ))}
                                                                                                </select>
                                                                                            ) : (
                                                                                                <input
                                                                                                    type="text"
                                                                                                    value={pob.city || ''}
                                                                                                    onChange={(e) => updatePobField(record.id, pob.id, 'city', e.target.value)}
                                                                                                    className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm"
                                                                                                    placeholder="Enter city"
                                                                                                />
                                                                                            );
                                                                                        })()}
                                                                                    </div>
                                                                                    <div>
                                                                                        <label className="label-text mb-1 uppercase">Pincode</label>
                                                                                        <input
                                                                                            type="text"
                                                                                            value={pob.pincode || ''}
                                                                                            onChange={(e) => {
                                                                                                const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                                                                                                updatePobField(record.id, pob.id, 'pincode', val);
                                                                                            }}
                                                                                            className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm"
                                                                                            placeholder="6-digit pincode"
                                                                                            maxLength={6}
                                                                                        />
                                                                                    </div>
                                                                                    <div>
                                                                                        <label className="label-text mb-1 uppercase">Contact Person</label>
                                                                                        <input type="text" value={pob.contactPerson} onChange={(e) => updatePobField(record.id, pob.id, 'contactPerson', e.target.value)} className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm" />
                                                                                    </div>
                                                                                    <div>
                                                                                        <label className="label-text mb-1 uppercase">Email Address</label>
                                                                                        <input
                                                                                            type="text"
                                                                                            value={pob.email}
                                                                                            onChange={(e) => updatePobField(record.id, pob.id, 'email', e.target.value)}
                                                                                            className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm"
                                                                                            placeholder="branch@example.com"
                                                                                        />
                                                                                    </div>
                                                                                    <div>
                                                                                        <label className="label-text mb-1 uppercase">Contact No</label>
                                                                                        <input
                                                                                            type="text"
                                                                                            value={pob.contactNumber}
                                                                                            onChange={(e) => {
                                                                                                const val = e.target.value.replace(/\D/g, '');
                                                                                                updatePobField(record.id, pob.id, 'contactNumber', val);
                                                                                            }}
                                                                                            className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm"
                                                                                            placeholder="Numeric only"
                                                                                        />
                                                                                    </div>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            ) : (
                                                                <div className="p-4 bg-gray-50 border border-slate-200 rounded text-sm text-gray-500 text-center">
                                                                    {record.registrationType === 'Unregistered' ?
                                                                        'Add a branch manually to continue.' :
                                                                        'No places of business found. Fetch via GSTIN or add manually.'
                                                                    }
                                                                </div>
                                                            )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))
                                    }

                                    <div className="flex justify-between pt-4">
                                        <button
                                            type="button"
                                            onClick={() => setActiveMasterSubTab('Vendor Creation')}
                                            className="px-6 py-2 border border-slate-200 text-sm font-semibold rounded-[4px] shadow-none border border-slate-200 text-gray-700 bg-white hover:bg-gray-50 focus:outline-none uppercase tracking-wider"
                                        >
                                            BACK TO VENDOR CREATION HUB
                                        </button>
                                        <button
                                            type="submit"
                                            className="px-6 py-2 border border-transparent text-sm font-medium rounded-[4px] shadow-none border border-slate-200 text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none"
                                        >
                                            Next
                                        </button>
                                    </div>

                                </form>
                            </div >
                        )}

                        {
                            activeMasterSubTab === 'TDS & Other Statutory' && (
                                <div className="p-6">
                                    <div className="mb-6">
                                        <button
                                            onClick={() => setActiveMasterSubTab('Vendor Creation')}
                                            className="text-indigo-600 hover:text-indigo-800 text-xs font-semibold flex items-center gap-1 uppercase tracking-wider mb-4"
                                        >
                                            <ChevronDown className="w-4 h-4 rotate-90" /> BACK TO VENDOR CREATION HUB
                                        </button>
                                        <h3 className="text-xl font-bold text-gray-900">TDS & Other Statutory</h3>
                                    </div>
                                    <form onSubmit={handleTDSDetailsSubmit} className="space-y-6">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div>
                                                <label className="label-text">
                                                    MSME Udyam No
                                                </label>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={msmeUdyamNo}
                                                        onChange={(e) => {
                                                            // Alphanumeric with hyphen, specific format: UDHYAM-TN-0123456
                                                            const value = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
                                                            setMsmeUdyamNo(value);
                                                        }}
                                                        placeholder="UDHYAM-TN-0123456"
                                                        className="flex-1 px-4 py-2 border border-slate-200 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                    />
                                                    <input
                                                        type="file"
                                                        id="msme-file-upload"
                                                        className="hidden"
                                                        accept=".pdf,.jpg,.jpeg,.png"
                                                        onChange={(e) => handleFileUpload('msmeFile', e.target.files?.[0] || null)}
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => document.getElementById('msme-file-upload')?.click()}
                                                        className="px-4 py-2 bg-indigo-50/50 border border-indigo-300 rounded-[4px] hover:bg-indigo-50 transition-colors flex items-center gap-2 text-slate-700"
                                                        title="Upload MSME Registration Certificate"
                                                    >
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                                        </svg>
                                                    </button>
                                                </div>
                                                {uploadedFiles.msmeFile && (
                                                    <p className="mt-1 text-xs text-indigo-600">? {uploadedFiles.msmeFile.name}</p>
                                                )}
                                            </div>
                                            <div>
                                                <label className="label-text">
                                                    FSSAI License No
                                                </label>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={fssaiLicenseNo}
                                                        onChange={(e) => {
                                                            // 14 digit numeric code
                                                            const value = e.target.value.replace(/[^0-9]/g, '');
                                                            if (value.length <= 14) {
                                                                setFssaiLicenseNo(value);
                                                            }
                                                        }}
                                                        placeholder="14-digit numeric code"
                                                        maxLength={14}
                                                        className="flex-1 px-4 py-2 border border-slate-200 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                    />
                                                    <input
                                                        type="file"
                                                        id="fssai-file-upload"
                                                        className="hidden"
                                                        accept=".pdf,.jpg,.jpeg,.png"
                                                        onChange={(e) => handleFileUpload('fssaiFile', e.target.files?.[0] || null)}
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => document.getElementById('fssai-file-upload')?.click()}
                                                        className="px-4 py-2 bg-indigo-50/50 border border-indigo-300 rounded-[4px] hover:bg-indigo-50 transition-colors flex items-center gap-2 text-slate-700"
                                                        title="Upload FSSAI License / Registration Certificate"
                                                    >
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                                        </svg>
                                                    </button>
                                                </div>
                                                {uploadedFiles.fssaiFile && (
                                                    <p className="mt-1 text-xs text-indigo-600">? {uploadedFiles.fssaiFile.name}</p>
                                                )}
                                            </div>
                                            <div>
                                                <label className="label-text">
                                                    Import Export Code (IEC)
                                                </label>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={importExportCode}
                                                        onChange={(e) => {
                                                            // Alphanumeric similar to PAN (5 Letters, 4 Numbers, 1 Letter)
                                                            const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                                                            if (value.length <= 10) {
                                                                setImportExportCode(value);
                                                            }
                                                        }}
                                                        placeholder="ABCDE1234F"
                                                        maxLength={10}
                                                        className="flex-1 px-4 py-2 border border-slate-200 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                    />
                                                    <input
                                                        type="file"
                                                        id="iec-file-upload"
                                                        className="hidden"
                                                        accept=".pdf,.jpg,.jpeg,.png"
                                                        onChange={(e) => handleFileUpload('iecFile', e.target.files?.[0] || null)}
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => document.getElementById('iec-file-upload')?.click()}
                                                        className="px-4 py-2 bg-indigo-50/50 border border-indigo-300 rounded-[4px] hover:bg-indigo-50 transition-colors flex items-center gap-2 text-slate-700"
                                                        title="Upload IEC Certificate"
                                                    >
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                                        </svg>
                                                    </button>
                                                </div>
                                                {uploadedFiles.iecFile && (
                                                    <p className="mt-1 text-xs text-indigo-600">? {uploadedFiles.iecFile.name}</p>
                                                )}
                                            </div>
                                            <div>
                                                <label className="label-text">
                                                    EOU Status
                                                </label>
                                                <div className="flex gap-2">
                                                    <select
                                                        value={eouStatus}
                                                        onChange={(e) => setEouStatus(e.target.value)}
                                                        className="flex-1 px-4 py-2 border border-slate-200 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                    >
                                                        <option value="">Select Status</option>
                                                        <option value="EOU">EOU (Export Oriented Unit)</option>
                                                        <option value="STPI">STPI Unit</option>
                                                        <option value="SEZ">SEZ Unit</option>
                                                        <option value="Non-EOU">Non-EOU</option>
                                                    </select>
                                                    <input
                                                        type="file"
                                                        id="eou-file-upload"
                                                        className="hidden"
                                                        accept=".pdf,.jpg,.jpeg,.png"
                                                        onChange={(e) => handleFileUpload('eouFile', e.target.files?.[0] || null)}
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => document.getElementById('eou-file-upload')?.click()}
                                                        className="px-4 py-2 bg-indigo-50/50 border border-indigo-300 rounded-[4px] hover:bg-indigo-50 transition-colors flex items-center gap-2 text-slate-700"
                                                        title="Upload EOU/STPI/SEZ Certificate"
                                                    >
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                                        </svg>
                                                    </button>
                                                </div>
                                                {uploadedFiles.eouFile && (
                                                    <p className="mt-1 text-xs text-indigo-600">📄 {uploadedFiles.eouFile.name}</p>
                                                )}
                                            </div>
                                        </div>

                                        {/* Tax Type — mutually exclusive selector */}
                                        <div className="space-y-3">
                                            <label className="label-text">Tax Deducted / Collected at Source</label>
                                            <div className="flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => { setTaxApplicableType('TDS'); setTcsSectionApplicable(''); }}
                                                    className={`px-6 py-2 text-sm font-semibold rounded-[4px] border transition-colors ${taxApplicableType === 'TDS'
                                                        ? 'bg-indigo-600 text-white border-indigo-600'
                                                        : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'
                                                        }`}
                                                >TDS</button>
                                                <button
                                                    type="button"
                                                    onClick={() => { setTaxApplicableType('TCS'); setTdsSectionApplicable(''); }}
                                                    className={`px-6 py-2 text-sm font-semibold rounded-[4px] border transition-colors ${taxApplicableType === 'TCS'
                                                        ? 'bg-emerald-600 text-white border-emerald-600'
                                                        : 'bg-white text-gray-600 border-gray-300 hover:border-emerald-400'
                                                        }`}
                                                >TCS</button>
                                                <button
                                                    type="button"
                                                    onClick={() => { setTaxApplicableType(''); setTdsSectionApplicable(''); setTcsSectionApplicable(''); }}
                                                    className={`px-6 py-2 text-sm font-semibold rounded-[4px] border transition-colors ${taxApplicableType === ''
                                                        ? 'bg-gray-500 text-white border-gray-500'
                                                        : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                                                        }`}
                                                >None</button>
                                            </div>

                                            {/* TDS Section dropdown */}
                                            {taxApplicableType === 'TDS' && (
                                                <div className="space-y-2">
                                                    <label className="label-text">TDS Section Applicable</label>
                                                    <select
                                                        value={tdsSectionApplicable}
                                                        onChange={(e) => setTdsSectionApplicable(e.target.value)}
                                                        className="w-full px-4 py-2 border border-slate-200 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                                    >
                                                        <option value="">Select TDS Section</option>
                                                        <option value="Section 194C - Individual/HUF">Section 194C - Contracts - Individual/HUF</option>
                                                        <option value="Section 194C - Others">Section 194C - Contracts - Others</option>
                                                        <option value="Section 194H">Section 194H - Commission/Brokerage</option>
                                                        <option value="Section 194-I - Rent- Land, Building, Furniture &amp; fitting">Section 194-I - Rent- Land, Building, Furniture &amp; fitting</option>
                                                        <option value="Section 194-I - Rent- Plant &amp; Machinery, Equipment">Section 194-I - Rent- Plant &amp; Machinery, Equipment</option>
                                                        <option value="Section 194J - Technical Services">Section 194J - Technical Services</option>
                                                        <option value="Section 194J - Professional Services">Section 194J - Professional Services</option>
                                                        <option value="Section 194J - Director's Remuneration">Section 194J - Director's Remuneration</option>
                                                        <option value="Section 194Q">Section 194Q - Purchase of Goods</option>
                                                        <option value="Section 194A">Section 194A - Interest other than interest on securities</option>
                                                        <option value="Section 194R">Section 194R - Benefit or Perquisite</option>
                                                        <option value="Section 194-IA">Section 194-IA - Immovable Property Transfer</option>
                                                        <option value="Section 194-IB">Section 194-IB - Rent by Individual or HUF</option>
                                                        <option value="Section 194-IC">Section 194-IC - Joint Development Agreements</option>
                                                        <option value="Section 194M">Section 194M - Contractors &amp; Professionals</option>
                                                        <option value="Section 194-O">Section 194-O - E-Commerce</option>
                                                        <option value="Section 195">Section 195 - Payment to Non-Residents</option>
                                                    </select>
                                                    {tdsSectionApplicable && (() => {
                                                        const rateInfo = getTDSRateInfo(tdsSectionApplicable);
                                                        return rateInfo ? (
                                                            <div className="p-4 bg-slate-50/50 border-l-4 border-indigo-500 rounded-[4px]">
                                                                <div className="flex items-start gap-3">
                                                                    <svg className="w-5 h-5 text-indigo-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                                    </svg>
                                                                    <div className="flex-1">
                                                                        <h4 className="section-title mb-1">TDS Rate Information</h4>
                                                                        <div className="space-y-1 text-sm text-slate-700">
                                                                            <p><span className="font-medium">TDS Rate:</span> {rateInfo.tdsRate}</p>
                                                                            <p><span className="font-medium">Penalty Rate:</span> {rateInfo.penaltyRate}</p>
                                                                            <p className="mt-1 text-xs text-indigo-600 italic">{rateInfo.description}</p>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ) : null;
                                                    })()}
                                                </div>
                                            )}

                                            {/* TCS Section dropdown */}
                                            {taxApplicableType === 'TCS' && (
                                                <div className="space-y-2">
                                                    <label className="label-text">TCS Section Applicable</label>
                                                    <select
                                                        value={tcsSectionApplicable}
                                                        onChange={(e) => setTcsSectionApplicable(e.target.value)}
                                                        className="w-full px-4 py-2 border border-slate-200 rounded-[4px] focus:ring-emerald-500 focus:border-emerald-500 bg-white"
                                                    >
                                                        <option value="">Select TCS Section</option>
                                                        <option value="Section 206C(1) - Sale of Scrap, Alcoholic Liquor, Minerals">Section 206C(1) - Sale of Scrap, Alcoholic Liquor, Minerals</option>
                                                        <option value="Section 206C(1) - Sale of Tendu Leaves">Section 206C(1) - Sale of Tendu Leaves</option>
                                                        <option value="Section 206C(1) - Sale of Forest Produce">Section 206C(1) - Sale of Forest Produce</option>
                                                        <option value="Section 206C(1) - Sale of Timber">Section 206C(1) - Sale of Timber</option>
                                                        <option value="Section 206C(1F) - Sale of Motor Vehicles">Section 206C(1F) - Sale of Motor Vehicles</option>
                                                        <option value="Section 206C(1F) - Sale of Specified Luxury Goods">Section 206C(1F) - Sale of Specified Luxury Goods</option>
                                                    </select>
                                                    {tcsSectionApplicable && (() => {
                                                        const tcsInfo = getTCSRateInfo(tcsSectionApplicable);
                                                        return tcsInfo ? (
                                                            <div className="p-4 bg-emerald-50/60 border-l-4 border-emerald-500 rounded-[4px]">
                                                                <div className="flex items-start gap-3">
                                                                    <svg className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                                    </svg>
                                                                    <div className="flex-1">
                                                                        <h4 className="section-title mb-1">TCS Rate Information</h4>
                                                                        <div className="space-y-1 text-sm text-slate-700">
                                                                            <p><span className="font-medium">TCS Rate:</span> {tcsInfo.tcsRate}</p>
                                                                            <p><span className="font-medium">Penalty Rate:</span> {tcsInfo.penaltyRate}</p>
                                                                            <p className="mt-1 text-xs text-emerald-600 italic">{tcsInfo.description}</p>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ) : null;
                                                    })()}
                                                </div>
                                            )}
                                        </div>


                                        {/* Enable automatic TDS Posting Checkbox */}
                                        <div className="flex items-center gap-2 pt-2">
                                            <input
                                                type="checkbox"
                                                id="enableAutomaticTDS"
                                                checked={enableAutomaticTdsPosting}
                                                onChange={(e) => setEnableAutomaticTdsPosting(e.target.checked)}
                                                className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                                            />
                                            <label htmlFor="enableAutomaticTDS" className="text-sm font-medium text-gray-700">
                                                Enable automatic TDS Posting
                                            </label>
                                        </div>

                                        <div>
                                            <label className="label-text">
                                                Dispute Redressal Terms
                                            </label>
                                            <textarea
                                                rows={3}
                                                value={disputeRedressalTerms}
                                                onChange={(e) => setDisputeRedressalTerms(e.target.value)}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-teal-500 focus:border-teal-500"
                                                placeholder="Enter dispute redressal terms..."
                                            />
                                        </div>

                                        <div className="flex justify-between pt-4">
                                            <button
                                                type="button"
                                                onClick={() => setActiveMasterSubTab('Vendor Creation')}
                                                className="px-6 py-2 border border-slate-200 text-sm font-semibold rounded-[4px] shadow-none border border-slate-200 text-gray-700 bg-white hover:bg-gray-50 focus:outline-none uppercase tracking-wider"
                                            >
                                                BACK TO VENDOR CREATION HUB
                                            </button>
                                            <button
                                                type="submit"
                                                className="px-6 py-2 border border-transparent text-sm font-medium rounded-[4px] shadow-none border border-slate-200 text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none"
                                            >
                                                Next
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            )
                        }

                        {
                            activeMasterSubTab === 'Products/Services' && (
                                <div className="p-6">
                                    <div className="mb-6">
                                        <button
                                            onClick={() => setActiveMasterSubTab('Vendor Creation')}
                                            className="text-indigo-600 hover:text-indigo-800 text-xs font-semibold flex items-center gap-1 uppercase tracking-wider mb-4"
                                        >
                                            <ChevronDown className="w-4 h-4 rotate-90" /> BACK TO VENDOR CREATION HUB
                                        </button>
                                        <h3 className="text-xl font-bold text-gray-900">Products/Services</h3>
                                    </div>
                                    <div className="space-y-6">
                                        {/* Table for Items */}
                                        <div className="overflow-x-auto">
                                            <table className="min-w-full border border-slate-200">
                                                <thead className="bg-gray-50">
                                                    <tr>
                                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider border-r border-gray-200">
                                                            No
                                                        </th>
                                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider border-r border-gray-200">
                                                            HSN / SAC Code
                                                        </th>
                                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider border-r border-gray-200">
                                                            Item Code
                                                        </th>
                                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider border-r border-gray-200">
                                                            Item Name
                                                        </th>
                                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider border-r border-gray-200">
                                                            Supplier Item Code
                                                        </th>
                                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider border-r border-gray-200">
                                                            Supplier Item Name
                                                        </th>
                                                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider">
                                                            Action
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody className="bg-white divide-y divide-gray-200">
                                                    {items.map((item, index) => (
                                                        <tr key={item.id} className="hover:bg-gray-50">
                                                            <td className="px-4 py-3 text-sm text-gray-900 border-r border-gray-200">
                                                                {index + 1}.
                                                            </td>
                                                            <td className="px-4 py-3 border-r border-gray-200">
                                                                <input
                                                                    type="text"
                                                                    className="w-full px-2 py-1 border border-slate-200 rounded text-sm focus:ring-indigo-500 focus:border-indigo-500"
                                                                    placeholder="HSN / SAC Code"
                                                                    value={item.hsnSacCode}
                                                                    onChange={(e) => handleItemChange(item.id, 'hsnSacCode', e.target.value)}
                                                                />
                                                            </td>
                                                            <td className="px-4 py-3 border-r border-gray-200 min-w-[200px]">
                                                                <select
                                                                    className="w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                                                                    value={item.itemCode || ''}
                                                                    onChange={(e) => handleItemChange(item.id, 'itemCode', e.target.value)}
                                                                >
                                                                    <option value="">Select Item Code</option>
                                                                    {inventoryItems.map(i => (
                                                                        <option key={i.id} value={i.item_code}>
                                                                            {i.item_code}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </td>
                                                            <td className="px-4 py-3 border-r border-gray-200 min-w-[250px]">
                                                                <select
                                                                    className="w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white"
                                                                    value={item.itemName || ''}
                                                                    onChange={(e) => handleItemChange(item.id, 'itemName', e.target.value)}
                                                                >
                                                                    <option value="">Select Item Name</option>
                                                                    {inventoryItems.map(i => (
                                                                        <option key={i.id} value={i.item_name}>
                                                                            {i.item_name}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </td>
                                                            <td className="px-4 py-3 border-r border-gray-200">
                                                                <input
                                                                    type="text"
                                                                    className="w-full px-2 py-1 border border-slate-200 rounded text-sm focus:ring-indigo-500 focus:border-indigo-500"
                                                                    placeholder="Supplier Code"
                                                                    value={item.supplierItemCode}
                                                                    onChange={(e) => handleItemChange(item.id, 'supplierItemCode', e.target.value)}
                                                                />
                                                            </td>
                                                            <td className="px-4 py-3 border-r border-gray-200">
                                                                <input
                                                                    type="text"
                                                                    className="w-full px-2 py-1 border border-slate-200 rounded text-sm focus:ring-indigo-500 focus:border-indigo-500"
                                                                    placeholder="Supplier Item Name"
                                                                    value={item.supplierItemName}
                                                                    onChange={(e) => handleItemChange(item.id, 'supplierItemName', e.target.value)}
                                                                />
                                                            </td>
                                                            <td className="px-4 py-3 text-center">
                                                                <div className="flex items-center justify-center gap-2">
                                                                    {/* Delete Button */}
                                                                    <button
                                                                        type="button"
                                                                        className="text-red-600 hover:text-red-900"
                                                                        title="Delete item"
                                                                        onClick={() => handleRemoveItem(item.id)}
                                                                    >
                                                                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                                                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                                                        </svg>
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>

                                        {/* Add More Button */}
                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                className="flex items-center gap-2 px-4 py-2 border-2 border-indigo-500 text-indigo-600 rounded-[4px] hover:bg-indigo-50/50 focus:outline-none"
                                                onClick={handleAddItem}
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                                </svg>
                                                <span className="text-sm font-medium">Add More Items</span>
                                            </button>
                                        </div>

                                        {/* Next Button */}
                                        <div className="flex justify-between pt-4">
                                            <button
                                                type="button"
                                                onClick={() => setActiveMasterSubTab('Vendor Creation')}
                                                className="px-6 py-2 border border-slate-200 text-sm font-semibold rounded-[4px] shadow-none border border-slate-200 text-gray-700 bg-white hover:bg-gray-50 focus:outline-none uppercase tracking-wider"
                                            >
                                                BACK TO VENDOR CREATION HUB
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleProductServicesSubmit}
                                                className="px-8 py-2 border border-transparent text-sm font-medium rounded-[4px] shadow-none border border-slate-200 text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none"
                                            >
                                                Next
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )
                        }

                        {
                            activeMasterSubTab === 'Banking Info' && (
                                <div className="p-6">
                                    <div className="mb-6">
                                        <button
                                            onClick={() => setActiveMasterSubTab('Vendor Creation')}
                                            className="text-indigo-600 hover:text-indigo-800 text-xs font-semibold flex items-center gap-1 uppercase tracking-wider mb-4"
                                        >
                                            <ChevronDown className="w-4 h-4 rotate-90" /> BACK TO VENDOR CREATION HUB
                                        </button>
                                        <h3 className="text-xl font-bold text-gray-900">Banking Information</h3>
                                    </div>
                                    <form onSubmit={handleBankingDetailsSubmit} className="space-y-6">
                                        <div className="space-y-8">
                                            {bankAccounts.map((bank, index) => (
                                                <div key={bank.id} className={`space-y-6 ${index > 0 ? 'pt-8 border-t border-gray-200' : ''}`}>
                                                    {index > 0 && (
                                                        <div className="flex justify-between items-center">
                                                            <h4 className="text-md font-medium text-gray-900">Bank Account #{index + 1}</h4>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleRemoveBank(bank.id)}
                                                                className="text-red-600 hover:text-red-800 text-sm font-medium flex items-center gap-1"
                                                            >
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                </svg>
                                                                Remove
                                                            </button>
                                                        </div>
                                                    )}

                                                    <div>
                                                        <label className="label-text">
                                                            Bank account No.
                                                        </label>
                                                        <input
                                                            type="text"
                                                            className="w-full px-4 py-2 border border-slate-200 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                            value={bank.accountNumber}
                                                            onChange={(e) => {
                                                                const value = e.target.value.replace(/[^0-9]/g, '');
                                                                handleBankChange(bank.id, 'accountNumber', value);
                                                            }}
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="label-text">
                                                            Bank Name
                                                        </label>
                                                        <input
                                                            type="text"
                                                            className="w-full px-4 py-2 border border-slate-200 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                            value={bank.bankName}
                                                            onChange={(e) => {
                                                                const value = e.target.value.replace(/[^a-zA-Z\s]/g, '');
                                                                handleBankChange(bank.id, 'bankName', value);
                                                            }}
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="label-text">
                                                            IFSC Code
                                                        </label>
                                                        <input
                                                            type="text"
                                                            className="w-full px-4 py-2 border border-slate-200 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                            maxLength={11}
                                                            value={bank.ifscCode}
                                                            onChange={(e) => {
                                                                const ifsc = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                                                                handleBankChange(bank.id, 'ifscCode', ifsc);
                                                                if (ifsc.length === 11) {
                                                                    fetch(`https://ifsc.razorpay.com/${ifsc}`)
                                                                        .then(res => res.json())
                                                                        .then(data => {
                                                                            if (data && data.BANK) {
                                                                                const fetchedBank = data.BANK.trim();
                                                                                const fetchedBranch = data.BRANCH.trim();
                                                                                let mismatch = false;

                                                                                if (bank.bankName && bank.bankName.toUpperCase() !== fetchedBank.toUpperCase()) {
                                                                                    mismatch = true;
                                                                                }
                                                                                if (bank.branchName && bank.branchName.toUpperCase() !== fetchedBranch.toUpperCase()) {
                                                                                    mismatch = true;
                                                                                }

                                                                                if (mismatch) {
                                                                                    showError(`Bank Name, Branch Name, & IFSC Code mismatch. Suggested Branch: ${fetchedBranch}`);
                                                                                } else {
                                                                                    if (!bank.bankName) handleBankChange(bank.id, 'bankName', fetchedBank);
                                                                                    if (!bank.branchName) handleBankChange(bank.id, 'branchName', fetchedBranch);
                                                                                }
                                                                            } else {
                                                                                showError("Invalid IFSC Code");
                                                                            }
                                                                        })
                                                                        .catch(() => showError("Invalid IFSC Code"));
                                                                }
                                                            }}
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="label-text">
                                                            Branch Name
                                                        </label>
                                                        <input
                                                            type="text"
                                                            className="w-full px-4 py-2 border border-slate-200 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                            value={bank.branchName}
                                                            onChange={(e) => {
                                                                const value = e.target.value.replace(/[^a-zA-Z\s]/g, '');
                                                                handleBankChange(bank.id, 'branchName', value);
                                                            }}
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="label-text">
                                                            Swift Code
                                                        </label>
                                                        <input
                                                            type="text"
                                                            className="w-full px-4 py-2 border border-slate-200 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                            value={bank.swiftCode}
                                                            onChange={(e) => {
                                                                const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                                                                handleBankChange(bank.id, 'swiftCode', value);
                                                            }}
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="label-text">
                                                            Associate to a vendor branch
                                                        </label>
                                                        <div className="relative">
                                                            <button
                                                                type="button"
                                                                className="w-full px-4 py-2 border border-slate-200 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white text-left flex justify-between items-center"
                                                                onClick={() => {
                                                                    const dropdown = document.getElementById(`vendor-branch-dropdown-${bank.id}`);
                                                                    if (dropdown) {
                                                                        dropdown.classList.toggle('hidden');
                                                                    }
                                                                }}
                                                            >
                                                                <span className="truncate">
                                                                    {bank.vendorBranch && bank.vendorBranch.length > 0
                                                                        ? `${bank.vendorBranch.length} Selected`
                                                                        : "Select vendor branch"}
                                                                </span>
                                                                <ChevronDown className="w-4 h-4 text-gray-500" />
                                                            </button>

                                                            {/* Dropdown Content */}
                                                            <div
                                                                id={`vendor-branch-dropdown-${bank.id}`}
                                                                className="hidden absolute z-[100] mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm"
                                                            >
                                                                {(() => {
                                                                    // Combine all extracted reference names
                                                                    const liveBranches = (gstRecords || []).flatMap((record, rIdx) => {
                                                                        const branches = ((record && record.placesOfBusiness) || [])
                                                                            .map((pob, pIdx) => {
                                                                                const name = (pob.referenceName ||
                                                                                    (pob as any).reference_name ||
                                                                                    (pob as any).branch_name ||
                                                                                    (pob as any).branchName ||
                                                                                    (pob as any).branch_reference_name || '').trim();
                                                                                // If user added a branch but hasn't named it, give it a placeholder
                                                                                return name || `Branch ${pIdx + 1} (${record.gstin || 'New GST Record'})`;
                                                                            })
                                                                            .filter(name => name !== '');

                                                                        // If no specific branch reference names exist, use GSTIN or a record placeholder
                                                                        if (branches.length === 0) {
                                                                            return [record.gstin || record.tradeName || `GST Detail #${rIdx + 1}`];
                                                                        }
                                                                        return branches;
                                                                    });

                                                                    const dbBranches = (availableBranches || [])
                                                                        .map(b => (b.reference_name || b.referenceName || (b as any).branch_name || (b as any).branchName || b.gstin || '').trim())
                                                                        .filter(name => name !== '');

                                                                    const allBranches = [...new Set([...liveBranches, ...dbBranches])];

                                                                    if (allBranches.length === 0) {
                                                                        return (
                                                                            <div className="px-4 py-2 text-gray-500 text-xs italic">
                                                                                <div>No branch reference names found.</div>
                                                                            </div>
                                                                        );
                                                                    }

                                                                    return allBranches.map((branchName, idx) => (
                                                                        <div key={`${branchName}-${idx}`} className="flex items-center px-4 py-2 hover:bg-gray-100 cursor-pointer" onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            const currentBranches = Array.isArray(bank.vendorBranch) ? bank.vendorBranch : [];
                                                                            const isSelected = currentBranches.includes(branchName);
                                                                            let newBranches;
                                                                            if (isSelected) {
                                                                                newBranches = currentBranches.filter(b => b !== branchName);
                                                                            } else {
                                                                                newBranches = [...currentBranches, branchName];
                                                                            }
                                                                            handleBankChange(bank.id, 'vendorBranch', newBranches);
                                                                        }}>
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={(Array.isArray(bank.vendorBranch) ? bank.vendorBranch : []).includes(branchName)}
                                                                                onChange={() => { }}
                                                                                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded mr-3 pointer-events-none"
                                                                            />
                                                                            <span className="text-gray-900">{branchName}</span>
                                                                        </div>
                                                                    ));
                                                                })()}
                                                            </div>
                                                        </div>

                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Add Another Bank Button */}
                                        <div className="pt-2">
                                            <button
                                                type="button"
                                                className="flex items-center gap-2 px-4 py-2 border-2 border-indigo-500 text-indigo-600 rounded-[4px] hover:bg-indigo-50/50 focus:outline-none"
                                                onClick={handleAddBank}
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                                </svg>
                                                <span className="text-sm font-medium">Another Bank</span>
                                            </button>
                                        </div>

                                        {/* Next Button */}
                                        <div className="flex justify-between pt-4">
                                            <button
                                                type="button"
                                                onClick={() => setActiveMasterSubTab('TDS & Other Statutory')}
                                                className="px-6 py-2 border border-slate-200 text-sm font-medium rounded-[4px] shadow-none border border-slate-200 text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
                                            >
                                                Back
                                            </button>
                                            <button
                                                type="submit"
                                                className="px-8 py-2 border border-transparent text-sm font-medium rounded-[4px] shadow-none border border-slate-200 text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none"
                                            >
                                                Next
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            )
                        }

                        {
                            activeMasterSubTab === 'Terms & Conditions' && (
                                <div className="p-6">
                                    <div className="mb-6">
                                        <button
                                            onClick={() => setActiveMasterSubTab('Vendor Creation')}
                                            className="text-indigo-600 hover:text-indigo-800 text-xs font-semibold flex items-center gap-1 uppercase tracking-wider mb-4"
                                        >
                                            <ChevronDown className="w-4 h-4 rotate-90" /> BACK TO VENDOR CREATION HUB
                                        </button>
                                        <h3 className="text-xl font-bold text-gray-900">Terms & Conditions</h3>
                                    </div>
                                    <form onSubmit={handleFinish} className="space-y-6">
                                        <div>
                                            <label className="label-text">
                                                Credit Limit
                                            </label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={creditLimit}
                                                onChange={(e) => setCreditLimit(e.target.value)}
                                                className="w-full px-4 py-2 border border-slate-200 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                placeholder="0.00"
                                            />
                                        </div>

                                        <div>
                                            <label className="label-text">
                                                Credit Period (Days)
                                            </label>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    min={0}
                                                    step={1}
                                                    value={creditPeriod}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        // Allow only non-negative integers
                                                        if (val === '' || (/^\d+$/.test(val) && parseInt(val, 10) >= 0)) {
                                                            setCreditPeriod(val);
                                                        }
                                                    }}
                                                    onKeyDown={(e) => {
                                                        // Block decimal point, minus, and 'e'
                                                        if (['.', '-', '+', 'e', 'E'].includes(e.key)) e.preventDefault();
                                                    }}
                                                    className="w-full px-4 py-2 pr-14 border border-slate-200 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                    placeholder="e.g. 30"
                                                />
                                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none select-none">
                                                    days
                                                </span>
                                            </div>
                                        </div>

                                        <div>
                                            <label className="label-text">
                                                Credit Terms
                                            </label>
                                            <textarea
                                                rows={3}
                                                value={creditTerms}
                                                onChange={(e) => setCreditTerms(e.target.value)}
                                                className="w-full px-4 py-2 border border-slate-200 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                placeholder="Enter credit terms and conditions..."
                                            />
                                        </div>

                                        <div>
                                            <label className="label-text">
                                                Penalty Terms
                                            </label>
                                            <textarea
                                                rows={3}
                                                value={penaltyTerms}
                                                onChange={(e) => setPenaltyTerms(e.target.value)}
                                                className="w-full px-4 py-2 border border-slate-200 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                placeholder="Enter penalty terms for late payments or breaches..."
                                            />
                                        </div>

                                        <div>
                                            <label className="label-text">
                                                Delivery Terms
                                            </label>
                                            <textarea
                                                rows={3}
                                                value={deliveryTerms}
                                                onChange={(e) => setDeliveryTerms(e.target.value)}
                                                className="w-full px-4 py-2 border border-slate-200 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                placeholder="Delivery terms, lead time, shipping conditions..."
                                            />
                                        </div>

                                        <div>
                                            <label className="label-text">
                                                Warranty / Guarantee Details
                                            </label>
                                            <textarea
                                                rows={3}
                                                value={warrantyGuaranteeDetails}
                                                onChange={(e) => setWarrantyGuaranteeDetails(e.target.value)}
                                                className="w-full px-4 py-2 border border-slate-200 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                placeholder="Enter warranty and guarantee terms..."
                                            />
                                        </div>

                                        <div>
                                            <label className="label-text">
                                                Force Majeure
                                            </label>
                                            <textarea
                                                rows={3}
                                                value={forceMajeure}
                                                onChange={(e) => setForceMajeure(e.target.value)}
                                                className="w-full px-4 py-2 border border-slate-200 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                placeholder="Enter force majeure clauses..."
                                            />
                                        </div>

                                        <div>
                                            <label className="label-text">
                                                Dispute Redressal Terms
                                            </label>
                                            <textarea
                                                rows={3}
                                                value={disputeRedressalTerms}
                                                onChange={(e) => setDisputeRedressalTerms(e.target.value)}
                                                className="w-full px-4 py-2 border border-slate-200 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                placeholder="Enter dispute redressal terms..."
                                            />
                                        </div>

                                        <div className="flex justify-between pt-4">
                                            <button
                                                type="button"
                                                onClick={() => setActiveMasterSubTab('Vendor Creation')}
                                                className="px-6 py-2 border border-slate-200 text-sm font-semibold rounded-[4px] shadow-none border border-slate-200 text-gray-700 bg-white hover:bg-gray-50 focus:outline-none uppercase tracking-wider"
                                            >
                                                BACK TO VENDOR CREATION HUB
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleFinish()}
                                                disabled={isSubmitting}
                                                className={`px-6 py-2 border border-transparent text-sm font-medium rounded-[4px] shadow-none border border-slate-200 text-white focus:outline-none ${isSubmitting ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'
                                                    }`}
                                            >
                                                {isSubmitting ? 'Saving...' : 'Finish (Save)'}
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            )
                        }
                    </div >
                </>
            )}



            {
                activeTab === 'Transaction' && (
                    <div>
                        {/* Sub-tabs for Transaction */}
                        <div className="mb-6">
                            <nav className="flex space-x-8 border-b border-gray-200">
                                {['Purchase Orders', 'Procurement', 'Payment']
                                    .filter(subTab => isSuperuser || hasTabAccess('Vendor Portal', subTab))
                                    .map((subTab) => (
                                        <button
                                            key={subTab}
                                            onClick={() => setActiveTransactionSubTab(subTab as TransactionSubTab)}
                                            className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTransactionSubTab === subTab
                                                ? 'border-indigo-500 text-indigo-600'
                                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                                }`}
                                        >
                                            {subTab.toUpperCase()}
                                        </button>
                                    ))}
                            </nav>
                        </div>

                        <div className="p-6 erp-card">
                            {activeTransactionSubTab === 'Purchase Orders' && (
                                <div>
                                    {activePOSubTab === 'Dashboard' && (
                                        <div>
                                            <h3 className="section-title">Purchase Orders</h3>
                                            <p className="text-gray-600 mb-6">Select an option to manage purchase orders:</p>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                {['Create PO', 'Pending PO', 'Executed PO']
                                                    .filter(tab => isSuperuser || hasTabAccess('Vendor Portal', tab))
                                                    .map((tab) => {
                                                        const count = tab === 'Pending PO'
                                                            ? purchaseOrders.filter(po => ['Pending Approval', 'Approved', 'Mailed', 'Draft'].includes(po.status)).length
                                                            : tab === 'Executed PO'
                                                                ? purchaseOrders.filter(po => po.status === 'Closed').length
                                                                : 0;

                                                        return (
                                                            <button
                                                                key={tab}
                                                                onClick={() => setActivePOSubTab(tab as POSubTab)}
                                                                className="p-6 border-2 border-gray-200 rounded-[4px] hover:border-indigo-500 hover:bg-indigo-50/50 transition-all text-left group relative"
                                                            >
                                                                {count > 0 && (
                                                                    <span className="absolute -top-2 -right-2 bg-indigo-600 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg z-10">
                                                                        {count}
                                                                    </span>
                                                                )}
                                                                <div className="flex items-center justify-between mb-4">
                                                                    <div className={`p-3 rounded-[4px] ${tab === 'Create PO' ? 'bg-blue-100 text-indigo-600' :
                                                                        tab === 'Pending PO' ? 'bg-indigo-50 text-indigo-600' :
                                                                            'bg-slate-100 text-indigo-600'
                                                                        }`}>
                                                                        {/* Icons based on tab */}
                                                                        {tab === 'Create PO' && (
                                                                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                                                        )}
                                                                        {tab === 'Pending PO' && (
                                                                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                                        )}
                                                                        {tab === 'Executed PO' && (
                                                                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                                        )}
                                                                    </div>
                                                                    <svg className="w-5 h-5 text-gray-400 group-hover:text-indigo-500 transform group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                                                </div>
                                                                <div className="font-semibold text-gray-900 text-lg">{tab}</div>
                                                                <div className="helper-text mt-2">
                                                                    {tab === 'Create PO' ? 'Create new purchase orders' :
                                                                        tab === 'Pending PO' ? 'View and manage pending orders' :
                                                                            'History of completed orders'}
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                            </div>
                                        </div>
                                    )}

                                    {activePOSubTab !== 'Dashboard' && (
                                        <div>
                                            <div className="flex items-center gap-4 mb-6">
                                                <button
                                                    onClick={() => setActivePOSubTab('Dashboard')}
                                                    className="p-2 hover:bg-gray-100 rounded-[4px] transition-colors"
                                                    title="Back to Dashboard"
                                                >
                                                    <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                                                </button>
                                                <div>
                                                    <h3 className="section-title">{activePOSubTab}</h3>
                                                    <p className="helper-text">Manage your {activePOSubTab.toLowerCase()} details here.</p>
                                                </div>
                                            </div>

                                            {/* Content Placeholders */}
                                            {activePOSubTab === 'Create PO' && (
                                                <>
                                                    <div>
                                                        {/* Create PO Button */}
                                                        <div className="mb-6">
                                                            <button
                                                                onClick={() => {
                                                                    fetchPOSeries();
                                                                    setShowCreatePOModal(true);
                                                                }}
                                                                className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-[4px] shadow-none border border-slate-200 text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors">
                                                                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                                                </svg>
                                                                Create PO
                                                            </button>
                                                        </div>
                                                    </div>


                                                    {/* Sub-tabs for Create PO */}
                                                    <div className="mb-6">
                                                        <nav className="flex space-x-8 border-b border-gray-200">
                                                            {['Pending for Approval', 'Mail PO'].map((tab) => (
                                                                <button
                                                                    key={tab}
                                                                    onClick={() => setActiveCreatePOSubTab(tab as CreatePOSubTab)}
                                                                    className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeCreatePOSubTab === tab
                                                                        ? 'border-indigo-500 text-indigo-600'
                                                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                                                        }`}
                                                                >
                                                                    {tab.toUpperCase()}
                                                                </button>
                                                            ))}
                                                        </nav>
                                                    </div>

                                                    {/* Content for Create PO Sub-tabs */}
                                                    <div className="p-4 bg-gray-50 border border-slate-200 rounded-[4px]">

                                                        {activeCreatePOSubTab === 'Pending for Approval' && (
                                                            <div className="erp-card overflow-hidden border border-slate-200">
                                                                <table className="erp-table min-w-full">
                                                                    <thead className="bg-indigo-50/50">
                                                                        <tr>
                                                                            <th className="table-header">PO#</th>
                                                                            <th className="table-header">PO Date</th>
                                                                            <th className="table-header">Vendor Name</th>
                                                                            <th className="table-header">Branch</th>
                                                                            <th className="table-header">Delivery Date</th>
                                                                            <th className="table-header">Amount</th>
                                                                            <th className="px-6 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">Action</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="bg-white divide-y divide-gray-200">
                                                                        {purchaseOrders.filter(po => ['Pending Approval', 'Draft'].includes(po.status)).length === 0 ? (
                                                                            <tr>
                                                                                <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                                                                                    No purchase orders pending approval.
                                                                                </td>
                                                                            </tr>
                                                                        ) : (
                                                                            purchaseOrders.filter(po => ['Pending Approval', 'Draft'].includes(po.status)).map((po) => (
                                                                                <tr key={po.id} className="hover:bg-gray-50 transition-colors">
                                                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{po.poNumber}</td>
                                                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(po.poDate)}</td>
                                                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{po.vendorName}</td>
                                                                                    <td className="px-6 py-4 text-sm text-gray-500">{po.branch || '-'}</td>
                                                                                    <td className="px-6 py-4 text-sm text-gray-500">{po.deliveryDate ? formatDate(po.deliveryDate) : '-'}</td>
                                                                                    <td className="px-6 py-4 text-sm text-gray-500">{po.amount ? `₹${po.amount}` : '-'}</td>
                                                                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                                                        <button
                                                                                            onClick={() => handleApproveAndMail(po.id)}
                                                                                            className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                                                                                            title="Approve & Mail"
                                                                                        >
                                                                                            <span className="mr-1">Approve & Mail</span>
                                                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                                                                            </svg>
                                                                                        </button>
                                                                                    </td>
                                                                                </tr>
                                                                            ))
                                                                        )}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        )}
                                                        {activeCreatePOSubTab === 'Mail PO' && (
                                                            <div className="erp-card overflow-hidden border border-slate-200">
                                                                <table className="erp-table min-w-full">
                                                                    <thead className="bg-slate-50/50">
                                                                        <tr>
                                                                            <th className="table-header">PO#</th>
                                                                            <th className="table-header">PO Date</th>
                                                                            <th className="table-header">Vendor Name</th>
                                                                            <th className="table-header">Branch</th>
                                                                            <th className="table-header">Delivery Date</th>
                                                                            <th className="table-header">Amount</th>
                                                                            <th className="px-6 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">Action</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="bg-white divide-y divide-gray-200">
                                                                        {purchaseOrders.filter(po => po.status === 'Approved').length === 0 ? (
                                                                            <tr>
                                                                                <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                                                                                    No approved purchase orders found.
                                                                                </td>
                                                                            </tr>
                                                                        ) : (
                                                                            purchaseOrders.filter(po => po.status === 'Approved').map((po) => (
                                                                                <tr key={po.id} className="hover:bg-gray-50 transition-colors">
                                                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{po.poNumber}</td>
                                                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(po.poDate)}</td>
                                                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{po.vendorName}</td>
                                                                                    <td className="px-6 py-4 text-sm text-gray-500">{po.branch || '-'}</td>
                                                                                    <td className="px-6 py-4 text-sm text-gray-500">{po.deliveryDate ? formatDate(po.deliveryDate) : '-'}</td>
                                                                                    <td className="px-6 py-4 text-sm text-gray-500">{po.amount ? `₹${po.amount}` : '-'}</td>
                                                                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                                                        <button
                                                                                            onClick={() => handleApproveAndMail(po.id)}
                                                                                            className="text-indigo-600 hover:text-indigo-900 mr-3"
                                                                                            title="Mail PO"
                                                                                        >
                                                                                            <span className="sr-only">Mail PO</span>
                                                                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                                                                        </button>
                                                                                        <button
                                                                                            onClick={() => handleViewPO(po)}
                                                                                            className="text-indigo-600 hover:text-indigo-900"
                                                                                            title="View">
                                                                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                                                                        </button>
                                                                                    </td>
                                                                                </tr>
                                                                            ))
                                                                        )}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        )}
                                                    </div>
                                                </>
                                            )}

                                            {activePOSubTab === 'Pending PO' && (
                                                <div className="erp-card overflow-hidden border border-slate-200">
                                                    <table className="erp-table min-w-full">
                                                        <thead className="bg-slate-50/50">
                                                            <tr>
                                                                <th className="table-header">PO#</th>
                                                                <th className="table-header">PO Date</th>
                                                                <th className="table-header">Vendor Name</th>
                                                                <th className="table-header">Branch</th>
                                                                <th className="table-header">Delivery Date</th>
                                                                <th className="table-header">Amount</th>
                                                                <th className="table-header text-center">Status</th>
                                                                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">Action</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="bg-white divide-y divide-gray-200">
                                                            {purchaseOrders.filter(po => ['Pending Approval', 'Approved', 'Mailed', 'Draft'].includes(po.status)).length === 0 ? (
                                                                <tr>
                                                                    <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                                                                        No pending purchase orders found.
                                                                    </td>
                                                                </tr>
                                                            ) : (
                                                                purchaseOrders.filter(po => ['Pending Approval', 'Approved', 'Mailed', 'Draft'].includes(po.status)).map((po) => (
                                                                    <tr key={po.id} className="hover:bg-gray-50 transition-colors">
                                                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{po.poNumber}</td>
                                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(po.poDate)}</td>
                                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{po.vendorName}</td>
                                                                        <td className="px-6 py-4 text-sm text-gray-500">{po.branch || '-'}</td>
                                                                        <td className="px-6 py-4 text-sm text-gray-500">{po.deliveryDate ? formatDate(po.deliveryDate) : '-'}</td>
                                                                        <td className="px-6 py-4 text-sm text-gray-500">{po.amount ? `₹${po.amount}` : '-'}</td>
                                                                        <td className="px-6 py-4 whitespace-nowrap text-center">
                                                                            <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-[4px] border ${po.status === 'Draft' ? 'bg-slate-100 text-slate-700 border-slate-200' :
                                                                                po.status === 'Pending Approval' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                                                                    'bg-green-50 text-green-700 border-green-200'
                                                                                }`}>
                                                                                {po.status}
                                                                            </span>
                                                                        </td>
                                                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                                            <button
                                                                                onClick={() => handleViewPO(po)}
                                                                                className="text-indigo-600 hover:text-indigo-900"
                                                                                title="View"
                                                                            >
                                                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                                                            </button>
                                                                        </td>
                                                                    </tr>
                                                                ))
                                                            )}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                            {activePOSubTab === 'Executed PO' && (
                                                <div className="erp-card overflow-hidden border border-slate-200">
                                                    <table className="erp-table min-w-full">
                                                        <thead className="bg-slate-50/50">
                                                            <tr>
                                                                <th className="table-header">PO#</th>
                                                                <th className="table-header">PO Date</th>
                                                                <th className="table-header">Vendor Name</th>
                                                                <th className="table-header">Branch</th>
                                                                <th className="table-header">Delivery Date</th>
                                                                <th className="table-header">Amount</th>
                                                                <th className="table-header">Status</th>
                                                                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">Action</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="bg-white divide-y divide-gray-200">
                                                            {purchaseOrders.filter(po => po.status === 'Closed').length === 0 ? (
                                                                <tr>
                                                                    <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                                                                        No executed purchase orders found (Closed).
                                                                    </td>
                                                                </tr>
                                                            ) : (
                                                                purchaseOrders.filter(po => po.status === 'Closed').map((po) => (
                                                                    <tr key={po.id} className="hover:bg-gray-50 transition-colors">
                                                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{po.poNumber}</td>
                                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(po.poDate)}</td>
                                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{po.vendorName}</td>
                                                                        <td className="px-6 py-4 text-sm text-gray-500">{po.branch || '-'}</td>
                                                                        <td className="px-6 py-4 text-sm text-gray-500">{po.deliveryDate ? formatDate(po.deliveryDate) : '-'}</td>
                                                                        <td className="px-6 py-4 text-sm text-gray-500">{po.amount ? `₹${po.amount}` : '-'}</td>
                                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                                            <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-[4px] bg-slate-100 text-slate-700 border border-green-200">
                                                                                {po.status}
                                                                            </span>
                                                                        </td>
                                                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                                            <button
                                                                                onClick={() => handleViewPO(po)}
                                                                                className="text-indigo-600 hover:text-indigo-900"
                                                                                title="View"
                                                                            >
                                                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                                                            </button>
                                                                        </td>
                                                                    </tr>
                                                                ))
                                                            )}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                            {activeTransactionSubTab === 'Procurement' && (
                                <div>
                                    {activeProcurementSubTab === 'Dashboard' ? (
                                        <div>
                                            <div className="mb-8">
                                                <h2 className="section-title">Procurement</h2>
                                                <p className="helper-text mt-1">Select a procurement category to manage.</p>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                                {allDisplayCategories.map(name => ({ name, desc: `Manage ${name.toLowerCase()} procurement` }))
                                                    .map((item) => {
                                                        const activeOrders = purchaseOrders.filter(po => {
                                                            let poCat = po.category;
                                                            if (!poCat && po.vendorName) {
                                                                const vendor = vendorList.find(v => v.vendor_name === po.vendorName);
                                                                if (vendor) poCat = (vendor as any).vendor_category_name || (vendor as any).vendor_category || '';
                                                            }
                                                            return (poCat || '').toLowerCase().includes(item.name.toLowerCase()) &&
                                                                ['Draft', 'Pending Approval', 'Approved', 'Mailed'].includes(po.status);
                                                        }).length;

                                                        const activeAdvances = allAdvancePayments.filter(adv =>
                                                            (adv.category || '').toLowerCase() === (item.name || '').toLowerCase()
                                                        ).length;

                                                        const categoryVendors = getVendorAgingData(item.name);
                                                        const totalDueAmount = categoryVendors.reduce((sum, v) => sum + v.days0to45 + v.days45to90 + v.months6 + v.year1, 0);

                                                        return (
                                                            <div
                                                                key={item.name}
                                                                onClick={() => {
                                                                    setActiveProcurementSubTab(item.name as ProcurementSubTab);
                                                                    setProcurementViewMode('list');
                                                                    setSelectedProcurementVendor(null);
                                                                }}
                                                                className="bg-white p-6 rounded-[4px] border border-gray-200 hover:border-indigo-500 hover:shadow-md cursor-pointer transition-all group"
                                                            >
                                                                <div className="flex items-center justify-between mb-4">
                                                                    <div className="p-3 rounded-[4px] bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                                                        <Filter className="w-6 h-6" />
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="text-right mr-2">
                                                                            <p className="text-lg font-bold text-gray-800">{activeOrders}</p>
                                                                            <p className="text-[10px] text-indigo-600 font-semibold uppercase tracking-wider">Orders</p>
                                                                        </div>
                                                                        <div className="text-right mr-2">
                                                                            <p className="text-lg font-bold text-gray-800">{activeAdvances}</p>
                                                                            <p className="text-[10px] text-green-600 font-semibold uppercase tracking-wider">Advances</p>
                                                                        </div>
                                                                        {totalDueAmount > 0 && (
                                                                             <div className="text-right mr-2">
                                                                                <p className="text-lg font-bold text-gray-800">
                                                                                    {totalDueAmount >= 1000 ? `₹${(totalDueAmount / 1000).toFixed(1)}k` : `₹${Math.round(totalDueAmount)}`}
                                                                                </p>
                                                                                <p className="text-[10px] text-red-600 font-semibold uppercase tracking-wider">Due</p>
                                                                            </div>
                                                                        )}
                                                                        <ChevronLeft className="w-5 h-5 text-gray-300 group-hover:text-indigo-500 transform rotate-180 transition-all opacity-0 group-hover:opacity-100" />
                                                                    </div>
                                                                </div>
                                                                <h3 className="text-lg font-bold text-gray-900 group-hover:text-indigo-600 transition-colors uppercase tracking-tight">{item.name}</h3>
                                                                <p className="text-sm text-gray-500 mt-2">{item.desc}</p>
                                                            </div>
                                                        );
                                                    })}
                                            </div>
                                        </div>
                                    ) : (
                                        <div>
                                            <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
                                                <div className="flex items-center gap-4">
                                                    <button
                                                        onClick={() => { setActiveProcurementSubTab('Dashboard'); setProcurementViewMode('list'); }}
                                                        className="p-2 hover:bg-gray-100 rounded-[4px] transition-colors"
                                                        title="Back to Dashboard"
                                                    >
                                                        <ChevronLeft className="w-5 h-5 text-gray-600" />
                                                    </button>
                                                    <div>
                                                        <div className="flex items-center space-x-2 text-xs text-gray-400 mb-1 uppercase tracking-widest font-semibold">
                                                            <span>Procurement</span>
                                                            <span className="text-gray-300">/</span>
                                                            <span className="text-indigo-500 font-bold">{activeProcurementSubTab}</span>
                                                            {selectedProcurementVendor && (
                                                                <>
                                                                    <span className="text-gray-300">/</span>
                                                                    <span className="text-indigo-600 font-bold">{selectedProcurementVendor.name}</span>
                                                                </>
                                                            )}
                                                        </div>
                                                        <h3 className="text-xl font-bold text-gray-900">{activeProcurementSubTab}</h3>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-3">
                                                    {procurementViewMode === 'list' && (
                                                        <div className="relative">
                                                            <input
                                                                type="text"
                                                                placeholder="Search Vendor..."
                                                                value={procurementSearchTerm}
                                                                onChange={(e) => setProcurementSearchTerm(e.target.value)}
                                                                className="pl-10 pr-4 py-2 border border-gray-300 rounded-[4px] text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64 bg-white"
                                                            />
                                                            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
                                                        </div>
                                                    )}
                                                    <button
                                                        onClick={() => setActiveProcurementSubTab('Dashboard')}
                                                        className="px-4 py-2 border border-slate-200 rounded-[4px] text-sm font-semibold text-gray-600 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 uppercase tracking-wider"
                                                    >
                                                        Dashboard
                                                    </button>
                                                </div>
                                            </div>

                                            {procurementViewMode === 'list' && (() => {
                                                const agingData = getVendorAgingData(activeProcurementSubTab);
                                                return (
                                                    <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden mt-4">
                                                        <div className="overflow-x-auto">
                                                            <table className="min-w-full border-collapse">
                                                                <thead>
                                                                    <tr className="bg-[#F8F9FA] border-b border-gray-200">
                                                                        <th rowSpan={2} className="px-6 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-widest border-r border-gray-100 max-w-[150px]">Vendor Code</th>
                                                                        <th rowSpan={2} className="px-6 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-widest border-r border-gray-100 min-w-[200px]">Vendor Name</th>
                                                                        <th rowSpan={2} className="px-6 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-widest border-r border-gray-100 min-w-[180px]">Sub Category</th>
                                                                        <th colSpan={5} className="px-6 py-3 text-center text-[11px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-100 bg-[#F8F9FA]/80 shadow-sm">Amount - Due For</th>
                                                                        <th rowSpan={2} className="px-6 py-4 text-center text-[11px] font-bold text-gray-500 uppercase tracking-widest border-l border-gray-100 w-[100px]">Actions</th>
                                                                    </tr>
                                                                    <tr className="bg-[#F8F9FA]/80">
                                                                        <th className="px-3 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-widest border-r border-gray-100 w-[100px]">Not Due</th>
                                                                        <th className="px-3 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-widest border-r border-gray-100 w-[100px]">0-45 Days</th>
                                                                        <th className="px-3 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-widest border-r border-gray-100 w-[100px]">45-90 Days</th>
                                                                        <th className="px-3 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-widest border-r border-gray-100 w-[100px]">{">"} 6 Months</th>
                                                                        <th className="px-3 py-3 text-center text-[10px] font-bold text-gray-500 uppercase tracking-widest w-[100px]">{">"} 1 Year</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="bg-white divide-y divide-gray-100">
                                                                    {loadingProcurementAging ? (
                                                                        <tr>
                                                                            <td colSpan={9} className="px-6 py-10 text-center text-sm text-gray-500">
                                                                                <div className="flex items-center justify-center space-x-2">
                                                                                    <svg className="animate-spin h-5 w-5 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                                                                                    </svg>
                                                                                    <span>Loading procurement data...</span>
                                                                                </div>
                                                                            </td>
                                                                        </tr>
                                                                    ) : getFilteredVendorAging(agingData).length === 0 ? (
                                                                        <tr>
                                                                            <td colSpan={9} className="px-6 py-10 text-center text-sm text-gray-500">
                                                                                {agingData.length === 0
                                                                                    ? "No outstanding purchase invoices for this category."
                                                                                    : "No vendors found matching your search term."}
                                                                            </td>
                                                                        </tr>
                                                                    ) : (
                                                                        getFilteredVendorAging(agingData).map((vendor) => (
                                                                            <tr key={vendor.id} className="hover:bg-indigo-50/40 transition-colors group">
                                                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-slate-800 border-r border-gray-50">{vendor.code}</td>
                                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 border-r border-gray-50">{vendor.name}</td>
                                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 border-r border-gray-50">
                                                                                    <span className="text-gray-600">{activeProcurementSubTab}</span>
                                                                                </td>

                                                                                {/* Amount columns */}
                                                                                <td className="px-4 py-4 whitespace-nowrap text-sm text-center text-slate-400 border-r border-gray-50 bg-slate-50/30 group-hover:bg-transparent">-</td>
                                                                                <td className="px-4 py-4 whitespace-nowrap text-sm text-center font-medium text-slate-700 border-r border-gray-50 bg-slate-50/30 group-hover:bg-transparent">{formatProcurementCurrency(vendor.days0to45)}</td>
                                                                                <td className="px-4 py-4 whitespace-nowrap text-sm text-center font-medium text-slate-700 border-r border-gray-50 bg-slate-50/30 group-hover:bg-transparent">{formatProcurementCurrency(vendor.days45to90)}</td>
                                                                                <td className="px-4 py-4 whitespace-nowrap text-sm text-center font-medium text-slate-700 border-r border-gray-50 bg-slate-50/30 group-hover:bg-transparent">{formatProcurementCurrency(vendor.months6)}</td>
                                                                                <td className="px-4 py-4 whitespace-nowrap text-sm text-center font-medium text-slate-700 bg-slate-50/30 group-hover:bg-transparent">{formatProcurementCurrency(vendor.year1)}</td>

                                                                                <td className="px-6 py-4 whitespace-nowrap text-center border-l border-gray-50">
                                                                                    <div className="flex items-center justify-center space-x-2">
                                                                                        <button
                                                                                            onClick={() => {
                                                                                                setSelectedProcurementVendor(vendor);
                                                                                                setProcurementViewMode('ledger');
                                                                                                fetchVendorLedger(vendor.id, vendor.name);
                                                                                            }}
                                                                                            className="text-indigo-600 hover:text-indigo-900 transition-colors p-1.5 rounded-full hover:bg-indigo-100"
                                                                                            title="View Ledger"
                                                                                        >
                                                                                            <Eye className="w-4 h-4" />
                                                                                        </button>
                                                                                    </div>
                                                                                </td>
                                                                            </tr>
                                                                        ))
                                                                    )}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                );
                                            })()}


                                            {procurementViewMode === 'ledger' && selectedProcurementVendor && (
                                                <div className="erp-card border border-slate-200 overflow-hidden p-0">
                                                    <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 bg-gray-50">
                                                        <h3 className="section-title">{selectedProcurementVendor.name}</h3>
                                                        <div className="flex gap-2">
                                                            {(!selectedProcurementVendor?.billing_currency || selectedProcurementVendor?.billing_currency === 'INR' || selectedProcurementVendor?.currency === 'INR') && (
                                                                <button
                                                                    onClick={() => setShowNetoffModal(true)}
                                                                    className="px-4 py-2 bg-indigo-600 text-white border border-transparent rounded-[4px] text-sm font-medium hover:bg-indigo-700 shadow-sm transition-colors"
                                                                >
                                                                    NET-OFF
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() => setProcurementViewMode('journal')}
                                                                className="px-4 py-2 bg-white border border-gray-300 rounded-[4px] text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm transition-colors"
                                                            >
                                                                Journal View
                                                            </button>
                                                            <button
                                                                onClick={() => setProcurementViewMode('month')}
                                                                className="px-4 py-2 bg-white border border-gray-300 rounded-[4px] text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm transition-colors"
                                                            >
                                                                Month View
                                                            </button>
                                                        </div>
                                                    </div>

                                                    <div className="overflow-x-auto">
                                                        <table className="erp-table min-w-full">
                                                            <thead className="bg-[#F8F9FA] border-b border-slate-200">
                                                                <tr>
                                                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-r border-slate-200">
                                                                        <div className="flex items-center justify-between relative">
                                                                            <span>Date</span>
                                                                            <div className="ml-2">
                                                                                <Filter
                                                                                    className={`w-4 h-4 cursor-pointer ${activeFilter === 'date' ? 'text-indigo-600 font-bold' : 'text-gray-400 hover:text-gray-600'}`}
                                                                                    onClick={() => toggleFilter('date')}
                                                                                />
                                                                                {activeFilter === 'date' && (
                                                                                    <div className="absolute z-50 top-8 left-0 bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-slate-100 p-4 w-[280px]">
                                                                                        <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-100">
                                                                                            <span className="text-sm font-black text-slate-800 tracking-tight">Filter by Date Range</span>
                                                                                            <X className="w-4 h-4 cursor-pointer text-slate-400 hover:text-slate-700 transition-colors" onClick={() => setActiveFilter(null)} />
                                                                                        </div>
                                                                                        <div className="space-y-4">
                                                                                            <div>
                                                                                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">From Date</label>
                                                                                                <input
                                                                                                    type="date"
                                                                                                    value={ledgerFilters.dateFrom}
                                                                                                    onChange={(e) => setLedgerFilters({ ...ledgerFilters, dateFrom: e.target.value })}
                                                                                                    className="w-full px-3 py-2 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all shadow-sm"
                                                                                                />
                                                                                            </div>
                                                                                            <div>
                                                                                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">To Date</label>
                                                                                                <input
                                                                                                    type="date"
                                                                                                    value={ledgerFilters.dateTo}
                                                                                                    onChange={(e) => setLedgerFilters({ ...ledgerFilters, dateTo: e.target.value })}
                                                                                                    className="w-full px-3 py-2 text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all shadow-sm"
                                                                                                />
                                                                                            </div>
                                                                                        </div>
                                                                                        <div className="mt-5 pt-3 flex items-center justify-between">
                                                                                            <button
                                                                                                onClick={() => setLedgerFilters({ ...ledgerFilters, dateFrom: '', dateTo: '', date: '' })}
                                                                                                className={`text-[11px] font-bold uppercase tracking-wider transition-colors ${ledgerFilters.dateFrom || ledgerFilters.dateTo || ledgerFilters.date ? 'text-slate-400 hover:text-red-500' : 'text-slate-300 cursor-not-allowed'}`}
                                                                                                disabled={!ledgerFilters.dateFrom && !ledgerFilters.dateTo && !ledgerFilters.date}
                                                                                            >
                                                                                                Clear
                                                                                            </button>
                                                                                            <button
                                                                                                onClick={() => setActiveFilter(null)}
                                                                                                className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 uppercase tracking-wider transition-colors bg-indigo-50 px-3 py-1.5 rounded"
                                                                                            >
                                                                                                Apply Filter
                                                                                            </button>
                                                                                        </div>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </th>
                                                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-r border-slate-200">
                                                                        <div className="flex items-center justify-between relative">
                                                                            <span className="truncate">Created From</span>
                                                                            <div className="ml-2">
                                                                                <Filter
                                                                                    className={`w-4 h-4 cursor-pointer ${activeFilter === 'transferFrom' ? 'text-indigo-600 font-bold' : 'text-gray-400 hover:text-gray-600'}`}
                                                                                    onClick={() => toggleFilter('transferFrom')}
                                                                                />
                                                                                {activeFilter === 'transferFrom' && (
                                                                                    <div className="absolute z-50 top-8 left-0 bg-white shadow-xl border border-gray-200 rounded-[4px] p-3 w-48">
                                                                                        <div className="flex justify-between items-center mb-2">
                                                                                            <span className="text-xs font-bold text-gray-700">Filter Type</span>
                                                                                            <X className="w-3 h-3 cursor-pointer text-gray-400 hover:text-gray-600" onClick={() => setActiveFilter(null)} />
                                                                                        </div>
                                                                                        <input
                                                                                            type="text"
                                                                                            placeholder="Type to filter..."
                                                                                            value={ledgerFilters.transferFrom}
                                                                                            onChange={(e) => setLedgerFilters({ ...ledgerFilters, transferFrom: e.target.value })}
                                                                                            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:ring-1 focus:ring-indigo-500 outline-none"
                                                                                            autoFocus
                                                                                        />
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </th>
                                                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-r border-slate-200">
                                                                        <div className="flex items-center justify-between relative">
                                                                            <span>Reference No</span>
                                                                            <div className="ml-2">
                                                                                <Filter
                                                                                    className={`w-4 h-4 cursor-pointer ${activeFilter === 'referenceNo' ? 'text-indigo-600 font-bold' : 'text-gray-400 hover:text-gray-600'}`}
                                                                                    onClick={() => toggleFilter('referenceNo')}
                                                                                />
                                                                                {activeFilter === 'referenceNo' && (
                                                                                    <div className="absolute z-50 top-8 left-0 bg-white shadow-xl border border-gray-200 rounded-[4px] p-3 w-52">
                                                                                        <div className="flex justify-between items-center mb-2">
                                                                                            <span className="text-xs font-bold text-gray-700">Search Reference</span>
                                                                                            <X className="w-3 h-3 cursor-pointer text-gray-400 hover:text-gray-600" onClick={() => setActiveFilter(null)} />
                                                                                        </div>
                                                                                        <input
                                                                                            type="text"
                                                                                            placeholder="Search..."
                                                                                            value={ledgerFilters.referenceNo}
                                                                                            onChange={(e) => setLedgerFilters({ ...ledgerFilters, referenceNo: e.target.value })}
                                                                                            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:ring-1 focus:ring-indigo-500 outline-none"
                                                                                            autoFocus
                                                                                        />
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </th>
                                                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-r border-slate-200">
                                                                        <div className="flex items-center justify-between relative">
                                                                            <span>Ledger</span>
                                                                            <div className="ml-2">
                                                                                <Filter
                                                                                    className={`w-4 h-4 cursor-pointer ${activeFilter === 'ledger' ? 'text-indigo-600 font-bold' : 'text-gray-400 hover:text-gray-600'}`}
                                                                                    onClick={() => toggleFilter('ledger')}
                                                                                />
                                                                                {activeFilter === 'ledger' && (
                                                                                    <div className="absolute z-50 top-8 left-0 bg-white shadow-xl border border-gray-200 rounded-[4px] p-3 w-52">
                                                                                        <div className="flex justify-between items-center mb-2">
                                                                                            <span className="text-xs font-bold text-gray-700">Search Ledger</span>
                                                                                            <X className="w-3 h-3 cursor-pointer text-gray-400 hover:text-gray-600" onClick={() => setActiveFilter(null)} />
                                                                                        </div>
                                                                                        <input
                                                                                            type="text"
                                                                                            placeholder="Search..."
                                                                                            value={ledgerFilters.ledger}
                                                                                            onChange={(e) => setLedgerFilters({ ...ledgerFilters, ledger: e.target.value })}
                                                                                            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:ring-1 focus:ring-indigo-500 outline-none"
                                                                                            autoFocus
                                                                                        />
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </th>
                                                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-r border-slate-200">
                                                                        <div className="flex items-center justify-between relative">
                                                                            <span>Status</span>
                                                                            <div className="ml-2">
                                                                                <Filter
                                                                                    className={`w-4 h-4 cursor-pointer ${activeFilter === 'status' ? 'text-indigo-600 font-bold' : 'text-gray-400 hover:text-gray-600'}`}
                                                                                    onClick={() => toggleFilter('status')}
                                                                                />
                                                                                {activeFilter === 'status' && (
                                                                                    <div className="absolute z-50 top-8 left-0 bg-white shadow-xl border border-gray-200 rounded-[4px] p-3 w-48">
                                                                                        <div className="flex justify-between items-center mb-2">
                                                                                            <span className="text-xs font-bold text-gray-700">Filter Status</span>
                                                                                            <X className="w-3 h-3 cursor-pointer text-gray-400 hover:text-gray-600" onClick={() => setActiveFilter(null)} />
                                                                                        </div>
                                                                                        <select
                                                                                            value={ledgerFilters.status}
                                                                                            onChange={(e) => { setLedgerFilters({ ...ledgerFilters, status: e.target.value }); setActiveFilter(null); }}
                                                                                            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:ring-1 focus:ring-indigo-500 outline-none bg-white"
                                                                                            autoFocus
                                                                                        >
                                                                                            <option value="">All Statuses</option>
                                                                                            <option value="Not Due">Not Due</option>
                                                                                            <option value="Due">Due</option>
                                                                                            <option value="Partially Received">Partially Received</option>
                                                                                            <option value="Received">Received</option>
                                                                                            <option value="Utilized">Utilized</option>
                                                                                            <option value="Not Utilized">Not Utilized</option>
                                                                                        </select>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </th>
                                                                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider border-r border-slate-200">
                                                                        <div className="flex items-center justify-end relative">
                                                                            <span>Debit</span>
                                                                            <div className="ml-2">
                                                                                <Filter
                                                                                    className={`w-4 h-4 cursor-pointer ${activeFilter === 'debit' ? 'text-indigo-600 font-bold' : 'text-gray-400 hover:text-gray-600'}`}
                                                                                    onClick={() => toggleFilter('debit')}
                                                                                />
                                                                                {activeFilter === 'debit' && (
                                                                                    <div className="absolute z-50 top-8 right-0 bg-white shadow-xl border border-gray-200 rounded-[4px] p-3 w-40">
                                                                                        <div className="flex justify-between items-center mb-2">
                                                                                            <span className="text-xs font-bold text-gray-700">Debit Mask</span>
                                                                                            <X className="w-3 h-3 cursor-pointer text-gray-400 hover:text-gray-600" onClick={() => setActiveFilter(null)} />
                                                                                        </div>
                                                                                        <input
                                                                                            type="text"
                                                                                            placeholder="0.00"
                                                                                            value={ledgerFilters.debit}
                                                                                            onChange={(e) => setLedgerFilters({ ...ledgerFilters, debit: e.target.value })}
                                                                                            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:ring-1 focus:ring-indigo-500 outline-none text-right"
                                                                                            autoFocus
                                                                                        />
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </th>
                                                                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider border-r border-slate-200">
                                                                        <div className="flex items-center justify-end relative">
                                                                            <span>Credit</span>
                                                                            <div className="ml-2">
                                                                                <Filter
                                                                                    className={`w-4 h-4 cursor-pointer ${activeFilter === 'credit' ? 'text-indigo-600 font-bold' : 'text-gray-400 hover:text-gray-600'}`}
                                                                                    onClick={() => toggleFilter('credit')}
                                                                                />
                                                                                {activeFilter === 'credit' && (
                                                                                    <div className="absolute z-50 top-8 right-0 bg-white shadow-xl border border-gray-200 rounded-[4px] p-3 w-40">
                                                                                        <div className="flex justify-between items-center mb-2">
                                                                                            <span className="text-xs font-bold text-gray-700">Credit Mask</span>
                                                                                            <X className="w-3 h-3 cursor-pointer text-gray-400 hover:text-gray-600" onClick={() => setActiveFilter(null)} />
                                                                                        </div>
                                                                                        <input
                                                                                            type="text"
                                                                                            placeholder="0.00"
                                                                                            value={ledgerFilters.credit}
                                                                                            onChange={(e) => setLedgerFilters({ ...ledgerFilters, credit: e.target.value })}
                                                                                            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:ring-1 focus:ring-indigo-500 outline-none text-right"
                                                                                            autoFocus
                                                                                        />
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </th>
                                                                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                                                        <div className="flex items-center justify-end relative">
                                                                            <span className="truncate">Running Bal</span>
                                                                            <div className="ml-2">
                                                                                <Filter
                                                                                    className={`w-4 h-4 cursor-pointer ${activeFilter === 'runningBalance' ? 'text-indigo-600 font-bold' : 'text-gray-400 hover:text-gray-600'}`}
                                                                                    onClick={() => toggleFilter('runningBalance')}
                                                                                />
                                                                                {activeFilter === 'runningBalance' && (
                                                                                    <div className="absolute z-50 top-8 right-0 bg-white shadow-xl border border-gray-200 rounded-[4px] p-3 w-44">
                                                                                        <div className="flex justify-between items-center mb-2">
                                                                                            <span className="text-xs font-bold text-gray-700">Balance Mask</span>
                                                                                            <X className="w-3 h-3 cursor-pointer text-gray-400 hover:text-gray-600" onClick={() => setActiveFilter(null)} />
                                                                                        </div>
                                                                                        <input
                                                                                            type="text"
                                                                                            placeholder="0.00"
                                                                                            value={ledgerFilters.runningBalance}
                                                                                            onChange={(e) => setLedgerFilters({ ...ledgerFilters, runningBalance: e.target.value })}
                                                                                            className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:ring-1 focus:ring-indigo-500 outline-none text-right"
                                                                                            autoFocus
                                                                                        />
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="bg-white divide-y divide-gray-200">
                                                                {loadingLedger ? (
                                                                    <tr>
                                                                        <td colSpan={8} className="px-6 py-8 text-center text-sm text-gray-500">
                                                                            <div className="flex items-center justify-center space-x-2">
                                                                                <svg className="animate-spin h-5 w-5 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                                                                                </svg>
                                                                                <span>Loading ledger data...</span>
                                                                            </div>
                                                                        </td>
                                                                    </tr>
                                                                ) : filteredLedgerData.map((entry) => (
                                                                    <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatDate(entry.date)}</td>
                                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{entry.transferFrom}</td>
                                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600 font-medium cursor-pointer hover:underline">{entry.referenceNo}</td>
                                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{entry.referenceNo || entry.ledger}</td>
                                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                                            <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-[4px] ${entry.status === 'Received' ? 'bg-green-100 text-green-800' :
                                                                                entry.status === 'Due' ? 'bg-red-100 text-red-800' :
                                                                                    entry.status === 'Partially Received' ? 'bg-orange-100 text-orange-700' :
                                                                                        entry.status === 'Utilized' ? 'bg-blue-100 text-blue-700' :
                                                                                            entry.status === 'Not Utilized' ? 'bg-purple-100 text-purple-700' :
                                                                                                'bg-gray-100 text-gray-600'
                                                                                }`}>
                                                                                {entry.status}
                                                                            </span>
                                                                        </td>
                                                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">{entry.debit !== '-' ? `₹${entry.debit}` : '-'}</td>
                                                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">{entry.credit !== '-' ? `₹${entry.credit}` : '-'}</td>
                                                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-gray-900">{entry.runningBalance !== '-' ? `₹${entry.runningBalance}` : '-'}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                            <tfoot className="bg-gray-50 font-bold border-t border-gray-200">
                                                                <tr>
                                                                    <td colSpan={5} className="px-6 py-3 text-right text-gray-900 text-sm">TOTAL</td>
                                                                    <td className="px-6 py-3 text-right text-gray-900 text-sm">₹{totalDebit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                                    <td className="px-6 py-3 text-right text-gray-900 text-sm">₹{totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                                    <td className="px-6 py-3 text-right text-gray-900 text-sm">
                                                                        {filteredLedgerData.length > 0 && `₹${filteredLedgerData[filteredLedgerData.length - 1].runningBalance}`}
                                                                    </td>
                                                                </tr>
                                                            </tfoot>
                                                        </table>
                                                    </div>
                                                </div>
                                            )}

                                            {procurementViewMode === 'journal' && selectedProcurementVendor && (
                                                <div className="erp-card border border-slate-200 p-0">
                                                    <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 bg-gray-50">
                                                        <h3 className="section-title">{selectedProcurementVendor.name} - Journal View</h3>
                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={() => setProcurementViewMode('month')}
                                                                className="px-4 py-2 bg-white border border-gray-300 rounded-[4px] text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm transition-colors"
                                                            >
                                                                Month View
                                                            </button>
                                                            <button
                                                                onClick={() => setProcurementViewMode('ledger')}
                                                                className="px-4 py-2 bg-white border border-gray-300 rounded-[4px] text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm transition-colors"
                                                            >
                                                                Bill-wise View
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="overflow-x-auto">
                                                        <table className="min-w-full">
                                                            <thead className="border-y border-gray-100 bg-white">
                                                                <tr>
                                                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider w-[120px]">Date</th>
                                                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Transaction Particulars</th>
                                                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider w-[120px]">Type</th>
                                                                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider w-[120px]">VCH No.</th>
                                                                    <th className="px-6 py-4 text-right text-xs font-bold text-gray-400 uppercase tracking-wider w-[140px]">Debit (₹)</th>
                                                                    <th className="px-6 py-4 text-right text-xs font-bold text-gray-400 uppercase tracking-wider w-[140px]">Credit (₹)</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="bg-white">
                                                                {filteredLedgerData.map((entry) => (
                                                                    <React.Fragment key={entry.id}>
                                                                        {/* Header Row */}
                                                                        <tr className="border-b border-gray-50 hover:bg-gray-50/50">
                                                                            <td className="px-6 py-4 text-sm font-medium text-gray-600 align-top">
                                                                                {formatDate(entry.date)}
                                                                            </td>
                                                                            <td className="px-6 py-4 text-sm font-bold text-gray-800">
                                                                                {entry.rawVoucher?.transaction_type?.toLowerCase() === 'purchase' ? '(as per details)' : (entry.referenceNo || entry.ledger)}
                                                                            </td>
                                                                            <td className="px-6 py-4 text-sm text-gray-500 uppercase">
                                                                                {entry.rawVoucher?.transaction_type?.toLowerCase() === 'purchase' ? 'PURCHASE' : entry.rawVoucher?.transaction_type?.toLowerCase() === 'payment' ? 'PAYMENT' : entry.transferFrom}
                                                                            </td>
                                                                            <td className="px-6 py-4 text-sm text-gray-500">
                                                                                {entry.referenceNo}
                                                                            </td>
                                                                            <td className="px-6 py-4 text-sm font-bold text-indigo-600 text-right">
                                                                                {entry.rawVoucher?.transaction_type?.toLowerCase() === 'payment' && entry.debit !== '-' ? `₹${entry.debit}` : '-'}
                                                                            </td>
                                                                            <td className="px-6 py-4 text-sm font-medium text-gray-400 text-right">
                                                                                {entry.rawVoucher?.transaction_type?.toLowerCase() === 'purchase' && entry.credit !== '-' ? <span className="text-gray-900">₹{entry.credit}</span> : '-'}
                                                                            </td>
                                                                        </tr>

                                                                        {/* Purchase Details - Correct Double Entry: Debit side = Purchase A/c + Input GST; Credit side = Vendor A/c + TDS Payable */}
                                                                        {entry.rawVoucher?.transaction_type?.toLowerCase() === 'purchase' && (() => {
                                                                            let supplyInrDetails = entry.rawVoucher?.supply_inr_details;
                                                                            if (typeof supplyInrDetails === 'string') {
                                                                                try { supplyInrDetails = JSON.parse(supplyInrDetails); } catch { supplyInrDetails = {}; }
                                                                            }
                                                                            const items = supplyInrDetails?.items || [];
                                                                            const dueDetails = entry.rawVoucher?.due_details;
                                                                            const tdsIt = dueDetails ? parseFloat(dueDetails.tds_it || 0) : 0;
                                                                            const tdsGst = dueDetails ? parseFloat(dueDetails.tds_gst || 0) : 0;
                                                                            const netPayable = dueDetails ? parseFloat(dueDetails.to_pay || 0) : 0;

                                                                            return (
                                                                                <React.Fragment>
                                                                                    {/* DEBIT rows: Purchase A/c + Input GST accounts */}
                                                                                    {items.map((item: any, idx: number) => {
                                                                                        const taxable = parseFloat(item.taxableValue) || 0;
                                                                                        const cgst = parseFloat(item.cgst) || 0;
                                                                                        const sgst = parseFloat(item.sgst) || 0;
                                                                                        const igst = parseFloat(item.igst) || 0;
                                                                                        const totalGstVal = cgst + sgst + igst;
                                                                                        let gstPct = item.gstPercentage || item.gst_percentage;
                                                                                        if (!gstPct && taxable > 0 && totalGstVal > 0) {
                                                                                            gstPct = Math.round((totalGstVal / taxable) * 100);
                                                                                        }
                                                                                        return (
                                                                                            <React.Fragment key={idx}>
                                                                                                {taxable > 0 && (
                                                                                                    <tr className="border-b border-gray-50/50">
                                                                                                        <td></td>
                                                                                                        <td className="px-6 py-3 whitespace-nowrap text-sm pl-16 text-gray-700 font-medium">
                                                                                                            Purchase A/c {item.itemName ? `(${item.itemName})` : ''} {gstPct ? `@ GST ${gstPct}%` : ''}
                                                                                                        </td>
                                                                                                        <td colSpan={2}></td>
                                                                                                        <td className="px-6 py-3 whitespace-nowrap text-sm text-right text-gray-800 font-medium">₹{taxable.toLocaleString('en-IN', { minimumFractionDigits: 2 })} DR</td>
                                                                                                        <td className="px-6 py-3 text-right text-gray-400">-</td>
                                                                                                    </tr>
                                                                                                )}
                                                                                                {cgst > 0 && (
                                                                                                    <tr className="border-b border-gray-50/50">
                                                                                                        <td></td>
                                                                                                        <td className="px-6 py-3 whitespace-nowrap text-sm pl-16 text-gray-700 font-medium">Input CGST Account</td>
                                                                                                        <td colSpan={2}></td>
                                                                                                        <td className="px-6 py-3 whitespace-nowrap text-sm text-right text-gray-800 font-medium">₹{cgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })} DR</td>
                                                                                                        <td className="px-6 py-3 text-right text-gray-400">-</td>
                                                                                                    </tr>
                                                                                                )}
                                                                                                {sgst > 0 && (
                                                                                                    <tr className="border-b border-gray-50/50">
                                                                                                        <td></td>
                                                                                                        <td className="px-6 py-3 whitespace-nowrap text-sm pl-16 text-gray-700 font-medium">Input SGST Account</td>
                                                                                                        <td colSpan={2}></td>
                                                                                                        <td className="px-6 py-3 whitespace-nowrap text-sm text-right text-gray-800 font-medium">₹{sgst.toLocaleString('en-IN', { minimumFractionDigits: 2 })} DR</td>
                                                                                                        <td className="px-6 py-3 text-right text-gray-400">-</td>
                                                                                                    </tr>
                                                                                                )}
                                                                                                {igst > 0 && (
                                                                                                    <tr className="border-b border-gray-50/50">
                                                                                                        <td></td>
                                                                                                        <td className="px-6 py-3 whitespace-nowrap text-sm pl-16 text-gray-700 font-medium">Input IGST Account</td>
                                                                                                        <td colSpan={2}></td>
                                                                                                        <td className="px-6 py-3 whitespace-nowrap text-sm text-right text-gray-800 font-medium">₹{igst.toLocaleString('en-IN', { minimumFractionDigits: 2 })} DR</td>
                                                                                                        <td className="px-6 py-3 text-right text-gray-400">-</td>
                                                                                                    </tr>
                                                                                                )}
                                                                                            </React.Fragment>
                                                                                        );
                                                                                    })}

                                                                                    {/* CREDIT rows: Vendor A/c (net payable) + TDS Payable */}
                                                                                    {netPayable > 0 && (
                                                                                        <tr className="border-b border-gray-50/50">
                                                                                            <td></td>
                                                                                            <td className="px-6 py-3 whitespace-nowrap text-sm pl-16 text-indigo-600 font-bold">
                                                                                                {entry.rawVoucher.vendor_name || selectedProcurementVendor.name} A/c (Ref: {entry.referenceNo})
                                                                                            </td>
                                                                                            <td colSpan={2}></td>
                                                                                            <td className="px-6 py-3 text-right text-gray-400">-</td>
                                                                                            <td className="px-6 py-3 whitespace-nowrap text-sm text-right font-bold text-indigo-600">₹{netPayable.toLocaleString('en-IN', { minimumFractionDigits: 2 })} CR</td>
                                                                                        </tr>
                                                                                    )}
                                                                                    {tdsIt > 0 && (
                                                                                        <tr className="border-b border-gray-50/50">
                                                                                            <td></td>
                                                                                            <td className="px-6 py-3 whitespace-nowrap text-sm pl-16 text-gray-700 font-medium">TDS Payable (Income Tax)</td>
                                                                                            <td colSpan={2}></td>
                                                                                            <td className="px-6 py-3 text-right text-gray-400">-</td>
                                                                                            <td className="px-6 py-3 whitespace-nowrap text-sm text-right font-medium text-gray-800">₹{tdsIt.toLocaleString('en-IN', { minimumFractionDigits: 2 })} CR</td>
                                                                                        </tr>
                                                                                    )}
                                                                                    {tdsGst > 0 && (
                                                                                        <tr className="border-b border-gray-50/50">
                                                                                            <td></td>
                                                                                            <td className="px-6 py-3 whitespace-nowrap text-sm pl-16 text-gray-700 font-medium">TDS Payable (GST)</td>
                                                                                            <td colSpan={2}></td>
                                                                                            <td className="px-6 py-3 text-right text-gray-400">-</td>
                                                                                            <td className="px-6 py-3 whitespace-nowrap text-sm text-right font-medium text-gray-800">₹{tdsGst.toLocaleString('en-IN', { minimumFractionDigits: 2 })} CR</td>
                                                                                        </tr>
                                                                                    )}
                                                                                    {/* Fallback: show net payable from entry.credit if no due_details */}
                                                                                    {netPayable === 0 && entry.credit !== '-' && (
                                                                                        <tr className="border-b border-gray-50/50">
                                                                                            <td></td>
                                                                                            <td className="px-6 py-3 whitespace-nowrap text-sm pl-16 text-indigo-600 font-bold">
                                                                                                {entry.rawVoucher?.vendor_name || selectedProcurementVendor.name} A/c (Ref: {entry.referenceNo})
                                                                                            </td>
                                                                                            <td colSpan={2}></td>
                                                                                            <td className="px-6 py-3 text-right text-gray-400">-</td>
                                                                                            <td className="px-6 py-3 whitespace-nowrap text-sm text-right font-bold text-indigo-600">₹{entry.credit} CR</td>
                                                                                        </tr>
                                                                                    )}
                                                                                </React.Fragment>
                                                                            );
                                                                        })()}

                                                                        {/* Payment Details - Correct Double Entry: Vendor A/c DR, Bank/Cash CR */}
                                                                        {entry.rawVoucher?.transaction_type?.toLowerCase() === 'payment' && entry.rawVoucher && (
                                                                            <React.Fragment>
                                                                                {/* DEBIT: Vendor A/c */}
                                                                                <tr className="border-b border-gray-50/50">
                                                                                    <td></td>
                                                                                    <td className="px-6 py-3 whitespace-nowrap text-sm pl-16 text-gray-700 font-medium">
                                                                                        {entry.rawVoucher.vendor_name || selectedProcurementVendor.name} A/c
                                                                                    </td>
                                                                                    <td colSpan={2}></td>
                                                                                    <td className="px-6 py-3 whitespace-nowrap text-sm text-right text-gray-800 font-medium">₹{entry.debit} DR</td>
                                                                                    <td className="px-6 py-3 text-right text-gray-400">-</td>
                                                                                </tr>
                                                                                {/* CREDIT: Bank/Cash A/c */}
                                                                                <tr className="border-b border-gray-100">
                                                                                    <td></td>
                                                                                    <td className="px-6 py-3 whitespace-nowrap text-sm pl-16 text-indigo-600 font-bold">
                                                                                        {entry.rawVoucher.pay_from_name || entry.rawVoucher.pay_from || entry.rawVoucher.payment_mode || 'Bank/Cash A/c'} (Agst Ref: {entry.rawVoucher.against_reference || entry.rawVoucher.reference_number || '-'})
                                                                                    </td>
                                                                                    <td colSpan={2}></td>
                                                                                    <td className="px-6 py-3 text-right text-gray-400">-</td>
                                                                                    <td className="px-6 py-3 whitespace-nowrap text-sm text-right font-bold text-indigo-600">₹{entry.debit} CR</td>
                                                                                </tr>
                                                                            </React.Fragment>
                                                                        )}

                                                                        {/* Receipt Details */}
                                                                        {entry.rawVoucher?.transaction_type?.toLowerCase() === 'receipt' && entry.rawVoucher && (
                                                                            <React.Fragment>
                                                                                <tr className="border-b border-gray-50/50">
                                                                                    <td></td>
                                                                                    <td className="px-6 py-3 whitespace-nowrap text-sm pl-16 text-gray-400 italic">
                                                                                        {entry.rawVoucher.receipt_mode || 'Cash/Bank'}
                                                                                    </td>
                                                                                    <td colSpan={2}></td>
                                                                                    <td className="px-6 py-3 whitespace-nowrap text-sm text-right text-gray-600 font-medium">
                                                                                        ₹{entry.credit} DR
                                                                                    </td>
                                                                                    <td className="px-6 py-3 text-right text-gray-400">-</td>
                                                                                </tr>
                                                                                <tr className="border-b border-gray-100">
                                                                                    <td></td>
                                                                                    <td className="px-6 py-3 whitespace-nowrap text-sm pl-16 text-indigo-600 font-bold">
                                                                                        From {entry.rawVoucher.vendor_name || selectedProcurementVendor.name} (Agst Ref: {entry.rawVoucher.against_reference || entry.rawVoucher.reference_number || '-'})
                                                                                    </td>
                                                                                    <td colSpan={2}></td>
                                                                                    <td className="px-6 py-3 text-right text-gray-400">-</td>
                                                                                    <td className="px-6 py-3 whitespace-nowrap text-sm text-right font-bold text-indigo-600">
                                                                                        ₹{entry.credit} CR
                                                                                    </td>
                                                                                </tr>
                                                                            </React.Fragment>
                                                                        )}
                                                                    </React.Fragment>
                                                                ))}
                                                                {filteredLedgerData.length === 0 && (
                                                                    <tr>
                                                                        <td colSpan={6} className="px-6 py-8 text-center text-sm text-gray-500 border-b border-slate-200">
                                                                            No journal entries found matching criteria.
                                                                        </td>
                                                                    </tr>
                                                                )}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            )}

                                            {procurementViewMode === 'month' && selectedProcurementVendor && (
                                                <div className="erp-card border border-slate-200 p-0">
                                                    <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 bg-gray-50">
                                                        <h3 className="section-title">{selectedProcurementVendor.name}</h3>
                                                        <div className="flex items-center space-x-3">
                                                            {/* Month Filter Dropdown */}
                                                            <div className="relative">
                                                                <button
                                                                    onClick={() => setIsMonthFilterOpen(!isMonthFilterOpen)}
                                                                    className="px-4 py-2 bg-white border border-gray-300 rounded-[4px] text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm transition-colors flex items-center justify-between min-w-[150px]"
                                                                >
                                                                    <span>{selectedMonths.length > 0 ? `${selectedMonths.length} Selected` : 'Select Month'}</span>
                                                                    <ChevronDown className="w-4 h-4 ml-2" />
                                                                </button>
                                                                {isMonthFilterOpen && (
                                                                    <div className="absolute right-0 mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                                                                        {(() => {
                                                                            const allMonths = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
                                                                            return (
                                                                                <>
                                                                                    <label className="flex items-center px-4 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 sticky top-0 bg-white z-10">
                                                                                        <input
                                                                                            type="checkbox"
                                                                                            checked={selectedMonths.length === allMonths.length}
                                                                                            onChange={() => {
                                                                                                if (selectedMonths.length === allMonths.length) {
                                                                                                    setSelectedMonths([]);
                                                                                                } else {
                                                                                                    setSelectedMonths(allMonths);
                                                                                                }
                                                                                            }}
                                                                                            className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                                                                                        />
                                                                                        <span className="ml-2 text-sm font-semibold text-gray-900">Select All</span>
                                                                                    </label>
                                                                                    {allMonths.map(month => (
                                                                                        <label key={month} className="flex items-center px-4 py-2 hover:bg-gray-50 cursor-pointer">
                                                                                            <input
                                                                                                type="checkbox"
                                                                                                checked={selectedMonths.includes(month)}
                                                                                                onChange={() => {
                                                                                                    if (selectedMonths.includes(month)) {
                                                                                                        setSelectedMonths(selectedMonths.filter(m => m !== month));
                                                                                                    } else {
                                                                                                        setSelectedMonths([...selectedMonths, month]);
                                                                                                    }
                                                                                                }}
                                                                                                className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                                                                                            />
                                                                                            <span className="ml-2 text-sm text-gray-700">{month}</span>
                                                                                        </label>
                                                                                    ))}
                                                                                </>
                                                                            );
                                                                        })()}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <button
                                                                onClick={() => setProcurementViewMode('journal')}
                                                                className="px-4 py-2 bg-white border border-gray-300 rounded-[4px] text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm transition-colors"
                                                            >
                                                                Journal View
                                                            </button>
                                                            <button
                                                                onClick={() => setProcurementViewMode('ledger')}
                                                                className="px-4 py-2 bg-white border border-gray-300 rounded-[4px] text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm transition-colors"
                                                            >
                                                                Bill-wise View
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {(() => {
                                                        const filteredMonthData = vendorMonthData.filter(entry => selectedMonths.length === 0 || selectedMonths.includes(entry.month));
                                                        const totalMonthDebit = filteredMonthData.reduce((sum, entry) => sum + (entry.debit !== '-' ? parseFloat(entry.debit.replace(/,/g, '')) : 0), 0);
                                                        const totalMonthCredit = filteredMonthData.reduce((sum, entry) => sum + (entry.credit !== '-' ? parseFloat(entry.credit.replace(/,/g, '')) : 0), 0);

                                                        return (
                                                            <div className="overflow-x-auto">
                                                                <table className="min-w-full divide-y divide-gray-200">
                                                                    <thead className="bg-[#F8F9FA]">
                                                                        <tr>
                                                                            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider w-1/4">MONTH</th>
                                                                            <th className="px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider w-1/4">DEBIT</th>
                                                                            <th className="px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider w-1/4">CREDIT</th>
                                                                            <th className="px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider w-1/4">CLOSING BALANCE</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="bg-white divide-y divide-gray-100">
                                                                        {filteredMonthData.map((entry, index) => {
                                                                            const rawBalance = entry.closingBalance !== '-' ? parseFloat(entry.closingBalance.replace(/,/g, '')) : 0;
                                                                            return (
                                                                                <tr
                                                                                    key={index}
                                                                                    onClick={() => handleMonthRowClick(entry.month)}
                                                                                    className="hover:bg-indigo-50 transition-colors group cursor-pointer"
                                                                                >
                                                                                    <td className="px-6 py-5 whitespace-nowrap text-sm font-bold text-gray-700 group-hover:text-indigo-600">{entry.month}</td>
                                                                                    <td className="px-6 py-5 whitespace-nowrap text-sm text-right text-gray-600 font-medium">{entry.debit !== '-' ? `₹${entry.debit}` : '-'}</td>
                                                                                    <td className="px-6 py-5 whitespace-nowrap text-sm text-right text-gray-600 font-medium">{entry.credit !== '-' ? `₹${entry.credit}` : '-'}</td>
                                                                                    <td className="px-6 py-5 whitespace-nowrap text-sm text-right font-bold text-gray-900">
                                                                                        {entry.closingBalance !== '-' ? (
                                                                                            <>
                                                                                                ₹{Math.abs(rawBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                                                                <span className="ml-1 text-gray-500 text-xs font-normal">
                                                                                                    {rawBalance >= 0 ? 'Dr' : 'Cr'}
                                                                                                </span>
                                                                                            </>
                                                                                        ) : '-'}
                                                                                    </td>
                                                                                </tr>
                                                                            );
                                                                        })}
                                                                        {filteredMonthData.length === 0 && (
                                                                            <tr>
                                                                                <td colSpan={4} className="px-6 py-8 text-center text-gray-500 text-sm">No matching months found</td>
                                                                            </tr>
                                                                        )}
                                                                    </tbody>
                                                                    <tfoot className="bg-[#F8F9FA]">
                                                                        <tr>
                                                                            <td className="px-6 py-5 text-sm font-bold text-gray-500 text-center tracking-wide">TOTAL</td>
                                                                            <td className="px-6 py-5 whitespace-nowrap text-sm text-right font-bold text-gray-900">₹{totalMonthDebit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                                            <td className="px-6 py-5 whitespace-nowrap text-sm text-right font-bold text-gray-900">₹{totalMonthCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                                            <td className="px-6 py-5 whitespace-nowrap text-sm text-right"></td>
                                                                        </tr>
                                                                    </tfoot>
                                                                </table>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTransactionSubTab === 'Payment' && (
                                <div>
                                    {activePaymentSubTab === 'Dashboard' ? (
                                        <div>
                                            <div className="mb-8">
                                                <h2 className="section-title">Payment Overview</h2>
                                                <p className="helper-text mt-1">Select a procurement category to manage payments.</p>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                                {allDisplayCategories.map(name => ({ name, desc: `Manage ${name.toLowerCase()} payments` }))
                                                    .map((item) => {
                                                        const pendingBillsList = paymentBills.filter(bill => bill.status !== 'Posted' && bill.category === item.name);
                                                        const totalPendingAmount = pendingBillsList.reduce((sum, bill) => {
                                                            const amount = parseFloat(bill.amount.replace(/[^0-9.-]+/g, ""));
                                                            return sum + amount;
                                                        }, 0);
                                                        const formattedTotal = totalPendingAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

                                                        return (
                                                            <div
                                                                key={item.name}
                                                                onClick={() => setActivePaymentSubTab(item.name as ProcurementSubTab)}
                                                                className="bg-white p-6 rounded-[4px] border border-gray-200 hover:border-indigo-500 hover:shadow-md cursor-pointer transition-all group"
                                                            >
                                                                <div className="flex items-center justify-between mb-4">
                                                                    <div className="p-3 rounded-[4px] bg-red-50 text-red-600 group-hover:bg-red-600 group-hover:text-white transition-colors">
                                                                        <Filter className="w-6 h-6" />
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="text-right mr-2">
                                                                            <p className="text-lg font-bold text-gray-800">{pendingBillsList.length}</p>
                                                                            <p className="text-[10px] text-red-600 font-semibold uppercase tracking-wider">Unpaid</p>
                                                                        </div>
                                                                        <ChevronLeft className="w-5 h-5 text-gray-300 group-hover:text-indigo-500 transform rotate-180 transition-all opacity-0 group-hover:opacity-100" />
                                                                    </div>
                                                                </div>
                                                                <div className="flex justify-between items-end">
                                                                    <div>
                                                                        <h3 className="text-lg font-bold text-gray-900 group-hover:text-indigo-600 transition-colors uppercase tracking-tight">{item.name}</h3>
                                                                        <p className="text-sm text-gray-500 mt-2">{item.desc}</p>
                                                                    </div>
                                                                    <div className="text-right">
                                                                        <p className="text-lg font-bold text-gray-900">{formattedTotal}</p>
                                                                        <p className="text-[10px] text-red-600 font-bold uppercase tracking-wider">Payable</p>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                            </div>
                                        </div>
                                    ) : selectedVoucherForView ? (
                                        /* ───────── INLINE VOUCHER DETAIL VIEW ───────── */
                                        <div className="space-y-6">
                                            {/* Header */}
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center space-x-4">
                                                    <button
                                                        onClick={() => setSelectedVoucherForView(null)}
                                                        className="p-2 hover:bg-gray-100 rounded-full transition-colors group"
                                                        title="Back to transactions"
                                                    >
                                                        <svg className="w-6 h-6 text-gray-500 group-hover:text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                                        </svg>
                                                    </button>
                                                    <div>
                                                        <div className="flex items-center space-x-2 text-sm text-gray-500 mb-1">
                                                            <button onClick={() => setActivePaymentSubTab('Dashboard')} className="hover:text-indigo-600 hover:underline">Payment</button>
                                                            <span>/</span>
                                                            <button onClick={() => setSelectedVoucherForView(null)} className="hover:text-indigo-600 hover:underline">{activePaymentSubTab}</button>
                                                            <span>/</span>
                                                            <span className="text-indigo-600 font-semibold">{selectedVoucherForView.voucherNo}</span>
                                                        </div>
                                                        <h2 className="text-2xl font-bold text-gray-800">Voucher Details</h2>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => window.print()}
                                                    className="px-4 py-2 border border-slate-200 rounded-[4px] text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 flex items-center gap-2"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                                    </svg>
                                                    Print
                                                </button>
                                            </div>

                                            {/* Voucher Card */}
                                            <div className="bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden">
                                                <div className="h-2 bg-gradient-to-r from-indigo-600 to-indigo-400"></div>
                                                <div className="p-8">
                                                    {/* Voucher Header Row */}
                                                    <div className="flex justify-between items-start mb-8 pb-8 border-b border-slate-100">
                                                        <div>
                                                            <div className="flex items-center gap-3 mb-3">
                                                                <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-black text-lg shadow">V</div>
                                                                <div>
                                                                    <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Payment Voucher</h3>
                                                                    <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">{selectedVoucherForView.category}</p>
                                                                </div>
                                                            </div>
                                                            <span className={`inline-flex px-3 py-1 text-xs font-bold rounded-full uppercase tracking-wider ${selectedVoucherForView.status === 'Posted' ? 'bg-emerald-100 text-emerald-800' :
                                                                selectedVoucherForView.status === 'Approved' ? 'bg-blue-100 text-blue-800' :
                                                                    selectedVoucherForView.status === 'Initiated' ? 'bg-purple-100 text-purple-800' :
                                                                        'bg-amber-100 text-amber-800'
                                                                }`}>
                                                                {selectedVoucherForView.status}
                                                            </span>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Voucher Number</p>
                                                            <p className="text-3xl font-black text-indigo-600 tabular-nums">{selectedVoucherForView.voucherNo}</p>
                                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-3 mb-1">Date</p>
                                                            <p className="text-base font-bold text-slate-900">{formatDate(selectedVoucherForView.date)}</p>
                                                        </div>
                                                    </div>

                                                    {/* Payee and Amount */}
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                                                        <div className="bg-slate-50 rounded-xl p-6 border border-slate-100">
                                                            <h4 className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-4">Payee Details</h4>
                                                            <p className="text-xl font-black text-slate-900 mb-4">{selectedVoucherForView.vendorReferenceName}</p>
                                                            <div className="space-y-3 pt-4 border-t border-slate-200">
                                                                <div className="flex justify-between items-center">
                                                                    <span className="text-sm text-slate-500">Supplier Invoice No.</span>
                                                                    <span className="text-sm font-bold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">{selectedVoucherForView.supplierInvoiceNo}</span>
                                                                </div>
                                                                <div className="flex justify-between items-center">
                                                                    <span className="text-sm text-slate-500">Procurement Category</span>
                                                                    <span className="text-sm font-bold text-slate-800">{selectedVoucherForView.category}</span>
                                                                </div>
                                                                <div className="flex justify-between items-center">
                                                                    <span className="text-sm text-slate-500">Voucher Date</span>
                                                                    <span className="text-sm font-bold text-slate-800">{formatDate(selectedVoucherForView.date)}</span>
                                                                </div>
                                                                <div className="flex justify-between items-center">
                                                                    <span className="text-sm text-slate-500">Status</span>
                                                                    <span className="text-sm font-bold text-slate-800">{selectedVoucherForView.status}</span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="bg-indigo-600 rounded-xl p-6 text-white flex flex-col justify-center items-center text-center shadow-lg shadow-indigo-200">
                                                            <p className="text-[10px] font-black opacity-70 uppercase tracking-widest mb-2">Net Payable Amount</p>
                                                            <p className="text-5xl font-black tracking-tight tabular-nums">{selectedVoucherForView.amount}</p>
                                                            <div className="mt-4 flex items-center gap-2">
                                                                <div className="w-2 h-2 rounded-full bg-indigo-300 animate-pulse"></div>
                                                                <p className="text-[10px] font-bold opacity-60 uppercase">Ready for disbursement</p>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Transaction Breakdown Table */}
                                                    <div className="mb-8">
                                                        <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-3">
                                                            <span className="flex-grow h-px bg-slate-100 block"></span>
                                                            Transaction Breakdown
                                                            <span className="flex-grow h-px bg-slate-100 block"></span>
                                                        </h4>
                                                        <div className="rounded-xl border border-slate-100 overflow-hidden">
                                                            <table className="w-full text-sm">
                                                                <thead>
                                                                    <tr className="bg-slate-50">
                                                                        <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Particulars</th>
                                                                        <th className="px-6 py-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">Document Ref</th>
                                                                        <th className="px-6 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Amount</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-slate-100">
                                                                    <tr className="hover:bg-indigo-50/30 transition-colors">
                                                                        <td className="px-6 py-5">
                                                                            <p className="font-bold text-slate-900 mb-1">Settlement of Purchase Invoice</p>
                                                                            <p className="text-xs text-slate-500">Vendor: {selectedVoucherForView.vendorReferenceName}</p>
                                                                        </td>
                                                                        <td className="px-6 py-5 text-center">
                                                                            <span className="px-3 py-1 bg-slate-100 rounded text-xs font-bold text-slate-600">{selectedVoucherForView.supplierInvoiceNo}</span>
                                                                        </td>
                                                                        <td className="px-6 py-5 text-right font-black text-slate-900">{selectedVoucherForView.amount}</td>
                                                                    </tr>
                                                                    <tr className="bg-slate-50">
                                                                        <td colSpan={2} className="px-6 py-4 text-right text-xs font-bold text-slate-500 uppercase">Gross Total</td>
                                                                        <td className="px-6 py-4 text-right font-black text-slate-900">{selectedVoucherForView.amount}</td>
                                                                    </tr>
                                                                    <tr className="bg-slate-900 text-white">
                                                                        <td colSpan={2} className="px-6 py-5 text-right font-black text-sm uppercase tracking-widest">Grand Total</td>
                                                                        <td className="px-6 py-5 text-right text-2xl font-black">{selectedVoucherForView.amount}</td>
                                                                    </tr>
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>

                                                    {/* Audit Trail */}
                                                    {selectedVoucherForView.actionLog && selectedVoucherForView.actionLog.length > 0 && (
                                                        <div className="mb-8">
                                                            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-3">
                                                                <span className="flex-grow h-px bg-slate-100 block"></span>
                                                                Audit Trail
                                                                <span className="flex-grow h-px bg-slate-100 block"></span>
                                                            </h4>
                                                            <div className="space-y-3">
                                                                {selectedVoucherForView.actionLog.slice().reverse().map((log, i) => (
                                                                    <div key={i} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100 hover:border-indigo-200 transition-colors">
                                                                        <div className="flex items-center gap-3">
                                                                            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-black text-xs uppercase">
                                                                                {log.user.charAt(0)}
                                                                            </div>
                                                                            <div>
                                                                                <p className="text-xs font-black text-slate-800 uppercase tracking-tight">{log.action}</p>
                                                                                <p className="text-[10px] text-slate-400">By {log.user}</p>
                                                                            </div>
                                                                        </div>
                                                                        <p className="text-xs font-bold text-slate-500">{log.date}</p>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Signature Footer */}
                                                    <div className="mt-10 pt-8 border-t border-slate-100 grid grid-cols-3 gap-8 text-center">
                                                        <div>
                                                            <div className="h-px bg-slate-200 w-full mb-6"></div>
                                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Authorized Signatory</p>
                                                        </div>
                                                        <div>
                                                            <div className="h-px bg-slate-200 w-full mb-6"></div>
                                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Receiver's Signature</p>
                                                        </div>
                                                        <div>
                                                            <div className="h-px bg-slate-200 w-full mb-6"></div>
                                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Voucher Verified By</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Back link */}
                                            <div className="text-center pb-8">
                                                <button
                                                    onClick={() => setSelectedVoucherForView(null)}
                                                    className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-800 font-bold text-sm transition-colors"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                                    </svg>
                                                    Back to Transactions
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        /* ───────── TRANSACTION LIST ───────── */
                                        <div>
                                            <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
                                                <div className="flex items-center gap-4">
                                                    <button
                                                        onClick={() => { setActivePaymentSubTab('Dashboard'); setSelectedVoucherForView(null); }}
                                                        className="p-2 hover:bg-gray-100 rounded-[4px] transition-colors"
                                                        title="Back to Dashboard"
                                                    >
                                                        <ChevronLeft className="w-5 h-5 text-gray-600" />
                                                    </button>
                                                    <div>
                                                        <div className="flex items-center space-x-2 text-xs text-gray-400 mb-1 uppercase tracking-widest font-semibold">
                                                            <span>Payment</span>
                                                            <span className="text-gray-300">/</span>
                                                            <span className="text-indigo-500 font-bold">{activePaymentSubTab}</span>
                                                        </div>
                                                        <h3 className="text-xl font-bold text-gray-900">{activePaymentSubTab}</h3>
                                                    </div>
                                                </div>
                                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                                                    <div className="relative group min-w-[280px]">
                                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-indigo-500 transition-colors" />
                                                        <input
                                                            type="text"
                                                            placeholder={`Search in ${activePaymentSubTab}...`}
                                                            value={paymentSearchTerm}
                                                            onChange={(e) => setPaymentSearchTerm(e.target.value)}
                                                            className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-[4px] text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all shadow-sm"
                                                        />
                                                        {paymentSearchTerm && (
                                                            <button
                                                                onClick={() => setPaymentSearchTerm('')}
                                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                                            >
                                                                <X className="w-3 h-3" />
                                                            </button>
                                                        )}
                                                    </div>
                                                    <select
                                                        value={paymentSortOrder}
                                                        onChange={(e) => setPaymentSortOrder(e.target.value as 'recent' | 'earliest')}
                                                        className="px-4 py-2 bg-white border border-slate-200 rounded-[4px] text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                                                    >
                                                        <option value="recent">Recent First</option>
                                                        <option value="earliest">Earliest First</option>
                                                    </select>
                                                </div>
                                            </div>

                                            {/* Payment Bills Table */}
                                            <div className="erp-card border border-slate-200 overflow-hidden">
                                                <div className="overflow-x-auto">
                                                    <table className="erp-table min-w-full">
                                                        <thead className="bg-[#F8F9FA]">
                                                            <tr>
                                                                {[
                                                                    { label: 'DATE', key: 'date', width: '120px' },
                                                                    { label: 'VENDOR REFERENCE NAME', key: 'vendorReferenceName' },
                                                                    { label: 'BRANCH', key: 'branch', width: '130px' },
                                                                    { label: 'VOUCHER NO', key: 'voucherNo', width: '140px' },
                                                                    { label: 'SUPPLIER INVOICE NO.', key: 'supplierInvoiceNo', width: '150px' },
                                                                    { label: 'AMOUNT', key: 'amount', width: '130px' },
                                                                    { label: 'APPROVE', key: 'approve', width: '100px' },
                                                                    { label: 'ACTION', key: 'action', width: '140px' },
                                                                    { label: 'STATUS', key: 'status', width: '120px' },
                                                                    { label: 'VIEW', key: 'view', width: '60px' }
                                                                ].map((header) => (
                                                                    <th key={header.key} className="px-6 py-4 text-left text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-[#F8F9FA] sticky top-0 z-10" style={{ width: header.width }}>
                                                                        <div className="flex items-center justify-between group">
                                                                            <span>{header.label}</span>
                                                                            {!['approve', 'action', 'view'].includes(header.key) && (
                                                                                <div className="relative">
                                                                                    <button
                                                                                        onClick={() => toggleFilter(`pay-${header.key}`)}
                                                                                        className={`p-1 rounded hover:bg-gray-200 transition-colors ${paymentBillFilters[header.key as keyof typeof paymentBillFilters] ? 'text-indigo-600 bg-indigo-50' : 'text-gray-300'}`}
                                                                                    >
                                                                                        <Filter className="w-3 h-3" />
                                                                                    </button>
                                                                                    {activeFilter === `pay-${header.key}` && (
                                                                                        <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-md shadow-xl z-50 p-2 normal-case tracking-normal">
                                                                                            <input
                                                                                                autoFocus
                                                                                                type={header.key === 'date' ? 'date' : 'text'}
                                                                                                className="w-full px-2 py-1 text-xs text-gray-700 border border-gray-200 rounded focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                                                                                                placeholder={`Filter ${header.label}...`}
                                                                                                value={paymentBillFilters[header.key as keyof typeof paymentBillFilters] || ''}
                                                                                                onChange={(e) => setPaymentBillFilters({ ...paymentBillFilters, [header.key]: e.target.value })}
                                                                                            />
                                                                                            {header.key === 'date' && paymentBillFilters.date && (
                                                                                                <button
                                                                                                    onClick={() => setPaymentBillFilters({ ...paymentBillFilters, date: '' })}
                                                                                                    className="mt-2 w-full text-[10px] text-gray-500 hover:text-red-500 uppercase tracking-wider font-bold text-center border-t border-gray-100 pt-1"
                                                                                                >
                                                                                                    Clear Date
                                                                                                </button>
                                                                                            )}
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </th>
                                                                ))}
                                                            </tr>
                                                        </thead>
                                                        <tbody className="bg-white divide-y divide-gray-100">
                                                            {[...paymentBills]
                                                                .filter(bill => {
                                                                    if (bill.status === 'Posted' || bill.category !== activePaymentSubTab) return false;

                                                                    if (paymentSearchTerm) {
                                                                        const st = paymentSearchTerm.toLowerCase();
                                                                        const matchesSearch =
                                                                            bill.vendorReferenceName.toLowerCase().includes(st) ||
                                                                            bill.voucherNo.toLowerCase().includes(st) ||
                                                                            bill.supplierInvoiceNo.toLowerCase().includes(st);
                                                                        if (!matchesSearch) return false;
                                                                    }

                                                                    const matchesDate = bill.date.toLowerCase().includes(paymentBillFilters.date.toLowerCase());
                                                                    const matchesVendor = bill.vendorReferenceName.toLowerCase().includes(paymentBillFilters.vendorReferenceName.toLowerCase());
                                                                    const matchesBranch = (bill.branch || '').toLowerCase().includes(paymentBillFilters.branch.toLowerCase());
                                                                    const matchesVoucher = bill.voucherNo.toLowerCase().includes(paymentBillFilters.voucherNo.toLowerCase());
                                                                    const matchesInvoice = bill.supplierInvoiceNo.toLowerCase().includes(paymentBillFilters.supplierInvoiceNo.toLowerCase());
                                                                    const matchesAmount = bill.amount.toLowerCase().includes(paymentBillFilters.amount.toLowerCase());
                                                                    const matchesStatus = bill.status.toLowerCase().includes(paymentBillFilters.status.toLowerCase());
                                                                    return matchesDate && matchesVendor && matchesBranch && matchesVoucher && matchesInvoice && matchesAmount && matchesStatus;
                                                                })
                                                                .sort((a, b) => {
                                                                    const dateA = new Date(a.date).getTime();
                                                                    const dateB = new Date(b.date).getTime();
                                                                    return paymentSortOrder === 'recent' ? dateB - dateA : dateA - dateB;
                                                                })
                                                                .map((bill) => (
                                                                    <tr key={bill.id} className="hover:bg-gray-50 transition-colors">
                                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatDate(bill.date)}</td>
                                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{bill.vendorReferenceName}</td>
                                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{bill.branch || '-'}</td>
                                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{bill.voucherNo}</td>
                                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{bill.supplierInvoiceNo}</td>
                                                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{bill.amount}</td>

                                                                        {/* Approve Column */}
                                                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                                            {bill.status !== 'Posted' && (
                                                                                <button
                                                                                    onClick={() => {
                                                                                        const now = new Date();
                                                                                        const formattedDate = now.toLocaleDateString() + ' ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                                                                        const newStatus = bill.status === 'Approved' ? 'Pending' : 'Approved';
                                                                                        const actionType = newStatus === 'Approved' ? 'Approved' : 'Unapproved';
                                                                                        setPaymentBills(paymentBills.map(b =>
                                                                                            b.id === bill.id
                                                                                                ? { ...b, status: newStatus, actionLog: [...(b.actionLog || []), { action: actionType, user: 'Current User', date: formattedDate }] }
                                                                                                : b
                                                                                        ));
                                                                                    }}
                                                                                    className={`px-3 py-1 text-white text-xs rounded ${bill.status === 'Approved' || bill.status === 'Initiated' ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                                                                                    title={bill.status === 'Approved' || bill.status === 'Initiated' ? "Unapprove" : "Approve (Super users only)"}
                                                                                >
                                                                                    {bill.status === 'Approved' || bill.status === 'Initiated' ? 'Unapprove' : 'Approve'}
                                                                                </button>
                                                                            )}
                                                                        </td>

                                                                        {/* Action Column */}
                                                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                                            <div className="flex flex-col space-y-2">
                                                                                {bill.status !== 'Posted' && (
                                                                                    <>
                                                                                        <button
                                                                                            onClick={() => { setSelectedBillForPayment(bill); setShowPostPaymentModal(true); }}
                                                                                            className="px-3 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700"
                                                                                        >
                                                                                            Initiate &amp; Post
                                                                                        </button>
                                                                                        <button
                                                                                            onClick={() => { setSelectedBillForPayment(bill); setShowPostPaymentModal(true); }}
                                                                                            className="px-3 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700"
                                                                                        >
                                                                                            Post
                                                                                        </button>
                                                                                    </>
                                                                                )}
                                                                            </div>
                                                                        </td>

                                                                        {/* Status Column */}
                                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                                            <div className="flex items-center space-x-2">
                                                                                <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-[4px] ${bill.status === 'Posted' ? 'bg-slate-100 text-slate-700' :
                                                                                    bill.status === 'Approved' ? 'bg-blue-100 text-slate-700' :
                                                                                        bill.status === 'Initiated' ? 'bg-purple-100 text-purple-800' :
                                                                                            'bg-yellow-100 text-yellow-800'
                                                                                    }`}>
                                                                                    {bill.status}
                                                                                </span>
                                                                                {bill.actionLog && bill.actionLog.length > 0 && (
                                                                                    <button
                                                                                        onClick={() => {
                                                                                            const logMessages = bill.actionLog?.map(log => `${log.action} by ${log.user} on ${formatDate(log.date)}`).join('\n');
                                                                                            showInfo(`Action History:\n\n${logMessages}`);
                                                                                        }}
                                                                                        className="text-gray-500 hover:text-indigo-600 focus:outline-none transition-colors"
                                                                                        title="View Action History"
                                                                                    >
                                                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                                                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                                                                        </svg>
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                        </td>

                                                                        {/* View Voucher Column */}
                                                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                                            <button
                                                                                onClick={() => handleViewVoucher(bill)}
                                                                                className="text-indigo-600 hover:text-indigo-900 transition-colors p-1 rounded-full hover:bg-indigo-50"
                                                                                title="View Voucher Detail"
                                                                            >
                                                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                                                </svg>
                                                                            </button>
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}


                            {/* Create PO Modal */}
                            {
                                showCreatePOModal && (
                                    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                                        <div className="relative top-10 mx-auto p-8 border w-11/12 max-w-6xl shadow-none border border-slate-200 rounded-[4px] bg-white mb-20">
                                            <div className="flex justify-between items-center mb-6">
                                                <h3 className="section-title">Create PO</h3>
                                                <button
                                                    onClick={() => setShowCreatePOModal(false)}
                                                    className="text-gray-400 hover:text-gray-500"
                                                >
                                                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                </button>
                                            </div>

                                            <div className="space-y-6">
                                                {/* Consolidated Form Fields */}
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                    <div>
                                                        <label className="label-text">PO Series Name</label>
                                                        <select
                                                            value={createPOForm.poSeriesName}
                                                            onChange={(e) => handleCreatePOFormChange('poSeriesName', e.target.value)}
                                                            className="w-full px-3 py-2 border border-slate-200 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                        >
                                                            <option value="">Select</option>
                                                            {poSeriesList.map((series) => (
                                                                <option key={series.id} value={series.id}>
                                                                    {series.name}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>

                                                    <div>
                                                        <label className="label-text">PO #</label>
                                                        <input
                                                            type="text"
                                                            value={createPOForm.poNumber}
                                                            readOnly
                                                            className="w-full px-3 py-2 border border-slate-200 rounded-[4px] bg-gray-50 text-gray-500 cursor-not-allowed focus:outline-none"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="label-text">PO Date</label>
                                                        <input
                                                            type="date"
                                                            value={createPOForm.poDate}
                                                            max={new Date().toISOString().split('T')[0]} // Restrict future date
                                                            onChange={(e) => handleCreatePOFormChange('poDate', e.target.value)}
                                                            className="w-full px-3 py-2 border border-slate-200 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="label-text">Vendor Name</label>
                                                        <select
                                                            value={createPOForm.vendorName}
                                                            onChange={(e) => handleCreatePOFormChange('vendorName', e.target.value)}
                                                            className="w-full px-3 py-2 border border-slate-200 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                        >
                                                            <option value="">Select Vendor</option>
                                                            {vendorList.map((vendor) => (
                                                                <option key={vendor.id} value={vendor.vendor_name}>
                                                                    {vendor.vendor_name}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>

                                                    <div>
                                                        <label className="label-text">Branch</label>
                                                        <select
                                                            value={createPOForm.branch}
                                                            onChange={(e) => handleCreatePOFormChange('branch', e.target.value)}
                                                            className="w-full px-3 py-2 border border-slate-200 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                        >
                                                            <option value="">Select Branch</option>
                                                            {availableBranches.map((branch: any) => (
                                                                <option key={branch.id} value={branch.reference_name || branch.id}>
                                                                    {branch.reference_name || 'Main Branch'}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>

                                                    <div className="col-span-1 md:col-span-2">
                                                        <label className="label-text">Address Line 1</label>
                                                        <input
                                                            type="text"
                                                            value={createPOForm.addressLine1}
                                                            onChange={(e) => handleCreatePOFormChange('addressLine1', e.target.value)}
                                                            className="w-full px-3 py-2 border border-slate-200 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                        />
                                                    </div>

                                                    <div className="col-span-1 md:col-span-2">
                                                        <label className="label-text">Address Line 2</label>
                                                        <input
                                                            type="text"
                                                            value={createPOForm.addressLine2}
                                                            onChange={(e) => handleCreatePOFormChange('addressLine2', e.target.value)}
                                                            className="w-full px-3 py-2 border border-slate-200 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                        />
                                                    </div>

                                                    <div className="col-span-1 md:col-span-2">
                                                        <label className="label-text">Address Line 3</label>
                                                        <input
                                                            type="text"
                                                            value={createPOForm.addressLine3}
                                                            onChange={(e) => handleCreatePOFormChange('addressLine3', e.target.value)}
                                                            className="w-full px-3 py-2 border border-slate-200 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="label-text">City</label>
                                                        <input
                                                            type="text"
                                                            value={createPOForm.city}
                                                            onChange={(e) => handleCreatePOFormChange('city', e.target.value)}
                                                            className="w-full px-3 py-2 border border-slate-200 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="label-text">State</label>
                                                        <input
                                                            type="text"
                                                            value={createPOForm.state}
                                                            onChange={(e) => handleCreatePOFormChange('state', e.target.value)}
                                                            className="w-full px-3 py-2 border border-slate-200 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="label-text">Country</label>
                                                        <input
                                                            type="text"
                                                            value={createPOForm.country}
                                                            onChange={(e) => handleCreatePOFormChange('country', e.target.value)}
                                                            className="w-full px-3 py-2 border border-slate-200 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="label-text">Pincode</label>
                                                        <input
                                                            type="text"
                                                            value={createPOForm.pincode}
                                                            onChange={(e) => handleCreatePOFormChange('pincode', e.target.value)}
                                                            className="w-full px-3 py-2 border border-slate-200 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="label-text">Email Address</label>
                                                        <input
                                                            type="email"
                                                            value={createPOForm.emailAddress}
                                                            onChange={(e) => handleCreatePOFormChange('emailAddress', e.target.value)}
                                                            className="w-full px-3 py-2 border border-slate-200 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="label-text">Contract No</label>
                                                        <input
                                                            type="text"
                                                            value={createPOForm.contractNo}
                                                            onChange={(e) => handleCreatePOFormChange('contractNo', e.target.value)}
                                                            className="w-full px-3 py-2 border border-slate-200 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                        />
                                                    </div>
                                                </div>

                                                {/* Items Section */}
                                                <div>
                                                    <div className="flex justify-between items-center mb-4">
                                                        <div className="flex items-center space-x-6">
                                                            <h4 className="section-title mb-0">Items</h4>
                                                            <div className="flex items-center space-x-4 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200">
                                                                <span className="text-sm font-medium text-gray-700">Supply Type:</span>
                                                                <label className="inline-flex items-center cursor-pointer">
                                                                    <input
                                                                        type="radio"
                                                                        className="form-radio text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                                                                        name="supplyType"
                                                                        value="intrastate"
                                                                        checked={createPOForm.supplyType === 'intrastate'}
                                                                        onChange={(e) => handleCreatePOFormChange('supplyType', e.target.value)}
                                                                    />
                                                                    <span className="ml-2 text-sm text-gray-700">Intrastate (CGST/SGST)</span>
                                                                </label>
                                                                <label className="inline-flex items-center cursor-pointer">
                                                                    <input
                                                                        type="radio"
                                                                        className="form-radio text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                                                                        name="supplyType"
                                                                        value="interstate"
                                                                        checked={createPOForm.supplyType === 'interstate'}
                                                                        onChange={(e) => handleCreatePOFormChange('supplyType', e.target.value)}
                                                                    />
                                                                    <span className="ml-2 text-sm text-gray-700">Interstate (IGST)</span>
                                                                </label>
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={handleAddPOItem}
                                                            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-[4px] text-white bg-indigo-600 hover:bg-indigo-700"
                                                        >
                                                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                                            </svg>
                                                            Add Item
                                                        </button>
                                                    </div>

                                                    <div className="overflow-x-auto">
                                                        <table className="min-w-full divide-y divide-gray-200 border border-slate-200">
                                                            <thead className="bg-gray-50">
                                                                <tr>
                                                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item Code</th>
                                                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item Name</th>
                                                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Supplier Item Code</th>
                                                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
                                                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">UQC</th>
                                                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Base Price</th>
                                                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Final Rate</th>
                                                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Taxable Value</th>
                                                                    {createPOForm.supplyType === 'interstate' ? (
                                                                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">IGST</th>
                                                                    ) : (
                                                                        <>
                                                                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CGST</th>
                                                                            <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SGST/UTGST</th>
                                                                        </>
                                                                    )}
                                                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cess</th>
                                                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice Value</th>
                                                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="bg-white divide-y divide-gray-200">
                                                                {poItems.map((item, index) => (
                                                                    <tr key={item.id}>
                                                                        <td className="px-3 py-2">
                                                                            <select
                                                                                value={item.itemCode}
                                                                                onChange={(e) => {
                                                                                    const selectedCode = e.target.value;
                                                                                    const selectedInvItem = inventoryItems.find(i => i.item_code === selectedCode);
                                                                                    const supplyType = createPOForm.supplyType || 'intrastate';
                                                                                    setPOItems(prevItems => prevItems.map(pItem => {
                                                                                        if (pItem.id === item.id) {
                                                                                            const gstRateVal = selectedInvItem ? parseFloat(selectedInvItem.gst_rate as string) || 0 : 0;
                                                                                            const cessRateVal = selectedInvItem ? parseFloat(selectedInvItem.cess_rate as string) || 0 : 0;
                                                                                            const taxableVal = parseFloat(pItem.taxableValue) || 0;

                                                                                            let igstAmt = 0, cgstAmt = 0, sgstAmt = 0;
                                                                                            if (supplyType === 'interstate') {
                                                                                                igstAmt = (taxableVal * gstRateVal) / 100;
                                                                                            } else {
                                                                                                cgstAmt = (taxableVal * gstRateVal) / 2 / 100;
                                                                                                sgstAmt = (taxableVal * gstRateVal) / 2 / 100;
                                                                                            }
                                                                                            const cessAmt = (taxableVal * cessRateVal) / 100;

                                                                                            return {
                                                                                                ...pItem,
                                                                                                itemCode: selectedCode,
                                                                                                itemName: selectedInvItem ? (selectedInvItem.item_name || '') : '',
                                                                                                uom: selectedInvItem ? (selectedInvItem.uom || selectedInvItem.unit || '') : '',
                                                                                                gstRate: gstRateVal.toString(),
                                                                                                cessRate: cessRateVal.toString(),
                                                                                                igst: igstAmt.toFixed(2),
                                                                                                cgst: cgstAmt.toFixed(2),
                                                                                                sgst: sgstAmt.toFixed(2),
                                                                                                cess: cessAmt.toFixed(2),
                                                                                                netValue: (taxableVal + igstAmt + cgstAmt + sgstAmt + cessAmt).toFixed(2),
                                                                                            };
                                                                                        }
                                                                                        return pItem;
                                                                                    }));
                                                                                }}
                                                                                className="w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                                            >
                                                                                <option value="">Select Item Code</option>
                                                                                {inventoryItems.map((invItem) => (
                                                                                    <option key={invItem.id} value={invItem.item_code}>
                                                                                        {invItem.item_code}
                                                                                    </option>
                                                                                ))}
                                                                            </select>
                                                                        </td>
                                                                        <td className="px-3 py-2">
                                                                            <select
                                                                                value={item.itemName}
                                                                                onChange={(e) => {
                                                                                    const selectedName = e.target.value;
                                                                                    const selectedInvItem = inventoryItems.find(i => i.item_name === selectedName);
                                                                                    const supplyType = createPOForm.supplyType || 'intrastate';
                                                                                    setPOItems(prevItems => prevItems.map(pItem => {
                                                                                        if (pItem.id === item.id) {
                                                                                            const gstRateVal = selectedInvItem ? parseFloat(selectedInvItem.gst_rate as string) || 0 : 0;
                                                                                            const cessRateVal = selectedInvItem ? parseFloat(selectedInvItem.cess_rate as string) || 0 : 0;
                                                                                            const taxableVal = parseFloat(pItem.taxableValue) || 0;

                                                                                            let igstAmt = 0, cgstAmt = 0, sgstAmt = 0;
                                                                                            if (supplyType === 'interstate') {
                                                                                                igstAmt = (taxableVal * gstRateVal) / 100;
                                                                                            } else {
                                                                                                cgstAmt = (taxableVal * gstRateVal) / 2 / 100;
                                                                                                sgstAmt = (taxableVal * gstRateVal) / 2 / 100;
                                                                                            }
                                                                                            const cessAmt = (taxableVal * cessRateVal) / 100;

                                                                                            return {
                                                                                                ...pItem,
                                                                                                itemCode: selectedInvItem ? (selectedInvItem.item_code || '') : '',
                                                                                                itemName: selectedName,
                                                                                                uom: selectedInvItem ? (selectedInvItem.uom || selectedInvItem.unit || '') : '',
                                                                                                gstRate: gstRateVal.toString(),
                                                                                                cessRate: cessRateVal.toString(),
                                                                                                igst: igstAmt.toFixed(2),
                                                                                                cgst: cgstAmt.toFixed(2),
                                                                                                sgst: sgstAmt.toFixed(2),
                                                                                                cess: cessAmt.toFixed(2),
                                                                                                netValue: (taxableVal + igstAmt + cgstAmt + sgstAmt + cessAmt).toFixed(2),
                                                                                            };
                                                                                        }
                                                                                        return pItem;
                                                                                    }));
                                                                                }}
                                                                                className="w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                                            >
                                                                                <option value="">Select Item Name</option>
                                                                                {inventoryItems.map((invItem) => (
                                                                                    <option key={invItem.id} value={invItem.item_name}>
                                                                                        {invItem.item_name}
                                                                                    </option>
                                                                                ))}
                                                                            </select>
                                                                        </td>
                                                                        <td className="px-3 py-2">
                                                                            <input
                                                                                type="text"
                                                                                value={item.supplierItemCode}
                                                                                onChange={(e) => handlePOItemChange(item.id, 'supplierItemCode', e.target.value)}
                                                                                className="w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                                            />
                                                                        </td>
                                                                        <td className="px-3 py-2">
                                                                            <input
                                                                                type="text"
                                                                                value={item.quantity}
                                                                                onChange={(e) => handlePOItemChange(item.id, 'quantity', e.target.value)}
                                                                                className="w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                                            />
                                                                        </td>
                                                                        <td className="px-3 py-2">
                                                                            {(() => {
                                                                                const selectedInvItem = inventoryItems.find(i => i.item_code === item.itemCode);
                                                                                const units = selectedInvItem
                                                                                    ? [selectedInvItem.uom, selectedInvItem.alternate_uom].filter((u): u is string => Boolean(u))
                                                                                    : [];

                                                                                return (
                                                                                    <select
                                                                                        value={item.uom}
                                                                                        onChange={(e) => handlePOItemChange(item.id, 'uom', e.target.value)}
                                                                                        className="w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                                                    >
                                                                                        <option value="">Select UQC</option>
                                                                                        {units.length > 0 ? (
                                                                                            units.map((u, i) => <option key={i} value={u}>{u}</option>)
                                                                                        ) : (
                                                                                            item.uom ? <option value={item.uom}>{item.uom}</option> : null
                                                                                        )}
                                                                                    </select>
                                                                                );
                                                                            })()}
                                                                        </td>
                                                                        <td className="px-3 py-2">
                                                                            <input
                                                                                type="text"
                                                                                value={item.negotiatedRate}
                                                                                onChange={(e) => handlePOItemChange(item.id, 'negotiatedRate', e.target.value)}
                                                                                className="w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                                            />
                                                                        </td>
                                                                        <td className="px-3 py-2">
                                                                            <input
                                                                                type="text"
                                                                                value={item.finalRate}
                                                                                onChange={(e) => handlePOItemChange(item.id, 'finalRate', e.target.value)}
                                                                                className="w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                                            />
                                                                        </td>
                                                                        <td className="px-3 py-2">
                                                                            <input
                                                                                type="text"
                                                                                value={item.taxableValue}
                                                                                readOnly
                                                                                className="w-full px-2 py-1 text-sm border border-slate-200 rounded bg-gray-50 focus:outline-none"
                                                                            />
                                                                        </td>
                                                                        {createPOForm.supplyType === 'interstate' ? (
                                                                            <td className="px-3 py-2">
                                                                                <div className="w-full px-2 py-1 text-sm border border-slate-200 rounded bg-gray-50 text-gray-700 min-h-[28px] flex items-center">
                                                                                    {item.igst || '0.00'}
                                                                                </div>
                                                                            </td>
                                                                        ) : (
                                                                            <>
                                                                                <td className="px-3 py-2">
                                                                                    <div className="w-full px-2 py-1 text-sm border border-slate-200 rounded bg-gray-50 text-gray-700 min-h-[28px] flex items-center">
                                                                                        {item.cgst || '0.00'}
                                                                                    </div>
                                                                                </td>
                                                                                <td className="px-3 py-2">
                                                                                    <div className="w-full px-2 py-1 text-sm border border-slate-200 rounded bg-gray-50 text-gray-700 min-h-[28px] flex items-center">
                                                                                        {item.sgst || '0.00'}
                                                                                    </div>
                                                                                </td>
                                                                            </>
                                                                        )}
                                                                        <td className="px-3 py-2">
                                                                            <div className="w-full px-2 py-1 text-sm border border-slate-200 rounded bg-gray-50 text-gray-700 min-h-[28px] flex items-center">
                                                                                {item.cess || '0.00'}
                                                                            </div>
                                                                        </td>
                                                                        <td className="px-3 py-2">
                                                                            <input
                                                                                type="text"
                                                                                value={item.netValue}
                                                                                readOnly
                                                                                className="w-full px-2 py-1 text-sm border border-slate-200 rounded bg-gray-50 focus:outline-none"
                                                                            />
                                                                        </td>
                                                                        <td className="px-3 py-2">
                                                                            <button
                                                                                onClick={() => handleRemovePOItem(item.id)}
                                                                                className="text-red-600 hover:text-red-900"
                                                                                disabled={poItems.length === 1}
                                                                            >
                                                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                                </svg>
                                                                            </button>
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>

                                                {/* Summary Section */}
                                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
                                                    <div>
                                                        <label className="label-text">Total Taxable Value</label>
                                                        <input
                                                            type="text"
                                                            value={poItems.reduce((sum, item) => sum + (parseFloat(item.taxableValue) || 0), 0).toFixed(2)}
                                                            readOnly
                                                            className="w-full px-3 py-2 border border-slate-200 rounded-[4px] bg-gray-50 focus:outline-none"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="label-text">Total Tax</label>
                                                        <input
                                                            type="text"
                                                            value={poItems.reduce((sum, item) => {
                                                                const taxable = parseFloat(item.taxableValue) || 0;
                                                                const totalRate = (parseFloat(item.igst) || 0) + (parseFloat(item.cgst) || 0) + (parseFloat(item.sgst) || 0) + (parseFloat(item.cess) || 0);
                                                                return sum + ((taxable * totalRate) / 100);
                                                            }, 0).toFixed(2)}
                                                            readOnly
                                                            className="w-full px-3 py-2 border border-slate-200 rounded-[4px] bg-gray-50 focus:outline-none"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="label-text">Total Value</label>
                                                        <input
                                                            type="text"
                                                            value={poItems.reduce((sum, item) => sum + (parseFloat(item.netValue) || 0), 0).toFixed(2)}
                                                            readOnly
                                                            className="w-full px-3 py-2 border border-slate-200 rounded-[4px] bg-gray-50 focus:outline-none"
                                                        />
                                                    </div>
                                                </div>

                                                {/* Receive By and Receive At */}
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                                                    <div>
                                                        <label className="label-text">Receive By</label>
                                                        <input
                                                            type="date"
                                                            value={createPOForm.receiveBy || ''}
                                                            onChange={(e) => handleCreatePOFormChange('receiveBy', e.target.value)}
                                                            className="w-full px-3 py-2 border border-slate-200 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                            placeholder="dd-mm-yyyy"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="label-text">Receive At</label>
                                                        <select
                                                            value={createPOForm.receiveAt || ''}
                                                            onChange={(e) => handleCreatePOFormChange('receiveAt', e.target.value)}
                                                            className="w-full px-3 py-2 border border-slate-200 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                        >
                                                            <option value="">Select Location</option>
                                                            <option value="warehouse1">Warehouse 1</option>
                                                            <option value="warehouse2">Warehouse 2</option>
                                                            <option value="main_office">Main Office</option>
                                                        </select>
                                                    </div>
                                                </div>

                                                {/* Delivery Terms */}
                                                <div className="mt-6">
                                                    <label className="label-text">Delivery Terms</label>
                                                    <textarea
                                                        value={createPOForm.deliveryTerms || ''}
                                                        onChange={(e) => handleCreatePOFormChange('deliveryTerms', e.target.value)}
                                                        rows={4}
                                                        className="w-full px-3 py-2 border border-slate-200 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                        placeholder="Enter delivery terms and conditions"
                                                    />
                                                </div>


                                                <div className="flex justify-end space-x-4 pt-6 border-t">
                                                    <button
                                                        onClick={() => setShowCreatePOModal(false)}
                                                        className="px-6 py-2 border border-slate-200 rounded-[4px] text-gray-700 hover:bg-gray-50"
                                                    >
                                                        Cancel
                                                    </button>
                                                    <button
                                                        onClick={handleSubmitPO}
                                                        className="px-6 py-2 bg-indigo-600 text-white rounded-[4px] hover:bg-indigo-700"
                                                    >
                                                        Create PO
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )
                            }

                            {/* View PO Details Modal */}
                            {
                                showViewPOModal && selectedPO && (
                                    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                                        <div className="relative top-10 mx-auto p-8 border w-11/12 max-w-5xl shadow-none border border-slate-200 rounded-[4px] bg-white mb-20">
                                            <div className="flex justify-between items-center mb-6">
                                                <h3 className="section-title">Purchase Order Details</h3>
                                                <button
                                                    onClick={() => setShowViewPOModal(false)}
                                                    className="text-gray-400 hover:text-gray-500"
                                                >
                                                    <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                </button>
                                            </div>

                                            <div className="space-y-6">
                                                {/* PO Header Information */}
                                                <div className="bg-slate-50/50 p-6 rounded-[4px]">
                                                    <div className="grid grid-cols-2 gap-6">
                                                        <div>
                                                            <label className="block text-sm font-semibold text-gray-700 mb-1">PO Number</label>
                                                            <p className="text-lg font-bold text-indigo-900">{selectedPO.poNumber}</p>
                                                        </div>
                                                        <div>
                                                            <label className="block text-sm font-semibold text-gray-700 mb-1">PO Date</label>
                                                            <p className="text-gray-900">{formatDate(selectedPO.poDate)}</p>
                                                        </div>
                                                        <div>
                                                            <label className="block text-sm font-semibold text-gray-700 mb-1">Status</label>
                                                            <span className={`px-3 py-1 inline-flex text-sm leading-5 font-semibold rounded-[4px] ${selectedPO.status === 'Pending Approval'
                                                                ? 'bg-indigo-50 text-slate-700 border border-slate-200'
                                                                : 'bg-blue-100 text-slate-700 border border-blue-200'
                                                                }`}>
                                                                {selectedPO.status}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Additional Fields */}
                                                <div className="grid grid-cols-2 gap-6">
                                                    <div>
                                                        <label className="label-text">Receive by</label>
                                                        <input
                                                            type="date"
                                                            value={createPOForm.receiveBy}
                                                            onChange={(e) => handleCreatePOFormChange('receiveBy', e.target.value)}
                                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                                                        />

                                                    </div>

                                                    <div>
                                                        <label className="label-text">Receive at</label>
                                                        <select
                                                            value={createPOForm.receiveAt}
                                                            onChange={(e) => handleCreatePOFormChange('receiveAt', e.target.value)}
                                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                                                        >
                                                            <option value="">Select Location</option>
                                                            <option value="warehouse1">Warehouse 1</option>
                                                            <option value="warehouse2">Warehouse 2</option>
                                                            <option value="store1">Store 1</option>
                                                        </select>

                                                    </div>
                                                    <div className="col-span-2">
                                                        <label className="label-text">Address</label>
                                                        {isEditingPO ? (
                                                            <textarea
                                                                value={selectedPO.address}
                                                                onChange={(e) => setSelectedPO({ ...selectedPO, address: e.target.value })}
                                                                rows={3}
                                                                className="w-full px-3 py-2 border border-blue-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                            />
                                                        ) : (
                                                            <p className="text-gray-900">{selectedPO.address}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Items Section - Placeholder */}
                                            <div>
                                                <h4 className="section-title mb-4">Items</h4>
                                                <div className="bg-gray-50 p-4 rounded-[4px]">
                                                    <p className="text-gray-600 text-center py-4">
                                                        Item details will be displayed here when connected to backend
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Totals Section - Placeholder */}
                                            <div className="grid grid-cols-3 gap-6 bg-gray-50 p-4 rounded-[4px] border-t-2 border-gray-300">
                                                <div>
                                                    <label className="label-text">Total Taxable Value</label>
                                                    <p className="text-lg font-semibold text-gray-900">? 0.00</p>
                                                </div>
                                                <div>
                                                    <label className="label-text">Total Tax</label>
                                                    <p className="text-lg font-semibold text-gray-900">? 0.00</p>
                                                </div>
                                                <div>
                                                    <label className="label-text">Total Value</label>
                                                    <p className="text-lg font-bold text-indigo-900">? 0.00</p>
                                                </div>
                                            </div>

                                            {/* Additional Information - Placeholder */}
                                            <div>
                                                <h4 className="section-title mb-4">Additional Information</h4>
                                                <div className="grid grid-cols-2 gap-6 bg-gray-50 p-4 rounded-[4px]">
                                                    <div>
                                                        <label className="label-text">Receive By</label>
                                                        {isEditingPO ? (
                                                            <input
                                                                type="date"
                                                                value={selectedPO.receiveBy || ''}
                                                                onChange={(e) => setSelectedPO({ ...selectedPO, receiveBy: e.target.value })}
                                                                className="w-full px-3 py-2 border border-blue-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                            />
                                                        ) : (
                                                            <p className="text-gray-900">{selectedPO.receiveBy || '-'}</p>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <label className="label-text">Receive At</label>
                                                        {isEditingPO ? (
                                                            <input
                                                                type="text"
                                                                value={selectedPO.receiveAt || ''}
                                                                onChange={(e) => setSelectedPO({ ...selectedPO, receiveAt: e.target.value })}
                                                                className="w-full px-3 py-2 border border-blue-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                                placeholder="Enter location"
                                                            />
                                                        ) : (
                                                            <p className="text-gray-900">{selectedPO.receiveAt || '-'}</p>
                                                        )}
                                                    </div>
                                                    <div className="col-span-2">
                                                        <label className="label-text">Delivery Terms</label>
                                                        {isEditingPO ? (
                                                            <textarea
                                                                value={selectedPO.deliveryTerms || ''}
                                                                onChange={(e) => setSelectedPO({ ...selectedPO, deliveryTerms: e.target.value })}
                                                                rows={2}
                                                                className="w-full px-3 py-2 border border-blue-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                                placeholder="Enter delivery terms"
                                                            />
                                                        ) : (
                                                            <p className="text-gray-900">{selectedPO.deliveryTerms || '-'}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Action Buttons */}
                                            <div className="flex justify-between pt-6 border-t">
                                                <div className="flex space-x-4">
                                                    {/* Show Edit button only for Pending Approval status when not editing */}
                                                    {!isEditingPO && selectedPO.status === 'Pending Approval' && (
                                                        <>
                                                            <button
                                                                onClick={handleEditPODetails}
                                                                className="px-6 py-2 border border-indigo-600 text-indigo-600 rounded-[4px] hover:bg-indigo-50/50 font-medium"
                                                            >
                                                                EDIT
                                                            </button>
                                                            <button
                                                                onClick={handleCancelPOClick}
                                                                className="px-6 py-2 border border-red-500 text-red-600 rounded-[4px] hover:bg-red-50 font-medium"
                                                            >
                                                                CANCEL PO
                                                            </button>
                                                        </>
                                                    )}
                                                    {/* Show Cancel and Save when editing */}
                                                    {isEditingPO && (
                                                        <>
                                                            <button
                                                                onClick={handleCancelEditPO}
                                                                className="px-6 py-2 border border-slate-200 rounded-[4px] text-gray-700 hover:bg-gray-50 font-medium"
                                                            >
                                                                CANCEL
                                                            </button>
                                                            <button
                                                                onClick={handleSavePODetails}
                                                                className="px-6 py-2 bg-indigo-600 text-white rounded-[4px] hover:bg-indigo-700 font-medium"
                                                            >
                                                                SAVE
                                                            </button>
                                                        </>
                                                    )}
                                                    {/* Show Cancel button only for Approved status when not editing */}
                                                    {!isEditingPO && selectedPO.status === 'Approved' && (
                                                        <button
                                                            onClick={handleCancelPOClick}
                                                            className="px-6 py-2 border border-red-500 text-red-600 rounded-[4px] hover:bg-red-50 font-medium"
                                                        >
                                                            CANCEL PO
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="flex space-x-4">
                                                    <button
                                                        onClick={() => setShowViewPOModal(false)}
                                                        className="px-6 py-2 border border-slate-200 rounded-[4px] text-gray-700 hover:bg-gray-50 font-medium"
                                                    >
                                                        CLOSE
                                                    </button>
                                                    {!isEditingPO && selectedPO.status === 'Pending Approval' && (
                                                        <button
                                                            onClick={handleApprovePO}
                                                            className="px-6 py-2 bg-indigo-600 text-white rounded-[4px] hover:bg-indigo-700 font-medium"
                                                        >
                                                            APPROVE PO
                                                        </button>
                                                    )}
                                                    {!isEditingPO && selectedPO.status === 'Approved' && (
                                                        <button
                                                            onClick={handleMailPO}
                                                            className="px-6 py-2 bg-indigo-600 text-white rounded-[4px] hover:bg-indigo-700 font-medium"
                                                        >
                                                            MAIL PO
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )
                            }

                            {/* Cancel PO Reason Modal */}
                            {
                                showCancelPOModal && selectedPO && (
                                    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                                        <div className="relative top-20 mx-auto p-8 border w-full max-w-md shadow-none border border-slate-200 rounded-[4px] bg-white">
                                            <div className="mb-6">
                                                <h3 className="section-title">Cancel Purchase Order</h3>
                                                <p className="helper-text mt-2">PO Number: <span className="font-semibold text-gray-700">{selectedPO.poNumber}</span></p>
                                                <p className="helper-text">Vendor: <span className="font-semibold text-gray-700">{selectedPO.vendorName}</span></p>
                                            </div>

                                            <div className="space-y-4">
                                                {/* Cancellation Reason */}
                                                <div>
                                                    <label className="label-text">
                                                        Reason for Cancellation <span className="text-red-500">*</span>
                                                    </label>
                                                    <textarea
                                                        value={cancelReason}
                                                        onChange={(e) => setCancelReason(e.target.value)}
                                                        rows={4}
                                                        placeholder="Please provide a detailed reason for cancelling this PO..."
                                                        className="block w-full px-3 py-2 border border-slate-200 rounded-[4px] shadow-none border border-slate-200 focus:outline-none focus:ring-red-500 focus:border-red-500"
                                                    />
                                                </div>

                                                {/* Action Buttons */}
                                                <div className="flex justify-end space-x-3 pt-4">
                                                    <button
                                                        onClick={handleCloseCancelModal}
                                                        className="px-6 py-2 border border-slate-200 rounded-[4px] text-gray-700 hover:bg-gray-50"
                                                    >
                                                        Back
                                                    </button>
                                                    <button
                                                        onClick={handleConfirmCancelPO}
                                                        className="px-6 py-2 bg-red-600 text-white rounded-[4px] hover:bg-red-700"
                                                    >
                                                        Confirm Cancellation
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )
                            }


                            {/* Post Payment Modal */}
                            {
                                showPostPaymentModal && selectedBillForPayment && (
                                    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                                        <div className="relative top-20 mx-auto p-8 border w-full max-w-md shadow-none border border-slate-200 rounded-[4px] bg-white">
                                            <div className="mb-6">
                                                <h3 className="section-title">Post Payment</h3>
                                                <p className="text-sm text-gray-500 mt-1">Bill: {selectedBillForPayment.voucherNo} - {selectedBillForPayment.vendorReferenceName}</p>
                                                <p className="text-sm font-medium text-gray-700 mt-1">Amount: {selectedBillForPayment.amount}</p>
                                            </div>

                                            <div className="space-y-4">
                                                {/* Date of Payment */}
                                                <div>
                                                    <label className="label-text">
                                                        Date of payment
                                                    </label>
                                                    <input
                                                        type="date"
                                                        value={postPaymentForm.dateOfPayment}
                                                        onChange={(e) => setPostPaymentForm({ ...postPaymentForm, dateOfPayment: e.target.value })}
                                                        className="block w-full px-3 py-2 border border-slate-200 rounded-[4px] shadow-none border border-slate-200 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                                    />
                                                </div>

                                                {/* Bank Account Dropdown */}
                                                <div>
                                                    <label className="label-text">
                                                        Bank account
                                                    </label>
                                                    <select
                                                        value={postPaymentForm.bankAccount}
                                                        onChange={(e) => setPostPaymentForm({ ...postPaymentForm, bankAccount: e.target.value })}
                                                        className="block w-full px-3 py-2 border border-slate-200 rounded-[4px] shadow-none border border-slate-200 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                                    >
                                                        <option value="">Select bank account</option>
                                                        <option value="cash">Cash</option>
                                                        <option value="bank1">HDFC Bank - Current Account</option>
                                                        <option value="bank2">ICICI Bank - Savings Account</option>
                                                        <option value="bank3">SBI Bank - OD/CC Account</option>
                                                        <option value="bank4">Axis Bank - Current Account</option>
                                                    </select>
                                                    <p className="text-xs text-gray-500 mt-1">Drop-down list of all Bank, Bank OD/CC account</p>
                                                </div>

                                                {/* Bank Reference No (hidden if cash is selected) */}
                                                {postPaymentForm.bankAccount && postPaymentForm.bankAccount !== 'cash' && (
                                                    <div>
                                                        <label className="label-text">
                                                            Bank Reference No.
                                                        </label>
                                                        <input
                                                            type="text"
                                                            value={postPaymentForm.bankReferenceNo}
                                                            onChange={(e) => setPostPaymentForm({ ...postPaymentForm, bankReferenceNo: e.target.value })}
                                                            placeholder="Enter bank reference number"
                                                            className="block w-full px-3 py-2 border border-slate-200 rounded-[4px] shadow-none border border-slate-200 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                                        />
                                                    </div>
                                                )}
                                            </div>

                                            {/* Action Buttons */}
                                            <div className="mt-6 flex justify-end space-x-3">
                                                <button
                                                    onClick={() => {
                                                        setShowPostPaymentModal(false);
                                                        setSelectedBillForPayment(null);
                                                        setPostPaymentForm({ dateOfPayment: '', bankAccount: '', bankReferenceNo: '' });
                                                    }}
                                                    className="px-6 py-2 border border-slate-200 rounded-[4px] text-gray-700 hover:bg-gray-50"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        // Handle post payment logic here

                                                        // Update bill status to Posted
                                                        setPaymentBills(paymentBills.map(bill =>
                                                            bill.id === selectedBillForPayment.id ? { ...bill, status: 'Posted' as const } : bill
                                                        ));
                                                        setShowPostPaymentModal(false);
                                                        setSelectedBillForPayment(null);
                                                        setPostPaymentForm({ dateOfPayment: '', bankAccount: '', bankReferenceNo: '' });
                                                    }}
                                                    className="px-6 py-2 bg-indigo-600 text-white rounded-[4px] hover:bg-indigo-700"
                                                >
                                                    Post Payment
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}


                        </div>
                    </div>
                )
            }

            {/* Toast notifications handled globally */}

            {viewVendorId && (
                <VendorViewModal
                    vendorId={viewVendorId}
                    onClose={() => setViewVendorId(null)}
                />
            )}

            {showNetoffModal && selectedProcurementVendor && (
                <NetoffProcessModal
                    isOpen={showNetoffModal}
                    onClose={() => setShowNetoffModal(false)}
                    vendorName={selectedProcurementVendor?.name || ''}
                    runningBalance={totalCredit - totalDebit}
                />
            )}
        </div >
    )
};

export default VendorPortalPage;

