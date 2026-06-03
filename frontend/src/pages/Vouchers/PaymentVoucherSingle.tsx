import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { httpClient, apiService } from '../../services';
import { showError, showSuccess } from '../../utils/toast';
import { Ledger } from '../../types';
import SearchableSelect from '../../components/SearchableSelect';


import { ExtractedInvoiceData } from '../../types';

interface PendingTransaction {
    id?: number;
    date: string;
    referenceNumber: string;
    invoiceNo?: string;
    amount: number;
    payment: number;
    dueStatus?: string;
    daysToDue?: number;
    dueDate?: string;
    postingNote?: string;
}

interface PaymentRow {
    id: string;
    payTo: string;
    amount: number;
    advanceAmount?: number;
    advanceRefNo?: string;
    allocations?: BulkTransaction[];
}

interface BulkTransaction {
    id: string;
    date: string;
    invoiceNo: string;
    referenceNumber?: string;
    amount: number;
    payNow: number;
    selected: boolean;
    status?: string;
    dueDate?: string;
    daysToDue?: number;
    postingNote?: string;
}


import Icon from '../../components/Icon';

interface PaymentVoucherSingleProps {
    prefilledData?: ExtractedInvoiceData | null;
    clearPrefilledData?: () => void;
    isLimitReached?: boolean;
    onLimitReached?: () => void;
    isReadOnlyMode?: boolean;
    onAddVouchers?: (vouchers: any[], saveToMySQL?: boolean) => void;
}

const PaymentVoucherSingle: React.FC<PaymentVoucherSingleProps> = ({
    prefilledData,
    clearPrefilledData,
    isLimitReached,
    onLimitReached,
    isReadOnlyMode = false,
    onAddVouchers
}) => {
    // Tab state
    const [activeTab, setActiveTab] = useState<'single' | 'bulk'>('single');

    // Common state
    const getCurrentDate = () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const [date, setDate] = useState(getCurrentDate());
    const [voucherType, setVoucherType] = useState('Payment');
    const [voucherNumber, setVoucherNumber] = useState('');
    const [refNo, setRefNo] = useState('');
    const [bankTransactionId, setBankTransactionId] = useState<number | null>(null);
    const [payFrom, setPayFrom] = useState('');
    const [payFromBalance, setPayFromBalance] = useState('₹0 Cr');
    const [payTo, setPayTo] = useState('');

    const [totalPayment, setTotalPayment] = useState(0);
    const [topAmount, setTopAmount] = useState<number>(0);
    const [editingVoucherId, setEditingVoucherId] = useState<number | null>(null);

    // Payment Voucher Configuration state
    const [paymentVoucherConfigs, setPaymentVoucherConfigs] = useState<any[]>([]);
    const [selectedPaymentConfig, setSelectedPaymentConfig] = useState<string>('');

    // Ledgers state
    const [allLedgers, setAllLedgers] = useState<Ledger[]>([]);
    const [payFromOptions, setPayFromOptions] = useState<Ledger[]>([]);
    const [vendors, setVendors] = useState<any[]>([]);
    const [customers, setCustomers] = useState<any[]>([]);
    const [hierarchy, setHierarchy] = useState<any[]>([]);

    const normalizeName = (s: any) => (s ?? '').toString().trim().toLowerCase();

    const buildHierarchySets = (rows: any[]) => {
        const nonLeaf = new Set<string>();
        const leaf = new Set<string>();
        const selectableMap = new Map<string, any>();

        for (const r of rows || []) {
            const mg = normalizeName(r.major_group_1);
            const g = normalizeName(r.group_1);
            const sg1 = normalizeName(r.sub_group_1_1);
            const sg2 = normalizeName(r.sub_group_2_1);
            const sg3 = normalizeName(r.sub_group_3_1);
            const led = normalizeName(r.ledger_1);

            if (mg) nonLeaf.add(mg);
            if (g) nonLeaf.add(g);
            if (sg1) nonLeaf.add(sg1);
            if (sg2) nonLeaf.add(sg2);
            if (sg3) nonLeaf.add(sg3);

            // Treat the deepest non-null value in the row as a selectable endpoint.
            const endpoint = led || sg3 || sg2 || sg1 || g || mg;
            if (endpoint) {
                leaf.add(endpoint);
                // Also store the rich row data for synthetic ledgers
                selectableMap.set(endpoint, {
                    id: r.id,
                    name: r.ledger_1 || r.sub_group_3_1 || r.sub_group_2_1 || r.sub_group_1_1 || r.group_1 || r.major_group_1,
                    group: r.group_1,
                    category: r.major_group_1
                });
            }
        }

        return { nonLeaf, leaf, selectableMap };
    };

    // For PayTo/ReceiveFrom dropdowns we do NOT want hierarchy headings (group/sub-groups)
    // even if the hierarchy marks them as endpoints. Only real ledgers/vendors/customers.
    const isHierarchyHeadingName = (name: string, sets: { nonLeaf: Set<string>, leaf: Set<string> }) => {
        const n = normalizeName(name);
        return !!n && sets.nonLeaf.has(n);
    };

    // Fetch ledgers and master data on mount
    useEffect(() => {
        const fetchAllData = async () => {
            try {
                const [ledgersData, payFromData, vendorsData, customersData, configsData, payToData, hierarchyData] = await Promise.all([
                    apiService.getLedgers(),
                    apiService.getPayFromLedgers(),
                    apiService.getRichVendors(),
                    apiService.getRichCustomers(),
                    httpClient.get<any[]>('/api/masters/master-voucher-payments/'),
                    apiService.getPayToLedgers(),
                    apiService.getHierarchy(),
                ]);
                setAllLedgers(ledgersData || []);
                setPayFromOptions(payFromData || []);
                setVendors(vendorsData || []);
                setCustomers(customersData || []);
                setHierarchy(Array.isArray(hierarchyData) ? hierarchyData : []);

                const configs = (configsData || []).map(config => ({
                    ...config,
                    voucher_type: config.voucher_type || 'payments'
                }));
                setPaymentVoucherConfigs(configs);
                if (configs && configs.length === 1) {
                    setSelectedPaymentConfig(configs[0].voucher_name);
                }

                // Filter Pay To so we don't show hierarchy headings
                // and STRICTLY exclude internal accounting ledgers (Sales, Purchase, Taxes).
                const sets = buildHierarchySets(Array.isArray(hierarchyData) ? hierarchyData : []);

                // 1. Hierarchy seeded ledgers (the "Red Italic" endpoints)
                const hierarchySeedLedgers = Array.from(sets.selectableMap.values())
                    .filter((l: any) => {
                        // Allow ALL "Red Italic" items (leaf nodes) to appear
                        // Structural headings (groups/subgroups) are filtered by sets.nonLeaf check.
                        return !sets.nonLeaf.has(normalizeName(l.name)!);
                    })
                    .map((l: any) => ({
                        id: `hierarchy-${l.id}`,
                        name: l.name,
                        group: l.group,
                        category: l.category,
                        type: 'ledger',
                        ledger_id: l.id // Ensure we have a numeric ledger ID
                    }));

                // 2. Real tenant ledgers + portal entities
                const portalEntities = [
                    ...vendorsData.map((v: any) => ({
                        id: `portal-vend-${v.id}`,
                        name: v.vendor_name || v.name,
                        group: 'Sundry Creditors',
                        isPortal: true,
                        type: 'vendor',
                        ledger_id: v.ledger_id, // Strictly use ledger_id, do not fall back to vendor id
                        portal_id: v.id
                    })),
                    ...customersData.map((c: any) => ({
                        id: `portal-cust-${c.id}`,
                        name: c.customer_name || c.name,
                        group: 'Sundry Debtors',
                        isPortal: true,
                        type: 'customer',
                        ledger_id: c.ledger_id,
                        portal_id: c.id
                    }))
                ];

                const ledgerOptions = (ledgersData || [])
                    .filter((l: any) => {
                        return !isHierarchyHeadingName(l.name, sets);
                    })
                    .map((l: any) => ({
                        ...l,
                        type: l.group === 'Sundry Debtors' ? 'customer' :
                            l.group === 'Sundry Creditors' ? 'vendor' : 'ledger',
                        ledger_id: l.id // Ensure consistency
                    }));

                const masterMap = new Map<string, any>();
                hierarchySeedLedgers.forEach((o: any) => masterMap.set(o.name.toLowerCase(), o));
                ledgerOptions.forEach((o: any) => masterMap.set(o.name.toLowerCase(), o));
                portalEntities.forEach((o: any) => masterMap.set(o.name.toLowerCase(), o));

                setPayToOptions(Array.from(masterMap.values()).sort((a, b) => a.name.localeCompare(b.name)));
            } catch (error) {
                console.error('Error fetching data:', error);
                showError('Failed to fetch master data');
            }
        };
        fetchAllData();
    }, []);

    // Pay To options are fetched + filtered in fetchAllData()
    const [payToOptions, setPayToOptions] = useState<any[]>([]);

    // Single mode state
    const [pendingTransactions, setPendingTransactions] = useState<PendingTransaction[]>([]);

    // Single Advance state
    const [showSingleAdvanceSection, setShowSingleAdvanceSection] = useState<boolean>(false);
    const [singleAdvanceRefNo, setSingleAdvanceRefNo] = useState<string>('');
    const [singleAdvanceAmount, setSingleAdvanceAmount] = useState<number>(0);
    const [availableAdvances, setAvailableAdvances] = useState<any[]>([]);

    // Fetch pending invoices for Single mode
    useEffect(() => {
        const fetchPending = async () => {
            if (!payTo) {
                setPendingTransactions([]);
                setAvailableAdvances([]);
                return;
            }
            // If in read-only mode, DO NOT fetch fresh outstanding bills as it would overwrite the hydrated ones
            if (isReadOnlyMode) {
                return;
            }
            const selectedOpt = payToOptions.find(opt => opt.name === payTo);
            const today = new Date();

            if (selectedOpt && selectedOpt.ledger_id) {
                try {
                    // 1. Fetch pending invoices using the richer purchase/sales APIs
                    let data: any[] = [];
                    let entityCreditPeriod = 0;

                    // Fetch pending expenses first so we can merge them regardless of type
                    let mappedExpenses: PendingTransaction[] = [];
                    try {
                        const expenseData = await apiService.getPendingInvoices(selectedOpt.ledger_id);
                        mappedExpenses = (expenseData || [])
                            .filter((item: any) => (item.type || '').toLowerCase() === 'expense')
                            .map((item: any) => ({
                                date: item.date,
                                referenceNumber: item.reference_number,
                                amount: item.amount,
                                payment: 0,
                                dueStatus: item.due_status || 'Due',
                                daysToDue: item.days_to_due,
                                dueDate: item.due_date
                            }));
                    } catch (e) {
                        console.error("Failed to fetch pending expenses:", e);
                    }

                    if (selectedOpt.type === 'vendor') {
                        // Use the UNIFIED Vendor Transactions API (Procurement source)
                        const res: any = await httpClient.get(`/api/vendors/transactions/by_vendor/?vendor_id=${selectedOpt.portal_id || selectedOpt.id}`);
                        const transactions = Array.isArray(res) ? res : (res.results || []);

                        console.log("!!! Vendor Pending Transactions (Procurement):", transactions);

                        const mappedVendorTxns = transactions
                            .filter((t: any) => {
                                const type = t.transaction_type?.toLowerCase();
                                const s = (t.due_status || '').toLowerCase();
                                return type === 'purchase' && (s === 'due' || s === 'due today' || s === 'partially paid' || s === 'partially received');
                            })
                            .map((t: any) => {
                                const isMatch = !!prefilledData?.invoiceNumber && !!t.reference_number && prefilledData.invoiceNumber === t.reference_number;
                                const pAmt = isMatch ? (prefilledData?.totalAmount || 0) : 0;

                                // Show remaining balance if available, else original total
                                const pendingAmount = typeof t.payment_balance === 'number' ? t.payment_balance : Number(t.total_amount || 0);

                                const statusRaw = (t.due_status || '').toString().trim().toLowerCase();
                                const status = statusRaw === 'partially paid' || statusRaw === 'partially received'
                                    ? (statusRaw === 'partially paid' ? 'Partially Paid' : 'Partially Received')
                                    : t.due_status;

                                return {
                                    date: t.transaction_date,
                                    referenceNumber: t.reference_number || `PUR-${t.id}`,
                                    amount: pendingAmount,
                                    payment: pAmt,
                                    dueStatus: status,
                                    dueDate: t.due_date,
                                    daysToDue: t.credit_period_days
                                };
                            });

                        setPendingTransactions([...mappedVendorTxns, ...mappedExpenses]);
                    } else if (selectedOpt.type === 'customer') {
                        // Use rich sales API for customers
                        data = await apiService.getRichCustomerSalesInvoices(selectedOpt.name);
                        const customer = customers.find(c => c.id === selectedOpt.id);
                        const rawTerms = customer?.credit_period || '0';
                        const termsMatch = String(rawTerms).match(/(\d+)/);
                        entityCreditPeriod = termsMatch ? parseInt(termsMatch[1], 10) : 0;

                        const filteredData = data.map(item => {
                            const invDate = new Date(item.date || getCurrentDate());
                            const d1 = new Date(invDate.getFullYear(), invDate.getMonth(), invDate.getDate());
                            const d2 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                            const diffTime = d2.getTime() - d1.getTime();
                            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

                            const statusRaw = (item.status || '').toString().trim().toLowerCase();
                            let status = statusRaw === 'partially received' || statusRaw === 'partially paid'
                                ? (statusRaw === 'partially received' ? 'Partially Received' : 'Partially Paid')
                                : 'Not Due';

                            if (status === 'Not Due') {
                                if (diffDays > entityCreditPeriod) {
                                    status = 'Due';
                                } else if (diffDays === entityCreditPeriod) {
                                    status = 'Due Today';
                                }
                            }

                            const dueDate = new Date(d1);
                            dueDate.setDate(dueDate.getDate() + entityCreditPeriod);

                            const dueDateStr = dueDate.getFullYear() + '-' +
                                String(dueDate.getMonth() + 1).padStart(2, '0') + '-' +
                                String(dueDate.getDate()).padStart(2, '0');

                            return {
                                date: item.date,
                                referenceNumber: item.sales_invoice_no || item.invoice_number || `SAL-${item.id}`,
                                amount: Number(item.payment_details?.payment_balance ?? item.payment_details?.payment_payable ?? item.total ?? 0),
                                payment: 0,
                                dueStatus: status,
                                daysToDue: Math.max(0, entityCreditPeriod - diffDays),
                                dueDate: dueDateStr
                            };
                        }).filter(t => t.dueStatus !== 'Not Due');

                        setPendingTransactions([...filteredData, ...mappedExpenses]);
                    } else {
                        // Fallback to standard pending invoices for other ledgers
                        data = await apiService.getPendingInvoices(selectedOpt.ledger_id);
                        const mapped = data
                            .map(item => ({
                                date: item.date,
                                referenceNumber: item.reference_number,
                                amount: item.amount,
                                payment: 0,
                                dueStatus: item.due_status,
                                daysToDue: item.days_to_due,
                                dueDate: item.due_date,
                                type: item.type
                            }))
                            .filter(t => {
                                const s = (t.dueStatus || '').toLowerCase();
                                const isExp = (t.type || '').toLowerCase() === 'expense';
                                return s === 'due' || s === 'due today' || s === 'partially paid' || s === 'partially received' || isExp;
                            });
                        setPendingTransactions(mapped);
                    }

                    // 2. Fetch available advances
                    const advances = await apiService.getAdvances(selectedOpt.ledger_id, selectedOpt.category);
                    setAvailableAdvances(advances);
                } catch (error) {
                    console.error('Error fetching entity data:', error);
                }
            }
        };
        fetchPending();
    }, [payTo, payToOptions, vendors, customers]);

    // Bulk mode state
    const [paymentRows, setPaymentRows] = useState<PaymentRow[]>([
        { id: '1', payTo: '', amount: 0, advanceAmount: 0, advanceRefNo: '', allocations: [] },
        { id: '2', payTo: '', amount: 0, advanceAmount: 0, advanceRefNo: '', allocations: [] },
        { id: '3', payTo: '', amount: 0, advanceAmount: 0, advanceRefNo: '', allocations: [] }
    ]);
    const [invalidRefNos, setInvalidRefNos] = useState<Set<string>>(new Set());
    const [selectedVendor, setSelectedVendor] = useState<string>('');
    const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
    const [bulkTransactions, setBulkTransactions] = useState<BulkTransaction[]>([]);

    // Fetch pending invoices for Bulk mode
    useEffect(() => {
        const fetchBulkPending = async () => {
            if (!selectedVendor) {
                setBulkTransactions([]);
                return;
            }
            const selectedOpt = payToOptions.find(opt => opt.name === selectedVendor);
            // Use resolved ledger_id for invoice lookup
            if (selectedOpt && selectedOpt.ledger_id) {
                try {
                    const data = await apiService.getPendingInvoices(selectedOpt.ledger_id);
                    const mapped = data.map(item => ({
                        id: item.id.toString(),
                        date: item.date,
                        invoiceNo: item.reference_number,
                        amount: item.amount,
                        payNow: 0,
                        selected: false,
                        due_status: item.due_status,
                        type: item.type
                    }));
                    setBulkTransactions(mapped.filter(item =>
                        item.due_status === 'Due' ||
                        item.due_status === 'Due Today' ||
                        item.due_status === 'Partially Paid' ||
                        item.due_status === 'Partially Received' ||
                        (item.type || '').toLowerCase() === 'expense'
                    ));
                } catch (error) {
                    console.error('Error fetching bulk pending invoices:', error);
                }
            }
        };
        fetchBulkPending();
    }, [selectedVendor, payToOptions]);

    const [showAdvanceSection, setShowAdvanceSection] = useState<boolean>(false);
    const [advanceRefNo, setAdvanceRefNo] = useState<string>('');
    const [advanceAmount, setAdvanceAmount] = useState<number>(0);
    const [postingNote, setPostingNote] = useState<string>('');
    const [runningBalance, setRunningBalance] = useState<number>(0);

    // Sync balances
    useEffect(() => {
        const normalized = (payFrom || '').trim().toLowerCase();
        const ledger = allLedgers.find(l => l.name.trim().toLowerCase() === normalized);
        if (ledger) {
            const bal = ledger.balance || 0;
            const sign = bal >= 0 ? 'Dr' : 'Cr';
            setPayFromBalance(`₹${Math.abs(bal).toLocaleString('en-IN', { minimumFractionDigits: 2 })} ${sign}`);
            setRunningBalance(bal);
        } else {
            setPayFromBalance('₹0 Cr');
            setRunningBalance(0);
        }
    }, [payFrom, allLedgers]);

    // Populate from AI Extraction
    useEffect(() => {
        if (prefilledData) {
            // Helper to find exact ledger name from allLedgers (case-insensitive)
            const findLedgerName = (name: string) => {
                if (!name) return '';
                const normalized = name.trim().toLowerCase();
                const found = allLedgers.find(l => l.name.trim().toLowerCase() === normalized);
                // Return exact match from ledgers list if found, otherwise return the provided name as fallback
                return found ? found.name : name.trim();
            };

            if (prefilledData.invoiceDate) setDate(prefilledData.invoiceDate);
            if (prefilledData.sellerName) setPayTo(findLedgerName(prefilledData.sellerName));
            
            // Support both 'pay_from' (direct API field) and 'account' (mapped from drilldown)
            const payFromRaw = (prefilledData as any).pay_from || (prefilledData as any).account || '';
            if (payFromRaw) setPayFrom(findLedgerName(payFromRaw));

            // Fill critical details if they are provided, specifically for drill-down/read-only mode
            if ((prefilledData as any).totalAmount !== undefined) {
                const amt = parseFloat((prefilledData as any).totalAmount) || 0;
                if (isReadOnlyMode || amt > 0) {
                    setTopAmount(amt);
                }
            }

            if ((prefilledData as any).invoiceNumber) {
                setVoucherNumber((prefilledData as any).invoiceNumber);
            }

            if ((prefilledData as any).voucher_type) {
                setSelectedPaymentConfig((prefilledData as any).voucher_type);
            }

            if ((prefilledData as any).reference_number) {
                setRefNo((prefilledData as any).reference_number);
                setSingleAdvanceRefNo((prefilledData as any).reference_number);
            }

            if ((prefilledData as any).narration) setPostingNote((prefilledData as any).narration);
            if ((prefilledData as any).bank_transaction_id) setBankTransactionId((prefilledData as any).bank_transaction_id);
            
            // ── Capture existing voucher ID for edit mode (drill-down) ─────
            const refId = (prefilledData as any).voucherId || (prefilledData as any).reference_id || (prefilledData as any).referenceId || (prefilledData as any).id || null;
            if (refId) {
                setEditingVoucherId(Number(refId));
            } else {
                setEditingVoucherId(null);
            }
            
            // ── Hydrate Allocation Items (Drill-down) ─────────────────────────────
            if (isReadOnlyMode && (prefilledData as any).items && Array.isArray((prefilledData as any).items)) {
                const itemsList = (prefilledData as any).items;
                
                // 1. Look for advance payment item
                const advanceItem = itemsList.find((i: any) => i.is_advance || i.reference_type === 'ADVANCE');
                if (advanceItem) {
                    setShowSingleAdvanceSection(true);
                    setSingleAdvanceRefNo(advanceItem.advance_ref_no || advanceItem.ref_no || '');
                    const advAmt = parseFloat(advanceItem.amount_applied || advanceItem.amount || '0');
                    setSingleAdvanceAmount(advAmt);
                }
                
                // 2. Map standard invoice allocation items
                const invoices = itemsList.filter((i: any) => !i.is_advance && i.reference_type !== 'ADVANCE');
                if (invoices.length > 0) {
                    const mappedPending = invoices.map((i: any) => {
                        const applied = parseFloat(i.amount_applied || i.amount || '0');
                        const pendingBefore = parseFloat(i.pending_before || i.pending_amount || '0');
                        const balAfter = parseFloat(i.balance_after || '0');
                        
                        return {
                            date: i.invoice_date || i.date || getCurrentDate(),
                            referenceNumber: i.reference_number || i.ref_no || i.reference_id || 'N/A',
                            amount: pendingBefore || (applied + balAfter),
                            payment: applied,
                            dueStatus: balAfter <= 0 ? 'Paid' : 'Partially Paid',
                            dueDate: '',
                            daysToDue: 0
                        };
                    });
                    setPendingTransactions(mappedPending);
                    // Force calculate total
                    const totalAlloc = mappedPending.reduce((sum, t) => sum + t.payment, 0) + (advanceItem ? parseFloat(advanceItem.amount_applied || advanceItem.amount || '0') : 0);
                    setTotalPayment(totalAlloc);
                }
            }

            // Only clear if NOT in read-only mode (otherwise repeated renders lose view state)
            if (clearPrefilledData && !isReadOnlyMode) clearPrefilledData();
        }
    }, [prefilledData, clearPrefilledData, allLedgers, isReadOnlyMode]);

    const fetchConfigs = useCallback(async () => {
        try {
            const data = await httpClient.get<any[]>('/api/masters/master-voucher-payments/');
            const configs = (data || []).map(config => ({
                ...config,
                voucher_type: config.voucher_type || 'payments'
            }));
            setPaymentVoucherConfigs(configs);
            if (configs && configs.length === 1 && !selectedPaymentConfig) {
                setSelectedPaymentConfig(configs[0].voucher_name);
            }
        } catch (err) {
            console.error('Failed to fetch payment configs:', err);
        }
    }, [selectedPaymentConfig]);

    useEffect(() => {
        fetchConfigs();
    }, [fetchConfigs]);

    // Synchronize prefilled voucher_type with options once they finish loading
    useEffect(() => {
        if (prefilledData && (prefilledData as any).voucher_type && paymentVoucherConfigs.length > 0) {
            const typeStr = String((prefilledData as any).voucher_type).trim();
            if (typeStr.toLowerCase() !== 'payment' && typeStr.toLowerCase() !== 'payments') {
                const match = paymentVoucherConfigs.find(c => 
                    String(c.voucher_name).trim().toLowerCase() === typeStr.toLowerCase()
                );
                if (match) {
                    setSelectedPaymentConfig(match.voucher_name);
                }
            }
        }
    }, [prefilledData, paymentVoucherConfigs]);

    // Auto-Recover Configuration from Voucher Number prefix (Drill-down)
    useEffect(() => {
        if (isReadOnlyMode && voucherNumber && paymentVoucherConfigs.length > 0) {
            // Only attempt to match if the current selection is invalid or generic
            const currentMatch = paymentVoucherConfigs.find(cfg => cfg.voucher_name === selectedPaymentConfig);
            if (!currentMatch) {
                const vNumLower = voucherNumber.toLowerCase();
                const matchedConfig = paymentVoucherConfigs.find(cfg => {
                    const prefix = (cfg.prefix || '').toLowerCase();
                    return prefix && vNumLower.startsWith(prefix);
                });
                
                if (matchedConfig) {
                    setSelectedPaymentConfig(matchedConfig.voucher_name);
                } else if (!selectedPaymentConfig && paymentVoucherConfigs.length > 0) {
                    setSelectedPaymentConfig(paymentVoucherConfigs[0].voucher_name);
                }
            }
        }
    }, [voucherNumber, paymentVoucherConfigs, isReadOnlyMode, selectedPaymentConfig]);

    // Generate voucher number when configuration is selected
    useEffect(() => {
        if (selectedPaymentConfig && paymentVoucherConfigs.length > 0) {
            const config = paymentVoucherConfigs.find(c => c.voucher_name === selectedPaymentConfig);
            if (config) {
                if (config.enable_auto_numbering) {
                    const num = config.current_number || config.start_from || 1;
                    const digits = config.required_digits || 4;
                    const prefix = config.prefix || '';
                    const suffix = config.suffix || '';
                    const generatedNumber = `${prefix}${String(num).padStart(digits, '0')}${suffix}`;
                    setVoucherNumber(generatedNumber);
                } else {
                    setVoucherNumber('Manual Input');
                }
            }
        } else {
            setVoucherNumber('');
        }
    }, [selectedPaymentConfig, paymentVoucherConfigs]);

    // Single mode handlers
    const handlePay = (index: number) => {
        const updatedTransactions = [...pendingTransactions];
        updatedTransactions[index].payment = updatedTransactions[index].amount;
        setPendingTransactions(updatedTransactions);
        calculateTotalPayment(updatedTransactions);
    };

    const handlePaymentChange = (index: number, value: number) => {
        const updatedTransactions = [...pendingTransactions];
        updatedTransactions[index].payment = value;
        setPendingTransactions(updatedTransactions);
        calculateTotalPayment(updatedTransactions);
    };

    const handleTxnNoteChange = (index: number, note: string) => {
        const updatedTransactions = [...pendingTransactions];
        updatedTransactions[index].postingNote = note;
        setPendingTransactions(updatedTransactions);
    };

    const calculateTotalPayment = (transactions: PendingTransaction[], advance: number = singleAdvanceAmount) => {
        const total = transactions.reduce((sum, txn) => sum + (txn.payment || 0), 0);
        setTotalPayment(total + advance);
    };

    useEffect(() => {
        calculateTotalPayment(pendingTransactions, singleAdvanceAmount);
    }, [singleAdvanceAmount, pendingTransactions]);

    const difference = topAmount - totalPayment;
    const isExactMatch = Math.abs(difference) < 0.01;
    const isOverAllocated = difference < -0.01;
    const isUnderAllocated = difference > 0.01;

    const getRowStatus = (payment: number, pending: number) => {
        if (payment === 0) return { label: 'Not Allocated', status: 'NOT_ALLOCATED', bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200' };
        if (payment > pending + 0.01) return { label: `Over by ₹${(payment - pending).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, status: 'OVER', bg: 'bg-red-100', text: 'text-red-600', border: 'border-red-200' };
        if (payment < pending - 0.01) return { label: `Remaining ₹${(pending - payment).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, status: 'PARTIAL', bg: 'bg-orange-100', text: 'text-orange-600', border: 'border-orange-200' };
        return { label: 'Full', status: 'FULL', bg: 'bg-green-100', text: 'text-green-600', border: 'border-green-200' };
    };

    const hasAnyOverAllocation = pendingTransactions.some(t => (t.payment || 0) > t.amount + 0.01);
    const canPost = isExactMatch && !hasAnyOverAllocation && payFrom && payTo && topAmount > 0;

    const handleTotalAmountChange = (val: number) => {
        setTopAmount(val);
    };

    // Uniqueness Check Logic
    const uniquenessTimerRef = React.useRef<NodeJS.Timeout | null>(null);

    const checkRefUniqueness = async (refNo: string) => {
        if (!refNo.trim()) return;
        if (uniquenessTimerRef.current) clearTimeout(uniquenessTimerRef.current);

        uniquenessTimerRef.current = setTimeout(async () => {
            try {
                // Shared endpoint for uniqueness can be used or separate one
                const data = await httpClient.get<{ is_unique: boolean }>(`/api/vouchers/payment/check-uniqueness/?ref_no=${encodeURIComponent(refNo)}`);
                if (!data.is_unique) {
                    setInvalidRefNos(prev => new Set(prev).add(refNo));
                    showError(`Reference Number '${refNo}' is already used.`);
                } else {
                    setInvalidRefNos(prev => {
                        const next = new Set(prev);
                        next.delete(refNo);
                        return next;
                    });
                }
            } catch (error) {
                console.error('Error checking ref uniqueness:', error);
            }
        }, 500);
    };

    const handlePayAmountOnly = async () => {
        if (!topAmount || topAmount <= 0) {
            showError("Please enter an amount first.");
            return;
        }
        if (!payTo) {
            showError("Please select a 'Pay To' party first.");
            return;
        }

        try {
            const findLedgerId = (name: string) => {
                if (!name) return null;
                const normalized = name.trim().toLowerCase();
                const found = payToOptions.find(opt => opt.name.trim().toLowerCase() === normalized);
                if (found) return found.ledger_id || found.id;
                return allLedgers.find(l => l.name.trim().toLowerCase() === normalized)?.id;
            };

            const payToId = findLedgerId(payTo);
            const payFromId = findLedgerId(payFrom);

            if (!payToId || !payFromId) {
                showError("Please select valid 'Pay From' and 'Pay To' accounts.");
                return;
            }

            const payload: any = {
                date: date,
                voucher_type: selectedPaymentConfig || voucherType,
                voucher_number: voucherNumber,
                ref_no: refNo,
                pay_from: payFromId,
                total_amount: Number(topAmount),
                amount: Number(topAmount),
                narration: postingNote,
                is_amount_only: true
            };
            
            let response: any;
            if (editingVoucherId) {
                // To update with "Amount Only", we provide a single unallocated advance item.
                payload.items = [{
                    pay_to_ledger: payToId,
                    amount: topAmount,
                    reference_type: 'ADVANCE',
                    advance_ref_no: 'ADVANCE',
                    narration: 'Balance payment'
                }];
                response = await httpClient.patch(`/api/vouchers/payment/${editingVoucherId}/`, payload);
                showSuccess("Payment updated (Amount Only)");
            } else {
                payload.pay_to = payToId; // Required by the custom POST endpoint
                response = await httpClient.post('/api/vouchers/payment-single/save-amount-only/', payload);
                showSuccess("Payment recorded (Amount Only)");
            }

            // Sync with parent state to enable immediate updates across other tabs/reports
            if (onAddVouchers) {
                onAddVouchers([{
                    id: response?.id?.toString() || Date.now().toString(),
                    type: 'Payment',
                    date: date,
                    party: payTo,
                    amount: Number(topAmount),
                    narration: postingNote,
                    account: payFrom,
                    ...response
                }], false);
            }
            if (response.next_voucher_number) {
                setVoucherNumber(response.next_voucher_number);
            }
            fetchConfigs(); // Refresh configs to get new current_number
            handleCancel();
        } catch (error: any) {
            console.error("Payment save error:", error);
            const msg = error.response?.data?.error || error.response?.data?.message || "Failed to record payment. Please try again.";
            showError(msg);
        }
    };

    // Bulk Mode: Auto-calculate Amount based on Pay Now + Advance for selected vendor
    useEffect(() => {
        if (!selectedRowId || activeTab !== 'bulk') return;

        const totalPayNow = bulkTransactions.reduce((sum, t) => sum + (t.payNow || 0), 0);
        const totalAdvance = advanceAmount || 0;
        const total = totalPayNow + totalAdvance;

        setPaymentRows(prev => prev.map(row =>
            row.id === selectedRowId ? { ...row, amount: total } : row
        ));
    }, [bulkTransactions, advanceAmount, selectedRowId, activeTab]);

    // Row Selection / Loading Logic (Bulk Mode)
    useEffect(() => {
        if (!selectedRowId || activeTab !== 'bulk') return;
        const row = paymentRows.find(r => r.id === selectedRowId);
        if (row) {
            setAdvanceAmount(row.advanceAmount !== undefined ? row.advanceAmount : 0);
            setAdvanceRefNo(row.advanceRefNo || '');
            setBulkTransactions(row.allocations || []);
            setSelectedVendor(row.payTo || '');
        }
    }, [selectedRowId, activeTab]);

    // Right-panel -> Row Sync Logic (Bulk Mode)
    useEffect(() => {
        if (!selectedRowId || activeTab !== 'bulk') return;

        setPaymentRows(prevRows => {
            return prevRows.map(row => {
                if (row.id === selectedRowId) {
                    const hasChanged =
                        row.advanceAmount !== advanceAmount ||
                        row.advanceRefNo !== advanceRefNo ||
                        JSON.stringify(row.allocations) !== JSON.stringify(bulkTransactions) ||
                        row.payTo !== selectedVendor;

                    if (hasChanged) {
                        return {
                            ...row,
                            advanceAmount: advanceAmount,
                            advanceRefNo: advanceRefNo,
                            allocations: bulkTransactions,
                            payTo: selectedVendor
                        };
                    }
                }
                return row;
            });
        });
    }, [advanceAmount, advanceRefNo, bulkTransactions, selectedRowId, activeTab, selectedVendor]);

    // Bulk Mode: Calculate Grand Total
    const bulkTotalPayment = useMemo(() => {
        return paymentRows.reduce((sum, row) => sum + (row.amount || 0), 0);
    }, [paymentRows]);

    // Bulk mode handlers
    const handlePaymentRowChange = (id: string, field: keyof PaymentRow, value: string | number) => {
        setPaymentRows(prev => prev.map(row =>
            row.id === id ? { ...row, [field]: value } : row
        ));

        setSelectedRowId(id);

        if (field === 'payTo' && typeof value === 'string') {
            handleVendorSelect(value, id);
        }
    };

    const handleVendorSelect = async (vendorName: string, rowId?: string) => {
        setSelectedVendor(vendorName);
        if (!vendorName) {
            setBulkTransactions([]);
            setAvailableAdvances([]);
            return;
        }

        // Before fetching, check if we already have saved allocations for this specific row
        const targetRow = paymentRows.find(r => r.id === (rowId || selectedRowId));
        if (targetRow && targetRow.allocations && targetRow.allocations.length > 0) {
            setBulkTransactions(targetRow.allocations);
            setAdvanceAmount(targetRow.advanceAmount || 0);
            setAdvanceRefNo(targetRow.advanceRefNo || '');
            return;
        }

        try {
            const selectedOpt = payToOptions.find(opt => opt.name === vendorName);
            const today = new Date();

            if (selectedOpt && selectedOpt.ledger_id) {
                let data: any[] = [];
                let entityCreditPeriod = 0;

                if (selectedOpt.type === 'vendor') {
                    // Use the UNIFIED Vendor Transactions API (Procurement source)
                    const res: any = await httpClient.get(`/api/vendors/transactions/by_vendor/?vendor_id=${selectedOpt.id}`);
                    const transactions = Array.isArray(res) ? res : (res.results || []);

                    console.log("!!! Vendor Bulk Transactions (Procurement):", transactions);

                    const mappedBulk: BulkTransaction[] = transactions
                        .filter((t: any) => {
                            const type = t.transaction_type?.toLowerCase();
                            const s = (t.due_status || '').toLowerCase();
                            return type === 'purchase' && (s === 'due' || s === 'due today' || s === 'partially paid' || s === 'partially received');
                        })
                        .map((t: any) => {
                            const pendingAmount = typeof t.payment_balance === 'number' ? t.payment_balance : Number(t.total_amount || 0);

                            return {
                                id: t.id?.toString(),
                                date: t.transaction_date,
                                invoiceNo: t.reference_number || `PUR-${t.id}`,
                                amount: pendingAmount,
                                payNow: 0,
                                selected: false,
                                status: t.due_status,
                                dueDate: t.due_date,
                                daysToDue: t.credit_period_days
                            };
                        });
                    setBulkTransactions(mappedBulk);
                } else if (selectedOpt.type === 'customer') {
                    // Use rich sales API for customers
                    data = await apiService.getRichCustomerSalesInvoices(selectedOpt.name);
                    const customer = customers.find(c => c.id === selectedOpt.id);
                    const rawTerms = customer?.credit_period || '0';
                    const termsMatch = String(rawTerms).match(/(\d+)/);
                    entityCreditPeriod = termsMatch ? parseInt(termsMatch[1], 10) : 0;

                    const mapped: BulkTransaction[] = data.map(item => {
                        const invDate = new Date(item.date || getCurrentDate());
                        const d1 = new Date(invDate.getFullYear(), invDate.getMonth(), invDate.getDate());
                        const d2 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                        const diffTime = d2.getTime() - d1.getTime();
                        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

                        let status = 'Not Due';
                        if (diffDays > entityCreditPeriod) {
                            status = 'Due';
                        } else if (diffDays === entityCreditPeriod) {
                            status = 'Due Today';
                        }

                        const dueDate = new Date(d1);
                        dueDate.setDate(dueDate.getDate() + entityCreditPeriod);

                        const dueDateStr = dueDate.getFullYear() + '-' +
                            String(dueDate.getMonth() + 1).padStart(2, '0') + '-' +
                            String(dueDate.getDate()).padStart(2, '0');

                        return {
                            id: item.id?.toString() || Math.random().toString(),
                            date: item.date,
                            invoiceNo: item.sales_invoice_no || item.invoice_number || `SAL-${item.id}`,
                            amount: Number(item.payment_details?.payment_payable || item.total || 0),
                            payNow: 0,
                            selected: false,
                            status: status,
                            daysToDue: Math.max(0, entityCreditPeriod - diffDays),
                            dueDate: dueDateStr
                        };
                    });
                    setBulkTransactions(mapped.filter(t => t.amount > 0 && (t.status === 'Due' || t.status === 'Due Today')));

                } else {
                    // Fallback to standard pending invoices
                    data = await apiService.getPendingInvoices(selectedOpt.ledger_id);
                    const mapped: BulkTransaction[] = data.map(item => ({
                        id: item.id?.toString() || Math.random().toString(),
                        date: item.date,
                        invoiceNo: item.reference_number || 'N/A',
                        amount: Number(item.amount) || 0,
                        payNow: 0,
                        selected: false,
                        status: item.due_status || 'Pending',
                        dueDate: item.due_date,
                        daysToDue: item.days_to_due
                    }));
                    setBulkTransactions(mapped.filter(t => t.amount > 0));
                }

                // 2. Fetch available advances
                const advances = await apiService.getAdvances(selectedOpt.ledger_id, selectedOpt.category);
                setAvailableAdvances(advances);
            }
        } catch (error) {
            console.error('Error fetching data for entity:', error);
            setBulkTransactions([]);
            setAvailableAdvances([]);
        }
    };

    const handleAddPaymentRow = () => {
        const newRow: PaymentRow = {
            id: Date.now().toString(),
            payTo: '',
            amount: 0,
            advanceAmount: 0,
            advanceRefNo: '',
            allocations: []
        };
        setPaymentRows(prev => [...prev, newRow]);
    };

    const handleTransactionSelect = (transactionId: string, checked: boolean) => {
        setBulkTransactions(prev => prev.map(t =>
            t.id === transactionId ? { ...t, selected: checked } : t
        ));
    };

    const handlePayNowChange = (transactionId: string, value: number) => {
        setBulkTransactions(prev => prev.map(t =>
            t.id === transactionId ? { ...t, payNow: value } : t
        ));
    };

    const handleBulkTxnNoteChange = (transactionId: string, note: string) => {
        setBulkTransactions(prev => prev.map(t =>
            t.id === transactionId ? { ...t, postingNote: note } : t
        ));
    };

    const handleCancel = () => {
        setDate(getCurrentDate());
        // setVoucherNumber(''); // Don't clear it here, let the useEffect handle it from the config
        setRefNo('');
        setTopAmount(0);
        setPayFrom('');
        setPayFromBalance('₹0 Cr');
        setRunningBalance(0);
        setPayTo('');
        setPendingTransactions(pendingTransactions.map(txn => ({ ...txn, payment: 0 })));
        setPaymentRows([
            { id: '1', payTo: '', amount: 0, advanceAmount: 0, advanceRefNo: '', allocations: [] },
            { id: '2', payTo: '', amount: 0, advanceAmount: 0, advanceRefNo: '', allocations: [] },
            { id: '3', payTo: '', amount: 0, advanceAmount: 0, advanceRefNo: '', allocations: [] }
        ]);
        setBulkTransactions([]);
        setSelectedVendor('');
        setSelectedRowId(null);
        setPostingNote('');
        setShowAdvanceSection(false);
        setAdvanceRefNo('');
        setAdvanceAmount(0);
        setSingleAdvanceRefNo('');
        setSingleAdvanceAmount(0);
        setShowSingleAdvanceSection(false);
        setTotalPayment(0);
        setInvalidRefNos(new Set());
    };

    const handlePostPayment = async () => {
        if (!selectedPaymentConfig) {
            showError("Please select a Voucher Type.");
            return;
        }

        if (!canPost) {
            if (!payFrom) { showError("Please select 'Pay From' ledger"); return; }
            if (activeTab === 'single') {
                if (!payTo) { showError("Please select 'Pay To' ledger"); return; }
                if (topAmount <= 0) { showError("Please enter an amount"); return; }
            } else {
                if (paymentRows.filter(r => r.payTo && r.amount > 0).length === 0) {
                    showError("Please enter at least one valid payment row.");
                    return;
                }
            }

            if (isUnderAllocated) {
                showError(`₹${difference.toLocaleString('en-IN', { minimumFractionDigits: 2 })} still needs to be allocated`);
            } else if (hasAnyOverAllocation) {
                showError("One or more rows exceed pending amount.");
            } else if (isOverAllocated) {
                showError(`Over allocated by ₹${Math.abs(difference).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
            }
            return;
        }

        try {
            const findLedgerId = (name: string) => {
                if (!name) return null;
                const normalized = name.trim().toLowerCase();
                const found = payToOptions.find(opt => opt.name.trim().toLowerCase() === normalized);
                if (found) return found.ledger_id || found.id;
                return allLedgers.find(l => l.name.trim().toLowerCase() === normalized)?.id;
            };

            const payFromId = findLedgerId(payFrom);
            if (!payFromId) {
                showError('Please select a "Pay From" account.');
                return;
            }

            let items: any[] = [];

            if (activeTab === 'single') {
                const selectedOpt = payToOptions.find(opt => opt.name === payTo);
                if (!selectedOpt) {
                    showError(`'Pay To' account '${payTo}' is invalid. Please select from the dropdown.`);
                    return;
                }

                // 1. Invoice Payments
                pendingTransactions.forEach(t => {
                    if (t.payment > 0) {
                        const ledgerIdToUse = selectedOpt.ledger_id || (typeof selectedOpt.id === 'number' ? selectedOpt.id : null);
                        items.push({
                            pay_to_ledger: ledgerIdToUse,
                            amount: t.payment,
                            reference_type: 'INVOICE',
                            reference_id: t.id,
                            reference_number: t.referenceNumber || t.invoiceNo,
                            pending_amount: t.amount,
                            balance_after: Math.max(0, t.amount - t.payment),
                            invoice_date: t.date,
                            posting_note: t.postingNote,
                            transaction_details: {
                                ...t,
                                pending: Math.max(0, t.amount - t.payment)
                            }
                        });
                    }
                });

                // 2. Advance Payment (Separate Row)
                if (singleAdvanceAmount > 0) {
                    const ledgerIdToUse = selectedOpt.ledger_id || (typeof selectedOpt.id === 'number' ? selectedOpt.id : null);
                    items.push({
                        pay_to_ledger: ledgerIdToUse,
                        amount: singleAdvanceAmount,
                        reference_type: 'ADVANCE',
                        advance_ref_no: singleAdvanceRefNo,
                        reference_number: singleAdvanceRefNo
                    });
                }

                const finalAmount = topAmount > 0 ? topAmount : totalPayment;
                // 3. Fallback: General Payment if no invoices/advances specified but total > 0
                if (items.length === 0 && finalAmount > 0) {
                    const ledgerIdToUse = selectedOpt.ledger_id || (typeof selectedOpt.id === 'number' ? selectedOpt.id : null);
                    items.push({
                        pay_to_ledger: ledgerIdToUse,
                        amount: finalAmount,
                        reference_type: 'ADVANCE',
                        advance_ref_no: 'ADVANCE'
                    });
                }
            } else {
                // Bulk mode - Consolidate all rows
                paymentRows.forEach(row => {
                    if (!row.payTo || row.amount <= 0) return;
                    const opt = payToOptions.find(o => o.name === row.payTo);
                    if (!opt) return;

                    // If this row has explicit allocations (stored during editing)
                    const rowAllocations = row.id === selectedRowId ? bulkTransactions : (row.allocations || []);
                    const rowAdvanceAmount = row.id === selectedRowId ? advanceAmount : (row.advanceAmount || 0);
                    const rowAdvanceRefNo = row.id === selectedRowId ? advanceRefNo : (row.advanceRefNo || '');

                    let allocatedTotal = 0;

                    // 1. Transactions
                    rowAllocations.forEach(t => {
                        if (t.payNow > 0) {
                            allocatedTotal += t.payNow;
                            const ledgerIdToUse = opt.ledger_id || (typeof opt.id === 'number' ? opt.id : null);
                            items.push({
                                pay_to_ledger: ledgerIdToUse,
                                amount: t.payNow,
                                reference_type: 'INVOICE',
                                reference_id: t.id,
                                reference_number: t.invoiceNo || t.referenceNumber,
                                pending_amount: t.amount,
                                balance_after: Math.max(0, t.amount - t.payNow),
                                invoice_date: t.date,
                                posting_note: t.postingNote,
                                transaction_details: {
                                    ...t,
                                    pending: Math.max(0, t.amount - t.payNow)
                                }
                            });
                        }
                    });

                    // 2. Advance
                    if (rowAdvanceAmount > 0) {
                        allocatedTotal += rowAdvanceAmount;
                        const ledgerIdToUse = opt.ledger_id || (typeof opt.id === 'number' ? opt.id : null);
                        items.push({
                            pay_to_ledger: ledgerIdToUse,
                            amount: rowAdvanceAmount,
                            reference_type: 'ADVANCE',
                            advance_ref_no: rowAdvanceRefNo
                        });
                    }

                    // 3. Fallback: If amount entered but not fully allocated, treat remainder as 'On Account'
                    const remainder = row.amount - allocatedTotal;
                    if (remainder > 0.01) {
                        const ledgerIdToUse = opt.ledger_id || (typeof opt.id === 'number' ? opt.id : null);
                        items.push({
                            pay_to_ledger: ledgerIdToUse,
                            amount: remainder,
                            reference_type: 'ADVANCE',
                            advance_ref_no: 'ADVANCE',
                            narration: 'Balance payment'
                        });
                    }
                });
            }

            if (items.length === 0) {
                showError('No payment details to post.');
                return;
            }

            // Pre-post uniqueness check for all advances & voucher number (Skip if editing!)
            if (!editingVoucherId) {
                if (voucherNumber && voucherNumber.trim()) {
                    const checkV = await httpClient.get<{ is_unique: boolean }>(`/api/vouchers/payment/check-uniqueness/?voucher_number=${encodeURIComponent(voucherNumber)}`);
                    if (!checkV.is_unique) {
                        showError(`Voucher Number '${voucherNumber}' already exists. Please use a unique one.`);
                        return;
                    }
                }

                const advances = items.filter(i => i.reference_type === 'ADVANCE' && i.advance_ref_no && i.advance_ref_no !== 'ADVANCE');
                for (const adv of advances) {
                    const check = await httpClient.get<{ is_unique: boolean }>(`/api/vouchers/payment/check-uniqueness/?ref_no=${encodeURIComponent(adv.advance_ref_no)}`);
                    if (!check.is_unique) {
                        showError(`Reference Number '${adv.advance_ref_no}' already exists. Please choose a unique one.`);
                        return;
                    }
                }
            }

            const payload = {
                date: date,
                voucher_type: selectedPaymentConfig || voucherType,
                voucher_number: voucherNumber,
                ref_no: refNo,
                pay_from: payFromId,
                total_amount: Number((topAmount > 0 ? topAmount : totalPayment).toFixed(2)),
                amount: Number((topAmount > 0 ? topAmount : totalPayment).toFixed(2)),
                items: items,
                narration: postingNote,
                ...(bankTransactionId ? { bank_transaction_id: bankTransactionId } : {})
            };

            let response: any;
            if (editingVoucherId) {
                response = await httpClient.patch(`/api/vouchers/payment/${editingVoucherId}/`, payload);
                showSuccess(`${activeTab === 'single' ? 'Single' : 'Bulk'} Payment Voucher updated successfully!`);
            } else {
                response = await httpClient.post('/api/vouchers/payment/', payload);
                showSuccess(`${activeTab === 'single' ? 'Single' : 'Bulk'} Payment Voucher posted successfully!`);
            }

            // Sync with parent state to enable immediate updates across other tabs/reports
            if (onAddVouchers) {
                onAddVouchers([{
                    id: response?.id?.toString() || Date.now().toString(),
                    type: 'Payment',
                    date: date,
                    party: activeTab === 'single' ? payTo : 'Multiple Parties',
                    amount: Number(topAmount > 0 ? topAmount : totalPayment),
                    narration: postingNote,
                    account: payFrom,
                    ...response
                }], false);
            }

            // Refresh the voucher series counter so the next number is ready (Skip if editing existing!)
            const savedConfig = paymentVoucherConfigs.find(c => c.voucher_name === (selectedPaymentConfig || voucherType));
            if (savedConfig && savedConfig.enable_auto_numbering && !editingVoucherId) {
                try {
                    const res = await httpClient.get<any>(`/api/masters/master-voucher-payments/${savedConfig.id}/next-number/`);
                    setVoucherNumber(res.invoice_number || '');
                } catch (e) {
                    console.error('Failed to refresh voucher number:', e);
                }
            }

            // Reset form fields but keep the selected Voucher Type so it stays ready
            const keepConfig = selectedPaymentConfig;
            handleCancel();
            setSelectedPaymentConfig(keepConfig);
        } catch (error: any) {
            console.error('Error posting payment voucher:', error);
            const serverMsg = error?.response?.data?.message;
            showError(serverMsg || 'Failed to post payment voucher. Please try again.');
        }
    };

    return (
        <div className="space-y-6">
            {/* Tab Buttons */}
            <div className="flex justify-center gap-2">
                <button
                    onClick={() => setActiveTab('single')}
                    className={`px-6 py-2 text-sm font-medium rounded-[4px] transition-colors ${activeTab === 'single'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white text-gray-700 border-2 border-gray-300 hover:border-indigo-500'
                        }`}
                >
                    Payment Voucher - Single
                </button>
                <button
                    onClick={() => setActiveTab('bulk')}
                    className={`px-6 py-2 text-sm font-medium rounded-[4px] transition-colors ${activeTab === 'bulk'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white text-gray-700 border-2 border-gray-300 hover:border-indigo-500'
                        }`}
                >
                    Payment Voucher - Bulk
                </button>
            </div>

            {/* Single Tab Content */}
            {activeTab === 'single' && (
                <fieldset disabled={isReadOnlyMode} className={isReadOnlyMode ? 'pointer-events-none opacity-90' : ''}>
                    {/* Top Row: Date, Voucher Type, Voucher Number, Ref No */}
                    <div className="grid grid-cols-4 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                            <input
                                type="date"
                                value={date}
                                max={getCurrentDate()}
                                onChange={(e) => setDate(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Voucher Type</label>
                            <select
                                value={selectedPaymentConfig}
                                onChange={(e) => setSelectedPaymentConfig(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="">Select</option>
                                {paymentVoucherConfigs.map((config) => (
                                    <option key={config.id} value={config.voucher_name}>
                                        {config.voucher_name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Voucher Number</label>
                            <input
                                type="text"
                                value={voucherNumber === 'Manual Input' ? '' : voucherNumber}
                                onChange={(e) => setVoucherNumber(e.target.value)}
                                readOnly={
                                    paymentVoucherConfigs.find(c => c.voucher_name === selectedPaymentConfig)?.enable_auto_numbering &&
                                    voucherNumber !== 'Manual Input'
                                }
                                placeholder={voucherNumber === 'Manual Input' ? 'Enter Voucher No' : ''}
                                className={`w-full px-3 py-2 border border-gray-300 rounded-[4px] ${voucherNumber === 'Manual Input' ? 'bg-white' : 'bg-gray-50 text-gray-500'}`}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Ref No / Cheque No</label>
                            <input
                                type="text"
                                value={refNo}
                                onChange={(e) => setRefNo(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                placeholder="Enter Ref No..."
                            />
                        </div>
                    </div>

                    {/* Pay From and Pay To Row */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Pay From</label>
                            <div className="flex gap-2">
                                <SearchableSelect
                                    value={payFrom}
                                    onChange={(val) => setPayFrom(val)}
                                    options={payFromOptions.map(l => l.name)}
                                    placeholder="Select Pay From"
                                    className="flex-1"
                                />
                                <div className="px-4 py-2 bg-gray-50 border border-gray-300 rounded-[4px] text-sm font-medium text-gray-700 min-w-[80px] text-center">
                                    {payFromBalance}
                                </div>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Pay To</label>
                            <div className="flex gap-2">
                                <SearchableSelect
                                    value={payTo}
                                    onChange={(val) => setPayTo(val)}
                                    options={payToOptions.map(l => ({
                                        label: l.type ? `${l.name} (${l.type.charAt(0).toUpperCase() + l.type.slice(1)})` : l.name,
                                        value: l.name
                                    }))}
                                    placeholder="Select Pay To"
                                    className="flex-1"
                                />

                                <button
                                    onClick={() => setShowSingleAdvanceSection(!showSingleAdvanceSection)}
                                    className={`px-4 py-2 border rounded-[4px] text-sm font-medium transition-colors ${showSingleAdvanceSection
                                        ? 'bg-indigo-600 text-white border-indigo-600'
                                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                                        }`}
                                >
                                    Advance
                                </button>
                                <button
                                    onClick={handlePayAmountOnly}
                                    className="px-4 py-2 border border-indigo-200 rounded-[4px] text-sm font-bold text-indigo-600 bg-white hover:bg-indigo-50 transition-colors whitespace-nowrap"
                                >
                                    Pay Amount Only
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Amount Field Row - Right Aligned */}
                    <div className="flex justify-end mb-4">
                        <div className="w-[200px]">
                            <label className="block text-sm font-medium text-gray-700 mb-1 text-right">Amount</label>
                            <input
                                type="number" onWheel={(e) => e.currentTarget.blur()}
                                value={topAmount || ''}
                                onChange={(e) => {
                                    const val = parseFloat(e.target.value) || 0;
                                    setTopAmount(val);
                                    handleTotalAmountChange(val);
                                }}

                                className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-gray-900 text-right"
                                placeholder="0.00"
                            />
                        </div>
                    </div>

                    {/* Advance Payment Section (Single) */}
                    {showSingleAdvanceSection && (
                        <div className="bg-indigo-50 border border-indigo-100 rounded-[4px] p-4 mb-4">
                            <h4 className="text-sm font-semibold text-indigo-800 mb-3">Advance Payment Details</h4>

                            {availableAdvances.length > 0 && (
                                <div className="mb-4">
                                    <label className="block text-xs font-medium text-indigo-700 mb-2">Select from existing advances:</label>
                                    <div className="flex flex-wrap gap-2">
                                        {availableAdvances.map((adv, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => {
                                                    setSingleAdvanceRefNo(adv.reference_no);
                                                    setSingleAdvanceAmount(adv.amount);
                                                }}
                                                className="px-3 py-1 bg-white border border-indigo-200 rounded text-xs text-indigo-600 hover:bg-indigo-100 transition-colors"
                                            >
                                                {adv.reference_no} (₹{adv.amount})
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-4">
                                <div className="flex-1">
                                    <label className="block text-xs font-medium text-indigo-700 mb-1">Reference No.</label>
                                    <input
                                        type="text"
                                        value={singleAdvanceRefNo}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setSingleAdvanceRefNo(val);
                                            checkRefUniqueness(val);
                                        }}
                                        className={`w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white ${invalidRefNos.has(singleAdvanceRefNo) ? 'border-red-500 bg-red-50' : 'border-indigo-200'}`}
                                        placeholder="Enter Reference No"
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-xs font-medium text-indigo-700 mb-1">Amount</label>
                                    <input
                                        type="number" onWheel={(e) => e.currentTarget.blur()}
                                        value={singleAdvanceAmount || ''}
                                        onChange={(e) => setSingleAdvanceAmount(parseFloat(e.target.value) || 0)}

                                        className="w-full px-3 py-2 border border-indigo-200 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Pending Transactions */}
                    <div>
                        <div className="flex justify-between items-end mb-4">
                            <div>
                                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-tight">
                                    Pending Transactions
                                </h3>
                            </div>
                        </div>

                        {payTo ? (
                            <>
                                <div className="border-2 border-gray-200 rounded-[4px] overflow-hidden">
                                    <table className="w-full">
                                        <thead className="bg-indigo-600 border-b-2 border-indigo-700 text-white">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase">DATE</th>
                                                <th className="px-6 py-3 text-left text-xs font-semibold uppercase">REFERENCE NUMBER</th>
                                                <th className="px-3 py-3 text-center text-xs font-semibold uppercase">BILL STATUS</th>
                                                <th className="px-3 py-3 text-center text-xs font-semibold uppercase">ALLOCATION</th>
                                                <th className="px-6 py-3 text-right text-xs font-semibold uppercase">PENDING</th>
                                                <th className="px-6 py-3 text-center text-xs font-semibold uppercase">ACTION</th>
                                                <th className="px-6 py-3 text-right text-xs font-semibold uppercase">PAYMENT</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {pendingTransactions.map((txn, index) => {
                                                const status = getRowStatus(txn.payment || 0, txn.amount);
                                                const isProblemRow = (isUnderAllocated && (txn.payment === 0 || txn.payment < txn.amount - 0.01)) || (isOverAllocated && txn.payment > txn.amount + 0.01);

                                                return (
                                                    <tr key={index} className={`transition-colors ${isProblemRow ? 'bg-red-50/30' : 'hover:bg-gray-50'}`}>
                                                        <td className="px-6 py-4 text-sm text-gray-700">{txn.date}</td>
                                                        <td className="px-6 py-4 text-sm text-gray-700">
                                                            <div className="font-medium">{txn.referenceNumber}</div>
                                                            {txn.dueDate && (
                                                                <div className="text-[10px] text-gray-400">Due: {txn.dueDate}</div>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-4 text-center">
                                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${txn.dueStatus === 'Due' || txn.dueStatus === 'Due Today'
                                                                ? 'bg-red-100 text-red-600 border border-red-200'
                                                                : (txn.dueStatus === 'Partially Received' || txn.dueStatus === 'Partially Paid')
                                                                    ? 'bg-orange-100 text-orange-600 border border-orange-200'
                                                                    : 'bg-green-100 text-green-600 border border-green-200'
                                                                }`}>
                                                                {txn.dueStatus}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-4 text-center">
                                                            <div className={`px-2 py-1 rounded-[4px] border text-[10px] font-black uppercase tracking-tight ${status.bg} ${status.text} ${status.border}`}>
                                                                {status.label}
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 text-sm text-gray-700 text-right font-medium text-red-600">
                                                            ₹{Math.max(0, txn.amount - txn.payment).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                        </td>
                                                        <td className="px-6 py-4 text-center">
                                                            <button
                                                                onClick={() => handlePay(index)}
                                                                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-600 text-white text-xs font-medium rounded"
                                                            >
                                                                Pay
                                                            </button>
                                                        </td>
                                                        <td className="px-6 py-4 text-right">
                                                            <input
                                                                type="number" onWheel={(e) => e.currentTarget.blur()}
                                                                value={txn.payment || ''}
                                                                onChange={(e) => handlePaymentChange(index, parseFloat(e.target.value) || 0)}
                                                                placeholder="0"
                                                                className={`w-24 px-3 py-1.5 text-right border rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-bold ${status.status === 'OVER' ? 'border-red-500 bg-red-50 text-red-700' :
                                                                        status.status === 'PARTIAL' ? 'border-orange-300 bg-orange-50 text-orange-700' :
                                                                            status.status === 'FULL' ? 'border-green-300 bg-green-50 text-green-700' : 'border-gray-300 text-gray-700'
                                                                    }`}
                                                            />
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                {/* Allocation Summary Strip */}
                                <div className={`border-2 mt-2 px-6 py-3 flex items-center justify-between rounded-[4px] ${isExactMatch ? 'bg-emerald-50 border-emerald-100' : isOverAllocated ? 'bg-red-50 border-red-100' : 'bg-orange-50 border-orange-100'}`}>
                                    <div className="flex flex-col">
                                        <span className={`text-[10px] font-bold uppercase tracking-wider ${isExactMatch ? 'text-emerald-700' : isOverAllocated ? 'text-red-700' : 'text-orange-700'}`}>
                                            Balance Status
                                        </span>
                                        <span className={`text-xs font-black ${isExactMatch ? 'text-emerald-600' : isOverAllocated ? 'text-red-600' : 'text-orange-600'}`}>
                                            {isExactMatch ? '₹0.00 (Balanced)' : isUnderAllocated ? `₹${difference.toLocaleString('en-IN', { minimumFractionDigits: 2 })} remaining` : `₹${difference.toLocaleString('en-IN', { minimumFractionDigits: 2 })} (Over allocated)`}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-6 text-xs">
                                        <div className="flex flex-col items-end">
                                            <span className="text-[10px] text-gray-400 uppercase font-bold">Total Allocated</span>
                                            <span className={`font-bold text-sm ${isOverAllocated ? 'text-red-600' : isUnderAllocated ? 'text-orange-600' : 'text-emerald-600'}`}>
                                                ₹{totalPayment.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                        <div className="h-8 w-px bg-gray-200"></div>
                                        <div className="flex flex-col items-end">
                                            <span className="text-[10px] text-gray-400 uppercase font-bold">Entered Amount</span>
                                            <span className="font-bold text-sm text-gray-700">
                                                ₹{topAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="text-center py-16 text-gray-500 border-2 border-gray-200 rounded-[4px] bg-gray-50">
                                <p className="text-sm">Please select a "Pay To" account to view pending transactions.</p>
                            </div>
                        )}
                    </div>
                    {/* Posting Note */}
                    <div className="bg-indigo-50/50 border-2 border-slate-200 rounded-[4px] p-4 mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Posting Note</label>
                        <textarea
                            value={postingNote}
                            onChange={e => setPostingNote(e.target.value)}
                            placeholder="Enter posting note..."
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none text-sm"
                        />
                    </div>

                    {/* Action Buttons */}
                    <div className="flex justify-center gap-4">
                        <button
                            onClick={handleCancel}
                            className="px-8 py-2 bg-white hover:bg-gray-50 border-2 border-gray-300 rounded-[4px] text-gray-700 font-bold text-sm uppercase tracking-wider"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handlePostPayment}
                            disabled={!canPost}
                            className={`px-8 py-2 font-bold rounded-[4px] text-sm transition-all uppercase tracking-wider ${canPost
                                    ? 'bg-white border-2 border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                                    : 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                                }`}
                        >
                            {isExactMatch ? 'Post Payment' : 'Complete Allocation'}
                        </button>
                    </div>
                </fieldset>
            )
            }

            {/* Bulk Tab Content */}
            {
                activeTab === 'bulk' && (
                    <fieldset disabled={isReadOnlyMode} className={`grid grid-cols-2 gap-6 ${isReadOnlyMode ? 'pointer-events-none opacity-90' : ''}`}>
                        {/* Left Panel */}
                        <div className="space-y-6">
                            {/* Top Fields */}
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                                    <input
                                        type="date"
                                        value={date}
                                        max={getCurrentDate()}
                                        onChange={e => {
                                            const today = getCurrentDate();
                                            const val = e.target.value;
                                            setDate(val > today ? today : val);
                                        }}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Voucher Series</label>
                                    <select
                                        value={selectedPaymentConfig}
                                        onChange={(e) => setSelectedPaymentConfig(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    >
                                        <option value="">Select</option>
                                        {paymentVoucherConfigs.map((config) => (
                                            <option key={config.id} value={config.voucher_name}>
                                                {config.voucher_name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Voucher Number</label>
                                    <input
                                        type="text"
                                        value={voucherNumber === 'Manual Input' ? '' : voucherNumber}
                                        onChange={(e) => setVoucherNumber(e.target.value)}
                                        readOnly={
                                            paymentVoucherConfigs.find(c => c.voucher_name === selectedPaymentConfig)?.enable_auto_numbering &&
                                            voucherNumber !== 'Manual Input'
                                        }
                                        placeholder={voucherNumber === 'Manual Input' ? 'Enter Voucher No' : ''}
                                        className={`w-full px-3 py-2 border border-gray-300 rounded-[4px] ${voucherNumber === 'Manual Input' ? 'bg-white' : 'bg-gray-50 text-gray-500'}`}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Ref No / Cheque No</label>
                                    <input
                                        type="text"
                                        value={refNo}
                                        onChange={(e) => setRefNo(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        placeholder="Enter Ref No..."
                                    />
                                </div>
                            </div>

                            {/* Pay From and Running Balance */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Pay from</label>
                                    <SearchableSelect
                                        value={payFrom}
                                        onChange={(val) => setPayFrom(val)}
                                        options={payFromOptions.map(l => l.name)}
                                        placeholder="Select Pay From"
                                        className="w-full"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Running Balance</label>
                                    <input
                                        type="number" onWheel={(e) => e.currentTarget.blur()}
                                        value={runningBalance}
                                        readOnly

                                        className="w-full px-3 py-2 border border-gray-300 rounded-[4px] bg-gray-50 text-gray-500 text-right"
                                    />
                                </div>
                            </div>

                            {/* Pay To and Amount Section */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Pay to</label>
                                    <div className="space-y-3">
                                        {paymentRows.map((row) => (
                                            <div
                                                key={row.id}
                                                onClick={() => setSelectedRowId(row.id)}
                                                className={`transition-all ${selectedRowId === row.id ? 'ring-2 ring-indigo-500 rounded-[4px] p-1 bg-indigo-50' : ''}`}
                                            >
                                                <SearchableSelect
                                                    value={row.payTo}
                                                    onChange={val => handlePaymentRowChange(row.id, 'payTo', val)}
                                                    options={payToOptions.map(l => ({
                                                        label: l.type ? `${l.name} (${l.type.charAt(0).toUpperCase() + l.type.slice(1)})` : l.name,
                                                        value: l.name
                                                    }))}
                                                    placeholder="Select Pay To"
                                                    className="w-full h-[40px]"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleAddPaymentRow}
                                        className="mt-3 text-indigo-600 hover:text-slate-700 text-3xl font-bold"
                                    >
                                        +
                                    </button>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Amount</label>
                                    <div className="space-y-3">
                                        {paymentRows.map((row) => (
                                            <input
                                                key={`amount-${row.id}`}
                                                type="number" onWheel={(e) => e.currentTarget.blur()}
                                                value={row.amount || ''}
                                                onChange={e => handlePaymentRowChange(row.id, 'amount', parseFloat(e.target.value) || 0)}

                                                placeholder="Pay now/Advance total"
                                                className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm h-[40px]"
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Total Payment */}
                            <div className="flex justify-center my-6">
                                <button className="px-8 py-2 bg-indigo-600 text-white rounded-[4px] font-medium min-w-[200px] uppercase">
                                    Total Payment: ₹{bulkTotalPayment.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </button>
                            </div>

                            {/* Posting Note */}
                            <div className="bg-indigo-50/50 border-2 border-slate-200 rounded-[4px] p-4">
                                <label className="block text-sm font-medium text-gray-700 mb-2">Posting Note</label>
                                <textarea
                                    value={postingNote}
                                    onChange={e => setPostingNote(e.target.value)}
                                    placeholder="Enter posting note..."
                                    rows={3}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none text-sm"
                                />
                            </div>

                            {/* Action Buttons */}
                            <div className="flex justify-center gap-4">
                                <button
                                    onClick={handleCancel}
                                    className="px-6 py-2 text-sm font-medium text-gray-700 bg-white border-2 border-gray-300 rounded-[4px] hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handlePostPayment}
                                    className="px-6 py-2 text-sm font-medium text-white bg-indigo-600 rounded-[4px] hover:bg-indigo-700"
                                >
                                    Post
                                </button>
                            </div>
                        </div>

                        {/* Right Panel - Transaction List */}
                        <div className="bg-indigo-600 rounded-[4px] p-6">
                            <div className="text-center mb-4">
                                <h4 className="text-white font-semibold text-sm">
                                    {selectedVendor || 'Vendor Name'}
                                </h4>
                            </div>

                            {!showAdvanceSection ? (
                                <div className="bg-white rounded-[4px] p-4 min-h-[400px]">
                                    {!selectedVendor ? (
                                        <div className="flex items-center justify-center h-full min-h-[350px]">
                                            <p className="text-sm text-gray-500 italic text-center">
                                                Select a vendor to view transactions
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="border border-gray-200 rounded-[4px] overflow-hidden">
                                            <table className="w-full text-sm">
                                                <thead className="bg-gray-50 border-b-2 border-gray-200">
                                                    <tr>
                                                        <th className="px-2 py-3 text-left text-xs font-medium text-gray-600 uppercase">DATE</th>
                                                        <th className="px-2 py-3 text-left text-xs font-medium text-gray-600 uppercase">REFERENCE</th>
                                                        <th className="px-2 py-3 text-center text-xs font-medium text-gray-600 uppercase">BILL STATUS</th>
                                                        <th className="px-2 py-3 text-center text-xs font-medium text-gray-600 uppercase">ALLOCATION</th>
                                                        <th className="px-2 py-3 text-right text-xs font-medium text-gray-600 uppercase">PENDING</th>
                                                        <th className="px-2 py-3 text-center text-xs font-medium text-gray-600 uppercase">ACTION</th>
                                                        <th className="px-2 py-3 text-right text-xs font-medium text-gray-600 uppercase">PAYMENT</th>
                                                        <th className="px-2 py-3 text-left text-xs font-medium text-gray-600 uppercase">POSTING NOTE</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="bg-white divide-y divide-gray-200">
                                                    {bulkTransactions.length > 0 ? (
                                                        bulkTransactions.map(transaction => {
                                                            const status = getRowStatus(transaction.payNow || 0, transaction.amount);
                                                            return (
                                                                <tr key={transaction.id} className={`transition-colors ${status.status === 'OVER' ? 'bg-red-50/30' : 'hover:bg-gray-50'}`}>
                                                                    <td className="py-3 px-2 text-sm text-gray-700 text-left">
                                                                        <div className="flex items-center gap-2">
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={transaction.selected}
                                                                                onChange={e => handleTransactionSelect(transaction.id, e.target.checked)}
                                                                                className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                                                                            />
                                                                            <span>{transaction.date}</span>
                                                                        </div>
                                                                    </td>
                                                                    <td className="py-3 px-2 text-sm text-gray-700">
                                                                        <div className="font-medium">{transaction.invoiceNo}</div>
                                                                        {transaction.dueDate && (
                                                                            <div className="text-[10px] text-gray-400">Due: {transaction.dueDate}</div>
                                                                        )}
                                                                    </td>
                                                                    <td className="py-3 px-2 text-center text-sm text-gray-700">
                                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${transaction.status === 'Due' || transaction.status === 'Due Today'
                                                                            ? 'bg-red-100 text-red-600 border border-red-200'
                                                                            : (transaction.status === 'Partially Received' || transaction.status === 'Partially Paid')
                                                                                ? 'bg-orange-100 text-orange-600 border border-orange-200'
                                                                                : (transaction.status === 'Not Due' ? 'bg-green-100 text-green-600 border border-green-200' : 'bg-gray-100 text-gray-600 border border-gray-200')
                                                                            }`}>
                                                                            {transaction.status || 'Pending'}
                                                                        </span>
                                                                    </td>
                                                                    <td className="py-3 px-2 text-center">
                                                                        <div className={`px-2 py-1 rounded-[4px] border text-[9px] font-black uppercase tracking-tight ${status.bg} ${status.text} ${status.border}`}>
                                                                            {status.label}
                                                                        </div>
                                                                    </td>
                                                                    <td className="py-3 px-2 text-sm text-gray-700 text-right font-medium text-red-600">
                                                                        ₹{(Math.max(0, transaction.amount - (transaction.payNow || 0))).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                                    </td>
                                                                    <td className="py-3 px-2 text-center">
                                                                        <button
                                                                            onClick={() => handlePayNowChange(transaction.id, transaction.amount)}
                                                                            className="px-4 py-1.5 bg-indigo-600 text-white hover:bg-indigo-700 rounded-[4px] text-[10px] font-bold uppercase transition-colors shadow-sm"
                                                                        >
                                                                            PAY
                                                                        </button>
                                                                    </td>
                                                                    <td className="py-3 px-2 text-right">
                                                                        <input
                                                                            type="number" onWheel={(e) => e.currentTarget.blur()}
                                                                            value={transaction.payNow || ''}
                                                                            onChange={e => handlePayNowChange(transaction.id, parseFloat(e.target.value) || 0)}
                                                                            placeholder="0"
                                                                            className={`w-20 px-2 py-1.5 text-right border rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-bold ${status.status === 'OVER' ? 'border-red-500 bg-red-50 text-red-700' :
                                                                                    status.status === 'PARTIAL' ? 'border-orange-300 bg-orange-50 text-orange-700' :
                                                                                        status.status === 'FULL' ? 'border-green-300 bg-green-50 text-green-700' : 'border-gray-300 text-gray-700'
                                                                                }`}
                                                                        />
                                                                    </td>
                                                                    <td className="py-3 px-2">
                                                                        <input
                                                                            type="text"
                                                                            value={transaction.postingNote || ''}
                                                                            onChange={e => handleBulkTxnNoteChange(transaction.id, e.target.value)}
                                                                            placeholder="Note..."
                                                                            className="w-28 px-2 py-1.5 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                                                                        />
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })
                                                    ) : (
                                                        <tr>
                                                            <td colSpan={7} className="px-6 py-12 text-center text-sm text-gray-500 italic">
                                                                No pending transactions found for {selectedVendor}.
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="bg-white rounded-[4px] p-6 min-h-[400px]">
                                    <h5 className="text-sm font-semibold text-gray-700 mb-4 text-center">Advance Payment</h5>

                                    {availableAdvances.length > 0 && (
                                        <div className="mb-4">
                                            <label className="block text-xs font-medium text-indigo-700 mb-2 text-center">Select from existing advances:</label>
                                            <div className="flex flex-wrap justify-center gap-2">
                                                {availableAdvances.map((adv, idx) => (
                                                    <button
                                                        key={idx}
                                                        onClick={() => {
                                                            setAdvanceRefNo(adv.reference_no);
                                                            setAdvanceAmount(adv.amount);
                                                        }}
                                                        className="px-3 py-1 bg-indigo-50 border border-indigo-200 rounded text-xs text-indigo-600 hover:bg-indigo-100 transition-colors"
                                                    >
                                                        {adv.reference_no} (₹{adv.amount})
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className="space-y-4">
                                        <div className="flex items-center gap-3">
                                            <input type="checkbox" className="w-4 h-4 text-indigo-600 rounded" checked={!!advanceAmount} readOnly />
                                            <div className="flex-1">
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Advance Ref. No.</label>
                                                <input
                                                    type="text"
                                                    value={advanceRefNo}
                                                    onChange={e => {
                                                        const val = e.target.value;
                                                        setAdvanceRefNo(val);
                                                        checkRefUniqueness(val);
                                                    }}
                                                    className={`w-full px-3 py-2 border rounded focus:ring-2 focus:ring-indigo-500 ${invalidRefNos.has(advanceRefNo) ? 'border-red-500 bg-red-50' : 'border-gray-300'}`}
                                                />
                                            </div>
                                            <div className="flex-1">
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Amount</label>
                                                <input
                                                    type="number" onWheel={(e) => e.currentTarget.blur()}
                                                    value={advanceAmount || ''}
                                                    onChange={e => setAdvanceAmount(parseFloat(e.target.value) || 0)}

                                                    className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="mt-4 text-center">
                                <button
                                    onClick={() => setShowAdvanceSection(!showAdvanceSection)}
                                    className={`px-8 py-2 text-sm font-medium rounded-[4px] ${showAdvanceSection
                                        ? 'bg-indigo-600 text-white'
                                        : 'bg-white text-gray-700 border-2 border-gray-300'
                                        }`}
                                >
                                    Advance
                                </button>
                            </div>
                        </div>
                    </fieldset>

                )
            }
        </div>
    );
};

export default PaymentVoucherSingle;




