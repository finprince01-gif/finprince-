import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { httpClient, apiService } from '../../services';
import { showError, showSuccess } from '../../utils/toast';


import { Ledger, ExtractedInvoiceData } from '../../types';
import SearchableSelect from '../../components/SearchableSelect';

interface PendingTransaction {
    id: string | number;
    date: string;
    referenceNumber: string;
    invoiceNo?: string;
    amount: number;
    receipt: number;
    status: string;
    dueDate?: string;
    daysToDue?: number;
    postingNote?: string;
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
    referenceNumber?: string;
    amount: number;
    receiveNow: number;
    selected: boolean;
    status: string;
    dueDate?: string;
    daysToDue?: number;
    postingNote?: string;
}


import Icon from '../../components/Icon';

interface ReceiptVoucherProps {
    prefilledData?: ExtractedInvoiceData | null;
    clearPrefilledData?: () => void;
    isLimitReached?: boolean;
    onLimitReached?: () => void;
    isReadOnlyMode?: boolean;
    onAddVouchers?: (vouchers: any[], saveToMySQL?: boolean) => void;
}

const ReceiptVoucher: React.FC<ReceiptVoucherProps> = ({
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
    const [voucherType, setVoucherType] = useState('');
    const [voucherNumber, setVoucherNumber] = useState('');
    const [refNo, setRefNo] = useState('');
    const [bankTransactionId, setBankTransactionId] = useState<number | null>(null);

    // "Receive In" (Debit Account - Bank/Cash) matches PayFrom (Credit Account) visually in the single form
    const [receiveIn, setReceiveIn] = useState('');
    const [receiveInBalance, setReceiveInBalance] = useState('₹0 Dr');

    // "Receive From" (Credit Account - Customer) matches PayTo (Debit Account) visually
    const [receiveFrom, setReceiveFrom] = useState('');

    const [totalReceipt, setTotalReceipt] = useState(0);
    const [topAmount, setTopAmount] = useState<number>(0);
    const [editingVoucherId, setEditingVoucherId] = useState<number | null>(null);

    // Ledgers state
    const [allLedgers, setAllLedgers] = useState<Ledger[]>([]);
    const [portalCustomers, setPortalCustomers] = useState<any[]>([]);
    const [portalVendors, setPortalVendors] = useState<any[]>([]);
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

            // Deepest value is treated as a selectable endpoint for dropdown purposes.
            const endpoint = led || sg3 || sg2 || sg1 || g || mg;
            if (endpoint) {
                leaf.add(endpoint);
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

    // For ReceiveFrom dropdown we do NOT want hierarchy headings (group/sub-groups)
    // even if the hierarchy marks them as endpoints. Only real ledgers/vendors/customers.
    const isHierarchyHeadingName = (name: string, sets: { nonLeaf: Set<string>, leaf: Set<string> }) => {
        const n = normalizeName(name);
        return !!n && sets.nonLeaf.has(n);
    };

    // Fetch data on mount
    useEffect(() => {
        const fetchData = async () => {
            try {
                const [ledgersData, customersData, vendorsData, hierarchyData] = await Promise.all([
                    apiService.getLedgers(),
                    apiService.getRichCustomers(),
                    apiService.getRichVendors(),
                    apiService.getHierarchy(),
                ]);

                setAllLedgers(ledgersData || []);
                setPortalCustomers(customersData || []);
                setPortalVendors(vendorsData || []);
                setHierarchy(Array.isArray(hierarchyData) ? hierarchyData : []);
            } catch (error) {
                console.error('Error fetching data:', error);
                showError('Failed to fetch required data');
            }
        };
        fetchData();
    }, []);

    // Filter Receive In (Debit) options: Cash, Bank, CC, OD, and Loans/Borrowings
    const receiveInLedgers = useMemo(() => {
        const filtered = allLedgers.filter(l => {
            const group = (l.group || '').toLowerCase();
            const category = (l.category || '').toLowerCase();
            const words = group.split(/[\s-]+/); // split by space or hyphen

            // Explicitly exclude Purchase/Expense groups to prevent false positives
            if (group.includes('purchase') || group.includes('direct') || group.includes('indirect')) {
                return false;
            }

            return (
                (category.includes('asset') && words.some(w => ['cash', 'bank', 'od', 'cc'].includes(w))) ||
                (category.includes('liability') && words.some(w => ['borrowing', 'loan', 'od', 'cc'].includes(w))) ||
                // Fallbacks for less structured data
                words.some(w => ['cash', 'bank', 'od', 'cc', 'borrowing', 'loan'].includes(w))
            );
        });
        // Deduplicate by name
        return Array.from(new Map<string, any>(filtered.map(l => [(l.name || '').toLowerCase(), l])).values());
    }, [allLedgers]);

    const receiveFromOptions = useMemo(() => {
        const sets = buildHierarchySets(hierarchy);

        // 1. Hierarchy seeded ledgers (the "Red Italic" endpoints)
        const hierarchySeedLedgers = Array.from(sets.selectableMap.values())
            .filter((l: any) => {
                // Allow ALL "Red Italic" leaf nodes to appear in the list.
                // Structural headings (groups/subgroups) are filtered by sets.nonLeaf check.
                return !sets.nonLeaf.has(normalizeName(l.name)!);
            })
            .map((l: any) => ({
                id: `hierarchy-${l.id}`,
                name: l.name,
                group: l.group,
                category: l.category,
                type: 'ledger'
            }));

        const custOptions = portalCustomers.map(c => ({
            id: `portal-cust-${c.id}`,
            name: c.customer_name || c.name,
            group: 'Sundry Debtors',
            isPortal: true,
            type: 'customer'
        }));

        const vendOptions = portalVendors.map(v => ({
            id: `portal-vend-${v.id}`,
            name: v.vendor_name || v.name,
            group: 'Sundry Creditors',
            isPortal: true,
            type: 'vendor'
        }));

        const ledgerOptions = allLedgers
            .filter(l => {
                return !isHierarchyHeadingName(l.name, sets);
            })
            .map(l => ({
                ...l,
                type: l.group === 'Sundry Debtors' ? 'customer' :
                    l.group === 'Sundry Creditors' ? 'vendor' : 'ledger'
            }));

        // Combine and deduplicate
        // Preference: portal entities > tenant ledgers > hierarchy seeds
        const masterMap = new Map<string, any>();
        hierarchySeedLedgers.forEach(o => masterMap.set(o.name.toLowerCase(), o));
        ledgerOptions.forEach(l => masterMap.set(l.name.toLowerCase(), l));
        [...custOptions, ...vendOptions].forEach(o => masterMap.set(o.name.toLowerCase(), o));

        return Array.from(masterMap.values()).sort((a,b) => a.name.localeCompare(b.name));
    }, [allLedgers, portalCustomers, portalVendors, hierarchy]);


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

    // Populate from AI Extraction / Drill-down
    useEffect(() => {
        if (!prefilledData) return;

        // Helper to find exact ledger name from allLedgers (case-insensitive)
        const findLedgerName = (name: string) => {
            if (!name) return '';
            const normalized = name.trim().toLowerCase();
            const found = allLedgers.find(l => l.name.trim().toLowerCase() === normalized);
            return found ? found.name : name; // Fallback to original string so it still displays
        };

        if (prefilledData.invoiceDate) setDate(prefilledData.invoiceDate);
        if (prefilledData.sellerName) {
            const ledgerName = findLedgerName(prefilledData.sellerName);
            if (ledgerName) {
                setReceiveFrom(ledgerName);
                handleCustomerSelect(ledgerName);
            }
        }
        // ── Receive In (Bank/Cash account) ─────────────────────────────
        // Support both 'account' (mapped from drilldown) and 'receive_in' (direct API field)
        const receiveInRaw = (prefilledData as any).receive_in || (prefilledData as any).account || '';
        if (receiveInRaw) setReceiveIn(findLedgerName(receiveInRaw));

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
            setSelectedReceiptConfig((prefilledData as any).voucher_type);
        }

        if ((prefilledData as any).reference_number) {
            setRefNo((prefilledData as any).reference_number);
            setSingleAdvanceRefNo((prefilledData as any).reference_number);
        } else if (prefilledData.invoiceNumber) {
             setSingleAdvanceRefNo(prefilledData.invoiceNumber);
        }

        if ((prefilledData as any).narration) {
            setPostingNote((prefilledData as any).narration);
        }
        if ((prefilledData as any).bank_transaction_id) {
            setBankTransactionId((prefilledData as any).bank_transaction_id);
        }

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
            
            // 1. Look for an advance item
            const advanceItem = itemsList.find((i: any) => i.is_advance || i.reference_type === 'ADVANCE');
            if (advanceItem) {
                setShowSingleAdvanceSection(true);
                setSingleAdvanceRefNo(advanceItem.advance_ref_no || advanceItem.ref_no || '');
                setSingleAdvanceAmount(parseFloat(advanceItem.received_amount || advanceItem.amount_applied || advanceItem.amount || '0'));
            }
            
            // 2. Map standard invoice allocation items
            const invoices = itemsList.filter((i: any) => !i.is_advance && i.reference_type !== 'ADVANCE');
            if (invoices.length > 0) {
                const mappedPending: PendingTransaction[] = invoices.map((i: any) => {
                    const applied = parseFloat(i.received_amount || i.amount_applied || i.amount || '0');
                    const pendingBefore = parseFloat(i.pending_before || '0');
                    const balAfter = parseFloat(i.balance_after || '0');
                    
                    return {
                        id: (i.id || i.reference_id || Math.random()).toString(),
                        date: i.invoice_date || i.date || getCurrentDate(),
                        referenceNumber: i.reference_number || i.ref_no || i.reference_id || 'N/A',
                        amount: pendingBefore || (applied + balAfter),
                        receipt: applied,
                        status: balAfter <= 0 ? 'Received' : 'Partially Received',
                        dueDate: ''
                    };
                });
                setPendingTransactions(mappedPending);
                setTotalReceipt(mappedPending.reduce((sum, t) => sum + t.receipt, 0) + (advanceItem ? parseFloat(advanceItem.received_amount || advanceItem.amount_applied || advanceItem.amount || '0') : 0));
            }
        }

        // Only clear if NOT in read-only mode (otherwise repeated renders lose view state)
        if (clearPrefilledData && !isReadOnlyMode) clearPrefilledData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [prefilledData, clearPrefilledData, allLedgers, isReadOnlyMode]);

    const fetchReceiptConfigs = useCallback(async () => {
        try {
            // Use the dedicated receipts endpoint which is more reliable than the generic one
            const data = await httpClient.get<any[]>('/api/masters/master-voucher-receipts/');

            // Add voucher_type property if missing (important for some downstream logic)
            const receiptConfigs = (data || []).map(config => ({
                ...config,
                voucher_type: config.voucher_type || 'receipts'
            }));

            setReceiptVoucherConfigs(receiptConfigs);
            
            // If there's only 1 and none selected, default to it
            if (receiptConfigs && receiptConfigs.length === 1 && !selectedReceiptConfig) {
                setSelectedReceiptConfig(receiptConfigs[0].voucher_name);
            }
        } catch (error) {
            console.error('Error fetching receipt voucher configurations:', error);
            setReceiptVoucherConfigs([]);
        }
    }, [selectedReceiptConfig]);

    // Fetch receipt voucher configurations on mount
    useEffect(() => {
        fetchReceiptConfigs();
    }, [fetchReceiptConfigs]);

    // Synchronize prefilled voucher_type with options once they finish loading
    useEffect(() => {
        if (prefilledData && (prefilledData as any).voucher_type && receiptVoucherConfigs.length > 0) {
            const typeStr = String((prefilledData as any).voucher_type).trim();
            if (typeStr.toLowerCase() !== 'receipt' && typeStr.toLowerCase() !== 'receipts') {
                const match = receiptVoucherConfigs.find(c => 
                    String(c.voucher_name).trim().toLowerCase() === typeStr.toLowerCase()
                );
                if (match) {
                    setSelectedReceiptConfig(match.voucher_name);
                }
            }
        }
    }, [prefilledData, receiptVoucherConfigs]);

    // Auto-Recover Configuration from Voucher Number prefix (Drill-down)
    useEffect(() => {
        if (isReadOnlyMode && voucherNumber && receiptVoucherConfigs.length > 0) {
            // Only attempt to match if the current selection is invalid or generic
            const currentMatch = receiptVoucherConfigs.find(cfg => cfg.voucher_name === selectedReceiptConfig);
            if (!currentMatch) {
                const vNumLower = voucherNumber.toLowerCase();
                const matchedConfig = receiptVoucherConfigs.find(cfg => {
                    const prefix = (cfg.prefix || '').toLowerCase();
                    return prefix && vNumLower.startsWith(prefix);
                });
                
                if (matchedConfig) {
                    setSelectedReceiptConfig(matchedConfig.voucher_name);
                } else if (!selectedReceiptConfig && receiptVoucherConfigs.length > 0) {
                    setSelectedReceiptConfig(receiptVoucherConfigs[0].voucher_name);
                }
            }
        }
    }, [voucherNumber, receiptVoucherConfigs, isReadOnlyMode, selectedReceiptConfig]);

    // Generate voucher number when receipt configuration is selected
    useEffect(() => {
        if (selectedReceiptConfig && receiptVoucherConfigs.length > 0) {
            const config = receiptVoucherConfigs.find(c => c.voucher_name === selectedReceiptConfig);
            if (config) {
                // Wait for any prefilled logic to finish so we don't immediately overwrite it if present
                if (prefilledData && (prefilledData as any).receiptVoucherNumber) {
                    setVoucherNumber((prefilledData as any).receiptVoucherNumber);
                } else if (config.enable_auto_numbering) {
                    // Fetch the correctly formatted next number from the backend
                    httpClient.get<any>(`/api/masters/master-voucher-receipts/${config.id}/next-number/`)
                        .then((res) => {
                            setVoucherNumber(res.invoice_number || '');
                        })
                        .catch(() => {
                            // Fallback to local generation if API fails
                            const num = config.current_number || config.start_from || 1;
                            const digits = config.required_digits || 4;
                            const prefix = config.prefix || '';
                            const suffix = config.suffix || '';
                            setVoucherNumber(`${prefix}${String(num).padStart(digits, '0')}${suffix}`);
                        });
                } else {
                    setVoucherNumber('Manual Input');
                }
            }
        } else if (!prefilledData || !(prefilledData as any).receiptVoucherNumber) {
            setVoucherNumber('');
        }
    }, [selectedReceiptConfig, receiptVoucherConfigs, prefilledData]);

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

    const handleTxnNoteChange = (index: number, note: string) => {
        const updatedTransactions = [...pendingTransactions];
        updatedTransactions[index].postingNote = note;
        setPendingTransactions(updatedTransactions);
    };

    const handleBulkTxnNoteChange = (transactionId: string, note: string) => {
        setBulkTransactions(prev => prev.map(t =>
            t.id === transactionId ? { ...t, postingNote: note } : t
        ));
    };

    const calculateTotalReceipt = (transactions: PendingTransaction[], advance: number = singleAdvanceAmount) => {
        const total = transactions.reduce((sum, txn) => sum + (txn.receipt || 0), 0);
        setTotalReceipt(total + advance);
    };

    const handleTotalAmountChange = (val: number) => {
        setTopAmount(val);
    };

    useEffect(() => {
        calculateTotalReceipt(pendingTransactions, singleAdvanceAmount);
    }, [singleAdvanceAmount, pendingTransactions]);

    const difference = topAmount - totalReceipt;
    const isExactMatch = Math.abs(difference) < 0.01;
    const isOverAllocated = difference < -0.01;
    const isUnderAllocated = difference > 0.01;

    const getRowStatus = (receipt: number, pending: number) => {
        if (receipt === 0) return { label: 'Not Allocated', status: 'NOT_ALLOCATED', bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200' };
        if (receipt > pending + 0.01) return { label: `Over by ₹${(receipt - pending).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, status: 'OVER', bg: 'bg-red-100', text: 'text-red-600', border: 'border-red-200' };
        if (receipt < pending - 0.01) return { label: `Remaining ₹${(pending - receipt).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, status: 'PARTIAL', bg: 'bg-orange-100', text: 'text-orange-600', border: 'border-orange-200' };
        return { label: 'Full', status: 'FULL', bg: 'bg-green-100', text: 'text-green-600', border: 'border-green-200' };
    };

    const hasAnyOverAllocation = pendingTransactions.some(t => (t.receipt || 0) > t.amount + 0.01);
    const canPost = isExactMatch && !hasAnyOverAllocation && receiveIn && receiveFrom && topAmount > 0;

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

    const handleReceiveAmountOnly = async () => {
        if (!topAmount || topAmount <= 0) {
            showError("Please enter an amount first.");
            return;
        }
        
        try {
            const findLedgerId = (name: string) => {
                if (!name) return null;
                const normalized = name.trim().toLowerCase();
                const found = receiveFromOptions.find(opt => opt.name.trim().toLowerCase() === normalized);
                if (found) return found.id;
                return allLedgers.find(l => l.name.trim().toLowerCase() === normalized)?.id;
            };

            const receiveFromId = findLedgerId(receiveFrom);
            const receiveInId = findLedgerId(receiveIn);

            if (!receiveFromId || !receiveInId) {
                showError("Please select valid 'Receive In' and 'Receive From' accounts.");
                return;
            }

            const payload: any = {
                date: date,
                voucher_type: selectedReceiptConfig,
                voucher_number: voucherNumber,
                ref_no: refNo,
                receive_in: receiveInId,
                receive_from: receiveFromId,
                amount: topAmount,
                total_amount: topAmount,
                narration: postingNote,
                is_amount_only: true
            };
            
            if (editingVoucherId) {
                payload.items = [{
                    customer: receiveFromId,
                    amount: topAmount,
                    received_amount: topAmount,
                    reference_type: 'ADVANCE',
                    advance_ref_no: 'ADVANCE',
                    narration: 'Balance receipt'
                }];
                await httpClient.patch(`/api/vouchers/receipts/${editingVoucherId}/`, payload);
                showSuccess("Receipt updated (Amount Only)");
            } else {
                await httpClient.post('/api/vouchers/receipt-single/save-amount-only/', payload);
                showSuccess("Receipt recorded (Amount Only)");
            }
            
            handleCancel();
        } catch (error: any) {
            console.error("Receipt save error:", error);
            const msg = error.response?.data?.error || error.response?.data?.message || "Failed to record receipt. Please try again.";
            showError(msg);
        }
    };

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

        // If in read-only mode, DO NOT fetch fresh outstanding bills as it would overwrite the hydrated ones
        if (isReadOnlyMode) {
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
            // Find the ledger ID first
            const findLedgerId = (name: string) => {
                const normalized = name.trim().toLowerCase();
                const ledger = allLedgers.find(l => l.name.trim().toLowerCase() === normalized);
                if (ledger) return ledger.id;
                const portalCust = portalCustomers.find(c => (c.customer_name || c.name || '').trim().toLowerCase() === normalized);
                if (portalCust) return portalCust.ledger_id;
                return null;
            };
            const lId = findLedgerId(customerName);

            // Fetch pending expenses first so we can merge them regardless of customer/standard type
            let mappedExpenses: BulkTransaction[] = [];
            if (lId) {
                try {
                    const expenseData = await apiService.getPendingInvoices(lId);
                    mappedExpenses = (expenseData || [])
                        .filter((item: any) => (item.type || '').toLowerCase() === 'expense')
                        .map((item: any) => ({
                            id: (item.id || Math.random()).toString(),
                            date: item.date,
                            invoiceNo: item.reference_number,
                            amount: item.amount,
                            receiveNow: 0,
                            selected: false,
                            status: item.due_status || 'Due',
                            dueDate: item.due_date
                        }));
                } catch (e) {
                    console.error("Failed to fetch pending expenses:", e);
                }
            }

            // Fetch transactions (Sales Invoices) from the rich system
            console.log(`[DEBUG] ReceiptVoucher: Fetching rich sales for ${customerName}`);
            const response = await apiService.getRichCustomerSalesInvoices(customerName);
            console.log(`[DEBUG] ReceiptVoucher: Response data:`, response);

            // Find the customer to get their credit period from the portal master
            const normalizedName = customerName.trim().toLowerCase();
            const customer = portalCustomers.find(c =>
                (c.customer_name || c.name || '').trim().toLowerCase() === normalizedName
            );
            const creditPeriod = parseInt(customer?.credit_period || '0', 10);

            let validTransactions: BulkTransaction[] = [];

            if (response && Array.isArray(response) && response.length > 0) {
                const today = new Date();

                const mappedTransactions: BulkTransaction[] = response.map((item: any) => {
                    const invDate = new Date(item.date || getCurrentDate());
                    const d1 = new Date(invDate.getFullYear(), invDate.getMonth(), invDate.getDate());
                    const d2 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                    const diffTime = d2.getTime() - d1.getTime();
                    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

                    const rawStatus = (item.status || '').toString().trim().toLowerCase();

                    // Priority 1: Follow project specific status
                    let status = (rawStatus === 'partially received') ? 'Partially Received' : 'Not Due';

                    if (rawStatus === 'received') {
                        status = 'Received';
                    } else if (status === 'Not Due') {
                        if (diffDays > creditPeriod) {
                            status = 'Due';
                        } else if (diffDays === creditPeriod) {
                            status = 'Due Today';
                        }
                    }

                    // Resolve the outstanding amount using the actual payment balance
                    // DO NOT FALL BACK to total amount if balance is 0, unless it's a completely fresh invoice
                    let outstandingAmount = item.payment_details ? Number(item.payment_details.payment_balance ?? 0) : Number(item.total_amount ?? item.total ?? 0);

                    const dueDate = new Date(d1);
                    dueDate.setDate(dueDate.getDate() + creditPeriod);
                    const dueDateStr = dueDate.getFullYear() + '-' +
                        String(dueDate.getMonth() + 1).padStart(2, '0') + '-' +
                        String(dueDate.getDate()).padStart(2, '0');

                    const invoiceId = item.id || item.voucher_id || item.invoice_id;

                    return {
                        id: invoiceId?.toString() || Math.random().toString(),
                        date: item.date || getCurrentDate(),
                        invoiceNo: item.sales_invoice_no || item.invoice_number || item.voucher_number || 'N/A',
                        amount: outstandingAmount,
                        receiveNow: 0,
                        selected: false,
                        status: status,
                        dueDate: dueDateStr
                    };
                });

                // Filter: Only Due, Partially Received, Due Today. 
                // CRITICAL: Filter out items with 0 or negative balance, those with 'Received' status, and 'Not Due' status.
                validTransactions = mappedTransactions.filter(t =>
                    t.amount > 0 &&
                    t.status.trim().toLowerCase() !== 'received' &&
                    t.status !== 'Not Due' &&
                    (t.status === 'Due' || t.status === 'Partially Received' || t.status === 'Due Today')
                );
            } else if (lId) {
                // Fallback to standard pending invoices for other ledgers
                try {
                    const pendingData = await apiService.getPendingInvoices(lId);
                    validTransactions = (pendingData || [])
                        .map((item: any) => ({
                            id: (item.id || Math.random()).toString(),
                            date: item.date,
                            invoiceNo: item.reference_number,
                            amount: item.amount,
                            receiveNow: 0,
                            selected: false,
                            status: item.due_status || 'Due',
                            dueDate: item.due_date
                        }));
                } catch (e) {
                    console.error("Failed to fetch standard pending invoices:", e);
                }
            }

            // Always merge any additional pending expenses if they weren't already added
            if (mappedExpenses.length > 0) {
                const existingNos = new Set(validTransactions.map(t => t.invoiceNo.toLowerCase()));
                mappedExpenses.forEach(exp => {
                    if (!existingNos.has(exp.invoiceNo.toLowerCase())) {
                        validTransactions.push(exp);
                    }
                });
            }

            setBulkTransactions(validTransactions);
            const mappedPending: PendingTransaction[] = validTransactions.map(t => ({
                id: t.id,
                date: t.date,
                referenceNumber: t.invoiceNo,
                amount: t.amount,
                receipt: 0,
                status: t.status,
                dueDate: t.dueDate,
            }));
            setPendingTransactions(mappedPending);

            // Also load advances here for consistency with Single mode
            if (lId) {
                const advEndpoint = `/api/vouchers/advances/?ledger_id=${lId}`;
                console.log(`[DEBUG] ReceiptVoucher: Fetching advances from ${advEndpoint}`);
                const advances = await apiService.getAdvances(lId, 'customer');
                console.log(`[DEBUG] ReceiptVoucher: Advances data:`, advances);
                // setAvailableAdvances(advances || []); // Need to define setAvailableAdvances if not exist
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
        // setVoucherNumber(''); // DO NOT clear, let useEffect maintain the next number
        setRefNo('');
        setTopAmount(0);
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
        // setSelectedReceiptConfig(''); // Keep config selected
    };

    const handlePostReceipt = async () => {
        if (!selectedReceiptConfig) {
            showError("Please select a Voucher Type.");
            return;
        }

        if (!canPost) {
            if (!receiveIn) { showError("Please select 'Receive In' ledger"); return; }
            if (!receiveFrom) { showError("Please select 'Receive From' account"); return; }
            if (topAmount <= 0) { showError("Please enter an amount"); return; }
            
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

                const finalAmount = topAmount > 0 ? topAmount : totalReceipt;

                if (finalAmount <= 0) {
                    showError("Total receipt amount must be greater than zero.");
                    return;
                }

                let items = [
                    ...pendingTransactions
                        .filter(t => t.receipt > 0)
                        .map(t => ({
                            customer: receiveFromId,
                            reference_id: t.referenceNumber,
                            reference_type: 'invoice',
                            pending_transaction: { ...t, customer_name: receiveFrom },
                            amount: Number(Number(t.amount).toFixed(2)),
                            pending_before: Number(Number(t.amount).toFixed(2)),
                            received_amount: Number(Number(t.receipt).toFixed(2)),
                            balance_after: Number(Math.max(0, t.amount - t.receipt).toFixed(2)),
                            invoice_date: t.date,
                            posting_note: t.postingNote
                        })),
                    // Advance item if applicable
                    ...(singleAdvanceAmount > 0 ? [{
                        customer: receiveFromId,
                        reference_id: singleAdvanceRefNo || 'ADVANCE',
                        reference_type: 'advance',
                        pending_transaction: { customer_name: receiveFrom },
                        amount: Number(Number(singleAdvanceAmount).toFixed(2)),
                        received_amount: Number(Number(singleAdvanceAmount).toFixed(2)),
                        is_advance: true,
                        advance_ref_no: singleAdvanceRefNo
                    }] : [])
                ];

                // 3. Fallback: If amount entered but not fully allocated, treat remainder as 'Advance'
                if (items.length === 0 && finalAmount > 0) {
                    items.push({
                        customer: receiveFromId,
                        reference_id: singleAdvanceRefNo || 'ADVANCE',
                        reference_type: 'advance',
                        pending_transaction: { customer_name: receiveFrom },
                        amount: Number(Number(finalAmount).toFixed(2)),
                        received_amount: Number(Number(finalAmount).toFixed(2)),
                        is_advance: true,
                        advance_ref_no: singleAdvanceRefNo || 'ADVANCE'
                    });
                }

                const payload = {
                    date: date,
                    voucher_type: selectedReceiptConfig || voucherType,
                    voucher_number: voucherNumber,
                    ref_no: refNo,
                    receive_in: receiveInId,
                    customer: receiveFromId,
                    total_amount: Number(Number(finalAmount).toFixed(2)),
                    amount: Number(Number(finalAmount).toFixed(2)),
                    bank_transaction_id: bankTransactionId,
                    notes: postingNote,
                    items: items
                };

                if (singleAdvanceRefNo.trim() && singleAdvanceRefNo.trim() !== 'ADVANCE' && !editingVoucherId) {
                    const check = await httpClient.get<{ is_unique: boolean }>(`/api/vouchers/receipts/check-uniqueness/?ref_no=${encodeURIComponent(singleAdvanceRefNo)}`);
                    if (!check.is_unique) {
                        showError(`Reference Number '${singleAdvanceRefNo}' already exists.`);
                        return;
                    }
                }

                let response: any;
                if (editingVoucherId) {
                    response = await httpClient.patch(`/api/vouchers/receipts/${editingVoucherId}/`, payload);
                    showSuccess('Receipt Voucher updated successfully!');
                } else {
                    response = await httpClient.post('/api/vouchers/receipts/', payload);
                    showSuccess('Receipt Voucher posted successfully!');
                }

                // Sync component state with parent so dashboards and reports update instantly
                if (onAddVouchers) {
                    onAddVouchers([{
                        id: response?.id?.toString() || Date.now().toString(),
                        type: 'Receipt',
                        date: date,
                        party: receiveFrom,
                        amount: Number(finalAmount),
                        narration: postingNote,
                        account: receiveIn,
                        ...response
                    }], false);
                }

                // Refresh the voucher series counter so the next number is ready (Skip if editing existing!)
                const savedConfig = receiptVoucherConfigs.find(c => c.voucher_name === selectedReceiptConfig);
                if (savedConfig && savedConfig.enable_auto_numbering && !editingVoucherId) {
                    try {
                        const res = await httpClient.get<any>(`/api/masters/master-voucher-receipts/${savedConfig.id}/next-number/`);
                        const nextNumber = res.invoice_number || '';
                        const keepConfig = selectedReceiptConfig;
                        handleCancel();
                        setSelectedReceiptConfig(keepConfig);
                        setVoucherNumber(nextNumber);
                    } catch (e) {
                        console.error('Failed to refresh receipt voucher number:', e);
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
                                amount: Number(Number(t.amount).toFixed(2)),
                                pending_before: Number(Number(t.amount).toFixed(2)),
                                received_amount: Number(Number(t.receiveNow).toFixed(2)),
                                balance_after: Number(Math.max(0, t.amount - t.receiveNow).toFixed(2)),
                                invoice_date: t.date,
                                posting_note: t.postingNote
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
                                amount: Number(Math.max(remaining, rowAdvanceAmount, row.amount).toFixed(2)),
                                received_amount: Number(Math.max(remaining, rowAdvanceAmount).toFixed(2)),
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
                                balance_after: Math.max(0, t.amount - t.receiveNow),
                                posting_note: t.postingNote
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
                            amount: Number(Number(row.amount).toFixed(2)),
                            received_amount: Number(Number(row.amount).toFixed(2)),
                            is_advance: isAdvance,
                            advance_ref_no: rowAdvanceRefNo || row.referenceNumber
                        });
                    }
                }

                const payload = {
                    date: date,
                    receive_in: receiveInId,
                    total_amount: Number(Number(bulkTotalReceipt).toFixed(2)),
                    amount: Number(Number(bulkTotalReceipt).toFixed(2)),
                    voucher_number: voucherNumber,
                    voucher_type: selectedReceiptConfig || voucherType,
                    ref_no: refNo,
                    items: allItems,
                    notes: postingNote
                };

                let response: any;
                if (editingVoucherId) {
                    response = await httpClient.patch(`/api/vouchers/receipts/${editingVoucherId}/`, payload);
                    showSuccess(`Consolidated Receipt Voucher updated successfully.`);
                } else {
                    response = await httpClient.post('/api/vouchers/receipts/', payload);
                    showSuccess(`Consolidated Receipt Voucher posted successfully.`);
                }

                // Sync component state with parent so dashboards and reports update instantly
                if (onAddVouchers) {
                    onAddVouchers([{
                        id: response?.id?.toString() || Date.now().toString(),
                        type: 'Receipt',
                        date: date,
                        party: 'Multiple Parties',
                        amount: Number(bulkTotalReceipt),
                        narration: postingNote,
                        account: receiveIn,
                        ...response
                    }], false);
                }

                // Refresh the voucher series counter so the next number is ready (Skip if editing existing!)
                const savedConfigBulk = receiptVoucherConfigs.find(c => c.voucher_name === selectedReceiptConfig);
                if (savedConfigBulk && savedConfigBulk.enable_auto_numbering && !editingVoucherId) {
                    try {
                        const res = await httpClient.get<any>(`/api/masters/master-voucher-receipts/${savedConfigBulk.id}/next-number/`);
                        const nextNumber = res.invoice_number || '';
                        const keepConfig = selectedReceiptConfig;
                        handleCancel();
                        setSelectedReceiptConfig(keepConfig);
                        setVoucherNumber(nextNumber);
                    } catch (e) {
                        console.error('Failed to refresh receipt voucher number:', e);
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
                <fieldset disabled={isReadOnlyMode} className={isReadOnlyMode ? 'pointer-events-none opacity-90' : ''}>
                    {/* Top Row */}
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
                                    options={receiveFromOptions.map(l => ({
                                        label: l.type ? `${l.name} (${l.type.charAt(0).toUpperCase() + l.type.slice(1)})` : l.name,
                                        value: l.name
                                    }))}
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
                                <button
                                    onClick={handleReceiveAmountOnly}
                                    className="px-4 py-2 border border-indigo-200 rounded-[4px] text-sm font-bold text-indigo-600 bg-white hover:bg-indigo-50 transition-colors whitespace-nowrap"
                                >
                                    Receive Amount Only
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Amount Field Row - Right Aligned as per user request */}
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
                               
                                className="w-full px-3 py-2 border border-blue-400 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-gray-900 text-right h-10 shadow-sm"
                                placeholder="0.00"
                            />
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

                        {receiveFrom ? (
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
                                            <th className="px-6 py-3 text-right text-xs font-semibold uppercase">RECEIPT</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white divide-y divide-gray-200">
                                        {pendingTransactions.map((txn, index) => {
                                            const status = getRowStatus(txn.receipt || 0, txn.amount);
                                            const isProblemRow = (isUnderAllocated && (txn.receipt === 0 || txn.receipt < txn.amount - 0.01)) || (isOverAllocated && txn.receipt > txn.amount + 0.01);
                                            
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
                                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${txn.status === 'Due' || txn.status === 'Due Today'
                                                            ? 'bg-red-100 text-red-600 border border-red-200'
                                                            : (txn.status === 'Partially Received' || txn.status === 'Partially Paid')
                                                                ? 'bg-orange-100 text-orange-600 border border-orange-200'
                                                                : 'bg-green-100 text-green-600 border border-green-200'
                                                            }`}>
                                                            {txn.status}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-4 text-center">
                                                        <div className={`px-2 py-1 rounded-[4px] border text-[10px] font-black uppercase tracking-tight ${status.bg} ${status.text} ${status.border}`}>
                                                            {status.label}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 text-sm text-gray-700 text-right font-medium text-red-600">
                                                        ₹{Math.max(0, txn.amount - txn.receipt).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                    </td>
                                                    <td className="px-6 py-4 text-center">
                                                        <button
                                                            onClick={() => handleReceive(index)}
                                                            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-600 text-white text-xs font-medium rounded shadow-sm transition-colors uppercase font-bold"
                                                        >
                                                            Receive
                                                        </button>
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <input
                                                            type="number" onWheel={(e) => e.currentTarget.blur()}
                                                            value={txn.receipt || ''}
                                                            onChange={(e) => handleReceiptChange(index, parseFloat(e.target.value) || 0)}
                                                            placeholder="0"
                                                            className={`w-24 px-3 py-1.5 text-right border rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-bold ${
                                                                status.status === 'OVER' ? 'border-red-500 bg-red-50 text-red-700' : 
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
                                                ₹{totalReceipt.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
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
                                <p className="text-sm">Please select a "Receive From" account to view pending transactions.</p>
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
                            onClick={handlePostReceipt}
                            disabled={!canPost}
                            className={`px-8 py-2 font-bold rounded-[4px] text-sm transition-all uppercase tracking-wider ${
                                canPost 
                                    ? 'bg-white border-2 border-emerald-200 text-emerald-600 hover:bg-emerald-50' 
                                    : 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                            }`}
                        >
                            {isExactMatch ? 'Post Receipt' : 'Complete Allocation'}
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
                                        type="number" onWheel={(e) => e.currentTarget.blur()}
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
                                                options={receiveFromOptions.map(l => ({
                                                    label: l.type ? `${l.name} (${l.type.charAt(0).toUpperCase() + l.type.slice(1)})` : l.name,
                                                    value: l.name
                                                }))}
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
                                                type="number" onWheel={(e) => e.currentTarget.blur()}
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
                                                        <th className="px-2 py-3 text-center text-xs font-medium text-gray-600 uppercase">BILL STATUS</th>
                                                        <th className="px-2 py-3 text-center text-xs font-medium text-gray-600 uppercase">ALLOCATION</th>
                                                        <th className="px-2 py-3 text-right text-xs font-medium text-gray-600 uppercase">PENDING</th>
                                                        <th className="px-2 py-3 text-center text-xs font-medium text-gray-600 uppercase">ACTION</th>
                                                        <th className="px-2 py-3 text-right text-xs font-medium text-gray-600 uppercase">RECEIPT</th>
                                                        <th className="px-2 py-3 text-left text-xs font-medium text-gray-600 uppercase">POSTING NOTE</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {bulkTransactions.map(transaction => {
                                                        const status = getRowStatus(transaction.receiveNow || 0, transaction.amount);
                                                        return (
                                                            <tr key={transaction.id} className={`border-b border-gray-200 transition-colors ${status.status === 'OVER' ? 'bg-red-50/30' : 'hover:bg-gray-50'}`}>
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
                                                                        type="number" onWheel={(e) => e.currentTarget.blur()}
                                                                        value={transaction.receiveNow || ''}
                                                                        onChange={e => handleReceiveNowChange(transaction.id, parseFloat(e.target.value) || 0)}
                                                                        className={`w-24 px-3 py-1.5 text-right border rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-bold ${
                                                                            status.status === 'OVER' ? 'border-red-500 bg-red-50 text-red-700' : 
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
                                                    })}
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
                                                    type="number" onWheel={(e) => e.currentTarget.blur()}
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
                    </fieldset>
                )
            }
        </div >
    );
};

export default ReceiptVoucher;



