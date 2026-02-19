// Vendor Portal - Master Configuration
import React, { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { usePermissions } from '../../hooks/usePermissions';
import { httpClient } from '../../services/httpClient';
import CategoryHierarchicalDropdown from '../../components/CategoryHierarchicalDropdown';
import { InventoryCategoryWizard } from '../../components/InventoryCategoryWizard';
import SearchableDropdown from '../../components/SearchableDropdown';
import { showError, showSuccess, showInfo, showWarning, confirm } from '../../utils/toast';
import { handleApiError } from '../../utils/errorHandler';



type VendorTab = 'Master' | 'Transaction';
type MasterSubTab = 'Category' | 'PO Settings' | 'Vendor Creation' | 'Basic Details' | 'GST Details' | 'Products/Services' | 'TDS & Other Statutory' | 'Banking Info' | 'Terms & Conditions';
type TransactionSubTab = 'Purchase Orders' | 'Procurement' | 'Payment';
type POSubTab = 'Dashboard' | 'Create PO' | 'Pending PO' | 'Executed PO';
type CreatePOSubTab = 'Draft PO' | 'Pending for Approval' | 'Mail PO';
type ProcurementSubTab = 'Dashboard' | 'Raw Material' | 'Stock-in Trade' | 'Consumables' | 'Stores & Spares' | 'Services';

// Category Interface (Mirrors Inventory)
const VENDOR_SYSTEM_CATEGORIES = [
    'Raw Material',
    'Work in Progress',
    'Finished Goods',
    'Stores and Spares',
    'Packing Material',
    'Stock in Trade'
];

// TDS Rates Master Data
const TDS_RATES_MASTER: { [key: string]: { tdsRate: string; penaltyRate: string; description: string } } = {
    'Section 194C': { tdsRate: '1% / 2%', penaltyRate: '20%', description: 'Payment to Contractors who are Individuals or Hindu Undivided Family (HUF) / Payment to Contractors other than Individuals & HUF' },
    'Section 194H': { tdsRate: '2%', penaltyRate: '20%', description: 'Commission and Brokerage to agents' },
    'Section 194-I': { tdsRate: '2% / 10%', penaltyRate: '20%', description: 'Rent on Land, Building, or Furniture & fitting / Rent on Plant & Machinery, or Equipment' },
    'Section 194J': { tdsRate: '2% / 10%', penaltyRate: '20%', description: 'Fees for Technical Services, Call Center Operations, Royalty on sale & distribution of films / Professional Services, Royalty from other than films, Non-Compete Fees, etc. / Director\'s Remuneration' },
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
}

const VendorPortalPage: React.FC<VendorPortalProps> = ({ onLogout }) => {
    const { hasTabAccess, isSuperuser } = usePermissions();
    // GST Details Interfaces (Defined inside to avoid placement issues, or better moved out if stable)
    // Actually, moving them here
    interface PlaceOfBusiness {
        id: string;
        referenceName: string;
        address: string;
        contactPerson: string;
        email: string;
        contactNumber: string;
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
    const [activeCreatePOSubTab, setActiveCreatePOSubTab] = useState<CreatePOSubTab>('Draft PO');
    const [activeProcurementSubTab, setActiveProcurementSubTab] = useState<ProcurementSubTab>('Dashboard');
    const [activePaymentSubTab, setActivePaymentSubTab] = useState<ProcurementSubTab>('Dashboard');

    // Procurement View State (New)
    const [procurementViewMode, setProcurementViewMode] = useState<'list' | 'ledger' | 'month'>('list');
    const [selectedProcurementVendor, setSelectedProcurementVendor] = useState<any>(null);

    // Month Filter State
    const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
    const [isMonthFilterOpen, setIsMonthFilterOpen] = useState(false);

    const [ledgerFilters, setLedgerFilters] = useState({
        date: '',
        transferFrom: '',
        referenceNo: '',
        ledger: '',
        status: '',
        debit: '',
        credit: '',
        runningBalance: ''
    });

    // Mock Data for Procurement (Reference from images)
    const vendorAgingList = [
        { id: 1, code: 'VEN-001', name: 'Alpha Raw Materials', aging0_45: '45,000', aging45_90: '-', aging6M: '-', aging1Y: '-' },
        { id: 2, code: 'VEN-005', name: 'Beta Supplies', aging0_45: '12,500', aging45_90: '-', aging6M: '-', aging1Y: '-' },
        { id: 3, code: 'VEN-012', name: 'Gamma Corp', aging0_45: '78,000', aging45_90: '-', aging6M: '-', aging1Y: '-' },
        { id: 4, code: 'VEN-003', name: 'Delta Industries', aging0_45: '-', aging45_90: '1,20,000', aging6M: '-', aging1Y: '-' },
    ];

    // Dynamic Ledger Data State
    const [vendorLedgerData, setVendorLedgerData] = useState<any[]>([]);
    const [loadingLedger, setLoadingLedger] = useState(false);

    // Fetch ledger data for a selected vendor, enriching Payment/Receipt entries with voucher numbers
    const fetchVendorLedger = async (vendorName: string) => {
        setLoadingLedger(true);
        try {
            // Fetch payment vouchers for this vendor (pay_to = vendor name)
            const paymentRes: any = await httpClient.get(`/api/vouchers/payment-single/?pay_to=${encodeURIComponent(vendorName)}`);
            const paymentVouchers: any[] = Array.isArray(paymentRes) ? paymentRes : (paymentRes.results || []);

            // Fetch receipt vouchers for this vendor (receive_from = vendor name)
            const receiptRes: any = await httpClient.get(`/api/vouchers/receipt-single/?receive_from=${encodeURIComponent(vendorName)}`);
            const receiptVouchers: any[] = Array.isArray(receiptRes) ? receiptRes : (receiptRes.results || []);

            // Build ledger entries from Payment vouchers
            const paymentEntries = paymentVouchers.map((v: any, idx: number) => ({
                id: `pay-${v.id || idx}`,
                date: v.date || '',
                transferFrom: 'Payment',
                referenceNo: v.voucher_number || '-',
                ledger: v.pay_from || '-',
                status: 'Paid',
                debit: '-',
                credit: v.total_payment ? Number(v.total_payment).toLocaleString('en-IN') : '-',
                runningBalance: '-'
            }));

            // Build ledger entries from Receipt vouchers
            const receiptEntries = receiptVouchers.map((v: any, idx: number) => ({
                id: `rec-${v.id || idx}`,
                date: v.date || '',
                transferFrom: 'Receipt',
                referenceNo: v.voucher_number || '-',
                ledger: v.receive_in || '-',
                status: 'Paid',
                debit: '-',
                credit: v.total_receipt ? Number(v.total_receipt).toLocaleString('en-IN') : '-',
                runningBalance: '-'
            }));

            // Combine and sort by date descending
            const allEntries = [...paymentEntries, ...receiptEntries].sort((a, b) =>
                new Date(b.date).getTime() - new Date(a.date).getTime()
            );

            // If no real data, fall back to mock data so the UI is not empty
            if (allEntries.length === 0) {
                setVendorLedgerData([
                    { id: 1, date: '2023-10-28', transferFrom: 'Purchase', referenceNo: 'INV-2023-001', ledger: 'Purchase A/c', status: 'Unpaid', debit: '45,000', credit: '-', runningBalance: '45,000 Dr' },
                    { id: 2, date: '2023-10-25', transferFrom: 'Payment', referenceNo: 'V-002', ledger: 'HDFC Bank', status: 'Paid', debit: '-', credit: '15,000', runningBalance: '30,000 Dr' },
                    { id: 3, date: '2023-10-20', transferFrom: 'Purchase', referenceNo: 'INV-2023-002', ledger: 'Purchase A/c', status: 'Partially Paid', debit: '12,000', credit: '-', runningBalance: '42,000 Dr' },
                    { id: 4, date: '2023-10-15', transferFrom: 'Receipt', referenceNo: 'V-005', ledger: 'Cash', status: 'Paid', debit: '-', credit: '5,000', runningBalance: '37,000 Dr' },
                    { id: 5, date: '2023-10-10', transferFrom: 'Sales', referenceNo: 'INV-2023-003', ledger: 'Sales A/c', status: 'Paid', debit: '-', credit: '2,000', runningBalance: '35,000 Dr' },
                ]);
            } else {
                setVendorLedgerData(allEntries);
            }
        } catch (error) {
            console.error('Error fetching vendor ledger:', error);
            // Fall back to mock data on error
            setVendorLedgerData([
                { id: 1, date: '2023-10-28', transferFrom: 'Purchase', referenceNo: 'INV-2023-001', ledger: 'Purchase A/c', status: 'Unpaid', debit: '45,000', credit: '-', runningBalance: '45,000 Dr' },
                { id: 2, date: '2023-10-25', transferFrom: 'Payment', referenceNo: 'V-002', ledger: 'HDFC Bank', status: 'Paid', debit: '-', credit: '15,000', runningBalance: '30,000 Dr' },
                { id: 3, date: '2023-10-20', transferFrom: 'Purchase', referenceNo: 'INV-2023-002', ledger: 'Purchase A/c', status: 'Partially Paid', debit: '12,000', credit: '-', runningBalance: '42,000 Dr' },
                { id: 4, date: '2023-10-15', transferFrom: 'Receipt', referenceNo: 'V-005', ledger: 'Cash', status: 'Paid', debit: '-', credit: '5,000', runningBalance: '37,000 Dr' },
                { id: 5, date: '2023-10-10', transferFrom: 'Sales', referenceNo: 'INV-2023-003', ledger: 'Sales A/c', status: 'Paid', debit: '-', credit: '2,000', runningBalance: '35,000 Dr' },
            ]);
        } finally {
            setLoadingLedger(false);
        }
    };


    const filteredLedgerData = vendorLedgerData.filter(entry => {
        return (
            entry.date.toLowerCase().includes(ledgerFilters.date.toLowerCase()) &&
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

    const vendorMonthData = [
        { month: 'January', debit: '-', credit: '-', closingBalance: '-' },
        { month: 'February', debit: '-', credit: '-', closingBalance: '-' },
        { month: 'March', debit: '-', credit: '-', closingBalance: '-' },
        { month: 'April', debit: '-', credit: '-', closingBalance: '-' },
        { month: 'May', debit: '-', credit: '-', closingBalance: '-' },
        { month: 'June', debit: '-', credit: '-', closingBalance: '-' },
        { month: 'July', debit: '-', credit: '-', closingBalance: '-' },
        { month: 'August', debit: '-', credit: '-', closingBalance: '-' },
        { month: 'September', debit: '-', credit: '-', closingBalance: '-' },
        { month: 'October', debit: '57,000', credit: '22,000', closingBalance: '35,000 Cr' },
        { month: 'November', debit: '-', credit: '-', closingBalance: '35,000 Cr' },
        { month: 'December', debit: '-', credit: '-', closingBalance: '35,000 Cr' },
    ];

    // Defaulting logic for sub-tabs
    const availableMasterSubTabs = ['Category', 'PO Settings', 'Vendor Creation'].filter(subTab => isSuperuser || hasTabAccess('Vendor Portal', subTab));
    const availableTransactionSubTabs = ['Purchase Orders', 'Procurement', 'Payment'].filter(subTab => isSuperuser || hasTabAccess('Vendor Portal', subTab));

    useEffect(() => {
        if (!isSuperuser && availableMasterSubTabs.length > 0 && !availableMasterSubTabs.includes(activeMasterSubTab as string)) {
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

    // PO Settings State
    const [poSeriesList, setPoSeriesList] = useState<POSeries[]>([]);
    const [loadingPOSeries, setLoadingPOSeries] = useState(false);
    const [selectedPOSeries, setSelectedPOSeries] = useState<POSeries | null>(null);
    const [isEditModePO, setIsEditModePO] = useState(false);

    // PO Form Field State
    const [poName, setPoName] = useState('');
    const [poCategoryId, setPoCategoryId] = useState<number | null>(null);
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
        poNumber: '',
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
        deliveryTerms: ''
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
        igst: string;
        cgst: string;
        sgst: string;
        cess: string;
        netValue: string;
        uom: string;
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
            uom: ''
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

    // Fetch Vendors
    const fetchVendors = async () => {
        try {
            setLoadingVendors(true);
            const response = await httpClient.get<VendorBasicDetail[] | any>('/api/vendors/basic-details/');
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
    }, []);



    // Vendor Branch State
    const [availableBranches, setAvailableBranches] = useState<any[]>([]);

    const fetchVendorBranches = async (vendorId: number) => {
        try {
            const response = await httpClient.get<any>(`/api/vendors/gst-details/?vendor_basic_detail=${vendorId}`);
            const data = Array.isArray(response) ? response : (response.results || []);
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
            const response = await httpClient.get<any>(`/api/vendors/products-services/?vendor_basic_detail=${vendorId}`);
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
                                address: '123, Business Park, Tech City, India',
                                contactPerson: 'John Doe',
                                email: 'john@example.com',
                                contactNumber: '9876543210',
                                isExpanded: true
                            },
                            {
                                id: Date.now().toString() + '_2',
                                referenceName: 'Warehouse 1',
                                address: '456, Industrial Area, Tech City, India',
                                contactPerson: 'Jane Smith',
                                email: 'jane@example.com',
                                contactNumber: '9876541111',
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
        setGstRecords(gstRecords.map(r => {
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
                            address: '',
                            contactPerson: '',
                            email: '',
                            contactNumber: '',
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
        { id: 1, poNumber: 'PO-2023-001', poDate: '2023-10-26', vendorName: 'Tech Solutions Inc.', address: '123 Innovation Dr, Tech City', status: 'Draft', category: 'Raw Material', branch: 'Main Branch', deliveryDate: '2023-11-10', amount: '12500.00' },
        { id: 2, poNumber: 'PO-2023-002', poDate: '2023-10-27', vendorName: 'Global Supplies Ltd.', address: '456 Logistics Way, Port Town', status: 'Pending Approval', category: 'Stock-in Trade', branch: 'West Wing', deliveryDate: '2023-11-15', amount: '8750.50' },
        { id: 3, poNumber: 'PO-2023-003', poDate: '2023-10-28', vendorName: 'Quality Materials Co.', address: '789 Industrial Park, Mfg Zone', status: 'Approved', category: 'Consumables', branch: 'East Warehouse', deliveryDate: '2023-11-20', amount: '3400.00' },
        { id: 4, poNumber: 'PO-2023-004', poDate: '2023-10-29', vendorName: 'Office Depot', address: '101 Corporate Blvd, Biz Dist', status: 'Mailed', category: 'Stores & Spares', branch: 'HQ', deliveryDate: '2023-11-05', amount: '1200.00' },
        { id: 5, poNumber: 'PO-2023-005', poDate: '2023-10-30', vendorName: 'Fast Track Logistics', address: '222 Speedy Ln, Transit Hub', status: 'Approved', category: 'Services', branch: 'Main Branch', deliveryDate: '2023-11-25', amount: '5600.00' },
        { id: 6, poNumber: 'PO-2023-006', poDate: '2023-10-15', vendorName: 'Old World Imports', address: '88 Antiques Rd, Old Town', status: 'Closed', category: 'Raw Material', branch: 'West Wing', deliveryDate: '2023-10-30', amount: '9800.00' },
    ]);

    const handleApproveAndMail = (poId: number) => {
        setPurchaseOrders(prevOrders => prevOrders.map(po => {
            if (po.id === poId) {
                return { ...po, status: 'Mailed' };
            }
            return po;
        }));
        // Use global toast if available, or just log for now since showToast was commented out
        console.log(`PO #${poId} approved and mailed.`);
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
            uom: ''
        };
        setPOItems([...poItems, newItem]);
    };

    const handleRemovePOItem = (id: number) => {
        if (poItems.length > 1) {
            setPOItems(poItems.filter(item => item.id !== id));
        }
    };

    const handlePOItemChange = (id: number, field: keyof POItem, value: string) => {
        setPOItems(prevItems => prevItems.map(item => {
            if (item.id === id) {
                const updatedItem = { ...item, [field]: value };

                // Conversions for calculation
                const quantity = parseFloat(field === 'quantity' ? value : item.quantity) || 0;
                const finalRate = parseFloat(field === 'finalRate' ? value : item.finalRate) || 0;

                const igstRate = parseFloat(field === 'igst' ? value : item.igst) || 0;
                const cgstRate = parseFloat(field === 'cgst' ? value : item.cgst) || 0;
                const sgstRate = parseFloat(field === 'sgst' ? value : item.sgst) || 0;
                const cessRate = parseFloat(field === 'cess' ? value : item.cess) || 0;

                // Calculate Taxable Value: Quantity * Final Rate
                const taxableVal = quantity * finalRate;
                updatedItem.taxableValue = taxableVal.toFixed(2);

                // Calculate Net Value: Taxable Value + Total GST Amount
                const totalTaxRate = igstRate + cgstRate + sgstRate + cessRate;
                const gstAmount = (taxableVal * totalTaxRate) / 100;
                const netVal = taxableVal + gstAmount;
                updatedItem.netValue = netVal.toFixed(2);

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
                gst_rate: (parseFloat(item.igst) || 0) + (parseFloat(item.cgst) || 0) + (parseFloat(item.sgst) || 0) + (parseFloat(item.cess) || 0),
                gst_amount: (parseFloat(item.taxableValue) || 0) * ((parseFloat(item.igst) || 0) + (parseFloat(item.cgst) || 0) + (parseFloat(item.sgst) || 0) + (parseFloat(item.cess) || 0)) / 100,
                invoice_value: parseFloat(item.netValue) || 0
            }));

            // Prepare PO payload
            const payload = {
                po_series_id: createPOForm.poSeriesName ? parseInt(createPOForm.poSeriesName) : null,
                vendor_id: createPOForm.vendorName ? parseInt(createPOForm.vendorName) : null,
                vendor_name: createPOForm.vendorName,
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



            // Reset form
            setCreatePOForm({
                poSeriesName: '',
                poNumber: '',
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
                deliveryTerms: ''
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
                uom: ''
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
            'GST Details',
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
        voucherNo: string;
        supplierInvoiceNo: string;
        amount: string;
        status: 'Pending' | 'Approved' | 'Posted' | 'Initiated';
        actionLog?: LogEntry[];
        category: 'Raw Material' | 'Stock-in Trade' | 'Consumables' | 'Stores & Spares' | 'Services';
    }

    const [paymentBills, setPaymentBills] = useState<PaymentBill[]>([
        { id: 1, date: '2023-11-15', vendorReferenceName: 'Alpha Raw Materials', voucherNo: 'V-001', supplierInvoiceNo: 'INV-2023-001', amount: '? 45,000', status: 'Pending', category: 'Raw Material', actionLog: [] },
        { id: 2, date: '2023-11-10', vendorReferenceName: 'Beta Supplies', voucherNo: 'V-002', supplierInvoiceNo: 'INV-2023-002', amount: '? 12,500', status: 'Pending', category: 'Raw Material', actionLog: [] },
        {
            id: 3, date: '2023-11-05', vendorReferenceName: 'Gamma Corp', voucherNo: 'V-003', supplierInvoiceNo: 'INV-2023-003', amount: '? 78,000', status: 'Approved', category: 'Services',
            actionLog: [{ action: 'Approved', user: 'John Doe', date: '2023-11-06 10:30 AM' }]
        },
        {
            id: 4, date: '2023-10-28', vendorReferenceName: 'Delta Industries', voucherNo: 'V-004', supplierInvoiceNo: 'INV-2023-004', amount: '? 1,20,000', status: 'Posted', category: 'Stock-in Trade',
            actionLog: [{ action: 'Approved', user: 'Jane Smith', date: '2023-10-29 02:15 PM' }]
        },
        {
            id: 5, date: '2023-10-20', vendorReferenceName: 'Epsilon Trading', voucherNo: 'V-005', supplierInvoiceNo: 'INV-2023-005', amount: '? 56,700', status: 'Initiated', category: 'Consumables',
            actionLog: [{ action: 'Approved', user: 'Mike Johnson', date: '2023-10-21 09:45 AM' }]
        },
    ]);

    const [paymentSortOrder, setPaymentSortOrder] = useState<'recent' | 'earliest'>('recent');
    const [showPostPaymentModal, setShowPostPaymentModal] = useState(false);
    const [selectedBillForPayment, setSelectedBillForPayment] = useState<PaymentBill | null>(null);

    // Payment Bills Filters State
    const [paymentBillFilters, setPaymentBillFilters] = useState({
        date: '',
        vendorReferenceName: '',
        voucherNo: '',
        supplierInvoiceNo: '',
        amount: '',
        status: ''
    });

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

    // Update bank field
    const handleBankChange = (id: number, field: keyof BankAccount, value: string | string[]) => {
        setBankAccounts(bankAccounts.map(bank =>
            bank.id === id ? { ...bank, [field]: value } : bank
        ));
    };


    // Vendor Basic Details State
    const [vendorCode, setVendorCode] = useState('');
    const [vendorName, setVendorName] = useState('');
    const [panNo, setPanNo] = useState('');
    const [contactPerson, setContactPerson] = useState('');
    const [vendorEmail, setVendorEmail] = useState('');
    const [contactNo, setContactNo] = useState('');
    const [vendorCategory, setVendorCategory] = useState('');
    const [isAlsoCustomer, setIsAlsoCustomer] = useState(false);
    const [tcsApplicable, setTcsApplicable] = useState(false);
    const [createCustomerPrompt, setCreateCustomerPrompt] = useState<boolean | null>(null);


    // Handle Basic Details Form Submit (Navigation Only)
    const handleBasicDetailsSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (!vendorName || !vendorEmail || !contactNo || !vendorCategory) {
            showError('Please fill in all required fields (Vendor Name, Email, Contact No, Vendor Category)');
            return;
        }
        setActiveMasterSubTab('GST Details');
    };


    // Vendor GST Details State
    const [gstin, setGstin] = useState('');
    const [gstRegistrationType, setGstRegistrationType] = useState('regular');
    const [legalName, setLegalName] = useState('');
    const [tradeName, setTradeName] = useState('');
    const [createdVendorId, setCreatedVendorId] = useState<number | null>(() => {
        const saved = localStorage.getItem('currentVendorId');
        return saved ? parseInt(saved) : null;
    });

    // Persist vendor ID
    useEffect(() => {
        if (createdVendorId) {
            localStorage.setItem('currentVendorId', createdVendorId.toString());
        }
    }, [createdVendorId]);

    // TDS & Other Statutory Details State
    const [msmeUdyamNo, setMsmeUdyamNo] = useState('');
    const [fssaiLicenseNo, setFssaiLicenseNo] = useState('');
    const [importExportCode, setImportExportCode] = useState('');
    const [eouStatus, setEouStatus] = useState('');
    const [tdsSectionApplicable, setTdsSectionApplicable] = useState('');
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
        setCreatedVendorId(null);
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
                is_also_customer: isAlsoCustomer,
                tcs_applicable: tcsApplicable
            };

            let newId = createdVendorId;
            if (!newId) {
                console.log('Creating new vendor basic details...');
                const basicRes: any = await httpClient.post('/api/vendors/basic-details/', basicPayload);
                newId = basicRes.id;
                setCreatedVendorId(newId);
                localStorage.setItem('currentVendorId', newId.toString());
                console.log('✅ Basic details created. Vendor ID:', newId);
            } else {
                console.log('Updating existing vendor basic details for ID:', newId);
                await httpClient.patch(`/api/vendors/basic-details/${newId}/`, basicPayload);
                console.log('✅ Basic details updated.');
            }

            // 2. GST Details - Check existing to avoid duplicates
            console.log('Saving GST details...');
            const existingGst: any = await httpClient.get(`/api/vendors/gst-details/?vendor_basic_detail=${newId}`);
            const existingGstList = Array.isArray(existingGst) ? existingGst : (existingGst.results || []);

            for (const gst of gstRecords) {
                if (!gst.gstin) continue;

                // Loop through all branches/places of business for this GSTIN
                const branches = gst.placesOfBusiness && gst.placesOfBusiness.length > 0
                    ? gst.placesOfBusiness
                    : [{ referenceName: '', address: '', contactPerson: '', email: '', contactNumber: '' }];

                for (const branch of branches) {
                    // Map frontend registration type to backend keys
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
                        branch_address: branch.address || '',
                        branch_contact_person: branch.contactPerson || '',
                        branch_email: branch.email || '',
                        branch_contact_no: branch.contactNumber || ''
                    };

                    const existingRecord = existingGstList.find((g: any) =>
                        g.gstin === gst.gstin && g.reference_name === (branch.referenceName || '')
                    );

                    if (existingRecord) {
                        await httpClient.patch(`/api/vendors/gst-details/${existingRecord.id}/`, gstPayload);
                        console.log(`✅ GST details updated for: ${gst.gstin} (${branch.referenceName || 'Default'})`);
                    } else {
                        await httpClient.post('/api/vendors/gst-details/', gstPayload);
                        console.log(`✅ GST details created for: ${gst.gstin} (${branch.referenceName || 'Default'})`);
                    }
                }
            }

            // 3. Products/Services - Check existing
            console.log('Saving products/services...');
            try {
                const existingProducts: any = await httpClient.get(`/api/vendors/product-services/?vendor_basic_detail=${newId}`);
                const existingProductList = Array.isArray(existingProducts) ? existingProducts : (existingProducts.results || []);
                const existingItemCodes = existingProductList.map((p: any) => p.item_code);

                const prodPayload = items.filter(i => i.itemName && i.itemName.trim() !== '').map(item => ({
                    vendor_basic_detail: newId,
                    hsn_sac_code: item.hsnSacCode || '',
                    item_code: item.itemCode || '',
                    item_name: item.itemName,
                    supplier_item_code: item.supplierItemCode || '',
                    supplier_item_name: item.supplierItemName || '',
                    is_active: true
                }));

                if (prodPayload.length > 0) {
                    const newProducts = prodPayload.filter(p => !existingItemCodes.includes(p.item_code));
                    if (newProducts.length > 0) {
                        await httpClient.post('/api/vendors/product-services/', newProducts);
                        console.log(`✅ ${newProducts.length} new product(s) added.`);
                    } else {
                        console.log('ℹ️  No new products to add (all already exist)');
                    }
                } else {
                    console.log('ℹ️  No products/services data to save');
                }
            } catch (error) {
                console.error('❌ Error saving products/services:', error);
                // Don't throw - continue with other sections
            }

            // 4. TDS - Always save (even if empty)
            console.log('Saving TDS details...');
            try {
                let existingTdsRecord = null;
                try {
                    const existingTds: any = await httpClient.get(`/api/vendors/tds-details/by-vendor/${newId}/`);
                    existingTdsRecord = existingTds.data && existingTds.data.length > 0 ? existingTds.data[0] : (existingTds.id ? existingTds : null);
                } catch (e) {
                    // Ignore 404
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

                    // Check if this account number already exists for this vendor
                    const existingRecord = existingBankingList.find((b: any) => b.bank_account_no === bank.accountNumber);

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
            localStorage.removeItem('currentVendorId');

            // Reset all form states
            setVendorCode('');
            setVendorName('');
            setPanNo('');
            setContactPerson('');
            setVendorEmail('');
            setContactNo('');
            setVendorCategory('');
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

            // Back to first tab
            setActiveMasterSubTab('Basic Details');

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
    }

    const [inventoryItems, setInventoryItems] = useState<SimplifiedInventoryItem[]>([]);
    const [items, setItems] = useState<ProductServiceItem[]>([
        { id: 1, hsnSacCode: '', itemCode: '', itemName: '', supplierItemCode: '', supplierItemName: '' },
        { id: 2, hsnSacCode: '', itemCode: '', itemName: '', supplierItemCode: '', supplierItemName: '' },
    ]);

    // Fetch Inventory Items for Dropdown
    useEffect(() => {
        const fetchItems = async () => {
            try {
                const response = await httpClient.get<SimplifiedInventoryItem[]>('/api/inventory/items/');
                setInventoryItems(Array.isArray(response) ? response : []);
            } catch (error) {
                handleApiError(error, 'Fetch Inventory Items');
            }
        };

        if (activeMasterSubTab === 'Products/Services') {
            fetchItems();
        }
    }, [activeMasterSubTab]);

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
            const response = await httpClient.get('/api/inventory/master-categories/');
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
                await httpClient.put(`/api/inventory/master-categories/${selectedCategory.id}/`, payload);
                showSuccess('Category updated successfully!');
            } else {
                await httpClient.post('/api/inventory/master-categories/', payload);
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
            await httpClient.delete(`/api/inventory/master-categories/${id}/`);
            showSuccess('Category deleted successfully!');
            fetchCategories();
        } catch (error: any) {
            handleApiError(error, 'Delete Category');
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

    // Load on tab switch
    useEffect(() => {
        if (activeTab === 'Master' && activeMasterSubTab === 'Category') {
            fetchCategories();
        } else if (activeTab === 'Master' && activeMasterSubTab === 'PO Settings') {
            fetchPOSeries();
        }
    }, [activeTab, activeMasterSubTab]);

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
            fetchPOSeries();
        } catch (error: any) {
            handleApiError(error, 'Delete PO Series');
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
            {/* Page Header */}
            <div className="flex items-end justify-between border-b border-slate-200 pb-6">
                <div>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-1">Procurement</p>
                    <h2 className="text-[20px] font-bold text-slate-900">
                        Vendor Portal
                    </h2>
                </div>
            </div>

            {/* Main Tabs */}
            <div className="flex space-x-8 border-b border-slate-200">
                {availableTabs.map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab as VendorTab)}
                        className={`
                            whitespace-nowrap pb-4 text-[13px] font-bold uppercase tracking-wider transition-all relative
                            ${activeTab === tab
                                ? 'text-indigo-600'
                                : 'text-slate-400 hover:text-slate-600'}
                        `}
                    >
                        {tab}
                        {activeTab === tab && (
                            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-indigo-600" />
                        )}
                    </button>
                ))}
            </div>

            {activeTab === 'Master' && (
                <>
                    <div className="erp-card p-0 overflow-hidden">
                        {/* Sub-tabs for Vendor Master */}
                        <div className="px-6 pt-4 border-b border-gray-200">
                            <nav className="flex space-x-8">
                                {['Category', 'PO Settings', 'Vendor Creation']
                                    .filter(subTab => isSuperuser || hasTabAccess('Vendor Portal', subTab))
                                    .map((subTab) => {
                                        const isVendorCreationActive = subTab === 'Vendor Creation' &&
                                            ['Vendor Creation', 'Basic Details', 'GST Details', 'Products/Services', 'TDS & Other Statutory', 'Banking Info', 'Terms & Conditions'].includes(activeMasterSubTab);
                                        const isActive = activeMasterSubTab === subTab || isVendorCreationActive;

                                        return (
                                            <button
                                                key={subTab}
                                                onClick={() => setActiveMasterSubTab(subTab as MasterSubTab)}
                                                className={`whitespace-nowrap pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${isActive
                                                    ? 'border-indigo-500 text-indigo-600'
                                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                                    }`}
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
                                systemCategories={VENDOR_SYSTEM_CATEGORIES}
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
                                    <h3 className="text-lg font-semibold text-gray-800 mb-4">
                                        {isEditModePO ? 'Edit Series' : 'New PO Series'}
                                    </h3>
                                    <form onSubmit={handlePOSubmit} className="space-y-4">
                                        {/* Name */}
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
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
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Category <span className="text-red-500">*</span>
                                            </label>
                                            <CategoryHierarchicalDropdown
                                                apiEndpoint="/api/vendors/categories/"
                                                systemCategories={VENDOR_SYSTEM_CATEGORIES}
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
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Prefix</label>
                                                <input
                                                    type="text"
                                                    value={poPrefix}
                                                    onChange={(e) => setPoPrefix(e.target.value)}
                                                    className="w-full px-4 py-2 border border-slate-200 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                    placeholder="PO/"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">Suffix</label>
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
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Digits</label>
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
                                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Existing Series</h3>
                                    <div className="border border-slate-200 rounded-[4px] overflow-hidden">
                                        <table className="min-w-full divide-y divide-gray-200">
                                            <thead className="bg-gray-50">
                                                <tr>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Details</th>
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
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                                {/* Show summary of config */}
                                                                {series.prefix}...{series.suffix} ({series.digits} digits)
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
                            <div className="p-6">
                                <h3 className="text-lg font-semibold text-gray-800 mb-4">Vendor Creation</h3>
                                <p className="text-gray-600">Select a tab below to configure vendor details:</p>
                                <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-4">
                                    {['Basic Details', 'GST Details', 'Products/Services', 'TDS & Other Statutory', 'Banking Info', 'Terms & Conditions'].map((tab) => (
                                        <button
                                            key={tab}
                                            onClick={() => setActiveMasterSubTab(tab as MasterSubTab)}
                                            className="p-4 border-2 border-gray-200 rounded-[4px] hover:border-indigo-500 hover:bg-indigo-50/50 transition-all text-left"
                                        >
                                            <div className="font-medium text-gray-900">{tab}</div>
                                            <div className="text-xs text-gray-500 mt-1">Configure {tab.toLowerCase()}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {activeMasterSubTab === 'Basic Details' && (
                            <div className="p-6">
                                <div className="flex items-center mb-6">
                                    <button
                                        onClick={() => setActiveMasterSubTab('Vendor Creation')}
                                        className="mr-4 p-2 hover:bg-gray-100 rounded-[4px] transition-colors"
                                        title="Back to Vendor Creation"
                                    >
                                        <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                                    </button>
                                    <h3 className="text-lg font-semibold text-gray-800">Basic Details</h3>
                                </div>

                                <form className="space-y-6" onSubmit={handleBasicDetailsSubmit}>
                                    {/* Row 1: Vendor Code and Vendor Name */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {/* Vendor Code */}
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
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
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
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
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Vendor Category <span className="text-red-500">*</span>
                                            </label>
                                            <CategoryHierarchicalDropdown
                                                apiEndpoint="/api/vendors/categories/"
                                                systemCategories={VENDOR_SYSTEM_CATEGORIES}
                                                value={vendorCategory}
                                                onSelect={(selection) => setVendorCategory(selection.fullPath)}
                                                placeholder="Select Category"
                                                className="w-full"
                                            />
                                        </div>

                                        {/* PAN No */}
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
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
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
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
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
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
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
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

                                    {/* Is Also Customer */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                                        <div className="col-span-2">
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
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
                                                <p className="mt-2 text-xs text-teal-600">
                                                    System will search for customer using PAN No & Vendor Name
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* TCS Applicable under GST */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                                        <div className="col-span-2">
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                TCS Applicable under GST
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
                                            className="px-6 py-2 border border-slate-200 text-sm font-medium rounded-[4px] shadow-none border border-slate-200 text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
                                        >
                                            Back
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



                        {activeMasterSubTab === 'GST Details' && (
                            <div className="p-6">
                                <div className="flex justify-between items-center mb-6">
                                    <div className="flex items-center">
                                        <button
                                            onClick={() => setActiveMasterSubTab('Vendor Creation')}
                                            className="mr-4 p-2 hover:bg-gray-100 rounded-full transition-colors"
                                            title="Back to Vendor Creation"
                                        >
                                            <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                                        </button>
                                        <h3 className="text-lg font-semibold text-gray-800">GST Details</h3>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleAddGstRecord}
                                        className="px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-teal-600 hover:bg-teal-700 focus:outline-none"
                                    >
                                        + Add Another GSTIN
                                    </button>
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
                                                            <label className="block text-sm font-medium text-gray-700 mb-2">GSTIN</label>
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
                                                            <label className="block text-sm font-medium text-gray-700 mb-2">Registration Type</label>
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
                                                                    <label className="block text-sm font-medium text-gray-700 mb-2">Legal Name</label>
                                                                    <input
                                                                        type="text"
                                                                        value={record.legalName || ''}
                                                                        readOnly
                                                                        className="w-full px-4 py-2 border border-slate-200 rounded-[4px] bg-gray-100 cursor-not-allowed"
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-sm font-medium text-gray-700 mb-2">Trade Name</label>
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
                                                                                    <span className="font-medium text-sm text-gray-800">{pob.referenceName || `Branch ${pIndex + 1}`} - {pob.address}</span>
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
                                                                                        <label className="block text-xs font-medium text-gray-500 mb-1">Reference Name</label>
                                                                                        <input type="text" value={pob.referenceName} onChange={(e) => updatePobField(record.id, pob.id, 'referenceName', e.target.value)} className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm" />
                                                                                    </div>
                                                                                    <div>
                                                                                        <label className="block text-xs font-medium text-gray-500 mb-1">Address</label>
                                                                                        <textarea
                                                                                            rows={2}
                                                                                            value={pob.address}
                                                                                            onChange={(e) => updatePobField(record.id, pob.id, 'address', e.target.value)}
                                                                                            className={`w-full px-3 py-1.5 border border-slate-200 rounded text-sm ${record.registrationType !== 'Unregistered' && pob.address && pob.referenceName !== '' ? 'bg-gray-50' : ''}`}
                                                                                            placeholder="Enter address"
                                                                                        />
                                                                                    </div>
                                                                                    <div>
                                                                                        <label className="block text-xs font-medium text-gray-500 mb-1">Contact Person</label>
                                                                                        <input type="text" value={pob.contactPerson} onChange={(e) => updatePobField(record.id, pob.id, 'contactPerson', e.target.value)} className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm" />
                                                                                    </div>
                                                                                    <div>
                                                                                        <label className="block text-xs font-medium text-gray-500 mb-1">Email Address</label>
                                                                                        <input type="email" value={pob.email} onChange={(e) => updatePobField(record.id, pob.id, 'email', e.target.value)} className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm" />
                                                                                    </div>
                                                                                    <div>
                                                                                        <label className="block text-xs font-medium text-gray-500 mb-1">Contact No</label>
                                                                                        <input type="tel" value={pob.contactNumber} onChange={(e) => updatePobField(record.id, pob.id, 'contactNumber', e.target.value)} className="w-full px-3 py-1.5 border border-slate-200 rounded text-sm" />
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
                                            onClick={() => setActiveMasterSubTab('Basic Details')}
                                            className="px-6 py-2 border border-slate-200 text-sm font-medium rounded-[4px] shadow-none border border-slate-200 text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
                                        >
                                            Back
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

                        {
                            activeMasterSubTab === 'TDS & Other Statutory' && (
                                <div className="p-6">
                                    <div className="flex items-center mb-6">
                                        <button
                                            onClick={() => setActiveMasterSubTab('Vendor Creation')}
                                            className="mr-4 p-2 hover:bg-gray-100 rounded-[4px] transition-colors"
                                            title="Back to Vendor Creation"
                                        >
                                            <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                                        </button>
                                        <h3 className="text-lg font-semibold text-gray-800">TDS & Other Statutory</h3>
                                    </div>
                                    <form onSubmit={handleTDSDetailsSubmit} className="space-y-6">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                                    MSME Udyam No
                                                </label>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={msmeUdyamNo}
                                                        onChange={(e) => setMsmeUdyamNo(e.target.value)}
                                                        className="flex-1 px-4 py-2 border border-slate-200 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                        placeholder="MSME Udyam Registration Number"
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
                                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                                    FSSAI License No
                                                </label>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={fssaiLicenseNo}
                                                        onChange={(e) => setFssaiLicenseNo(e.target.value)}
                                                        className="flex-1 px-4 py-2 border border-slate-200 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                        placeholder="FSSAI License Number"
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
                                                        title="Upload FSSAI License"
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
                                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                                    Import Export Code (IEC)
                                                </label>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={importExportCode}
                                                        onChange={(e) => setImportExportCode(e.target.value)}
                                                        className="flex-1 px-4 py-2 border border-slate-200 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                        placeholder="Import Export Code"
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
                                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                                    EOU Status
                                                </label>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={eouStatus}
                                                        onChange={(e) => setEouStatus(e.target.value)}
                                                        className="flex-1 px-4 py-2 border border-slate-200 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                        placeholder="Export Oriented Unit Status"
                                                    />
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
                                                        title="Upload Letter of Permission / Green Card"
                                                    >
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                                        </svg>
                                                    </button>
                                                </div>
                                                {uploadedFiles.eouFile && (
                                                    <p className="mt-1 text-xs text-indigo-600">? {uploadedFiles.eouFile.name}</p>
                                                )}
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                                    TDS Section Applicable
                                                </label>
                                                <select
                                                    value={tdsSectionApplicable}
                                                    onChange={(e) => setTdsSectionApplicable(e.target.value)}
                                                    className="w-full px-4 py-2 border border-slate-200 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                                >
                                                    <option value="">Select TDS Section</option>
                                                    <option value="Section 194C">Section 194C - Contracts (Individual/HUF & Others)</option>
                                                    <option value="Section 194H">Section 194H - Commission/Brokerage</option>
                                                    <option value="Section 194-I">Section 194-I - Rent (Land, Building, Furniture & Fitting, Plant & Machinery, Equipment)</option>
                                                    <option value="Section 194J">Section 194J - Professional Services, Technical Services, Director's Remuneration</option>
                                                    <option value="Section 194Q">Section 194Q - Purchase of Goods</option>
                                                    <option value="Section 194A">Section 194A - Interest other than interest on securities</option>
                                                    <option value="Section 194R">Section 194R - Benefit or Perquisite</option>
                                                    <option value="Section 194-IA">Section 194-IA - Immovable Property Transfer</option>
                                                    <option value="Section 194-IB">Section 194-IB - Rent by Individual or HUF</option>
                                                    <option value="Section 194-IC">Section 194-IC - Joint Development Agreements</option>
                                                    <option value="Section 194M">Section 194M - Contractors & Professionals</option>
                                                    <option value="Section 194-O">Section 194-O - E-Commerce</option>
                                                    <option value="Section 195">Section 195 - Payment to Non-Residents</option>
                                                </select>
                                            </div>
                                        </div>

                                        {/* TDS Rate Information */}
                                        {tdsSectionApplicable && (() => {
                                            const rateInfo = getTDSRateInfo(tdsSectionApplicable);

                                            return rateInfo ? (
                                                <div className="mt-4 p-4 bg-slate-50/50 border-l-4 border-indigo-500 rounded-[4px]">
                                                    <div className="flex items-start gap-3">
                                                        <svg className="w-6 h-6 text-indigo-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        </svg>
                                                        <div className="flex-1">
                                                            <h4 className="text-sm font-semibold text-slate-700 mb-2">TDS Rate Information</h4>
                                                            <div className="space-y-1 text-sm text-slate-700">
                                                                <p><span className="font-medium">TDS Rate:</span> {rateInfo.tdsRate}</p>
                                                                <p><span className="font-medium">Penalty Rate:</span> {rateInfo.penaltyRate}</p>
                                                                <p className="mt-2 text-xs text-indigo-600 italic">{rateInfo.description}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : null;
                                        })()}

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
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
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
                                                className="px-6 py-2 border border-slate-200 text-sm font-medium rounded-[4px] shadow-none border border-slate-200 text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
                                            >
                                                Back
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
                                    <div className="flex items-center mb-6">
                                        <button
                                            onClick={() => setActiveMasterSubTab('Vendor Creation')}
                                            className="mr-4 p-2 hover:bg-gray-100 rounded-[4px] transition-colors"
                                            title="Back to Vendor Creation"
                                        >
                                            <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                                        </button>
                                        <h3 className="text-lg font-semibold text-gray-800">Products/Services</h3>
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
                                                                <SearchableDropdown
                                                                    options={inventoryItems.map(i => i.item_code)}
                                                                    value={item.itemCode}
                                                                    onChange={(val) => handleItemChange(item.id, 'itemCode', val)}
                                                                    placeholder="Select Item Code"
                                                                />
                                                            </td>
                                                            <td className="px-4 py-3 border-r border-gray-200 min-w-[250px]">
                                                                <SearchableDropdown
                                                                    options={inventoryItems.map(i => i.item_name)}
                                                                    value={item.itemName}
                                                                    onChange={(val) => handleItemChange(item.id, 'itemName', val)}
                                                                    placeholder="Select Item Name"
                                                                />
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
                                                onClick={() => setActiveMasterSubTab('GST Details')}
                                                className="px-6 py-2 border border-slate-200 text-sm font-medium rounded-[4px] shadow-none border border-slate-200 text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
                                            >
                                                Back
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
                                    <div className="flex items-center mb-6">
                                        <button
                                            onClick={() => setActiveMasterSubTab('Vendor Creation')}
                                            className="mr-4 p-2 hover:bg-gray-100 rounded-[4px] transition-colors"
                                            title="Back to Vendor Creation"
                                        >
                                            <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                                        </button>
                                        <h3 className="text-lg font-semibold text-gray-800">Banking Information</h3>
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
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                                            Bank account No.
                                                        </label>
                                                        <input
                                                            type="text"
                                                            className="w-full px-4 py-2 border border-slate-200 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                            placeholder="Enter bank account number"
                                                            value={bank.accountNumber}
                                                            onChange={(e) => handleBankChange(bank.id, 'accountNumber', e.target.value)}
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                                            Bank Name
                                                        </label>
                                                        <input
                                                            type="text"
                                                            className="w-full px-4 py-2 border border-slate-200 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                            placeholder="Enter bank name"
                                                            value={bank.bankName}
                                                            onChange={(e) => handleBankChange(bank.id, 'bankName', e.target.value)}
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                                            IFSC Code
                                                        </label>
                                                        <input
                                                            type="text"
                                                            className="w-full px-4 py-2 border border-slate-200 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                            placeholder="Enter IFSC Code"
                                                            maxLength={11}
                                                            value={bank.ifscCode}
                                                            onChange={(e) => handleBankChange(bank.id, 'ifscCode', e.target.value)}
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                                            Branch Name
                                                        </label>
                                                        <input
                                                            type="text"
                                                            className="w-full px-4 py-2 border border-slate-200 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                            placeholder="Enter branch name"
                                                            value={bank.branchName}
                                                            onChange={(e) => handleBankChange(bank.id, 'branchName', e.target.value)}
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">
                                                            Swift Code
                                                        </label>
                                                        <input
                                                            type="text"
                                                            className="w-full px-4 py-2 border border-slate-200 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                            placeholder="Enter Swift Code (for international transactions)"
                                                            value={bank.swiftCode}
                                                            onChange={(e) => handleBankChange(bank.id, 'swiftCode', e.target.value)}
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">
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
                                                                className="hidden absolute z-10 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm"
                                                            >
                                                                {(() => {
                                                                    // If gstRecords is not available or empty, show no branches
                                                                    const allBranches = (gstRecords || []).flatMap(record =>
                                                                        record.placesOfBusiness.map(pob => pob.referenceName).filter(Boolean)
                                                                    );

                                                                    if (allBranches.length === 0) {
                                                                        return <div className="px-4 py-2 text-gray-500 italic">No branches available</div>;
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
                                    <div className="flex items-center mb-6">
                                        <button
                                            onClick={() => setActiveMasterSubTab('Vendor Creation')}
                                            className="mr-4 p-2 hover:bg-gray-100 rounded-[4px] transition-colors"
                                            title="Back to Vendor Creation"
                                        >
                                            <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
                                        </button>
                                        <h3 className="text-lg font-semibold text-gray-800">Terms & Conditions</h3>
                                    </div>
                                    <form onSubmit={handleFinish} className="space-y-6">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
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
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Credit Period
                                            </label>
                                            <input
                                                type="text"
                                                value={creditPeriod}
                                                onChange={(e) => setCreditPeriod(e.target.value)}
                                                className="w-full px-4 py-2 border border-slate-200 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                placeholder="Enter credit period (e.g., 30 days, 60 days)"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
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
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
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
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
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
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
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
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
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
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
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
                                                onClick={() => setActiveMasterSubTab('Banking Info')}
                                                className="px-6 py-2 border border-slate-200 text-sm font-medium rounded-[4px] shadow-none border border-slate-200 text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
                                            >
                                                Back
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
                    </div>
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
                                            <h3 className="text-lg font-semibold text-gray-800 mb-4">Purchase Orders</h3>
                                            <p className="text-gray-600 mb-6">Select an option to manage purchase orders:</p>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                {['Create PO', 'Pending PO', 'Executed PO']
                                                    .filter(tab => isSuperuser || hasTabAccess('Vendor Portal', tab))
                                                    .map((tab) => (
                                                        <button
                                                            key={tab}
                                                            onClick={() => setActivePOSubTab(tab as POSubTab)}
                                                            className="p-6 border-2 border-gray-200 rounded-[4px] hover:border-indigo-500 hover:bg-indigo-50/50 transition-all text-left group"
                                                        >
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
                                                            <div className="text-sm text-gray-500 mt-2">
                                                                {tab === 'Create PO' ? 'Create new purchase orders' :
                                                                    tab === 'Pending PO' ? 'View and manage pending orders' :
                                                                        'History of completed orders'}
                                                            </div>
                                                        </button>
                                                    ))}
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
                                                    <h3 className="text-xl font-bold text-gray-800">{activePOSubTab}</h3>
                                                    <p className="text-sm text-gray-500">Manage your {activePOSubTab.toLowerCase()} details here.</p>
                                                </div>
                                            </div>

                                            {/* Content Placeholders */}
                                            {activePOSubTab === 'Create PO' && (
                                                <>
                                                    <div>
                                                        {/* Create PO Button */}
                                                        <div className="mb-6">
                                                            <button
                                                                onClick={() => setShowCreatePOModal(true)}
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
                                                                <table className="min-w-full divide-y divide-gray-200">
                                                                    <thead className="bg-indigo-50/50">
                                                                        <tr>
                                                                            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">PO#</th>
                                                                            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">PO Date</th>
                                                                            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Vendor Name</th>
                                                                            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Branch</th>
                                                                            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Delivery Date</th>
                                                                            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Amount</th>
                                                                            <th className="px-6 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">Action</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="bg-white divide-y divide-gray-200">
                                                                        {purchaseOrders.filter(po => po.status === 'Pending Approval').length === 0 ? (
                                                                            <tr>
                                                                                <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                                                                                    No purchase orders pending approval.
                                                                                </td>
                                                                            </tr>
                                                                        ) : (
                                                                            purchaseOrders.filter(po => po.status === 'Pending Approval').map((po) => (
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
                                                                <table className="min-w-full divide-y divide-gray-200">
                                                                    <thead className="bg-slate-50/50">
                                                                        <tr>
                                                                            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">PO#</th>
                                                                            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">PO Date</th>
                                                                            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Vendor Name</th>
                                                                            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Branch</th>
                                                                            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Delivery Date</th>
                                                                            <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Amount</th>
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
                                            )}          {activePOSubTab === 'Pending PO' && (
                                                <div className="erp-card overflow-hidden border border-slate-200">
                                                    <table className="min-w-full divide-y divide-gray-200">
                                                        <thead className="bg-slate-50/50">
                                                            <tr>
                                                                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">PO#</th>
                                                                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">PO Date</th>
                                                                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Vendor Name</th>
                                                                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Branch</th>
                                                                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Delivery Date</th>
                                                                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Amount</th>
                                                                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Status</th>
                                                                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-700 uppercase tracking-wider">Action</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="bg-white divide-y divide-gray-200">
                                                            {purchaseOrders.filter(po => po.status === 'Mailed').length === 0 ? (
                                                                <tr>
                                                                    <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                                                                        No pending purchase orders found (Mailed).
                                                                    </td>
                                                                </tr>
                                                            ) : (
                                                                purchaseOrders.filter(po => po.status === 'Mailed').map((po) => (
                                                                    <tr key={po.id} className="hover:bg-gray-50 transition-colors">
                                                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{po.poNumber}</td>
                                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(po.poDate)}</td>
                                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{po.vendorName}</td>
                                                                        <td className="px-6 py-4 text-sm text-gray-500">{po.branch || '-'}</td>
                                                                        <td className="px-6 py-4 text-sm text-gray-500">{po.deliveryDate ? formatDate(po.deliveryDate) : '-'}</td>
                                                                        <td className="px-6 py-4 text-sm text-gray-500">{po.amount ? `₹${po.amount}` : '-'}</td>
                                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                                            <span className="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-[4px] bg-slate-100 text-slate-700 border border-amber-200">
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
                                                    <table className="min-w-full divide-y divide-gray-200">
                                                        <thead className="bg-slate-50/50">
                                                            <tr>
                                                                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">PO#</th>
                                                                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">PO Date</th>
                                                                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Vendor Name</th>
                                                                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Branch</th>
                                                                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Delivery Date</th>
                                                                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Amount</th>
                                                                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Status</th>
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
                                                <h2 className="text-2xl font-bold text-gray-800">Procurement</h2>
                                                <p className="text-sm text-gray-500 mt-1">Select a procurement category to manage.</p>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                                {[
                                                    { name: 'Raw Material', desc: 'Manage raw material procurement', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /> },
                                                    { name: 'Stock-in Trade', desc: 'Manage stock-in trade items', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /> },
                                                    { name: 'Consumables', desc: 'Manage consumable items', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /> },
                                                    { name: 'Stores & Spares', desc: 'Manage stores and spares', icon: <g><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></g> },
                                                    { name: 'Services', desc: 'Manage service procurement', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /> },
                                                ]
                                                    .filter(item => isSuperuser || hasTabAccess('Vendor Portal', item.name))
                                                    .map((item) => {
                                                        const activeOrders = purchaseOrders.filter(po =>
                                                            po.category === item.name &&
                                                            ['Draft', 'Pending Approval', 'Approved', 'Mailed'].includes(po.status)
                                                        ).length;

                                                        return (
                                                            <button
                                                                key={item.name}
                                                                onClick={() => {
                                                                    setActiveProcurementSubTab(item.name as ProcurementSubTab);
                                                                    setProcurementViewMode('list');
                                                                    setSelectedProcurementVendor(null);
                                                                }}
                                                                className="p-6 border-2 border-gray-200 rounded-[4px] hover:border-indigo-500 hover:shadow-none border border-slate-200 transition-all duration-200 text-left group bg-white relative"
                                                            >
                                                                <div className="flex items-center justify-between mb-4">
                                                                    <div className="w-12 h-12 bg-indigo-50/50 rounded-[4px] flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            {item.icon}
                                                                        </svg>
                                                                    </div>
                                                                    <svg className="w-5 h-5 text-gray-300 group-hover:text-indigo-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                                    </svg>
                                                                </div>
                                                                <div className="flex justify-between items-end">
                                                                    <div>
                                                                        <h3 className="text-lg font-bold text-gray-800 group-hover:text-indigo-600 transition-colors">{item.name}</h3>
                                                                        <p className="text-sm text-gray-500 mt-1">{item.desc}</p>
                                                                    </div>
                                                                    <div className="text-right">
                                                                        <p className="text-lg font-bold text-gray-800">{activeOrders}</p>
                                                                        <p className="text-xs text-indigo-600 font-semibold mt-1">Active Orders</p>
                                                                    </div>
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                            </div>
                                        </div>
                                    ) : (
                                        <div>
                                            <div className="flex items-center justify-between mb-6">
                                                <div>
                                                    <div className="flex items-center space-x-2 text-sm text-gray-500 mb-1">
                                                        <button onClick={() => { setActiveProcurementSubTab('Dashboard'); setProcurementViewMode('list'); }} className="hover:text-indigo-600 hover:underline">
                                                            Procurement
                                                        </button>
                                                        <span>/</span>
                                                        <button onClick={() => { setProcurementViewMode('list'); setSelectedProcurementVendor(null); }} className={`hover:text-indigo-600 hover:underline ${procurementViewMode === 'list' ? 'text-indigo-600 font-medium' : ''}`}>
                                                            {activeProcurementSubTab}
                                                        </button>
                                                        {selectedProcurementVendor && (
                                                            <>
                                                                <span>/</span>
                                                                <span className="text-indigo-600 font-medium">{selectedProcurementVendor.name}</span>
                                                            </>
                                                        )}
                                                    </div>
                                                    <h2 className="text-2xl font-bold text-gray-800">{activeProcurementSubTab}</h2>
                                                    <p className="text-sm text-gray-500">Manage {activeProcurementSubTab.toLowerCase()} details here.</p>
                                                </div>
                                                <div className="flex space-x-2">
                                                    <button
                                                        onClick={() => setActiveProcurementSubTab('Dashboard')}
                                                        className="px-4 py-2 border border-slate-200 rounded-[4px] text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                                                    >
                                                        Back to Dashboard
                                                    </button>
                                                </div>
                                            </div>

                                            {procurementViewMode === 'list' && (
                                                <div className="erp-card border border-slate-200 overflow-hidden">
                                                    <table className="min-w-full divide-y divide-gray-200">
                                                        <thead className="bg-gray-50">
                                                            <tr>
                                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vendor Code</th>
                                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vendor Name</th>
                                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">0-45 Days</th>
                                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">45-90 Days</th>
                                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{">"}6M</th>
                                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{">"}1YR</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="bg-white divide-y divide-gray-200">
                                                            {vendorAgingList.map((vendor) => (
                                                                <tr key={vendor.id} className="hover:bg-gray-50 transition-colors">
                                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{vendor.code}</td>
                                                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-indigo-600 cursor-pointer hover:underline" onClick={() => {
                                                                        setSelectedProcurementVendor(vendor);
                                                                        setProcurementViewMode('ledger');
                                                                        fetchVendorLedger(vendor.name);
                                                                    }}>
                                                                        {vendor.name}
                                                                    </td>
                                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">₹{vendor.aging0_45}</td>
                                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{vendor.aging45_90 !== '-' ? `₹${vendor.aging45_90}` : '-'}</td>
                                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{vendor.aging6M !== '-' ? `₹${vendor.aging6M}` : '-'}</td>
                                                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{vendor.aging1Y !== '-' ? `₹${vendor.aging1Y}` : '-'}</td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            )}

                                            {procurementViewMode === 'ledger' && selectedProcurementVendor && (
                                                <div className="erp-card border border-slate-200 overflow-hidden p-0">
                                                    <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 bg-gray-50">
                                                        <h3 className="text-lg font-bold text-gray-800">{selectedProcurementVendor.name}</h3>
                                                        <button
                                                            onClick={() => setProcurementViewMode('month')}
                                                            className="px-4 py-2 bg-white border border-gray-300 rounded-[4px] text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm transition-colors"
                                                        >
                                                            Month View
                                                        </button>
                                                    </div>

                                                    <div className="overflow-x-auto">
                                                        <table className="min-w-full divide-y divide-gray-200">
                                                            <thead className="bg-gray-50">
                                                                <tr>
                                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px]">Date</th>
                                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[150px]">Transfer From</th>
                                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[150px]">Reference No</th>
                                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[150px]">Ledger</th>
                                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px]">Status</th>
                                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px]">Debit</th>
                                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[120px]">Credit</th>
                                                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider min-w-[150px]">Running Balance</th>
                                                                </tr>
                                                                <tr>
                                                                    <th className="px-6 pb-3 pt-0">
                                                                        <input
                                                                            type="text"
                                                                            placeholder="Filter Date"
                                                                            value={ledgerFilters.date}
                                                                            onChange={(e) => setLedgerFilters({ ...ledgerFilters, date: e.target.value })}
                                                                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded-[4px] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                                        />
                                                                    </th>
                                                                    <th className="px-6 pb-3 pt-0">
                                                                        <input
                                                                            type="text"
                                                                            placeholder="Filter Transfer"
                                                                            value={ledgerFilters.transferFrom}
                                                                            onChange={(e) => setLedgerFilters({ ...ledgerFilters, transferFrom: e.target.value })}
                                                                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded-[4px] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                                        />
                                                                    </th>
                                                                    <th className="px-6 pb-3 pt-0">
                                                                        <input
                                                                            type="text"
                                                                            placeholder="Filter Reference"
                                                                            value={ledgerFilters.referenceNo}
                                                                            onChange={(e) => setLedgerFilters({ ...ledgerFilters, referenceNo: e.target.value })}
                                                                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded-[4px] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                                        />
                                                                    </th>
                                                                    <th className="px-6 pb-3 pt-0">
                                                                        <input
                                                                            type="text"
                                                                            placeholder="Filter Ledger"
                                                                            value={ledgerFilters.ledger}
                                                                            onChange={(e) => setLedgerFilters({ ...ledgerFilters, ledger: e.target.value })}
                                                                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded-[4px] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                                        />
                                                                    </th>
                                                                    <th className="px-6 pb-3 pt-0">
                                                                        <input
                                                                            type="text"
                                                                            placeholder="Filter Status"
                                                                            value={ledgerFilters.status}
                                                                            onChange={(e) => setLedgerFilters({ ...ledgerFilters, status: e.target.value })}
                                                                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded-[4px] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                                        />
                                                                    </th>
                                                                    <th className="px-6 pb-3 pt-0">
                                                                        <input
                                                                            type="text"
                                                                            placeholder="Filter Debit"
                                                                            value={ledgerFilters.debit}
                                                                            onChange={(e) => setLedgerFilters({ ...ledgerFilters, debit: e.target.value })}
                                                                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded-[4px] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                                        />
                                                                    </th>
                                                                    <th className="px-6 pb-3 pt-0">
                                                                        <input
                                                                            type="text"
                                                                            placeholder="Filter Credit"
                                                                            value={ledgerFilters.credit}
                                                                            onChange={(e) => setLedgerFilters({ ...ledgerFilters, credit: e.target.value })}
                                                                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded-[4px] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                                        />
                                                                    </th>
                                                                    <th className="px-6 pb-3 pt-0">
                                                                        <input
                                                                            type="text"
                                                                            placeholder="Filter Runn"
                                                                            value={ledgerFilters.runningBalance}
                                                                            onChange={(e) => setLedgerFilters({ ...ledgerFilters, runningBalance: e.target.value })}
                                                                            className="w-full px-2 py-1 text-xs border border-gray-300 rounded-[4px] focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                                        />
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
                                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{entry.date}</td>
                                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{entry.transferFrom}</td>
                                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600 font-medium cursor-pointer hover:underline">{entry.referenceNo}</td>
                                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{entry.ledger}</td>
                                                                        <td className="px-6 py-4 whitespace-nowrap">
                                                                            <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-[4px] ${entry.status === 'Paid' ? 'bg-green-100 text-green-800' :
                                                                                entry.status === 'Unpaid' ? 'bg-red-100 text-red-800' :
                                                                                    'bg-yellow-100 text-yellow-800'}`}>
                                                                                {entry.status}
                                                                            </span>
                                                                        </td>
                                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{entry.debit !== '-' ? `₹${entry.debit}` : '-'}</td>
                                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{entry.credit !== '-' ? `₹${entry.credit}` : '-'}</td>
                                                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">{entry.runningBalance !== '-' ? `₹${entry.runningBalance}` : '-'}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                            <tfoot className="bg-gray-50 font-bold border-t border-gray-200">
                                                                <tr>
                                                                    <td colSpan={5} className="px-6 py-3 text-right text-gray-900 text-sm">TOTAL</td>
                                                                    <td className="px-6 py-3 text-gray-900 text-sm">₹{totalDebit.toLocaleString('en-IN')}</td>
                                                                    <td className="px-6 py-3 text-gray-900 text-sm">₹{totalCredit.toLocaleString('en-IN')}</td>
                                                                    <td className="px-6 py-3"></td>
                                                                </tr>
                                                            </tfoot>
                                                        </table>
                                                    </div>
                                                </div>
                                            )}

                                            {procurementViewMode === 'month' && selectedProcurementVendor && (
                                                <div className="erp-card border border-slate-200 p-0">
                                                    <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 bg-gray-50">
                                                        <h3 className="text-lg font-bold text-gray-800">{selectedProcurementVendor.name}</h3>
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
                                                            <table className="min-w-full divide-y divide-gray-200">
                                                                <thead className="bg-gray-50">
                                                                    <tr>
                                                                        <th className="px-6 py-3 text-left text-base font-medium text-gray-700">Month</th>
                                                                        <th className="px-6 py-3 text-left text-base font-medium text-gray-700">Debit</th>
                                                                        <th className="px-6 py-3 text-left text-base font-medium text-gray-700">Credit</th>
                                                                        <th className="px-6 py-3 text-left text-base font-medium text-gray-700">Closing Balance</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="bg-white divide-y divide-gray-200">
                                                                    {filteredMonthData.map((entry, idx) => (
                                                                        <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                                                            <td className="px-6 py-4 whitespace-nowrap text-lg font-medium text-gray-900">{entry.month}</td>
                                                                            <td className="px-6 py-4 whitespace-nowrap text-base text-gray-500">{entry.debit !== '-' ? `₹${entry.debit}` : '-'}</td>
                                                                            <td className="px-6 py-4 whitespace-nowrap text-base text-gray-500">{entry.credit !== '-' ? `₹${entry.credit}` : '-'}</td>
                                                                            <td className="px-6 py-4 whitespace-nowrap text-base font-bold text-gray-900">{entry.closingBalance !== '-' ? `₹${entry.closingBalance}` : '-'}</td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                                <tfoot className="bg-gray-50 font-bold border-t-2 border-slate-300">
                                                                    <tr>
                                                                        <td className="px-6 py-4 text-left text-lg text-blue-600">Total</td>
                                                                        <td className="px-6 py-4 text-blue-600">₹{totalMonthDebit.toLocaleString('en-IN')}</td>
                                                                        <td className="px-6 py-4 text-blue-600">₹{totalMonthCredit.toLocaleString('en-IN')}</td>
                                                                        <td className="px-6 py-4"></td>
                                                                    </tr>
                                                                </tfoot>
                                                            </table>
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
                                                <h2 className="text-2xl font-bold text-gray-800">Payment</h2>
                                                <p className="text-sm text-gray-500 mt-1">Select a procurement category to manage.</p>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                                {[
                                                    { name: 'Raw Material', desc: 'Manage raw material procurement', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /> },
                                                    { name: 'Stock-in Trade', desc: 'Manage stock-in trade items', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /> },
                                                    { name: 'Consumables', desc: 'Manage consumable items', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /> },
                                                    { name: 'Stores & Spares', desc: 'Manage stores and spares', icon: <g><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></g> },
                                                    { name: 'Services', desc: 'Manage service procurement', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /> },
                                                ].map((item) => {
                                                    const totalPendingAmount = paymentBills
                                                        .filter(bill => bill.status !== 'Posted' && bill.category === item.name)
                                                        .reduce((sum, bill) => {
                                                            const amount = parseFloat(bill.amount.replace(/[^0-9.-]+/g, ""));
                                                            return sum + amount;
                                                        }, 0);
                                                    const formattedTotal = totalPendingAmount.toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

                                                    return (
                                                        <button
                                                            key={item.name}
                                                            onClick={() => setActivePaymentSubTab(item.name as ProcurementSubTab)}
                                                            className="p-6 border-2 border-gray-200 rounded-[4px] hover:border-indigo-500 hover:shadow-none border border-slate-200 transition-all duration-200 text-left group bg-white relative"
                                                        >
                                                            <div className="flex items-center justify-between mb-4">
                                                                <div className="w-12 h-12 bg-indigo-50/50 rounded-[4px] flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        {item.icon}
                                                                    </svg>
                                                                </div>
                                                                <svg className="w-5 h-5 text-gray-300 group-hover:text-indigo-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                                </svg>
                                                            </div>
                                                            <div className="flex justify-between items-end">
                                                                <div>
                                                                    <h3 className="text-lg font-bold text-gray-800 group-hover:text-indigo-600 transition-colors">{item.name}</h3>
                                                                    <p className="text-sm text-gray-500 mt-1">{item.desc}</p>
                                                                </div>
                                                                <div className="text-right">
                                                                    <p className="text-lg font-bold text-gray-800">{formattedTotal}</p>
                                                                    <p className="text-xs text-red-600 font-semibold mt-1">Credit</p>
                                                                </div>
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ) : (
                                        <div>
                                            <div className="flex items-center justify-between mb-6">
                                                <div>
                                                    <div className="flex items-center space-x-2 text-sm text-gray-500 mb-1">
                                                        <button onClick={() => setActivePaymentSubTab('Dashboard')} className="hover:text-indigo-600 hover:underline">
                                                            Payment
                                                        </button>
                                                        <span>/</span>
                                                        <span className="text-indigo-600 font-medium">{activePaymentSubTab}</span>
                                                    </div>
                                                    <h2 className="text-2xl font-bold text-gray-800">{activePaymentSubTab}</h2>
                                                    <p className="text-sm text-gray-500">Manage {activePaymentSubTab.toLowerCase()} payments here.</p>
                                                </div>
                                                <button
                                                    onClick={() => setActivePaymentSubTab('Dashboard')}
                                                    className="px-4 py-2 border border-slate-200 rounded-[4px] text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                                                >
                                                    Back to Dashboard
                                                </button>
                                            </div>

                                            {/* Sort Controls */}
                                            <div className="mb-4 flex justify-end">
                                                <select
                                                    value={paymentSortOrder}
                                                    onChange={(e) => setPaymentSortOrder(e.target.value as 'recent' | 'earliest')}
                                                    className="px-4 py-2 border border-slate-200 rounded-[4px] text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                >
                                                    <option value="recent">Recent bills on top</option>
                                                    <option value="earliest">Earliest bills on top</option>
                                                </select>
                                            </div>

                                            {/* Payment Bills Table */}
                                            <div className="erp-card border border-slate-200 overflow-hidden">
                                                <div className="overflow-x-auto">
                                                    <table className="min-w-full divide-y divide-gray-200">
                                                        <thead className="bg-gray-50">
                                                            <tr>
                                                                {[
                                                                    { label: 'Date', key: 'date' },
                                                                    { label: 'Vendor Reference Name', key: 'vendorReferenceName' },
                                                                    { label: 'Voucher No', key: 'voucherNo' },
                                                                    { label: 'Supplier Invoice No.', key: 'supplierInvoiceNo' },
                                                                    { label: 'Amount', key: 'amount' },
                                                                    { label: 'Approve', key: 'approve' },
                                                                    { label: 'Action', key: 'action' },
                                                                    { label: 'Status', key: 'status' }
                                                                ].map((header) => (
                                                                    <th key={header.key} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider align-top">
                                                                        <div className="mb-2">{header.label}</div>
                                                                        {!['approve', 'action'].includes(header.key) && (
                                                                            <input
                                                                                type="text"
                                                                                placeholder={`Filter ${header.label}`}
                                                                                value={paymentBillFilters[header.key as keyof typeof paymentBillFilters] || ''}
                                                                                onChange={(e) => setPaymentBillFilters({ ...paymentBillFilters, [header.key]: e.target.value })}
                                                                                className="block w-full text-xs border-gray-300 rounded-[4px] shadow-none border border-slate-200 focus:border-indigo-500 focus:ring-indigo-500 py-1 px-2"
                                                                            />
                                                                        )}
                                                                    </th>
                                                                ))}
                                                            </tr>
                                                        </thead>
                                                        <tbody className="bg-white divide-y divide-gray-200">
                                                            {[...paymentBills]
                                                                .filter(bill => {
                                                                    // Filter by category and exclude Posted
                                                                    if (bill.status === 'Posted' || bill.category !== activePaymentSubTab) {
                                                                        return false;
                                                                    }

                                                                    // Apply user filters
                                                                    const matchesDate = bill.date.toLowerCase().includes(paymentBillFilters.date.toLowerCase());
                                                                    const matchesVendor = bill.vendorReferenceName.toLowerCase().includes(paymentBillFilters.vendorReferenceName.toLowerCase());
                                                                    const matchesVoucher = bill.voucherNo.toLowerCase().includes(paymentBillFilters.voucherNo.toLowerCase());
                                                                    const matchesInvoice = bill.supplierInvoiceNo.toLowerCase().includes(paymentBillFilters.supplierInvoiceNo.toLowerCase());
                                                                    const matchesAmount = bill.amount.toLowerCase().includes(paymentBillFilters.amount.toLowerCase());
                                                                    const matchesStatus = bill.status.toLowerCase().includes(paymentBillFilters.status.toLowerCase());

                                                                    return matchesDate && matchesVendor && matchesVoucher && matchesInvoice && matchesAmount && matchesStatus;
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
                                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{bill.voucherNo}</td>
                                                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{bill.supplierInvoiceNo}</td>
                                                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{bill.amount}</td>

                                                                        {/* Approve Column */}
                                                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                                            {bill.status !== 'Posted' && (
                                                                                <button
                                                                                    onClick={() => {
                                                                                        // Toggle between Pending and Approved
                                                                                        const now = new Date();
                                                                                        const formattedDate = now.toLocaleDateString() + ' ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                                                                        const newStatus = bill.status === 'Approved' ? 'Pending' : 'Approved';
                                                                                        const actionType = newStatus === 'Approved' ? 'Approved' : 'Unapproved';

                                                                                        setPaymentBills(paymentBills.map(b =>
                                                                                            b.id === bill.id
                                                                                                ? {
                                                                                                    ...b,
                                                                                                    status: newStatus,
                                                                                                    actionLog: [
                                                                                                        ...(b.actionLog || []),
                                                                                                        { action: actionType, user: 'Current User', date: formattedDate }
                                                                                                    ]
                                                                                                }
                                                                                                : b
                                                                                        ));
                                                                                    }}
                                                                                    className={`px-3 py-1 text-white text-xs rounded ${bill.status === 'Approved' || bill.status === 'Initiated'
                                                                                        ? 'bg-red-600 hover:bg-red-700'
                                                                                        : 'bg-indigo-600 hover:bg-indigo-700'
                                                                                        }`}
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
                                                                                            onClick={() => {
                                                                                                setSelectedBillForPayment(bill);
                                                                                                setShowPostPaymentModal(true);
                                                                                            }}
                                                                                            className="px-3 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700"
                                                                                            title="Initiate & Post"
                                                                                        >
                                                                                            Initiate & Post
                                                                                        </button>
                                                                                        <button
                                                                                            onClick={() => {
                                                                                                setSelectedBillForPayment(bill);
                                                                                                setShowPostPaymentModal(true);
                                                                                            }}
                                                                                            className="px-3 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700"
                                                                                            title="Post Payment"
                                                                                        >
                                                                                            Post
                                                                                        </button>
                                                                                    </>
                                                                                )}
                                                                            </div>
                                                                        </td>

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
                                                                                            const logMessages = bill.actionLog?.map(log =>
                                                                                                `${log.action} by ${log.user} on ${log.date}`
                                                                                            ).join('\n');
                                                                                            showInfo(`Action History:\n\n${logMessages}`);
                                                                                        }}

                                                                                        className="text-gray-500 hover:text-indigo-600 focus:outline-none transition-colors"
                                                                                        title="View Action History"
                                                                                    >
                                                                                        <span className="sr-only">View info</span>
                                                                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                                                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                                                                        </svg>
                                                                                    </button>
                                                                                )}
                                                                            </div>
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
                                                <h3 className="text-2xl font-bold text-gray-900">Create PO</h3>
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
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">PO Series Name</label>
                                                        <select
                                                            value={createPOForm.poSeriesName}
                                                            onChange={(e) => handleCreatePOFormChange('poSeriesName', e.target.value)}
                                                            className="w-full px-3 py-2 border border-slate-200 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                        >
                                                            <option value="">Select Vendor Settings</option>
                                                            <option value="series1">Series 1</option>
                                                            <option value="series2">Series 2</option>
                                                        </select>
                                                    </div>

                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">PO #</label>
                                                        <input
                                                            type="text"
                                                            value={createPOForm.poNumber}
                                                            onChange={(e) => handleCreatePOFormChange('poNumber', e.target.value)}
                                                            className="w-full px-3 py-2 border border-slate-200 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">Vendor Name</label>
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
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">Branch</label>
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
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">Address Line 2</label>
                                                        <input
                                                            type="text"
                                                            value={createPOForm.addressLine2}
                                                            onChange={(e) => handleCreatePOFormChange('addressLine2', e.target.value)}
                                                            className="w-full px-3 py-2 border border-slate-200 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                        />
                                                    </div>

                                                    <div className="col-span-1 md:col-span-2">
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">Address Line 3</label>
                                                        <input
                                                            type="text"
                                                            value={createPOForm.addressLine3}
                                                            onChange={(e) => handleCreatePOFormChange('addressLine3', e.target.value)}
                                                            className="w-full px-3 py-2 border border-slate-200 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">City</label>
                                                        <input
                                                            type="text"
                                                            value={createPOForm.city}
                                                            onChange={(e) => handleCreatePOFormChange('city', e.target.value)}
                                                            className="w-full px-3 py-2 border border-slate-200 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">State</label>
                                                        <input
                                                            type="text"
                                                            value={createPOForm.state}
                                                            onChange={(e) => handleCreatePOFormChange('state', e.target.value)}
                                                            className="w-full px-3 py-2 border border-slate-200 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">Country</label>
                                                        <input
                                                            type="text"
                                                            value={createPOForm.country}
                                                            onChange={(e) => handleCreatePOFormChange('country', e.target.value)}
                                                            className="w-full px-3 py-2 border border-slate-200 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">Pincode</label>
                                                        <input
                                                            type="text"
                                                            value={createPOForm.pincode}
                                                            onChange={(e) => handleCreatePOFormChange('pincode', e.target.value)}
                                                            className="w-full px-3 py-2 border border-slate-200 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                                                        <input
                                                            type="email"
                                                            value={createPOForm.emailAddress}
                                                            onChange={(e) => handleCreatePOFormChange('emailAddress', e.target.value)}
                                                            className="w-full px-3 py-2 border border-slate-200 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">Contract No</label>
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
                                                        <h4 className="text-lg font-semibold text-gray-900">Items</h4>
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
                                                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unit</th>
                                                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Base Price</th>
                                                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Final Rate</th>
                                                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Taxable Value</th>
                                                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">IGST%</th>
                                                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CGST%</th>
                                                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SGST%</th>
                                                                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cess%</th>
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
                                                                                    const selectedItem = availableVendorItems.find(i => i.item_code === selectedCode);

                                                                                    setPOItems(prevItems => prevItems.map(pItem => {
                                                                                        if (pItem.id === item.id) {
                                                                                            return {
                                                                                                ...pItem,
                                                                                                itemCode: selectedCode,
                                                                                                itemName: selectedItem ? (selectedItem.item_name || '') : '',
                                                                                                supplierItemCode: selectedItem ? (selectedItem.supplier_item_code || '') : '',
                                                                                                uom: selectedItem ? (selectedItem.unit || '') : '',
                                                                                            };
                                                                                        }
                                                                                        return pItem;
                                                                                    }));
                                                                                }}
                                                                                className="w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                                            >
                                                                                <option value="">Select Item</option>
                                                                                {availableVendorItems.map((vItem) => (
                                                                                    <option key={vItem.id} value={vItem.item_code}>
                                                                                        {vItem.item_code}
                                                                                    </option>
                                                                                ))}
                                                                            </select>
                                                                        </td>
                                                                        <td className="px-3 py-2">
                                                                            <select
                                                                                value={item.itemName}
                                                                                onChange={(e) => {
                                                                                    const selectedName = e.target.value;
                                                                                    const selectedItem = availableVendorItems.find(i => i.item_name === selectedName);

                                                                                    setPOItems(prevItems => prevItems.map(pItem => {
                                                                                        if (pItem.id === item.id) {
                                                                                            return {
                                                                                                ...pItem,
                                                                                                itemCode: selectedItem ? (selectedItem.item_code || '') : '',
                                                                                                itemName: selectedName,
                                                                                                supplierItemCode: selectedItem ? (selectedItem.supplier_item_code || '') : '',
                                                                                                uom: selectedItem ? (selectedItem.unit || '') : '',
                                                                                            };
                                                                                        }
                                                                                        return pItem;
                                                                                    }));
                                                                                }}
                                                                                className="w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                                            >
                                                                                <option value="">Select Item</option>
                                                                                {availableVendorItems.map((vItem) => (
                                                                                    <option key={vItem.id} value={vItem.item_name}>
                                                                                        {vItem.item_name}
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
                                                                                const selectedItem = availableVendorItems.find(i => i.item_code === item.itemCode);
                                                                                const units = selectedItem ? [selectedItem.unit, selectedItem.alternate_unit].filter(Boolean) : [];

                                                                                return (
                                                                                    <select
                                                                                        value={item.uom}
                                                                                        onChange={(e) => handlePOItemChange(item.id, 'uom', e.target.value)}
                                                                                        className="w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                                                    >
                                                                                        <option value="">Unit</option>
                                                                                        {units.length > 0 ? (
                                                                                            units.map((u, i) => <option key={i} value={u}>{u}</option>)
                                                                                        ) : (
                                                                                            <option value="PCS">PCS</option>
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
                                                                        <td className="px-3 py-2">
                                                                            <input
                                                                                type="text"
                                                                                value={item.igst}
                                                                                onChange={(e) => handlePOItemChange(item.id, 'igst', e.target.value)}
                                                                                className="w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                                                placeholder="0"
                                                                            />
                                                                        </td>
                                                                        <td className="px-3 py-2">
                                                                            <input
                                                                                type="text"
                                                                                value={item.cgst}
                                                                                onChange={(e) => handlePOItemChange(item.id, 'cgst', e.target.value)}
                                                                                className="w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                                                placeholder="0"
                                                                            />
                                                                        </td>
                                                                        <td className="px-3 py-2">
                                                                            <input
                                                                                type="text"
                                                                                value={item.sgst}
                                                                                onChange={(e) => handlePOItemChange(item.id, 'sgst', e.target.value)}
                                                                                className="w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                                                placeholder="0"
                                                                            />
                                                                        </td>
                                                                        <td className="px-3 py-2">
                                                                            <input
                                                                                type="text"
                                                                                value={item.cess}
                                                                                onChange={(e) => handlePOItemChange(item.id, 'cess', e.target.value)}
                                                                                className="w-full px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                                                placeholder="0"
                                                                            />
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
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">Total Taxable Value</label>
                                                        <input
                                                            type="text"
                                                            value={poItems.reduce((sum, item) => sum + (parseFloat(item.taxableValue) || 0), 0).toFixed(2)}
                                                            readOnly
                                                            className="w-full px-3 py-2 border border-slate-200 rounded-[4px] bg-gray-50 focus:outline-none"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">Total Tax</label>
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
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">Total Value</label>
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
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">Receive By</label>
                                                        <input
                                                            type="date"
                                                            value={createPOForm.receiveBy || ''}
                                                            onChange={(e) => handleCreatePOFormChange('receiveBy', e.target.value)}
                                                            className="w-full px-3 py-2 border border-slate-200 rounded-[4px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                            placeholder="dd-mm-yyyy"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">Receive At</label>
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
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">Delivery Terms</label>
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
                                                <h3 className="text-2xl font-bold text-gray-900">Purchase Order Details</h3>
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
                                                            <p className="text-gray-900">{selectedPO.poDate}</p>
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
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">Receive by</label>
                                                        <input
                                                            type="date"
                                                            value={createPOForm.receiveBy}
                                                            onChange={(e) => handleCreatePOFormChange('receiveBy', e.target.value)}
                                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                                                        />

                                                    </div>

                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">Receive at</label>
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
                                                        <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
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
                                                <h4 className="text-lg font-semibold text-gray-900 mb-4">Items</h4>
                                                <div className="bg-gray-50 p-4 rounded-[4px]">
                                                    <p className="text-gray-600 text-center py-4">
                                                        Item details will be displayed here when connected to backend
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Totals Section - Placeholder */}
                                            <div className="grid grid-cols-3 gap-6 bg-gray-50 p-4 rounded-[4px] border-t-2 border-gray-300">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">Total Taxable Value</label>
                                                    <p className="text-lg font-semibold text-gray-900">? 0.00</p>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">Total Tax</label>
                                                    <p className="text-lg font-semibold text-gray-900">? 0.00</p>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-1">Total Value</label>
                                                    <p className="text-lg font-bold text-indigo-900">? 0.00</p>
                                                </div>
                                            </div>

                                            {/* Additional Information - Placeholder */}
                                            <div>
                                                <h4 className="text-lg font-semibold text-gray-900 mb-4">Additional Information</h4>
                                                <div className="grid grid-cols-2 gap-6 bg-gray-50 p-4 rounded-[4px]">
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 mb-1">Receive By</label>
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
                                                        <label className="block text-sm font-medium text-gray-700 mb-1">Receive At</label>
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
                                                        <label className="block text-sm font-medium text-gray-700 mb-1">Delivery Terms</label>
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
                                                        <button
                                                            onClick={handleEditPODetails}
                                                            className="px-6 py-2 border border-indigo-600 text-indigo-600 rounded-[4px] hover:bg-indigo-50/50"
                                                        >
                                                            Edit
                                                        </button>
                                                    )}
                                                    {/* Show Cancel and Save when editing */}
                                                    {isEditingPO && (
                                                        <>
                                                            <button
                                                                onClick={handleCancelEditPO}
                                                                className="px-6 py-2 border border-slate-200 rounded-[4px] text-gray-700 hover:bg-gray-50"
                                                            >
                                                                Cancel
                                                            </button>
                                                            <button
                                                                onClick={handleSavePODetails}
                                                                className="px-6 py-2 bg-indigo-600 text-white rounded-[4px] hover:bg-indigo-700"
                                                            >
                                                                Save
                                                            </button>
                                                        </>
                                                    )}
                                                    {/* Show Cancel button only for Approved status when not editing */}
                                                    {!isEditingPO && selectedPO.status === 'Approved' && (
                                                        <button
                                                            onClick={handleCancelPOClick}
                                                            className="px-6 py-2 border border-red-500 text-red-600 rounded-[4px] hover:bg-red-50"
                                                        >
                                                            Cancel PO
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="flex space-x-4">
                                                    <button
                                                        onClick={() => setShowViewPOModal(false)}
                                                        className="px-6 py-2 border border-slate-200 rounded-[4px] text-gray-700 hover:bg-gray-50"
                                                    >
                                                        Close
                                                    </button>
                                                    {!isEditingPO && selectedPO.status === 'Pending Approval' && (
                                                        <button
                                                            onClick={handleApprovePO}
                                                            className="px-6 py-2 bg-indigo-600 text-white rounded-[4px] hover:bg-indigo-700"
                                                        >
                                                            Approve PO
                                                        </button>
                                                    )}
                                                    {!isEditingPO && selectedPO.status === 'Approved' && (
                                                        <button
                                                            onClick={handleMailPO}
                                                            className="px-6 py-2 bg-indigo-600 text-white rounded-[4px] hover:bg-indigo-700"
                                                        >
                                                            Mail PO
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
                                                <h3 className="text-2xl font-bold text-gray-900">Cancel Purchase Order</h3>
                                                <p className="text-sm text-gray-500 mt-2">PO Number: <span className="font-semibold text-gray-700">{selectedPO.poNumber}</span></p>
                                                <p className="text-sm text-gray-500">Vendor: <span className="font-semibold text-gray-700">{selectedPO.vendorName}</span></p>
                                            </div>

                                            <div className="space-y-4">
                                                {/* Cancellation Reason */}
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">
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
                                                <h3 className="text-2xl font-bold text-gray-900">Post Payment</h3>
                                                <p className="text-sm text-gray-500 mt-1">Bill: {selectedBillForPayment.voucherNo} - {selectedBillForPayment.vendorReferenceName}</p>
                                                <p className="text-sm font-medium text-gray-700 mt-1">Amount: {selectedBillForPayment.amount}</p>
                                            </div>

                                            <div className="space-y-4">
                                                {/* Date of Payment */}
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">
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
                                                    <label className="block text-sm font-medium text-gray-700 mb-2">
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
                                                        <label className="block text-sm font-medium text-gray-700 mb-2">
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

        </div >
    )
};

export default VendorPortalPage;
