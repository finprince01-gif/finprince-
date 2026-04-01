import React, { useState, useEffect, useMemo } from 'react';
import { httpClient, apiService } from '../../services';
import { showError, showSuccess } from '../../utils/toast';


import { Ledger, ExtractedInvoiceData } from '../../types';
import SearchableSelect from '../../components/SearchableSelect';

interface PendingTransaction {
    date: string;
    referenceNumber: string;
    amount: number;
    receipt: number;
    status: string;
}

interface ReceiptRow {
    id: string;
    receiveFrom: string;
    referenceNumber: string;
    amount: number;
    advanceAmount?: number;
    advanceRefNo?: string;
    allocations?: BulkTransaction[];
}

interface BulkTransaction {
    id: string;
    date: string;
    invoiceNo: string;
    amount: number;
    receiveNow: number;
    selected: boolean;
    status: string;
}


import Icon from '../../components/Icon';

interface ReceiptVoucherProps {
    prefilledData?: ExtractedInvoiceData | null;
    clearPrefilledData?: () => void;
    isLimitReached?: boolean;
    onLimitReached?: () => void;
}

const ReceiptVoucher: React.FC<ReceiptVoucherProps> = ({
    prefilledData,
    clearPrefilledData,
    isLimitReached,
    onLimitReached
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
    const [voucherType, setVoucherType] = useState('Receipt');
    const [voucherNumber, setVoucherNumber] = useState('');
    const [bankTransactionId, setBankTransactionId] = useState<number | null>(null);

    // "Receive In" (Debit Account - Bank/Cash) matches PayFrom (Credit Account) visually in the single form
    const [receiveIn, setReceiveIn] = useState('');
    const [receiveInBalance, setReceiveInBalance] = useState('₹0 Dr');

    // "Receive From" (Credit Account - Customer) matches PayTo (Debit Account) visually
    const [receiveFrom, setReceiveFrom] = useState('');

    const [totalReceipt, setTotalReceipt] = useState(0);

    // Ledgers state
    const [allLedgers, setAllLedgers] = useState<Ledger[]>([]);
    const [portalCustomers, setPortalCustomers] = useState<any[]>([]);
    const [portalVendors, setPortalVendors] = useState<any[]>([]);

    // Fetch data on mount
    useEffect(() => {
        const fetchData = async () => {
            try {
                const [ledgersData, customersData, vendorsData] = await Promise.all([
                    apiService.getLedgers(),
                    apiService.getRichCustomers(),
                    apiService.getRichVendors()
                ]);

                setAllLedgers(ledgersData || []);
                setPortalCustomers(customersData || []);
                setPortalVendors(vendorsData || []);
            } catch (error) {
                console.error('Error fetching data:', error);
                showError('Failed to fetch required data');
            }
        };
        fetchData();
    }, []);

    // Filter Receive In (Debit) options: Cash, Bank, CC, OD, and Loans/Borrowings
    const receiveInLedgers = useMemo(() => {
        return allLedgers.filter(l => {
            const group = (l.group || '').toLowerCase();
            const category = (l.category || '').toLowerCase();
            return (
                (category.includes('asset') && group.includes('cash')) ||
                (category.includes('asset') && group.includes('bank')) ||
                (category.includes('asset') && group.includes('od')) ||
                (category.includes('asset') && group.includes('cc')) ||
                (category.includes('liability') && group.includes('borrowing')) ||
                (category.includes('liability') && group.includes('loan')) ||
                // Fallbacks
                group.includes('cash') ||
                group.includes('bank') ||
                group.includes('od') ||
                group.includes('cc') ||
                group.includes('borrowing') ||
                group.includes('loan')
            );
        });
    }, [allLedgers]);

    // Filter Receive From (Credit) options: All ledgers (allowing transfers) + Portal entities
    const receiveFromOptions = useMemo(() => {
        // Construct synthetic ledger objects for portal entities to make them selectable
        const custOptions = portalCustomers.map(c => ({
            id: `portal-cust-${c.id}`,
            name: c.customer_name || c.name,
            group: 'Sundry Debtors',
            isPortal: true
        }));

        const vendOptions = portalVendors.map(v => ({
            id: `portal-vend-${v.id}`,
            name: v.vendor_name || v.name,
            group: 'Sundry Creditors',
            isPortal: true
        }));

        // Combine all, avoiding duplicates if name matches exactly with an existing ledger
        const combined = [...allLedgers];
        const existingNames = new Set(allLedgers.map(l => l.name.toLowerCase()));

        [...custOptions, ...vendOptions].forEach(portalEntity => {
            if (!existingNames.has(portalEntity.name.toLowerCase())) {
                combined.push(portalEntity as any);
                existingNames.add(portalEntity.name.toLowerCase());
            }
        });

        return combined;
    }, [allLedgers, portalCustomers, portalVendors]);

    // Receipt Voucher Configuration state
    const [receiptVoucherConfigs, setReceiptVoucherConfigs] = useState<any[]>([]);
    const [selectedReceiptConfig, setSelectedReceiptConfig] = useState<string>('');

    // Single mode state
    const [pendingTransactions, setPendingTransactions] = useState<PendingTransaction[]>([]);

    // Bulk mode state
    const [receiptRows, setReceiptRows] = useState<ReceiptRow[]>([
        { id: '1', receiveFrom: '', referenceNumber: '', amount: 0, advanceAmount: 0, advanceRefNo: '', allocations: [] },
        { id: '2', receiveFrom: '', referenceNumber: '', amount: 0, advanceAmount: 0, advanceRefNo: '', allocations: [] },
        { id: '3', receiveFrom: '', referenceNumber: '', amount: 0, advanceAmount: 0, advanceRefNo: '', allocations: [] }
    ]);
    const [invalidRefNos, setInvalidRefNos] = useState<Set<string>>(new Set());
    const [selectedCustomer, setSelectedCustomer] = useState<string>('');
    const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
    const [bulkTransactions, setBulkTransactions] = useState<BulkTransaction[]>([]);
    const [showAdvanceSection, setShowAdvanceSection] = useState<boolean>(false);
    const [advanceRefNo, setAdvanceRefNo] = useState<string>('');
    const [advanceAmount, setAdvanceAmount] = useState<number>(0);
    const [postingNote, setPostingNote] = useState<string>('');
    const [runningBalance, setRunningBalance] = useState<number>(0);

    // Single Advance state
    const [showSingleAdvanceSection, setShowSingleAdvanceSection] = useState<boolean>(false);
    const [singleAdvanceRefNo, setSingleAdvanceRefNo] = useState<string>('');
    const [singleAdvanceAmount, setSingleAdvanceAmount] = useState<number>(0);

    // Sync balances
    useEffect(() => {
        const normalized = (receiveIn || '').trim().toLowerCase();
        const ledger = allLedgers.find(l => l.name.trim().toLowerCase() === normalized);
        if (ledger) {
            const bal = ledger.balance || 0;
            const sign = bal >= 0 ? 'Dr' : 'Cr';
            setReceiveInBalance(`₹${Math.abs(bal).toLocaleString('en-IN', { minimumFractionDigits: 2 })} ${sign}`);
            setRunningBalance(bal);
        } else {
            setReceiveInBalance('₹0 Dr');
            setRunningBalance(0);
        }
    }, [receiveIn, allLedgers]);

    // Populate from AI Extraction
    useEffect(() => {
        if (prefilledData && allLedgers.length > 0) {

            // Helper to find exact ledger name from allLedgers (case-insensitive)
            const findLedgerName = (name: string) => {
                if (!name) return '';
                const normalized = name.trim().toLowerCase();
                const found = allLedgers.find(l => l.name.trim().toLowerCase() === normalized);
                return found ? found.name : '';
            };

            if (prefilledData.invoiceDate) setDate(prefilledData.invoiceDate);
            if (prefilledData.sellerName) setReceiveFrom(findLedgerName(prefilledData.sellerName));
            if ((prefilledData as any).account) setReceiveIn(findLedgerName((prefilledData as any).account));
            if (prefilledData.totalAmount) {
                setSingleAdvanceAmount(prefilledData.totalAmount);
                setShowSingleAdvanceSection(true);
                if (prefilledData.invoiceNumber) {
                    setSingleAdvanceRefNo(prefilledData.invoiceNumber);
                } else if ((prefilledData as any).reference_number) {
                    setSingleAdvanceRefNo((prefilledData as any).reference_number);
                }
            }
            if ((prefilledData as any).narration) {
                setPostingNote((prefilledData as any).narration);
            }
            if ((prefilledData as any).bank_transaction_id) {
                setBankTransactionId((prefilledData as any).bank_transaction_id);
            }
            if (clearPrefilledData) clearPrefilledData();
        }
    }, [prefilledData, clearPrefilledData, allLedgers]);

    // Fetch receipt voucher configurations on mount
    useEffect(() => {
        const fetchReceiptConfigs = async () => {
            try {
                // Use the dedicated receipts endpoint which is more reliable than the generic one
                const data = await httpClient.get<any[]>('/api/masters/master-voucher-receipts/');

                // Add voucher_type property if missing (important for some downstream logic)
                const receiptConfigs = (data || []).map(config => ({
                    ...config,
                    voucher_type: config.voucher_type || 'receipts'
                }));

                setReceiptVoucherConfigs(receiptConfigs);
                if (receiptConfigs && receiptConfigs.length === 1) {
                    setSelectedReceiptConfig(receiptConfigs[0].voucher_name);
                }
            } catch (error) {
                console.error('Error fetching receipt voucher configurations:', error);
                setReceiptVoucherConfigs([]);
            }
        };
        fetchReceiptConfigs();
    }, []);

    // Generate voucher number when receipt configuration is selected
    useEffect(() => {
        if (selectedReceiptConfig && receiptVoucherConfigs.length > 0) {
            const config = receiptVoucherConfigs.find(c => c.voucher_name === selectedReceiptConfig);
            if (config) {
                if (config.enable_auto_numbering) {
                    // Fetch the correctly formatted next number from the backend
                    httpClient.get<any>(`/api/masters/master-voucher-receipts/${config.id}/next-number/`)
                        .then((res) => {
                            setVoucherNumber(res.invoice_number || '');
                        })
                        .catch(() => {
                            setVoucherNumber('');
                        });
                } else {
                    setVoucherNumber('Manual Input');
                }
            }
        } else {
            setVoucherNumber('');
        }
    }, [selectedReceiptConfig, receiptVoucherConfigs]);

    // Single mode handlers
    const handleReceive = (index: number) => {
        const updatedTransactions = [...pendingTransactions];
        updatedTransactions[index].receipt = updatedTransactions[index].amount;
        setPendingTransactions(updatedTransactions);
        calculateTotalReceipt(updatedTransactions);
    };

    const handleReceiptChange = (index: number, value: number) => {
        const updatedTransactions = [...pendingTransactions];
        updatedTransactions[index].receipt = value;
        setPendingTransactions(updatedTransactions);
        calculateTotalReceipt(updatedTransactions);
    };

    const calculateTotalReceipt = (transactions: PendingTransaction[], advance: number = singleAdvanceAmount) => {
        const total = transactions.reduce((sum, txn) => sum + txn.receipt, 0);
        setTotalReceipt(total + advance);
    };

    // Update total when advance amount changes
    useEffect(() => {
        calculateTotalReceipt(pendingTransactions, singleAdvanceAmount);
    }, [singleAdvanceAmount]);

    // Bulk Mode: Auto-calculate Amount based on Receive Now + Advance for selected customer
    useEffect(() => {
        if (!selectedCustomer) return;

        const totalReceiveNow = bulkTransactions.reduce((sum, t) => sum + (t.receiveNow || 0), 0);
        const totalAdvance = advanceAmount || 0;
        const total = totalReceiveNow + totalAdvance;

        setReceiptRows(prev => prev.map(row =>
            row.receiveFrom === selectedCustomer ? { ...row, amount: total } : row
        ));
    }, [bulkTransactions, advanceAmount, selectedCustomer]);

    // Bulk Mode: Calculate Grand Total
    const bulkTotalReceipt = useMemo(() => {
        return receiptRows.reduce((sum, row) => sum + (row.amount || 0), 0);
    }, [receiptRows]);

    // Bulk mode handlers
    // Debounce timer for uniqueness check
    const uniquenessTimerRef = React.useRef<NodeJS.Timeout | null>(null);

    const checkRefUniqueness = async (refNo: string) => {
        if (!refNo.trim()) return;

        if (uniquenessTimerRef.current) clearTimeout(uniquenessTimerRef.current);

        uniquenessTimerRef.current = setTimeout(async () => {
            try {
                const data = await httpClient.get<{ is_unique: boolean }>(`/api/vouchers/receipt-single/check-uniqueness/?ref_no=${encodeURIComponent(refNo)}`);
                if (!data.is_unique) {
                    setInvalidRefNos(prev => new Set(prev).add(refNo));
                    showError(`Reference Number '${refNo}' is already used. Please use a unique value.`);
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
        }, 500); // 500ms debounce
    };

    const handleReceiptRowChange = (id: string, field: keyof ReceiptRow, value: string | number) => {
        let updatedRow: ReceiptRow | undefined;

        setReceiptRows(prev => {
            const next = prev.map(row => {
                if (row.id === id) {
                    updatedRow = { ...row, [field]: value };
                    return updatedRow;
                }
                return row;
            });
            return next;
        });

        // Ensure this row is selected for the right-panel view/advance section
        setSelectedRowId(id);

        if (field === 'receiveFrom' && typeof value === 'string') {
            handleCustomerSelect(value, id);
        }

        if (field === 'referenceNumber' && typeof value === 'string') {
            checkRefUniqueness(value);
        }
    };

    const handleCustomerSelect = async (customerName: string, rowId?: string) => {
        setSelectedCustomer(customerName);
        if (!customerName) {
            setBulkTransactions([]);
            return;
        }

        // Before fetching, check if we already have saved allocations for this specific row
        const targetRow = receiptRows.find(r => r.id === (rowId || selectedRowId));
        if (targetRow && targetRow.allocations && targetRow.allocations.length > 0) {
            setBulkTransactions(targetRow.allocations);
            setAdvanceAmount(targetRow.advanceAmount || 0);
            setAdvanceRefNo(targetRow.advanceRefNo || '');
            return;
        } else if (targetRow) {
            // Load existing advance info even if no allocations yet
            setAdvanceAmount(targetRow.advanceAmount || 0);
            setAdvanceRefNo(targetRow.advanceRefNo || '');
        }

        try {
            // Fetch transactions (Sales Invoices) from the rich system
            const response = await apiService.getRichCustomerSalesInvoices(customerName);

            // Find the customer to get their credit period from the portal master
            const normalizedName = customerName.trim().toLowerCase();
            const customer = portalCustomers.find(c => 
                (c.customer_name || c.name || '').trim().toLowerCase() === normalizedName
            );
            const creditPeriod = parseInt(customer?.credit_period || '0', 10);

            if (response && Array.isArray(response)) {
                const today = new Date();
                
                const mappedTransactions: BulkTransaction[] = response.map((item: any) => {
                    const invDate = new Date(item.date || getCurrentDate());
                    const d1 = new Date(invDate.getFullYear(), invDate.getMonth(), invDate.getDate());
                    const d2 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                    const diffTime = d2.getTime() - d1.getTime();
                    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                    
                    let status = 'Not Due';
                    if (diffDays > creditPeriod) {
                        status = 'Due';
                    } else if (diffDays === creditPeriod) {
                        status = 'Due Today';
                    }

                    // Resolve the outstanding amount from rich payment details or standard balance
                    const outstandingAmount = item.payment_details 
                        ? Number(item.payment_details.payment_payable || 0)
                        : (typeof item.balance !== 'undefined' ? Number(item.balance) : (Number(item.total_amount) || 0));

                    const dueDate = new Date(d1);
                    dueDate.setDate(dueDate.getDate() + creditPeriod);
                    const dueDateStr = dueDate.getFullYear() + '-' + 
                                       String(dueDate.getMonth() + 1).padStart(2, '0') + '-' + 
                                       String(dueDate.getDate()).padStart(2, '0');

                    return {
                        id: item.id?.toString() || Math.random().toString(),
                        date: item.date || getCurrentDate(),
                        invoiceNo: item.sales_invoice_no || item.invoice_number || item.voucher_number || 'N/A',
                        amount: outstandingAmount,
                        receiveNow: 0,
                        selected: false,
                        status: status,
                        dueDate: dueDateStr
                    };
                }).filter(t => t.status === 'Due' || t.status === 'Due Today');

                const validTransactions = mappedTransactions.filter(t => t.amount > 0);
                setBulkTransactions(validTransactions);

                // Populate pendingTransactions for Single Mode as well
                const mappedPending: PendingTransaction[] = validTransactions.map(t => ({
                    date: t.date,
                    referenceNumber: t.invoiceNo,
                    amount: t.amount,
                    receipt: 0,
                    status: t.status
                }));
                setPendingTransactions(mappedPending);

            } else {
                setBulkTransactions([]);
                setPendingTransactions([]);
            }
        } catch (error) {
            console.error('Error fetching customer transactions:', error);
            setBulkTransactions([]);
            setPendingTransactions([]);
        }
    };

    const handleAddReceiptRow = () => {
        const newRow: ReceiptRow = {
            id: Date.now().toString(),
            receiveFrom: '',
            referenceNumber: '',
            amount: 0,
            advanceAmount: 0,
            advanceRefNo: '',
            allocations: []
        };
        setReceiptRows(prev => [...prev, newRow]);
    };

    const handleTransactionSelect = (transactionId: string, checked: boolean) => {
        setBulkTransactions(prev => prev.map(t =>
            t.id === transactionId ? { ...t, selected: checked, receiveNow: checked ? t.amount : 0 } : t
        ));
    };

    const handleReceiveNowChange = (transactionId: string, value: number) => {
        setBulkTransactions(prev => prev.map(t =>
            t.id === transactionId ? { ...t, receiveNow: value } : t
        ));
    };

    // Row Selection / Loading Logic
    useEffect(() => {
        if (!selectedRowId || activeTab === 'single') return;
        const row = receiptRows.find(r => r.id === selectedRowId);
        if (row) {
            // Load this row's data into the right-panel global states
            // Use functional updates to ensure we have latest values
            setAdvanceAmount(prev => row.advanceAmount !== undefined ? row.advanceAmount : 0);
            setAdvanceRefNo(prev => row.advanceRefNo || '');
            setBulkTransactions(prev => row.allocations || []);
            setSelectedCustomer(prev => row.receiveFrom || '');
        }
    }, [selectedRowId, activeTab]);

    // Right-panel -> Row Sync Logic
    useEffect(() => {
        if (!selectedRowId || activeTab === 'single') return;

        setReceiptRows(prevRows => {
            return prevRows.map(row => {
                if (row.id === selectedRowId) {
                    // Only update if there's an actual state change to prevent re-render loops
                    const hasChanged =
                        row.advanceAmount !== advanceAmount ||
                        row.advanceRefNo !== advanceRefNo ||
                        JSON.stringify(row.allocations) !== JSON.stringify(bulkTransactions);

                    if (hasChanged) {
                        return {
                            ...row,
                            advanceAmount: advanceAmount,
                            advanceRefNo: advanceRefNo,
                            allocations: bulkTransactions
                        };
                    }
                }
                return row;
            });
        });
    }, [advanceAmount, advanceRefNo, bulkTransactions, selectedRowId, activeTab]);



    const handleCancel = () => {
        setDate(getCurrentDate());
        setVoucherNumber('');
        setReceiveIn('');
        setReceiveInBalance('₹0 Dr');
        setRunningBalance(0);
        setReceiveFrom('');
        setPendingTransactions(pendingTransactions.map(txn => ({ ...txn, receipt: 0 })));
        setReceiptRows([
            { id: '1', receiveFrom: '', referenceNumber: '', amount: 0, advanceAmount: 0, advanceRefNo: '', allocations: [] },
            { id: '2', receiveFrom: '', referenceNumber: '', amount: 0, advanceAmount: 0, advanceRefNo: '', allocations: [] },
            { id: '3', receiveFrom: '', referenceNumber: '', amount: 0, advanceAmount: 0, advanceRefNo: '', allocations: [] }
        ]);
        setBulkTransactions([]);
        setSelectedCustomer('');
        setSelectedRowId(null);
        setPostingNote('');
        setShowAdvanceSection(false);
        setAdvanceRefNo('');
        setAdvanceAmount(0);
        setSingleAdvanceRefNo('');
        setSingleAdvanceAmount(0);
        setShowSingleAdvanceSection(false);
        setTotalReceipt(0);
    };

    const handlePostReceipt = async () => {
        try {
            const findLedgerId = (name: string) => {
                if (!name) return null;
                const normalized = name.trim().toLowerCase();

                // 1. Check regular ledgers
                const ledger = allLedgers.find(l => l.name.trim().toLowerCase() === normalized);
                if (ledger) return ledger.id;

                // 2. Check portal customers
                const portalCust = portalCustomers.find(c => (c.customer_name || c.name || '').trim().toLowerCase() === normalized);
                if (portalCust) return portalCust.customer_name || portalCust.name; // Send name to backend for resolution

                // 3. Check portal vendors
                const portalVend = portalVendors.find(v => (v.vendor_name || v.name || '').trim().toLowerCase() === normalized);
                if (portalVend) return portalVend.vendor_name || portalVend.name;

                return null;
            };

            const receiveInId = findLedgerId(receiveIn);

            if (activeTab === 'single') {
                const receiveFromId = findLedgerId(receiveFrom);
                if (!receiveInId || !receiveFromId) {
                    showError("Please select valid 'Receive In' and 'Receive From' accounts.");
                    return;
                }

                if (totalReceipt <= 0) {
                    showError("Total receipt amount must be greater than zero.");
                    return;
                }

                const payload = {
                    date: date,
                    voucher_type: selectedReceiptConfig || voucherType,
                    voucher_number: voucherNumber,
                    receive_in: receiveInId,
                    customer: receiveFromId, // RESTORED to Master
                    total_amount: totalReceipt,
                    bank_transaction_id: bankTransactionId,
                    items: [
                        // Main allocation items
                        ...pendingTransactions
                            .filter(t => t.receipt > 0)
                            .map(t => ({
                                customer: receiveFromId,
                                reference_id: t.referenceNumber,
                                reference_type: 'invoice',
                                pending_transaction: { ...t, customer_name: receiveFrom },
                                amount: t.amount,
                                pending_before: t.amount,
                                received_amount: t.receipt,
                                balance_after: Math.max(0, t.amount - t.receipt)
                            })),
                        // Advance item if applicable
                        ...(singleAdvanceAmount > 0 ? [{
                            customer: receiveFromId,
                            reference_id: singleAdvanceRefNo || 'ADVANCE',
                            reference_type: 'advance',
                            pending_transaction: { customer_name: receiveFrom },
                            amount: singleAdvanceAmount,
                            received_amount: singleAdvanceAmount,
                            is_advance: true,
                            advance_ref_no: singleAdvanceRefNo
                        }] : [])
                    ]
                };

                if (singleAdvanceRefNo.trim()) {
                    const check = await httpClient.get<{ is_unique: boolean }>(`/api/vouchers/receipts/check-uniqueness/?ref_no=${encodeURIComponent(singleAdvanceRefNo)}`);
                    if (!check.is_unique) {
                        showError(`Reference Number '${singleAdvanceRefNo}' already exists.`);
                        return;
                    }
                }

                await httpClient.post('/api/vouchers/receipts/', payload);
                showSuccess('Receipt Voucher posted successfully!');

                // Increment the voucher series counter so the next number is ready
                const savedConfig = receiptVoucherConfigs.find(c => c.voucher_name === selectedReceiptConfig);
                if (savedConfig && savedConfig.enable_auto_numbering) {
                    try {
                        await httpClient.post(`/api/masters/master-voucher-receipts/${savedConfig.id}/increment-number/`, {});
                        const res = await httpClient.get<any>(`/api/masters/master-voucher-receipts/${savedConfig.id}/next-number/`);
                        const nextNumber = res.invoice_number || '';
                        const keepConfig = selectedReceiptConfig;
                        handleCancel();
                        setSelectedReceiptConfig(keepConfig);
                        setVoucherNumber(nextNumber);
                    } catch (e) {
                        console.error('Failed to increment receipt voucher number:', e);
                        const keepConfig = selectedReceiptConfig;
                        handleCancel();
                        setSelectedReceiptConfig(keepConfig);
                    }
                } else {
                    const keepConfig = selectedReceiptConfig;
                    handleCancel();
                    setSelectedReceiptConfig(keepConfig);
                }
            } else {
                if (!receiveInId) {
                    showError('Please select a valid Receive In account.');
                    return;
                }
                if (bulkTotalReceipt <= 0) {
                    showError("Total receipt amount must be greater than zero.");
                    return;
                }

                const validRows = receiptRows.filter(r => r.receiveFrom && r.amount > 0);
                if (validRows.length === 0) {
                    showError('Please enter at least one valid receipt row.');
                    return;
                }

                // Consolidate all rows into a SINGLE voucher payload
                const allItems: any[] = [];
                let grandTotal = 0;

                for (const row of validRows) {
                    const rowCustomerId = findLedgerId(row.receiveFrom);
                    if (!rowCustomerId) continue;

                    grandTotal += row.amount;

                    // If this row is the one currently active in the right pane, use its allocations
                    // Use row-level advance info if available, otherwise fallback to global state ONLY if this is the active row
                    const rowAdvanceAmount = row.advanceAmount ?? (selectedRowId === row.id ? advanceAmount : 0);
                    const rowAdvanceRefNo = row.advanceRefNo ?? (selectedRowId === row.id ? advanceRefNo : row.referenceNumber);

                    if (selectedRowId === row.id) {
                        const allocatedItems = bulkTransactions
                            .filter(t => t.receiveNow > 0)
                            .map(t => ({
                                customer: rowCustomerId,
                                reference_id: t.invoiceNo,
                                reference_type: 'invoice',
                                pending_transaction: { ...t, customer_name: row.receiveFrom },
                                amount: t.amount,
                                pending_before: t.amount,
                                received_amount: t.receiveNow,
                                balance_after: Math.max(0, t.amount - t.receiveNow)
                            }));

                        allItems.push(...allocatedItems);

                        // If there is a remaining amount (Advance), add it as an advance item
                        const totalAllocated = allocatedItems.reduce((sum, item) => sum + item.received_amount, 0);
                        const remaining = row.amount - totalAllocated;

                        if (remaining > 0 || rowAdvanceAmount > 0) {
                            allItems.push({
                                customer: rowCustomerId,
                                reference_id: rowAdvanceRefNo || 'ADVANCE',
                                reference_type: 'advance',
                                pending_transaction: { customer_name: row.receiveFrom },
                                amount: Math.max(remaining, rowAdvanceAmount, row.amount),
                                received_amount: Math.max(remaining, rowAdvanceAmount),
                                is_advance: true,
                                advance_ref_no: rowAdvanceRefNo
                            });
                        }
                    } else if (row.allocations && row.allocations.length > 0) {
                        // For non-active rows with saved allocations
                        const allocatedItems = row.allocations
                            .filter(t => t.receiveNow > 0)
                            .map(t => ({
                                customer: rowCustomerId,
                                reference_id: t.invoiceNo,
                                reference_type: 'invoice',
                                pending_transaction: { ...t, customer_name: row.receiveFrom },
                                amount: t.amount,
                                pending_before: t.amount,
                                received_amount: t.receiveNow,
                                balance_after: Math.max(0, t.amount - t.receiveNow)
                            }));

                        allItems.push(...allocatedItems);

                        const totalAllocated = allocatedItems.reduce((sum, item) => sum + item.received_amount, 0);
                        const remaining = row.amount - totalAllocated;

                        if (remaining > 0 || rowAdvanceAmount > 0) {
                            allItems.push({
                                customer: rowCustomerId,
                                reference_id: rowAdvanceRefNo || 'ADVANCE',
                                reference_type: 'advance',
                                pending_transaction: { customer_name: row.receiveFrom },
                                amount: Math.max(remaining, rowAdvanceAmount, row.amount),
                                received_amount: Math.max(remaining, rowAdvanceAmount),
                                is_advance: true,
                                advance_ref_no: rowAdvanceRefNo
                            });
                        }
                    } else {
                        // For rows without explicit allocations, treat as Advance or On Account based on ref number
                        const isAdvance = !!rowAdvanceRefNo || rowAdvanceAmount > 0;
                        allItems.push({
                            customer: rowCustomerId,
                            reference_id: rowAdvanceRefNo || row.referenceNumber || 'RCV',
                            reference_type: isAdvance ? 'advance' : 'on_account',
                            pending_transaction: { customer_name: row.receiveFrom },
                            amount: row.amount,
                            received_amount: row.amount,
                            is_advance: isAdvance,
                            advance_ref_no: rowAdvanceRefNo || row.referenceNumber
                        });
                    }
                }

                const payload = {
                    date: date,
                    receive_in: receiveInId,
                    total_amount: bulkTotalReceipt,
                    voucher_number: voucherNumber,
                    voucher_type: selectedReceiptConfig || voucherType,
                    items: allItems,
                    notes: postingNote
                };

                await httpClient.post('/api/vouchers/receipts/', payload);
                showSuccess(`Consolidated Receipt Voucher posted successfully.`);

                // Increment the voucher series counter so the next number is ready
                const savedConfigBulk = receiptVoucherConfigs.find(c => c.voucher_name === selectedReceiptConfig);
                if (savedConfigBulk && savedConfigBulk.enable_auto_numbering) {
                    try {
                        await httpClient.post(`/api/masters/master-voucher-receipts/${savedConfigBulk.id}/increment-number/`, {});
                        const res = await httpClient.get<any>(`/api/masters/master-voucher-receipts/${savedConfigBulk.id}/next-number/`);
                        const nextNumber = res.invoice_number || '';
                        const keepConfig = selectedReceiptConfig;
                        handleCancel();
                        setSelectedReceiptConfig(keepConfig);
                        setVoucherNumber(nextNumber);
                    } catch (e) {
                        console.error('Failed to increment receipt voucher number:', e);
                        const keepConfig = selectedReceiptConfig;
                        handleCancel();
                        setSelectedReceiptConfig(keepConfig);
                    }
                } else {
                    const keepConfig = selectedReceiptConfig;
                    handleCancel();
                    setSelectedReceiptConfig(keepConfig);
                }
            }
        } catch (error: any) {
            console.error('Error posting receipt voucher:', error);
            const serverMsg = error.response?.data?.message || error.response?.data?.error || (typeof error.response?.data === 'string' ? error.response.data : '');
            showError(serverMsg || 'Failed to post receipt voucher. Please try again.');
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
                    Receipt Voucher - Single
                </button>
                <button
                    onClick={() => setActiveTab('bulk')}
                    className={`px-6 py-2 text-sm font-medium rounded-[4px] transition-colors ${activeTab === 'bulk'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white text-gray-700 border-2 border-gray-300 hover:border-indigo-500'
                        }`}
                >
                    Receipt Voucher - Bulk
                </button>
            </div>

            {/* Single Tab Content */}
            {activeTab === 'single' && (
                <>
                    {/* Top Row */}
                    <div className="grid grid-cols-3 gap-4">
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
                                value={selectedReceiptConfig}
                                onChange={(e) => setSelectedReceiptConfig(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="">Select</option>
                                {receiptVoucherConfigs.map((config) => (
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
                                value={voucherNumber}
                                readOnly
                                className="w-full px-3 py-2 border border-gray-300 rounded-[4px] bg-gray-50 text-gray-500"
                            />
                        </div>
                    </div>

                    {/* Receive In and Receive From Row */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Receive In</label>
                            <div className="flex gap-2">
                                <SearchableSelect
                                    value={receiveIn}
                                    onChange={(val) => setReceiveIn(val)}
                                    options={receiveInLedgers.map(l => l.name)}
                                    placeholder="Select Receive In"
                                    className="flex-1"
                                />
                                <div className="px-4 py-2 bg-gray-50 border border-gray-300 rounded-[4px] text-sm font-medium text-gray-700 min-w-[80px] text-center">
                                    {receiveInBalance}
                                </div>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Receive From</label>
                            <div className="flex gap-2">
                                <SearchableSelect
                                    value={receiveFrom}
                                    onChange={(val) => {
                                        setReceiveFrom(val);
                                        handleCustomerSelect(val);
                                    }}
                                    options={receiveFromOptions.map(l => l.name)}
                                    placeholder="Select Receive From"
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
                            </div>
                        </div>
                    </div>

                    {/* Advance Receipt Section (Single) */}
                    {showSingleAdvanceSection && (
                        <div className="bg-indigo-50 border border-indigo-100 rounded-[4px] p-4 mb-4">
                            <h4 className="text-sm font-semibold text-indigo-800 mb-3">Advance Receipt Details</h4>
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
                                        type="number"
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

                        {receiveFrom ? (
                            <div className="border-2 border-gray-200 rounded-[4px] overflow-hidden">
                                <table className="w-full">
                                    <thead className="bg-gray-50 border-b-2 border-gray-200">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">DATE</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">REFERENCE NUMBER</th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-600 uppercase">STATUS</th>
                                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-600 uppercase">AMOUNT</th>
                                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-600 uppercase">PENDING</th>
                                            <th className="px-6 py-3 text-center text-xs font-medium text-gray-600 uppercase">ACTION</th>
                                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-600 uppercase">RECEIPT</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {pendingTransactions.map((txn, index) => (
                                            <tr key={index} className="hover:bg-gray-50">
                                                <td className="px-6 py-4 text-sm text-gray-700">{txn.date}</td>
                                                <td className="px-6 py-4 text-sm text-gray-700">
                                                    <input
                                                        type="text"
                                                        value={txn.referenceNumber}
                                                        readOnly
                                                        className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none bg-gray-50 text-gray-500 cursor-default"
                                                    />
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-700">
                                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${txn.status === 'Due' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                                                        {txn.status}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-700 text-right">
                                                    ₹{txn.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-700 text-right font-medium text-red-600">
                                                    ₹{Math.max(0, txn.amount - txn.receipt).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <button 
                                                        onClick={() => handleReceiptChange(index, txn.amount)}
                                                        className="px-4 py-1.5 bg-indigo-600 text-white hover:bg-indigo-700 rounded-[4px] text-[10px] font-bold uppercase transition-colors shadow-sm"
                                                    >
                                                        PAY
                                                    </button>
                                                </td>

                                                <td className="px-6 py-4 text-right">
                                                    <input
                                                        type="number"
                                                        value={txn.receipt || ''}
                                                        onChange={(e) => handleReceiptChange(index, parseFloat(e.target.value) || 0)}
                                                        placeholder="0"
                                                        className="w-24 px-3 py-1.5 text-right border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                                                    />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <div className="border-t-2 border-gray-200 bg-white px-6 py-4 flex justify-end items-center gap-4">
                                    <span className="text-sm font-semibold text-gray-700">Total Receipt</span>
                                    <div className="px-4 py-2 bg-gray-50 border border-gray-300 rounded-[4px] text-sm font-bold text-gray-900 min-w-[120px] text-right">
                                        ₹{totalReceipt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-16 text-gray-500 border-2 border-gray-200 rounded-[4px] bg-gray-50">
                                <p className="text-sm">Please select a "Receive From" account to view pending transactions.</p>
                            </div>
                        )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex justify-center gap-4">
                        <button
                            onClick={handleCancel}
                            className="px-8 py-2 bg-white hover:bg-gray-50 border-2 border-gray-300 rounded-[4px] text-gray-700 font-medium text-sm"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handlePostReceipt}
                            className="px-8 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-[4px] text-sm"
                        >
                            Post Receipt
                        </button>
                    </div>
                </>
            )
            }

            {/* Bulk Tab Content */}
            {
                activeTab === 'bulk' && (
                    <div className="grid grid-cols-2 gap-6">
                        {/* Left Panel */}
                        <div className="space-y-6">
                            {/* Top Fields */}
                            <div className="grid grid-cols-3 gap-4">
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
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Voucher Type</label>
                                    <select
                                        value={selectedReceiptConfig}
                                        onChange={(e) => setSelectedReceiptConfig(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    >
                                        <option value="">Select</option>
                                        {receiptVoucherConfigs.map((config) => (
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
                                        value={voucherNumber}
                                        readOnly
                                        className="w-full px-3 py-2 border border-gray-300 rounded-[4px] bg-gray-50 text-gray-500"
                                    />
                                </div>
                            </div>

                            {/* Receive In and Running Balance */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Receive In</label>
                                    <SearchableSelect
                                        value={receiveIn}
                                        onChange={(val) => setReceiveIn(val)}
                                        options={receiveInLedgers.map(l => l.name)}
                                        placeholder="Select Receive In"
                                        className="w-full"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Running Balance</label>
                                    <input
                                        type="number"
                                        value={runningBalance}
                                        readOnly
                                        className="w-full px-3 py-2 border border-gray-300 rounded-[4px] bg-gray-50 text-gray-500 text-right"
                                    />
                                </div>
                            </div>

                            {/* Receive From and Amount Section */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Receive From</label>
                                    <div className="space-y-3">
                                        {receiptRows.map((row) => (
                                            <SearchableSelect
                                                key={`receive-from-${row.id}`}
                                                value={row.receiveFrom}
                                                onChange={val => handleReceiptRowChange(row.id, 'receiveFrom', val)}
                                                options={receiveFromOptions.map(l => l.name)}
                                                placeholder="Select Receive From"
                                                className="w-full h-[40px]"
                                            />
                                        ))}
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleAddReceiptRow}
                                        className="mt-3 text-indigo-600 hover:text-slate-700 text-3xl font-bold"
                                    >
                                        +
                                    </button>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">Amount</label>
                                    <div className="space-y-3">
                                        {receiptRows.map((row) => (
                                            <input
                                                key={`amount-${row.id}`}
                                                type="number"
                                                value={row.amount || ''}
                                                onChange={e => handleReceiptRowChange(row.id, 'amount', parseFloat(e.target.value) || 0)}
                                                placeholder="Receive now/Advance total"
                                                className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm h-[40px]"
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Total Receipt Display */}
                            <div className="flex justify-center my-6">
                                <button className="px-8 py-2 bg-indigo-600 text-white rounded-[4px] font-medium min-w-[200px] uppercase">
                                    TOTAL RECEIPT: ₹{bulkTotalReceipt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
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
                                    onClick={handlePostReceipt}
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
                                    {selectedCustomer || 'Customer Name'}
                                </h4>
                            </div>

                            {!showAdvanceSection ? (
                                <div className="bg-white rounded-[4px] p-4 min-h-[400px]">
                                    {bulkTransactions.length > 0 ? (
                                        <>
                                            <table className="w-full text-sm">
                                                <thead className="bg-gray-50 border-b-2 border-gray-200">
                                                    <tr>
                                                        <th className="px-2 py-3 text-left text-xs font-medium text-gray-600 uppercase">DATE</th>
                                                        <th className="px-2 py-3 text-left text-xs font-medium text-gray-600 uppercase">REFERENCE</th>
                                                        <th className="px-2 py-3 text-left text-xs font-medium text-gray-600 uppercase">STATUS</th>
                                                        <th className="px-2 py-3 text-right text-xs font-medium text-gray-600 uppercase">AMOUNT</th>
                                                        <th className="px-2 py-3 text-right text-xs font-medium text-gray-600 uppercase">PENDING</th>
                                                        <th className="px-2 py-3 text-center text-xs font-medium text-gray-600 uppercase">ACTION</th>
                                                        <th className="px-2 py-3 text-right text-xs font-medium text-gray-600 uppercase">RECEIPT</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {bulkTransactions.map(transaction => (
                                                        <tr key={transaction.id} className="border-b border-gray-200">
                                                            <td className="py-3 px-2 text-sm text-gray-700 text-left">
                                                                <div className="flex items-center gap-2">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={transaction.selected}
                                                                        onChange={e => handleTransactionSelect(transaction.id, e.target.checked)}
                                                                        className="w-4 h-4"
                                                                    />
                                                                    <span>{transaction.date}</span>
                                                                </div>
                                                            </td>
                                                            <td className="py-3 px-2 text-sm text-gray-700">
                                                                <input
                                                                    type="text"
                                                                    value={transaction.invoiceNo}
                                                                    readOnly
                                                                    className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none bg-gray-50 text-gray-500 cursor-default"
                                                                />
                                                            </td>
                                                            <td className="py-3 px-2 text-sm text-gray-700">
                                                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${transaction.status === 'Due' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>
                                                                    {transaction.status}
                                                                </span>
                                                            </td>
                                                            <td className="py-3 px-2 text-sm text-gray-700 text-right">
                                                                ₹{transaction.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                            </td>
                                                            <td className="py-3 px-2 text-sm text-right text-red-600 font-medium">
                                                                ₹{(Math.max(0, transaction.amount - transaction.receiveNow)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                            </td>
                                                            <td className="py-3 px-2 text-center">
                                                                <button 
                                                                    onClick={() => handleReceiveNowChange(transaction.id, transaction.amount)}
                                                                    className="px-4 py-1.5 bg-indigo-600 text-white hover:bg-indigo-700 rounded-[4px] text-[10px] font-bold uppercase transition-colors shadow-sm"
                                                                >
                                                                    PAY
                                                                </button>
                                                            </td>

                                                            <td className="py-3 px-2 text-right">
                                                                <input
                                                                    type="number"
                                                                    value={transaction.receiveNow || ''}
                                                                    onChange={e => handleReceiveNowChange(transaction.id, parseFloat(e.target.value) || 0)}
                                                                    className="w-24 px-3 py-1.5 text-right border border-gray-300 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                                                                />
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                            <div className="border-t-2 border-gray-200 bg-white px-6 py-4 flex justify-end items-center gap-4">
                                                <span className="text-sm font-semibold text-gray-700">Total Receipt</span>
                                                <div className="px-4 py-2 bg-gray-50 border border-gray-300 rounded-[4px] text-sm font-bold text-gray-900 min-w-[120px] text-right">
                                                    ₹{bulkTotalReceipt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="flex items-center justify-center h-full min-h-[350px]">
                                            <p className="text-sm text-gray-500 italic text-center">
                                                Select a customer to view transactions
                                            </p>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="bg-white rounded-[4px] p-6 min-h-[400px]">
                                    <h5 className="text-sm font-semibold text-gray-700 mb-4 text-center">Advance Receipt</h5>
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-3">
                                            <input type="checkbox" className="w-4 h-4" />
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
                                                    className={`w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 ${invalidRefNos.has(advanceRefNo) ? 'border-red-500 bg-red-50' : 'border-gray-300'}`}
                                                />
                                            </div>
                                            <div className="flex-1">
                                                <label className="block text-xs font-medium text-gray-700 mb-1">Amount</label>
                                                <input
                                                    type="number"
                                                    value={advanceAmount || ''}
                                                    onChange={e => setAdvanceAmount(parseFloat(e.target.value) || 0)}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded"
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
                    </div>
                )
            }
        </div >
    );
};

export default ReceiptVoucher;


