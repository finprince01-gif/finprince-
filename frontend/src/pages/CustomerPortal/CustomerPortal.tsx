import React, { useState, useEffect, useMemo } from 'react';
import { httpClient } from '../../services/httpClient';
import { apiService } from '../../services/api';
import { showSuccess, showError, showInfo, confirm } from '../../utils/toast';
import { handleApiError } from '../../utils/errorHandler';
import { usePermissions } from '../../hooks/usePermissions';
import { Country, State, City } from 'country-state-city';

import { InventoryCategoryWizard } from '../../components/InventoryCategoryWizard';
import Icon from '../../components/Icon'; // Assuming Icon component exists
import CreateSalesQuotation from './CreateSalesQuotation';
import CategoryHierarchicalDropdown, { Category as DropdownCategory } from '../../components/CategoryHierarchicalDropdown';
import { CUSTOMER_CATEGORIES, BILLING_CURRENCIES } from '../../constants/customerPortalConstants';

import SalesQuotationList from './SalesQuotationList';
import CreateSalesOrder from './CreateSalesOrder';
import SalesOrderList from './SalesOrderList';
import SalesOrderViewModal from './SalesOrderViewModal';
import { Search, Plus, Filter, Download, ChevronLeft, ChevronRight, Edit, Trash2, X, Info, Check, ChevronDown, Eye, Mail, Calendar, Pencil, FileText, ArrowLeft, Receipt } from 'lucide-react';
import MultiSelectDropdown from '../../components/MultiSelectDropdown';
import CustomerViewModal from './CustomerViewModal';
import SalesGSTViewModal from './SalesGSTViewModal';
import { formatDate } from '../../utils/formatting';
import { BulkImportFeedbackModal } from '../../components/BulkImportFeedbackModal';
import SearchableDropdown from '../../components/SearchableDropdown';

type MainTab = 'Master' | 'Transaction';
type MasterSubTab = 'Category' | 'Sales Quotation & Order' | 'Customer' | 'Long-term Contracts';

type TransactionSubTab = 'Sales Quotation' | 'Sales Order' | 'Sales' | 'Receipt';
type SalesQuotationSubTab = 'General Customer Quote' | 'Specific Customer Quote';
type SalesOrderSubTab = 'Pending & Cancelled' | 'Executed';
type SalesCategory = 'Export' | 'Within Country (B2B)' | 'Within Country (B2C)';
type TransactionType = 'Sales' | 'Receipt' | 'Purchase' | 'Payment' | 'Debit Note' | 'Credit Note' | 'Journal' | 'Contra';
type PurchaseStatus = 'Paid' | 'Unpaid' | 'Partially Paid' | 'Approved' | 'Advance' | 'Partially Advanced' | 'Partially Utilized';
type SalesStatus = 'Not Due' | 'Due' | 'Due Today' | 'Partially Received' | 'Received' | 'Utilized' | 'Not Utilized' | 'Partially Due' | 'Advance' | 'Partially Advanced' | 'Partially Utilized';


interface AgingData {
    customerId: string;
    customerCode: string;
    customerName: string;
    subCategory: string;
    notDue: number;
    days0to45: number;
    days45to90: number;
    months6: number;
    year1: number;
    is_also_vendor?: boolean;
}

interface LedgerEntry {
    id: string;
    date: string;
    postFrom: TransactionType;
    referenceNo?: string;
    ledger: string;
    status: PurchaseStatus | SalesStatus;
    debit: number;
    credit: number;
    runningBalance: number;
    posting_status?: string;
    originalInv?: any;
    voucherNo?: string; // Own voucher number (e.g., REC0001)
    amount?: number;
    is_advance?: boolean;
}

interface Category {
    id: number;
    category: string;
    group: string | null;
    subgroup: string | null;
    full_path?: string;
    is_active: boolean;
    level?: number;
}

const ADDITIONAL_STATES: Record<string, { name: string; isoCode: string }[]> = {
    'GL': [
        { name: 'Avannaata', isoCode: 'AV' },
        { name: 'Kujalleq', isoCode: 'KU' },
        { name: 'Qeqertalik', isoCode: 'QT' },
        { name: 'Qeqqata', isoCode: 'QE' },
        { name: 'Sermersooq', isoCode: 'SM' },
    ]
};

// TDS Rates Master Data
const TDS_RATES_MASTER: { [key: string]: { tdsRate: string; description: string } } = {
    'Section 392(7) - Premature EPF Withdrawal (> ₹50,000)': { tdsRate: '10%', description: 'Threshold limit: ₹ 50,000' },
    'Section 393(1) - Interest on Securities': { tdsRate: '10%', description: 'Threshold limit: ₹ 10,000' },
    'Section 393(1) - Interest other than Securities': { tdsRate: '10%', description: 'Threshold limit: ₹ 50,000 (General) / ₹ 1,00,000 (Senior Citizens)' },
    'Section 393(1) - Dividends (Domestic Company)': { tdsRate: '10%', description: 'Threshold limit: ₹ 10,000' },
    'Section 393(1) - Contractor Payments (Large Payer) - Individual/HUF': { tdsRate: '1%', description: 'Threshold limit: ₹ 30,000 (Single) / ₹ 1,00,000 (Annual Aggregate)' },
    'Section 393(1) - Contractor Payments (Large Payer) - Other than Individual/HUF': { tdsRate: '2%', description: 'Threshold limit: ₹ 50,00,000' },
    'Section 393(1) - Contractor/Professional/Comm. (Ind/HUF Payer > ₹50L)': { tdsRate: '5%', description: 'Threshold limit: ₹ 50,000' },
    'Section 393(1) - Technical Services / Call Centre / Film Royalty': { tdsRate: '2%', description: 'Threshold limit: ₹ 2,40,000 (Annual) or ₹ 50,000 (Monthly per payer type)' },
    'Section 393(1) - Professional Fees / Other Royalty': { tdsRate: '10%', description: 'Threshold limit: ₹ 50,00,000' },
    'Section 393(1) - Insurance Commission': { tdsRate: '2%', description: 'Threshold limit: ₹ 20,000' },
    'Section 393(1) - General Commission or Brokerage': { tdsRate: '2%', description: 'Threshold limit: ₹ 20,000' },
    'Section 393(1) - Rent (Individual/HUF Payer > ₹50,000/mo)': { tdsRate: '2%', description: 'Threshold limit: ₹ 50,00,000' },
    'Section 393(1) - Rent on Plant & Machinery': { tdsRate: '2%', description: 'Threshold limit: ₹ 10,000 (General) / ₹ 50,000 (Specified Person)' },
    'Section 393(1) - Rent on Land & Building': { tdsRate: '10%', description: 'Threshold limit: ₹ 10,000 (per transaction/aggregate as per type)' },
    'Section 393(1) - Transfer of Immovable Property (> ₹50L)': { tdsRate: '1%', description: 'Threshold limit: ₹ 1 Crore (Filers) / ₹ 20 Lakh (Non-filers)' },
    'Section 393(1) - Purchase of Goods (exceeding ₹50L)': { tdsRate: '0.10%', description: 'Threshold limit: ₹ 20,000' },
    'Section 393(1) - Virtual Digital Assets (VDA/Crypto)': { tdsRate: '1%', description: 'Threshold limit: No limit. Taxable from rupee 1' },
    'Section 393(3) - Winnings from Lottery / Puzzles': { tdsRate: '30%', description: 'Threshold limit: No limit. Taxable from rupee 1' },
    'Section 393(3) - Regular Filer (ITR filed in previous years) > 1 cr': { tdsRate: '2%', description: 'Threshold limit: Regular Filer (ITR filed in previous years) > 1 cr' },
    'Section 393(3) - Non-Filer (ITR not filed for past 3 years) > 20L': { tdsRate: '2%', description: 'Threshold limit: Non-Filer (ITR not filed for past 3 years) > 20L' },
    'Section 393(3) - Non-Filer (ITR not filed for past 3 years) > 1Cr': { tdsRate: '5%', description: 'Threshold limit: Non-Filer (ITR not filed for past 3 years) > 1Cr' },
    'Section 393(3) - Co-operative Societies > 3 cr': { tdsRate: '2%', description: 'Threshold limit: Co-operative Societies > 3 cr' },
    'Section 393(3) - Payments to Partners (Salary/Comm. > ₹20k)': { tdsRate: '10%', description: 'Threshold limit: Payments to Partners (Salary/Comm. > ₹20k)' },
    'Section 393(2) - Sportsmen / Sports Association (Non-Resident)': { tdsRate: '20%', description: 'Threshold limit: No limit. Taxable from rupee 1' },
    'Section 393(2) - Interest on Foreign Borrowings/IFSC Bonds for loans before july1, 2023': { tdsRate: '5%', description: 'Threshold limit: No limit. Taxable from rupee 1' },
    'Section 393(2) - Interest on Foreign Borrowings/IFSC Bonds for loans after july1, 2023': { tdsRate: '9%', description: 'Threshold limit: No limit. Taxable from rupee 1' },
    'Section 393(2) - Income/LTCG from Offshore Fund Units': { tdsRate: '10%', description: 'Threshold limit: No limit. Taxable from rupee 1' },
    'Section 393(2) - Interest/Dividends/LTCG on Bonds/GDR': { tdsRate: '10%', description: 'Threshold limit: No limit. Taxable from rupee 1' },
    'Section 393(2) - Any other sum payable to Non-Resident': { tdsRate: '30%', description: 'Threshold limit: No limit. Taxable from rupee 1' }
};

// TCS Rates Master Data
const TCS_RATES_MASTER: { [key: string]: { tcsRate: string; penaltyRate: string; description: string } } = {
    'Section 206C(1) - Sale of Scrap, Alcoholic Liquor, Minerals': { tcsRate: '1%', penaltyRate: '5%', description: 'Sale of Scrap, Alcoholic Liquor, or Minerals' },
    'Section 206C(1) - Sale of Tendu Leaves': { tcsRate: '5%', penaltyRate: '5%', description: 'Sale of Tendu Leaves' },
    'Section 206C(1) - Sale of Forest Produce': { tcsRate: '2%', penaltyRate: '5%', description: 'Sale of Forest Produce (other than Tendu Leaves & Timber)' },
    'Section 206C(1) - Sale of Timber': { tcsRate: '2%', penaltyRate: '5%', description: 'Sale of Timber obtained under a forest lease or by any mode' },
    'Section 206C(1F) - Sale of Motor Vehicles': { tcsRate: '1%', penaltyRate: '5%', description: 'Sale of Motor Vehicles exceeding Rs. 10 Lakhs' },
    'Section 206C(1F) - Sale of Specified Luxury Goods': { tcsRate: '1%', penaltyRate: '5%', description: 'Sale of Specified Luxury Goods (watches, art, bags, etc.) exceeding Rs. 10 Lakhs' },
};

const getAvailableStates = (countryCode: string) => {
    const libStates = State.getStatesOfCountry(countryCode) || [];
    const extra = ADDITIONAL_STATES[countryCode] || [];
    // Map extra to match lib structure if needed, or simply merge
    // State returns { name, isoCode, countryCode, ... }
    const formattedExtra = extra.map(s => ({ ...s, countryCode, latitude: '', longitude: '' }));
    return [...libStates, ...formattedExtra];
};

interface CustomerPortalProps {
    onNavigate?: (page: string) => void;
    setPrefilledVoucherData?: (data: any) => void;
}

const CustomerPortalPage: React.FC<CustomerPortalProps> = ({ onNavigate, setPrefilledVoucherData }) => {
    const { hasTabAccess, isSuperuser } = usePermissions();

    const allTabs: MainTab[] = ['Master', 'Transaction'];
    const availableTabs = useMemo(() => {
        return allTabs.filter(tab => {
            if (isSuperuser) return true;
            const masterSubs = ['Category', 'Sales Quotation & Order', 'Customer', 'Long-term Contracts'];
            const transSubs = ['Sales Quotation', 'Sales Order', 'Sales', 'Receipt'];
            if (tab === 'Master') return masterSubs.some(t => hasTabAccess('Customer Portal', t));
            if (tab === 'Transaction') return transSubs.some(t => hasTabAccess('Customer Portal', t));
            return false;
        });
    }, [hasTabAccess, isSuperuser]);

    const [activeTab, setActiveTab] = useState<MainTab>(availableTabs.length > 0 ? availableTabs[0] : 'Master');

    useEffect(() => {
        if (availableTabs.length > 0 && !availableTabs.includes(activeTab)) {
            setActiveTab(availableTabs[0]);
        }
    }, [availableTabs, activeTab]);

    const [activeMasterSubTab, setActiveMasterSubTab] = useState<MasterSubTab>('Category');
    const [activeTransactionSubTab, setActiveTransactionSubTab] = useState<TransactionSubTab>('Sales Quotation');
    const [activeSalesQuotationSubTab, setActiveSalesQuotationSubTab] = useState<SalesQuotationSubTab>('General Customer Quote');
    const [activeSalesOrderSubTab, setActiveSalesOrderSubTab] = useState<SalesOrderSubTab>('Pending & Cancelled');
    const [showCreateQuotation, setShowCreateQuotation] = useState(false);
    const [editQuotationId, setEditQuotationId] = useState<string | null>(null);
    const [editQuotationType, setEditQuotationType] = useState<SalesQuotationSubTab | null>(null);
    const [showCreateOrder, setShowCreateOrder] = useState(false);
    const [isSalesOrderViewModalOpen, setIsSalesOrderViewModalOpen] = useState(false);
    const [selectedSalesOrderId, setSelectedSalesOrderId] = useState<string | null>(null);
    const [editSalesOrderId, setEditSalesOrderId] = useState<string | null>(null);
    const [refreshOrders, setRefreshOrders] = useState(0);

    const handleEditQuotation = (id: string, type: SalesQuotationSubTab) => {
        setEditQuotationId(id);
        setEditQuotationType(type);
        setShowCreateQuotation(true);
    };

    const handleCreateQuotation = () => {
        setEditQuotationId(null);
        setEditQuotationType(null);
        setShowCreateQuotation(true);
    };

    const handleViewSalesOrder = (id: string) => {
        setSelectedSalesOrderId(id);
        setIsSalesOrderViewModalOpen(true);
    };

    const handleEditSalesOrder = (id: string) => {
        setEditSalesOrderId(id);
        setShowCreateOrder(true);
    };

    const handleCancelSalesOrder = async (id: string) => {
        try {
            await httpClient.delete(`/api/customerportal/sales-orders/${id}/`);
            showSuccess('Sales Order cancelled successfully!');
            setRefreshOrders(prev => prev + 1);
        } catch (error) {
            handleApiError(error, 'Cancel Sales Order');
        }
    };

    return (
        <div className="space-y-8">
            <div className="erp-section-title">
                <div>
                    <h1 className="page-title">Customer Portal</h1>
                    <p className="helper-text">Sales management and customer relations</p>
                </div>
            </div>

            {/* Main Tabs */}
            <div className="erp-tab-container">
                {availableTabs.map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab as MainTab)}
                        className={`erp-tab ${activeTab === tab ? 'active' : ''}`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {/* Content Area */}
            <div className="px-8 py-6">
                {activeTab === 'Master' && (
                    <div>
                        {/* Sub-tabs for Master */}
                        <div className="mb-6">
                            <div className="flex gap-8 border-b border-gray-200 pb-1">
                                {['Category', 'Sales Quotation & Order', 'Customer', 'Long-term Contracts'].filter(t => isSuperuser || hasTabAccess('Customer Portal', t)).map((subTab) => (
                                    <button
                                        key={subTab}
                                        onClick={() => setActiveMasterSubTab(subTab as MasterSubTab)}
                                        className={`pb-3 text-sm font-medium transition-colors whitespace-nowrap border-b-2 ${activeMasterSubTab === subTab
                                            ? 'border-indigo-500 text-indigo-600'
                                            : 'border-transparent text-gray-500 hover:text-gray-700'
                                            }`}
                                    >
                                        {subTab.toUpperCase()}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Masters Content */}
                        <div className="bg-white rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 border border-gray-200 min-h-[500px]">
                            {activeMasterSubTab === 'Category' && <CategoryContent />}
                            {activeMasterSubTab === 'Customer' && <CustomerContent onNavigate={onNavigate} setPrefilledVoucherData={setPrefilledVoucherData} />}
                            {activeMasterSubTab === 'Sales Quotation & Order' && <SalesOrderContent />}
                            {activeMasterSubTab === 'Long-term Contracts' && <LongTermContractsContent />}
                        </div>
                    </div>
                )}

                {activeTab === 'Transaction' && (
                    <div>
                        {/* Sub-tabs for Transaction */}
                        <div className="mb-6">
                            <div className="flex gap-8 border-b border-gray-200 pb-1">
                                {['Sales Quotation', 'Sales Order', 'Sales', 'Receipt'].filter(t => isSuperuser || hasTabAccess('Customer Portal', t)).map((subTab) => (
                                    <button
                                        key={subTab}
                                        onClick={() => setActiveTransactionSubTab(subTab as TransactionSubTab)}
                                        className={`pb-3 text-sm font-medium transition-colors whitespace-nowrap border-b-2 ${activeTransactionSubTab === subTab
                                            ? 'border-indigo-500 text-indigo-600'
                                            : 'border-transparent text-gray-500 hover:text-gray-700'
                                            }`}
                                    >
                                        {subTab.toUpperCase()}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Transactions Content */}
                        <div className="bg-white rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 p-8 text-center min-h-[500px]">
                            {activeTransactionSubTab === 'Sales Quotation' && (
                                showCreateQuotation ? (
                                    <CreateSalesQuotation
                                        onCancel={() => {
                                            setShowCreateQuotation(false);
                                            setEditQuotationId(null);
                                            setEditQuotationType(null);
                                        }}
                                        editId={editQuotationId}
                                        editType={editQuotationType || activeSalesQuotationSubTab}
                                    />
                                ) : (
                                    <SalesQuotationList
                                        onCreateQuotation={handleCreateQuotation}
                                        onEditQuotation={handleEditQuotation}
                                    />

                                )
                            )}
                            {activeTransactionSubTab === 'Sales Order' && (
                                showCreateOrder ? (
                                    <CreateSalesOrder
                                        editId={editSalesOrderId}
                                        onCancel={() => {
                                            setShowCreateOrder(false);
                                            setEditSalesOrderId(null);
                                        }}
                                    />
                                ) : (
                                    <SalesOrderList
                                        key={refreshOrders}
                                        onCreateOrder={() => {
                                            setEditSalesOrderId(null);
                                            setShowCreateOrder(true);
                                        }}
                                        onEditOrder={handleEditSalesOrder}
                                        onViewOrder={handleViewSalesOrder}
                                        onCancelOrder={handleCancelSalesOrder}
                                    />
                                )
                            )}
                            {activeTransactionSubTab === 'Sales' && (
                                <SalesContent onNavigate={onNavigate} setPrefilledVoucherData={setPrefilledVoucherData} />
                            )}
                            {activeTransactionSubTab === 'Receipt' && (
                                <ReceiptContent />
                            )}
                        </div>
                    </div>
                )}

                {/* Sales Order View Modal */}
                <SalesOrderViewModal
                    isOpen={isSalesOrderViewModalOpen}
                    onClose={() => setIsSalesOrderViewModalOpen(false)}
                    orderId={selectedSalesOrderId}
                />
            </div>
        </div>
    );
};

// -- Mastery Sub-Components --

const CategoryContent: React.FC = () => {
    return (
        <InventoryCategoryWizard
            apiEndpoint="/api/customerportal/categories/"
            allowCreateGroup={true}
            showChangeParent={false}
            showSubgroup={false} // Hiding Subgroup for Customer Portal as requested
            defaultGroups={[]} // Empty default groups as requested
            excludeGroups={['Import', 'With in country (Indigenous)']} // Force exclude persistent groups
            systemCategories={CUSTOMER_CATEGORIES.map(c => c.category)}
            // Using default system categories and groups (Inventory/Vendor structure) as requested
            onCreateCategory={async (data) => {
                try {
                    await httpClient.post('/api/customerportal/categories/', {
                        category: data.category,
                        group: data.group,
                        subgroup: data.subgroup,
                        is_active: true
                    });
                    showSuccess('Category created successfully!');
                    // Wizard will auto-refresh its tree
                } catch (error: any) {
                    // Specific duplicate check might be needed if wizard relies on string matching
                    // But generally wizard handles re-thrown errors.
                    throw error;
                }
            }}
            onEditCategory={async (data) => {
                try {
                    await httpClient.put(`/api/customerportal/categories/${data.id}/`, {
                        category: data.category,
                        group: data.group,
                        subgroup: data.subgroup,
                        is_active: true
                    });
                } catch (error: any) {
                    throw error;
                }
            }}
            onDeleteCategory={async (id) => {
                try {
                    await httpClient.delete(`/api/customerportal/categories/${id}/`);
                } catch (error: any) {
                    throw error;
                }
            }}
        />
    );
};

interface CustomerContentProps {
    onNavigate?: (page: string) => void;
    setPrefilledVoucherData?: (data: any) => void;
}
const CustomerContent: React.FC<CustomerContentProps> = ({ onNavigate, setPrefilledVoucherData }) => {
    // State for view mode
    const [view, setView] = useState<'list' | 'create'>('list');
    const [viewCustomer, setViewCustomer] = useState<any | null>(null); // State for viewing customer details
    const [activeTab, setActiveTab] = useState(''); // Start with empty to show overview first

    // State for filters
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('All Status');
    const [categoryFilter, setCategoryFilter] = useState('All Categories');

    // Categories State
    const [categories, setCategories] = useState<Category[]>([]);

    // Data State
    const [customers, setCustomers] = useState<any[]>([]);
    const [stockItems, setStockItems] = useState<any[]>([]);
    const [units, setUnits] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    const fetchCustomers = async () => {
        try {
            const response = await httpClient.get<any[]>('/api/customerportal/customer-master/');
            setCustomers(response);
        } catch (error) {
            handleApiError(error, 'Fetch Customers');
        }
    };

    const fetchFullCustomerById = async (customerId: number) => {
        const response = await httpClient.get<any>(`/api/customerportal/customer-master/${customerId}/`);
        return response;
    };

    const fetchStockItems = async () => {
        try {
            // Fetch both Inventory Items and Services
            const [inventoryResponse, servicesResponse] = await Promise.all([
                httpClient.get<any[]>('/api/inventory/items/'),
                httpClient.get<any[]>('/api/services/')
            ]);

            // Map Inventory Items
            const inventoryItems = (inventoryResponse || []).map(item => ({
                id: item.id,
                code: item.item_code || item.code || '',
                name: item.item_name || item.name || '',
                uom: item.uom || item.unit || '',
                hsnCode: item.hsn_code || item.hsn_sac || item.hsn || ''
            }));

            // Map Services
            const serviceItems = (servicesResponse || []).map(item => ({
                id: item.id,
                code: item.serviceCode || '',
                name: item.serviceName || '',
                uom: item.uom || '',
                hsnCode: item.sacCode || ''
            }));

            // Merge everything
            setStockItems([...inventoryItems, ...serviceItems]);
        } catch (error) {
            handleApiError(error, 'Fetch Stock Items & Services');
        }
    };

    const fetchUnits = async () => {
        try {
            const response = await httpClient.get<any[]>('/api/inventory/units/');
            setUnits(response);
        } catch (error) {
            handleApiError(error, 'Fetch Units');
        }
    };

    useEffect(() => {
        const fetchAll = async () => {
            setIsLoading(true);
            await Promise.all([fetchCategories(), fetchCustomers(), fetchStockItems(), fetchUnits()]);
            setIsLoading(false);
        };

        const fetchCategories = async () => {
            try {
                const response = await httpClient.get<Category[]>('/api/customerportal/categories/');
                const processed = response.map(c => ({
                    ...c,
                    full_path: [c.category, c.group, c.subgroup].filter(Boolean).join(' > ')
                }));
                setCategories(processed);
            } catch (error) {
                handleApiError(error, 'Fetch Categories');
            }
        };

        fetchAll();
    }, []);

    // State for vendor linking logic
    const [isVendor, setIsVendor] = useState(false);
    const [vendorSearchStatus, setVendorSearchStatus] = useState<'idle' | 'searching' | 'found' | 'not-found'>('idle');
    const [linkVendor, setLinkVendor] = useState<boolean | null>(null);
    const [createVendor, setCreateVendor] = useState<boolean | null>(null);

    // State for GST Details
    const [isUnregistered, setIsUnregistered] = useState(false);
    const [gstInput, setGstInput] = useState('');
    const [selectedGSTINs, setSelectedGSTINs] = useState<string[]>([]);
    const [showBranchDetails, setShowBranchDetails] = useState(false);
    const [expandedBranches, setExpandedBranches] = useState<number[]>([1]); // Default first expanded
    const [showGstDropdown, setShowGstDropdown] = useState(false); // Dropdown visibility state
    const [addMultipleBranches, setAddMultipleBranches] = useState(false); // Toggle for multiple branches
    const [unregisteredBranches, setUnregisteredBranches] = useState([
        {
            id: 1,
            referenceName: '',
            addressLine1: '',
            addressLine2: '',
            addressLine3: '',
            city: '',
            pincode: '',
            state: '',
            country: '',
            contactPerson: '',
            email: '',
            contactNumber: '',
            gstin: null
        }
    ]);
    const [registeredBranches, setRegisteredBranches] = useState<any[]>([]); // Track registered branch inputs

    const [productRows, setProductRows] = useState([
        { id: 1, itemCode: '', itemName: '', hsnCode: '', uom: '', custItemCode: '', custItemName: '', custUom: '', packingNotes: '' }
    ]);

    // ... (rest of state)

    // ... (existing handlers)

    const handleRegisteredBranchChange = (gstin: string, field: string, value: string) => {
        setRegisteredBranches(prev => {
            const existing = prev.find(b => b.gstin === gstin);
            if (existing) {
                return prev.map(b => b.gstin === gstin ? { ...b, [field]: value } : b);
            }
            // Should not happen if initialized correctly, but safe fallback
            return [...prev, { gstin, [field]: value }];
        });
    };

    // Function to populate inputs when GSTIN is selected
    const initializeRegisteredBranch = (gstin: string) => {
        setRegisteredBranches(prev => {
            if (prev.find(b => b.gstin === gstin)) return prev;
            // Pre-fill from mock if available, or empty
            const mock = mockBranches.find(b => b.gstin === gstin);
            return [...prev, {
                gstin,
                defaultRef: mock ? mock.defaultRef : '',
                address: mock ? mock.address : '',
                contactPerson: '',
                contactNumber: '',
                email: ''
            }];
        });
    };
    const [statutoryDetails, setStatutoryDetails] = useState({
        msmeNo: '',
        fssaiNo: '',
        iecCode: '',
        eouStatus: 'Export Oriented Unit (EOU)', // Default
        taxType: 'NONE' as 'TCS' | 'TDS' | 'NONE', // NEW: mutual-exclusive selector
        tcsSections: [] as string[],
        tcsEnabled: false,
        tdsSections: [] as string[],
        tdsEnabled: false
    });

    // TDS Sections Data
    const tdsSections = [
        { section: 'Section 392(7)', name: 'Premature EPF Withdrawal (> ₹50,000)', rate: '10%', description: 'Threshold limit: ₹ 50,000' },
        { section: 'Section 393(1)', name: 'Interest on Securities', rate: '10%', description: 'Threshold limit: ₹ 10,000' },
        { section: 'Section 393(1)', name: 'Interest other than Securities', rate: '10%', description: 'Threshold limit: ₹ 50,000 (General) / ₹ 1,00,000 (Senior Citizens)' },
        { section: 'Section 393(1)', name: 'Dividends (Domestic Company)', rate: '10%', description: 'Threshold limit: ₹ 10,000' },
        { section: 'Section 393(1)', name: 'Contractor Payments (Large Payer) - Individual/HUF', rate: '1%', description: 'Threshold limit: ₹ 30,000 (Single) / ₹ 1,00,000 (Annual Aggregate)' },
        { section: 'Section 393(1)', name: 'Contractor Payments (Large Payer) - Other than Individual/HUF', rate: '2%', description: 'Threshold limit: ₹ 50,00,000' },
        { section: 'Section 393(1)', name: 'Contractor/Professional/Comm. (Ind/HUF Payer > ₹50L)', rate: '5%', description: 'Threshold limit: ₹ 50,000' },
        { section: 'Section 393(1)', name: 'Technical Services / Call Centre / Film Royalty', rate: '2%', description: 'Threshold limit: ₹ 2,40,000 (Annual) or ₹ 50,000 (Monthly per payer type)' },
        { section: 'Section 393(1)', name: 'Professional Fees / Other Royalty', rate: '10%', description: 'Threshold limit: ₹ 50,00,000' },
        { section: 'Section 393(1)', name: 'Insurance Commission', rate: '2%', description: 'Threshold limit: ₹ 20,000' },
        { section: 'Section 393(1)', name: 'General Commission or Brokerage', rate: '2%', description: 'Threshold limit: ₹ 20,000' },
        { section: 'Section 393(1)', name: 'Rent (Individual/HUF Payer > ₹50,000/mo)', rate: '2%', description: 'Threshold limit: ₹ 50,00,000' },
        { section: 'Section 393(1)', name: 'Rent on Plant & Machinery', rate: '2%', description: 'Threshold limit: ₹ 10,000 (General) / ₹ 50,000 (Specified Person)' },
        { section: 'Section 393(1)', name: 'Rent on Land & Building', rate: '10%', description: 'Threshold limit: ₹ 10,000 (per transaction/aggregate as per type)' },
        { section: 'Section 393(1)', name: 'Transfer of Immovable Property (> ₹50L)', rate: '1%', description: 'Threshold limit: ₹ 1 Crore (Filers) / ₹ 20 Lakh (Non-filers)' },
        { section: 'Section 393(1)', name: 'Purchase of Goods (exceeding ₹50L)', rate: '0.10%', description: 'Threshold limit: ₹ 20,000' },
        { section: 'Section 393(1)', name: 'Virtual Digital Assets (VDA/Crypto)', rate: '1%', description: 'Threshold limit: No limit. Taxable from rupee 1' },
        { section: 'Section 393(3)', name: 'Winnings from Lottery / Puzzles', rate: '30%', description: 'Threshold limit: No limit. Taxable from rupee 1' },
        { section: 'Section 393(3)', name: 'Regular Filer (ITR filed in previous years) > 1 cr', rate: '2%', description: 'Threshold limit: Regular Filer (ITR filed in previous years) > 1 cr' },
        { section: 'Section 393(3)', name: 'Non-Filer (ITR not filed for past 3 years) > 20L', rate: '2%', description: 'Threshold limit: Non-Filer (ITR not filed for past 3 years) > 20L' },
        { section: 'Section 393(3)', name: 'Non-Filer (ITR not filed for past 3 years) > 1Cr', rate: '5%', description: 'Threshold limit: Non-Filer (ITR not filed for past 3 years) > 1Cr' },
        { section: 'Section 393(3)', name: 'Co-operative Societies > 3 cr', rate: '2%', description: 'Threshold limit: Co-operative Societies > 3 cr' },
        { section: 'Section 393(3)', name: 'Payments to Partners (Salary/Comm. > ₹20k)', rate: '10%', description: 'Threshold limit: Payments to Partners (Salary/Comm. > ₹20k)' },
        { section: 'Section 393(2)', name: 'Sportsmen / Sports Association (Non-Resident)', rate: '20%', description: 'Threshold limit: No limit. Taxable from rupee 1' },
        { section: 'Section 393(2)', name: 'Interest on Foreign Borrowings/IFSC Bonds for loans before july1, 2023', rate: '5%', description: 'Threshold limit: No limit. Taxable from rupee 1' },
        { section: 'Section 393(2)', name: 'Interest on Foreign Borrowings/IFSC Bonds for loans after july1, 2023', rate: '9%', description: 'Threshold limit: No limit. Taxable from rupee 1' },
        { section: 'Section 393(2)', name: 'Income/LTCG from Offshore Fund Units', rate: '10%', description: 'Threshold limit: No limit. Taxable from rupee 1' },
        { section: 'Section 393(2)', name: 'Interest/Dividends/LTCG on Bonds/GDR', rate: '10%', description: 'Threshold limit: No limit. Taxable from rupee 1' },
        { section: 'Section 393(2)', name: 'Any other sum payable to Non-Resident', rate: '30%', description: 'Threshold limit: No limit. Taxable from rupee 1' }
    ];

    // State for TDS info modal
    const [showTdsInfo, setShowTdsInfo] = useState(false);
    const [selectedTdsInfo, setSelectedTdsInfo] = useState<{ section: string; name: string; rate: string; description: string } | null>(null);

    // TCS Sections Data
    const tcsSections = [
        { section: 'Section 206C(1)', name: 'Sale of Scrap, Alcoholic Liquor, Minerals', rate: '1%', description: 'Sale of Scrap, Alcoholic Liquor for human consumption, and Minerals being coal or lignite or iron ore' },
        { section: 'Section 206C(1)', name: 'Sale of Tendu Leaves', rate: '5%', description: 'Sale of Tendu Leaves' },
        { section: 'Section 206C(1)', name: 'Sale of Forest Produce', rate: '2%', description: 'Sale of Timber and Forest produce under a forest lease' },
        { section: 'Section 206C(1)', name: 'Sale of Timber', rate: '2%', description: 'Sale of Timber from modes other than forest lease' },
        { section: 'Section 206C(1F)', name: 'Sale of Motor Vehicles', rate: '1%', description: 'Sale of Motor Vehicle for value of more than Rs.10 Lakhs' },
        { section: 'Section 206C(1F)', name: 'Sale of Specified Luxury Goods', rate: '1%', description: 'Sale of Luxury Goods like yachts, helicopters, aircraft, jewellery, home theatre systems, etc. for value of more than Rs 10 Lakhs' }
    ];

    // State for TCS info display
    const [showTcsInfo, setShowTcsInfo] = useState(false);
    const [selectedTcsInfo, setSelectedTcsInfo] = useState<{ section: string; name: string; rate: string; description: string } | null>(null);

    const [bankAccounts, setBankAccounts] = useState<{
        id: number;
        accountNumber: string;
        bankName: string;
        ifscCode: string;
        branchName: string;
        swiftCode: string;
        associatedBranches: string[];
    }[]>([]);
    const [isAddingBank, setIsAddingBank] = useState(false);
    const [openBranchDropdown, setOpenBranchDropdown] = useState<number | null>(null);

    // T&C Details State
    const [termsDetails, setTermsDetails] = useState({
        creditPeriod: '',
        creditTerms: '',
        penaltyTerms: '',
        deliveryTerms: '',
        warrantyDetails: '',
        forceMajeure: '',
        disputeTerms: ''
    });


    // Customer Form Data State
    const [customerFormData, setCustomerFormData] = useState({
        customer_name: '',
        customer_code: `CUST-${Date.now().toString().slice(-6)}`, // Generate unique code
        customer_category: '',
        pan_number: '',
        contact_person: '',
        email_address: '',
        contact_number: '',
        billing_currency: '',
        gst_tds_applicable: false // Default to No
    });

    // Track created customer ID for progressive saving
    const [createdCustomerId, setCreatedCustomerId] = useState<number | null>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (!target.closest('.branch-dropdown-container')) {
                setOpenBranchDropdown(null);
            }
        };

        if (openBranchDropdown !== null) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [openBranchDropdown]);

    // Handle form field changes
    // Handle form field changes
    const handleCustomerFieldChange = (field: string, value: string | boolean) => {
        setCustomerFormData(prev => ({ ...prev, [field]: value }));
    };

    // Save Customer Handler
    const handleSaveCustomer = async (options: { exit: boolean } = { exit: true }): Promise<boolean> => {
        // Validation - Basic Details are required for first save
        if (!customerFormData.customer_name.trim()) {
            showError('Please enter customer name');
            return false;
        }
        if (!customerFormData.pan_number || !customerFormData.pan_number.trim()) {
            showError('Please enter PAN number');
            setActiveTab('Basic Details');
            return false;
        }
        const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
        if (!panRegex.test(customerFormData.pan_number.toUpperCase())) {
            showError('Invalid PAN format. Correct format: ABCDE1234F');
            setActiveTab('Basic Details');
            return false;
        }

        if (customerFormData.email_address && customerFormData.email_address.trim()) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(customerFormData.email_address)) {
                showError('Invalid email format');
                setActiveTab('Basic Details');
                return false;
            }
        }

        try {
            const payload = {
                customer_name: customerFormData.customer_name,
                customer_code: customerFormData.customer_code,
                customer_category: customerFormData.customer_category || null,
                pan_number: customerFormData.pan_number || null,
                contact_person: customerFormData.contact_person || null,
                email_address: customerFormData.email_address || null,
                contact_number: customerFormData.contact_number || null,
                billing_currency: customerFormData.billing_currency || null,
                is_also_vendor: isVendor,
                gst_tds_applicable: customerFormData.gst_tds_applicable, // Add to payload
                // GST Details
                gst_details: {
                    gstins: isUnregistered ? [] : selectedGSTINs,
                    branches: isUnregistered ? unregisteredBranches.map(b => ({
                        defaultRef: b.referenceName,
                        addressLine1: b.addressLine1 || '',
                        addressLine2: b.addressLine2 || '',
                        addressLine3: b.addressLine3 || '',
                        city: b.city || '',
                        pincode: b.pincode || '',
                        state: b.state || '',
                        country: b.country || '',
                        contactPerson: b.contactPerson,
                        email: b.email,
                        contactNumber: b.contactNumber,
                        gstin: null
                    })) : (showBranchDetails ? registeredBranches.map(b => ({
                        defaultRef: b.defaultRef,
                        addressLine1: b.addressLine1 || '',
                        addressLine2: b.addressLine2 || '',
                        addressLine3: b.addressLine3 || '',
                        city: b.city || '',
                        pincode: b.pincode || '',
                        state: b.state || '',
                        country: b.country || '',
                        contactPerson: b.contactPerson,
                        email: b.email,
                        contactNumber: b.contactNumber,
                        gstin: b.gstin
                    })) : [])
                },
                // Products/Services
                products_services: {
                    items: productRows
                },
                // TDS & Statutory Details
                msme_no: statutoryDetails.msmeNo || null,
                fssai_no: statutoryDetails.fssaiNo || null,
                iec_code: statutoryDetails.iecCode || null,
                eou_status: statutoryDetails.eouStatus || null,
                tcs_section: statutoryDetails.tcsSections.join(','),
                tcs_enabled: statutoryDetails.tcsEnabled,
                tds_section: statutoryDetails.tdsSections.join(','),
                tds_enabled: statutoryDetails.tdsEnabled,
                // Banking Info
                banking_info: bankAccounts.length > 0 ? { accounts: bankAccounts } : null,
                // Terms & Conditions
                credit_period: termsDetails.creditPeriod || null,
                credit_terms: termsDetails.creditTerms || null,
                penalty_terms: termsDetails.penaltyTerms || null,
                delivery_terms: termsDetails.deliveryTerms || null,
                warranty_details: termsDetails.warrantyDetails || null,
                force_majeure: termsDetails.forceMajeure || null,
                dispute_terms: termsDetails.disputeTerms || null
            };

            // DEBUG LOGGING




            console.log('Terms & Conditions:', {
                credit_period: payload.credit_period,
                credit_terms: payload.credit_terms,
                penalty_terms: payload.penalty_terms,
                delivery_terms: payload.delivery_terms,
                warranty_details: payload.warranty_details,
                force_majeure: payload.force_majeure,
                dispute_terms: payload.dispute_terms
            });


            let response;
            if (createdCustomerId) {
                // Update existing customer

                response = await httpClient.patch(`/api/customerportal/customer-master/${createdCustomerId}/`, payload);
                await fetchCustomers(); // Refresh the list
                if (options.exit) showSuccess('Customer updated successfully!');
            } else {
                // Create new customer

                response = await httpClient.post('/api/customerportal/customer-master/', payload);

                setCreatedCustomerId(response.id);
                await fetchCustomers(); // Refresh the list
                if (options.exit) showSuccess('Customer created successfully!');
            }

            if (options.exit) {
                // Reset form and go back to list view
                setView('list');
                setCreatedCustomerId(null);
                setCustomerFormData({
                    customer_name: '',
                    customer_code: `CUST-${Date.now().toString().slice(-6)}`,
                    customer_category: '',
                    pan_number: '',
                    contact_person: '',
                    email_address: '',
                    contact_number: '',
                    billing_currency: '',
                    gst_tds_applicable: false
                });
            }
            return true;
        } catch (error: any) {
            handleApiError(error, 'Save Customer');
            return false;
        }
    };

    // Helper to add a new bank account
    const handleAddBank = () => {
        setBankAccounts(prev => [
            ...prev,
            {
                id: Date.now(),
                accountNumber: '',
                bankName: '',
                ifscCode: '',
                branchName: '',
                swiftCode: '',
                associatedBranches: []
            }
        ]);
        setIsAddingBank(true); // Keep this if we use it to track "edit mode", but simplified logic might just rely on array length
    };


    const handleRemoveBank = async (id: number) => {
        if (await confirm('Are you sure you want to remove this bank account? This action cannot be undone.')) {
            setBankAccounts(prev => prev.filter(acc => acc.id !== id));
            if (bankAccounts.length === 1) setIsAddingBank(false);
        }
    };

    const handleBankChange = (id: number, field: string, value: any) => {
        setBankAccounts(prev => prev.map(acc =>
            acc.id === id ? { ...acc, [field]: value } : acc
        ));
    };

    // Track last fetched IFSC to avoid redundant calls
    const [lastFetchedIfsc, setLastFetchedIfsc] = useState<Record<number, string>>({});

    const fetchBankDetails = async (id: number, ifsc: string) => {
        const trimmedIfsc = ifsc ? ifsc.trim().toUpperCase() : '';
        if (trimmedIfsc.length !== 11) {
            // If user deletes or changes, we might want to reset the cache for this ID
            if (trimmedIfsc.length < 11 && lastFetchedIfsc[id]) {
                setLastFetchedIfsc(prev => ({ ...prev, [id]: '' }));
            }
            return;
        }

        // Avoid redundant calls for the same IFSC
        if (lastFetchedIfsc[id] === trimmedIfsc) return;

        setLastFetchedIfsc(prev => ({ ...prev, [id]: trimmedIfsc }));

        // Clear existing names to show we are fetching and avoid mismatch
        setBankAccounts(prev => prev.map(acc =>
            acc.id === id ? { ...acc, bankName: 'Fetching...', branchName: 'Fetching...' } : acc
        ));

        try {
            const response = await fetch(`https://ifsc.razorpay.com/${trimmedIfsc}`);
            if (response.ok) {
                const data = await response.json();
                setBankAccounts(prev => prev.map(acc =>
                    acc.id === id ? {
                        ...acc,
                        bankName: data.BANK || '',
                        branchName: data.BRANCH || ''
                    } : acc
                ));
            } else {
                showError('Invalid IFSC Code or lookup failed');
                // Reset fields on failure to avoid showing "Fetching..." or previous incorrect data
                setBankAccounts(prev => prev.map(acc =>
                    acc.id === id ? { ...acc, bankName: '', branchName: '' } : acc
                ));
                // Optional: keep lastFetchedIfsc as is to prevent retrying the same invalid code immediately
            }
        } catch (error) {
            console.error('Error fetching bank details:', error);
            setBankAccounts(prev => prev.map(acc =>
                acc.id === id ? { ...acc, bankName: '', branchName: '' } : acc
            ));
        }
    };

    const handleProductRowChange = (id: number, field: string, value: string) => {

        setProductRows(prev => prev.map(row => {
            if (row.id === id) {
                const updatedRow: any = { ...row, [field]: value };
                // Bidirectional auto-population
                if (field === 'itemCode') {
                    const item = stockItems.find(i => i.code === value);
                    if (item) {
                        updatedRow.itemName = item.name;
                        updatedRow.uom = item.uom;
                        updatedRow.hsnCode = item.hsnCode;
                    } else {
                        updatedRow.itemName = '';
                        updatedRow.hsnCode = '';
                    }
                } else if (field === 'itemName') {
                    const item = stockItems.find(i => i.name === value);
                    if (item) {
                        updatedRow.itemCode = item.code;
                        updatedRow.uom = item.uom;
                        updatedRow.hsnCode = item.hsnCode;
                    } else {
                        updatedRow.itemCode = '';
                        updatedRow.hsnCode = '';
                    }
                }
                return updatedRow;
            }
            return row;
        }));
    };

    const handleAddProductRow = () => {
        setProductRows(prev => [
            ...prev,
            { id: prev.length + 1, itemCode: '', itemName: '', hsnCode: '', uom: '', custItemCode: '', custItemName: '', custUom: '', packingNotes: '' }
        ]);
    };

    const handleRemoveProductRow = (id: number) => {
        if (productRows.length > 1) {
            setProductRows(prev => prev.filter(row => row.id !== id));
        }
    };



    // Mock GSTINs for dropdown
    // Mock GSTINs for dropdown
    const mockGSTINs = ['29ABCDE1234F1Z5', '27ABCDE1234F1Z5', '07ABCDE1234F1Z5'];

    // Mock Branch Data
    const mockBranches = [
        { id: 1, gstin: '29ABCDE1234F1Z5', address: '123, Industrial Area, Bangalore, Karnataka - 560001', defaultRef: 'Bangalore Branch' },
        { id: 2, gstin: '27ABCDE1234F1Z5', address: '456, Textile Market, Surat, Gujarat - 395002', defaultRef: 'Mumbai Branch' },
        { id: 3, gstin: '07ABCDE1234F1Z5', address: '789, Connaught Place, New Delhi - 110001', defaultRef: 'Main Branch' },
    ];

    const handleGstSelect = (gstin: string) => {
        setShowBranchDetails(false); // Hide details when selection changes, forcing user to click Fetch again
        if (selectedGSTINs.includes(gstin)) {
            setSelectedGSTINs(prev => prev.filter(g => g !== gstin));
            setRegisteredBranches(prev => prev.filter(b => b.gstin !== gstin)); // Cleanup
        } else {
            setSelectedGSTINs(prev => [...prev, gstin]);
            setGstInput(''); // Clear input on selection
            initializeRegisteredBranch(gstin); // Initialize data
        }
    };

    const handleFetchBranchDetails = () => {
        if (selectedGSTINs.length > 0) {
            setShowBranchDetails(true);
        }
    };

    const toggleBranchExpand = (id: number) => {
        setExpandedBranches(prev =>
            prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]
        );
    };

    const handleNextToGst = () => {
        // Validation removed to allow direct tab selection from overview grid as requested.
        // Form-level validation still exists on the "Next" button in the Basic Details section.
        // Reset GST related states to ensure "Image 2" clean state
        setSelectedGSTINs([]);
        setGstInput('');
        setShowGstDropdown(false);
        setShowBranchDetails(false);
        setExpandedBranches([]);
        setIsUnregistered(false);
        setActiveTab('GST Details');
    };

    const handleVendorRadioChange = (isYes: boolean) => {
        setIsVendor(isYes);
        if (isYes) {
            setVendorSearchStatus('searching');
            // Simulate API Search
            setTimeout(() => {
                // For demonstration, randomly find a vendor or not, or default to found
                // Let's toggle based on randomly for now to show both, or just 'found'
                setVendorSearchStatus(Math.random() > 0.5 ? 'found' : 'not-found');
            }, 1000);
        } else {
            setVendorSearchStatus('idle');
            setLinkVendor(null);
            setCreateVendor(null);
        }
    };

    const handleAddManualBranch = () => {
        setUnregisteredBranches(prev => [...prev, {
            id: prev.length + 1,
            referenceName: '',
            addressLine1: '',
            addressLine2: '',
            addressLine3: '',
            city: '',
            pincode: '',
            state: '',
            country: '',
            contactPerson: '',
            email: '',
            contactNumber: '',
            gstin: null
        }]);
        // Auto-expand the new branch
        setExpandedBranches(prev => [...prev, unregisteredBranches.length + 1]);
    };

    const handleManualBranchChange = (id: number, field: string, value: string) => {
        setUnregisteredBranches(prev => prev.map(branch =>
            branch.id === id ? { ...branch, [field]: value } : branch
        ));
    };

    // Helper function to handle Back button navigation
    const handleBackButton = () => {
        const tabs = ['Basic Details', 'GST Details', 'Products/Services', 'TDS & Other Statutory Details', 'Banking Info', 'Terms & Conditions'];
        const currentIndex = tabs.indexOf(activeTab);

        if (currentIndex > 0) {
            // Navigate to previous tab
            setActiveTab(tabs[currentIndex - 1] as typeof activeTab);
        } else {
            // If on first tab, go back to list
            setView('list');
        }
    };

    const handleEditCustomer = (customer: any) => {
        // 1. Basic Details
        setCustomerFormData({
            customer_name: customer.customer_name,
            customer_code: customer.customer_code,
            customer_category: customer.customer_category ? String(customer.customer_category) : '', // Use ID as string for select compatibility
            pan_number: customer.pan_number || '',
            contact_person: customer.contact_person || '',
            email_address: customer.email_address || '',
            contact_number: customer.contact_number || '',
            billing_currency: customer.billing_currency || '',
            gst_tds_applicable: customer.gst_tds_applicable || false
        });

        // 2. Vendor Link
        setIsVendor(customer.is_also_vendor || false);

        // 3. GST Details
        const gstData = customer.gst_details;
        // Reset validation/view states first
        setGstInput('');
        setShowBranchDetails(false);
        setExpandedBranches([1]);

        if (gstData && (gstData.gstins.length > 0 || gstData.branches.length > 0)) {
            // Check if unregistered based on GSTINs or flag if backend provides it
            // Backend serializer provides 'is_unregistered' flag if we look closely at models, 
            // but mapped here we can infer. If GSTIN is null/empty in branches or gstins array is empty but branches exist?
            // Actually, the serializer returns 'gstins' array. If empty and branches exist with no GSTIN, it's unregistered.
            // Or explicitly check 'isUnregistered' from backend if available.
            // Assuming 'isUnregistered' state logic:
            const hasGstins = gstData.gstins && gstData.gstins.length > 0;
            const isUnreg = !hasGstins && gstData.branches.some((b: any) => !b.gstin);

            setIsUnregistered(isUnreg);

            if (isUnreg) {
                // Populate unregistered branches
                const branches = gstData.branches.map((b: any, index: number) => ({
                    id: index + 1,
                    referenceName: b.defaultRef || '',
                    addressLine1: b.addressLine1 || b.address || '',
                    addressLine2: b.addressLine2 || '',
                    addressLine3: b.addressLine3 || '',
                    city: b.city || '',
                    pincode: b.pincode || '',
                    state: b.state || '',
                    country: b.country || 'India',
                    contactPerson: b.contactPerson || '',
                    email: b.email || '',
                    contactNumber: b.contactNumber || '',
                    gstin: null
                }));
                const fallbackState = {
                    id: 1,
                    referenceName: '',
                    addressLine1: '',
                    addressLine2: '',
                    addressLine3: '',
                    city: '',
                    pincode: '',
                    state: '',
                    country: 'India',
                    contactPerson: '',
                    email: '',
                    contactNumber: '',
                    gstin: null
                };
                setUnregisteredBranches(branches.length ? branches : [fallbackState]);
            } else {
                // Populate registered branches
                setSelectedGSTINs(gstData.gstins || []);

                // Populate registered branches state
                const branches = gstData.branches.map((b: any) => {
                    const mock = mockBranches.find(mb => mb.gstin === b.gstin);
                    const mockAddr = mock ? mock.address : '';
                    const mockRef = mock ? mock.defaultRef : '';

                    return {
                        gstin: b.gstin,
                        defaultRef: b.defaultRef || mockRef,
                        addressLine1: b.addressLine1 || b.address || mockAddr,
                        addressLine2: b.addressLine2 || '',
                        addressLine3: b.addressLine3 || '',
                        city: b.city || '',
                        pincode: b.pincode || '',
                        state: b.state || '',
                        country: b.country || 'India',
                        contactPerson: b.contactPerson || '',
                        contactNumber: b.contactNumber || '',
                        email: b.email || ''
                    };
                });
                setRegisteredBranches(branches);
                if (branches.length > 0) setShowBranchDetails(true);
            }
        } else {
            // Reset to default
            setIsUnregistered(false);
            setSelectedGSTINs([]);
            setRegisteredBranches([]);
            setUnregisteredBranches([{
                id: 1,
                referenceName: '',
                addressLine1: '',
                addressLine2: '',
                addressLine3: '',
                city: '',
                pincode: '',
                state: '',
                country: 'India',
                contactPerson: '',
                email: '',
                contactNumber: '',
                gstin: null
            }]);
        }

        // 4. Products Services
        const prodData = customer.products_services;
        if (prodData && prodData.items.length > 0) {
            setProductRows(prodData.items.map((item: any, index: number) => ({
                id: index + 1,
                itemCode: item.itemCode || '',
                itemName: item.itemName || '',
                hsnCode: item.hsnCode || '',
                uom: item.uom || '',
                custItemCode: item.custItemCode || '',
                custItemName: item.custItemName || '',
                custUom: item.custUom || '',
                packingNotes: item.packingNotes || ''
            })));
        } else {
            setProductRows([{ id: 1, itemCode: '', itemName: '', hsnCode: '', uom: '', custItemCode: '', custItemName: '', custUom: '', packingNotes: '' }]);
        }

        // 5. Statutory (TDS)
        setStatutoryDetails({
            msmeNo: customer.msme_no || '',
            fssaiNo: customer.fssai_no || '',
            iecCode: customer.iec_code || '',
            eouStatus: customer.eou_status || 'Export Oriented Unit (EOU)',
            taxType: customer.tcs_section ? 'TCS' : customer.tds_section ? 'TDS' : 'NONE',
            tcsSections: customer.tcs_section ? customer.tcs_section.split(',') : [],
            tcsEnabled: customer.tcs_enabled || false,
            tdsSections: customer.tds_section ? customer.tds_section.split(',') : [],
            tdsEnabled: customer.tds_enabled || false
        });

        // 6. Banking
        const bankData = customer.banking_info;
        if (bankData && bankData.accounts && bankData.accounts.length > 0) {
            setBankAccounts(bankData.accounts.map((acc: any) => ({
                id: acc.id || Date.now() + Math.random(), // Ensure ID exists
                accountNumber: acc.accountNumber || '',
                bankName: acc.bankName || '',
                ifscCode: acc.ifscCode || '',
                branchName: acc.branchName || '',
                swiftCode: acc.swiftCode || '',
                associatedBranches: acc.associatedBranches || []
            })));
        } else {
            setBankAccounts([]);
        }

        // 7. Terms
        setTermsDetails({
            creditPeriod: customer.credit_period || '',
            creditTerms: customer.credit_terms || '',
            penaltyTerms: customer.penalty_terms || '',
            deliveryTerms: customer.delivery_terms || '',
            warrantyDetails: customer.warranty_details || '',
            forceMajeure: customer.force_majeure || '',
            disputeTerms: customer.dispute_terms || ''
        });

        // 8. Set ID for update
        setCreatedCustomerId(customer.id);

        // 9. Switch View
        setView('create');
        setActiveTab('Basic Details');
    };

    const handleViewCustomer = async (customer: any) => {
        try {
            const fullCustomer = await fetchFullCustomerById(customer.id);
            let resolvedCategoryName = '';
            if (fullCustomer?.customer_category_name) {
                resolvedCategoryName = fullCustomer.customer_category_name;
            } else if (categories.length > 0 && fullCustomer?.customer_category) {
                const cat = categories.find((c: Category) => c.id === fullCustomer.customer_category);
                if (cat) resolvedCategoryName = cat.full_path || cat.category;
            }
            setViewCustomer({ ...fullCustomer, customer_category_name: resolvedCategoryName });
        } catch (error) {
            handleApiError(error, 'Fetch Customer Details');
        }
    };


    const [isExcelDropdownOpen, setIsExcelDropdownOpen] = useState(false);
    const excelDropdownRef = React.useRef<HTMLDivElement>(null);

    const [importSummary, setImportSummary] = useState<{ success: number; failed: number; errors: string[] } | null>(null);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (excelDropdownRef.current && !excelDropdownRef.current.contains(event.target as Node)) {
                setIsExcelDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const [isImporting, setIsImporting] = useState(false);

    const handleCustomerExcelUploadFromModal = async (input: File | any[], isPreview: boolean = false) => {
        setIsImporting(true);
        try {
            const formData = new FormData();
            if (input instanceof File) {
                formData.append('file', input);
            } else {
                // If it's an array, it's our JSON data from the Quick Fix feature
                formData.append('data', JSON.stringify(input));
            }

            const response = await httpClient.post<any>(
                `/api/customerportal/excel/upload/?dry_run=${isPreview}`,
                formData,
                {
                    headers: {
                        'Content-Type': 'multipart/form-data',
                    },
                }
            );

            if (response.summary) {
                // Ensure the summary contains the preview flag from the backend
                setImportSummary({
                    ...response.summary,
                    is_preview: response.is_preview
                });
            } else {
                showSuccess(response.message || 'Customers imported successfully!');
                setIsImportModalOpen(false);
            }

            if (!isPreview) {
                fetchCustomers(); // Refresh the list only on actual save
            }
        } catch (error: any) {
            handleApiError(error, 'Excel Upload');
        } finally {
            setIsImporting(false);
        }
    };

    const handleCustomerExcelDownload = async (type: 'template' | 'export') => {
        try {
            const endpoint = type === 'template'
                ? '/api/customerportal/excel/template/'
                : '/api/customerportal/excel/export/';

            showInfo(`Preparing ${type === 'template' ? 'template' : 'excel'}...`);

            const response: any = await httpClient.get(endpoint, {}, {
                responseType: 'blob'
            });

            const url = window.URL.createObjectURL(new Blob([response]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', type === 'template' ? 'customer_template.xlsx' : 'customers_export.xlsx');
            document.body.appendChild(link);
            link.click();
            link.remove();
            showSuccess(`${type === 'template' ? 'Template' : 'Excel'} downloaded successfully!`);
        } catch (error: any) {
            handleApiError(error, 'Excel Download');
        }
    };

    const handleEditCustomerById = async (customer: any) => {
        try {
            const fullCustomer = await fetchFullCustomerById(customer.id);
            handleEditCustomer(fullCustomer);
        } catch (error) {
            handleApiError(error, 'Fetch Customer For Edit');
        }
    };

    const handleEditImportedCustomer = async (record: { id: number; name: string; code?: string }) => {
        try {
            const fullCustomer = await fetchFullCustomerById(record.id);
            if (fullCustomer) {
                // Close the modal first
                setIsImportModalOpen(false);
                // Open for editing
                handleEditCustomer(fullCustomer);
            }
        } catch (error) {
            handleApiError(error, 'Fetch Customer for Edit');
        }
    };

    const handleDeleteCustomer = async (customerId: number) => {
        if (!window.confirm('Are you sure you want to delete this customer?')) return;
        try {
            const response: any = await httpClient.delete(`/api/customerportal/customers/${customerId}/`);
            showSuccess(response?.message || 'Customer deleted successfully!');
            fetchCustomers();
        } catch (error) {
            handleApiError(error, 'Delete Customer');
        }
    };

    const filteredCustomers = (customers || []).filter(customer => {
        const name = customer.customer_name || customer.name || '';
        const code = customer.customer_code || customer.code || '';
        const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            code.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'All Status' || (customer.status || 'Live') === statusFilter;

        // Category matching - handle both mock and real customer structures
        // For real customers, customer_category is likely an ID, but we might have the expanded name or we need to find it
        // If categories are loaded, we can map the ID to the name if needed, or if the filter value is the name/path.

        // The filter dropdown sets the value to `cat.full_path || cat.category`.
        // The customer object might have `customer_category` (ID) or nested object.
        // Let's assume for now we try to match against available fields.

        let customerCategoryName = '';
        if (customer.customer_category_details) {
            customerCategoryName = customer.customer_category_details.full_path || customer.customer_category_details.category;
        } else if (typeof customer.customer_category === 'object' && customer.customer_category) {
            customerCategoryName = customer.customer_category.full_path || customer.customer_category.category;
        } else {
            // If it's just an ID, try to find it in the categories list
            const cat = categories.find(c => c.id === customer.customer_category);
            if (cat) {
                customerCategoryName = cat.full_path || cat.category;
            } else {
                customerCategoryName = customer.customer_category_name || customer.category || '';
            }
        }

        const matchesCategory = categoryFilter === 'All Categories' || customerCategoryName === categoryFilter;

        return matchesSearch && matchesStatus && matchesCategory;
    });

    if (view === 'create') {
        // Show card overview if no tab is selected
        const showOverview = !activeTab;

        return (
            <div className="p-8">
                {showOverview ? (
                    <>
                        <button
                            onClick={() => setView('list')}
                            className="flex items-center gap-2 text-sm text-gray-600 hover:text-indigo-600 mb-4 transition-colors"
                        >
                            <ChevronLeft className="w-4 h-4" />
                            Back to Customer List
                        </button>
                        <h3 className="text-xl font-bold text-gray-900 mb-2">
                            {createdCustomerId ? 'Edit Customer' : 'Create New Customer'}
                        </h3>
                        <p className="text-sm text-gray-600 mb-8">Select a tab below to configure customer details:</p>

                        {/* Card-based Tab Overview */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
                            {[
                                { name: 'Basic Details', description: 'Configure basic details' },
                                { name: 'GST Details', description: 'Configure gst details' },
                                { name: 'Products/Services', description: 'Configure products/services' },
                                { name: 'TDS & Other Statutory Details', description: 'Configure tds & other statutory' },
                                { name: 'Banking Info', description: 'Configure banking info' },
                                { name: 'Terms & Conditions', description: 'Configure terms & conditions' }
                            ].map(tab => (
                                <button
                                    key={tab.name}
                                    onClick={() => {
                                        if (tab.name === 'GST Details') {
                                            handleNextToGst();
                                        } else {
                                            setActiveTab(tab.name);
                                        }
                                    }}
                                    className="p-6 border border-gray-200 bg-white rounded-[4px] text-left transition-all hover:border-indigo-300 hover:shadow-none border border-slate-200-none border border-slate-200"
                                >
                                    <h4 className="text-base font-semibold mb-1 text-gray-900">
                                        {tab.name}
                                    </h4>
                                    <p className="text-sm text-gray-500">
                                        {tab.description}
                                    </p>
                                </button>
                            ))}
                        </div>
                    </>
                ) : (
                    <>
                        {/* Section Header with Back to Overview */}
                        <div className="mb-6">
                            <button
                                onClick={() => setActiveTab('')}
                                className="flex items-center gap-2 text-sm text-gray-600 hover:text-indigo-600 mb-4 transition-colors"
                            >
                                <ChevronLeft className="w-4 h-4" />
                                Back to overview
                            </button>
                            <h3 className="text-xl font-bold text-gray-900">{activeTab}</h3>
                        </div>
                    </>
                )}

                {/* Basic Details Content */}
                {activeTab === 'Basic Details' && (
                    <div className="max-w-6xl">
                        {/* ... (Basic Details Form Component) */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">

                            {/* Row 1 */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Customer Name <span className="text-red-500">*</span></label>
                                <input
                                    type="text"
                                    value={customerFormData.customer_name}
                                    onChange={(e) => handleCustomerFieldChange('customer_name', e.target.value)}
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Customer Category</label>
                                <SearchableDropdown
                                    options={categories.map(cat => cat.full_path || [cat.category, cat.group, cat.subgroup].filter(Boolean).join(' > '))}
                                    value={categories.find(cat => String(cat.id) === customerFormData.customer_category)?.full_path || categories.find(cat => String(cat.id) === customerFormData.customer_category)?.category || customerFormData.customer_category || ''}
                                    onChange={(val) => {
                                        const selectedCat = categories.find(cat => (cat.full_path || [cat.category, cat.group, cat.subgroup].filter(Boolean).join(' > ')) === val);
                                        if (selectedCat) {
                                            handleCustomerFieldChange('customer_category', String(selectedCat.id));
                                        } else {
                                            // Handle custom value - save as string directly
                                            handleCustomerFieldChange('customer_category', val);
                                        }
                                    }}
                                    placeholder="Select Category"
                                    allowCustomValue={true}
                                />
                            </div>

                            {/* Row 2 */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Customer Code</label>
                                <input
                                    type="text"
                                    value={customerFormData.customer_code}
                                    readOnly
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-[4px] bg-gray-50 text-gray-600"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">PAN Number <span className="text-red-500">*</span></label>
                                <input
                                    type="text"
                                    value={customerFormData.pan_number}
                                    onChange={(e) => handleCustomerFieldChange('pan_number', e.target.value.toUpperCase())}
                                    placeholder="ABCDE1234F"
                                    maxLength={10}
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                />
                            </div>

                            {/* Row 3 */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Contact Person</label>
                                <input
                                    type="text"
                                    value={customerFormData.contact_person}
                                    onChange={(e) => handleCustomerFieldChange('contact_person', e.target.value)}
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Email Address</label>
                                <input
                                    type="email"
                                    value={customerFormData.email_address}
                                    onChange={(e) => handleCustomerFieldChange('email_address', e.target.value)}
                                    placeholder="e.g. customer@example.com"
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                />
                            </div>

                            {/* Row 4 */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Contact Number</label>
                                <input
                                    type="text"
                                    value={customerFormData.contact_number}
                                    onChange={(e) => handleCustomerFieldChange('contact_number', e.target.value)}
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Billing Currency</label>
                                <SearchableDropdown
                                    options={BILLING_CURRENCIES.map(curr => curr.code)}
                                    value={customerFormData.billing_currency}
                                    onChange={(val) => handleCustomerFieldChange('billing_currency', val)}
                                    placeholder="Select Currency"
                                    allowCustomValue={true}
                                />
                            </div>

                            {/* Radio Groups */}
                            <div className="md:col-span-2 border border-gray-200 rounded-[4px] p-6 bg-gray-50/50">
                                <label className="block text-sm font-semibold text-gray-700 mb-3">Is this customer also a vendor?</label>
                                <div className="flex gap-6 mb-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="isVendor"
                                            checked={isVendor}
                                            onChange={() => handleVendorRadioChange(true)}
                                            className="text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                                        />
                                        <span className="text-sm text-gray-700">Yes</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="isVendor"
                                            checked={!isVendor}
                                            onChange={() => handleVendorRadioChange(false)}
                                            className="text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                                        />
                                        <span className="text-sm text-gray-700">No</span>
                                    </label>
                                </div>

                                {/* Dynamic Vendor Logic */}
                                {isVendor && (
                                    <div className="pl-4 border-l-2 border-indigo-200 space-y-4">
                                        {vendorSearchStatus === 'searching' && (
                                            <div className="flex items-center text-indigo-600 text-sm">
                                                <svg className="animate-spin -ml-1 mr-3 h-4 w-4 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                Searching for existing vendors using PAN & Name...
                                            </div>
                                        )}

                                        {vendorSearchStatus === 'found' && (
                                            <div className="space-y-3 animate-fadeIn">
                                                <p className="text-sm font-semibold text-gray-800">
                                                    <span className="text-indigo-600">✓</span> Vendor found matching PAN/Name.
                                                </p>

                                                <div className="flex items-center gap-4">
                                                    <label className="text-sm text-gray-700">Link the customer to this vendor?</label>
                                                    <div className="flex gap-4">
                                                        <label className="flex items-center gap-1 cursor-pointer">
                                                            <input type="radio" name="linkVendor" checked={linkVendor === true} onChange={() => setLinkVendor(true)} className="text-indigo-600 w-4 h-4" />
                                                            <span className="text-sm">Yes</span>
                                                        </label>
                                                        <label className="flex items-center gap-1 cursor-pointer">
                                                            <input type="radio" name="linkVendor" checked={linkVendor === false} onChange={() => setLinkVendor(false)} className="text-indigo-600 w-4 h-4" />
                                                            <span className="text-sm">No</span>
                                                        </label>
                                                    </div>
                                                </div>

                                                {linkVendor === true && (
                                                    <div className="p-3 bg-indigo-50 rounded border border-indigo-100 text-sm text-indigo-800 font-medium">
                                                        Vendor Code: VEND-001 - Acme Supplies (Linked)
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {vendorSearchStatus === 'not-found' && (
                                            <div className="space-y-3 animate-fadeIn">
                                                <p className="text-sm text-amber-600 font-medium">
                                                    ⚠ No matching vendor found.
                                                </p>
                                                <div className="flex items-center gap-4">
                                                    <label className="text-sm text-gray-700">Create a Vendor?</label>
                                                    <div className="flex gap-4">
                                                        <label className="flex items-center gap-1 cursor-pointer">
                                                            <input type="radio" name="createVendor" checked={createVendor === true} onChange={() => setCreateVendor(true)} className="text-indigo-600 w-4 h-4" />
                                                            <span className="text-sm">Yes</span>
                                                        </label>
                                                        <label className="flex items-center gap-1 cursor-pointer">
                                                            <input type="radio" name="createVendor" checked={createVendor === false} onChange={() => setCreateVendor(false)} className="text-indigo-600 w-4 h-4" />
                                                            <span className="text-sm">No</span>
                                                        </label>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="md:col-span-2">
                                <label className="block text-sm font-semibold text-gray-700 mb-3">TDS Applicable under GST?</label>
                                <div className="flex gap-6">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="gst_tds_applicable"
                                            checked={customerFormData.gst_tds_applicable === true}
                                            onChange={() => handleCustomerFieldChange('gst_tds_applicable', true)}
                                            className="text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                                        />
                                        <span className="text-sm text-gray-700">Yes</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="gst_tds_applicable"
                                            checked={customerFormData.gst_tds_applicable === false}
                                            onChange={() => handleCustomerFieldChange('gst_tds_applicable', false)}
                                            className="text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                                        />
                                        <span className="text-sm text-gray-700">No</span>
                                    </label>
                                </div>
                            </div>

                        </div>

                        {/* Footer Buttons */}
                        <div className="flex justify-between items-center gap-4 mt-12 border-t border-gray-200 pt-6">
                            <button
                                onClick={handleBackButton}
                                className="flex items-center gap-2 px-6 py-2 border border-gray-300 rounded-[4px] text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                                <ChevronLeft className="w-4 h-4" />
                                Back
                            </button>
                            <div className="flex gap-4">
                                <button onClick={() => setView('list')} className="px-6 py-2 border border-gray-300 rounded-[4px] text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">Cancel</button>
                                <button
                                    onClick={() => {
                                        if (!customerFormData.customer_name.trim()) {
                                            showError('Please enter customer name');
                                            return;
                                        }
                                        if (!customerFormData.pan_number || !customerFormData.pan_number.trim()) {
                                            showError('Please enter PAN number');
                                            return;
                                        }
                                        const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
                                        if (!panRegex.test(customerFormData.pan_number.toUpperCase())) {
                                            showError('Invalid PAN format. Expected: ABCDE1234F');
                                            return;
                                        }

                                        if (customerFormData.email_address && customerFormData.email_address.trim()) {
                                            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                                            if (!emailRegex.test(customerFormData.email_address)) {
                                                showError('Invalid email format');
                                                return;
                                            }
                                        }
                                        setActiveTab('GST Details');
                                    }}
                                    className="px-6 py-2 bg-indigo-600 text-white rounded-[4px] text-sm font-medium hover:bg-indigo-700 transition-colors"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    </div>
                )
                }

                {/* GST Details Content */}
                {
                    activeTab === 'GST Details' && (
                        <div className="max-w-6xl mx-auto">
                            <div className="flex justify-end mb-10 pt-4">
                                <label className="flex items-center gap-3 cursor-pointer p-2 px-4 rounded-[4px] hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-200">
                                    <input
                                        type="checkbox"
                                        checked={isUnregistered}
                                        onChange={(e) => setIsUnregistered(e.target.checked)}
                                        className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                    />
                                    <span className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Customer is Unregistered</span>
                                </label>
                            </div>

                            {/* Conditional Content based on Registration Status */}
                            {isUnregistered ? (
                                <div className="space-y-8 animate-fadeIn bg-white border border-gray-200 rounded-[4px] p-8">
                                    {/* Unregistered Fields */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="relative">
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">GSTIN No.</label>
                                            <input
                                                type="text"
                                                value="NA"
                                                disabled
                                                className="w-full px-4 py-2 border border-gray-200 rounded-[4px] bg-gray-100 text-gray-500 cursor-not-allowed"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">Taxpayer Type</label>
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    value="Unregistered"
                                                    readOnly
                                                    className="w-full px-4 py-2 border border-green-200 rounded-[4px] bg-green-50 text-slate-700 font-medium ring-1 ring-green-200"
                                                />
                                                <span className="absolute right-3 top-2.5 text-xs text-indigo-600">Auto-set</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Branch Configuration */}
                                    <div>
                                        <div className="flex items-center gap-6 mb-6">
                                            <label className="text-sm font-semibold text-gray-700">Add Multiple Branches</label>
                                            <div className="flex bg-gray-100 p-1 rounded-[4px]">
                                                <button
                                                    onClick={() => setAddMultipleBranches(true)}
                                                    className={`px-4 py-1 text-xs font-medium rounded ${addMultipleBranches ? 'bg-indigo-600 text-white shadow-none border border-slate-200-none border border-slate-200' : 'text-gray-500 hover:text-gray-700'}`}
                                                >
                                                    Yes
                                                </button>
                                                <button
                                                    onClick={() => setAddMultipleBranches(false)}
                                                    className={`px-4 py-1 text-xs font-medium rounded ${!addMultipleBranches ? 'bg-white text-gray-800 shadow-none border border-slate-200-none border border-slate-200 ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-700'}`}
                                                >
                                                    No
                                                </button>
                                            </div>
                                        </div>

                                        {!addMultipleBranches ? (
                                            // Single Branch - Simple Address
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <div className="md:col-span-2">
                                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Reference Name</label>
                                                    <input
                                                        type="text"
                                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                        value={unregisteredBranches[0].referenceName || ''}
                                                        onChange={(e) => handleManualBranchChange(1, 'referenceName', e.target.value)}
                                                        placeholder="e.g. Main Office, Warehouse"
                                                    />
                                                </div>
                                                <div className="md:col-span-2">
                                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Address Line 1 <span className="text-red-500">*</span></label>
                                                    <input
                                                        type="text"
                                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                        value={unregisteredBranches[0].addressLine1}
                                                        onChange={(e) => handleManualBranchChange(1, 'addressLine1', e.target.value)}
                                                        placeholder="Enter address line 1"
                                                    />
                                                </div>
                                                <div className="md:col-span-2">
                                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Address Line 2</label>
                                                    <input
                                                        type="text"
                                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                        value={unregisteredBranches[0].addressLine2}
                                                        onChange={(e) => handleManualBranchChange(1, 'addressLine2', e.target.value)}
                                                        placeholder="Enter address line 2"
                                                    />
                                                </div>
                                                <div className="md:col-span-2">
                                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Address Line 3</label>
                                                    <input
                                                        type="text"
                                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                        value={unregisteredBranches[0].addressLine3}
                                                        onChange={(e) => handleManualBranchChange(1, 'addressLine3', e.target.value)}
                                                        placeholder="Enter address line 3"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Country</label>
                                                    <select
                                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
                                                        value={Country.getAllCountries().find(c => c.name === unregisteredBranches[0].country)?.isoCode || ''}
                                                        onChange={(e) => {
                                                            const countryCode = e.target.value;
                                                            const countryInfo = Country.getCountryByCode(countryCode);
                                                            handleManualBranchChange(1, 'country', countryInfo?.name || '');
                                                            handleManualBranchChange(1, 'state', '');
                                                            handleManualBranchChange(1, 'city', '');
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
                                                    <label className="block text-sm font-semibold text-gray-700 mb-2">State</label>
                                                    <select
                                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
                                                        value={getAvailableStates(Country.getAllCountries().find(c => c.name === unregisteredBranches[0].country)?.isoCode || '').find(s => s.name === unregisteredBranches[0].state)?.isoCode || ''}
                                                        onChange={(e) => {
                                                            const countryCode = Country.getAllCountries().find(c => c.name === unregisteredBranches[0].country)?.isoCode || '';
                                                            const stateCode = e.target.value;
                                                            const allStates = getAvailableStates(countryCode);
                                                            const stateInfo = allStates.find(s => s.isoCode === stateCode);
                                                            handleManualBranchChange(1, 'state', stateInfo?.name || '');
                                                            handleManualBranchChange(1, 'city', '');
                                                        }}
                                                        disabled={!unregisteredBranches[0].country}
                                                    >
                                                        <option value="">Select State</option>
                                                        {getAvailableStates(Country.getAllCountries().find(c => c.name === unregisteredBranches[0].country)?.isoCode || '').map((state) => (
                                                            <option key={state.isoCode} value={state.isoCode}>
                                                                {state.name}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-semibold text-gray-700 mb-2">City</label>
                                                    {(() => {
                                                        const countryCode = Country.getAllCountries().find(c => c.name === unregisteredBranches[0].country)?.isoCode || '';
                                                        const allStates = getAvailableStates(countryCode);
                                                        const stateCode = allStates.find(s => s.name === unregisteredBranches[0].state)?.isoCode || '';
                                                        const cities = (countryCode && stateCode) ? City.getCitiesOfState(countryCode, stateCode) : [];

                                                        return cities.length > 0 ? (
                                                            <select
                                                                className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
                                                                value={unregisteredBranches[0].city || ''}
                                                                onChange={(e) => handleManualBranchChange(1, 'city', e.target.value)}
                                                                disabled={!unregisteredBranches[0].state}
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
                                                                className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                                value={unregisteredBranches[0].city || ''}
                                                                onChange={(e) => handleManualBranchChange(1, 'city', e.target.value)}
                                                                placeholder="Enter city"
                                                                disabled={!unregisteredBranches[0].state}
                                                            />
                                                        );
                                                    })()}
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Pincode</label>
                                                    <input
                                                        type="text"
                                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                        value={unregisteredBranches[0].pincode || ''}
                                                        onChange={(e) => handleManualBranchChange(1, 'pincode', e.target.value)}
                                                        placeholder="Enter pincode"
                                                    />
                                                </div>
                                            </div>
                                        ) : (
                                            // Multiple Manual Branches
                                            <div className="space-y-4">
                                                {unregisteredBranches.map((branch, index) => {
                                                    const isExpanded = expandedBranches.includes(branch.id);
                                                    return (
                                                        <div key={branch.id} className="border border-gray-200 rounded-[4px] overflow-hidden bg-white shadow-none border border-slate-200-none border border-slate-200">
                                                            <div
                                                                className="flex items-center justify-between px-6 py-4 bg-gray-50 cursor-pointer hover:bg-gray-100"
                                                                onClick={() => toggleBranchExpand(branch.id)}
                                                            >
                                                                <div className="flex items-center gap-3">
                                                                    <span className="w-6 h-6 flex items-center justify-center bg-white border border-gray-200 rounded text-xs font-semibold text-gray-600">
                                                                        {index + 1}
                                                                    </span>
                                                                    <span className="font-semibold text-gray-800">
                                                                        {branch.referenceName || `Branch ${index + 1}`}
                                                                    </span>
                                                                </div>
                                                                <span className="text-gray-400">{isExpanded ? '▲' : '▼'}</span>
                                                            </div>

                                                            {isExpanded && (
                                                                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                                                                    <div className="md:col-span-2">
                                                                        <label className="block text-xs font-medium text-gray-500 mb-1">Reference Name</label>
                                                                        <input
                                                                            type="text"
                                                                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                                            value={branch.referenceName}
                                                                            onChange={(e) => handleManualBranchChange(branch.id, 'referenceName', e.target.value)}
                                                                            placeholder="e.g. Warehouse, Main Office"
                                                                        />
                                                                    </div>
                                                                    <div className="md:col-span-2">
                                                                        <label className="block text-xs font-medium text-gray-500 mb-1">Address Line 1</label>
                                                                        <input
                                                                            type="text"
                                                                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                                            value={branch.addressLine1 || ''}
                                                                            onChange={(e) => handleManualBranchChange(branch.id, 'addressLine1', e.target.value)}
                                                                            placeholder="Enter address line 1"
                                                                        />
                                                                    </div>
                                                                    <div className="md:col-span-2">
                                                                        <label className="block text-xs font-medium text-gray-500 mb-1">Address Line 2</label>
                                                                        <input
                                                                            type="text"
                                                                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                                            value={branch.addressLine2 || ''}
                                                                            onChange={(e) => handleManualBranchChange(branch.id, 'addressLine2', e.target.value)}
                                                                            placeholder="Enter address line 2"
                                                                        />
                                                                    </div>
                                                                    <div className="md:col-span-2">
                                                                        <label className="block text-xs font-medium text-gray-500 mb-1">Address Line 3</label>
                                                                        <input
                                                                            type="text"
                                                                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                                            value={branch.addressLine3 || ''}
                                                                            onChange={(e) => handleManualBranchChange(branch.id, 'addressLine3', e.target.value)}
                                                                            placeholder="Enter address line 3"
                                                                        />
                                                                    </div>
                                                                    <div>
                                                                        <label className="block text-xs font-medium text-gray-500 mb-1">Country</label>
                                                                        <select
                                                                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
                                                                            value={Country.getAllCountries().find(c => c.name === branch.country)?.isoCode || ''}
                                                                            onChange={(e) => {
                                                                                const countryCode = e.target.value;
                                                                                const countryInfo = Country.getCountryByCode(countryCode);
                                                                                handleManualBranchChange(branch.id, 'country', countryInfo?.name || '');
                                                                                handleManualBranchChange(branch.id, 'state', '');
                                                                                handleManualBranchChange(branch.id, 'city', '');
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
                                                                        <label className="block text-xs font-medium text-gray-500 mb-1">State</label>
                                                                        <select
                                                                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
                                                                            value={getAvailableStates(Country.getAllCountries().find(c => c.name === branch.country)?.isoCode || '').find(s => s.name === branch.state)?.isoCode || ''}
                                                                            onChange={(e) => {
                                                                                const countryCode = Country.getAllCountries().find(c => c.name === branch.country)?.isoCode || '';
                                                                                const stateCode = e.target.value;
                                                                                const allStates = getAvailableStates(countryCode);
                                                                                const stateInfo = allStates.find(s => s.isoCode === stateCode);
                                                                                handleManualBranchChange(branch.id, 'state', stateInfo?.name || '');
                                                                                handleManualBranchChange(branch.id, 'city', '');
                                                                            }}
                                                                            disabled={!branch.country}
                                                                        >
                                                                            <option value="">Select State</option>
                                                                            {getAvailableStates(Country.getAllCountries().find(c => c.name === branch.country)?.isoCode || '').map((state) => (
                                                                                <option key={state.isoCode} value={state.isoCode}>
                                                                                    {state.name}
                                                                                </option>
                                                                            ))}
                                                                        </select>
                                                                    </div>
                                                                    <div>
                                                                        <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
                                                                        {(() => {
                                                                            const countryCode = Country.getAllCountries().find(c => c.name === branch.country)?.isoCode || '';
                                                                            const allStates = getAvailableStates(countryCode);
                                                                            const stateCode = allStates.find(s => s.name === branch.state)?.isoCode || '';
                                                                            const cities = (countryCode && stateCode) ? City.getCitiesOfState(countryCode, stateCode) : [];

                                                                            return cities.length > 0 ? (
                                                                                <select
                                                                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
                                                                                    value={branch.city || ''}
                                                                                    onChange={(e) => handleManualBranchChange(branch.id, 'city', e.target.value)}
                                                                                    disabled={!branch.state}
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
                                                                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                                                    value={branch.city || ''}
                                                                                    onChange={(e) => handleManualBranchChange(branch.id, 'city', e.target.value)}
                                                                                    placeholder="Enter city"
                                                                                    disabled={!branch.state}
                                                                                />
                                                                            );
                                                                        })()}
                                                                    </div>
                                                                    <div>
                                                                        <label className="block text-xs font-medium text-gray-500 mb-1">Pincode</label>
                                                                        <input
                                                                            type="text"
                                                                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                                            value={branch.pincode || ''}
                                                                            onChange={(e) => handleManualBranchChange(branch.id, 'pincode', e.target.value)}
                                                                            placeholder="Enter pincode"
                                                                        />
                                                                    </div>
                                                                    <div>
                                                                        <label className="block text-xs font-medium text-gray-500 mb-1">Contact Person</label>
                                                                        <input
                                                                            type="text"
                                                                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                                            value={branch.contactPerson}
                                                                            onChange={(e) => handleManualBranchChange(branch.id, 'contactPerson', e.target.value)}
                                                                        />
                                                                    </div>
                                                                    <div>
                                                                        <label className="block text-xs font-medium text-gray-500 mb-1">Contact Number</label>
                                                                        <input
                                                                            type="text"
                                                                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                                            value={branch.contactNumber}
                                                                            onChange={(e) => handleManualBranchChange(branch.id, 'contactNumber', e.target.value)}
                                                                        />
                                                                    </div>
                                                                    <div className="md:col-span-2">
                                                                        <label className="block text-xs font-medium text-gray-500 mb-1">Email Address</label>
                                                                        <input
                                                                            type="email"
                                                                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                                            value={branch.email}
                                                                            onChange={(e) => handleManualBranchChange(branch.id, 'email', e.target.value)}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                                <button
                                                    onClick={handleAddManualBranch}
                                                    className="w-full py-2 border-2 border-dashed border-gray-300 rounded-[4px] text-gray-500 font-medium hover:border-indigo-500 hover:text-indigo-600 transition-colors flex items-center justify-center gap-2"
                                                >
                                                    <span>+</span> Add Another Branch
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                // Registered - Existing Flow
                                <div className="space-y-8">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">GSTIN No. <span className="text-red-500">*</span></label>
                                        <div className="flex gap-4 items-start">
                                            <div className="relative flex-1">

                                                <input
                                                    type="text"
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                    placeholder={selectedGSTINs.length > 0 ? `${selectedGSTINs.length} selected... Type to add more` : "Enter or Select GSTIN"}
                                                    value={gstInput}
                                                    onChange={(e) => setGstInput(e.target.value)}
                                                    onFocus={() => setShowGstDropdown(true)}
                                                    onBlur={() => setTimeout(() => setShowGstDropdown(false), 200)}
                                                />
                                                {/* Dropdown Simulation */}
                                                {showGstDropdown && (
                                                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 z-10 max-h-48 overflow-y-auto">
                                                        {mockGSTINs.map(gst => (
                                                            <div
                                                                key={gst}
                                                                className={`px-4 py-2 hover:bg-indigo-50 cursor-pointer flex items-center gap-3 text-sm ${selectedGSTINs.includes(gst) ? 'bg-indigo-50/50' : ''}`}
                                                                onMouseDown={(e) => {
                                                                    e.preventDefault(); // Prevent input blur
                                                                    handleGstSelect(gst);
                                                                }}
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedGSTINs.includes(gst)}
                                                                    readOnly
                                                                    className="w-4 h-4 text-indigo-600 rounded"
                                                                />
                                                                <span className="text-gray-700">{gst}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <button
                                                    onClick={handleFetchBranchDetails}
                                                    className="px-6 py-2 border border-gray-300 rounded-[4px] text-sm font-medium text-gray-600 hover:bg-gray-50 whitespace-nowrap"
                                                >
                                                    Fetch branch details
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Branch Details List */}
                                    {showBranchDetails && (
                                        <div className="space-y-4">
                                            {selectedGSTINs.map((gstin, index) => {
                                                const branch = registeredBranches.find(b => b.gstin === gstin) || { defaultRef: '', address: '', contactPerson: '', contactNumber: '', email: '' }; // Fallback
                                                const isExpanded = expandedBranches.includes(index + 1);

                                                return (
                                                    <div key={gstin} className="border border-indigo-100 rounded-[4px] overflow-hidden bg-white shadow-none border border-slate-200-none border border-slate-200">
                                                        {/* Header */}
                                                        <div
                                                            className="flex items-center justify-between px-6 py-4 bg-indigo-50/50 cursor-pointer hover:bg-indigo-50"
                                                            onClick={() => toggleBranchExpand(index + 1)}
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <span className="w-6 h-6 flex items-center justify-center bg-white border border-gray-200 rounded text-xs font-semibold text-gray-600">
                                                                    {index + 1}
                                                                </span>
                                                                <span className="font-semibold text-gray-800">
                                                                    {branch.defaultRef || 'New Branch'}
                                                                </span>
                                                            </div>
                                                            <span className="text-gray-400">
                                                                {isExpanded ? '▲' : '▼'}
                                                            </span>
                                                        </div>

                                                        {/* Expanded Content */}
                                                        {isExpanded && (
                                                            <div className="p-6 grid grid-cols-1 gap-6">
                                                                <div>
                                                                    <label className="block text-xs font-medium text-gray-500 mb-1">Address Line 1</label>
                                                                    <input
                                                                        type="text"
                                                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                                        value={branch.addressLine1 || ''}
                                                                        onChange={(e) => handleRegisteredBranchChange(gstin, 'addressLine1', e.target.value)}
                                                                        placeholder="Enter address line 1"
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-xs font-medium text-gray-500 mb-1">Address Line 2</label>
                                                                    <input
                                                                        type="text"
                                                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                                        value={branch.addressLine2 || ''}
                                                                        onChange={(e) => handleRegisteredBranchChange(gstin, 'addressLine2', e.target.value)}
                                                                        placeholder="Enter address line 2"
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-xs font-medium text-gray-500 mb-1">Address Line 3</label>
                                                                    <input
                                                                        type="text"
                                                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                                        value={branch.addressLine3 || ''}
                                                                        onChange={(e) => handleRegisteredBranchChange(gstin, 'addressLine3', e.target.value)}
                                                                        placeholder="Enter address line 3"
                                                                    />
                                                                </div>
                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                                    <div>
                                                                        <label className="block text-xs font-medium text-gray-500 mb-1">Country</label>
                                                                        <select
                                                                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
                                                                            value={Country.getAllCountries().find(c => c.name === branch.country)?.isoCode || ''}
                                                                            onChange={(e) => {
                                                                                const countryCode = e.target.value;
                                                                                const countryInfo = Country.getCountryByCode(countryCode);
                                                                                handleRegisteredBranchChange(gstin, 'country', countryInfo?.name || '');
                                                                                handleRegisteredBranchChange(gstin, 'state', '');
                                                                                handleRegisteredBranchChange(gstin, 'city', '');
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
                                                                        <label className="block text-xs font-medium text-gray-500 mb-1">State</label>
                                                                        <select
                                                                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
                                                                            value={getAvailableStates(Country.getAllCountries().find(c => c.name === branch.country)?.isoCode || '').find(s => s.name === branch.state)?.isoCode || ''}
                                                                            onChange={(e) => {
                                                                                const countryCode = Country.getAllCountries().find(c => c.name === branch.country)?.isoCode || '';
                                                                                const stateCode = e.target.value;
                                                                                const allStates = getAvailableStates(countryCode);
                                                                                const stateInfo = allStates.find(s => s.isoCode === stateCode);
                                                                                handleRegisteredBranchChange(gstin, 'state', stateInfo?.name || '');
                                                                                handleRegisteredBranchChange(gstin, 'city', '');
                                                                            }}
                                                                            disabled={!branch.country}
                                                                        >
                                                                            <option value="">Select State</option>
                                                                            {getAvailableStates(Country.getAllCountries().find(c => c.name === branch.country)?.isoCode || '').map((state) => (
                                                                                <option key={state.isoCode} value={state.isoCode}>
                                                                                    {state.name}
                                                                                </option>
                                                                            ))}
                                                                        </select>
                                                                    </div>
                                                                </div>
                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                                    <div>
                                                                        <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
                                                                        {(() => {
                                                                            const countryCode = Country.getAllCountries().find(c => c.name === branch.country)?.isoCode || '';
                                                                            const allStates = getAvailableStates(countryCode);
                                                                            const stateCode = allStates.find(s => s.name === branch.state)?.isoCode || '';
                                                                            const cities = (countryCode && stateCode) ? City.getCitiesOfState(countryCode, stateCode) : [];

                                                                            return cities.length > 0 ? (
                                                                                <select
                                                                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
                                                                                    value={branch.city || ''}
                                                                                    onChange={(e) => handleRegisteredBranchChange(gstin, 'city', e.target.value)}
                                                                                    disabled={!branch.state}
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
                                                                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                                                    value={branch.city || ''}
                                                                                    onChange={(e) => handleRegisteredBranchChange(gstin, 'city', e.target.value)}
                                                                                    placeholder="Enter city"
                                                                                    disabled={!branch.state}
                                                                                />
                                                                            );
                                                                        })()}
                                                                    </div>
                                                                    <div>
                                                                        <label className="block text-xs font-medium text-gray-500 mb-1">Pincode</label>
                                                                        <input
                                                                            type="text"
                                                                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                                            value={branch.pincode || ''}
                                                                            onChange={(e) => handleRegisteredBranchChange(gstin, 'pincode', e.target.value)}
                                                                            placeholder="Enter pincode"
                                                                        />
                                                                    </div>
                                                                </div>

                                                                <div>
                                                                    <label className="block text-xs font-medium text-gray-500 mb-1">Reference Name</label>
                                                                    <input
                                                                        type="text"
                                                                        value={branch.defaultRef}
                                                                        onChange={(e) => handleRegisteredBranchChange(gstin, 'defaultRef', e.target.value)}
                                                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                                    />
                                                                </div>

                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                                    <div>
                                                                        <label className="block text-xs font-medium text-gray-500 mb-1">Contact Person</label>
                                                                        <input
                                                                            type="text"
                                                                            value={branch.contactPerson || ''}
                                                                            onChange={(e) => handleRegisteredBranchChange(gstin, 'contactPerson', e.target.value)}
                                                                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                                        />
                                                                    </div>
                                                                    <div>
                                                                        <label className="block text-xs font-medium text-gray-500 mb-1">Contact Number</label>
                                                                        <input
                                                                            type="text"
                                                                            value={branch.contactNumber || ''}
                                                                            onChange={(e) => handleRegisteredBranchChange(gstin, 'contactNumber', e.target.value)}
                                                                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                                        />
                                                                    </div>
                                                                </div>

                                                                <div>
                                                                    <label className="block text-xs font-medium text-gray-500 mb-1">Email Address</label>
                                                                    <input
                                                                        type="email"
                                                                        value={branch.email || ''}
                                                                        onChange={(e) => handleRegisteredBranchChange(gstin, 'email', e.target.value)}
                                                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                                    />
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Footer Buttons for GST Tab */}
                            <div className="flex justify-center items-center gap-6 mt-16 border-t border-gray-100 pt-8">
                                <button
                                    onClick={handleBackButton}
                                    className="flex items-center gap-2 px-8 py-2.5 border border-gray-300 rounded-[4px] text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors shadow-none border border-slate-200-none border border-slate-200"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                    Back
                                </button>
                                <div className="flex gap-4">
                                    <button onClick={() => setView('list')} className="px-6 py-2 border border-gray-300 rounded-[4px] text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">Cancel</button>
                                    <button
                                        onClick={() => setActiveTab('Products/Services')}
                                        className="px-6 py-2 bg-indigo-600 text-white rounded-[4px] text-sm font-medium hover:bg-indigo-700 transition-colors"
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                }

                {/* Products/Services Content */}
                {
                    activeTab === 'Products/Services' && (
                        <div className="max-w-6xl mx-auto">
                            <div className="bg-white border border-gray-200 rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 overflow-hidden mb-6">
                                {/* Table Header */}
                                <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 1fr 1fr 80px 1fr 1fr', gap: '12px' }} className="px-6 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-700 uppercase tracking-wider">
                                    <div>No</div>
                                    <div>Item Code</div>
                                    <div>Item Name</div>
                                    <div>HSN/SAC Code</div>
                                    <div>UOM</div>
                                    <div>Customer Item Code</div>
                                    <div>Customer Item Name</div>
                                </div>

                                {/* Table Body */}
                                <div className="divide-y divide-gray-100">
                                    {productRows.map((row, index) => (
                                        <div key={row.id} className="px-6 py-4 hover:bg-gray-50/50 transition-colors border-b border-gray-100">
                                            {/* Main grid row */}
                                            <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 1fr 1fr 80px 1fr 1fr', gap: '12px', alignItems: 'center' }}>
                                                <div className="text-sm text-gray-500 font-medium">{index + 1}</div>
                                                <div>
                                                    <select
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
                                                        value={row.itemCode}
                                                        onChange={(e) => handleProductRowChange(row.id, 'itemCode', e.target.value)}
                                                    >
                                                        <option value="">Select Item</option>
                                                        {stockItems.map(item => (
                                                            <option key={item.code} value={item.code}>{item.code} - {item.name}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <select
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
                                                        value={row.itemName}
                                                        onChange={(e) => handleProductRowChange(row.id, 'itemName', e.target.value)}
                                                    >
                                                        <option value="">Select Item Name</option>
                                                        {stockItems.map(item => (
                                                            <option key={item.name} value={item.name}>{item.name}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                {/* HSN/SAC Code */}
                                                <div>
                                                    <input
                                                        type="text"
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                        placeholder="HSN/SAC"
                                                        value={(row as any).hsnCode || ''}
                                                        onChange={(e) => handleProductRowChange(row.id, 'hsnCode', e.target.value)}
                                                    />
                                                </div>
                                                {/* UOM */}
                                                <div>
                                                    {(row as any).uom ? (
                                                        <span className="w-full px-3 py-2 border border-gray-200 rounded-[4px] text-sm bg-gray-50 text-gray-700 font-medium block">
                                                            {(row as any).uom}
                                                        </span>
                                                    ) : (
                                                        <select
                                                            className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
                                                            value={(row as any).uom || ''}
                                                            onChange={(e) => handleProductRowChange(row.id, 'uom', e.target.value)}
                                                        >
                                                            <option value="">Select</option>
                                                            {units.map(unit => (
                                                                <option key={unit.id} value={unit.symbol}>{unit.name} ({unit.symbol})</option>
                                                            ))}
                                                        </select>
                                                    )}
                                                </div>
                                                {/* Customer Item Code */}
                                                <div>
                                                    <input
                                                        type="text"
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                        placeholder="Optional"
                                                        value={row.custItemCode}
                                                        onChange={(e) => handleProductRowChange(row.id, 'custItemCode', e.target.value)}
                                                    />
                                                </div>
                                                {/* Customer Item Name */}
                                                <div>
                                                    <input
                                                        type="text"
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                        placeholder="Optional"
                                                        value={row.custItemName}
                                                        onChange={(e) => handleProductRowChange(row.id, 'custItemName', e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                            {/* Packing Notes — full width below the grid row */}
                                            <div className="mt-2 pl-[52px]">
                                                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Packing Notes</label>
                                                <input
                                                    type="text"
                                                    className="w-full px-3 py-1.5 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                    placeholder="Enter packing notes for this item..."
                                                    value={row.packingNotes || ''}
                                                    onChange={(e) => handleProductRowChange(row.id, 'packingNotes', e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Add Row Button */}
                            <div className="mb-12">
                                <button
                                    onClick={handleAddProductRow}
                                    className="w-10 h-10 flex items-center justify-center rounded-[4px] bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors shadow-none border border-slate-200-none border border-slate-200 border border-indigo-200"
                                >
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="12" y1="5" x2="12" y2="19"></line>
                                        <line x1="5" y1="12" x2="19" y2="12"></line>
                                    </svg>
                                </button>
                            </div>

                            {/* Footer Buttons */}
                            <div className="flex justify-between items-center gap-4 border-t border-gray-200 pt-6">
                                <button
                                    onClick={handleBackButton}
                                    className="flex items-center gap-2 px-6 py-2 border border-gray-300 rounded-[4px] text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                    Back
                                </button>
                                <div className="flex gap-4">
                                    <button onClick={() => setView('list')} className="px-6 py-2 border border-gray-300 rounded-[4px] text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">Cancel</button>
                                    <button
                                        onClick={() => setActiveTab('TDS & Other Statutory Details')}
                                        className="px-6 py-2 bg-indigo-600 text-white rounded-[4px] text-sm font-medium hover:bg-indigo-700 transition-colors"
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                }

                {/* TDS & Other Statutory Details Content */}
                {
                    activeTab === 'TDS & Other Statutory Details' && (
                        <div className="max-w-6xl mx-auto space-y-10">

                            {/* SECTION 1: STATUTORY INFORMATION */}
                            <div>
                                <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-6">Statutory Information</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">MSME (Udyam) Registration Number</label>
                                        <div className="relative flex items-center">
                                            <input
                                                type="text"
                                                className="w-full pl-4 pr-12 py-2.5 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm placeholder-gray-400"
                                                placeholder="UDYAM-XX-00-000000"
                                                value={statutoryDetails.msmeNo}
                                                onChange={(e) => setStatutoryDetails({ ...statutoryDetails, msmeNo: e.target.value })}
                                            />
                                            <button className="absolute right-2 p-1.5 text-gray-400 hover:text-indigo-600 rounded-[4px] hover:bg-gray-100 transition-colors">
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">FSSAI License Number</label>
                                        <div className="relative flex items-center">
                                            <input
                                                type="text"
                                                className="w-full pl-4 pr-12 py-2.5 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm placeholder-gray-400"
                                                placeholder="14-digit License Number"
                                                value={statutoryDetails.fssaiNo}
                                                onChange={(e) => setStatutoryDetails({ ...statutoryDetails, fssaiNo: e.target.value })}
                                            />
                                            <button className="absolute right-2 p-1.5 text-gray-400 hover:text-indigo-600 rounded-[4px] hover:bg-gray-100 transition-colors">
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* SECTION 2: IMPORT / EXPORT & COMPLIANCE */}
                            <div>
                                <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-6">Import / Export & Compliance</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">Import Export Code (IEC)</label>
                                        <div className="relative flex items-center">
                                            <input
                                                type="text"
                                                className="w-full pl-4 pr-12 py-2.5 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm placeholder-gray-400"
                                                placeholder="10-DIGIT IEC CODE"
                                                value={statutoryDetails.iecCode}
                                                onChange={(e) => setStatutoryDetails({ ...statutoryDetails, iecCode: e.target.value })}
                                            />
                                            <button className="absolute right-2 p-1.5 text-gray-400 hover:text-indigo-600 rounded-[4px] hover:bg-gray-100 transition-colors">
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                                            </button>
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="md:col-span-1">
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">EOU Status</label>
                                            <select
                                                className="w-full px-4 py-2.5 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
                                                value={statutoryDetails.eouStatus}
                                                onChange={(e) => setStatutoryDetails({ ...statutoryDetails, eouStatus: e.target.value })}
                                            >
                                                <option>Export Oriented Unit (EOU)</option>
                                                <option>SEZ Unit</option>
                                                <option>STP Unit</option>
                                                <option>None</option>
                                            </select>
                                        </div>

                                        {/* Conditional Uploads for EOU/SEZ/STP */}
                                        {statutoryDetails.eouStatus !== 'None' && (
                                            <div className="flex gap-8 pl-1">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-sm text-gray-500">Letter of Permission</span>
                                                    <button className="p-1.5 border border-gray-200 rounded-[4px] text-gray-400 hover:text-indigo-600 hover:border-indigo-200 hover:bg-gray-50 transition-colors">
                                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                                                    </button>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-sm text-gray-500">Green Card</span>
                                                    <button className="p-1.5 border border-gray-200 rounded-[4px] text-gray-400 hover:text-indigo-600 hover:border-indigo-200 hover:bg-gray-50 transition-colors">
                                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>


                            {/* SECTION 3: TAX CONFIGURATION */}
                            <div>
                                <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-4">Tax Configuration</h4>

                                {/* Toggle: TDS / TCS / NONE */}
                                <div className="mb-6">
                                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Tax Deducted / Collected at Source</p>
                                    <div className="inline-flex rounded-[4px] border border-gray-300 overflow-hidden">
                                        {(['TDS', 'TCS', 'NONE'] as const).map((type) => (
                                            <button
                                                key={type}
                                                type="button"
                                                onClick={() => setStatutoryDetails({
                                                    ...statutoryDetails,
                                                    taxType: type,
                                                    // reset fields when switching
                                                    tcsSections: type !== 'TCS' ? [] : statutoryDetails.tcsSections,
                                                    tcsEnabled: type !== 'TCS' ? false : statutoryDetails.tcsEnabled,
                                                    tdsSections: type !== 'TDS' ? [] : statutoryDetails.tdsSections,
                                                    tdsEnabled: type !== 'TDS' ? false : statutoryDetails.tdsEnabled,
                                                })}
                                                className={`px-6 py-2 text-sm font-semibold transition-colors border-r border-gray-300 last:border-r-0 ${statutoryDetails.taxType === type
                                                    ? 'bg-gray-700 text-white'
                                                    : 'bg-white text-gray-600 hover:bg-gray-50'
                                                    }`}
                                            >
                                                {type}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* TCS Card */}
                                {statutoryDetails.taxType === 'TCS' && (
                                    <div className="border border-gray-200 rounded-[4px] p-6 bg-gray-50/30 max-w-xl">
                                        <div className="flex justify-between items-start mb-4">
                                            <h5 className="font-semibold text-gray-800">TCS Configuration</h5>
                                            <span className="text-gray-400" title="Information">
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                                            </span>
                                        </div>
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-xs font-medium text-gray-500 mb-1">Applicable Section</label>
                                                <MultiSelectDropdown
                                                    options={tcsSections.map((tcs) => ({
                                                        value: `${tcs.section}|${tcs.name}`,
                                                        label: `${tcs.section} - ${tcs.name} @ ${tcs.rate}`
                                                    }))}
                                                    selectedValues={statutoryDetails.tcsSections}
                                                    onChange={(values) => {
                                                        setStatutoryDetails({ ...statutoryDetails, tcsSections: values });
                                                        if (values.length > 0) {
                                                            const [section, name] = values[0].split('|');
                                                            const tcsInfo = tcsSections.find(t => t.section === section && t.name === name);
                                                            if (tcsInfo) { setSelectedTcsInfo(tcsInfo); setShowTcsInfo(true); }
                                                        } else {
                                                            setShowTcsInfo(false);
                                                            setSelectedTcsInfo(null);
                                                        }
                                                    }}
                                                    placeholder="Select TCS Sections"
                                                />
                                            </div>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                                    checked={statutoryDetails.tcsEnabled}
                                                    onChange={(e) => setStatutoryDetails({ ...statutoryDetails, tcsEnabled: e.target.checked })}
                                                />
                                                <span className="text-sm text-gray-700">Enable automatic TCS posting</span>
                                            </label>
                                        </div>
                                    </div>
                                )}

                                {/* TDS Card */}
                                {statutoryDetails.taxType === 'TDS' && (
                                    <div className="border border-gray-200 rounded-[4px] p-6 bg-gray-50/30 max-w-xl">
                                        <div className="flex justify-between items-start mb-4">
                                            <h5 className="font-semibold text-gray-800">TDS Configuration</h5>
                                            <span className="text-gray-400" title="Information">
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                                            </span>
                                        </div>
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-xs font-medium text-gray-500 mb-1">Receivable Section</label>
                                                <MultiSelectDropdown
                                                    options={tdsSections.map((tds) => ({
                                                        value: `${tds.section}|${tds.name}`,
                                                        label: `${tds.section} - ${tds.name} @ ${tds.rate}`
                                                    }))}
                                                    selectedValues={statutoryDetails.tdsSections}
                                                    onChange={(values) => {
                                                        setStatutoryDetails({ ...statutoryDetails, tdsSections: values });
                                                        if (values.length > 0) {
                                                            const [section, name] = values[0].split('|');
                                                            const tdsInfo = tdsSections.find(t => t.section === section && t.name === name);
                                                            if (tdsInfo) { setSelectedTdsInfo(tdsInfo); setShowTdsInfo(true); }
                                                        } else {
                                                            setShowTdsInfo(false);
                                                            setSelectedTdsInfo(null);
                                                        }
                                                    }}
                                                    placeholder="Select TDS Sections"
                                                />
                                            </div>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                                    checked={statutoryDetails.tdsEnabled}
                                                    onChange={(e) => setStatutoryDetails({ ...statutoryDetails, tdsEnabled: e.target.checked })}
                                                />
                                                <span className="text-sm text-gray-700">Enable automatic TDS posting</span>
                                            </label>
                                        </div>
                                    </div>
                                )}

                                {/* NONE state */}
                                {statutoryDetails.taxType === 'NONE' && (
                                    <p className="text-sm text-gray-400 italic">No TDS / TCS applicable for this customer.</p>
                                )}
                            </div>

                            {/* Footer Buttons */}
                            <div className="flex justify-between items-center gap-4 border-t border-gray-200 pt-6">
                                <button
                                    onClick={handleBackButton}
                                    className="flex items-center gap-2 px-6 py-2 border border-gray-300 rounded-[4px] text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                    Back
                                </button>
                                <div className="flex gap-4">
                                    <button onClick={() => setView('list')} className="px-6 py-2 border border-gray-300 rounded-[4px] text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">Cancel</button>
                                    <button
                                        onClick={() => setActiveTab('Banking Info')}
                                        className="px-6 py-2 bg-indigo-600 text-white rounded-[4px] text-sm font-medium hover:bg-indigo-700 transition-colors"
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                }


                {/* Banking Info Content */}
                {
                    activeTab === 'Banking Info' && (
                        <div className="max-w-6xl mx-auto space-y-8">
                            {/* Info Banner */}
                            <div className="bg-yellow-50 border border-yellow-200 rounded-[4px] p-4 flex items-start gap-3">
                                <span className="text-yellow-500 mt-0.5">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                                </span>
                                <p className="text-sm text-yellow-800">
                                    <span className="font-semibold">Note:</span> Banking information is optional and primarily used for Sales Returns or refunds.
                                </p>
                            </div>

                            {/* Bank Accounts Section */}
                            {bankAccounts.length === 0 ? (
                                // Empty State
                                <div className="border-2 border-dashed border-gray-200 rounded-[4px] p-12 flex flex-col items-center justify-center text-center">
                                    <p className="text-gray-500 mb-6">No bank accounts added yet</p>
                                    <button
                                        onClick={handleAddBank}
                                        className="px-6 py-2.5 bg-indigo-600 text-white rounded-[4px] text-sm font-medium hover:bg-indigo-700 transition-colors shadow-none border border-slate-200-none border border-slate-200"
                                    >
                                        + Add Bank Account
                                    </button>
                                </div>
                            ) : (
                                // Detailed Card List
                                <div className="space-y-6">
                                    {bankAccounts.map((account, index) => (
                                        <div key={account.id} className="border border-gray-200 rounded-[4px] p-6 bg-white shadow-none border border-slate-200-none border border-slate-200 hover:shadow-none border border-slate-200-none border border-slate-200 transition-shadow-none border border-slate-200">
                                            <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-2">
                                                <h4 className="font-semibold text-gray-800">Bank Account {index + 1}</h4>
                                                <button
                                                    onClick={() => handleRemoveBank(account.id)}
                                                    className="text-gray-400 hover:text-red-500 transition-colors"
                                                    title="Remove Bank Account"
                                                >
                                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2v2"></path></svg>
                                                </button>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                                {/* Column 1 */}
                                                <div className="space-y-4">
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-500 mb-1">Bank Account Number</label>
                                                        <input
                                                            type="text"
                                                            placeholder="Enter account number"
                                                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                            value={account.accountNumber}
                                                            onChange={(e) => handleBankChange(account.id, 'accountNumber', e.target.value)}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-500 mb-1">IFSC Code / Routing Number</label>
                                                        <input
                                                            type="text"
                                                            placeholder="ABCD0123456"
                                                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                            value={account.ifscCode}
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                handleBankChange(account.id, 'ifscCode', val);

                                                                // Clear fields if input is emptied
                                                                if (!val.trim()) {
                                                                    handleBankChange(account.id, 'bankName', '');
                                                                    handleBankChange(account.id, 'branchName', '');
                                                                }

                                                                if (val.length === 11) {
                                                                    fetchBankDetails(account.id, val);
                                                                }
                                                            }}
                                                            onBlur={(e) => fetchBankDetails(account.id, e.target.value)}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-500 mb-1">SWIFT Code</label>
                                                        <input
                                                            type="text"
                                                            placeholder="ENTER SWIFT CODE"
                                                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                            value={account.swiftCode}
                                                            onChange={(e) => handleBankChange(account.id, 'swiftCode', e.target.value)}
                                                        />
                                                    </div>
                                                </div>

                                                {/* Column 2 */}
                                                <div className="space-y-4">
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-500 mb-1">Bank Name</label>
                                                        <input
                                                            type="text"
                                                            placeholder="Enter bank name"
                                                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                            value={account.bankName}
                                                            onChange={(e) => handleBankChange(account.id, 'bankName', e.target.value)}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-500 mb-1">Branch Name</label>
                                                        <input
                                                            type="text"
                                                            placeholder="Enter branch name"
                                                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                            value={account.branchName}
                                                            onChange={(e) => handleBankChange(account.id, 'branchName', e.target.value)}
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Associate to a Customer Branch - Multi-select Dropdown with Display Field */}
                                            <div className="mb-2">
                                                <label className="block text-xs font-medium text-gray-500 mb-1">Associate to a Customer Branch</label>
                                                <div className="grid grid-cols-2 gap-4">
                                                    {/* Multi-select Dropdown */}
                                                    <div className="relative branch-dropdown-container">
                                                        <button
                                                            type="button"
                                                            onClick={() => setOpenBranchDropdown(openBranchDropdown === account.id ? null : account.id)}
                                                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] bg-white text-sm text-left hover:border-indigo-400 transition-colors flex items-center justify-between"
                                                        >
                                                            <span className="text-gray-700">
                                                                {(account.associatedBranches || []).length > 0
                                                                    ? `${(account.associatedBranches || []).length} branch(es) selected`
                                                                    : 'Select branches'}
                                                            </span>
                                                            <svg
                                                                className={`w-4 h-4 text-gray-400 transition-transform ${openBranchDropdown === account.id ? 'rotate-180' : ''}`}
                                                                fill="none"
                                                                stroke="currentColor"
                                                                viewBox="0 0 24 24"
                                                            >
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                            </svg>
                                                        </button>

                                                        {/* Dropdown Menu */}
                                                        {openBranchDropdown === account.id && (
                                                            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-[4px] shadow-none border border-slate-200-none border border-slate-200">
                                                                <div className="p-2 space-y-1">
                                                                    {(isUnregistered
                                                                        ? unregisteredBranches.map(b => b.referenceName)
                                                                        : registeredBranches.map(b => b.defaultRef)
                                                                    ).filter(Boolean).map((branch) => (
                                                                        <label key={branch} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-2 py-1.5 rounded">
                                                                            <input
                                                                                type="checkbox"
                                                                                className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                                                                checked={(account.associatedBranches || []).includes(branch)}
                                                                                onChange={(e) => {
                                                                                    const currentBranches = account.associatedBranches || [];
                                                                                    const newBranches = e.target.checked
                                                                                        ? [...currentBranches, branch]
                                                                                        : currentBranches.filter(b => b !== branch);
                                                                                    handleBankChange(account.id, 'associatedBranches', newBranches);
                                                                                }}
                                                                            />
                                                                            <span className="text-sm text-gray-700">{branch}</span>
                                                                        </label>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                    {/* Display Field */}
                                                    <div>
                                                        <div className="w-full px-4 py-2 border border-gray-300 rounded-[4px] bg-gray-50 text-sm text-gray-700 min-h-[38px]">
                                                            {(account.associatedBranches || []).length > 0 ? (
                                                                <div className="space-y-1">
                                                                    {(account.associatedBranches || []).map((branch, idx) => (
                                                                        <div key={idx} className="flex items-center justify-between group hover:bg-gray-100 px-2 py-1 rounded transition-colors">
                                                                            <span className="text-sm">{branch}</span>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    const newBranches = (account.associatedBranches || []).filter(b => b !== branch);
                                                                                    handleBankChange(account.id, 'associatedBranches', newBranches);
                                                                                }}
                                                                                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all ml-2"
                                                                                title="Remove branch"
                                                                            >
                                                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                                                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                                                                </svg>
                                                                            </button>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            ) : (
                                                                <span className="text-gray-400">Selected branches will appear here</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}

                                    {/* Add Another Bank Button */}
                                    <div>
                                        <button
                                            onClick={handleAddBank}
                                            className="px-4 py-2 border border-indigo-200 text-indigo-600 rounded-[4px] text-sm font-medium hover:bg-indigo-50 transition-colors flex items-center gap-2"
                                        >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                            Add Another Bank
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Footer Buttons */}
                            <div className="flex justify-between items-center gap-4 border-t border-gray-200 pt-6">
                                <button
                                    onClick={handleBackButton}
                                    className="flex items-center gap-2 px-6 py-2 border border-gray-300 rounded-[4px] text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                    Back
                                </button>
                                <div className="flex gap-4">
                                    <button onClick={() => setView('list')} className="px-6 py-2 border border-gray-300 rounded-[4px] text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">Cancel</button>
                                    <button
                                        onClick={() => setActiveTab('Terms & Conditions')}
                                        className="px-6 py-2 bg-indigo-600 text-white rounded-[4px] text-sm font-medium hover:bg-indigo-700 transition-colors"
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                }

                {/* Terms & Conditions Content */}
                {
                    activeTab === 'Terms & Conditions' && (
                        <div className="max-w-6xl mx-auto space-y-6">

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Credit Period</label>
                                <input
                                    type="number"
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm placeholder-gray-400"
                                    placeholder="e.g., 30"
                                    value={termsDetails.creditPeriod}
                                    onChange={(e) => setTermsDetails({ ...termsDetails, creditPeriod: e.target.value })}
                                />

                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Credit Terms</label>
                                <textarea
                                    rows={3}
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm placeholder-gray-400"
                                    placeholder="Enter credit terms details"
                                    value={termsDetails.creditTerms}
                                    onChange={(e) => setTermsDetails({ ...termsDetails, creditTerms: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Penalty Terms</label>
                                <textarea
                                    rows={3}
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm placeholder-gray-400"
                                    placeholder="Enter penalty terms"
                                    value={termsDetails.penaltyTerms}
                                    onChange={(e) => setTermsDetails({ ...termsDetails, penaltyTerms: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Delivery Terms</label>
                                <textarea
                                    rows={3}
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm placeholder-gray-400"
                                    placeholder="Enter delivery terms"
                                    value={termsDetails.deliveryTerms}
                                    onChange={(e) => setTermsDetails({ ...termsDetails, deliveryTerms: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Warranty / Guarantee Details</label>
                                <textarea
                                    rows={3}
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm placeholder-gray-400"
                                    placeholder="Enter warranty or guarantee details"
                                    value={termsDetails.warrantyDetails}
                                    onChange={(e) => setTermsDetails({ ...termsDetails, warrantyDetails: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Force Majeure</label>
                                <textarea
                                    rows={3}
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm placeholder-gray-400"
                                    placeholder="Enter force majeure terms"
                                    value={termsDetails.forceMajeure}
                                    onChange={(e) => setTermsDetails({ ...termsDetails, forceMajeure: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Dispute Redressal Terms</label>
                                <textarea
                                    rows={3}
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm placeholder-gray-400"
                                    placeholder="Enter dispute redressal terms"
                                    value={termsDetails.disputeTerms}
                                    onChange={(e) => setTermsDetails({ ...termsDetails, disputeTerms: e.target.value })}
                                />
                            </div>

                            {/* Footer Buttons */}
                            <div className="flex justify-between items-center gap-4 border-t border-gray-200 pt-6 mt-8">
                                <button
                                    onClick={handleBackButton}
                                    className="flex items-center gap-2 px-6 py-2 border border-gray-300 rounded-[4px] text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                    Back
                                </button>
                                <div className="flex gap-4">
                                    <button onClick={() => setView('list')} className="px-6 py-2 border border-gray-300 rounded-[4px] text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">Cancel</button>
                                    <button
                                        onClick={async () => {
                                            const success = await handleSaveCustomer({ exit: true });
                                            if (success) {
                                                // View change is handled inside handleSaveCustomer when exit: true
                                            }
                                        }}
                                        className="px-6 py-2 bg-indigo-600 text-white rounded-[4px] text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2"
                                    >
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                                            <polyline points="22 4 12 14.01 9 11.01"></polyline>
                                        </svg>
                                        {createdCustomerId ? 'Update Customer' : 'Onboard Customer'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                }

                {
                    activeTab !== 'Basic Details' && activeTab !== 'GST Details' && activeTab !== 'Products/Services' && activeTab !== 'TDS & Other Statutory Details' && activeTab !== 'Banking Info' && activeTab !== 'Terms & Conditions' && (
                        <div className="py-12 text-center text-gray-500 italic">
                            {activeTab} content coming soon.
                        </div>
                    )
                }
            </div >
        );
    }

    return (
        <div className="p-8">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-gray-900">Customer Management</h3>
                <div className="flex gap-3">

                    <div className="relative" ref={excelDropdownRef}>
                        <button
                            onClick={() => setIsExcelDropdownOpen(!isExcelDropdownOpen)}
                            className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-[4px] hover:bg-gray-50 transition-colors flex items-center gap-2 cursor-pointer"
                        >
                            <Icon name="file-spreadsheet" className="w-4 h-4" /> EXCEL
                        </button>
                        {isExcelDropdownOpen && (
                            <div className="absolute right-0 z-[100] mt-2 w-52 bg-white border border-gray-200 rounded-[4px] shadow-lg py-1">
                                <button
                                    onClick={() => { handleCustomerExcelDownload('template'); setIsExcelDropdownOpen(false); }}
                                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                >
                                    <Icon name="file-spreadsheet" className="w-4 h-4" /> Download Template
                                </button>
                                <button
                                    onClick={() => { handleCustomerExcelDownload('export'); setIsExcelDropdownOpen(false); }}
                                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                >
                                    <Icon name="download" className="w-4 h-4" /> Export All Data
                                </button>
                                <div className="border-t border-gray-100 my-1"></div>
                                <button
                                    onClick={() => {
                                        setImportSummary(null);
                                        setIsImportModalOpen(true);
                                        setIsExcelDropdownOpen(false);
                                    }}
                                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                >
                                    <Icon name="upload" className="w-4 h-4" /> Upload Excel
                                </button>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={() => {
                            // Generate a new customer code when creating a new customer
                            setCustomerFormData({
                                customer_name: '',
                                customer_code: `CUST-${Date.now().toString().slice(-6)}`,
                                customer_category: '',
                                pan_number: '',
                                contact_person: '',
                                email_address: '',
                                contact_number: '',
                                billing_currency: '',
                                gst_tds_applicable: false
                            });
                            setView('create');
                        }}
                        className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-[4px] hover:bg-indigo-700 transition-colors flex items-center gap-2"
                    >
                        <span>+</span> Create New Customer
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-4">
                <div className="md:col-span-8">
                    <input
                        type="text"
                        placeholder="Search by customer name or code..."
                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="md:col-span-2">
                    <select
                        className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm text-gray-700"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                    >
                        <option>All Status</option>
                        <option>Live</option>
                        <option>Dormant</option>
                    </select>
                </div>
                <div className="md:col-span-2">
                    <select
                        className="w-full px-3 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm text-gray-700"
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
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

            <p className="text-sm text-gray-500 mb-4">Showing {filteredCustomers.length} of {customers.length} customers</p>

            {/* Table */}
            <div className="bg-white border border-gray-200 rounded-[4px] overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CATEGORY</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CUSTOMER CODE</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CUSTOMER NAME</th>
                            <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">STATUS</th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">ACTIONS</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {filteredCustomers.map((customer) => (
                            <tr key={customer.id} className="hover:bg-gray-50 transition-colors">
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    {(() => {
                                        // Try to resolve category name
                                        let categoryName = 'N/A';
                                        if (customer.customer_category_name) {
                                            categoryName = customer.customer_category_name;
                                        } else if (customer.category) {
                                            categoryName = customer.category; // fallback
                                        }

                                        // If we have an ID and categories are loaded, try to find the full path
                                        if (categories.length > 0 && customer.customer_category) {
                                            const cat = categories.find(c => c.id === customer.customer_category);
                                            if (cat) {
                                                categoryName = cat.full_path || cat.category;
                                            }
                                        }
                                        return categoryName;
                                    })()}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                    {customer.customer_code || customer.code}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                                    {customer.customer_name || customer.name}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-center">
                                    <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-[4px] ${(customer.status || 'Live') === 'Live'
                                        ? 'bg-green-100 text-green-800'
                                        : 'bg-gray-100 text-gray-600'
                                        }`}>
                                        {customer.status || 'Live'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                                    <div className="flex items-center justify-end gap-3">
                                        <button
                                            className="text-indigo-600 hover:text-indigo-900 transition-colors"
                                            title="View"
                                            onClick={() => handleViewCustomer(customer)}
                                        >
                                            <Eye className="w-5 h-5" />
                                        </button>
                                        <button
                                            className="text-blue-600 hover:text-blue-900 transition-colors"
                                            title="Edit"
                                            onClick={() => handleEditCustomerById(customer)}
                                        >
                                            <Pencil className="w-5 h-5" />
                                        </button>
                                        <button
                                            className="text-red-600 hover:text-red-900 transition-colors"
                                            title="Delete"
                                            onClick={() => handleDeleteCustomer(customer.id)}
                                        >
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filteredCustomers.length === 0 && (
                    <div className="p-8 text-center text-gray-500 text-sm">No customers found.</div>
                )}
            </div>

            {/* View Modal */}
            {viewCustomer && (
                <CustomerViewModal
                    customer={viewCustomer}
                    onClose={() => setViewCustomer(null)}
                />
            )}

            {/* Import Feedback Modal */}
            <BulkImportFeedbackModal
                isOpen={isImportModalOpen}
                onClose={() => setIsImportModalOpen(false)}
                summary={importSummary}
                title="Customer Bulk Import"
                onEditImported={handleEditImportedCustomer}
                onUpload={handleCustomerExcelUploadFromModal}
                isProcessing={isImporting}
                dropdownOptions={{
                    'Category': categories.map(c => ({ label: c.category, value: c.category })),
                    'Billing Currency': [
                        { label: 'Indian Rupee (INR)', value: 'INR' },
                        { label: 'US Dollar (USD)', value: 'USD' },
                        { label: 'Euro (EUR)', value: 'EUR' },
                        { label: 'British Pound (GBP)', value: 'GBP' }
                    ],
                    'State': getAvailableStates('IN').map(s => ({ label: s.name, value: s.name })),
                    'Country': [
                        { label: 'India', value: 'India' },
                        { label: 'United States', value: 'United States' },
                        { label: 'United Kingdom', value: 'United Kingdom' }
                    ],
                    'UOM': units.map(u => ({ label: u.symbol || u.name, value: u.symbol || u.name })),
                    'Item Code': stockItems.map(i => ({ label: i.code, value: i.code, full: i })),
                    'Item Name': stockItems.map(i => ({ label: i.name, value: i.name, full: i })),
                    'TDS Section': Object.keys(TDS_RATES_MASTER).map(s => ({ label: s, value: s })),
                    'TCS Section': Object.keys(TCS_RATES_MASTER).map(s => ({ label: s, value: s }))
                }}
            />
        </div>
    );
};

const SalesOrderContent: React.FC = () => {
    const [subTab, setSubTab] = useState<'Sales Quotation' | 'Sales Order'>('Sales Quotation');

    // Sales Quotation State
    const [sqForm, setSqForm] = useState({
        name: '',
        category: '',
        prefix: 'SQ/',
        suffix: '/24-25',
        autoYear: true,
        digits: 4
    });
    const [sqList, setSqList] = useState<any[]>([]);
    const [sqLoading, setSqLoading] = useState(false);

    // Sales Order State
    const [soForm, setSoForm] = useState({
        name: '',
        category: '',
        prefix: 'SO/',
        suffix: '/24-25',
        autoYear: true,
        digits: 4
    });
    const [soList, setSoList] = useState<any[]>([]);
    const [soLoading, setSoLoading] = useState(false);

    // Editing State
    const [editingId, setEditingId] = useState<number | null>(null);

    const isSQ = subTab === 'Sales Quotation';
    const form = isSQ ? sqForm : soForm;
    const setForm = isSQ ? setSqForm : setSoForm;
    const list = isSQ ? sqList : soList;
    const loading = isSQ ? sqLoading : soLoading;

    // Fetch Sales Quotation Series from API
    const fetchSalesQuotationSeries = async () => {
        try {
            setSqLoading(true);
            const response = await httpClient.get<any[]>('/api/customerportal/sales-quotation-series/');
            setSqList(response || []);
        } catch (error) {
            handleApiError(error, 'Fetch Sales Quotation Series');
            setSqList([]);
        } finally {
            setSqLoading(false);
        }
    };

    // Fetch Sales Order Series from API
    const fetchSalesOrderSeries = async () => {
        try {
            setSoLoading(true);
            const response = await httpClient.get<any[]>('/api/customerportal/sales-order-series/');
            setSoList(response || []);
        } catch (error) {
            handleApiError(error, 'Fetch Sales Order Series');
            setSoList([]);
        } finally {
            setSoLoading(false);
        }
    };

    // Load data when component mounts or tab changes
    useEffect(() => {
        if (subTab === 'Sales Quotation') {
            fetchSalesQuotationSeries();
        } else if (subTab === 'Sales Order') {
            fetchSalesOrderSeries();
        }
    }, [subTab]);

    const handleChange = (field: string, value: any) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    const getPreview = () => {
        const numberPart = '0'.repeat(Math.max(0, form.digits - 1)) + '1';
        return `${form.prefix}${numberPart}${form.suffix}`;
    };

    // Save Sales Quotation/Order Series
    const handleSaveSeries = async () => {
        if (!form.name.trim()) {
            showError('Please enter a series name');
            return;
        }
        if (!form.category) {
            showError('Please select a customer category');
            return;
        }

        try {
            const payload = {
                series_name: form.name.trim(),
                customer_category: form.category,
                prefix: form.prefix,
                suffix: form.suffix,
                required_digits: form.digits,
                auto_year: form.autoYear,
                current_number: 0
            };

            const endpoint = subTab === 'Sales Quotation'
                ? '/api/customerportal/sales-quotation-series/'
                : '/api/customerportal/sales-order-series/';

            if (editingId) {
                await httpClient.put(`${endpoint}${editingId}/`, payload);
                showSuccess('Series updated successfully!');
            } else {
                await httpClient.post(endpoint, payload);
                showSuccess('Series saved successfully!');
            }

            if (subTab === 'Sales Quotation') {
                await fetchSalesQuotationSeries();
            } else {
                await fetchSalesOrderSeries();
            }

            setForm(prev => ({
                ...prev,
                name: '',
                category: '',
                prefix: subTab === 'Sales Quotation' ? 'SQ/' : 'SO/',
                suffix: '/24-25',
                autoYear: true,
                digits: 4
            }));
            setEditingId(null);
        } catch (error: any) {
            handleApiError(error, 'Save Series');
        }
    };

    const handleDeleteSeries = async (id: number) => {
        if (!await confirm('Are you sure you want to delete this series?')) return;
        try {
            const endpoint = subTab === 'Sales Quotation'
                ? `/api/customerportal/sales-quotation-series/${id}/`
                : `/api/customerportal/sales-order-series/${id}/`;

            await httpClient.delete(endpoint);
            showSuccess('Series deleted successfully!');

            if (subTab === 'Sales Quotation') {
                await fetchSalesQuotationSeries();
            } else {
                await fetchSalesOrderSeries();
            }
        } catch (error) {
            handleApiError(error, 'Delete Series');
        }
    };

    const handleEditSeries = (series: any) => {
        setEditingId(series.id);
        setForm({
            name: series.series_name || '',
            category: series.customer_category || '',
            prefix: series.prefix || (isSQ ? 'SQ/' : 'SO/'),
            suffix: series.suffix || '/24-25',
            autoYear: series.auto_year !== undefined ? series.auto_year : true,
            digits: series.required_digits || 4
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setForm({
            name: '',
            category: '',
            prefix: isSQ ? 'SQ/' : 'SO/',
            suffix: '/24-25',
            autoYear: true,
            digits: 4
        });
    };

    return (
        <div className="p-8">
            {/* Sub-tabs */}
            <div className="mb-8">
                <div className="bg-gray-50 p-1 rounded-[4px] inline-flex">
                    {['Sales Quotation', 'Sales Order'].map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setSubTab(tab as any)}
                            className={`px-6 py-2 rounded-[4px] text-sm font-medium transition-all ${subTab === tab
                                ? 'bg-white text-indigo-600 shadow-none border border-slate-200-none border border-slate-200'
                                : 'text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                {/* Left: New Series Form */}
                <div className="lg:col-span-4 space-y-6">
                    <h3 className="text-lg font-bold text-gray-900 border-b border-gray-100 pb-3">
                        {editingId ? 'Edit' : 'New'} {subTab} Series
                    </h3>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Name of Series <span className="text-red-500">*</span></label>
                        <input
                            type="text"
                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder={`e.g. Retail ${subTab}`}
                            value={form.name}
                            onChange={(e) => handleChange('name', e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Customer Category <span className="text-red-500">*</span></label>
                        <CategoryHierarchicalDropdown
                            apiEndpoint="/api/customerportal/categories/"
                            systemCategories={['Export', 'Within Country (B2B)', 'Within Country (B2C)']}
                            value={form.category}
                            onSelect={(selection) => handleChange('category', selection.fullPath)}
                            mergeSystem={true}
                            colorTheme="teal"
                            placeholder="Select Category"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Prefix</label>
                            <input
                                type="text"
                                className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                value={form.prefix}
                                onChange={(e) => handleChange('prefix', e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Suffix</label>
                            <input
                                type="text"
                                className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                value={form.suffix}
                                onChange={(e) => handleChange('suffix', e.target.value)}
                            />
                        </div>
                    </div>


                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Digits</label>
                        <input
                            type="number"
                            className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                            value={form.digits}
                            onChange={(e) => handleChange('digits', Number(e.target.value))}
                        />
                    </div>


                    <div className="bg-gray-100 rounded-[4px] p-6 text-center">
                        <p className="text-xs uppercase text-gray-500 font-semibold mb-2">SAMPLE PREVIEW</p>
                        <p className="text-xl font-bold text-gray-800">{getPreview()}</p>
                    </div>

                    <div className="flex gap-2">
                        {editingId && (
                            <button
                                onClick={handleCancelEdit}
                                className="w-1/2 py-2.5 bg-gray-200 text-gray-700 font-medium rounded-md hover:bg-gray-300 transition-colors"
                            >
                                Cancel
                            </button>
                        )}
                        <button
                            onClick={handleSaveSeries}
                            disabled={!form.name || !form.category}
                            className={`py-2.5 bg-teal-600 text-white font-medium rounded-md hover:bg-indigo-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed ${editingId ? 'w-1/2' : 'w-full'}`}
                        >
                            {editingId ? 'Update Series' : 'Save Series'}
                        </button>
                    </div>
                </div>

                {/* Right: Table */}
                <div className="lg:col-span-8">
                    <h3 className="text-lg font-bold text-gray-900 mb-6">Existing {isSQ ? 'Sales Quotation' : 'Sales Order'} Series</h3>
                    <div className="border border-gray-200 rounded-[4px] overflow-hidden">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">NAME</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">CATEGORY</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">DETAILS</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">ACTIONS</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {list.map((series) => (
                                    <tr key={series.id}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{series.series_name}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{series.customer_category}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {'displayDetails' in series ? series.displayDetails : `${series.prefix} (${series.required_digits} digits)`}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            <button onClick={() => handleEditSeries(series)} className="text-teal-600 hover:text-indigo-900 mr-4">Edit</button>
                                            <button onClick={() => handleDeleteSeries(series.id)} className="text-red-600 hover:text-red-900">Delete</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {list.length === 0 && (
                            <div className="p-8 text-center text-gray-500 text-sm">No series found.</div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const LongTermContractsContent: React.FC = () => {
    const [view, setView] = useState<'list' | 'create'>('list');
    const [activeTab, setActiveTab] = useState('Basic Details');
    const [automateBilling, setAutomateBilling] = useState(false);
    const [loading, setLoading] = useState(false);
    const [contractStockItems, setContractStockItems] = useState<any[]>([]);
    const [contracts, setContracts] = useState<any[]>([]);
    const [customers, setCustomers] = useState<any[]>([]);
    const [filteredBranches, setFilteredBranches] = useState<any[]>([]);
    const [branchLoading, setBranchLoading] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);

    // Basic Details State
    const [basicDetails, setBasicDetails] = useState({
        contractNumber: `CT-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}-${Date.now().toString().slice(-6)}`, // Auto-generated
        customerId: '',
        customerName: '',
        branchId: '',
        contractType: '',
        validityFrom: '',
        validityTo: '',
        contractDocument: ''
    });

    // Billing Configuration State
    const [billingConfig, setBillingConfig] = useState({
        billStartDate: '',
        billingFrequency: '',
        billPeriodFrom: '',
        billPeriodTo: ''
    });

    // Products State
    const [contractProducts, setContractProducts] = useState([
        { id: 1, itemCode: '', itemName: 'Product Name', uom: '', customerItemName: '', qtyMin: '', qtyMax: '', priceMin: '', priceMax: '', deviation: '' }
    ]);

    const handleAddProduct = () => {
        setContractProducts([...contractProducts, {
            id: contractProducts.length + 1,
            itemCode: '',
            itemName: 'Product Name',
            uom: '',
            customerItemName: '',
            qtyMin: '',
            qtyMax: '',
            priceMin: '',
            priceMax: '',
            deviation: ''
        }]);
    };

    const handleRemoveProduct = (id: number) => {
        setContractProducts(contractProducts.filter(p => p.id !== id));
    };

    const handleProductChange = (id: number, field: string, value: string) => {
        setContractProducts(contractProducts.map(p => {
            if (p.id === id) {
                const updatedProduct: any = { ...p, [field]: value };
                // Handle bidirectional auto-population
                if (field === 'itemCode') {
                    const item = contractStockItems.find(i => i.code === value);
                    if (item) {
                        updatedProduct.itemName = item.name;
                        if (item.uom) updatedProduct.uom = item.uom;
                    }
                } else if (field === 'itemName') {
                    const item = contractStockItems.find(i => i.name === value);
                    if (item) {
                        updatedProduct.itemCode = item.code;
                        if (item.uom) updatedProduct.uom = item.uom;
                    }
                }

                return updatedProduct;
            }
            return p;
        }));
    };

    // Terms State
    const [terms, setTerms] = useState({
        paymentTerms: '',
        penaltyTerms: '',
        forceMajeure: '',
        terminationClause: '',
        disputeTerms: '',
        others: ''
    });

    // Fetch contracts and customers on component mount
    useEffect(() => {
        if (view === 'list') {
            fetchContracts();
        }
        fetchCustomers();
        fetchStockItems();
    }, [view]);

    const fetchCustomers = async () => {
        try {
            const response = await httpClient.get('/api/customerportal/customer-master/');
            setCustomers((response as any) || []);
        } catch (error) {
            console.error('Error fetching customers:');
            setCustomers([]);
        }
    };

    const fetchContracts = async () => {
        try {
            const response = await httpClient.get('/api/customerportal/long-term-contracts/');
            setContracts((response as any) || []);
        } catch (error) {
            console.error('Error fetching contracts:');
            setContracts([]);
        }
    };

    const fetchStockItems = async () => {
        try {
            // Fetch both Inventory Items and Services
            const [inventoryResponse, servicesResponse] = await Promise.all([
                httpClient.get<any[]>('/api/inventory/items/'),
                httpClient.get<any[]>('/api/services/')
            ]);

            // Map Inventory Items
            const inventoryItems = (inventoryResponse || []).map(item => ({
                id: item.id,
                code: item.item_code || item.code || '',
                name: item.item_name || item.name || '',
                uom: item.uom || item.unit || '',
                alternateUom: item.alternate_uom || '',
                hsnCode: item.hsn_code || item.hsn_sac || item.hsn || ''
            }));

            // Map Services
            const serviceItems = (servicesResponse || []).map(item => ({
                id: item.id,
                code: item.serviceCode || '',
                name: item.serviceName || '',
                uom: item.uom || '',
                alternateUom: '',
                hsnCode: item.sacCode || ''
            }));

            // Merge everything
            setContractStockItems([...inventoryItems, ...serviceItems]);
        } catch (error) {
            console.error('Error fetching items and services:', error);
            setContractStockItems([]);
        }
    };

    const handleEditClick = (contract: any) => {
        setIsEditing(true);
        setEditingId(contract.id);

        setBasicDetails({
            contractNumber: contract.contract_number,
            customerId: contract.customer_id?.toString() || '',
            customerName: contract.customer_name || '',
            branchId: contract.branch_id?.toString() || '',
            contractType: contract.contract_type || '',
            validityFrom: contract.contract_validity_from || '',
            validityTo: contract.contract_validity_to || '',
            contractDocument: contract.contract_document || ''
        });

        setAutomateBilling(contract.automate_billing || false);
        setBillingConfig({
            billStartDate: contract.bill_start_date || '',
            billingFrequency: contract.billing_frequency || '',
            billPeriodFrom: contract.bill_period_from || '',
            billPeriodTo: contract.bill_period_to || ''
        });

        if (contract.products_services && Array.isArray(contract.products_services)) {
            setContractProducts(contract.products_services.map((p: any, index: number) => ({
                id: index + 1,
                itemCode: p.item_code || '',
                itemName: p.item_name || '',
                uom: p.uom || '',
                customerItemName: p.customer_item_name || '',
                qtyMin: p.qty_min?.toString() || '',
                qtyMax: p.qty_max?.toString() || '',
                priceMin: p.price_min?.toString() || '',
                priceMax: p.price_max?.toString() || '',
                deviation: p.acceptable_price_deviation || ''
            })));
        }

        if (contract.terms_conditions) {
            setTerms({
                paymentTerms: contract.terms_conditions.payment_terms || '',
                penaltyTerms: contract.terms_conditions.penalty_terms || '',
                forceMajeure: contract.terms_conditions.force_majeure || '',
                terminationClause: contract.terms_conditions.termination_clause || '',
                disputeTerms: contract.terms_conditions.dispute_terms || '',
                others: contract.terms_conditions.others || ''
            });
        }

        setActiveTab('Basic Details');
        setView('create');
    };

    const handleSaveContract = async () => {
        // Basic Validation
        if (!basicDetails.contractNumber || !basicDetails.customerId || !basicDetails.contractType || !basicDetails.validityFrom || !basicDetails.validityTo) {
            showError('Please fill all required fields in Basic Details section.');
            setActiveTab('Basic Details');
            return;
        }

        if (automateBilling && billingConfig.billPeriodFrom && basicDetails.validityFrom) {
            if (billingConfig.billPeriodFrom < basicDetails.validityFrom) {
                showError('Bill Period From cannot be earlier than Contract Validity From.');
                setActiveTab('Basic Details');
                return;
            }
        }

        if (automateBilling && billingConfig.billPeriodTo && basicDetails.validityTo) {
            if (billingConfig.billPeriodTo > basicDetails.validityTo) {
                showError('Bill Period To cannot be later than Contract Validity To.');
                setActiveTab('Basic Details');
                return;
            }
        }

        setLoading(true);

        try {
            // Prepare contract data
            const contractData = {
                contract_number: basicDetails.contractNumber,
                customer_id: parseInt(basicDetails.customerId) || null,
                customer_name: basicDetails.customerName,
                branch_id: parseInt(basicDetails.branchId) || null,
                contract_type: basicDetails.contractType,
                contract_validity_from: basicDetails.validityFrom,
                contract_validity_to: basicDetails.validityTo,
                contract_document: basicDetails.contractDocument,
                automate_billing: automateBilling,
                bill_start_date: automateBilling ? billingConfig.billStartDate : null,
                billing_frequency: automateBilling ? billingConfig.billingFrequency : null,
                bill_period_from: automateBilling ? billingConfig.billPeriodFrom : null,
                bill_period_to: automateBilling ? billingConfig.billPeriodTo : null,
                products_services: contractProducts.map(p => ({
                    item_code: p.itemCode,
                    item_name: p.itemName,
                    uom: p.uom,
                    customer_item_name: p.customerItemName,
                    qty_min: p.qtyMin ? parseFloat(p.qtyMin) : null,
                    qty_max: p.qtyMax ? parseFloat(p.qtyMax) : null,
                    price_min: p.priceMin ? parseFloat(p.priceMin) : null,
                    price_max: p.priceMax ? parseFloat(p.priceMax) : null,
                    acceptable_price_deviation: p.deviation
                })),
                terms_conditions: {
                    payment_terms: terms.paymentTerms,
                    penalty_terms: terms.penaltyTerms,
                    force_majeure: terms.forceMajeure,
                    termination_clause: terms.terminationClause,
                    dispute_terms: terms.disputeTerms,
                    others: terms.others
                }
            };



            let response;
            if (isEditing && editingId) {
                response = await httpClient.put(`/api/customerportal/long-term-contracts/${editingId}/`, contractData);

                showSuccess('Contract Updated Successfully!');
            } else {
                response = await httpClient.post('/api/customerportal/long-term-contracts/', contractData);

                showSuccess('Contract Created Successfully!');
            }

            // Reset form
            resetForm();
            setView('list');
        } catch (error: any) {
            console.error('Error saving contract:');
            const errorMessage = error.response?.data?.error || error.message || `Failed to ${isEditing ? 'update' : 'create'} contract`;
            showError(`Error: ${errorMessage}`);
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setBasicDetails({
            contractNumber: `CT-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}-${Date.now().toString().slice(-6)}`,
            customerId: '',
            customerName: '',
            branchId: '',
            contractType: '',
            validityFrom: '',
            validityTo: '',
            contractDocument: ''
        });
        setIsEditing(false);
        setEditingId(null);
        setAutomateBilling(false);
        setContractProducts([
            { id: 1, itemCode: '', itemName: 'Product Name', uom: '', customerItemName: '', qtyMin: '', qtyMax: '', priceMin: '', priceMax: '', deviation: '' }
        ]);
        setTerms({
            paymentTerms: '',
            penaltyTerms: '',
            forceMajeure: '',
            terminationClause: '',
            disputeTerms: '',
            others: ''
        });
        setBillingConfig({
            billStartDate: '',
            billingFrequency: '',
            billPeriodFrom: '',
            billPeriodTo: ''
        });
        setActiveTab('Basic Details');
    };


    const getBadgeStyle = (type: string) => {
        switch (type) {
            case 'Rate Contract': return 'bg-blue-100 text-slate-700 hover:bg-blue-200';
            case 'Service Contract': return 'bg-purple-100 text-purple-700 hover:bg-purple-200';
            case 'AMC': return 'bg-green-100 text-slate-700 hover:bg-green-200';
            default: return 'bg-gray-100 text-gray-700';
        }
    };

    if (view === 'create') {
        return (
            <div className="p-8">
                <div className="bg-white border border-gray-200 rounded-[4px] shadow-none border border-slate-200-none border border-slate-200">
                    {/* Header */}
                    <div className="px-8 py-6 border-b border-gray-200 flex justify-between items-center">
                        <h3 className="text-lg font-bold text-gray-900">{isEditing ? 'Edit Long-term Contract' : 'Add New Contract'}</h3>
                        {isEditing && (
                            <span className="px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-full border border-indigo-100 uppercase tracking-wider">
                                Update Mode
                            </span>
                        )}
                    </div>

                    {/* Tabs */}
                    <div className="px-8 pt-6">
                        <nav className="flex space-x-8 border-b border-gray-200" aria-label="Tabs">
                            {['Basic Details', 'Products / Services', 'Terms & Conditions'].map((tab) => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === tab
                                        ? 'border-indigo-500 text-indigo-600'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                        }`}
                                >
                                    {tab}
                                </button>
                            ))}
                        </nav>
                    </div>

                    {/* Content */}
                    <div className="p-8">
                        {activeTab === 'Basic Details' && (
                            <div className="max-w-4xl space-y-8">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                                    {/* Left Column */}
                                    <div className="space-y-6">
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-700 mb-1">Contract Number <span className="text-red-500">*</span></label>
                                            <input
                                                type="text"
                                                disabled
                                                value={basicDetails.contractNumber}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-[4px] bg-gray-50 text-gray-500 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-700 mb-1">Contract Type <span className="text-red-500">*</span></label>
                                            <select
                                                className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
                                                value={basicDetails.contractType}
                                                onChange={(e) => setBasicDetails({ ...basicDetails, contractType: e.target.value })}
                                            >
                                                <option value="">Select Type</option>
                                                <option value="Rate Contract">Rate Contract</option>
                                                <option value="Service Contract">Service Contract</option>
                                                <option value="AMC">AMC</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-700 mb-1">Contract Validity From <span className="text-red-500">*</span></label>
                                            <input
                                                type="date"
                                                className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm placeholder-gray-400"
                                                value={basicDetails.validityFrom}
                                                onChange={(e) => setBasicDetails({ ...basicDetails, validityFrom: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    {/* Right Column */}
                                    <div className="space-y-6">
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-700 mb-1">Customer Name <span className="text-red-500">*</span></label>
                                            <select
                                                className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
                                                value={basicDetails.customerId}
                                                onChange={async (e) => {
                                                    const selectedId = e.target.value;
                                                    const selectedOption = e.target.options[e.target.selectedIndex];

                                                    setBasicDetails({
                                                        ...basicDetails,
                                                        customerId: selectedId,
                                                        customerName: selectedOption.text,
                                                        branchId: '' // Reset branch when customer changes
                                                    });

                                                    if (selectedId) {
                                                        setBranchLoading(true);
                                                        try {
                                                            // Fetch full customer details to get the latest branches from GST details
                                                            const response = await httpClient.get(`/api/customerportal/customer-master/${selectedId}/`) as any;
                                                            if (response && response.branches) {
                                                                setFilteredBranches(response.branches);
                                                            } else {
                                                                setFilteredBranches([]);
                                                            }
                                                        } catch (error) {
                                                            console.error('Error fetching customer branches:');
                                                            setFilteredBranches([]);
                                                        } finally {
                                                            setBranchLoading(false);
                                                        }
                                                    } else {
                                                        setFilteredBranches([]);
                                                    }
                                                }}
                                            >
                                                <option value="">Select Customer</option>
                                                {customers.map((customer) => (
                                                    <option key={customer.id} value={customer.id}>
                                                        {customer.customer_name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-700 mb-1">Branch <span className="text-red-500">*</span></label>
                                            <select
                                                className={`w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white ${(!basicDetails.customerId || branchLoading) ? 'bg-gray-50 cursor-not-allowed opacity-60' : ''}`}
                                                value={basicDetails.branchId}
                                                disabled={!basicDetails.customerId || branchLoading}
                                                onChange={(e) => setBasicDetails({ ...basicDetails, branchId: e.target.value })}
                                            >
                                                <option value="">
                                                    {branchLoading
                                                        ? 'Fetching branches...'
                                                        : (basicDetails.customerId ? 'Select Branch' : 'Select Customer First')}
                                                </option>
                                                {!branchLoading && filteredBranches.map((branch) => (
                                                    <option key={branch.id} value={branch.id}>
                                                        {branch.branch_reference_name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-700 mb-1">Contract Validity To <span className="text-red-500">*</span></label>
                                            <input
                                                type="date"
                                                className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm placeholder-gray-400"
                                                value={basicDetails.validityTo}
                                                onChange={(e) => setBasicDetails({ ...basicDetails, validityTo: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Full Width Fields */}
                                <div className="space-y-6">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-700 mb-1">Attach Long-term Contract</label>
                                        <div className="border border-gray-300 rounded-[4px] px-4 py-2 flex items-center gap-4 bg-white">
                                            <button className="px-3 py-1.5 border border-gray-300 rounded bg-gray-50 hover:bg-gray-100 text-xs font-medium text-gray-700 transition-colors flex items-center gap-2">
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                                                Choose File
                                            </button>
                                            <span className="text-xs text-gray-400">Supported formats: PDF, DOC (Max size: 10MB)</span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            id="automate-billing"
                                            className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 border-gray-300"
                                            checked={automateBilling}
                                            onChange={(e) => setAutomateBilling(e.target.checked)}
                                        />
                                        <label htmlFor="automate-billing" className="text-sm font-semibold text-gray-700 select-none cursor-pointer">Automate Billing</label>
                                    </div>

                                    {/* Conditional Billing Configuration */}
                                    {automateBilling && (
                                        <div className="border border-gray-300 rounded-[4px] p-6 bg-gray-50/50 mt-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                            <h4 className="text-sm font-bold text-gray-800 mb-4 border-b border-gray-200 pb-2">Billing Configuration</h4>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <div>
                                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Bill Start Date <span className="text-red-500">*</span></label>
                                                    <input
                                                        type="date"
                                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
                                                        value={billingConfig.billStartDate}
                                                        onChange={(e) => setBillingConfig({ ...billingConfig, billStartDate: e.target.value })}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Billing Frequency <span className="text-red-500">*</span></label>
                                                    <select
                                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
                                                        value={billingConfig.billingFrequency}
                                                        onChange={(e) => setBillingConfig({ ...billingConfig, billingFrequency: e.target.value })}
                                                    >
                                                        <option value="">Select Frequency</option>
                                                        <option value="Weekly">Weekly</option>
                                                        <option value="Monthly">Monthly</option>
                                                        <option value="Quarterly">Quarterly</option>
                                                        <option value="Half-Yearly">Half-Yearly</option>
                                                    </select>
                                                </div>

                                                <div className="md:col-span-2">
                                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Bill Period <span className="text-red-500">*</span></label>
                                                    <div className="flex items-center gap-4">
                                                        <div className="flex-1">
                                                            <span className="text-xs text-gray-500 mb-1 block">From</span>
                                                            <input
                                                                type="date"
                                                                className={`w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white ${basicDetails.validityFrom && billingConfig.billPeriodFrom && billingConfig.billPeriodFrom < basicDetails.validityFrom ? 'border-red-500' : ''}`}
                                                                value={billingConfig.billPeriodFrom}
                                                                min={basicDetails.validityFrom}
                                                                onChange={(e) => setBillingConfig({ ...billingConfig, billPeriodFrom: e.target.value })}
                                                            />
                                                        </div>
                                                        <span className="mt-5 text-gray-400">to</span>
                                                        <div className="flex-1">
                                                            <span className="text-xs text-gray-500 mb-1 block">To</span>
                                                            <input
                                                                type="date"
                                                                className={`w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white ${basicDetails.validityTo && billingConfig.billPeriodTo && billingConfig.billPeriodTo > basicDetails.validityTo ? 'border-red-500' : ''}`}
                                                                value={billingConfig.billPeriodTo}
                                                                max={basicDetails.validityTo}
                                                                onChange={(e) => setBillingConfig({ ...billingConfig, billPeriodTo: e.target.value })}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'Products / Services' && (
                            <div className="space-y-4">
                                <h4 className="text-sm font-bold text-gray-800 uppercase tracking-wider mb-2">PRODUCTS / SERVICES</h4>
                                <div className="border border-gray-200 rounded-[4px] overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th rowSpan={2} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">NO</th>
                                                <th rowSpan={2} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">ITEM CODE</th>
                                                <th rowSpan={2} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-40">ITEM NAME</th>
                                                <th rowSpan={2} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">UOM</th>
                                                <th rowSpan={2} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-40">CUSTOMER ITEM NAME</th>
                                                <th colSpan={2} className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200">QUANTITY</th>
                                                <th colSpan={2} className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-b border-gray-200">PRICE</th>
                                                <th rowSpan={2} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">ACCEPTABLE PRICE DEVIATION</th>
                                                <th rowSpan={2} className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-20">ACTIONS</th>
                                            </tr>
                                            <tr>
                                                <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-100">MIN</th>
                                                <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">MAX</th>
                                                <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-100">MIN</th>
                                                <th className="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">MAX</th>
                                            </tr>
                                        </thead>
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {contractProducts.map((product, index) => (
                                                <tr key={product.id}>
                                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{index + 1}</td>
                                                    <td className="px-4 py-3 whitespace-nowrap">
                                                        <div className="relative">
                                                            <select
                                                                className="block w-full pl-3 pr-8 py-1.5 text-sm border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 rounded-[4px]"
                                                                value={product.itemCode}
                                                                onChange={(e) => handleProductChange(product.id, 'itemCode', e.target.value)}
                                                            >
                                                                <option value="">Select</option>
                                                                {contractStockItems.map((item, idx) => (
                                                                    <option key={`code-${idx}`} value={item.code}>
                                                                        {item.code}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 whitespace-nowrap">
                                                        <select
                                                            className="block w-full pl-3 pr-8 py-1.5 text-sm border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 rounded-[4px]"
                                                            value={product.itemName}
                                                            onChange={(e) => handleProductChange(product.id, 'itemName', e.target.value)}
                                                        >
                                                            <option value="">Select</option>
                                                            {contractStockItems.map((item, idx) => (
                                                                <option key={`name-${idx}`} value={item.name}>
                                                                    {item.name}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </td>
                                                    <td className="px-4 py-3 whitespace-nowrap">
                                                        <select
                                                            className="block w-full pl-3 pr-8 py-1.5 text-sm border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 rounded-[4px]"
                                                            value={product.uom}
                                                            onChange={(e) => handleProductChange(product.id, 'uom', e.target.value)}
                                                        >
                                                            <option value="">Select</option>
                                                            {(() => {
                                                                const item = contractStockItems.find(i => i.code === product.itemCode || i.name === product.itemName);
                                                                if (!item) return null;

                                                                const units = [...new Set([item.uom, item.alternateUom].filter(u => u && u.trim() !== ''))];

                                                                return units.map((u, ui) => (
                                                                    <option key={ui} value={u as string}>{u as string}</option>
                                                                ));
                                                            })()}

                                                        </select>
                                                    </td>
                                                    <td className="px-4 py-3 whitespace-nowrap">
                                                        <input
                                                            type="text"
                                                            className="block w-full px-3 py-1.5 text-sm border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                            placeholder="Customer item name"
                                                            value={product.customerItemName}
                                                            onChange={(e) => handleProductChange(product.id, 'customerItemName', e.target.value)}
                                                        />
                                                    </td>
                                                    <td className="px-2 py-3 whitespace-nowrap">
                                                        <input
                                                            type="number"
                                                            className="block w-full px-2 py-1.5 text-sm border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-center"
                                                            value={product.qtyMin}
                                                            onChange={(e) => handleProductChange(product.id, 'qtyMin', e.target.value)}
                                                        />
                                                    </td>
                                                    <td className="px-2 py-3 whitespace-nowrap">
                                                        <input
                                                            type="number"
                                                            className="block w-full px-2 py-1.5 text-sm border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-center"
                                                            value={product.qtyMax}
                                                            onChange={(e) => handleProductChange(product.id, 'qtyMax', e.target.value)}
                                                        />
                                                    </td>
                                                    <td className="px-2 py-3 whitespace-nowrap">
                                                        <input
                                                            type="number"
                                                            className="block w-full px-2 py-1.5 text-sm border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-center"
                                                            value={product.priceMin}
                                                            onChange={(e) => handleProductChange(product.id, 'priceMin', e.target.value)}
                                                        />
                                                    </td>
                                                    <td className="px-2 py-3 whitespace-nowrap">
                                                        <input
                                                            type="number"
                                                            className="block w-full px-2 py-1.5 text-sm border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-center"
                                                            value={product.priceMax}
                                                            onChange={(e) => handleProductChange(product.id, 'priceMax', e.target.value)}
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3 whitespace-nowrap">
                                                        <input
                                                            type="text"
                                                            className="block w-full px-3 py-1.5 text-sm border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                            placeholder="e.g., ±5%"
                                                            value={product.deviation}
                                                            onChange={(e) => handleProductChange(product.id, 'deviation', e.target.value)}
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3 whitespace-nowrap text-center">
                                                        <button
                                                            onClick={() => handleRemoveProduct(product.id)}
                                                            className="text-gray-400 hover:text-red-500 transition-colors"
                                                            disabled={contractProducts.length === 1}
                                                        >
                                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <button
                                    onClick={handleAddProduct}
                                    className="text-indigo-600 hover:text-indigo-800 text-sm font-medium flex items-center gap-1"
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                    Add New Product
                                </button>
                            </div>
                        )}

                        {activeTab === 'Terms & Conditions' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Payment Terms</label>
                                    <textarea
                                        rows={4}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm placeholder-gray-400 resize-none"
                                        placeholder="Enter payment terms"
                                        value={terms.paymentTerms}
                                        onChange={(e) => setTerms({ ...terms, paymentTerms: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Penalty Terms</label>
                                    <textarea
                                        rows={4}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm placeholder-gray-400 resize-none"
                                        placeholder="Enter penalty terms"
                                        value={terms.penaltyTerms}
                                        onChange={(e) => setTerms({ ...terms, penaltyTerms: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Force Majeure</label>
                                    <textarea
                                        rows={4}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm placeholder-gray-400 resize-none"
                                        placeholder="Enter force majeure details"
                                        value={terms.forceMajeure}
                                        onChange={(e) => setTerms({ ...terms, forceMajeure: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Termination Clause</label>
                                    <textarea
                                        rows={4}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm placeholder-gray-400 resize-none"
                                        placeholder="Enter termination clause"
                                        value={terms.terminationClause}
                                        onChange={(e) => setTerms({ ...terms, terminationClause: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Dispute Redressal Terms</label>
                                    <textarea
                                        rows={4}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm placeholder-gray-400 resize-none"
                                        placeholder="Enter dispute redressal terms"
                                        value={terms.disputeTerms}
                                        onChange={(e) => setTerms({ ...terms, disputeTerms: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Others</label>
                                    <textarea
                                        rows={4}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm placeholder-gray-400 resize-none"
                                        placeholder="Any other terms"
                                        value={terms.others}
                                        onChange={(e) => setTerms({ ...terms, others: e.target.value })}
                                    />
                                </div>
                            </div>
                        )}

                        {activeTab !== 'Basic Details' && activeTab !== 'Products / Services' && activeTab !== 'Terms & Conditions' && (
                            <div className="py-12 text-center text-gray-500 italic">
                                {activeTab} content coming soon.
                            </div>
                        )}

                        {/* Footer */}
                        <div className="flex justify-between border-t border-gray-200 mt-8 pt-6">
                            <button
                                onClick={() => {
                                    resetForm();
                                    setView('list');
                                }}
                                className="px-6 py-2 border border-gray-300 rounded-[4px] text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                                Cancel
                            </button>
                            <div className="flex gap-3">
                                {activeTab !== 'Basic Details' && (
                                    <button
                                        onClick={() => {
                                            if (activeTab === 'Terms & Conditions') setActiveTab('Products / Services');
                                            else if (activeTab === 'Products / Services') setActiveTab('Basic Details');
                                        }}
                                        className="px-6 py-2 border border-gray-300 rounded-[4px] text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                                    >
                                        Back
                                    </button>
                                )}
                                <button
                                    onClick={() => {
                                        if (activeTab === 'Basic Details') {
                                            if (!basicDetails.contractNumber || !basicDetails.customerId || !basicDetails.contractType || !basicDetails.validityFrom || !basicDetails.validityTo) {
                                                showError('Please fill all required fields in Basic Details section.');
                                                return;
                                            }
                                            setActiveTab('Products / Services');
                                        }
                                        else if (activeTab === 'Products / Services') {
                                            // Optional: Basic validation for products
                                            const invalidProduct = contractProducts.find(p => !p.itemCode || !p.itemName);
                                            if (invalidProduct && contractProducts.length > 0 && contractProducts[0].itemCode !== '') {
                                                // Only show error if they started filling but left something incomplete
                                                // showError('Please fill Item Code and Name for all products.');
                                                // return;
                                            }
                                            setActiveTab('Terms & Conditions');
                                        }
                                        else if (activeTab === 'Terms & Conditions') {
                                            handleSaveContract();
                                        }
                                    }}
                                    disabled={loading}
                                    className={`px-8 py-2 text-white rounded-[4px] text-sm font-medium transition-colors ${activeTab === 'Terms & Conditions' ? 'bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400' : 'bg-indigo-600 hover:bg-indigo-700'
                                        }`}
                                >
                                    {loading ? 'Saving...' : (activeTab === 'Terms & Conditions' ? (isEditing ? 'Update' : 'Save') : 'Next')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-8">
            {/* Header */}
            <div className="flex justify-between items-end mb-8">
                <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-1">Long-term Contracts</h3>
                    <p className="text-sm text-gray-500">Manage rate contracts and service contracts</p>
                </div>
                <button
                    onClick={() => {
                        resetForm();
                        setView('create');
                    }}
                    className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-[4px] hover:bg-indigo-700 transition-colors shadow-none border border-slate-200-none border border-slate-200 flex items-center gap-2"
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    Add New Contract
                </button>
            </div>

            {/* Contracts Table */}
            <div className="bg-white border border-gray-200 rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">CONTRACT NO</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">CUSTOMER REFERENCE NAME</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">BRANCH</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">CONTRACT TYPE</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">VALIDITY PERIOD</th>
                            <th className="px-6 py-4 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">ACTIONS</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {contracts.map((contract) => (
                            <tr key={contract.id} className="hover:bg-gray-50 transition-colors group">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">{contract.contract_number}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{contract.customer_name}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{contract.branch_name || 'Main Branch'}</td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-[4px] cursor-default ${getBadgeStyle(contract.contract_type)}`}>
                                        {contract.contract_type}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 tabular-nums">
                                    {contract.contract_validity_from} <span className="mx-2 text-gray-400">-</span> {contract.contract_validity_to}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                                    <div className="flex items-center justify-center gap-3 opacity-60 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => handleEditClick(contract)}
                                            className="text-gray-500 hover:text-indigo-600 transition-colors"
                                            title="View/Edit Details"
                                        >
                                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {contracts.length === 0 && (
                    <div className="py-12 text-center text-gray-500 text-sm">No contracts found.</div>
                )}
            </div>
        </div>
    );
};

// Receipt Content Component
function ReceiptContent() {
    const [showPostModal, setShowPostModal] = useState(false);
    const [selectedReceipt, setSelectedReceipt] = useState<any>(null);
    const [availableLedgers, setAvailableLedgers] = useState<any[]>([]);
    const [postFormData, setPostFormData] = useState({
        dateOfReceipt: new Date().toISOString().split('T')[0],
        methodOfReceipt: '',
        bankAccount: '',
        bankReferenceNo: '',
    });

    // Filter States
    const [activeFilter, setActiveFilter] = useState<string | null>(null);
    const [dateFilter, setDateFilter] = useState<{ start: string; end: string }>({ start: '', end: '' });
    const [customerFilter, setCustomerFilter] = useState('');
    const [amountFilter, setAmountFilter] = useState<{ min: string; max: string }>({ min: '', max: '' });

    const toggleFilter = (filterName: string) => {
        setActiveFilter(activeFilter === filterName ? null : filterName);
    };
    const [isLoading, setIsLoading] = useState(true);
    const [receipts, setReceipts] = useState<any[]>([]);

    const fetchDueInvoices = async () => {
        try {
            setIsLoading(true);
            console.log('DEBUG: Fetching due invoices from /api/voucher-sales-new/');
            const data = await httpClient.get<any[]>('/api/voucher-sales-new/');
            console.log('DEBUG: Received invoices:', data);

            if (!Array.isArray(data)) {
                console.error('DEBUG: Expected array from /api/voucher-sales-new/, got:', data);
                setReceipts([]);
                return;
            }

            const transformed = data.map((inv: any) => ({
                id: inv.id,
                date: inv.date,
                customerRefName: inv.customer_name || 'N/A',
                voucherNo: inv.sales_invoice_no,
                amount: parseFloat(inv.payment_details?.payment_payable) || 0
            }));
            setReceipts(transformed);
        } catch (error) {
            console.error('DEBUG: Fetch error:', error);
            handleApiError(error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchLedgers = async () => {
        try {
            const data = await httpClient.get<any[]>('/api/masters/ledgers/cash-bank/');
            setAvailableLedgers(data);
        } catch (error) {
            console.error('DEBUG: Error fetching ledgers:', error);
        }
    };

    useEffect(() => {
        fetchDueInvoices();
        fetchLedgers();
    }, []);

    const filteredReceipts = useMemo(() => {
        return receipts.filter(receipt => {
            // Date Filter
            if (dateFilter.start && receipt.date < dateFilter.start) return false;
            if (dateFilter.end && receipt.date > dateFilter.end) return false;

            // Customer Name Filter
            if (customerFilter && !receipt.customerRefName.toLowerCase().includes(customerFilter.toLowerCase())) return false;

            // Amount Filter
            if (amountFilter.min && receipt.amount !== 0 && receipt.amount < parseFloat(amountFilter.min)) return false;
            if (amountFilter.max && receipt.amount !== 0 && receipt.amount > parseFloat(amountFilter.max)) return false;

            return true;
        });
    }, [receipts, dateFilter, customerFilter, amountFilter]);

    const handlePostClick = (receipt: any) => {
        setSelectedReceipt(receipt);
        setPostFormData({
            dateOfReceipt: new Date().toISOString().split('T')[0],
            methodOfReceipt: '',
            bankAccount: '',
            bankReferenceNo: '',
        });
        setShowPostModal(true);
    };

    const handleCloseModal = () => {
        setShowPostModal(false);
        setSelectedReceipt(null);
        setPostFormData({
            dateOfReceipt: '',
            methodOfReceipt: '',
            bankAccount: '',
            bankReferenceNo: '',
        });
    };

    const handleFormChange = (field: string, value: string) => {
        setPostFormData(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!postFormData.dateOfReceipt || !postFormData.methodOfReceipt) {
            showError('Please fill in all required fields');
            return;
        }

        if (postFormData.methodOfReceipt === 'Bank' && !postFormData.bankAccount) {
            showError('Please select a Bank Account');
            return;
        }

        if (postFormData.methodOfReceipt === 'Bank' && !postFormData.bankReferenceNo) {
            showError('Please enter Bank Reference No');
            return;
        }

        try {
            showInfo('Posting receipt...');
            const result = await httpClient.post(`/api/voucher-sales-new/${selectedReceipt.id}/post-receipt/`, {
                ...postFormData,
                amount: selectedReceipt.amount
            });

            showSuccess('Receipt posted successfully!');
            handleCloseModal();
            // Refresh the list - the posted invoice should now be excluded by backend get_queryset
            fetchDueInvoices();
        } catch (error: any) {
            console.error('Error posting receipt:', error);
            showError(error.response?.data?.error || 'Failed to post receipt');
        }
    };

    return (
        <div className="text-left">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-medium text-gray-900">Receipt</h3>
            </div>

            {/* Invoices Listing Table */}
            <div className="bg-white border border-gray-200 rounded-[4px] overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    <div className="flex items-center justify-between relative">
                                        <span>Date</span>
                                        <div className="ml-2">
                                            <Filter
                                                className={`w-4 h-4 cursor-pointer ${activeFilter === 'date' ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
                                                onClick={() => toggleFilter('date')}
                                            />
                                            {activeFilter === 'date' && (
                                                <div className="absolute z-50 top-8 left-0 bg-white shadow-xl border border-gray-200 rounded-[4px] p-3 w-52">
                                                    <div className="flex justify-between items-center mb-2">
                                                        <span className="text-xs font-semibold">Filter Date</span>
                                                        <X className="w-3 h-3 cursor-pointer text-gray-400 hover:text-gray-600" onClick={() => setActiveFilter(null)} />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <div>
                                                            <label className="text-[10px] text-gray-500 block mb-1">Start Date</label>
                                                            <input type="date" value={dateFilter.start} onChange={(e) => setDateFilter({ ...dateFilter, start: e.target.value })} max={new Date().toISOString().split('T')[0]} className="w-full px-2 py-1 text-xs border rounded focus:ring-1 focus:ring-indigo-500" />
                                                        </div>
                                                        <div>
                                                            <label className="text-[10px] text-gray-500 block mb-1">End Date</label>
                                                            <input type="date" value={dateFilter.end} onChange={(e) => setDateFilter({ ...dateFilter, end: e.target.value })} max={new Date().toISOString().split('T')[0]} className="w-full px-2 py-1 text-xs border rounded focus:ring-1 focus:ring-indigo-500" />
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    <div className="flex items-center justify-between relative">
                                        <span>Customer Reference Name</span>
                                        <div className="ml-2">
                                            <Filter
                                                className={`w-4 h-4 cursor-pointer ${activeFilter === 'customer' ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
                                                onClick={() => toggleFilter('customer')}
                                            />
                                            {activeFilter === 'customer' && (
                                                <div className="absolute z-50 top-8 left-0 bg-white shadow-xl border border-gray-200 rounded-[4px] p-3 w-60">
                                                    <div className="flex justify-between items-center mb-2">
                                                        <span className="text-xs font-semibold">Filter Customer</span>
                                                        <X className="w-3 h-3 cursor-pointer text-gray-400 hover:text-gray-600" onClick={() => setActiveFilter(null)} />
                                                    </div>
                                                    <input
                                                        type="text"
                                                        placeholder="Search Customer..."
                                                        value={customerFilter}
                                                        onChange={(e) => setCustomerFilter(e.target.value)}
                                                        className="w-full px-2 py-1 text-xs border rounded focus:ring-1 focus:ring-indigo-500"
                                                        autoFocus
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Invoice No
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    <div className="flex items-center justify-between relative">
                                        <span>Amount</span>
                                        <div className="ml-2">
                                            <Filter
                                                className={`w-4 h-4 cursor-pointer ${activeFilter === 'amount' ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}
                                                onClick={() => toggleFilter('amount')}
                                            />
                                            {activeFilter === 'amount' && (
                                                <div className="absolute z-50 top-8 right-0 bg-white shadow-xl border border-gray-200 rounded-[4px] p-3 w-52">
                                                    <div className="flex justify-between items-center mb-2">
                                                        <span className="text-xs font-semibold">Filter Amount</span>
                                                        <X className="w-3 h-3 cursor-pointer text-gray-400 hover:text-gray-600" onClick={() => setActiveFilter(null)} />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <div className="flex items-center gap-2">
                                                            <input type="number" placeholder="Min" value={amountFilter.min} onChange={(e) => setAmountFilter({ ...amountFilter, min: e.target.value })} className="w-full px-2 py-1 text-xs border rounded focus:ring-1 focus:ring-indigo-500" />
                                                            <span className="text-gray-500">-</span>
                                                            <input type="number" placeholder="Max" value={amountFilter.max} onChange={(e) => setAmountFilter({ ...amountFilter, max: e.target.value })} className="w-full px-2 py-1 text-xs border rounded focus:ring-1 focus:ring-indigo-500" />
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Action
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-20 text-center">
                                        <div className="flex flex-col items-center justify-center">
                                            <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                                            <p className="text-gray-500 font-medium">Loading due invoices...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredReceipts.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-sm text-gray-500 font-medium">
                                        No due invoices found matching the selected filters.
                                    </td>
                                </tr>
                            ) : (
                                filteredReceipts.map((receipt) => (
                                    <tr key={receipt.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {receipt.date}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {receipt.customerRefName}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                            {receipt.voucherNo}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            ₹{receipt.amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                            <button
                                                onClick={() => handlePostClick(receipt)}
                                                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-[4px] hover:bg-indigo-700 transition-colors"
                                            >
                                                Post
                                            </button>
                                        </td>
                                    </tr>
                                )))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Post Receipt Modal */}
            {showPostModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 max-w-md w-full animate-fade-in">
                        {/* Modal Header */}
                        <div className="px-6 py-4 border-b border-gray-100">
                            <h2 className="text-xl font-bold text-gray-900">Post Receipt</h2>
                        </div>

                        {/* Modal Body */}
                        <form onSubmit={handleSubmit} className="px-6 py-4">
                            <div className="space-y-4">
                                {/* Date of Receipt */}
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">
                                        Date of Receipt <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="date"
                                        value={postFormData.dateOfReceipt}
                                        onChange={(e) => handleFormChange('dateOfReceipt', e.target.value)}
                                        max={new Date().toISOString().split('T')[0]}
                                        className="w-full px-4 py-2 border border-gray-200 rounded-[4px] focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                        required
                                    />
                                </div>

                                {/* Method of Receipt */}
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">
                                        Method of Receipt <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        value={postFormData.methodOfReceipt}
                                        onChange={(e) => handleFormChange('methodOfReceipt', e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-200 rounded-[4px] focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                        required
                                    >
                                        <option value="">Select method</option>
                                        <option value="Cash">Cash</option>
                                        <option value="Bank">Bank</option>
                                    </select>
                                </div>

                                {/* Bank Account Selection - Visible only when Bank is selected */}
                                {postFormData.methodOfReceipt === 'Bank' && (
                                    <>
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">
                                                Bank Account <span className="text-red-500">*</span>
                                            </label>
                                            <select
                                                value={postFormData.bankAccount}
                                                onChange={(e) => handleFormChange('bankAccount', e.target.value)}
                                                className="w-full px-4 py-2 border border-gray-200 rounded-[4px] focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                                required
                                            >
                                                <option value="">Select bank account</option>
                                                {availableLedgers
                                                    .filter(l => (l.group || '').toLowerCase().includes('bank') || (l.name || '').toLowerCase().includes('bank'))
                                                    .map(ledger => (
                                                        <option key={ledger.id} value={ledger.id}>
                                                            {ledger.name}
                                                        </option>
                                                    ))}
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">
                                                Bank Reference No <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                value={postFormData.bankReferenceNo}
                                                onChange={(e) => handleFormChange('bankReferenceNo', e.target.value)}
                                                className="w-full px-4 py-2 border border-gray-200 rounded-[4px] focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                                placeholder="Enter bank reference number"
                                                required
                                            />
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Modal Footer */}
                            <div className="flex justify-end gap-3 mt-6 pt-4">
                                <button
                                    type="button"
                                    onClick={handleCloseModal}
                                    className="px-6 py-2 border border-gray-200 text-gray-500 text-sm font-bold rounded-[4px] hover:bg-gray-50 transition-colors uppercase tracking-widest"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-6 py-2 bg-indigo-600 text-white text-sm font-bold rounded-[4px] hover:bg-indigo-700 transition-colors uppercase tracking-widest"
                                >
                                    Post Receipt
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
// Net-off Modal Component
interface PurchaseVoucher {
    id: string;
    date: string;
    supplierInvNo: string;
    amount: number;
    pendingAmount: number;
}

interface SalesVoucher {
    id: string;
    date: string;
    salesVchNo: string;
    amount: number;
    pendingAmount: number;
}

interface NetOffModalProps {
    isOpen: boolean;
    onClose: () => void;
    customerName: string;
}

interface PaymentVoucher {
    id: string;
    date: string;
    voucherNo: string;
    amount: number;
    pendingAmount: number;
}

interface ReceiptVoucher {
    id: string;
    date: string;
    voucherNo: string;
    amount: number;
    pendingAmount: number;
}

interface EditNetOffPageProps {
    onCancel: () => void;
    onNext: (salesNetOff: Record<string, number>, paymentNetOff: Record<string, number>, purchaseNetOff: Record<string, number>, receiptNetOff: Record<string, number>) => void;
    salesVouchers: SalesVoucher[];
    paymentVouchers: PaymentVoucher[];
    purchaseVouchers: PurchaseVoucher[];
    receiptVouchers: ReceiptVoucher[];
    initialSalesNetOff: Record<string, number>;
    initialPaymentNetOff: Record<string, number>;
    initialPurchaseNetOff: Record<string, number>;
    initialReceiptNetOff: Record<string, number>;
}

const EditNetOffPage: React.FC<EditNetOffPageProps> = ({
    onCancel,
    onNext,
    salesVouchers,
    paymentVouchers,
    purchaseVouchers,
    receiptVouchers,
    initialSalesNetOff,
    initialPaymentNetOff,
    initialPurchaseNetOff,
    initialReceiptNetOff
}) => {
    // Local state for editing amounts
    const [salesNetOff, setSalesNetOff] = useState<Record<string, number>>(initialSalesNetOff);
    const [paymentNetOff, setPaymentNetOff] = useState<Record<string, number>>(initialPaymentNetOff);
    const [purchaseNetOff, setPurchaseNetOff] = useState<Record<string, number>>(initialPurchaseNetOff);
    const [receiptNetOff, setReceiptNetOff] = useState<Record<string, number>>(initialReceiptNetOff);

    // Calculate totals
    const totalDebits =
        (Object.values(salesNetOff) as number[]).reduce((sum, amt) => sum + (amt || 0), 0) +
        (Object.values(paymentNetOff) as number[]).reduce((sum, amt) => sum + (amt || 0), 0);

    const totalCredits =
        (Object.values(purchaseNetOff) as number[]).reduce((sum, amt) => sum + (amt || 0), 0) +
        (Object.values(receiptNetOff) as number[]).reduce((sum, amt) => sum + (amt || 0), 0);

    const isNextEnabled = totalDebits > 0 && Math.abs(totalDebits - totalCredits) < 0.01;

    // Helper to handle input changes
    const handleAmountChange = (
        id: string,
        value: string,
        maxAmount: number,
        setter: React.Dispatch<React.SetStateAction<Record<string, number>>>,
        current: Record<string, number>
    ) => {
        const numVal = parseFloat(value);
        if (isNaN(numVal)) {
            // Allow clearing input (optional handling) but here strictly numeric as per requirement "Numeric only"
            // For better UX, we might allow empty string to be 0 or keep as is.
            // Let's assume input needs to be valid.
            if (value === '') {
                setter({ ...current, [id]: 0 });
                return;
            }
        }

        // Strict validation: Must be >= 0 and <= pending amount
        if (numVal >= 0 && numVal <= maxAmount) {
            setter({ ...current, [id]: numVal });
        }
    };

    return (
        <div className="bg-gray-50 flex flex-col overflow-auto rounded-[4px] min-h-[500px] animate-fadeIn">
            <div className="w-full space-y-8">
                {/* Top Summary Bar */}
                <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
                    <div className="flex items-center gap-12">
                        <div className="text-right">
                            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Debits</div>
                            <div className="text-2xl font-bold text-gray-900">₹{totalDebits.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                        </div>
                        <div className="text-right">
                            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total Credits</div>
                            <div className="text-2xl font-bold text-gray-900">₹{totalCredits.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                        </div>
                        <button
                            onClick={() => onNext(salesNetOff, paymentNetOff, purchaseNetOff, receiptNetOff)}
                            disabled={!isNextEnabled}
                            className={`ml-6 px-6 py-2.5 text-sm font-semibold rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 transition-colors ${isNextEnabled
                                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                }`}
                        >
                            Next
                        </button>
                    </div>
                </div>

                {/* Section 1: Sales Vouchers (Debit) */}
                <div className="bg-white rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 border border-gray-200 overflow-hidden">
                    <div className="bg-white px-6 py-4 border-b border-gray-200">
                        <h3 className="text-center text-lg font-medium text-gray-900">Sales Vouchers (Debit)</h3>
                    </div>
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500 font-medium uppercase text-xs">
                            <tr>
                                <th className="px-6 py-3">Date</th>
                                <th className="px-6 py-3">Sales Voucher No</th>
                                <th className="px-6 py-3 text-right">Amount</th>
                                <th className="px-6 py-3 text-right">Amount for Net-off</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {salesVouchers.map(v => (
                                <tr key={v.id}>
                                    <td className="px-6 py-4 text-gray-700">{v.date}</td>
                                    <td className="px-6 py-4 font-medium text-gray-900">{v.salesVchNo}</td>
                                    <td className="px-6 py-4 text-right text-gray-600">₹{v.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                    <td className="px-6 py-4 text-right">
                                        <input
                                            type="number"
                                            className="w-32 text-right px-3 py-1.5 border border-gray-300 rounded-[4px] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                            value={salesNetOff[v.id] ?? v.pendingAmount}
                                            onChange={(e) => handleAmountChange(v.id, e.target.value, v.pendingAmount, setSalesNetOff, salesNetOff)}
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Section 2: Payments (Debit) */}
                <div className="bg-white rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 border border-gray-200 overflow-hidden">
                    <div className="bg-white px-6 py-4 border-b border-gray-200">
                        <h3 className="text-center text-lg font-medium text-gray-900">Payment (Debit)</h3>
                    </div>
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500 font-medium uppercase text-xs">
                            <tr>
                                <th className="px-6 py-3">Date</th>
                                <th className="px-6 py-3">Payment Voucher No</th>
                                <th className="px-6 py-3 text-right">Amount</th>
                                <th className="px-6 py-3 text-right">Amount for Net-off</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {paymentVouchers.map(v => (
                                <tr key={v.id}>
                                    <td className="px-6 py-4 text-gray-700">{v.date}</td>
                                    <td className="px-6 py-4 font-medium text-gray-900">{v.voucherNo}</td>
                                    <td className="px-6 py-4 text-right text-gray-600">₹{v.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                    <td className="px-6 py-4 text-right">
                                        <input
                                            type="number"
                                            className="w-32 text-right px-3 py-1.5 border border-gray-300 rounded-[4px] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                            value={paymentNetOff[v.id] ?? v.pendingAmount}
                                            onChange={(e) => handleAmountChange(v.id, e.target.value, v.pendingAmount, setPaymentNetOff, paymentNetOff)}
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Section 3: Purchase Vouchers (Credit) */}
                <div className="bg-white rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 border border-gray-200 overflow-hidden">
                    <div className="bg-white px-6 py-4 border-b border-gray-200">
                        <h3 className="text-center text-lg font-medium text-gray-900">Purchase Vouchers (Credit)</h3>
                    </div>
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500 font-medium uppercase text-xs">
                            <tr>
                                <th className="px-6 py-3">Date</th>
                                <th className="px-6 py-3">Supplier Invoice No</th>
                                <th className="px-6 py-3 text-right">Amount</th>
                                <th className="px-6 py-3 text-right">Amount for Net-off</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {purchaseVouchers.map(v => (
                                <tr key={v.id}>
                                    <td className="px-6 py-4 text-gray-700">{v.date}</td>
                                    <td className="px-6 py-4 font-medium text-gray-900">{v.supplierInvNo}</td>
                                    <td className="px-6 py-4 text-right text-gray-600">₹{v.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                    <td className="px-6 py-4 text-right">
                                        <input
                                            type="number"
                                            className="w-32 text-right px-3 py-1.5 border border-gray-300 rounded-[4px] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                            value={purchaseNetOff[v.id] ?? v.pendingAmount}
                                            onChange={(e) => handleAmountChange(v.id, e.target.value, v.pendingAmount, setPurchaseNetOff, purchaseNetOff)}
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Section 4: Receipts (Credit) */}
                <div className="bg-white rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 border border-gray-200 overflow-hidden">
                    <div className="bg-white px-6 py-4 border-b border-gray-200">
                        <h3 className="text-center text-lg font-medium text-gray-900">Receipt (Credit)</h3>
                    </div>
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500 font-medium uppercase text-xs">
                            <tr>
                                <th className="px-6 py-3">Date</th>
                                <th className="px-6 py-3">Receipt Voucher No</th>
                                <th className="px-6 py-3 text-right">Amount</th>
                                <th className="px-6 py-3 text-right">Amount for Net-off</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {receiptVouchers.map(v => (
                                <tr key={v.id}>
                                    <td className="px-6 py-4 text-gray-700">{v.date}</td>
                                    <td className="px-6 py-4 font-medium text-gray-900">{v.voucherNo}</td>
                                    <td className="px-6 py-4 text-right text-gray-600">₹{v.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                    <td className="px-6 py-4 text-right">
                                        <input
                                            type="number"
                                            className="w-32 text-right px-3 py-1.5 border border-gray-300 rounded-[4px] focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                                            value={receiptNetOff[v.id] ?? v.pendingAmount}
                                            onChange={(e) => handleAmountChange(v.id, e.target.value, v.pendingAmount, setReceiptNetOff, receiptNetOff)}
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="flex justify-end pb-8">
                    <button
                        onClick={onCancel}
                        className="px-6 py-2.5 bg-white border border-gray-300 rounded-[4px] text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};

const NetOffModal: React.FC<NetOffModalProps> = ({ isOpen, onClose, customerName }) => {
    const [activeTab, setActiveTab] = useState('Invoices under Dispute');
    const [selectedPurchase, setSelectedPurchase] = useState<string[]>([]);
    const [selectedSales, setSelectedSales] = useState<string[]>([]);
    const [selectedPayments, setSelectedPayments] = useState<string[]>([]);
    const [selectedReceipts, setSelectedReceipts] = useState<string[]>([]);
    const [netOffDate, setNetOffDate] = useState('2026-01-20');

    const [viewMode, setViewMode] = useState<'modal' | 'editPage'>('modal');
    // State to hold net-off amounts
    const [salesNetOffAmounts, setSalesNetOffAmounts] = useState<Record<string, number>>({});
    const [paymentsNetOffAmounts, setPaymentsNetOffAmounts] = useState<Record<string, number>>({});
    const [purchaseNetOffAmounts, setPurchaseNetOffAmounts] = useState<Record<string, number>>({});
    const [receiptsNetOffAmounts, setReceiptsNetOffAmounts] = useState<Record<string, number>>({});


    if (!isOpen) return null;

    // Mock data matching the reference image
    const purchaseVouchers: PurchaseVoucher[] = [
        { id: '1', date: '2025-12-15', supplierInvNo: 'PINV-001', amount: 10000, pendingAmount: 10000 },
        { id: '2', date: '2026-01-02', supplierInvNo: 'PINV-005', amount: 5000, pendingAmount: 5000 },
        { id: '3', date: '2026-01-10', supplierInvNo: 'PINV-008', amount: 12000, pendingAmount: 12000 },
    ];

    const salesVouchers: SalesVoucher[] = [
        { id: '1', date: '2025-12-20', salesVchNo: 'INV-2025-050', amount: 15000, pendingAmount: 15000 },
        { id: '2', date: '2026-01-05', salesVchNo: 'INV-2026-001', amount: 6000, pendingAmount: 6000 },
        { id: '3', date: '2026-01-12', salesVchNo: 'INV-2026-002', amount: 20000, pendingAmount: 20000 },
    ];

    const paymentVouchers: PaymentVoucher[] = [
        { id: 'p1', date: '2026-01-08', voucherNo: 'PAY-101', amount: 2500, pendingAmount: 2500 }
    ];

    const receiptVouchers: ReceiptVoucher[] = [
        { id: 'r1', date: '2026-01-15', voucherNo: 'REC-201', amount: 1000, pendingAmount: 1000 }
    ];

    const runningBalance = 35000;

    // Conditionally render EditNetOffPage
    if (viewMode === 'editPage') {
        return (
            <EditNetOffPage
                onCancel={() => setViewMode('modal')}
                onNext={(sales, payments, purchase, receipts) => {
                    setSalesNetOffAmounts(sales);
                    setPaymentsNetOffAmounts(payments);
                    setPurchaseNetOffAmounts(purchase);
                    setReceiptsNetOffAmounts(receipts);
                    setViewMode('modal');
                    // Ensure we are on Net-off tab
                    setActiveTab('Net-off');
                }}
                salesVouchers={salesVouchers}
                paymentVouchers={paymentVouchers}
                purchaseVouchers={purchaseVouchers}
                receiptVouchers={receiptVouchers}
                initialSalesNetOff={salesNetOffAmounts}
                initialPaymentNetOff={paymentsNetOffAmounts}
                initialPurchaseNetOff={purchaseNetOffAmounts}
                initialReceiptNetOff={receiptsNetOffAmounts}
            />
        );
    }

    const handleNext = () => {
        // Broaden Logic - Combine Sales/Payments (Debit) and Purchase/Receipts (Credit)
        const debits = [
            ...salesVouchers.filter(v => selectedSales.includes(v.id)).map(v => ({ id: v.id, no: v.salesVchNo, amount: v.pendingAmount })),
            ...paymentVouchers.filter(v => selectedPayments.includes(v.id)).map(v => ({ id: v.id, no: v.voucherNo, amount: v.pendingAmount }))
        ];

        const credits = [
            ...purchaseVouchers.filter(v => selectedPurchase.includes(v.id)).map(v => ({ id: v.id, no: v.supplierInvNo, amount: v.pendingAmount })),
            ...receiptVouchers.filter(v => selectedReceipts.includes(v.id)).map(v => ({ id: v.id, no: v.voucherNo, amount: v.pendingAmount }))
        ];

        if (debits.length === 0 && credits.length === 0) {
            showError('Please select at least one invoice to proceed with net-off.');
            return;
        }

        const totalDebits = debits.reduce((sum, v) => sum + v.amount, 0);
        const totalCredits = credits.reduce((sum, v) => sum + v.amount, 0);

        // Determine result based on imbalance
        const netDifference = totalDebits - totalCredits;
        let resultType = '';
        let resultAmount = 0;

        if (netDifference > 0) {
            resultType = 'DEBIT NOTE';
            resultAmount = netDifference;
        } else if (netDifference < 0) {
            resultType = 'CREDIT NOTE';
            resultAmount = Math.abs(netDifference);
        } else {
            resultType = 'FULLY SETTLED';
            resultAmount = 0;
        }

        // Calculate closing balance
        const closingBalance = runningBalance + netDifference;

        const nettedAmount = Math.min(totalDebits, totalCredits);

        // Display summary
        let message = `🚀 NET-OFF PREVIEW SUMMARY\n`;
        message += `─────────────────────────────────────────\n`;
        message += `Selected Customer: ${customerName}\n`;
        message += `Selected Records: ${debits.length + credits.length} records\n`;

        message += `\n💰 AMOUNTS:\n`;
        message += `─────────────────────────────────────────\n`;
        message += `Total Debits (Sales/Pay):  ₹${totalDebits.toLocaleString('en-IN')}\n`;
        message += `Total Credits (Pur/Rec):   ₹${totalCredits.toLocaleString('en-IN')}\n`;
        message += `Net-off Amount:            ₹${nettedAmount.toLocaleString('en-IN')}\n`;

        message += `\n📋 NET-OFF RESULT:\n`;
        message += `─────────────────────────────────────────\n`;
        if (resultType === 'FULLY SETTLED') {
            message += `✅ ${resultType}\n`;
            message += `All selected records perfectly balanced!\n`;
        } else {
            message += `📝 Generate: ${resultType}\n`;
            message += `Amount: ₹${resultAmount.toLocaleString('en-IN')}\n`;
        }

        message += `\n💼 BALANCES:\n`;
        message += `─────────────────────────────────────────\n`;
        message += `Running Balance (Before): ₹${runningBalance.toLocaleString('en-IN')}\n`;
        message += `Closing Balance (After):  ₹${closingBalance.toLocaleString('en-IN')}\n`;

        showInfo(message);

        // In a real application, you would:
        // 1. Create net-off entry in the database
        // 2. Update invoice statuses
        // 3. Generate debit/credit note documents
        // 4. Navigate to Net-off tab
        setActiveTab('Net-off');
    };

    const isNextEnabled = selectedPurchase.length > 0 || selectedSales.length > 0 || selectedPayments.length > 0 || selectedReceipts.length > 0;

    return (
        <div className="bg-white flex flex-col rounded-[4px] min-h-[500px] animate-fadeIn">
            <div className="flex-1 flex flex-col h-full overflow-hidden">
                {/* Header */}
                <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-900">Invoices Under Dispute – Net-off</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Summary Panel */}
                <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                    <div className="grid grid-cols-2 gap-8">
                        <div className="space-y-3">
                            <div>
                                <div className="text-xs text-gray-500 mb-1">Net-off No:</div>
                                <div className="text-sm font-medium text-gray-900">NO-2026-001</div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500 mb-1">Customer / Vendor Name:</div>
                                <div className="text-sm font-medium text-gray-900">{customerName}</div>
                            </div>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <div className="text-xs text-gray-500 mb-1">Net-off Date:</div>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="date"
                                        value={netOffDate}
                                        onChange={(e) => setNetOffDate(e.target.value)}
                                        className="text-sm px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    />
                                    <Calendar className="w-4 h-4 text-gray-400" />
                                </div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500 mb-1">Running Balance:</div>
                                <div className="text-lg font-semibold text-indigo-600">₹{runningBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="px-6 border-b border-gray-200">
                    <div className="flex gap-6">
                        <button
                            className={`py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'Invoices under Dispute'
                                ? 'border-indigo-600 text-indigo-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                            onClick={() => setActiveTab('Invoices under Dispute')}
                        >
                            Invoices under Dispute
                        </button>
                        <button
                            className={`py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'Net-off'
                                ? 'border-indigo-600 text-indigo-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                            onClick={() => setActiveTab('Net-off')}
                        >
                            Net-off
                        </button>
                    </div>
                </div>

                {/* Main Content - Conditional based on active tab */}
                <div className="flex-1 overflow-auto p-6">
                    {activeTab === 'Invoices under Dispute' ? (
                        <div className="grid grid-cols-2 gap-6 pb-6">
                            {/* Purchase Vouchers Card */}
                            <div className="border border-gray-200 rounded-[4px] overflow-hidden flex flex-col bg-white">
                                <div className="bg-white px-4 py-3 border-b border-gray-200">
                                    <h3 className="text-sm font-medium text-gray-700">Purchase Vouchers</h3>
                                </div>
                                <div className="h-64 overflow-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-white sticky top-0">
                                            <tr className="text-left text-xs text-gray-500 uppercase border-b border-gray-200">
                                                <th className="px-4 py-3 font-medium">SELECT</th>
                                                <th className="px-4 py-3 font-medium">DATE</th>
                                                <th className="px-4 py-3 font-medium">SUPPLIER INV NO</th>
                                                <th className="px-4 py-3 text-right font-medium">AMOUNT</th>
                                                <th className="px-4 py-3 text-right font-medium">PENDING AMOUNT</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {purchaseVouchers.map((voucher) => (
                                                <tr key={voucher.id} className="hover:bg-gray-50">
                                                    <td className="px-4 py-3">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedPurchase.includes(voucher.id)}
                                                            onChange={(e) => {
                                                                if (e.target.checked) {
                                                                    setSelectedPurchase([...selectedPurchase, voucher.id]);
                                                                } else {
                                                                    setSelectedPurchase(selectedPurchase.filter(id => id !== voucher.id));
                                                                }
                                                            }}
                                                            className="rounded border-gray-300"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-700">{voucher.date}</td>
                                                    <td className="px-4 py-3 font-medium text-gray-900">{voucher.supplierInvNo}</td>
                                                    <td className="px-4 py-3 text-right text-gray-900">₹{voucher.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                    <td className="px-4 py-3 text-right text-gray-900">₹{voucher.pendingAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Sales Vouchers Card */}
                            <div className="border border-gray-200 rounded-[4px] overflow-hidden flex flex-col bg-white">
                                <div className="bg-white px-4 py-3 border-b border-gray-200">
                                    <h3 className="text-sm font-medium text-gray-700">Sales Vouchers</h3>
                                </div>
                                <div className="h-64 overflow-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-white sticky top-0">
                                            <tr className="text-left text-xs text-gray-500 uppercase border-b border-gray-200">
                                                <th className="px-4 py-3 font-medium">SELECT</th>
                                                <th className="px-4 py-3 font-medium">DATE</th>
                                                <th className="px-4 py-3 font-medium">SALES VCH NO</th>
                                                <th className="px-4 py-3 text-right font-medium">AMOUNT</th>
                                                <th className="px-4 py-3 text-right font-medium">PENDING AMOUNT</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {salesVouchers.map((voucher) => (
                                                <tr key={voucher.id} className="hover:bg-gray-50">
                                                    <td className="px-4 py-3">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedSales.includes(voucher.id)}
                                                            onChange={(e) => {
                                                                if (e.target.checked) {
                                                                    setSelectedSales([...selectedSales, voucher.id]);
                                                                } else {
                                                                    setSelectedSales(selectedSales.filter(id => id !== voucher.id));
                                                                }
                                                            }}
                                                            className="rounded border-gray-300"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-700">{voucher.date}</td>
                                                    <td className="px-4 py-3 font-medium text-gray-900">{voucher.salesVchNo}</td>
                                                    <td className="px-4 py-3 text-right text-gray-900">₹{voucher.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                    <td className="px-4 py-3 text-right text-gray-900">₹{voucher.pendingAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Payment Vouchers Card */}
                            <div className="border border-gray-200 rounded-[4px] overflow-hidden flex flex-col bg-white">
                                <div className="bg-white px-4 py-3 border-b border-gray-200">
                                    <h3 className="text-sm font-medium text-gray-700">Payment Vouchers</h3>
                                </div>
                                <div className="h-64 overflow-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-white sticky top-0">
                                            <tr className="text-left text-xs text-gray-500 uppercase border-b border-gray-200">
                                                <th className="px-4 py-3 font-medium">SELECT</th>
                                                <th className="px-4 py-3 font-medium">DATE</th>
                                                <th className="px-4 py-3 font-medium">VOUCHER NO</th>
                                                <th className="px-4 py-3 text-right font-medium">AMOUNT</th>
                                                <th className="px-4 py-3 text-right font-medium">PENDING AMOUNT</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {paymentVouchers.map((voucher) => (
                                                <tr key={voucher.id} className="hover:bg-gray-50">
                                                    <td className="px-4 py-3">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedPayments.includes(voucher.id)}
                                                            onChange={(e) => {
                                                                if (e.target.checked) {
                                                                    setSelectedPayments([...selectedPayments, voucher.id]);
                                                                } else {
                                                                    setSelectedPayments(selectedPayments.filter(id => id !== voucher.id));
                                                                }
                                                            }}
                                                            className="rounded border-gray-300"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-700">{voucher.date}</td>
                                                    <td className="px-4 py-3 font-medium text-gray-900">{voucher.voucherNo}</td>
                                                    <td className="px-4 py-3 text-right text-gray-900">₹{voucher.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                    <td className="px-4 py-3 text-right text-gray-900">₹{voucher.pendingAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Receipt Vouchers Card */}
                            <div className="border border-gray-200 rounded-[4px] overflow-hidden flex flex-col bg-white">
                                <div className="bg-white px-4 py-3 border-b border-gray-200">
                                    <h3 className="text-sm font-medium text-gray-700">Receipt Vouchers</h3>
                                </div>
                                <div className="h-64 overflow-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-white sticky top-0">
                                            <tr className="text-left text-xs text-gray-500 uppercase border-b border-gray-200">
                                                <th className="px-4 py-3 font-medium">SELECT</th>
                                                <th className="px-4 py-3 font-medium">DATE</th>
                                                <th className="px-4 py-3 font-medium">VOUCHER NO</th>
                                                <th className="px-4 py-3 text-right font-medium">AMOUNT</th>
                                                <th className="px-4 py-3 text-right font-medium">PENDING AMOUNT</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {receiptVouchers.map((voucher) => (
                                                <tr key={voucher.id} className="hover:bg-gray-50">
                                                    <td className="px-4 py-3">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedReceipts.includes(voucher.id)}
                                                            onChange={(e) => {
                                                                if (e.target.checked) {
                                                                    setSelectedReceipts([...selectedReceipts, voucher.id]);
                                                                } else {
                                                                    setSelectedReceipts(selectedReceipts.filter(id => id !== voucher.id));
                                                                }
                                                            }}
                                                            className="rounded border-gray-300"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-700">{voucher.date}</td>
                                                    <td className="px-4 py-3 font-medium text-gray-900">{voucher.voucherNo}</td>
                                                    <td className="px-4 py-3 text-right text-gray-900">₹{voucher.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                    <td className="px-4 py-3 text-right text-gray-900">₹{voucher.pendingAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    ) : (
                        // Net-off Summary View
                        <div className="max-w-5xl space-y-6">
                            {/* Amount Netted Off - Top Right */}
                            <div className="flex justify-end">
                                <div className="border border-gray-300 rounded-[4px] px-6 py-4">
                                    <div className="text-sm text-gray-600 mb-1">Amount Netted Off</div>
                                    <div className="text-2xl font-bold text-indigo-600">
                                        ₹{(() => {
                                            // Check if manual net-off amounts exist
                                            const isManual = Object.keys(salesNetOffAmounts).length > 0;

                                            if (isManual) {
                                                // If manual, it's balanced, so just sum debits (or credits)
                                                const totalDebits =
                                                    (Object.values(salesNetOffAmounts) as number[]).reduce((sum: number, amt: number) => sum + amt, 0) +
                                                    (Object.values(paymentsNetOffAmounts) as number[]).reduce((sum: number, amt: number) => sum + amt, 0);
                                                return totalDebits.toLocaleString('en-IN', { minimumFractionDigits: 2 });
                                            } else {
                                                // Auto calculation based on selection
                                                const totalPur = purchaseVouchers
                                                    .filter(v => selectedPurchase.includes(v.id))
                                                    .reduce((sum, v) => sum + v.pendingAmount, 0);
                                                const totalSal = salesVouchers
                                                    .filter(v => selectedSales.includes(v.id))
                                                    .reduce((sum, v) => sum + v.pendingAmount, 0);
                                                return Math.min(totalPur, totalSal).toLocaleString('en-IN', { minimumFractionDigits: 2 });
                                            }
                                        })()}
                                    </div>
                                </div>
                            </div>

                            {/* List of Pending Invoices Section */}
                            <div className="bg-white rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 border border-gray-200 p-6">
                                <h2 className="text-lg font-semibold text-gray-900 mb-4">List of Pending Invoices</h2>

                                {/* Imbalance Warning Banner */}
                                {/* Imbalance Warning - Only show if NOT manual (manual is always balanced) */}
                                {(() => {
                                    const isManual = Object.keys(salesNetOffAmounts).length > 0;
                                    if (isManual) return null;

                                    const totalPur = purchaseVouchers
                                        .filter(v => selectedPurchase.includes(v.id))
                                        .reduce((sum, v) => sum + v.pendingAmount, 0);
                                    const totalSal = salesVouchers
                                        .filter(v => selectedSales.includes(v.id))
                                        .reduce((sum, v) => sum + v.pendingAmount, 0);
                                    const diff = Math.abs(totalPur - totalSal);

                                    if (diff > 0.01) {
                                        return (
                                            <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-[4px] p-4 flex items-start gap-3">
                                                <div className="text-yellow-600 mt-0.5">⚠️</div>
                                                <div className="text-sm text-yellow-800">
                                                    <span className="font-semibold">Note:</span> There is an imbalance of <span className="font-bold">₹{diff.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span> between selected debit and credit amounts. The lower amount (<span className="font-bold">₹{Math.min(totalPur, totalSal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>) will be netted off.
                                                </div>
                                            </div>
                                        );
                                    }
                                    return null;
                                })()}

                                {/* List of Pending Invoices Table */}
                                <div className="space-y-8">
                                    <div className="bg-white rounded-[4px] border border-gray-200 overflow-hidden">
                                        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                                            <h3 className="text-sm font-semibold text-gray-700">List of Pending Invoices</h3>
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm">
                                                <thead className="bg-white">
                                                    <tr className="text-left text-xs text-gray-500 uppercase border-b border-gray-200">
                                                        <th className="px-4 py-3 font-medium">VOUCHER TYPE</th>
                                                        <th className="px-4 py-3 font-medium">DATE</th>
                                                        <th className="px-4 py-3 font-medium">REFERENCE NO.</th>
                                                        <th className="px-4 py-3 text-right font-medium">AMOUNT</th>
                                                        <th className="px-4 py-3 text-right font-medium">PENDING AMOUNT</th>
                                                        <th className="px-4 py-3 text-center font-medium">STATUS</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {/* Sales & Payments (Debits) */}
                                                    {[
                                                        ...salesVouchers.filter(v => Object.keys(salesNetOffAmounts).length > 0 ? (salesNetOffAmounts[v.id] || 0) > 0 : selectedSales.includes(v.id)).map(v => ({ ...v, type: 'Sales', no: v.salesVchNo })),
                                                        ...paymentVouchers.filter(v => (paymentsNetOffAmounts[v.id] || 0) > 0).map(v => ({ ...v, type: 'Payment', no: v.voucherNo }))
                                                    ].map((voucher) => (
                                                        <tr key={`pnd-${voucher.type}-${voucher.id}`} className="hover:bg-gray-50">
                                                            <td className="px-4 py-3">
                                                                <span className="text-indigo-600 font-medium">{voucher.type}</span>
                                                            </td>
                                                            <td className="px-4 py-3 text-gray-700">{voucher.date}</td>
                                                            <td className="px-4 py-3 font-medium text-gray-900">{voucher.no}</td>
                                                            <td className="px-4 py-3 text-right text-gray-900">
                                                                ₹{voucher.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                            </td>
                                                            <td className="px-4 py-3 text-right text-gray-900">
                                                                ₹{voucher.pendingAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                            </td>
                                                            <td className="px-4 py-3 text-center">
                                                                <span className={`inline-block px-3 py-1 text-xs font-medium rounded-[4px] ${voucher.type === 'Sales' ? 'bg-gray-100 text-gray-800' : 'bg-purple-100 text-purple-800'
                                                                    }`}>
                                                                    {voucher.type === 'Sales' ? 'Not Due' : 'Paid'}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* List of Invoices Netted-off Table */}
                                    <div className="bg-white rounded-[4px] border border-gray-200 overflow-hidden">
                                        <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                                            <h3 className="text-sm font-semibold text-gray-700">List of Invoices Netted-off</h3>
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm">
                                                <thead className="bg-white">
                                                    <tr className="text-left text-xs text-gray-500 uppercase border-b border-gray-200">
                                                        <th className="px-4 py-3 font-medium">VOUCHER TYPE</th>
                                                        <th className="px-4 py-3 font-medium">DATE</th>
                                                        <th className="px-4 py-3 font-medium">REFERENCE NO.</th>
                                                        <th className="px-4 py-3 text-right font-medium">APPLIED AMOUNT</th>
                                                        <th className="px-4 py-3 text-right font-medium">PENDING AMOUNT</th>
                                                        <th className="px-4 py-3 text-center font-medium">STATUS</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {/* Purchase & Receipts (Credits) */}
                                                    {[
                                                        ...purchaseVouchers.filter(v => Object.keys(purchaseNetOffAmounts).length > 0 ? (purchaseNetOffAmounts[v.id] || 0) > 0 : selectedPurchase.includes(v.id)).map(v => ({ ...v, type: 'Purchase', no: v.supplierInvNo })),
                                                        ...receiptVouchers.filter(v => (receiptsNetOffAmounts[v.id] || 0) > 0).map(v => ({ ...v, type: 'Receipt', no: v.voucherNo }))
                                                    ].map((voucher) => (
                                                        <tr key={`net-${voucher.type}-${voucher.id}`} className="hover:bg-gray-50">
                                                            <td className="px-4 py-3">
                                                                <span className="text-indigo-600 font-medium">{voucher.type}</span>
                                                            </td>
                                                            <td className="px-4 py-3 text-gray-700">{voucher.date}</td>
                                                            <td className="px-4 py-3 font-medium text-gray-900">{voucher.no}</td>
                                                            <td className="px-4 py-3 text-right text-gray-900 font-medium">
                                                                ₹{(voucher.type === 'Purchase'
                                                                    ? (Object.keys(purchaseNetOffAmounts).length > 0 ? purchaseNetOffAmounts[voucher.id] : voucher.pendingAmount)
                                                                    : receiptsNetOffAmounts[voucher.id]
                                                                ).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                            </td>
                                                            <td className="px-4 py-3 text-right text-gray-900">
                                                                ₹{voucher.pendingAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                            </td>
                                                            <td className="px-4 py-3 text-center">
                                                                <span className={`inline-block px-3 py-1 text-xs font-medium rounded-[4px] ${voucher.type === 'Purchase' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'
                                                                    }`}>
                                                                    {voucher.type === 'Purchase' ? 'Partially Paid' : 'Received'}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="mt-6 flex justify-end gap-3">
                                    <button
                                        onClick={() => setViewMode('editPage')}
                                        className="px-5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                                    >
                                        Edit Net-off
                                    </button>
                                    <button
                                        onClick={onClose}
                                        className="px-5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => {
                                            showSuccess('Net-off saved successfully!');
                                            onClose();
                                        }}
                                        className="px-5 py-2 text-sm font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700 transition-colors"
                                    >
                                        Save & Close
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Actions - Only show on Invoices under Dispute tab */}
                {activeTab === 'Invoices under Dispute' && (
                    <div className="px-6 py-4 border-t border-gray-200 flex justify-start gap-3">
                        <button
                            onClick={onClose}
                            className="px-5 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleNext}
                            disabled={!isNextEnabled}
                            className={`px-5 py-2 text-sm font-medium rounded transition-colors ${isNextEnabled
                                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                }`}
                        >
                            Next
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

// Customer Ledger View Component
interface CustomerLedgerViewProps {
    customer: { id: string; name: string; is_also_vendor?: boolean; ledger_id?: string; credit_period?: string; };
    onBack: () => void;
    onNavigate?: (page: string) => void;
    setPrefilledVoucherData?: (data: any) => void;
}

function CustomerLedgerView({ customer, onBack, onNavigate, setPrefilledVoucherData }: CustomerLedgerViewProps) {
    const [dateFilter, setDateFilter] = useState<{ start: string; end: string }>({ start: '', end: '' });
    const [postFromFilter, setPostFromFilter] = useState<TransactionType | ''>('');
    const [ledgerFilter, setLedgerFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState<PurchaseStatus | SalesStatus | ''>('');
    const [debitFilter, setDebitFilter] = useState('');
    const [creditFilter, setCreditFilter] = useState('');
    const [viewMode, setViewMode] = useState<'invoice-wise' | 'month-wise' | 'allocation'>('invoice-wise');
    const [showNetOffModal, setShowNetOffModal] = useState(false);
    const [monthFilter, setMonthFilter] = useState<string[]>([]);
    const [selectedMonthView, setSelectedMonthView] = useState<string | null>(null);
    const [showMonthDropdown, setShowMonthDropdown] = useState(false);
    const [activeFilter, setActiveFilter] = useState<string | null>(null);
    const [ledgerEntries, setLedgerEntries] = useState<(LedgerEntry & { referenceNo?: string })[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isGSTModalOpen, setIsGSTModalOpen] = useState(false);
    const [isJournalView, setIsJournalView] = useState(false);
    const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
    const [isAdvanceModalOpen, setIsAdvanceModalOpen] = useState(false);
    const [selectedAdvanceRow, setSelectedAdvanceRow] = useState<any>(null);


    const toggleFilter = (filterName: string) => setActiveFilter(prev => prev === filterName ? null : filterName);
    const handleAdvanceClick = (row: any) => {
        setSelectedAdvanceRow(row);
        setIsAdvanceModalOpen(true);
    };

    const fetchLedgerData = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [salesData, transactionsData] = await Promise.all([
                httpClient.get<any[]>(`/api/voucher-sales-new/?show_all=true`),
                httpClient.get<any>(`/api/customerportal/transactions/by_customer/?customer_id=${customer.id}`)
            ]);

            let ledgerEntriesByLedger: any[] = [];
            if (customer.ledger_id) {
                try {
                    const ledgerData = await httpClient.get<any[]>(`/api/allocations/ledger/${customer.ledger_id}/entries/`);
                    if (Array.isArray(ledgerData)) {
                        ledgerEntriesByLedger = ledgerData;
                    }
                } catch (ledgerErr) {
                    console.warn('Ledger fallback fetch failed:', ledgerErr);
                }
            }

            const normalize = (v: any) => String(v ?? '').trim().toLowerCase();
            const selectedCustomerId = customer.id?.toString();
            const selectedCustomerName = normalize(customer.name);

            const customerInvoices = (salesData || []).filter(inv => {
                const byId =
                    selectedCustomerId &&
                    inv?.customer_id !== null &&
                    inv?.customer_id !== undefined &&
                    inv.customer_id.toString() === selectedCustomerId;
                const byName = selectedCustomerName && normalize(inv?.customer_name) === selectedCustomerName;
                return Boolean(byId || byName);
            });

            const invoiceEntries: LedgerEntry[] = customerInvoices.map((inv: any) => {
                const creditPeriod = parseInt(customer.credit_period || '0', 10);
                const invDate = new Date(inv.date);
                const today = new Date();
                const d1 = new Date(invDate.getFullYear(), invDate.getMonth(), invDate.getDate());
                const d2 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                const diffTime = d2.getTime() - d1.getTime();
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                const isDue = diffDays > creditPeriod;

                return {
                    id: inv.id.toString(),
                    date: inv.date,
                    postFrom: 'Sales' as TransactionType,
                    referenceNo: inv.sales_invoice_no,
                    ledger: 'Sales',
                    status: (() => {
                        // NOTE: payment_balance defaults to 0 in DB, so we CANNOT use it to detect 'Received'.
                        // The processedEntries refBalances logic will upgrade status to 'Received'/'Partially Received'
                        // based on actual receipt transactions with matching referenceNo.
                        // Here we only set the due-date status.
                        // Any voucher showing in the ledger should show its aging status if it's a Sales invoice
                        return diffDays > creditPeriod ? 'Due' : (diffDays === creditPeriod ? 'Due Today' : 'Not Due');
                    })() as SalesStatus,
                    debit: parseFloat(inv.payment_details?.payment_invoice_value || 0),
                    credit: 0,
                    runningBalance: 0,
                    posting_status: inv.posting_status,
                    originalInv: inv,
                    voucherNo: inv.sales_invoice_no,
                    amount: parseFloat(inv.payment_details?.payment_invoice_value || 0)
                };
            });

            const allTransactions = Array.isArray(transactionsData) ? transactionsData : (transactionsData?.allTransactions || []);
            const transactionEntries: LedgerEntry[] = (allTransactions || []).map((t: any) => {
                const rawType = t.transaction_type?.toLowerCase() || '';
                let transType = 'Sales';
                if (rawType.includes('receipt')) transType = 'Receipt';
                else if (rawType.includes('payment')) transType = 'Payment';
                else if (rawType.includes('credit')) transType = 'Credit Note';
                else if (rawType.includes('debit')) transType = 'Debit Note';
                else if (rawType.includes('journal')) transType = 'Journal';

                let d = parseFloat(t.debit || 0);
                let c = parseFloat(t.credit || 0);

                if ((transType === 'Payment' || transType === 'Debit Note') && c > 0 && d === 0) {
                    d = c; c = 0;
                } else if ((transType === 'Receipt' || transType === 'Credit Note') && d > 0 && c === 0) {
                    c = d; d = 0;
                }

                let finalStatus: string;
                if (transType === 'Sales' || rawType === 'invoice') {
                    const paidAmt = parseFloat(t.paid_amount || 0);
                    const totalAmt = parseFloat(t.total_amount || t.amount || 0);
                    const isFullyPaid = paidAmt >= totalAmt;
                    const isPartiallyPaid = paidAmt > 0 && paidAmt < totalAmt;

                    if (isFullyPaid || t.due_status === 'Paid') {
                        finalStatus = 'Received';
                    } else if (isPartiallyPaid || t.due_status === 'Partially Received') {
                        finalStatus = 'Partially Received';
                    } else {
                        const cp = parseInt(customer.credit_period || '0', 10);
                        const invDate = new Date(t.date);
                        const today = new Date();
                        const diffDays = Math.floor((today.getTime() - invDate.getTime()) / (1000 * 60 * 60 * 24));

                        if (diffDays > cp) {
                            finalStatus = 'Due';
                        } else {
                            finalStatus = 'Not Due';
                        }
                    }
                } else if (transType === 'Receipt' || transType === 'Credit Note') {
                    const paidAmt = parseFloat(t.paid_amount || 0);
                    const totalAmt = parseFloat(t.total_amount || t.amount || 0);
                    if (paidAmt >= totalAmt && totalAmt > 0) finalStatus = 'Utilized';
                    else if (paidAmt > 0) finalStatus = 'Partially Utilized';
                    else finalStatus = (t.payment_status && t.payment_status.toLowerCase() !== 'pending') ? t.payment_status : 'Not Utilized';
                } else {
                    finalStatus = (t.payment_status && t.payment_status.toLowerCase() !== 'pending') ? t.payment_status : 'Not Due';
                }

                return {
                    id: `T-${t.id}`,
                    date: t.date,
                    postFrom: transType as TransactionType,
                    referenceNo: t.reference_number || t.transaction_number || t.voucher_number || 'N/A',
                    ledger: transType,
                    status: finalStatus as SalesStatus,
                    debit: d,
                    credit: c,
                    runningBalance: 0,
                    posting_status: 'POSTED',
                    originalInv: t,
                    voucherNo: (t.transaction_number && t.transaction_number.includes('-') && (transType === 'Receipt' || transType === 'Payment'))
                        ? t.transaction_number.substring(0, t.transaction_number.lastIndexOf('-'))
                        : (t.transaction_number || t.voucher_number || t.id?.toString()),
                    amount: parseFloat(t.total_amount || t.amount || 0)
                };
            });

            const fallbackTransactionEntries: LedgerEntry[] = (ledgerEntriesByLedger || [])
                .filter((row: any) => row && row.voucher_type && String(row.voucher_type).toLowerCase() !== 'opening balance')
                .map((row: any) => {
                    const rawType = String(row.voucher_type || '').toLowerCase();
                    let transType = 'Sales';
                    if (rawType.includes('receipt')) transType = 'Receipt';
                    else if (rawType.includes('payment')) transType = 'Payment';
                    else if (rawType.includes('credit')) transType = 'Credit Note';
                    else if (rawType.includes('debit')) transType = 'Debit Note';
                    else if (rawType.includes('journal')) transType = 'Journal';
                    else if (rawType.includes('contra')) transType = 'Contra';

                    return {
                        id: `L-${row.id}`,
                        date: row.date,
                        postFrom: transType as TransactionType,
                        referenceNo: row.voucher_number || row.narration || 'N/A',
                        ledger: transType,
                        status: 'Not Due' as SalesStatus,
                        debit: parseFloat(row.debit || 0),
                        credit: parseFloat(row.credit || 0),
                        runningBalance: 0,
                        posting_status: 'POSTED',
                        originalInv: row,
                        voucherNo: row.voucher_number || row.id?.toString(),
                        amount: parseFloat(row.debit || 0) + parseFloat(row.credit || 0)
                    };
                })
                .filter((entry: LedgerEntry) => entry.postFrom !== 'Sales');

            const dedupeKey = (entry: LedgerEntry) => [
                entry.postFrom,
                (entry.voucherNo || '').toString().toLowerCase(),
                entry.date || '',
                Number(entry.debit || 0).toFixed(2),
                Number(entry.credit || 0).toFixed(2)
            ].join('|');

            const mergedTransactions: LedgerEntry[] = [];
            const seen = new Set<string>();

            [...invoiceEntries, ...transactionEntries, ...fallbackTransactionEntries].forEach((entry) => {
                const key = dedupeKey(entry);
                if (!seen.has(key)) {
                    seen.add(key);
                    mergedTransactions.push(entry);
                }
            });

            setLedgerEntries(mergedTransactions);
        } catch (err: any) {
            console.error('Failed to fetch ledger data:', err);
            setError(err?.message || 'Unable to connect to the server.');
            handleApiError(err, 'Fetch Ledger Data');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {

        fetchLedgerData();
    }, [customer.id, customer.ledger_id, customer.name, customer.credit_period]);

    const handleProceedAllocation = async (selectedAdvance: any, invoiceRef: string) => {
        try {
            // Determine the backend ID (T- is for CustomerTransaction)
            const rawId = selectedAdvance.id;
            const isTransaction = String(rawId).startsWith('T-');
            const transId = isTransaction ? rawId.replace('T-', '') : rawId;

            // Update the transaction's reference_number to match the invoice reference
            await httpClient.patch(`/api/customerportal/transactions/${transId}/`, {
                reference_number: invoiceRef,
                payment_status: 'Utilized'
            });

            showSuccess(`Successfully allocated ${selectedAdvance.voucherNo} to ${invoiceRef}`);
            // Refresh the entire ledger data to reflect changes
            fetchLedgerData();
        } catch (error: any) {
            console.error("Allocation failed:", error);
            showError(error.response?.data?.error || "Failed to proceed with allocation.");
        }
    };

    const processedEntries = useMemo(() => {
        // 1. Build Reference Balance Map to determine real-time status
        const refBalances: Record<string, { total: number, paid: number }> = {};
        ledgerEntries.forEach(entry => {
            const ref = entry.referenceNo?.trim()?.toLowerCase();
            if (!ref || ref === '-' || ref === 'n/a') return;
            if (!refBalances[ref]) refBalances[ref] = { total: 0, paid: 0 };

            if (['Sales', 'Debit Note'].includes(entry.postFrom)) {
                refBalances[ref].total += (entry.debit || 0) - (entry.credit || 0);
            } else if (['Receipt', 'Credit Note', 'Journal'].includes(entry.postFrom)) {
                refBalances[ref].paid += (entry.credit || 0) - (entry.debit || 0);
            }
        });

        let balance = 0;
        return [...ledgerEntries].sort((a, b) => {
            const dateDiff = new Date(a.date).getTime() - new Date(b.date).getTime();
            if (dateDiff !== 0) return dateDiff;
            // Fallback for same date: compare IDs (handling 'T-' prefix)
            const idA = parseInt(a.id.toString().replace('T-', '')) || 0;
            const idB = parseInt(b.id.toString().replace('T-', '')) || 0;
            return idA - idB;
        }).map(entry => {
            balance += (entry.debit || 0) - (entry.credit || 0);

            // 2. Update status for Sales/Debit Note based on global reference balance
            let updatedStatus = entry.status;
            if (['Sales', 'Debit Note', 'invoice', 'debit_note'].includes((entry.postFrom as string).toLowerCase()) || entry.postFrom === 'Sales' || entry.postFrom === 'Debit Note') {
                const ref = entry.referenceNo?.trim()?.toLowerCase();
                if (ref && refBalances[ref]) {
                    const { total, paid } = refBalances[ref];

                    // Use a small epsilon for float comparison
                    const totalRounded = Math.round((total || 0) * 100);
                    const paidRounded = Math.round((paid || 0) * 100);

                    const cp = parseInt(customer.credit_period || '0', 10);
                    const invDate = new Date(entry.date);
                    const todayD = new Date();
                    const d1 = new Date(invDate.getFullYear(), invDate.getMonth(), invDate.getDate());
                    const d2 = new Date(todayD.getFullYear(), todayD.getMonth(), todayD.getDate());
                    const diffDays = Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));

                    if (paidRounded >= totalRounded) {
                        updatedStatus = 'Received';
                    } else if (paidRounded > 0) {
                        updatedStatus = 'Partially Received';
                    } else if (diffDays > cp) {
                        // After credit period
                        updatedStatus = 'Due';
                    } else {
                        // Within credit period
                        updatedStatus = 'Not Due';
                    }
                }
            }

            return { ...entry, runningBalance: balance, status: updatedStatus as SalesStatus };
        });
    }, [ledgerEntries]);

    interface MonthLedgerEntry {
        month: string;
        debit: number;
        credit: number;
        closingBalance: number;
    }

    const monthLedgerData: MonthLedgerEntry[] = useMemo(() => {
        const monthsMap: Record<string, { debit: number; credit: number }> = {};

        // Determine the relevant financial year
        // If data exists, use the latest entry as reference, else current year
        const latestDate = processedEntries.length > 0
            ? new Date(processedEntries[processedEntries.length - 1].date)
            : new Date();

        let startYear = latestDate.getFullYear();
        if (latestDate.getMonth() < 3) { // If Jan-Mar, start year of FY is previous year
            startYear -= 1;
        }

        const monthsOrder = [
            'April', 'May', 'June', 'July', 'August', 'September',
            'October', 'November', 'December', 'January', 'February', 'March'
        ];

        // Pre-populate all 12 months of the Financial Year
        const monthsToDisplay: string[] = [];
        monthsOrder.forEach((m, idx) => {
            const yr = idx < 9 ? startYear : startYear + 1;
            const key = `${m} ${yr}`;
            monthsToDisplay.push(key);
            monthsMap[key] = { debit: 0, credit: 0 };
        });

        // Add actual data
        processedEntries.forEach(entry => {
            const mKey = new Date(entry.date).toLocaleString('default', { month: 'long', year: 'numeric' });
            if (monthsMap[mKey]) {
                monthsMap[mKey].debit += entry.debit;
                monthsMap[mKey].credit += entry.credit;
            } else {
                // If entry is outside our pre-populated FY, add it anyway
                monthsMap[mKey] = { debit: entry.debit, credit: entry.credit };
                monthsToDisplay.push(mKey);
            }
        });

        // Sort unique months chronologically
        const sortedDisplay = Array.from(new Set(monthsToDisplay)).sort((a, b) => {
            return new Date(a).getTime() - new Date(b).getTime();
        });

        let cumulativeBalance = 0;
        return sortedDisplay.map(month => {
            const data = monthsMap[month];
            cumulativeBalance += data.debit - data.credit;
            return { month, debit: data.debit, credit: data.credit, closingBalance: cumulativeBalance };
        });
    }, [processedEntries]);

    const handleMonthClick = (month: string) => {
        const [monthName, year] = month.split(' ');
        const monthMap: Record<string, string> = { 'January': '01', 'February': '02', 'March': '03', 'April': '04', 'May': '05', 'June': '06', 'July': '07', 'August': '08', 'September': '09', 'October': '10', 'November': '11', 'December': '12' };
        const monthNum = monthMap[monthName];
        if (monthNum && year) {
            setDateFilter({ start: `${year}-${monthNum}-01`, end: `${year}-${monthNum}-${new Date(parseInt(year), parseInt(monthNum), 0).getDate().toString().padStart(2, '0')}` });
            setSelectedMonthView(month);
            setViewMode('invoice-wise');
        }
    };

    const handleRowClick = (transactionId: string) => {
        setSelectedTransactionId(transactionId);
    };

    const formatCurrency = (amount: number): string => amount === 0 ? '-' : `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

    const getFilteredData = () => processedEntries.filter(entry => {
        if (dateFilter.start && entry.date < dateFilter.start) return false;
        if (dateFilter.end && entry.date > dateFilter.end) return false;
        if (postFromFilter && entry.postFrom !== postFromFilter) return false;
        if (ledgerFilter && !entry.ledger.toLowerCase().includes(ledgerFilter.toLowerCase())) return false;
        if (statusFilter && entry.status !== statusFilter) return false;
        if (debitFilter && entry.debit < parseFloat(debitFilter)) return false;
        if (creditFilter && entry.credit < parseFloat(creditFilter)) return false;
        return true;
    });

    const filteredData = getFilteredData();
    const totalDebit = filteredData.reduce((sum, entry) => sum + entry.debit, 0);
    const totalCredit = filteredData.reduce((sum, entry) => sum + entry.credit, 0);

    const getStatusBadgeColor = (status: string) => {
        const colors: Record<string, string> = {
            'Paid': 'bg-green-100 text-green-800',
            'Unpaid': 'bg-red-100 text-red-800',
            'Partially Paid': 'bg-yellow-100 text-yellow-800',
            'Approved': 'bg-blue-100 text-indigo-800',
            'Not Due': 'bg-gray-100 text-gray-800',
            'Due': 'bg-red-100 text-red-800',
            'Due Today': 'bg-red-100 text-red-800',
            'Partially Due': 'bg-red-100 text-red-800',
            'Partially Received': 'bg-yellow-100 text-yellow-800',
            'Received': 'bg-green-100 text-green-800',
            'Utilized': 'bg-green-100 text-green-800',
            'Not Utilized': 'bg-gray-100 text-gray-800',
            'Advance': 'bg-indigo-100 text-indigo-800',
            'Partially Advanced': 'bg-indigo-50 text-indigo-700',
            'Partially Utilized': 'bg-yellow-100 text-yellow-800'

        };
        return colors[status] || 'bg-gray-100 text-gray-800';
    };

    const postFromOptions: TransactionType[] = ['Sales', 'Receipt', 'Purchase', 'Payment', 'Debit Note', 'Credit Note', 'Journal'];
    const statusOptions = ['Not Due', 'Due', 'Due Today', 'Partially Received', 'Received', 'Utilized', 'Not Utilized', 'Advance', 'Partially Advanced', 'Partially Utilized'];

    interface AdvanceAllocationModalProps {
        isOpen: boolean;
        onClose: () => void;
        row: any;
        customer: any;
        ledgerEntries: LedgerEntry[];
        setPrefilledVoucherData?: (data: any) => void;
        onNavigate?: (tab: string) => void;
        onProceed?: (selectedAdvance: any, invoiceRef: string) => void;
    }

    const AdvanceAllocationModal: React.FC<AdvanceAllocationModalProps> = ({ isOpen, onClose, row, customer, ledgerEntries, setPrefilledVoucherData, onNavigate, onProceed }) => {
        if (!isOpen || !row) return null;

        const [selectedAdvance, setSelectedAdvance] = useState<any>(null);

        // Find exclusively pure unutilized or generic advance receipts for this customer (omitting those already allocated or with custom advance references)
        const advances = (ledgerEntries || []).filter(e =>
            e.postFrom === 'Receipt' &&
            // Must be an advance/unutilized type
            (e.status === 'Not Utilized' || e.status === 'Partially Utilized' || e.status === 'Advance' || e.status === 'Partially Advanced' || e.is_advance) &&
            // AND must NOT have an invoice reference yet
            (!e.originalInv?.reference_number ||
                ['ADVANCE', '', '-', 'N/A'].includes(e.originalInv.reference_number.toUpperCase().trim())
            )
        );

        return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
                <div className="bg-white w-[800px] max-w-[90vw] rounded-lg shadow-2xl overflow-hidden border border-gray-200 animate-in fade-in zoom-in duration-200">

                    <div className="bg-indigo-600 px-6 py-4 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <Receipt className="w-5 h-5 text-indigo-100" />
                            <h3 className="text-white font-bold text-lg">Advance Allocation Details</h3>
                        </div>
                        <button onClick={onClose} className="text-white hover:text-gray-200 transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="p-6">
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">

                            <div className="bg-gray-50 p-3 rounded border border-gray-100">
                                <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block mb-1">Invoice Ref</label>
                                <div className="text-sm font-bold text-gray-900">{row.refNo}</div>
                            </div>
                            <div className="bg-gray-50 p-3 rounded border border-gray-100">
                                <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block mb-1">Customer</label>
                                <div className="text-sm font-bold text-gray-900 truncate">{customer.name}</div>
                            </div>
                            <div className="bg-gray-50 p-3 rounded border border-gray-100">
                                <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block mb-1">Inv Amount</label>
                                <div className="text-sm font-bold text-gray-900">₹{row.netAmount?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                            </div>
                            <div className="bg-gray-50 p-3 rounded border border-gray-100">
                                <label className="text-[10px] text-gray-400 font-bold uppercase tracking-wider block mb-1">Pending</label>
                                <div className="text-sm font-bold text-red-600">₹{row.pendingBalance?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>

                            </div>
                        </div>

                        {advances.length > 0 ? (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Available Receipt Vouchers</h4>
                                    <span className="text-[10px] bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full font-bold">{advances.length} Found</span>
                                </div>
                                <div className="max-h-[500px] overflow-y-auto border border-gray-200 rounded">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                                            <tr className="text-left text-xs text-gray-600 uppercase tracking-wider">
                                                <th className="px-4 py-3 font-semibold">Select</th>
                                                <th className="px-4 py-3 font-semibold">Voucher Number</th>
                                                <th className="px-4 py-3 font-semibold">Date</th>
                                                <th className="px-4 py-3 text-right font-semibold">Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100 bg-white">
                                            {advances.map((adv, idx) => (
                                                <tr
                                                    key={idx}
                                                    onClick={() => setSelectedAdvance(adv)}
                                                    className={`hover:bg-gray-50 cursor-pointer transition-colors ${selectedAdvance?.id === adv.id
                                                        ? 'bg-indigo-50/50'
                                                        : ''
                                                        }`}
                                                >
                                                    <td className="px-4 py-3">
                                                        <input
                                                            type="radio"
                                                            name="advance-selection"
                                                            checked={selectedAdvance?.id === adv.id}
                                                            onChange={() => setSelectedAdvance(adv)}
                                                            className="w-4 h-4 text-indigo-600 border-gray-300 focus:ring-indigo-500 cursor-pointer"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3 font-medium text-gray-900">{adv.voucherNo}</td>
                                                    <td className="px-4 py-3 text-gray-500">
                                                        {adv.date.split('-').reverse().join('-')}
                                                    </td>
                                                    <td className="px-4 py-3 text-right text-gray-900 font-bold">
                                                        ₹{adv.credit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                                <Search className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                                <p className="text-sm text-gray-500 font-medium">No linked advance receipts found</p>
                                <p className="text-[10px] text-gray-400 mt-1">Receipts matching reference "{row.refNo}" will appear here.</p>
                            </div>
                        )}
                        <div className="mt-8 flex gap-3">
                            <button

                                onClick={onClose}
                                className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded hover:bg-gray-200 transition-colors uppercase tracking-widest text-[10px]"
                            >
                                Close Window
                            </button>
                            <button
                                onClick={() => {
                                    if (setPrefilledVoucherData && onNavigate) {
                                        setPrefilledVoucherData({
                                            voucherType: 'Receipt',
                                            sellerName: customer.name,
                                            invoiceDate: new Date().toISOString().split('T')[0]
                                        });
                                        onNavigate('Vouchers');
                                        onClose();
                                    }
                                }}
                                className="flex-1 py-3 bg-indigo-50 text-indigo-700 font-bold rounded hover:bg-indigo-100 transition-colors uppercase tracking-widest text-[10px]"
                            >
                                Create New Advance
                            </button>
                            {advances.length > 0 && (
                                <button
                                    onClick={() => {
                                        if (!selectedAdvance) {
                                            showInfo("Please select an advance to proceed.");
                                            return;
                                        }
                                        if (onProceed) {
                                            onProceed(selectedAdvance, row.refNo);
                                        }
                                        onClose();
                                    }}
                                    className={`flex-1 py-3 font-bold rounded transition-colors uppercase tracking-widest text-[10px] shadow-lg ${selectedAdvance
                                        ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200'
                                        : 'bg-gray-200 text-gray-400 cursor-not-allowed shadow-none'
                                        }`}
                                >
                                    Proceed Allocation
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const AllocationLedgerView: React.FC = () => {

        /**
         * Group ledgerEntries by their reference relationships.
         * Logic:
         * 1. Sources: Only 'Sales', 'Debit Note' entries.
         * 2. Items: 'Receipt', 'Credit Note', 'Journal'.
         * 3. Match: item.referenceNo === source.referenceNo
         */
        const allocationRows = useMemo(() => {
            if (!ledgerEntries || ledgerEntries.length === 0) return [];

            // Group entries by referenceNo strictly to find linked vouchers
            const groups: Record<string, any[]> = {};
            ledgerEntries.forEach(entry => {
                const ref = entry.referenceNo?.trim() || '-';
                if (ref === '-') {
                    const uniqueId = `standalone-${entry.id}`;
                    groups[uniqueId] = [entry];
                    return;
                }
                const groupKey = ref.toLowerCase();
                if (!groups[groupKey]) groups[groupKey] = [];
                groups[groupKey].push(entry);
            });

            const rows: any[] = [];

            // Process groups and sort by source date
            const sortedGroupRefs = Object.keys(groups).sort((aRef, bRef) => {
                const firstA = groups[aRef][0];
                const firstB = groups[bRef][0];
                const dDiff = new Date(firstA?.date || 0).getTime() - new Date(firstB?.date || 0).getTime();
                if (dDiff !== 0) return dDiff;
                // Within same date, maintain chronological order via ID
                return parseInt(firstA?.id?.toString().replace('t-', '') || '0') - parseInt(firstB?.id?.toString().replace('t-', '') || '0');
            });

            sortedGroupRefs.forEach(ref => {
                const entries = groups[ref];

                // If it's a standalone group
                if (ref.startsWith('standalone-')) {
                    const entry = entries[0];
                    if (entry.postFrom !== 'Sales') return;

                    const amt = (entry.debit || 0) - (entry.credit || 0);
                    rows.push({
                        date: entry.date,
                        postedFrom: entry.postFrom,
                        refNo: entry.referenceNo !== '-' ? entry.referenceNo : (entry.voucherNo || '-'),
                        netAmount: amt,
                        appliedDate: '-',
                        appliedRefNo: '-',
                        appliedAmount: '-',
                        pendingBalance: amt,
                        status: amt === 0 ? 'Received' : entry.status,
                        rowSpan: 1,
                        isFirstInSource: true
                    });
                    return;
                }

                // For linked groups
                const sources = entries.filter(e => ['Sales'].includes(e.postFrom))
                    .sort((a, b) => {
                        const d = new Date(a.date).getTime() - new Date(b.date).getTime();
                        return d !== 0 ? d : parseInt(a.id.replace('t-', '')) - parseInt(b.id.replace('t-', ''));
                    });

                if (sources.length === 0) return;

                const applications = entries.filter(e => ['Receipt', 'Credit Note', 'Journal'].includes(e.postFrom))
                    .sort((a, b) => {
                        const d = new Date(a.date).getTime() - new Date(b.date).getTime();
                        return d !== 0 ? d : parseInt(a.id.replace('t-', '')) - parseInt(b.id.replace('t-', ''));
                    });

                // Combine all sources in the group for one span
                const totalSourceAmt = sources.reduce((sum, s) => sum + ((s.debit || 0) - (s.credit || 0)), 0);
                const firstSource = sources[0];

                if (applications.length === 0) {
                    rows.push({
                        date: firstSource.date,
                        postedFrom: firstSource.postFrom,
                        refNo: firstSource.referenceNo !== '-' ? firstSource.referenceNo : (firstSource.voucherNo || '-'),
                        netAmount: totalSourceAmt,
                        appliedDate: '-',
                        appliedRefNo: '-',
                        appliedAmount: '-',
                        pendingBalance: totalSourceAmt,
                        status: totalSourceAmt === 0 ? 'Received' : firstSource.status,
                        rowSpan: 1,
                        isFirstInSource: true
                    });
                } else {
                    let lastPending = totalSourceAmt;
                    const totalAppAmt = applications.reduce((sum, a) => sum + ((a.credit || 0) - (a.debit || 0)), 0);
                    const totalSourceAmtRounded = Math.round(totalSourceAmt * 100);
                    const totalAppAmtRounded = Math.round(totalAppAmt * 100);
                    const calculatedStatus = totalSourceAmtRounded <= totalAppAmtRounded
                        ? 'Received'
                        : (totalAppAmtRounded > 0
                            ? (firstSource.status === 'Not Due' ? 'Not Due' : 'Partially Received')
                            : firstSource.status);

                    applications.forEach((app, appIdx) => {
                        const appAmt = (app.credit || 0) - (app.debit || 0);
                        const currentPending = Math.max(0, lastPending - appAmt);
                        rows.push({
                            date: firstSource.date,
                            postedFrom: firstSource.postFrom,
                            refNo: firstSource.referenceNo !== '-' ? firstSource.referenceNo : (firstSource.voucherNo || '-'),
                            netAmount: totalSourceAmt,
                            appliedDate: app.date,
                            appliedRefNo: app.voucherNo || '-',
                            appliedAmount: appAmt,
                            pendingBalance: currentPending,
                            status: calculatedStatus,
                            rowSpan: applications.length,
                            isFirstInSource: appIdx === 0
                        });
                        lastPending = currentPending;
                    });
                }
            });

            return rows;
        }, [ledgerEntries]);

        return (
            <div className="bg-white border border-slate-200 rounded-[4px] overflow-hidden shadow-none">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-200">
                        <thead className="bg-[#F8F9FA] border-b border-slate-200">
                            <tr className="border-b border-slate-200">
                                <th rowSpan={2} className="px-6 py-4 text-left text-[11px] font-black text-slate-500 uppercase tracking-widest border-r border-slate-200">Date</th>
                                <th rowSpan={2} className="px-6 py-4 text-left text-[11px] font-black text-slate-500 uppercase tracking-widest border-r border-slate-200">Posted From</th>
                                <th rowSpan={2} className="px-6 py-4 text-left text-[11px] font-black text-slate-500 uppercase tracking-widest border-r border-slate-200">Reference No.</th>
                                <th rowSpan={2} className="px-6 py-4 text-right text-[11px] font-black text-slate-500 uppercase tracking-widest border-r border-slate-200">Amount</th>
                                <th colSpan={4} className="px-6 py-2 border-r border-slate-200 bg-indigo-50/30">
                                    <div className="flex justify-center items-center h-full text-[11px] font-black text-indigo-600 uppercase tracking-widest">
                                        Voucher Applied
                                    </div>
                                </th>
                                <th rowSpan={2} className="px-6 py-4 text-left text-[11px] font-black text-slate-500 uppercase tracking-widest border-r border-slate-200">Status</th>
                                <th rowSpan={2} className="px-6 py-4 text-center text-[11px] font-black text-slate-500 uppercase tracking-widest">Actions</th>
                            </tr>
                            <tr>
                                <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest border-r border-slate-200">Date</th>
                                <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest border-r border-slate-200">Ref No.</th>
                                <th className="px-6 py-3 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest border-r border-slate-200">Amount</th>
                                <th className="px-6 py-3 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest border-r border-slate-200">Pending</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                            {allocationRows.map((row, idx) => (
                                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                    {row.isFirstInSource && (
                                        <>
                                            <td rowSpan={row.rowSpan} className="px-6 py-4 text-sm font-medium text-slate-600 border-r border-slate-100 align-top">{formatDate(row.date)}</td>
                                            <td rowSpan={row.rowSpan} className="px-6 py-4 text-sm text-slate-600 border-r border-slate-100 align-top">
                                                <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${row.postedFrom === 'Sales'
                                                    ? 'bg-blue-50 text-blue-600 border-blue-100'
                                                    : 'bg-amber-50 text-amber-600 border-amber-100'
                                                    }`}>
                                                    {row.postedFrom}
                                                </span>
                                            </td>
                                            <td rowSpan={row.rowSpan} className="px-6 py-4 text-sm font-bold text-indigo-600 border-r border-slate-100 align-top">{row.refNo}</td>
                                            <td rowSpan={row.rowSpan} className="px-6 py-4 text-sm text-right font-medium text-slate-900 border-r border-slate-100 align-top">
                                                ₹{row.netAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                            </td>
                                        </>
                                    )}
                                    <td className="px-6 py-4 text-sm text-slate-600 border-r border-slate-100">{row.appliedDate !== '-' ? formatDate(row.appliedDate) : '-'}</td>
                                    <td className="px-6 py-4 text-sm font-medium text-slate-700 border-r border-slate-100">{row.appliedRefNo}</td>
                                    <td className="px-6 py-4 text-sm text-right font-bold text-emerald-600 border-r border-slate-100">
                                        {row.appliedAmount !== '-' ? `₹${row.appliedAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-right font-bold text-slate-900 border-r border-slate-100">
                                        ₹{row.pendingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                    </td>
                                    {row.isFirstInSource && (
                                        <>
                                            <td rowSpan={row.rowSpan} className="px-6 py-4 text-center border-r border-slate-100 align-top">
                                                <span className={`px-2 py-0.5 rounded text-[11px] font-bold border uppercase tracking-tighter shadow-sm ${row.status?.toLowerCase() === 'paid' || row.status?.toLowerCase() === 'received' || row.status?.toLowerCase() === 'utilized' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                                                    row.status?.toLowerCase() === 'partially paid' || row.status?.toLowerCase() === 'partially received' || row.status?.toLowerCase() === 'partially due' ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                                                        row.status?.toLowerCase() === 'due' || row.status?.toLowerCase() === 'due today' ? 'bg-rose-50 text-rose-600 border border-rose-100' :
                                                            'bg-indigo-50 text-indigo-600 border border-indigo-100'
                                                    }`}>
                                                    {row.status}
                                                </span>
                                            </td>
                                            <td rowSpan={row.rowSpan} className="px-6 py-4 text-center align-top">
                                                {(row.status?.toLowerCase() === 'partially received' || row.status?.toLowerCase() === 'due') && (
                                                    <button
                                                        onClick={() => handleAdvanceClick(row)}
                                                        className="px-3 py-1 bg-indigo-600 text-white text-[10px] font-bold rounded shadow-sm hover:bg-indigo-700 transition-colors uppercase tracking-widest flex items-center gap-1 mx-auto"
                                                    >
                                                        Reference
                                                    </button>
                                                )}
                                            </td>
                                        </>
                                    )}
                                </tr>
                            ))}
                            {allocationRows.length === 0 && (
                                <tr>
                                    <td colSpan={10} className="px-6 py-16 text-center text-gray-400 text-sm font-medium italic">No sales documents found to allocate.</td>
                                </tr>
                            )}
                        </tbody>
                        <tfoot className="bg-[#F8F9FA] border-t border-slate-200">
                            <tr>
                                <td colSpan={3} className="px-6 py-5 text-[11px] font-black text-gray-400 text-center tracking-widest uppercase">AGGREGATE SALES LEDGER STATUS</td>
                                <td className="px-6 py-5 text-right text-[14px] font-black text-slate-800">
                                    ₹{ledgerEntries.filter(e => ['Sales', 'Debit Note'].includes(e.postFrom))
                                        .reduce((sum, e) => sum + ((e.debit || 0) - (e.credit || 0)), 0)
                                        .toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </td>
                                <td colSpan={3} className="bg-indigo-50/10 border-x border-gray-100/50"></td>
                                <td className="px-6 py-5 text-right text-[14px] font-black text-rose-600 drop-shadow-sm">
                                    ₹{allocationRows.reduce((sum, r, idx, arr) => {
                                        const isLastInGroup = (idx === arr.length - 1) || (arr[idx + 1].isFirstInSource);
                                        return isLastInGroup ? sum + r.pendingBalance : sum;
                                    }, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </td>
                                <td></td>
                                <td></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        );
    };

    const MonthLedgerView: React.FC = () => {
        const filteredMonthData = monthLedgerData.filter(entry =>
            monthFilter.length === 0 || monthFilter.includes(entry.month)
        );

        const totalDebit = filteredMonthData.reduce((sum, item) => sum + item.debit, 0);
        const totalCredit = filteredMonthData.reduce((sum, item) => sum + item.credit, 0);

        return (
            <div className="bg-white border border-gray-200 rounded-[4px] overflow-hidden shadow-none border border-slate-200">
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
                            {filteredMonthData.map((entry, index) => (
                                <tr
                                    key={index}
                                    onClick={() => handleMonthClick(entry.month)}
                                    className="hover:bg-indigo-50 transition-colors group cursor-pointer"
                                >
                                    <td className="px-6 py-5 whitespace-nowrap text-sm font-bold text-gray-700 group-hover:text-indigo-600">{entry.month}</td>
                                    <td className="px-6 py-5 whitespace-nowrap text-sm text-right text-gray-600 font-medium">₹{entry.debit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                    <td className="px-6 py-5 whitespace-nowrap text-sm text-right text-gray-600 font-medium">₹{entry.credit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                    <td className="px-6 py-5 whitespace-nowrap text-sm text-right font-bold text-gray-900">
                                        ₹{Math.abs(entry.closingBalance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                        <span className="ml-1 text-gray-500 text-xs font-normal">
                                            {entry.closingBalance >= 0 ? 'Dr' : 'Cr'}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                            {filteredMonthData.length === 0 && (
                                <tr>
                                    <td colSpan={4} className="px-6 py-8 text-center text-gray-500 text-sm">No matching months found</td>
                                </tr>
                            )}
                        </tbody>
                        <tfoot className="bg-[#F8F9FA]">
                            <tr>
                                <td className="px-6 py-5 text-sm font-bold text-gray-500 text-center tracking-wide">TOTAL</td>
                                <td className="px-6 py-5 whitespace-nowrap text-sm text-right font-bold text-gray-900">₹{totalDebit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                <td className="px-6 py-5 whitespace-nowrap text-sm text-right font-bold text-gray-900">₹{totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                <td className="px-6 py-5 whitespace-nowrap text-sm text-right"></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        );
    };

    return (
        <div className="text-left">
            {showNetOffModal ? (
                <NetOffModal
                    isOpen={true}
                    onClose={() => setShowNetOffModal(false)}
                    customerName={customer.name}
                />
            ) : (
                <>
                    <div className="flex justify-between items-center mb-6">
                        <button onClick={onBack} className="flex items-center text-gray-600 hover:text-gray-900 transition-colors">
                            <ChevronLeft className="w-5 h-5 mr-1" />
                            <span className="text-lg font-medium">{customer.name}</span>
                        </button>
                        <div className="flex gap-3">
                            {viewMode === 'month-wise' && (
                                <div className="relative month-dropdown-container">
                                    <button
                                        onClick={() => setShowMonthDropdown(!showMonthDropdown)}
                                        className="pl-3 pr-8 py-2 border border-gray-300 rounded-[4px] text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-48 bg-white cursor-pointer text-left"
                                    >
                                        {monthFilter.length === 0 ? 'Select Month' : `${monthFilter.length} month(s) selected`}
                                    </button>
                                    <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none" />

                                    {showMonthDropdown && (
                                        <div className="absolute z-50 top-full mt-1 w-48 bg-white border border-gray-300 rounded-[4px] shadow-lg max-h-64 overflow-y-auto">
                                            <div className="p-2">
                                                <label className="flex items-center px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={monthFilter.length === monthLedgerData.length}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setMonthFilter(monthLedgerData.map(m => m.month));
                                                            } else {
                                                                setMonthFilter([]);
                                                            }
                                                        }}
                                                        className="mr-2 rounded text-indigo-600 focus:ring-indigo-500"
                                                    />
                                                    <span className="text-sm font-medium">Select All</span>
                                                </label>
                                                <div className="border-t border-gray-200 my-1"></div>
                                                {monthLedgerData.map((entry, index) => (
                                                    <label key={index} className="flex items-center px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={monthFilter.includes(entry.month)}
                                                            onChange={(e) => {
                                                                if (e.target.checked) {
                                                                    setMonthFilter([...monthFilter, entry.month]);
                                                                } else {
                                                                    setMonthFilter(monthFilter.filter(m => m !== entry.month));
                                                                }
                                                            }}
                                                            className="mr-2 rounded text-indigo-600 focus:ring-indigo-500"
                                                        />
                                                        <span className="text-sm">{entry.month}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setIsJournalView(!isJournalView)}
                                    className="px-4 py-2 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm flex items-center gap-2"
                                >
                                    {isJournalView ? (
                                        <>
                                            <ArrowLeft className="w-4 h-4 text-indigo-500" />
                                            <span>SHOW SUMMARY</span>
                                        </>
                                    ) : (
                                        <>
                                            <FileText className="w-4 h-4 text-indigo-500" />
                                            <span>JOURNAL VIEW</span>
                                        </>
                                    )}
                                </button>
                                <button
                                    onClick={() => setViewMode(viewMode === 'allocation' ? 'invoice-wise' : 'allocation')}
                                    className={`px-4 py-2 text-xs font-semibold rounded-lg border transition-all shadow-sm ${viewMode === 'allocation'
                                        ? 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
                                        : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300'
                                        }`}
                                >
                                    ALLOCATION VIEW
                                </button>
                                <button
                                    onClick={() => setShowNetOffModal(true)}
                                    className="px-4 py-2 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm uppercase px-5"
                                >
                                    NET-OFF
                                </button>
                                <button
                                    onClick={() => {
                                        if (selectedMonthView) {
                                            setDateFilter({ start: '', end: '' });
                                            setSelectedMonthView(null);
                                            setViewMode('invoice-wise');
                                        } else {
                                            setViewMode(viewMode === 'invoice-wise' ? 'month-wise' : 'invoice-wise');
                                        }
                                    }}
                                    className="px-4 py-2 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm flex items-center gap-2"
                                >
                                    {selectedMonthView ? (
                                        <>
                                            <ArrowLeft className="w-4 h-4 text-indigo-500" />
                                            <span>BACK</span>
                                        </>
                                    ) : (
                                        viewMode === 'invoice-wise' ? (
                                            <>
                                                <Calendar className="w-4 h-4 text-indigo-500" />
                                                <span>MONTH VIEW</span>
                                            </>
                                        ) : (
                                            <>
                                                <Receipt className="w-4 h-4 text-indigo-500" />
                                                <span>INVOICE VIEW</span>
                                            </>
                                        )
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>

                    {viewMode === 'month-wise' ? (
                        <MonthLedgerView />
                    ) : viewMode === 'allocation' ? (
                        <AllocationLedgerView />
                    ) : (
                        isLoading ? (
                            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl shadow-sm border border-gray-100">
                                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mb-4"></div>
                                <p className="text-gray-500">Loading ledger entries...</p>
                            </div>
                        ) : error ? (
                            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-xl shadow-sm border border-red-100">
                                <div className="bg-red-50 p-4 rounded-full mb-4">
                                    <X className="w-8 h-8 text-red-500" />
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">Failed to Load Ledger</h3>
                                <p className="text-gray-500 mb-6 max-w-md text-center">{error}</p>
                                <button
                                    onClick={() => window.location.reload()}
                                    className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                                >
                                    Retry Connection
                                </button>
                            </div>
                        ) : (
                            <div className="bg-white border border-gray-200 rounded-[4px] overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        {isJournalView ? (
                                            // APP STYLE JOURNAL HEADERS
                                            <thead className="bg-[#F8F9FA]">
                                                <tr>
                                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-r border-gray-100">Date</th>
                                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-r border-gray-100 min-w-[350px]">Transaction Particulars</th>
                                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-r border-gray-100">Type</th>
                                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-r border-gray-100">Vch No.</th>
                                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-r border-gray-100">Status</th>
                                                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider border-r border-gray-100">Debit (₹)</th>
                                                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider border-r border-gray-100">Credit (₹)</th>
                                                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">Running Balance</th>
                                                </tr>
                                            </thead>
                                        ) : (
                                            // ORIGINAL HEADERS
                                            <thead className="bg-[#F8F9FA] sticky top-0">
                                                <tr>
                                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-r border-gray-200">
                                                        <div className="flex items-center justify-between relative text-gray-400">
                                                            <span>Date</span>
                                                            <div className="ml-2">
                                                                <Filter
                                                                    className={`w-4 h-4 cursor-pointer ${activeFilter === 'date' ? 'text-indigo-600' : 'text-gray-300 hover:text-gray-600'}`}
                                                                    onClick={() => toggleFilter('date')}
                                                                />
                                                                {activeFilter === 'date' && (
                                                                    <div className="absolute z-50 top-8 left-0 bg-white shadow-xl border border-gray-200 rounded-[4px] p-3 w-52">
                                                                        <div className="flex justify-between items-center mb-2">
                                                                            <span className="text-xs font-semibold text-gray-700">Filter Date</span>
                                                                            <X className="w-3 h-3 cursor-pointer text-gray-400 hover:text-gray-600" onClick={() => setActiveFilter(null)} />
                                                                        </div>
                                                                        <div className="space-y-2">
                                                                            <div>
                                                                                <label className="text-[10px] text-gray-500 block mb-1">Start Date</label>
                                                                                <input type="date" value={dateFilter.start} onChange={(e) => setDateFilter({ ...dateFilter, start: e.target.value })} max={new Date().toISOString().split('T')[0]} className="w-full px-2 py-1 text-xs border rounded focus:ring-1 focus:ring-indigo-500" />
                                                                            </div>
                                                                            <div>
                                                                                <label className="text-[10px] text-gray-500 block mb-1">End Date</label>
                                                                                <input type="date" value={dateFilter.end} onChange={(e) => setDateFilter({ ...dateFilter, end: e.target.value })} max={new Date().toISOString().split('T')[0]} className="w-full px-2 py-1 text-xs border rounded focus:ring-1 focus:ring-indigo-500" />
                                                                            </div>
                                                                            <button
                                                                                onClick={() => setDateFilter({ start: '', end: '' })}
                                                                                className="w-full mt-2 py-1 text-[10px] text-indigo-600 font-medium hover:bg-indigo-50 border border-indigo-100 rounded transition-colors"
                                                                            >
                                                                                Clear Filter
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </th>
                                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-r border-gray-200">
                                                        <div className="flex items-center justify-between relative text-gray-400">
                                                            <span>Post From</span>
                                                            <div className="ml-2">
                                                                <Filter
                                                                    className={`w-4 h-4 cursor-pointer ${activeFilter === 'postFrom' ? 'text-indigo-600' : 'text-gray-300 hover:text-gray-600'}`}
                                                                    onClick={() => toggleFilter('postFrom')}
                                                                />
                                                                {activeFilter === 'postFrom' && (
                                                                    <div className="absolute z-50 top-8 left-0 bg-white shadow-xl border border-gray-200 rounded-[4px] p-3 w-48">
                                                                        <div className="flex justify-between items-center mb-2">
                                                                            <span className="text-xs font-semibold text-gray-700">Filter Type</span>
                                                                            <X className="w-3 h-3 cursor-pointer text-gray-400 hover:text-gray-600" onClick={() => setActiveFilter(null)} />
                                                                        </div>
                                                                        <select value={postFromFilter} onChange={(e) => setPostFromFilter(e.target.value as TransactionType | '')} className="w-full px-2 py-1.5 text-xs border rounded focus:ring-1 focus:ring-indigo-500">
                                                                            <option value="">All Types</option>
                                                                            {postFromOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                                        </select>
                                                                        <button
                                                                            onClick={() => setPostFromFilter('')}
                                                                            className="w-full mt-2 py-1 text-[10px] text-indigo-600 font-medium hover:bg-indigo-50 border border-indigo-100 rounded transition-colors"
                                                                        >
                                                                            Clear Filter
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </th>
                                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-r border-gray-200">Reference No</th>
                                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-r border-gray-200 min-w-[300px]">
                                                        <div className="flex items-center justify-between relative text-gray-400">
                                                            <span>Ledger</span>
                                                            <div className="ml-2">
                                                                <Filter
                                                                    className={`w-4 h-4 cursor-pointer ${activeFilter === 'ledger' ? 'text-indigo-600' : 'text-gray-300 hover:text-gray-600'}`}
                                                                    onClick={() => toggleFilter('ledger')}
                                                                />
                                                                {activeFilter === 'ledger' && (
                                                                    <div className="absolute z-50 top-8 left-0 bg-white shadow-xl border border-gray-200 rounded-[4px] p-3 w-52">
                                                                        <div className="flex justify-between items-center mb-2">
                                                                            <span className="text-xs font-semibold text-gray-700">Search Ledger</span>
                                                                            <X className="w-3 h-3 cursor-pointer text-gray-400 hover:text-gray-600" onClick={() => setActiveFilter(null)} />
                                                                        </div>
                                                                        <div className="relative">
                                                                            <input type="text" value={ledgerFilter} onChange={(e) => setLedgerFilter(e.target.value)} placeholder="Search..." className="w-full pl-7 pr-2 py-1.5 text-xs border rounded focus:ring-1 focus:ring-indigo-500" autoFocus />
                                                                            <Search className="w-3 h-3 text-gray-400 absolute left-2 top-1/2 transform -translate-y-1/2" />
                                                                        </div>
                                                                        <button
                                                                            onClick={() => setLedgerFilter('')}
                                                                            className="w-full mt-2 py-1 text-[10px] text-indigo-600 font-medium hover:bg-indigo-50 border border-indigo-100 rounded transition-colors"
                                                                        >
                                                                            Clear Filter
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </th>
                                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider border-r border-gray-200">
                                                        <div className="flex items-center justify-between relative text-gray-400">
                                                            <span>Status</span>
                                                        </div>
                                                    </th>
                                                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider border-r border-gray-200">
                                                        <div className="flex items-center justify-end relative text-gray-400">
                                                            <span>Debit</span>
                                                            <div className="ml-2">
                                                                <Filter
                                                                    className={`w-4 h-4 cursor-pointer ${activeFilter === 'debit' ? 'text-indigo-600' : 'text-gray-300 hover:text-gray-600'}`}
                                                                    onClick={() => toggleFilter('debit')}
                                                                />
                                                                {activeFilter === 'debit' && (
                                                                    <div className="absolute z-50 top-8 right-0 bg-white shadow-xl border border-gray-200 rounded-[4px] p-3 w-40">
                                                                        <div className="flex justify-between items-center mb-2">
                                                                            <span className="text-xs font-semibold text-gray-700">Filter Debit</span>
                                                                            <X className="w-3 h-3 cursor-pointer text-gray-400 hover:text-gray-600" onClick={() => setActiveFilter(null)} />
                                                                        </div>
                                                                        <label className="flex items-center text-xs cursor-pointer p-1 hover:bg-gray-50 rounded">
                                                                            <input type="checkbox" checked={!!debitFilter} onChange={(e) => setDebitFilter(e.target.checked ? 'show' : '')} className="mr-2 rounded text-indigo-600 focus:ring-indigo-500" />
                                                                            Show Debits Only
                                                                        </label>
                                                                        <button
                                                                            onClick={() => setDebitFilter('')}
                                                                            className="w-full mt-2 py-1 text-[10px] text-indigo-600 font-medium hover:bg-indigo-50 border border-indigo-100 rounded transition-colors"
                                                                        >
                                                                            Clear Filter
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </th>
                                                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider border-r border-gray-200">
                                                        <div className="flex items-center justify-end relative text-gray-400">
                                                            <span>Credit</span>
                                                            <div className="ml-2">
                                                                <Filter
                                                                    className={`w-4 h-4 cursor-pointer ${activeFilter === 'credit' ? 'text-indigo-600' : 'text-gray-300 hover:text-gray-600'}`}
                                                                    onClick={() => toggleFilter('credit')}
                                                                />
                                                                {activeFilter === 'credit' && (
                                                                    <div className="absolute z-50 top-8 right-0 bg-white shadow-xl border border-gray-200 rounded-[4px] p-3 w-40">
                                                                        <div className="flex justify-between items-center mb-2">
                                                                            <span className="text-xs font-semibold text-gray-700">Filter Credit</span>
                                                                            <X className="w-3 h-3 cursor-pointer text-gray-400 hover:text-gray-600" onClick={() => setActiveFilter(null)} />
                                                                        </div>
                                                                        <label className="flex items-center text-xs cursor-pointer p-1 hover:bg-gray-50 rounded">
                                                                            <input type="checkbox" checked={!!creditFilter} onChange={(e) => setCreditFilter(e.target.checked ? 'show' : '')} className="mr-2 rounded text-indigo-600 focus:ring-indigo-500" />
                                                                            Show Credits Only
                                                                        </label>
                                                                        <button
                                                                            onClick={() => setCreditFilter('')}
                                                                            className="w-full mt-2 py-1 text-[10px] text-indigo-600 font-medium hover:bg-indigo-50 border border-indigo-100 rounded transition-colors"
                                                                        >
                                                                            Clear Filter
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </th>
                                                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">
                                                        <div className="flex items-center justify-end relative text-gray-400">
                                                            <span>Running Balance</span>
                                                        </div>
                                                    </th>
                                                </tr>
                                            </thead>
                                        )}
                                        <tbody className="bg-white divide-y divide-gray-200">
                                            {filteredData.map((entry) => (
                                                <React.Fragment key={entry.id}>
                                                    {isJournalView ? (
                                                        <>
                                                            {/* APP-THEMED JOURNAL ROW */}
                                                            <tr
                                                                className={`hover:bg-indigo-50/30 transition-colors cursor-pointer border-b border-gray-100 ${selectedTransactionId === entry.id ? 'bg-indigo-50' : ''}`}
                                                                onClick={() => handleRowClick(entry.id)}
                                                            >
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 border-r border-gray-50">{entry.date.split('-').reverse().join('-')}</td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 border-r border-gray-50">(as per details)</td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 uppercase border-r border-gray-50">Sales</td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 border-r border-gray-50">{entry.referenceNo || entry.ledger}</td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm border-r border-gray-50">
                                                                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-[4px] ${getStatusBadgeColor(entry.status)}`}>{entry.status}</span>
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-indigo-600 border-r border-gray-50">₹{entry.debit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-400 font-bold border-r border-gray-50">
                                                                    {entry.credit !== 0 ? `₹${entry.credit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-gray-900">
                                                                    {entry.runningBalance === 0 ? '-' : (
                                                                        <span>
                                                                            {formatCurrency(Math.abs(entry.runningBalance))}
                                                                            <span className="ml-1 text-gray-500 text-xs font-normal">
                                                                                {entry.runningBalance >= 0 ? 'Dr' : 'Cr'}
                                                                            </span>
                                                                        </span>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                            {/* BREAKDOWN ROWS */}
                                                            {entry.originalInv && (
                                                                <>
                                                                    {/* DEBITS */}
                                                                    <tr className="bg-white">
                                                                        <td className="px-6 py-1.5 border-r border-gray-50"></td>
                                                                        <td className="px-6 py-1.5 text-xs text-gray-700 font-medium pl-8 border-r border-gray-50">
                                                                            <div className="flex justify-between items-center w-full">
                                                                                <span>{customer.name}</span>
                                                                                <div className="flex items-center gap-1">
                                                                                    <span className="text-gray-900 font-bold ml-4">₹{entry.debit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                                                                    <span className="text-gray-500 text-[10px] font-normal">Dr</span>
                                                                                </div>
                                                                            </div>
                                                                        </td>
                                                                        <td className="px-6 py-1.5 border-r border-gray-50"></td>
                                                                        <td className="px-6 py-1.5 border-r border-gray-50"></td>
                                                                        <td className="px-6 py-1.5 border-r border-gray-50"></td>
                                                                        <td className="px-6 py-1.5 border-r border-gray-50"></td>
                                                                        <td className="px-6 py-1.5 border-r border-gray-50"></td>
                                                                        <td className="px-6 py-1.5 text-right text-xs text-gray-400"></td>
                                                                    </tr>

                                                                    {[
                                                                        { key: 'payment_tds_income_tax', label: 'TDS Receivable (IT)' },
                                                                        { key: 'payment_tds_gst', label: 'TDS Receivable (GST)' }
                                                                    ].map((tds) => {
                                                                        const amt = entry.originalInv.payment_details?.[tds.key];
                                                                        if (!amt || parseFloat(amt) === 0) return null;

                                                                        // Calculate the total taxable value
                                                                        const totalTaxable = (entry.originalInv.items || []).reduce((sum: number, item: any) => sum + parseFloat(item.taxable_value || 0), 0);
                                                                        const taxPerc = totalTaxable > 0 ? parseFloat((parseFloat(amt) / totalTaxable * 100).toFixed(2)) : 0;
                                                                        const labelWithPerc = taxPerc > 0 ? `${tds.label} @ ${taxPerc}%` : tds.label;

                                                                        return (
                                                                            <tr key={tds.key} className="bg-white">
                                                                                <td className="px-6 py-1.5 border-r border-gray-50"></td>
                                                                                <td className="px-6 py-1.5 text-xs text-gray-700 font-medium pl-8 border-r border-gray-50">
                                                                                    <div className="flex justify-between items-center w-full">
                                                                                        <span>{labelWithPerc}</span>
                                                                                        <div className="flex items-center gap-1">
                                                                                            <span className="text-gray-900 font-bold ml-4">₹{parseFloat(amt).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                                                                            <span className="text-gray-500 text-[10px] font-normal">Dr</span>
                                                                                        </div>
                                                                                    </div>
                                                                                </td>
                                                                                <td className="px-6 py-1.5 border-r border-gray-50"></td>
                                                                                <td className="px-6 py-1.5 border-r border-gray-50"></td>
                                                                                <td className="px-6 py-1.5 border-r border-gray-50"></td>
                                                                                <td className="px-6 py-1.5 border-r border-gray-50"></td>
                                                                                <td className="px-6 py-1.5 border-r border-gray-50"></td>
                                                                                <td className="px-6 py-1.5 text-right text-xs text-gray-400"></td>
                                                                            </tr>
                                                                        );
                                                                    })}

                                                                    {/* CREDITS */}
                                                                    <tr className="bg-white">
                                                                        <td className="px-6 py-1.5 border-r border-gray-50"></td>
                                                                        <td className="px-6 py-1.5 text-xs text-gray-700 font-medium pl-14 border-r border-gray-50">
                                                                            <div className="flex justify-between items-center w-full">
                                                                                <span>Sales Ledger</span>
                                                                                <div className="flex items-center gap-1">
                                                                                    <span className="text-gray-900 font-bold ml-4">₹{((entry.originalInv.items || []).reduce((sum: number, item: any) => sum + parseFloat(item.taxable_value || 0), 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                                                                    <span className="text-gray-500 text-[10px] font-normal">Cr</span>
                                                                                </div>
                                                                            </div>
                                                                        </td>
                                                                        <td className="px-6 py-1.5 border-r border-gray-50"></td>
                                                                        <td className="px-6 py-1.5 border-r border-gray-50"></td>
                                                                        <td className="px-6 py-1.5 border-r border-gray-50"></td>
                                                                        <td className="px-6 py-1.5 border-r border-gray-50"></td>
                                                                        <td className="px-6 py-1.5 border-r border-gray-50"></td>
                                                                        <td className="px-6 py-1.5 text-right text-xs text-gray-400"></td>
                                                                    </tr>

                                                                    {[
                                                                        { key: 'payment_cgst', label: 'Output CGST Ledger' },
                                                                        { key: 'payment_sgst', label: 'Output SGST Ledger' },
                                                                        { key: 'payment_igst', label: 'Output IGST Ledger' },
                                                                        { key: 'payment_cess', label: 'Output Cess Ledger' },
                                                                        { key: 'payment_state_cess', label: 'Output State Cess Ledger' }
                                                                    ].map((tax) => {
                                                                        const amt = entry.originalInv.payment_details?.[tax.key];
                                                                        if (!amt || parseFloat(amt) === 0) return null;

                                                                        const totalTaxable = (entry.originalInv.items || []).reduce((sum: number, item: any) => sum + parseFloat(item.taxable_value || 0), 0);
                                                                        const taxPerc = totalTaxable > 0 ? parseFloat((parseFloat(amt) / totalTaxable * 100).toFixed(2)) : 0;
                                                                        const labelWithPerc = taxPerc > 0 ? `${tax.label} @ ${taxPerc}%` : tax.label;

                                                                        return (
                                                                            <tr key={tax.key} className="bg-white">
                                                                                <td className="px-6 py-1.5 border-r border-gray-50"></td>
                                                                                <td className="px-6 py-1.5 text-xs text-gray-700 font-medium pl-14 border-r border-gray-50">
                                                                                    <div className="flex justify-between items-center w-full">
                                                                                        <span>{labelWithPerc}</span>
                                                                                        <div className="flex items-center gap-1">
                                                                                            <span className="text-gray-900 font-bold ml-4">₹{parseFloat(amt).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                                                                            <span className="text-gray-500 text-[10px] font-normal">Cr</span>
                                                                                        </div>
                                                                                    </div>
                                                                                </td>
                                                                                <td className="px-6 py-1.5 border-r border-gray-50"></td>
                                                                                <td className="px-6 py-1.5 border-r border-gray-50"></td>
                                                                                <td className="px-6 py-1.5 border-r border-gray-50"></td>
                                                                                <td className="px-6 py-1.5 border-r border-gray-50"></td>
                                                                                <td className="px-6 py-1.5 text-right text-xs text-gray-400 border-r border-gray-50"></td>
                                                                                <td className="px-6 py-1.5 text-right text-xs text-gray-400"></td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                    <tr className="bg-white">
                                                                        <td className="py-2" colSpan={8}></td>
                                                                    </tr>
                                                                </>
                                                            )}
                                                        </>
                                                    ) : (
                                                        // ORIGINAL STYLE ROW
                                                        <tr
                                                            className={`hover:bg-indigo-50/50 transition-colors cursor-pointer ${selectedTransactionId === entry.id ? 'bg-indigo-50' : ''}`}
                                                            onClick={() => handleRowClick(entry.id)}
                                                        >
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 border-r border-gray-100">{entry.date.split('-').reverse().join('-')}</td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 border-r border-gray-100">{entry.postFrom}</td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 border-r border-gray-100 font-medium">{entry.referenceNo || '-'}</td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 border-r border-gray-100">{entry.ledger}</td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm border-r border-gray-100">
                                                                <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-[4px] ${getStatusBadgeColor(entry.status)}`}>{entry.status}</span>
                                                            </td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 border-r border-gray-100 font-medium">{formatCurrency(entry.debit)}</td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 border-r border-gray-100 font-medium">{formatCurrency(entry.credit)}</td>
                                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 font-semibold">
                                                                {entry.runningBalance === 0 ? '-' : (
                                                                    <span>
                                                                        {formatCurrency(Math.abs(entry.runningBalance))}
                                                                        <span className="ml-1 text-gray-500 text-xs font-normal">
                                                                            {entry.runningBalance >= 0 ? 'Dr' : 'Cr'}
                                                                        </span>
                                                                    </span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    )}
                                                </React.Fragment>
                                            ))}
                                            {filteredData.length === 0 && (
                                                <tr>
                                                    <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                                                        No ledger entries found for this customer.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                        <tfoot className="bg-gray-50 font-semibold">
                                            <tr>
                                                <td colSpan={5} className="px-6 py-4 text-sm text-right text-gray-700 uppercase">TOTALS:</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 font-bold border-l border-gray-200">{formatCurrency(totalDebit)}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 font-bold border-l border-gray-200">{formatCurrency(totalCredit)}</td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 font-bold border-l border-gray-200"></td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>
                        )
                    )}

                    {/* Advance Allocation Modal */}
                    <AdvanceAllocationModal
                        isOpen={isAdvanceModalOpen}
                        onClose={() => setIsAdvanceModalOpen(false)}
                        row={selectedAdvanceRow}
                        customer={customer}
                        ledgerEntries={ledgerEntries}
                        setPrefilledVoucherData={setPrefilledVoucherData}
                        onNavigate={onNavigate}
                        onProceed={handleProceedAllocation}
                    />

                    {/* GST Details Modal */}

                    <SalesGSTViewModal
                        isOpen={isGSTModalOpen}
                        onClose={() => setIsGSTModalOpen(false)}
                        transactionId={selectedTransactionId}
                    />
                </>
            )}
        </div>
    );
};

// Sales Content Component with Aging Buckets
interface CategoryCardProps {
    category: SalesCategory;
    desc: string;
    activeOrders: number;
    activeAdvances: number;
    onClick: () => void;
}

const CategoryCard: React.FC<CategoryCardProps> = ({ category, desc, activeOrders, activeAdvances, onClick }) => (
    <div
        onClick={onClick}
        className="bg-white p-6 rounded-[4px] border border-gray-200 hover:border-indigo-500 hover:shadow-md cursor-pointer transition-all group"
    >
        <div className="flex items-center justify-between mb-4">
            <div className="p-3 rounded-[4px] bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                <Filter className="w-6 h-6" />
            </div>
            <div className="flex items-center gap-4">
                <div className="text-right">
                    <p className="text-lg font-bold text-gray-800">{activeOrders}</p>
                    <p className="text-[10px] text-indigo-600 font-semibold uppercase tracking-wider">Invoices</p>
                </div>
                <div className="text-right">
                    <p className="text-lg font-bold text-gray-800">{activeAdvances}</p>
                    <p className="text-[10px] text-green-600 font-semibold uppercase tracking-wider">Advances</p>
                </div>
                <ChevronLeft className="w-5 h-5 text-gray-300 group-hover:text-indigo-500 transform rotate-180 transition-all opacity-0 group-hover:opacity-100" />
            </div>
        </div>
        <h3 className="text-lg font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">{category}</h3>
        <p className="text-sm text-gray-500 mt-2">{desc}</p>
    </div>
);

function SalesContent({ onNavigate, setPrefilledVoucherData }: { onNavigate?: (page: string) => void; setPrefilledVoucherData?: (data: any) => void; }) {
    const [viewMode, setViewMode] = useState<'dashboard' | 'list'>('dashboard');
    const [activeCategory, setActiveCategory] = useState<SalesCategory>('Export');
    const [showLedgerView, setShowLedgerView] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState<{ id: string, name: string, ledger_id?: string, is_also_vendor?: boolean, credit_period?: string } | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    const [invoices, setInvoices] = useState<any[]>([]);
    const [advancePayments, setAdvancePayments] = useState<any[]>([]);
    const [allAdvancePayments, setAllAdvancePayments] = useState<any[]>([]); // For dashboard tiles
    const [customers, setCustomers] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchSalesData = async () => {
            try {
                const [invData, custData, allAdvData] = await Promise.all([
                    httpClient.get('/api/voucher-sales-new/?show_all=true'),
                    httpClient.get('/api/customerportal/customer-master/'),
                    apiService.getAdvances() // Fetch ALL advances for tiles
                ]);
                setInvoices((invData as any[]) || []);
                setCustomers((custData as any[]) || []);
                setAllAdvancePayments((allAdvData as any[]) || []);
            } catch (error) {
                handleApiError(error, 'Fetch Sales Data');
            } finally {
                setIsLoading(false);
            }
        };
        fetchSalesData();
    }, []);

    // Re-fetch category-specific advances when category changes
    useEffect(() => {
        if (!activeCategory) return;
        const fetchCategoryAdvances = async () => {
            try {
                const advData: any = await apiService.getAdvances(undefined, activeCategory);
                setAdvancePayments(advData || []);
            } catch (error) {
                console.error('Error fetching category advances:', error);
            }
        };
        fetchCategoryAdvances();
    }, [activeCategory]);

    const getAgingData = (category: SalesCategory): AgingData[] => {
        if (!customers.length) return [];

        const customerGroups: Record<string, AgingData & { advances: number }> = {};

        invoices.forEach(inv => {
            const custId = inv.customer_id;
            if (!custId) return; // Skip if no customer linked

            const customer = customers.find((c: any) => c.id === custId);
            if (!customer) return;

            // Get the customer's assigned category name (from master record)
            const custCategoryName: string = (customer.customer_category_name || '').toLowerCase();

            // Match customer to the selected category card
            // 'Export'              -> category name contains 'export'
            // 'Within Country (B2B)' -> category name contains 'b2b' (NOT 'b2c')
            // 'Within Country (B2C)' -> category name contains 'b2c'
            let matchesCategory = false;
            if (category === 'Export') {
                matchesCategory = custCategoryName.includes('export');
            } else if (category === 'Within Country (B2B)') {
                matchesCategory = custCategoryName.includes('b2b') && !custCategoryName.includes('b2c');
            } else if (category === 'Within Country (B2C)') {
                matchesCategory = custCategoryName.includes('b2c');
            }

            if (!matchesCategory) return;

            const custName = customer.customer_name || inv.customer_name || 'Unknown Customer';
            const custCode = customer.customer_code || `CUST-${custId}`;
            const subCategory = customer.customer_category_name || 'General';

            if (!customerGroups[custId]) {
                customerGroups[custId] = {
                    customerId: custId.toString(),
                    customerCode: custCode,
                    customerName: custName,
                    subCategory: subCategory,
                    notDue: 0,
                    days0to45: 0,
                    days45to90: 0,
                    months6: 0,
                    year1: 0,
                    is_also_vendor: customer?.is_also_vendor,
                    advances: 0
                } as any;
            }

            // Extract outstanding balance from invoice
            const amount = parseFloat(inv.payment_details?.payment_balance ?? inv.payment_details?.payment_payable ?? 0);

            // Calculate aging days relative to credit period
            const invDate = new Date(inv.date);
            const today = new Date();
            const d1 = new Date(invDate.getFullYear(), invDate.getMonth(), invDate.getDate());
            const d2 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            const diffTime = d2.getTime() - d1.getTime();
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

            const creditPeriod = parseInt(customer.credit_period || '0', 10);
            const overdueDays = diffDays - creditPeriod;

            if (overdueDays <= 0) {
                customerGroups[custId].notDue += amount;
            } else if (overdueDays <= 45) {
                customerGroups[custId].days0to45 += amount;
            } else if (overdueDays <= 90) {
                customerGroups[custId].days45to90 += amount;
            } else if (overdueDays <= 180) {
                customerGroups[custId].months6 += amount;
            } else {
                customerGroups[custId].year1 += amount;
            }
        });

        // Add Advance Payments using unified pay_to_ledger Source of Truth
        // Use category-specific advances; fall back to filtering allAdvancePayments
        const advancesToUse = advancePayments.length > 0
            ? advancePayments
            : allAdvancePayments.filter((adv: any) => {
                const cat = (adv.category || '').toLowerCase();
                if (category === 'Export') return cat.includes('export');
                if (category === 'Within Country (B2B)') return cat.includes('b2b') && !cat.includes('b2c');
                if (category === 'Within Country (B2C)') return cat.includes('b2c');
                return false;
            });

        advancesToUse.forEach((adv: any) => {
            const ledgerId = adv.pay_to_ledger;
            if (!ledgerId) return;

            // Match by ledger_id — customers from customer-master API include ledger_id
            const customer = customers.find((c: any) =>
                c.ledger_id === ledgerId || c.ledger === ledgerId
            );
            if (!customer) return;

            const custId = customer.id;

            if (!customerGroups[custId]) {
                customerGroups[custId] = {
                    customerId: custId.toString(),
                    customerCode: customer.customer_code || `CUST-${custId}`,
                    customerName: customer.customer_name || adv.pay_to_name || 'Unknown Customer',
                    subCategory: customer.customer_category_name || adv.category || 'General',
                    notDue: 0,
                    days0to45: 0,
                    days45to90: 0,
                    months6: 0,
                    year1: 0,
                    is_also_vendor: customer?.is_also_vendor,
                    advances: 0
                } as any;
            }

            customerGroups[custId].advances += parseFloat(adv.amount || 0);
        });

        return Object.values(customerGroups);
    };

    const formatCurrency = (amount: number): string => {
        return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const handleViewCustomer = (customerId: string, customerName: string, ledgerId?: string, isVendor?: boolean, creditPeriod?: string) => {
        // Navigate to Customer Ledger View
        setSelectedCustomer({ id: customerId, name: customerName, ledger_id: ledgerId, is_also_vendor: isVendor, credit_period: creditPeriod });
        setShowLedgerView(true);
    };

    const handleBackToAging = () => {
        setShowLedgerView(false);
        setSelectedCustomer(null);
    };

    const handleSendMail = (customer: AgingData) => {
        const totalDue = customer.days0to45 + customer.days45to90 + customer.months6 + customer.year1;
        showInfo(
            `Draft Reminder Email for ${customer.customerName}\n\n` +
            `Customer Code: ${customer.customerCode}\n` +
            `Total Outstanding: ${formatCurrency(totalDue)}\n\n` +
            `This email would be editable before sending.`
        );
    };

    const handleCardClick = (category: SalesCategory) => {
        setActiveCategory(category);
        setViewMode('list');
    };

    const categories: SalesCategory[] = ['Export', 'Within Country (B2B)', 'Within Country (B2C)'];
    const currentData = getAgingData(activeCategory);

    // Filter data based on search term
    const filteredData = currentData.filter(customer =>
        customer.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        customer.customerCode.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Show ledger view if customer is selected
    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center p-20 bg-white rounded-[4px] border border-gray-200 min-h-[400px]">
                <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-gray-500 font-medium">Loading transactions...</p>
            </div>
        );
    }

    if (showLedgerView && selectedCustomer) {
        return <CustomerLedgerView customer={selectedCustomer} onBack={handleBackToAging} onNavigate={onNavigate} setPrefilledVoucherData={setPrefilledVoucherData} />;
    }

    return (
        <div className="text-left">
            {viewMode === 'dashboard' ? (
                <div>
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-bold text-gray-900">Sales - Customer Aging</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Export Card */}
                        <CategoryCard
                            category="Export"
                            desc="View export sales aging."
                            activeOrders={invoices.filter(inv => (customers.find(c => c.id === inv.customer_id)?.customer_category_name || '').toLowerCase().includes('export')).length}
                            activeAdvances={allAdvancePayments.filter(adv => (adv.category || '').toLowerCase().includes('export')).length}
                            onClick={() => handleCardClick('Export')}
                        />

                        {/* Within Country (B2B) Card */}
                        <CategoryCard
                            category="Within Country (B2B)"
                            desc="View B2B sales aging."
                            activeOrders={invoices.filter(inv => {
                                const cat = (customers.find(c => c.id === inv.customer_id)?.customer_category_name || '').toLowerCase();
                                return cat.includes('b2b') && !cat.includes('b2c');
                            }).length}
                            activeAdvances={allAdvancePayments.filter(adv => {
                                const cat = (adv.category || '').toLowerCase();
                                return cat.includes('b2b') && !cat.includes('b2c');
                            }).length}
                            onClick={() => handleCardClick('Within Country (B2B)')}
                        />

                        {/* Within Country (B2C) Card */}
                        <CategoryCard
                            category="Within Country (B2C)"
                            desc="View B2C sales aging."
                            activeOrders={invoices.filter(inv => (customers.find(c => c.id === inv.customer_id)?.customer_category_name || '').toLowerCase().includes('b2c')).length}
                            activeAdvances={allAdvancePayments.filter(adv => (adv.category || '').toLowerCase().includes('b2c')).length}
                            onClick={() => handleCardClick('Within Country (B2C)')}
                        />
                    </div>
                </div>
            ) : (
                <>
                    {/* Header Section */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => setViewMode('dashboard')}
                                className="p-2 hover:bg-gray-100 rounded-[4px] transition-colors"
                                title="Back to Dashboard"
                            >
                                <ChevronLeft className="w-5 h-5 text-gray-600" />
                            </button>
                            <h3 className="text-xl font-bold text-gray-900">Sales - {activeCategory}</h3>
                        </div>

                        {/* Search Field */}
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="Search Customer..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10 pr-4 py-2 border border-gray-300 rounded-[4px] text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64"
                            />
                            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
                        </div>
                    </div>

                    {/* Aging Table */}
                    <div className="bg-white border border-gray-200 rounded-[4px] overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        {/* Customer Information */}
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                                            Customer Code
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                                            Customer Name
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                                            Sub Category
                                        </th>

                                        {/* Aging Buckets */}
                                        <th colSpan={5} className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider bg-indigo-50 border-b border-gray-200">
                                            Amount - Due For
                                        </th>
                                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-l border-gray-200">
                                            Actions
                                        </th>
                                    </tr>
                                    <tr>
                                        <th className="border-r border-gray-200"></th>
                                        <th className="border-r border-gray-200"></th>
                                        <th className="border-r border-gray-200"></th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider bg-indigo-50 border-r border-gray-200">
                                            Not Due
                                        </th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider bg-indigo-50 border-r border-gray-200">
                                            0-45 Days
                                        </th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider bg-indigo-50 border-r border-gray-200">
                                            45-90 Days
                                        </th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider bg-indigo-50 border-r border-gray-200">
                                            {'>'} 6 Months
                                        </th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider bg-indigo-50">
                                            {'>'} 1 Year
                                        </th>
                                        <th className="border-l border-gray-200"></th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {filteredData.map((customer) => (
                                        <tr key={customer.customerId} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 border-r border-gray-100">
                                                {customer.customerCode}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 border-r border-gray-100">
                                                {customer.customerName}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 border-r border-gray-100">
                                                {customer.subCategory}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-600 border-r border-gray-100">
                                                {customer.notDue > 0 ? formatCurrency(customer.notDue) : '-'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-600 border-r border-gray-100">
                                                {customer.days0to45 > 0 ? formatCurrency(customer.days0to45) : '-'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-600 border-r border-gray-100">
                                                {customer.days45to90 > 0 ? formatCurrency(customer.days45to90) : '-'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-600 border-r border-gray-100">
                                                {customer.months6 > 0 ? formatCurrency(customer.months6) : '-'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-600 bg-indigo-50/30">
                                                {customer.year1 > 0 ? formatCurrency(customer.year1) : '-'}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium border-l border-gray-100">
                                                <div className="flex items-center justify-center space-x-3">
                                                    <button
                                                        onClick={() => {
                                                            const custDef = customers.find(c => c.id?.toString() === customer.customerId);
                                                            handleViewCustomer(customer.customerId, customer.customerName, custDef?.ledger_id, customer.is_also_vendor, custDef?.credit_period);
                                                        }}
                                                        className="text-indigo-600 hover:text-indigo-900"
                                                        title="View Ledger"
                                                    >
                                                        <Eye className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleSendMail(customer)}
                                                        className="text-gray-400 hover:text-indigo-600 transition-colors"
                                                        title="Send Reminder Email"
                                                    >
                                                        <Mail className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredData.length === 0 && (
                                        <tr>
                                            <td colSpan={9} className="px-6 py-12 text-center text-gray-500 text-sm">
                                                No customers found matching your search.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default CustomerPortalPage;
