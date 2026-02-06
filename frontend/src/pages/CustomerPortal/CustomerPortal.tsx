import React, { useState, useEffect, useMemo } from 'react';
import { httpClient } from '../../services/httpClient';
import { usePermissions } from '../../hooks/usePermissions';

import { InventoryCategoryWizard } from '../../components/InventoryCategoryWizard';
import Icon from '../../components/Icon'; // Assuming Icon component exists
import CreateSalesQuotation from './CreateSalesQuotation';
import CategoryHierarchicalDropdown, { Category as DropdownCategory } from '../../components/CategoryHierarchicalDropdown';
import SalesQuotationList from './SalesQuotationList';
import CreateSalesOrder from './CreateSalesOrder';
import { Eye, Mail, Filter, ChevronLeft, X, Calendar, Pencil, Trash2 } from 'lucide-react';
import CustomerViewModal from './CustomerViewModal';

type MainTab = 'Master' | 'Transaction';
type MasterSubTab = 'Category' | 'Sales Quotation & Order' | 'Customer' | 'Long-term Contracts';

type TransactionSubTab = 'Sales Quotation' | 'Sales Order' | 'Sales' | 'Receipt';
type SalesQuotationSubTab = 'General Customer Quote' | 'Specific Customer Quote';
type SalesOrderSubTab = 'Pending & Cancelled' | 'Executed';
type SalesCategory = 'Stock-in-Trade' | 'Finished Goods' | 'Services';
type TransactionType = 'Sales' | 'Receipt' | 'Purchase' | 'Payment' | 'Debit Note' | 'Credit Note';
type PurchaseStatus = 'Paid' | 'Unpaid' | 'Partially Paid' | 'Approved';
type SalesStatus = 'Not Due' | 'Due' | 'Partially Received' | 'Received';

interface AgingData {
    customerId: string;
    customerCode: string;
    customerName: string;
    notDue: number;
    days0to45: number;
    days45to90: number;
    months6: number;
    year1: number;
}

interface LedgerEntry {
    id: string;
    date: string;
    postFrom: TransactionType;
    ledger: string;
    status: PurchaseStatus | SalesStatus;
    debit: number;
    credit: number;
    runningBalance: number;
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

const CustomerPortalPage: React.FC = () => {
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
    const [showCreateOrder, setShowCreateOrder] = useState(false);

    return (
        <div className="flex-1 bg-sky-50 min-h-screen">
            {/* Header */}
            <div className="px-8 py-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">Customer Portal</h1>
                        <p className="text-sm text-gray-600 mt-1">Manage customers, categories, and sales transactions</p>
                    </div>
                </div>
            </div>

            {/* Main Tabs */}
            <div className="px-8">
                <div className="flex gap-8 border-b border-gray-200 pb-1">
                    {availableTabs.map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab as MainTab)}
                            className={`py-2 px-1 text-sm font-medium transition-colors border-b-2 ${activeTab === tab
                                ? 'border-blue-600 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            {tab.toUpperCase()}
                        </button>
                    ))}
                </div>
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
                                            ? 'border-teal-500 text-teal-600'
                                            : 'border-transparent text-gray-500 hover:text-gray-700'
                                            }`}
                                    >
                                        {subTab.toUpperCase()}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Masters Content */}
                        <div className="bg-white rounded-lg shadow-sm border border-gray-200 min-h-[500px]">
                            {activeMasterSubTab === 'Category' && <CategoryContent />}
                            {activeMasterSubTab === 'Customer' && <CustomerContent />}
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
                                            ? 'border-teal-500 text-teal-600'
                                            : 'border-transparent text-gray-500 hover:text-gray-700'
                                            }`}
                                    >
                                        {subTab.toUpperCase()}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Transactions Content */}
                        <div className="bg-white rounded-lg shadow-sm p-8 text-center min-h-[500px]">
                            {activeTransactionSubTab === 'Sales Quotation' && (
                                showCreateQuotation ? (
                                    <CreateSalesQuotation onCancel={() => setShowCreateQuotation(false)} />
                                ) : (
                                    <SalesQuotationList
                                        onCreateQuotation={() => setShowCreateQuotation(true)}
                                    />

                                )
                            )}
                            {activeTransactionSubTab === 'Sales Order' && (
                                showCreateOrder ? (
                                    <CreateSalesOrder onCancel={() => setShowCreateOrder(false)} />
                                ) : (
                                    <div className="text-left">
                                        <div className="flex justify-between items-center mb-6">
                                            <h3 className="text-lg font-medium text-gray-900">Sales Order</h3>
                                            <button
                                                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 transition-colors"
                                                onClick={() => setShowCreateOrder(true)}
                                            >
                                                Create Sales Order
                                            </button>
                                        </div>

                                        {/* Sales Order Sub-tabs */}
                                        <div className="border-b border-gray-200 mb-6">
                                            <nav className="flex gap-8">
                                                {['Pending & Cancelled', 'Executed'].map((tab) => (
                                                    <button
                                                        key={tab}
                                                        onClick={() => setActiveSalesOrderSubTab(tab as SalesOrderSubTab)}
                                                        className={`py-3 px-1 text-sm font-medium border-b-2 transition-colors ${activeSalesOrderSubTab === tab
                                                            ? 'border-teal-500 text-teal-600'
                                                            : 'border-transparent text-gray-500 hover:text-gray-700'
                                                            }`}
                                                    >
                                                        {tab.toUpperCase()}
                                                    </button>
                                                ))}
                                            </nav>
                                        </div>

                                        {/* Pending & Cancelled Tab */}
                                        {activeSalesOrderSubTab === 'Pending & Cancelled' && (
                                            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                                                <div className="overflow-x-auto">
                                                    <table className="min-w-full divide-y divide-gray-200">
                                                        <thead className="bg-gray-50">
                                                            <tr>
                                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                                    Sales Order #
                                                                </th>
                                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                                    Sales Order Date
                                                                </th>
                                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                                    Customer Reference Name
                                                                </th>
                                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                                    Delivery Date
                                                                </th>
                                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                                    Amount
                                                                </th>
                                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                                    Status
                                                                </th>
                                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                                    Actions
                                                                </th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="bg-white divide-y divide-gray-200">
                                                            {/* Sample Data Row - Pending */}
                                                            <tr className="hover:bg-gray-50">
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                                    SO-2024-001
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                    2024-01-15
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                    Acme Corporation
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                    2024-01-25
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                    ₹45,000.00
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap">
                                                                    <span className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800">
                                                                        Pending
                                                                    </span>
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-3">
                                                                    <button className="text-indigo-600 hover:text-indigo-900">View</button>
                                                                    <button className="text-blue-600 hover:text-blue-900">Edit</button>
                                                                    <button className="text-red-600 hover:text-red-900">Cancel</button>
                                                                </td>
                                                            </tr>
                                                            {/* Sample Data Row - Cancelled */}
                                                            <tr className="hover:bg-gray-50">
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                                    SO-2024-002
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                    2024-01-10
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                    Global Traders
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                    2024-01-20
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                    ₹32,500.00
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap">
                                                                    <span className="px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-red-100 text-red-800">
                                                                        Cancelled
                                                                    </span>
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-3">
                                                                    <button className="text-indigo-600 hover:text-indigo-900">View</button>
                                                                    <button className="text-gray-400 cursor-not-allowed" disabled>Edit</button>
                                                                    <button className="text-gray-400 cursor-not-allowed" disabled>Cancel</button>
                                                                </td>
                                                            </tr>
                                                            {/* Empty State */}
                                                            {false && (
                                                                <tr>
                                                                    <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                                                                        No pending or cancelled sales orders found.
                                                                    </td>
                                                                </tr>
                                                            )}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}

                                        {/* Executed Tab */}
                                        {activeSalesOrderSubTab === 'Executed' && (
                                            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                                                <div className="overflow-x-auto">
                                                    <table className="min-w-full divide-y divide-gray-200">
                                                        <thead className="bg-gray-50">
                                                            <tr>
                                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                                    Sales Order #
                                                                </th>
                                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                                    Sales Order Date
                                                                </th>
                                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                                    Customer Reference Name
                                                                </th>
                                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                                    Delivery Date
                                                                </th>
                                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                                    Amount
                                                                </th>
                                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                                                    Action
                                                                </th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="bg-white divide-y divide-gray-200">
                                                            {/* Sample Data Row - Executed */}
                                                            <tr className="hover:bg-gray-50">
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                                    SO-2024-003
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                    2024-01-05
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                    Tech Solutions Inc
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                    2024-01-15
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                                    ₹78,500.00
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                                                    <button className="text-indigo-600 hover:text-indigo-900">View</button>
                                                                </td>
                                                            </tr>
                                                            {/* Empty State */}
                                                            {false && (
                                                                <tr>
                                                                    <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                                                                        No executed sales orders found.
                                                                    </td>
                                                                </tr>
                                                            )}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )
                            )}
                            {activeTransactionSubTab === 'Sales' && (
                                <SalesContent />
                            )}
                            {activeTransactionSubTab === 'Receipt' && (
                                <ReceiptContent />
                            )}
                        </div>
                    </div>
                )}


            </div>
        </div >
    );
};

// -- Mastery Sub-Components --

const CategoryContent: React.FC = () => {
    return (
        <InventoryCategoryWizard
            apiEndpoint="/api/customerportal/categories/"
            allowCreateGroup={false} // Hide Group/Subgroup creation fields at root level
            systemCategories={[
                'Raw Material',
                'Work in Progress',
                'Finished Goods',
                'Stores and Spares',
                'Packing Material',
                'Stock in Trade'
            ]}
            // Using default system categories and groups (Inventory/Vendor structure) as requested
            onCreateCategory={async (data) => {
                try {
                    await httpClient.post('/api/customerportal/categories/', {
                        category: data.category,
                        group: data.group,
                        subgroup: data.subgroup,
                        is_active: true
                    });
                    alert('Category created successfully!');
                    // Wizard will auto-refresh its tree
                } catch (error: any) {
                    console.error('Error creating category:', error);
                    // Checking for specific error message structure from backend
                    const errorMsg = error.response?.data?.error || error.response?.data?.detail || error.message;
                    throw new Error(errorMsg);
                }
            }}
        />
    );
};

const CustomerContent: React.FC = () => {
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
    const [isLoading, setIsLoading] = useState(false);

    const fetchCustomers = async () => {
        try {
            const response = await httpClient.get<any[]>('/api/customerportal/customer-master/');
            setCustomers(response);
        } catch (error) {
            console.error('Error fetching customers:', error);
        }
    };

    const fetchStockItems = async () => {
        try {
            const response = await httpClient.get<any[]>('/api/inventory/items/');
            setStockItems(response.map(item => ({
                code: item.item_code,
                name: item.item_name
            })));
        } catch (error) {
            console.error('Error fetching stock items:', error);
        }
    };

    useEffect(() => {
        const fetchAll = async () => {
            setIsLoading(true);
            await Promise.all([fetchCategories(), fetchCustomers(), fetchStockItems()]);
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
                console.error('Error fetching categories:', error);
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
        { id: 1, referenceName: '', address: '', contactPerson: '', email: '', contactNumber: '', gstin: null }
    ]);
    const [registeredBranches, setRegisteredBranches] = useState<any[]>([]); // Track registered branch inputs

    const [productRows, setProductRows] = useState([
        { id: 1, itemCode: '', itemName: 'Auto-fetched', uom: '', custItemCode: '', custItemName: '', custUom: '' }
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
        tcsSection: '',
        tcsEnabled: false,
        tdsSection: '',
        tdsEnabled: false
    });

    // TDS Sections Data
    const tdsSections = [
        { section: 'Section 194C', name: 'Contracts- Individual/HUF', description: 'Payment to Contractors who are Individuals or Hindu Undivided Family (HUF)' },
        { section: 'Section 194C', name: 'Contracts- Others', description: 'Payment to Contractors other than Individuals & HUF' },
        { section: 'Section 194H', name: 'Commission/Brokerage', description: 'Commission and Brokerage to agents' },
        { section: 'Section 194-I', name: 'Rent- Land, Building, Furniture & fitting', description: 'Rent on Land, Building, or Furniture & fitting' },
        { section: 'Section 194-I', name: 'Rent- Plant & Machinery, Equipment', description: 'Rent on Plant & Machinery, or Equipment' },
        { section: 'Section 194J', name: 'Technical Services', description: 'Fees for Technical Services, Call Center Operations, Royalty on sale & distribution of films' },
        { section: 'Section 194J', name: 'Professional Services', description: 'Professional Services, Royalty from other than films, Non-Compete Fees, etc.' },
        { section: 'Section 194J', name: 'Director\'s Remuneration', description: 'Director\'s Remuneration' },
        { section: 'Section 194Q', name: 'Purchase of Goods', description: 'Purchase of Goods of aggregate value exceeding Rs. 50 Lakhs' },
        { section: 'Section 194A', name: 'Interest other than interest on securities', description: 'Interest payments made on loans, FDs, advances, etc., other than interest on securities' },
        { section: 'Section 194R', name: 'Benefit or Perquisite', description: 'Benefit or Perquisite given by a business or professional exceeding Rs 20,000' },
        { section: 'Section 194-IA', name: 'Immovable Property Transfer', description: 'Transfer of immovable property valuing Rs 50 lakhs or more' },
        { section: 'Section 194-IB', name: 'Rent by Individual or HUF', description: 'Rent exceeding Rs 50,000 per month paid by Individual & HUFs who are not subject to tax audit' },
        { section: 'Section 194M', name: 'Contractors & Professionals', description: 'Payment exceeding Rs 50 lakh to contractors and professionals by Individuals & HUFs who are not subject to tax audit' },
        { section: 'Section 194O', name: 'E-Commerce', description: 'Facilitating sales or services by an E-commerce operator for an E-commerce participant' },
        { section: 'Section 195', name: 'Payment to Non-Residents', description: 'Any payment made to a Non-Resident or Foreign Company' }
    ];

    // State for TDS info modal
    const [showTdsInfo, setShowTdsInfo] = useState(false);
    const [selectedTdsInfo, setSelectedTdsInfo] = useState<{ section: string; name: string; description: string } | null>(null);

    // TCS Sections Data
    const tcsSections = [
        { section: 'Section 206C(1)', name: 'Sale of Scrap, Alcoholic Liquor, Minerals', description: 'Sale of Scrap, Alcoholic Liquor for human consumption, and Minerals being coal or lignite or iron ore' },
        { section: 'Section 206C(1)', name: 'Sale of Tendu Leaves', description: 'Sale of Tendu Leaves' },
        { section: 'Section 206C(1)', name: 'Sale of Forest Produce', description: 'Sale of Timber and Forest produce under a forest lease' },
        { section: 'Section 206C(1)', name: 'Sale of Timber', description: 'Sale of Timber from modes other than forest lease' },
        { section: 'Section 206C(1F)', name: 'Sale of Motor Vehicles', description: 'Sale of Motor Vehicle for value of more than Rs.10 Lakhs' },
        { section: 'Section 206C(1F)', name: 'Sale of Specified Luxury Goods', description: 'Sale of Luxury Goods like yachts, helicopters, aircraft, jewellery, home theatre systems, etc. for value of more than Rs 10 Lakhs' }
    ];

    // State for TCS info display
    const [showTcsInfo, setShowTcsInfo] = useState(false);
    const [selectedTcsInfo, setSelectedTcsInfo] = useState<{ section: string; name: string; description: string } | null>(null);

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
        contact_number: ''
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
    const handleCustomerFieldChange = (field: string, value: string) => {
        setCustomerFormData(prev => ({ ...prev, [field]: value }));
    };

    // Save Customer Handler
    const handleSaveCustomer = async (options: { exit: boolean } = { exit: true }): Promise<boolean> => {
        // Validation - Basic Details are required for first save
        if (!customerFormData.customer_name.trim()) {
            alert('Please enter customer name');
            return false;
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
                is_also_vendor: isVendor,
                // GST Details
                gst_details: {
                    gstins: isUnregistered ? [] : selectedGSTINs,
                    branches: isUnregistered ? unregisteredBranches.map(b => ({
                        defaultRef: b.referenceName,
                        address: b.address,
                        contactPerson: b.contactPerson,
                        email: b.email,
                        contactNumber: b.contactNumber,
                        gstin: null
                    })) : (showBranchDetails ? registeredBranches.map(b => ({
                        defaultRef: b.defaultRef,
                        address: b.address,
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
                tcs_section: statutoryDetails.tcsSection || null,
                tcs_enabled: statutoryDetails.tcsEnabled,
                tds_section: statutoryDetails.tdsSection || null,
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
            console.log('='.repeat(80));
            console.log('CUSTOMER SAVE - FRONTEND');
            console.log('='.repeat(80));
            console.log('Full Payload:', payload);
            console.log('Terms & Conditions:', {
                credit_period: payload.credit_period,
                credit_terms: payload.credit_terms,
                penalty_terms: payload.penalty_terms,
                delivery_terms: payload.delivery_terms,
                warranty_details: payload.warranty_details,
                force_majeure: payload.force_majeure,
                dispute_terms: payload.dispute_terms
            });
            console.log('='.repeat(80));

            let response;
            if (createdCustomerId) {
                // Update existing customer
                console.log('Updating existing customer:', createdCustomerId);
                response = await httpClient.patch(`/api/customerportal/customer-master/${createdCustomerId}/`, payload);
                await fetchCustomers(); // Refresh the list
                if (options.exit) alert('Customer updated successfully!');
            } else {
                // Create new customer
                console.log('Creating new customer...');
                response = await httpClient.post('/api/customerportal/customer-master/', payload);
                console.log('Customer created! Response:', response);
                setCreatedCustomerId(response.id);
                await fetchCustomers(); // Refresh the list
                if (options.exit) alert('Customer created successfully!');
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
                    contact_number: ''
                });
            }
            return true;
        } catch (error: any) {
            console.error('Error saving customer:', error);
            let errorMessage = 'Failed to save customer';

            // Check if it's a duplicate entry error
            if (error.response?.status === 500 && error.response?.data) {
                const errorText = typeof error.response.data === 'string' ? error.response.data : '';
                if (errorText.includes('Duplicate entry') || errorText.includes('unique_tenant_customer_code')) {
                    errorMessage = 'This customer code already exists. Please try again with a new customer.';
                    // Generate a new customer code
                    setCustomerFormData(prev => ({
                        ...prev,
                        customer_code: `CUST-${Date.now().toString().slice(-6)}`
                    }));
                }
            } else if (error.response?.data) {
                const errorData = error.response.data;
                if (errorData.detail) {
                    errorMessage = errorData.detail;
                } else if (typeof errorData === 'object') {
                    errorMessage += ':\n';
                    Object.keys(errorData).forEach(field => {
                        const fieldErrors = Array.isArray(errorData[field]) ? errorData[field] : [errorData[field]];
                        errorMessage += `\n${field}: ${fieldErrors.join(', ')}`;
                    });
                }
            }
            alert(errorMessage);
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


    const handleRemoveBank = (id: number) => {
        if (window.confirm('Are you sure you want to remove this bank account? This action cannot be undone.')) {
            setBankAccounts(prev => prev.filter(acc => acc.id !== id));
            if (bankAccounts.length === 1) setIsAddingBank(false);
        }
    };

    const handleBankChange = (id: number, field: string, value: any) => {
        setBankAccounts(prev => prev.map(acc =>
            acc.id === id ? { ...acc, [field]: value } : acc
        ));
    };

    const handleProductRowChange = (id: number, field: string, value: string) => {
        setProductRows(prev => prev.map(row => {
            if (row.id === id) {
                const updatedRow = { ...row, [field]: value };
                if (field === 'itemCode') {
                    const item = stockItems.find(i => i.code === value);
                    updatedRow.itemName = item ? item.name : 'Auto-fetched';
                }
                return updatedRow;
            }
            return row;
        }));
    };

    const handleAddProductRow = () => {
        setProductRows(prev => [
            ...prev,
            { id: prev.length + 1, itemCode: '', itemName: 'Auto-fetched', uom: '', custItemCode: '', custItemName: '', custUom: '' }
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
            address: '',
            contactPerson: '',
            email: '',
            contactNumber: ''
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
            customer_category: customer.customer_category || '', // Use ID if available
            pan_number: customer.pan_number || '',
            contact_person: customer.contact_person || '',
            email_address: customer.email_address || '',
            contact_number: customer.contact_number || ''
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
                    address: b.address || '',
                    contactPerson: b.contactPerson || '',
                    email: b.email || '',
                    contactNumber: b.contactNumber || '',
                    gstin: null
                }));
                setUnregisteredBranches(branches.length ? branches : [{ id: 1, referenceName: '', address: '', contactPerson: '', email: '', contactNumber: '', gstin: null }]);
            } else {
                // Populate registered branches
                setSelectedGSTINs(gstData.gstins || []);

                // Populate registered branches state
                const branches = gstData.branches.map((b: any) => {
                    const mock = mockBranches.find(mb => mb.gstin === b.gstin);
                    return {
                        gstin: b.gstin,
                        defaultRef: b.defaultRef || (mock ? mock.defaultRef : ''),
                        address: b.address || (mock ? mock.address : ''),
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
            setUnregisteredBranches([{ id: 1, referenceName: '', address: '', contactPerson: '', email: '', contactNumber: '', gstin: null }]);
        }

        // 4. Products Services
        const prodData = customer.products_services;
        if (prodData && prodData.items.length > 0) {
            setProductRows(prodData.items.map((item: any, index: number) => ({
                id: index + 1,
                itemCode: item.itemCode || '',
                itemName: item.itemName || '',
                uom: item.uom || '',
                custItemCode: item.custItemCode || '',
                custItemName: item.custItemName || '',
                custUom: item.custUom || ''
            })));
        } else {
            setProductRows([{ id: 1, itemCode: '', itemName: 'Auto-fetched', uom: '', custItemCode: '', custItemName: '', custUom: '' }]);
        }

        // 5. Statutory (TDS)
        setStatutoryDetails({
            msmeNo: customer.msme_no || '',
            fssaiNo: customer.fssai_no || '',
            iecCode: customer.iec_code || '',
            eouStatus: customer.eou_status || 'Export Oriented Unit (EOU)',
            tcsSection: customer.tcs_section || '',
            tcsEnabled: customer.tcs_enabled || false,
            tdsSection: customer.tds_section || '',
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

    const filteredCustomers = (customers || []).filter(customer => {
        const name = customer.customer_name || customer.name || '';
        const code = customer.customer_code || customer.code || '';
        const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            code.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'All Status' || (customer.status || 'Live') === statusFilter;

        // Category matching - handle both mock and real customer structures
        const customerCategory = customer.customer_category_name || customer.category || '';
        const matchesCategory = categoryFilter === 'All Categories' || customerCategory === categoryFilter;

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
                                    className="p-6 border border-gray-200 bg-white rounded-lg text-left transition-all hover:border-indigo-300 hover:shadow-sm"
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
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Customer Category</label>
                                <select
                                    value={customerFormData.customer_category}
                                    onChange={(e) => handleCustomerFieldChange('customer_category', e.target.value)}
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-gray-600 bg-white">
                                    <option value="">Select Category</option>
                                    {categories.map((cat) => (
                                        <option key={cat.id} value={cat.id}>
                                            {cat.full_path || [cat.category, cat.group, cat.subgroup].filter(Boolean).join(' > ')}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Row 2 */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Customer Code</label>
                                <input
                                    type="text"
                                    value={customerFormData.customer_code}
                                    readOnly
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-md bg-gray-50 text-gray-600"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">PAN Number</label>
                                <input
                                    type="text"
                                    value={customerFormData.pan_number}
                                    onChange={(e) => handleCustomerFieldChange('pan_number', e.target.value)}
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                />
                            </div>

                            {/* Row 3 */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Contact Person</label>
                                <input
                                    type="text"
                                    value={customerFormData.contact_person}
                                    onChange={(e) => handleCustomerFieldChange('contact_person', e.target.value)}
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Email Address</label>
                                <input
                                    type="email"
                                    value={customerFormData.email_address}
                                    onChange={(e) => handleCustomerFieldChange('email_address', e.target.value)}
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                />
                            </div>

                            {/* Row 4 */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Contact Number</label>
                                <input
                                    type="text"
                                    value={customerFormData.contact_number}
                                    onChange={(e) => handleCustomerFieldChange('contact_number', e.target.value)}
                                    className="w-full px-4 py-2.5 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 bg-white"
                                />
                            </div>
                            <div className="md:col-span-1"></div> {/* Spacer */}

                            {/* Radio Groups */}
                            <div className="md:col-span-2 border border-gray-200 rounded-md p-6 bg-gray-50/50">
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
                                        <input type="radio" name="tds" className="text-indigo-600 focus:ring-indigo-500 w-4 h-4" />
                                        <span className="text-sm text-gray-700">Yes</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="radio" name="tds" defaultChecked className="text-indigo-600 focus:ring-indigo-500 w-4 h-4" />
                                        <span className="text-sm text-gray-700">No</span>
                                    </label>
                                </div>
                            </div>

                        </div>

                        {/* Footer Buttons */}
                        <div className="flex justify-between items-center gap-4 mt-12 border-t border-gray-200 pt-6">
                            <button
                                onClick={handleBackButton}
                                className="flex items-center gap-2 px-6 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                                <ChevronLeft className="w-4 h-4" />
                                Back
                            </button>
                            <div className="flex gap-4">
                                <button onClick={() => setView('list')} className="px-6 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">Cancel</button>
                                <button
                                    onClick={handleNextToGst}
                                    className="px-6 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* GST Details Content */}
                {activeTab === 'GST Details' && (
                    <div className="max-w-4xl mx-auto">
                        <div className="flex justify-center mb-10 pt-4">
                            <label className="flex items-center gap-3 cursor-pointer p-2 px-4 rounded-md hover:bg-gray-50 transition-colors border border-transparent hover:border-gray-200">
                                <input
                                    type="checkbox"
                                    checked={isUnregistered}
                                    onChange={(e) => setIsUnregistered(e.target.checked)}
                                    className="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500 border-gray-300"
                                />
                                <span className="text-sm font-semibold text-gray-700">Customer is Unregistered</span>
                            </label>
                        </div>

                        {/* Conditional Content based on Registration Status */}
                        {isUnregistered ? (
                            <div className="space-y-8 animate-fadeIn">
                                {/* Unregistered Fields */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="relative">
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">GSTIN No.</label>
                                        <input
                                            type="text"
                                            value="NA"
                                            disabled
                                            className="w-full px-4 py-2 border border-gray-200 rounded-md bg-gray-100 text-gray-500 cursor-not-allowed"
                                        />
                                        <span className="absolute right-0 -top-6 text-xs text-indigo-500 font-medium italic">No GSTIN available</span>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">Taxpayer Type</label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                value="Unregistered"
                                                readOnly
                                                className="w-full px-4 py-2 border border-green-200 rounded-md bg-green-50 text-green-700 font-medium ring-1 ring-green-200"
                                            />
                                            <span className="absolute right-3 top-2.5 text-xs text-green-600">Auto-set</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Branch Configuration */}
                                <div>
                                    <div className="flex items-center gap-6 mb-6">
                                        <label className="text-sm font-semibold text-gray-700">Add Multiple Branches</label>
                                        <div className="flex bg-gray-100 p-1 rounded-md">
                                            <button
                                                onClick={() => setAddMultipleBranches(true)}
                                                className={`px-4 py-1 text-xs font-medium rounded ${addMultipleBranches ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                            >
                                                Yes
                                            </button>
                                            <button
                                                onClick={() => setAddMultipleBranches(false)}
                                                className={`px-4 py-1 text-xs font-medium rounded ${!addMultipleBranches ? 'bg-white text-gray-800 shadow-sm ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-700'}`}
                                            >
                                                No
                                            </button>
                                        </div>
                                    </div>

                                    {!addMultipleBranches ? (
                                        // Single Branch - Simple Address
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">Address <span className="text-red-500">*</span></label>
                                            <textarea
                                                rows={3}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 resize-none"
                                                placeholder="Enter Full Address"
                                                value={unregisteredBranches[0].address}
                                                onChange={(e) => handleManualBranchChange(1, 'address', e.target.value)}
                                            />
                                        </div>
                                    ) : (
                                        // Multiple Manual Branches
                                        <div className="space-y-4">
                                            {unregisteredBranches.map((branch, index) => {
                                                const isExpanded = expandedBranches.includes(branch.id);
                                                return (
                                                    <div key={branch.id} className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
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
                                                                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                                        value={branch.referenceName}
                                                                        onChange={(e) => handleManualBranchChange(branch.id, 'referenceName', e.target.value)}
                                                                        placeholder="e.g. Warehouse, Main Office"
                                                                    />
                                                                </div>
                                                                <div className="md:col-span-2">
                                                                    <label className="block text-xs font-medium text-gray-500 mb-1">Address</label>
                                                                    <textarea
                                                                        rows={2}
                                                                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm resize-none"
                                                                        value={branch.address}
                                                                        onChange={(e) => handleManualBranchChange(branch.id, 'address', e.target.value)}
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-xs font-medium text-gray-500 mb-1">Contact Person</label>
                                                                    <input
                                                                        type="text"
                                                                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                                        value={branch.contactPerson}
                                                                        onChange={(e) => handleManualBranchChange(branch.id, 'contactPerson', e.target.value)}
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-xs font-medium text-gray-500 mb-1">Contact Number</label>
                                                                    <input
                                                                        type="text"
                                                                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                                        value={branch.contactNumber}
                                                                        onChange={(e) => handleManualBranchChange(branch.id, 'contactNumber', e.target.value)}
                                                                    />
                                                                </div>
                                                                <div className="md:col-span-2">
                                                                    <label className="block text-xs font-medium text-gray-500 mb-1">Email Address</label>
                                                                    <input
                                                                        type="email"
                                                                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm"
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
                                                className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 font-medium hover:border-indigo-500 hover:text-indigo-600 transition-colors flex items-center justify-center gap-2"
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
                                                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                                placeholder={selectedGSTINs.length > 0 ? `${selectedGSTINs.length} selected... Type to add more` : "Enter or Select GSTIN"}
                                                value={gstInput}
                                                onChange={(e) => setGstInput(e.target.value)}
                                                onFocus={() => setShowGstDropdown(true)}
                                                onBlur={() => setTimeout(() => setShowGstDropdown(false), 200)}
                                            />
                                            {/* Dropdown Simulation */}
                                            {showGstDropdown && (
                                                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-10 max-h-48 overflow-y-auto">
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
                                                className="px-6 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-600 hover:bg-gray-50 whitespace-nowrap"
                                            >
                                                Fetch branch details
                                            </button>
                                            <span className="text-[10px] text-indigo-500 text-center">from GST Portal & display here</span>
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
                                                <div key={gstin} className="border border-indigo-100 rounded-lg overflow-hidden bg-white shadow-sm">
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
                                                                <label className="block text-xs font-medium text-gray-500 mb-1">Address (Fetched / Editable)</label>
                                                                <textarea
                                                                    rows={3}
                                                                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm resize-none"
                                                                    value={branch.address}
                                                                    onChange={(e) => handleRegisteredBranchChange(gstin, 'address', e.target.value)}
                                                                />
                                                            </div>

                                                            <div>
                                                                <label className="block text-xs font-medium text-gray-500 mb-1">Reference Name</label>
                                                                <input
                                                                    type="text"
                                                                    value={branch.defaultRef}
                                                                    onChange={(e) => handleRegisteredBranchChange(gstin, 'defaultRef', e.target.value)}
                                                                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                                />
                                                            </div>

                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                                <div>
                                                                    <label className="block text-xs font-medium text-gray-500 mb-1">Contact Person</label>
                                                                    <input
                                                                        type="text"
                                                                        value={branch.contactPerson || ''}
                                                                        onChange={(e) => handleRegisteredBranchChange(gstin, 'contactPerson', e.target.value)}
                                                                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                                    />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-xs font-medium text-gray-500 mb-1">Contact Number</label>
                                                                    <input
                                                                        type="text"
                                                                        value={branch.contactNumber || ''}
                                                                        onChange={(e) => handleRegisteredBranchChange(gstin, 'contactNumber', e.target.value)}
                                                                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                                    />
                                                                </div>
                                                            </div>

                                                            <div>
                                                                <label className="block text-xs font-medium text-gray-500 mb-1">Email Address</label>
                                                                <input
                                                                    type="email"
                                                                    value={branch.email || ''}
                                                                    onChange={(e) => handleRegisteredBranchChange(gstin, 'email', e.target.value)}
                                                                    className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm"
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
                                className="flex items-center gap-2 px-8 py-2.5 border border-gray-300 rounded-md text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
                            >
                                <ChevronLeft className="w-4 h-4" />
                                Back
                            </button>
                            <button
                                onClick={() => setView('list')}
                                className="px-8 py-2.5 border border-gray-300 rounded-md text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => setActiveTab('Products/Services')}
                                className="px-10 py-2.5 bg-indigo-600 text-white rounded-md text-sm font-semibold hover:bg-indigo-700 transition-all shadow-md active:scale-95"
                            >
                                Next
                            </button>
                        </div>
                    </div>
                )}

                {/* Products/Services Content */}
                {activeTab === 'Products/Services' && (
                    <div className="max-w-6xl mx-auto">
                        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden mb-6">
                            {/* Table Header */}
                            <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-700 uppercase tracking-wider">
                                <div className="col-span-1">No</div>
                                <div className="col-span-2">Item Code <span className="text-red-500">*</span></div>
                                <div className="col-span-2">Item Name</div>
                                <div className="col-span-1">UOM</div>
                                <div className="col-span-2">Customer Item Code</div>
                                <div className="col-span-2">Customer Item Name</div>
                                <div className="col-span-1">Customer UOM</div>
                                <div className="col-span-1 text-center">Action</div>
                            </div>

                            {/* Table Body */}
                            <div className="divide-y divide-gray-100">
                                {productRows.map((row, index) => (
                                    <div key={row.id} className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-gray-50/50 transition-colors">
                                        <div className="col-span-1 text-sm text-gray-500 font-medium">{index + 1}</div>
                                        <div className="col-span-2">
                                            <select
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
                                                value={row.itemCode}
                                                onChange={(e) => handleProductRowChange(row.id, 'itemCode', e.target.value)}
                                            >
                                                <option value="">Select Item</option>
                                                {stockItems.map(item => (
                                                    <option key={item.code} value={item.code}>{item.code} - {item.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="col-span-2">
                                            <input
                                                type="text"
                                                readOnly
                                                className="w-full px-3 py-2 border border-gray-200 rounded-md bg-gray-100 text-gray-500 text-sm cursor-not-allowed"
                                                placeholder="Auto-fetched"
                                                value={row.itemName}
                                            />
                                        </div>
                                        <div className="col-span-1">
                                            <input
                                                type="text"
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                placeholder="UOM"
                                                value={(row as any).uom || ''}
                                                onChange={(e) => handleProductRowChange(row.id, 'uom', e.target.value)}
                                            />
                                        </div>
                                        <div className="col-span-2">
                                            <input
                                                type="text"
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                placeholder="Optional"
                                                value={row.custItemCode}
                                                onChange={(e) => handleProductRowChange(row.id, 'custItemCode', e.target.value)}
                                            />
                                        </div>
                                        <div className="col-span-2">
                                            <input
                                                type="text"
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                placeholder="Optional"
                                                value={row.custItemName}
                                                onChange={(e) => handleProductRowChange(row.id, 'custItemName', e.target.value)}
                                            />
                                        </div>
                                        <div className="col-span-1">
                                            <input
                                                type="text"
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                placeholder="UOM"
                                                value={(row as any).custUom || ''}
                                                onChange={(e) => handleProductRowChange(row.id, 'custUom', e.target.value)}
                                            />
                                        </div>
                                        <div className="col-span-1 flex justify-center">
                                            <button
                                                onClick={() => handleRemoveProductRow(row.id)}
                                                disabled={productRows.length === 1}
                                                className={`p-2 rounded-full hover:bg-red-50 transition-colors ${productRows.length === 1 ? 'text-gray-300 cursor-not-allowed' : 'text-gray-400 hover:text-red-500 cursor-pointer'}`}
                                            >
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <polyline points="3 6 5 6 21 6"></polyline>
                                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Add Row Button */}
                        <div className="mb-12">
                            <button
                                onClick={handleAddProductRow}
                                className="w-10 h-10 flex items-center justify-center rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors shadow-sm border border-indigo-200"
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
                                className="flex items-center gap-2 px-6 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                                <ChevronLeft className="w-4 h-4" />
                                Back
                            </button>
                            <div className="flex gap-4">
                                <button onClick={() => setView('list')} className="px-6 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">Cancel</button>
                                <button
                                    onClick={() => setActiveTab('TDS & Other Statutory Details')}
                                    className="px-6 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* TDS & Other Statutory Details Content */}
                {activeTab === 'TDS & Other Statutory Details' && (
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
                                            className="w-full pl-4 pr-12 py-2.5 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm placeholder-gray-400"
                                            placeholder="UDYAM-XX-00-000000"
                                            value={statutoryDetails.msmeNo}
                                            onChange={(e) => setStatutoryDetails({ ...statutoryDetails, msmeNo: e.target.value })}
                                        />
                                        <button className="absolute right-2 p-1.5 text-gray-400 hover:text-indigo-600 rounded-md hover:bg-gray-100 transition-colors">
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">FSSAI License Number</label>
                                    <div className="relative flex items-center">
                                        <input
                                            type="text"
                                            className="w-full pl-4 pr-12 py-2.5 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm placeholder-gray-400"
                                            placeholder="14-digit License Number"
                                            value={statutoryDetails.fssaiNo}
                                            onChange={(e) => setStatutoryDetails({ ...statutoryDetails, fssaiNo: e.target.value })}
                                        />
                                        <button className="absolute right-2 p-1.5 text-gray-400 hover:text-indigo-600 rounded-md hover:bg-gray-100 transition-colors">
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
                                            className="w-full pl-4 pr-12 py-2.5 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm placeholder-gray-400"
                                            placeholder="10-DIGIT IEC CODE"
                                            value={statutoryDetails.iecCode}
                                            onChange={(e) => setStatutoryDetails({ ...statutoryDetails, iecCode: e.target.value })}
                                        />
                                        <button className="absolute right-2 p-1.5 text-gray-400 hover:text-indigo-600 rounded-md hover:bg-gray-100 transition-colors">
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <div className="md:col-span-1">
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">EOU Status</label>
                                        <select
                                            className="w-full px-4 py-2.5 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
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
                                                <button className="p-1.5 border border-gray-200 rounded-md text-gray-400 hover:text-indigo-600 hover:border-indigo-200 hover:bg-gray-50 transition-colors">
                                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                                                </button>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="text-sm text-gray-500">Green Card</span>
                                                <button className="p-1.5 border border-gray-200 rounded-md text-gray-400 hover:text-indigo-600 hover:border-indigo-200 hover:bg-gray-50 transition-colors">
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
                            <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-6">Tax Configuration</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {/* TCS Card */}
                                <div className="border border-gray-200 rounded-lg p-6 bg-gray-50/30">
                                    <div className="flex justify-between items-start mb-4">
                                        <h5 className="font-semibold text-gray-800">TCS Configuration</h5>
                                        <span className="text-gray-400" title="Information">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                                        </span>
                                    </div>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-xs font-medium text-gray-500 mb-1">Applicable Section</label>
                                            <div className="flex items-center gap-2">
                                                <select
                                                    className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
                                                    value={statutoryDetails.tcsSection}
                                                    onChange={(e) => {
                                                        setStatutoryDetails({ ...statutoryDetails, tcsSection: e.target.value });
                                                        // Auto-show description when a section is selected
                                                        if (e.target.value) {
                                                            const [section, name] = e.target.value.split('|');
                                                            const tcsInfo = tcsSections.find(t => t.section === section && t.name === name);
                                                            if (tcsInfo) {
                                                                setSelectedTcsInfo(tcsInfo);
                                                                setShowTcsInfo(true);
                                                            }
                                                        } else {
                                                            setShowTcsInfo(false);
                                                            setSelectedTcsInfo(null);
                                                        }
                                                    }}
                                                >
                                                    <option value="">Select TCS Section</option>
                                                    {tcsSections.map((tcs, index) => (
                                                        <option key={index} value={`${tcs.section}|${tcs.name}`}>
                                                            {tcs.section} - {tcs.name}
                                                        </option>
                                                    ))}
                                                </select>
                                                {statutoryDetails.tcsSection && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowTcsInfo(!showTcsInfo)}
                                                        className="p-2 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-md transition-colors"
                                                        title={showTcsInfo ? "Hide Description" : "Show Description"}
                                                    >
                                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                            <circle cx="12" cy="12" r="10"></circle>
                                                            <line x1="12" y1="16" x2="12" y2="12"></line>
                                                            <line x1="12" y1="8" x2="12.01" y2="8"></line>
                                                        </svg>
                                                    </button>
                                                )}
                                            </div>

                                            {/* Description Display */}
                                            {showTcsInfo && selectedTcsInfo && (
                                                <div className="mt-3 p-3 bg-indigo-50 border border-indigo-200 rounded-md">
                                                    <div className="flex items-start gap-2">
                                                        <svg className="w-5 h-5 text-indigo-600 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                            <circle cx="12" cy="12" r="10"></circle>
                                                            <line x1="12" y1="16" x2="12" y2="12"></line>
                                                            <line x1="12" y1="8" x2="12.01" y2="8"></line>
                                                        </svg>
                                                        <div className="flex-1">
                                                            <p className="text-xs font-medium text-indigo-900 mb-1">Description</p>
                                                            <p className="text-sm text-indigo-800 leading-relaxed">{selectedTcsInfo.description}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
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

                                {/* TDS Card */}
                                <div className="border border-gray-200 rounded-lg p-6 bg-gray-50/30">
                                    <div className="flex justify-between items-start mb-4">
                                        <h5 className="font-semibold text-gray-800">TDS Configuration</h5>
                                        <span className="text-gray-400" title="Information">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                                        </span>
                                    </div>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-xs font-medium text-gray-500 mb-1">Receivable Section</label>
                                            <div className="flex items-center gap-2">
                                                <select
                                                    className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
                                                    value={statutoryDetails.tdsSection}
                                                    onChange={(e) => {
                                                        setStatutoryDetails({ ...statutoryDetails, tdsSection: e.target.value });
                                                        // Auto-show description when a section is selected
                                                        if (e.target.value) {
                                                            const [section, name] = e.target.value.split('|');
                                                            const tdsInfo = tdsSections.find(t => t.section === section && t.name === name);
                                                            if (tdsInfo) {
                                                                setSelectedTdsInfo(tdsInfo);
                                                                setShowTdsInfo(true);
                                                            }
                                                        } else {
                                                            setShowTdsInfo(false);
                                                            setSelectedTdsInfo(null);
                                                        }
                                                    }}
                                                >
                                                    <option value="">Select TDS Section</option>
                                                    {tdsSections.map((tds, index) => (
                                                        <option key={index} value={`${tds.section}|${tds.name}`}>
                                                            {tds.section} - {tds.name}
                                                        </option>
                                                    ))}
                                                </select>
                                                {statutoryDetails.tdsSection && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowTdsInfo(!showTdsInfo)}
                                                        className="p-2 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-md transition-colors"
                                                        title={showTdsInfo ? "Hide Description" : "Show Description"}
                                                    >
                                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                            <circle cx="12" cy="12" r="10"></circle>
                                                            <line x1="12" y1="16" x2="12" y2="12"></line>
                                                            <line x1="12" y1="8" x2="12.01" y2="8"></line>
                                                        </svg>
                                                    </button>
                                                )}
                                            </div>

                                            {/* Description Display */}
                                            {showTdsInfo && selectedTdsInfo && (
                                                <div className="mt-3 p-3 bg-indigo-50 border border-indigo-200 rounded-md">
                                                    <div className="flex items-start gap-2">
                                                        <svg className="w-5 h-5 text-indigo-600 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                            <circle cx="12" cy="12" r="10"></circle>
                                                            <line x1="12" y1="16" x2="12" y2="12"></line>
                                                            <line x1="12" y1="8" x2="12.01" y2="8"></line>
                                                        </svg>
                                                        <div className="flex-1">
                                                            <p className="text-xs font-medium text-indigo-900 mb-1">Description</p>
                                                            <p className="text-sm text-indigo-800 leading-relaxed">{selectedTdsInfo.description}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
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
                            </div>
                        </div>

                        {/* Footer Buttons */}
                        <div className="flex justify-between items-center gap-4 border-t border-gray-200 pt-6">
                            <button
                                onClick={handleBackButton}
                                className="flex items-center gap-2 px-6 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                                <ChevronLeft className="w-4 h-4" />
                                Back
                            </button>
                            <div className="flex gap-4">
                                <button onClick={() => setView('list')} className="px-6 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">Cancel</button>
                                <button
                                    onClick={() => setActiveTab('Banking Info')}
                                    className="px-6 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    </div>
                )}


                {/* Banking Info Content */}
                {activeTab === 'Banking Info' && (
                    <div className="max-w-6xl mx-auto space-y-8">
                        {/* Info Banner */}
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
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
                            <div className="border-2 border-dashed border-gray-200 rounded-xl p-12 flex flex-col items-center justify-center text-center">
                                <p className="text-gray-500 mb-6">No bank accounts added yet</p>
                                <button
                                    onClick={handleAddBank}
                                    className="px-6 py-2.5 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm"
                                >
                                    + Add Bank Account
                                </button>
                            </div>
                        ) : (
                            // Detailed Card List
                            <div className="space-y-6">
                                {bankAccounts.map((account, index) => (
                                    <div key={account.id} className="border border-gray-200 rounded-lg p-6 bg-white shadow-sm hover:shadow-md transition-shadow">
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
                                                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                        value={account.accountNumber}
                                                        onChange={(e) => handleBankChange(account.id, 'accountNumber', e.target.value)}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-500 mb-1">IFSC Code / Routing Number</label>
                                                    <input
                                                        type="text"
                                                        placeholder="ABCD0123456"
                                                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                        value={account.ifscCode}
                                                        onChange={(e) => handleBankChange(account.id, 'ifscCode', e.target.value)}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-500 mb-1">SWIFT Code</label>
                                                    <input
                                                        type="text"
                                                        placeholder="ENTER SWIFT CODE"
                                                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm"
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
                                                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                        value={account.bankName}
                                                        onChange={(e) => handleBankChange(account.id, 'bankName', e.target.value)}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-500 mb-1">Branch Name</label>
                                                    <input
                                                        type="text"
                                                        placeholder="Enter branch name"
                                                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                        value={account.branchName}
                                                        onChange={(e) => handleBankChange(account.id, 'branchName', e.target.value)}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Associate to Vendor Branch - Multi-select Dropdown with Display Field */}
                                        <div className="mb-2">
                                            <label className="block text-xs font-medium text-gray-500 mb-1">Associate to Vendor Branch</label>
                                            <div className="grid grid-cols-2 gap-4">
                                                {/* Multi-select Dropdown */}
                                                <div className="relative branch-dropdown-container">
                                                    <button
                                                        type="button"
                                                        onClick={() => setOpenBranchDropdown(openBranchDropdown === account.id ? null : account.id)}
                                                        className="w-full px-4 py-2 border border-gray-300 rounded-md bg-white text-sm text-left hover:border-indigo-400 transition-colors flex items-center justify-between"
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
                                                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg">
                                                            <div className="p-2 space-y-1">
                                                                {['Bangalore HO', 'City Branch', 'Mumbai Branch'].map((branch) => (
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
                                                    <div className="w-full px-4 py-2 border border-gray-300 rounded-md bg-gray-50 text-sm text-gray-700 min-h-[38px]">
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
                                        className="px-4 py-2 border border-indigo-200 text-indigo-600 rounded-md text-sm font-medium hover:bg-indigo-50 transition-colors flex items-center gap-2"
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
                                className="flex items-center gap-2 px-6 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                                <ChevronLeft className="w-4 h-4" />
                                Back
                            </button>
                            <div className="flex gap-4">
                                <button onClick={() => setView('list')} className="px-6 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">Cancel</button>
                                <button
                                    onClick={() => setActiveTab('Terms & Conditions')}
                                    className="px-6 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 transition-colors"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Terms & Conditions Content */}
                {activeTab === 'Terms & Conditions' && (
                    <div className="max-w-6xl mx-auto space-y-6">

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Credit Period</label>
                            <input
                                type="text"
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm placeholder-gray-400"
                                placeholder="e.g., 30 Days"
                                value={termsDetails.creditPeriod}
                                onChange={(e) => setTermsDetails({ ...termsDetails, creditPeriod: e.target.value })}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Credit Terms</label>
                            <textarea
                                rows={3}
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm placeholder-gray-400"
                                placeholder="Enter credit terms details"
                                value={termsDetails.creditTerms}
                                onChange={(e) => setTermsDetails({ ...termsDetails, creditTerms: e.target.value })}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Penalty Terms</label>
                            <textarea
                                rows={3}
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm placeholder-gray-400"
                                placeholder="Enter penalty terms"
                                value={termsDetails.penaltyTerms}
                                onChange={(e) => setTermsDetails({ ...termsDetails, penaltyTerms: e.target.value })}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Delivery Terms</label>
                            <textarea
                                rows={3}
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm placeholder-gray-400"
                                placeholder="Enter delivery terms"
                                value={termsDetails.deliveryTerms}
                                onChange={(e) => setTermsDetails({ ...termsDetails, deliveryTerms: e.target.value })}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Warranty / Guarantee Details</label>
                            <textarea
                                rows={3}
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm placeholder-gray-400"
                                placeholder="Enter warranty or guarantee details"
                                value={termsDetails.warrantyDetails}
                                onChange={(e) => setTermsDetails({ ...termsDetails, warrantyDetails: e.target.value })}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Force Majeure</label>
                            <textarea
                                rows={3}
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm placeholder-gray-400"
                                placeholder="Enter force majeure terms"
                                value={termsDetails.forceMajeure}
                                onChange={(e) => setTermsDetails({ ...termsDetails, forceMajeure: e.target.value })}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Dispute and Redressal Terms</label>
                            <textarea
                                rows={3}
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm placeholder-gray-400"
                                placeholder="Enter dispute and redressal terms"
                                value={termsDetails.disputeTerms}
                                onChange={(e) => setTermsDetails({ ...termsDetails, disputeTerms: e.target.value })}
                            />
                        </div>

                        {/* Footer Buttons */}
                        <div className="flex justify-between items-center gap-4 border-t border-gray-200 pt-6 mt-8">
                            <button
                                onClick={handleBackButton}
                                className="flex items-center gap-2 px-6 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                                <ChevronLeft className="w-4 h-4" />
                                Back
                            </button>
                            <div className="flex gap-4">
                                <button onClick={() => setView('list')} className="px-6 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">Cancel</button>
                                <button
                                    onClick={async () => {
                                        const success = await handleSaveCustomer({ exit: true });
                                        if (success) {
                                            // View change is handled inside handleSaveCustomer when exit: true
                                        }
                                    }}
                                    className="px-6 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 transition-colors flex items-center gap-2"
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
                )}

                {activeTab !== 'Basic Details' && activeTab !== 'GST Details' && activeTab !== 'Products/Services' && activeTab !== 'TDS & Other Statutory Details' && activeTab !== 'Banking Info' && activeTab !== 'Terms & Conditions' && (
                    <div className="py-12 text-center text-gray-500 italic">
                        {activeTab} content coming soon.
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="p-8">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-gray-900">Customer Management</h3>
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
                            contact_number: ''
                        });
                        setView('create');
                    }}
                    className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 transition-colors flex items-center gap-2"
                >
                    <span>+</span> Create New Customer
                </button>
            </div>

            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-4">
                <div className="md:col-span-8">
                    <input
                        type="text"
                        placeholder="Search by customer name or code..."
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="md:col-span-2">
                    <select
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm text-gray-700"
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
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm text-gray-700"
                        value={categoryFilter}
                        onChange={(e) => setCategoryFilter(e.target.value)}
                    >
                        <option>All Categories</option>
                        <option>Retail</option>
                        <option>Wholesale</option>
                        <option>Corporate</option>
                    </select>
                </div>
            </div>

            <p className="text-sm text-gray-500 mb-4">Showing {filteredCustomers.length} of {customers.length} customers</p>

            {/* Table */}
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
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
                                    {customer.customer_category_name || customer.category || 'N/A'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                    {customer.customer_code || customer.code}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                                    {customer.customer_name || customer.name}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-center">
                                    <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${(customer.status || 'Live') === 'Live'
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
                                            onClick={() => setViewCustomer(customer)}
                                        >
                                            <Eye className="w-5 h-5" />
                                        </button>
                                        <button
                                            className="text-blue-600 hover:text-blue-900 transition-colors"
                                            title="Edit"
                                            onClick={() => handleEditCustomer(customer)}
                                        >
                                            <Pencil className="w-5 h-5" />
                                        </button>
                                        <button
                                            className="text-red-600 hover:text-red-900 transition-colors"
                                            title="Delete"
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
        </div>
    );
};

const CUSTOMER_CATEGORIES: DropdownCategory[] = [
    { id: 1, category: 'Retail', group: 'Consumer', subgroup: null, full_path: 'Consumer > Retail', is_active: true },
    { id: 2, category: 'Wholesale', group: 'Business', subgroup: null, full_path: 'Business > Wholesale', is_active: true },
    { id: 3, category: 'Corporate', group: 'Business', subgroup: null, full_path: 'Business > Corporate', is_active: true },
    { id: 4, category: 'Distributor', group: 'Business', subgroup: null, full_path: 'Business > Distributor', is_active: true },
];

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
            console.error('Error fetching sales quotation series:', error);
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
            console.error('Error fetching sales order series:', error);
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
            alert('Please enter a series name');
            return;
        }
        if (!form.category) {
            alert('Please select a customer category');
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

            await httpClient.post(endpoint, payload);
            alert('Series saved successfully!');

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
        } catch (error: any) {
            console.error('Error saving series:', error);
            let errorMessage = 'Failed to save series';
            if (error.response?.data) {
                const errorData = error.response.data;
                if (errorData.detail) {
                    errorMessage = errorData.detail;
                } else if (typeof errorData === 'object') {
                    errorMessage += ':\n';
                    Object.keys(errorData).forEach(field => {
                        const fieldErrors = Array.isArray(errorData[field]) ? errorData[field] : [errorData[field]];
                        errorMessage += `\n${field}: ${fieldErrors.join(', ')}`;
                    });
                }
            }
            alert(errorMessage);
        }
    };

    const handleDeleteSeries = async (id: number) => {
        if (!window.confirm('Are you sure you want to delete this series?')) return;
        try {
            const endpoint = subTab === 'Sales Quotation'
                ? `/api/customerportal/sales-quotation-series/${id}/`
                : `/api/customerportal/sales-order-series/${id}/`;

            await httpClient.delete(endpoint);
            alert('Series deleted successfully!');

            if (subTab === 'Sales Quotation') {
                await fetchSalesQuotationSeries();
            } else {
                await fetchSalesOrderSeries();
            }
        } catch (error) {
            console.error('Error deleting series:', error);
            alert('Failed to delete series');
        }
    };

    const handleEditSeries = (series: any) => {
        setSqForm({
            name: series.series_name || '',
            category: series.customer_category || '',
            prefix: series.prefix || 'SQ/',
            suffix: series.suffix || '/24-25',
            autoYear: series.auto_year !== undefined ? series.auto_year : true,
            digits: series.required_digits || 4
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    return (
        <div className="p-8">
            {/* Sub-tabs */}
            <div className="mb-8">
                <div className="bg-gray-50 p-1 rounded-lg inline-flex">
                    {['Sales Quotation', 'Sales Order'].map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setSubTab(tab as any)}
                            className={`px-6 py-2 rounded-md text-sm font-medium transition-all ${subTab === tab
                                ? 'bg-white text-indigo-600 shadow-sm'
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
                        New {subTab} Series
                    </h3>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Name of Series <span className="text-red-500">*</span></label>
                        <input
                            type="text"
                            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder={`e.g. Retail ${subTab}`}
                            value={form.name}
                            onChange={(e) => handleChange('name', e.target.value)}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Customer Category <span className="text-red-500">*</span></label>
                        <CategoryHierarchicalDropdown
                            staticCategories={CUSTOMER_CATEGORIES}
                            value={form.category}
                            onSelect={(selection) => handleChange('category', selection.fullPath)}
                            colorTheme="teal"
                            placeholder="Select Category"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Prefix</label>
                            <input
                                type="text"
                                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                value={form.prefix}
                                onChange={(e) => handleChange('prefix', e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Suffix</label>
                            <input
                                type="text"
                                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                value={form.suffix}
                                onChange={(e) => handleChange('suffix', e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 items-center">
                        <div className="flex items-center pt-6">
                            <input
                                id="autoYear"
                                type="checkbox"
                                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                                checked={form.autoYear}
                                onChange={(e) => handleChange('autoYear', e.target.checked)}
                            />
                            <label htmlFor="autoYear" className="ml-2 block text-sm text-gray-700">Auto Year</label>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Digits</label>
                            <input
                                type="number"
                                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                value={form.digits}
                                onChange={(e) => handleChange('digits', Number(e.target.value))}
                            />
                        </div>
                    </div>

                    <div className="bg-gray-100 rounded-md p-6 text-center">
                        <p className="text-xs uppercase text-gray-500 font-semibold mb-2">SAMPLE PREVIEW</p>
                        <p className="text-xl font-bold text-gray-800">{getPreview()}</p>
                    </div>

                    <button
                        onClick={handleSaveSeries}
                        disabled={!form.name || !form.category}
                        className="w-full py-2.5 bg-indigo-600 text-white font-medium rounded-md hover:bg-indigo-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed">
                        Save Series
                    </button>
                </div>

                {/* Right: Table */}
                <div className="lg:col-span-8">
                    <h3 className="text-lg font-bold text-gray-900 mb-6">Existing {isSQ ? 'Sales Quotation' : 'Sales Order'} Series</h3>
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
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
                                            <button className="text-indigo-600 hover:text-indigo-900 mr-4">Edit</button>
                                            <button className="text-red-600 hover:text-red-900">Delete</button>
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
    const [contracts, setContracts] = useState<any[]>([]);
    const [customers, setCustomers] = useState<any[]>([]);

    // Basic Details State
    const [basicDetails, setBasicDetails] = useState({
        contractNumber: `CT-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`, // Auto-generated
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
        voucherName: '',
        billPeriodFrom: '',
        billPeriodTo: ''
    });

    // Products State
    const [contractProducts, setContractProducts] = useState([
        { id: 1, itemCode: '', itemName: 'Product Name', customerItemName: '', qtyMin: '', qtyMax: '', priceMin: '', priceMax: '', deviation: '' }
    ]);

    const handleAddProduct = () => {
        setContractProducts([...contractProducts, {
            id: contractProducts.length + 1,
            itemCode: '',
            itemName: 'Product Name',
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
        setContractProducts(contractProducts.map(p =>
            p.id === id ? { ...p, [field]: value } : p
        ));
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
    }, [view]);

    const fetchCustomers = async () => {
        try {
            const response = await httpClient.get('/api/customerportal/customer-master/');
            setCustomers((response as any) || []);
        } catch (error) {
            console.error('Error fetching customers:', error);
            setCustomers([]);
        }
    };

    const fetchContracts = async () => {
        try {
            const response = await httpClient.get('/api/customerportal/long-term-contracts/');
            setContracts((response as any) || []);
        } catch (error) {
            console.error('Error fetching contracts:', error);
            setContracts([]);
        }
    };

    const handleSaveContract = async () => {
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
                voucher_name: automateBilling ? billingConfig.voucherName : null,
                bill_period_from: automateBilling ? billingConfig.billPeriodFrom : null,
                bill_period_to: automateBilling ? billingConfig.billPeriodTo : null,
                products_services: contractProducts.map(p => ({
                    item_code: p.itemCode,
                    item_name: p.itemName,
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

            console.log('Saving contract:', contractData);

            const response = await httpClient.post('/api/customerportal/long-term-contracts/', contractData);

            console.log('Contract saved successfully:', (response as any).data);
            alert('Contract Created Successfully!');

            // Reset form
            resetForm();
            setView('list');
        } catch (error: any) {
            console.error('Error saving contract:', error);
            const errorMessage = error.response?.data?.error || error.message || 'Failed to create contract';
            alert(`Error: ${errorMessage}`);
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setBasicDetails({
            contractNumber: `CT-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`,
            customerId: '',
            customerName: '',
            branchId: '',
            contractType: '',
            validityFrom: '',
            validityTo: '',
            contractDocument: ''
        });
        setBillingConfig({
            billStartDate: '',
            billingFrequency: '',
            voucherName: '',
            billPeriodFrom: '',
            billPeriodTo: ''
        });
        setContractProducts([
            { id: 1, itemCode: '', itemName: 'Product Name', customerItemName: '', qtyMin: '', qtyMax: '', priceMin: '', priceMax: '', deviation: '' }
        ]);
        setTerms({
            paymentTerms: '',
            penaltyTerms: '',
            forceMajeure: '',
            terminationClause: '',
            disputeTerms: '',
            others: ''
        });
        setAutomateBilling(false);
        setActiveTab('Basic Details');
    };


    const getBadgeStyle = (type: string) => {
        switch (type) {
            case 'Rate Contract': return 'bg-blue-100 text-blue-700 hover:bg-blue-200';
            case 'Service Contract': return 'bg-purple-100 text-purple-700 hover:bg-purple-200';
            case 'AMC': return 'bg-green-100 text-green-700 hover:bg-green-200';
            default: return 'bg-gray-100 text-gray-700';
        }
    };

    if (view === 'create') {
        return (
            <div className="p-8">
                <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
                    {/* Header */}
                    <div className="px-8 py-6 border-b border-gray-200">
                        <h3 className="text-lg font-bold text-gray-900">Add New Contract</h3>
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
                                                className="w-full px-4 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-500 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-700 mb-1">Contract Type <span className="text-red-500">*</span></label>
                                            <select
                                                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
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
                                                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm placeholder-gray-400"
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
                                                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
                                                value={basicDetails.customerId}
                                                onChange={(e) => {
                                                    const selectedOption = e.target.options[e.target.selectedIndex];
                                                    setBasicDetails({
                                                        ...basicDetails,
                                                        customerId: e.target.value,
                                                        customerName: selectedOption.text
                                                    });
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
                                                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
                                                value={basicDetails.branchId}
                                                onChange={(e) => setBasicDetails({ ...basicDetails, branchId: e.target.value })}
                                            >
                                                <option value="">Select Branch</option>
                                                <option value="1">Bangalore HO</option>
                                                <option value="2">Pune Branch</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-gray-700 mb-1">Contract Validity To <span className="text-red-500">*</span></label>
                                            <input
                                                type="date"
                                                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm placeholder-gray-400"
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
                                        <div className="border border-gray-300 rounded-md px-4 py-2 flex items-center gap-4 bg-white">
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
                                        <div className="border border-gray-300 rounded-lg p-6 bg-gray-50/50 mt-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                            <h4 className="text-sm font-bold text-gray-800 mb-4 border-b border-gray-200 pb-2">Billing Configuration</h4>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <div>
                                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Bill Start Date <span className="text-red-500">*</span></label>
                                                    <input
                                                        type="date"
                                                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
                                                        value={billingConfig.billStartDate}
                                                        onChange={(e) => setBillingConfig({ ...billingConfig, billStartDate: e.target.value })}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Billing Frequency <span className="text-red-500">*</span></label>
                                                    <select
                                                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
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
                                                <div>
                                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Voucher Name <span className="text-red-500">*</span></label>
                                                    <select
                                                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
                                                        value={billingConfig.voucherName}
                                                        onChange={(e) => setBillingConfig({ ...billingConfig, voucherName: e.target.value })}
                                                    >
                                                        <option value="">Select Voucher</option>
                                                        <option value="sales">Sales Invoice</option>
                                                        <option value="service">Service Invoice</option>
                                                        <option value="recurring">Recurring Invoice</option>
                                                    </select>
                                                </div>
                                                <div className="md:col-span-2">
                                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Bill Period <span className="text-red-500">*</span></label>
                                                    <div className="flex items-center gap-4">
                                                        <div className="flex-1">
                                                            <span className="text-xs text-gray-500 mb-1 block">From</span>
                                                            <input
                                                                type="date"
                                                                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
                                                                value={billingConfig.billPeriodFrom}
                                                                onChange={(e) => setBillingConfig({ ...billingConfig, billPeriodFrom: e.target.value })}
                                                            />
                                                        </div>
                                                        <span className="mt-5 text-gray-400">to</span>
                                                        <div className="flex-1">
                                                            <span className="text-xs text-gray-500 mb-1 block">To</span>
                                                            <input
                                                                type="date"
                                                                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
                                                                value={billingConfig.billPeriodTo}
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
                                <div className="border border-gray-200 rounded-lg overflow-x-auto">
                                    <table className="min-w-full divide-y divide-gray-200">
                                        <thead className="bg-gray-50">
                                            <tr>
                                                <th rowSpan={2} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-12">NO</th>
                                                <th rowSpan={2} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-32">ITEM CODE</th>
                                                <th rowSpan={2} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-40">ITEM NAME</th>
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
                                                                className="block w-full pl-3 pr-8 py-1.5 text-sm border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 rounded-md"
                                                                value={product.itemCode}
                                                                onChange={(e) => handleProductChange(product.id, 'itemCode', e.target.value)}
                                                            >
                                                                <option value="">Select</option>
                                                                <option value="ITEM-001">ITEM-001</option>
                                                                <option value="ITEM-002">ITEM-002</option>
                                                            </select>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 whitespace-nowrap">
                                                        <input
                                                            type="text"
                                                            className="block w-full px-3 py-1.5 text-sm border-gray-300 rounded-md bg-gray-50 text-gray-500 focus:ring-indigo-500 focus:border-indigo-500"
                                                            value={product.itemName}
                                                            readOnly
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3 whitespace-nowrap">
                                                        <input
                                                            type="text"
                                                            className="block w-full px-3 py-1.5 text-sm border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                                            placeholder="Customer item name"
                                                            value={product.customerItemName}
                                                            onChange={(e) => handleProductChange(product.id, 'customerItemName', e.target.value)}
                                                        />
                                                    </td>
                                                    <td className="px-2 py-3 whitespace-nowrap">
                                                        <input
                                                            type="number"
                                                            className="block w-full px-2 py-1.5 text-sm border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-center"
                                                            value={product.qtyMin}
                                                            onChange={(e) => handleProductChange(product.id, 'qtyMin', e.target.value)}
                                                        />
                                                    </td>
                                                    <td className="px-2 py-3 whitespace-nowrap">
                                                        <input
                                                            type="number"
                                                            className="block w-full px-2 py-1.5 text-sm border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-center"
                                                            value={product.qtyMax}
                                                            onChange={(e) => handleProductChange(product.id, 'qtyMax', e.target.value)}
                                                        />
                                                    </td>
                                                    <td className="px-2 py-3 whitespace-nowrap">
                                                        <input
                                                            type="number"
                                                            className="block w-full px-2 py-1.5 text-sm border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-center"
                                                            value={product.priceMin}
                                                            onChange={(e) => handleProductChange(product.id, 'priceMin', e.target.value)}
                                                        />
                                                    </td>
                                                    <td className="px-2 py-3 whitespace-nowrap">
                                                        <input
                                                            type="number"
                                                            className="block w-full px-2 py-1.5 text-sm border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-center"
                                                            value={product.priceMax}
                                                            onChange={(e) => handleProductChange(product.id, 'priceMax', e.target.value)}
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3 whitespace-nowrap">
                                                        <input
                                                            type="text"
                                                            className="block w-full px-3 py-1.5 text-sm border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
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
                                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm placeholder-gray-400 resize-none"
                                        placeholder="Enter payment terms"
                                        value={terms.paymentTerms}
                                        onChange={(e) => setTerms({ ...terms, paymentTerms: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Penalty Terms</label>
                                    <textarea
                                        rows={4}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm placeholder-gray-400 resize-none"
                                        placeholder="Enter penalty terms"
                                        value={terms.penaltyTerms}
                                        onChange={(e) => setTerms({ ...terms, penaltyTerms: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Force Majeure</label>
                                    <textarea
                                        rows={4}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm placeholder-gray-400 resize-none"
                                        placeholder="Enter force majeure details"
                                        value={terms.forceMajeure}
                                        onChange={(e) => setTerms({ ...terms, forceMajeure: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Termination Clause</label>
                                    <textarea
                                        rows={4}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm placeholder-gray-400 resize-none"
                                        placeholder="Enter termination clause"
                                        value={terms.terminationClause}
                                        onChange={(e) => setTerms({ ...terms, terminationClause: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Dispute & Redressal Terms</label>
                                    <textarea
                                        rows={4}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm placeholder-gray-400 resize-none"
                                        placeholder="Enter dispute resolution terms"
                                        value={terms.disputeTerms}
                                        onChange={(e) => setTerms({ ...terms, disputeTerms: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-700 mb-1">Others</label>
                                    <textarea
                                        rows={4}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 text-sm placeholder-gray-400 resize-none"
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
                                onClick={() => setView('list')}
                                className="px-6 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
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
                                        className="px-6 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                                    >
                                        Back
                                    </button>
                                )}
                                <button
                                    onClick={() => {
                                        if (activeTab === 'Basic Details') setActiveTab('Products / Services');
                                        else if (activeTab === 'Products / Services') setActiveTab('Terms & Conditions');
                                        else if (activeTab === 'Terms & Conditions') {
                                            handleSaveContract();
                                        }
                                    }}
                                    disabled={loading}
                                    className={`px-8 py-2 text-white rounded-md text-sm font-medium transition-colors ${activeTab === 'Terms & Conditions' ? 'bg-green-600 hover:bg-green-700 disabled:bg-gray-400' : 'bg-indigo-600 hover:bg-indigo-700'
                                        }`}
                                >
                                    {loading ? 'Saving...' : (activeTab === 'Terms & Conditions' ? 'Save' : 'Next')}
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
                    onClick={() => setView('create')}
                    className="px-5 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 transition-colors shadow-sm flex items-center gap-2"
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    Add New Contract
                </button>
            </div>

            {/* Contracts Table */}
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">CONTRACT NO</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">CUSTOMER REFERENCE NAME</th>
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
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full cursor-default ${getBadgeStyle(contract.contract_type)}`}>
                                        {contract.contract_type}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 tabular-nums">
                                    {contract.contract_validity_from} <span className="mx-2 text-gray-400">-</span> {contract.contract_validity_to}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                                    <div className="flex items-center justify-center gap-3 opacity-60 group-hover:opacity-100 transition-opacity">
                                        <button className="text-gray-500 hover:text-indigo-600 transition-colors" title="View/Edit Details">
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
const ReceiptContent: React.FC = () => {
    const [showPostModal, setShowPostModal] = useState(false);
    const [selectedReceipt, setSelectedReceipt] = useState<any>(null);
    const [postFormData, setPostFormData] = useState({
        dateOfReceipt: '',
        methodOfReceipt: '',
        bankAccount: '',
        bankReferenceNo: ''
    });
    // Mock receipt data - sorted by most recent first
    const receipts = [
        {
            id: 1,
            date: '2026-01-18',
            customerRefName: 'Acme Corporation',
            voucherNo: 'RCP-2026-001',
            amount: 45000.00
        },
        {
            id: 2,
            date: '2026-01-17',
            customerRefName: 'Global Traders',
            voucherNo: 'RCP-2026-002',
            amount: 32500.00
        },
        {
            id: 3,
            date: '2026-01-16',
            customerRefName: 'Tech Solutions Inc',
            voucherNo: 'RCP-2026-003',
            amount: 78500.00
        },
        {
            id: 4,
            date: '2026-01-15',
            customerRefName: 'Sunrise Enterprises',
            voucherNo: 'RCP-2026-004',
            amount: 51200.00
        },
        {
            id: 5,
            date: '2026-01-14',
            customerRefName: 'Metro Supplies Inc',
            voucherNo: 'RCP-2026-005',
            amount: 29800.00
        }
    ];

    // Mock bank accounts - includes both Bank accounts and Bank OD/CC accounts
    const bankAccounts = [
        'HDFC Bank - Current Account ****1234',
        'ICICI Bank - Savings Account ****5678',
        'State Bank of India - Current Account ****9012',
        'Axis Bank OD Account - ****3456',
        'HDFC Bank CC Account - ****7890'
    ];

    const handlePostClick = (receipt: any) => {
        setSelectedReceipt(receipt);
        setPostFormData({
            dateOfReceipt: new Date().toISOString().split('T')[0], // Today's date
            methodOfReceipt: '',
            bankAccount: '',
            bankReferenceNo: ''
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
            bankReferenceNo: ''
        });
    };

    const handleFormChange = (field: string, value: string) => {
        setPostFormData(prev => ({
            ...prev,
            [field]: value,
            // Clear bank-specific fields when switching to Cash
            ...(field === 'methodOfReceipt' && value === 'Cash' ? {
                bankAccount: '',
                bankReferenceNo: ''
            } : {})
        }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        // Basic validation
        if (!postFormData.dateOfReceipt || !postFormData.methodOfReceipt) {
            alert('Please fill in all required fields');
            return;
        }

        if (postFormData.methodOfReceipt === 'Bank' && (!postFormData.bankAccount || !postFormData.bankReferenceNo)) {
            alert('Please fill in Bank Account and Bank Reference No for Bank payment method');
            return;
        }

        // Here you would typically make an API call to post the receipt
        console.log('Posting receipt:', {
            receipt: selectedReceipt,
            postData: postFormData
        });

        alert('Receipt posted successfully!');
        handleCloseModal();
    };

    return (
        <div className="text-left">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-medium text-gray-900">Receipt</h3>
            </div>

            {/* Receipt Listing Table */}
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Date
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Customer Reference Name
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Voucher No
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Amount
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Action
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {receipts.map((receipt) => (
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
                                            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 transition-colors"
                                        >
                                            Post
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {receipts.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                                        No receipts found.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Post Receipt Modal */}
            {showPostModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl max-w-md w-full animate-fade-in">
                        {/* Modal Header */}
                        <div className="px-6 py-4 border-b border-gray-200">
                            <h2 className="text-xl font-semibold text-gray-900">Post Receipt</h2>
                        </div>

                        {/* Modal Body */}
                        <form onSubmit={handleSubmit} className="px-6 py-4">
                            <div className="space-y-4">
                                {/* Date of Receipt */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Date of Receipt <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="date"
                                        value={postFormData.dateOfReceipt}
                                        onChange={(e) => handleFormChange('dateOfReceipt', e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                        required
                                    />
                                </div>

                                {/* Method of Receipt */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Method of Receipt <span className="text-red-500">*</span>
                                    </label>
                                    <select
                                        value={postFormData.methodOfReceipt}
                                        onChange={(e) => handleFormChange('methodOfReceipt', e.target.value)}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                        required
                                    >
                                        <option value="">Select method</option>
                                        <option value="Cash">Cash</option>
                                        <option value="Bank">Bank</option>
                                    </select>
                                </div>

                                {/* Bank Account - Visible only when Bank is selected */}
                                {postFormData.methodOfReceipt === 'Bank' && (
                                    <>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Bank Account <span className="text-red-500">*</span>
                                            </label>
                                            <select
                                                value={postFormData.bankAccount}
                                                onChange={(e) => handleFormChange('bankAccount', e.target.value)}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                                required
                                            >
                                                <option value="">Select bank account</option>
                                                {bankAccounts.map((account, index) => (
                                                    <option key={index} value={account}>
                                                        {account}
                                                    </option>
                                                ))}
                                            </select>
                                            <p className="text-xs text-gray-500 mt-1">
                                                Includes Bank accounts and Bank OD/CC accounts
                                            </p>
                                        </div>

                                        {/* Bank Reference No - Visible only when Bank is selected */}
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                                Bank Reference No <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                value={postFormData.bankReferenceNo}
                                                onChange={(e) => handleFormChange('bankReferenceNo', e.target.value)}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                                placeholder="Enter bank reference number"
                                                required
                                            />
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Modal Footer */}
                            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
                                <button
                                    type="button"
                                    onClick={handleCloseModal}
                                    className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 transition-colors"
                                >
                                    Submit
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
}

interface SalesVoucher {
    id: string;
    date: string;
    salesVchNo: string;
    amount: number;
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
}

interface ReceiptVoucher {
    id: string;
    date: string;
    voucherNo: string;
    amount: number;
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
        <div className="fixed inset-0 z-50 bg-gray-100 flex flex-col overflow-auto">
            <div className="max-w-6xl mx-auto w-full p-8 space-y-8">
                {/* Top Summary Bar */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 px-8 py-6 flex justify-between items-center">
                    <div className="text-gray-600 font-medium">Add amounts for net-off</div>
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
                            className={`ml-6 px-6 py-2.5 text-sm font-semibold rounded-md shadow-sm transition-colors ${isNextEnabled
                                ? 'bg-blue-600 text-white hover:bg-blue-700'
                                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                }`}
                        >
                            Next
                        </button>
                    </div>
                </div>

                {/* Section 1: Sales Vouchers (Debit) */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
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
                                            className="w-32 text-right px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                            value={salesNetOff[v.id] ?? v.amount}
                                            onChange={(e) => handleAmountChange(v.id, e.target.value, v.amount, setSalesNetOff, salesNetOff)}
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Section 2: Payments (Debit) */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                    <div className="bg-white px-6 py-4 border-b border-gray-200">
                        <h3 className="text-center text-lg font-medium text-gray-900">Payments (Debit)</h3>
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
                                            className="w-32 text-right px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                            value={paymentNetOff[v.id] ?? v.amount}
                                            onChange={(e) => handleAmountChange(v.id, e.target.value, v.amount, setPaymentNetOff, paymentNetOff)}
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Section 3: Purchase Vouchers (Credit) */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
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
                                            className="w-32 text-right px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                            value={purchaseNetOff[v.id] ?? v.amount}
                                            onChange={(e) => handleAmountChange(v.id, e.target.value, v.amount, setPurchaseNetOff, purchaseNetOff)}
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Section 4: Receipts (Credit) */}
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
                    <div className="bg-white px-6 py-4 border-b border-gray-200">
                        <h3 className="text-center text-lg font-medium text-gray-900">Receipts (Credit)</h3>
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
                                            className="w-32 text-right px-3 py-1.5 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                                            value={receiptNetOff[v.id] ?? v.amount}
                                            onChange={(e) => handleAmountChange(v.id, e.target.value, v.amount, setReceiptNetOff, receiptNetOff)}
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
                        className="px-6 py-2.5 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
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
        { id: '1', date: '2025-12-15', supplierInvNo: 'PINV-001', amount: 10000 },
        { id: '2', date: '2026-01-02', supplierInvNo: 'PINV-005', amount: 5000 },
        { id: '3', date: '2026-01-10', supplierInvNo: 'PINV-008', amount: 12000 },
    ];

    const salesVouchers: SalesVoucher[] = [
        { id: '1', date: '2025-12-20', salesVchNo: 'INV-2025-050', amount: 15000 },
        { id: '2', date: '2026-01-05', salesVchNo: 'INV-2026-001', amount: 6000 },
        { id: '3', date: '2026-01-12', salesVchNo: 'INV-2026-002', amount: 20000 },
    ];

    const paymentVouchers: PaymentVoucher[] = [
        { id: 'p1', date: '2026-01-08', voucherNo: 'PAY-101', amount: 2500 }
    ];

    const receiptVouchers: ReceiptVoucher[] = [
        { id: 'r1', date: '2026-01-15', voucherNo: 'REC-201', amount: 1000 }
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
        // FIFO Logic - Only process SELECTED invoices, sorted by date (oldest first)
        const selectedPurVouchers = purchaseVouchers
            .filter(v => selectedPurchase.includes(v.id))
            .sort((a, b) => a.date.localeCompare(b.date)); // Oldest first

        const selectedSalVouchers = salesVouchers
            .filter(v => selectedSales.includes(v.id))
            .sort((a, b) => a.date.localeCompare(b.date)); // Oldest first

        if (selectedPurVouchers.length === 0 && selectedSalVouchers.length === 0) {
            alert('Please select at least one invoice to proceed with net-off.');
            return;
        }

        // Calculate totals
        const totalPurchase = selectedPurVouchers.reduce((sum, v) => sum + v.amount, 0);
        const totalSales = selectedSalVouchers.reduce((sum, v) => sum + v.amount, 0);

        // FIFO Net-off Calculation
        let remainingPurchase = totalPurchase;
        let remainingSales = totalSales;
        let nettedAmount = 0;
        const nettedDetails: string[] = [];

        // Apply FIFO: Match oldest purchase with oldest sales
        let purIndex = 0;
        let salIndex = 0;

        while (purIndex < selectedPurVouchers.length && salIndex < selectedSalVouchers.length) {
            const purVoucher = selectedPurVouchers[purIndex];
            const salVoucher = selectedSalVouchers[salIndex];

            const matchAmount = Math.min(purVoucher.amount, salVoucher.amount);
            nettedAmount += matchAmount;

            nettedDetails.push(
                `${purVoucher.supplierInvNo} (₹${matchAmount.toLocaleString('en-IN')}) ↔ ${salVoucher.salesVchNo} (₹${matchAmount.toLocaleString('en-IN')})`
            );

            // Adjust remaining amounts
            purVoucher.amount -= matchAmount;
            salVoucher.amount -= matchAmount;

            if (purVoucher.amount === 0) purIndex++;
            if (salVoucher.amount === 0) salIndex++;
        }

        // Determine result
        const netDifference = totalPurchase - totalSales;
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

        // Display detailed summary
        let message = `╔════════════════════════════════════════╗\n`;
        message += `║   NET-OFF SUMMARY (FIFO Applied)      ║\n`;
        message += `╚════════════════════════════════════════╝\n\n`;

        message += `📊 SELECTED INVOICES:\n`;
        message += `─────────────────────────────────────────\n`;
        message += `Purchase Vouchers (Debit): ${selectedPurVouchers.length} invoice(s)\n`;
        selectedPurVouchers.forEach(v => {
            message += `  • ${v.supplierInvNo} (${v.date}): ₹${v.amount.toLocaleString('en-IN')}\n`;
        });
        message += `\nSales Vouchers (Credit): ${selectedSalVouchers.length} invoice(s)\n`;
        selectedSalVouchers.forEach(v => {
            message += `  • ${v.salesVchNo} (${v.date}): ₹${v.amount.toLocaleString('en-IN')}\n`;
        });

        message += `\n💰 AMOUNTS:\n`;
        message += `─────────────────────────────────────────\n`;
        message += `Total Purchase (Debit):  ₹${totalPurchase.toLocaleString('en-IN')}\n`;
        message += `Total Sales (Credit):    ₹${totalSales.toLocaleString('en-IN')}\n`;
        message += `Net-off Amount:          ₹${nettedAmount.toLocaleString('en-IN')}\n`;

        message += `\n📋 NET-OFF RESULT:\n`;
        message += `─────────────────────────────────────────\n`;
        if (resultType === 'FULLY SETTLED') {
            message += `✅ ${resultType}\n`;
            message += `All selected invoices perfectly balanced!\n`;
        } else {
            message += `📝 Generate: ${resultType}\n`;
            message += `Amount: ₹${resultAmount.toLocaleString('en-IN')}\n`;
        }

        message += `\n💼 BALANCES:\n`;
        message += `─────────────────────────────────────────\n`;
        message += `Running Balance (Before): ₹${runningBalance.toLocaleString('en-IN')}\n`;
        message += `Closing Balance (After):  ₹${closingBalance.toLocaleString('en-IN')}\n`;

        message += `\n✨ FIFO Logic Applied:\n`;
        message += `Oldest invoices were matched first\n`;

        alert(message);

        // In a real application, you would:
        // 1. Create net-off entry in the database
        // 2. Update invoice statuses
        // 3. Generate debit/credit note documents
        // 4. Navigate to Net-off tab
        setActiveTab('Net-off');
    };

    const isNextEnabled = selectedPurchase.length > 0 || selectedSales.length > 0;

    return (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
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
                                        className="text-sm px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    />
                                    <Calendar className="w-4 h-4 text-gray-400" />
                                </div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500 mb-1">Running Balance:</div>
                                <div className="text-lg font-semibold text-blue-600">₹{runningBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="px-6 border-b border-gray-200">
                    <div className="flex gap-6">
                        <button
                            className={`py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'Invoices under Dispute'
                                ? 'border-blue-600 text-blue-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                            onClick={() => setActiveTab('Invoices under Dispute')}
                        >
                            Invoices under Dispute
                        </button>
                        <button
                            className={`py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'Net-off'
                                ? 'border-blue-600 text-blue-600'
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
                        <div className="grid grid-cols-2 gap-6 h-full">
                            {/* Purchase Vouchers Card */}
                            <div className="border border-gray-200 rounded-lg overflow-hidden flex flex-col bg-white">
                                <div className="bg-white px-4 py-3 border-b border-gray-200">
                                    <h3 className="text-sm font-medium text-gray-700">Purchase Vouchers</h3>
                                </div>
                                <div className="flex-1 overflow-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-white sticky top-0">
                                            <tr className="text-left text-xs text-gray-500 uppercase border-b border-gray-200">
                                                <th className="px-4 py-3 font-medium">SELECT</th>
                                                <th className="px-4 py-3 font-medium">DATE</th>
                                                <th className="px-4 py-3 font-medium">SUPPLIER INV NO</th>
                                                <th className="px-4 py-3 text-right font-medium">AMOUNT</th>
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
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Sales Vouchers Card */}
                            <div className="border border-gray-200 rounded-lg overflow-hidden flex flex-col bg-white">
                                <div className="bg-white px-4 py-3 border-b border-gray-200">
                                    <h3 className="text-sm font-medium text-gray-700">Sales Vouchers</h3>
                                </div>
                                <div className="flex-1 overflow-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-white sticky top-0">
                                            <tr className="text-left text-xs text-gray-500 uppercase border-b border-gray-200">
                                                <th className="px-4 py-3 font-medium">SELECT</th>
                                                <th className="px-4 py-3 font-medium">DATE</th>
                                                <th className="px-4 py-3 font-medium">SALES VCH NO</th>
                                                <th className="px-4 py-3 text-right font-medium">AMOUNT</th>
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
                                <div className="border border-gray-300 rounded-lg px-6 py-4">
                                    <div className="text-sm text-gray-600 mb-1">Amount Netted Off</div>
                                    <div className="text-2xl font-bold text-blue-600">
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
                                                    .reduce((sum, v) => sum + v.amount, 0);
                                                const totalSal = salesVouchers
                                                    .filter(v => selectedSales.includes(v.id))
                                                    .reduce((sum, v) => sum + v.amount, 0);
                                                return Math.min(totalPur, totalSal).toLocaleString('en-IN', { minimumFractionDigits: 2 });
                                            }
                                        })()}
                                    </div>
                                </div>
                            </div>

                            {/* List of Pending Invoices Section */}
                            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                                <h2 className="text-lg font-semibold text-gray-900 mb-4">List of Pending Invoices</h2>

                                {/* Imbalance Warning Banner */}
                                {/* Imbalance Warning - Only show if NOT manual (manual is always balanced) */}
                                {(() => {
                                    const isManual = Object.keys(salesNetOffAmounts).length > 0;
                                    if (isManual) return null;

                                    const totalPur = purchaseVouchers
                                        .filter(v => selectedPurchase.includes(v.id))
                                        .reduce((sum, v) => sum + v.amount, 0);
                                    const totalSal = salesVouchers
                                        .filter(v => selectedSales.includes(v.id))
                                        .reduce((sum, v) => sum + v.amount, 0);
                                    const diff = Math.abs(totalPur - totalSal);

                                    if (diff > 0.01) {
                                        return (
                                            <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-md p-4 flex items-start gap-3">
                                                <div className="text-yellow-600 mt-0.5">⚠️</div>
                                                <div className="text-sm text-yellow-800">
                                                    <span className="font-semibold">Note:</span> There is an imbalance of <span className="font-bold">₹{diff.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span> between selected debit and credit amounts. The lower amount (<span className="font-bold">₹{Math.min(totalPur, totalSal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>) will be netted off.
                                                </div>
                                            </div>
                                        );
                                    }
                                    return null;
                                })()}

                                {/* Pending Invoices Table */}
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="bg-gray-50">
                                            <tr className="text-left text-xs text-gray-500 uppercase border-b border-gray-200">
                                                <th className="px-4 py-3 font-medium">VOUCHER TYPE</th>
                                                <th className="px-4 py-3 font-medium">DATE</th>
                                                <th className="px-4 py-3 font-medium">SUPPLIER INVOICE NO / SALES VOUCHER NO</th>
                                                <th className="px-4 py-3 text-right font-medium">DEBIT</th>
                                                <th className="px-4 py-3 text-right font-medium">CREDIT</th>
                                                <th className="px-4 py-3 text-center font-medium">STATUS</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200">
                                            {/* Purchase Vouchers - DEBIT */}
                                            {purchaseVouchers
                                                .filter(v => Object.keys(purchaseNetOffAmounts).length > 0 ? (purchaseNetOffAmounts[v.id] || 0) > 0 : selectedPurchase.includes(v.id))
                                                .map((voucher) => (
                                                    <tr key={`p-${voucher.id}`} className="hover:bg-gray-50">
                                                        <td className="px-4 py-3">
                                                            <span className="text-blue-600 font-medium">Purchase</span>
                                                        </td>
                                                        <td className="px-4 py-3 text-gray-700">{voucher.date}</td>
                                                        <td className="px-4 py-3 font-medium text-gray-900">{voucher.supplierInvNo}</td>
                                                        <td className="px-4 py-3 text-right text-gray-900">
                                                            ₹{(Object.keys(purchaseNetOffAmounts).length > 0 ? purchaseNetOffAmounts[voucher.id] : voucher.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                        </td>
                                                        <td className="px-4 py-3 text-right text-gray-400">-</td>
                                                        <td className="px-4 py-3 text-center">
                                                            <span className="inline-block px-3 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-800">
                                                                Partially Paid
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}

                                            {/* Receipts (Credit) - CREDIT (Index 4) */}
                                            {receiptVouchers
                                                .filter(v => (receiptsNetOffAmounts[v.id] || 0) > 0)
                                                .map((voucher) => (
                                                    <tr key={`r-${voucher.id}`} className="hover:bg-gray-50">
                                                        <td className="px-4 py-3">
                                                            <span className="text-blue-600 font-medium">Receipt</span>
                                                        </td>
                                                        <td className="px-4 py-3 text-gray-700">{voucher.date}</td>
                                                        <td className="px-4 py-3 font-medium text-gray-900">{voucher.voucherNo}</td>
                                                        <td className="px-4 py-3 text-right text-gray-400">-</td>
                                                        <td className="px-4 py-3 text-right text-gray-900">
                                                            ₹{receiptsNetOffAmounts[voucher.id].toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            <span className="inline-block px-3 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                                                                Received
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}

                                            {/* Sales Vouchers - CREDIT */}
                                            {salesVouchers
                                                .filter(v => Object.keys(salesNetOffAmounts).length > 0 ? (salesNetOffAmounts[v.id] || 0) > 0 : selectedSales.includes(v.id))
                                                .map((voucher) => (
                                                    <tr key={`s-${voucher.id}`} className="hover:bg-gray-50">
                                                        <td className="px-4 py-3">
                                                            <span className="text-green-600 font-medium">Sales</span>
                                                        </td>
                                                        <td className="px-4 py-3 text-gray-700">{voucher.date}</td>
                                                        <td className="px-4 py-3 font-medium text-gray-900">{voucher.salesVchNo}</td>
                                                        <td className="px-4 py-3 text-right text-gray-400">-</td>
                                                        <td className="px-4 py-3 text-right text-gray-900">
                                                            ₹{(Object.keys(salesNetOffAmounts).length > 0 ? salesNetOffAmounts[voucher.id] : voucher.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                        </td>
                                                        <td className="px-4 py-3 text-center">
                                                            <span className="inline-block px-3 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
                                                                Not Due
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}

                                            {/* Payments (Debit) - DEBIT (Index 3) */}
                                            {paymentVouchers
                                                .filter(v => (paymentsNetOffAmounts[v.id] || 0) > 0)
                                                .map((voucher) => (
                                                    <tr key={`py-${voucher.id}`} className="hover:bg-gray-50">
                                                        <td className="px-4 py-3">
                                                            <span className="text-green-600 font-medium">Payment</span>
                                                        </td>
                                                        <td className="px-4 py-3 text-gray-700">{voucher.date}</td>
                                                        <td className="px-4 py-3 font-medium text-gray-900">{voucher.voucherNo}</td>
                                                        <td className="px-4 py-3 text-right text-gray-900">
                                                            ₹{paymentsNetOffAmounts[voucher.id].toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                                        </td>
                                                        <td className="px-4 py-3 text-right text-gray-400">-</td>
                                                        <td className="px-4 py-3 text-center">
                                                            <span className="inline-block px-3 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-800">
                                                                Paid
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}

                                            {/* Totals Row */}
                                            <tr className="bg-gray-50 font-semibold">
                                                <td colSpan={3} className="px-4 py-3 text-right text-gray-700">Totals:</td>
                                                <td className="px-4 py-3 text-right text-gray-900">
                                                    ₹{(() => {
                                                        const isManual = Object.keys(salesNetOffAmounts).length > 0;
                                                        if (isManual) {
                                                            const totalPur = purchaseVouchers.reduce((s, v) => s + (purchaseNetOffAmounts[v.id] || 0), 0);
                                                            const totalPay = paymentVouchers.reduce((s, v) => s + (paymentsNetOffAmounts[v.id] || 0), 0);
                                                            return (totalPur + totalPay).toLocaleString('en-IN', { minimumFractionDigits: 2 });
                                                        }

                                                        // Fallback for auto selection
                                                        return purchaseVouchers
                                                            .filter(v => selectedPurchase.includes(v.id))
                                                            .reduce((sum, v) => sum + v.amount, 0)
                                                            .toLocaleString('en-IN', { minimumFractionDigits: 2 });
                                                    })()}
                                                </td>
                                                <td className="px-4 py-3 text-right text-gray-900">
                                                    ₹{(() => {
                                                        const isManual = Object.keys(salesNetOffAmounts).length > 0;
                                                        if (isManual) {
                                                            const totalSal = salesVouchers.reduce((s, v) => s + (salesNetOffAmounts[v.id] || 0), 0);
                                                            const totalRec = receiptVouchers.reduce((s, v) => s + (receiptsNetOffAmounts[v.id] || 0), 0);
                                                            return (totalSal + totalRec).toLocaleString('en-IN', { minimumFractionDigits: 2 });
                                                        }

                                                        return salesVouchers
                                                            .filter(v => selectedSales.includes(v.id))
                                                            .reduce((sum, v) => sum + v.amount, 0)
                                                            .toLocaleString('en-IN', { minimumFractionDigits: 2 });
                                                    })()}
                                                </td>
                                                <td></td>
                                            </tr>
                                        </tbody>
                                    </table>
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
                                            alert('Net-off saved successfully!');
                                            onClose();
                                        }}
                                        className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
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
                    <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
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
                                ? 'bg-blue-600 text-white hover:bg-blue-700'
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
    customer: { id: string; name: string };
    onBack: () => void;
}

const CustomerLedgerView: React.FC<CustomerLedgerViewProps> = ({ customer, onBack }) => {
    // State for filters
    const [dateFilter, setDateFilter] = useState<{ start: string; end: string }>({ start: '', end: '' });
    const [postFromFilter, setPostFromFilter] = useState<TransactionType | ''>('');
    const [ledgerFilter, setLedgerFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState<PurchaseStatus | SalesStatus | ''>('');
    const [debitFilter, setDebitFilter] = useState('');
    const [creditFilter, setCreditFilter] = useState('');

    // View state
    const [viewMode, setViewMode] = useState<'invoice-wise' | 'month-wise'>('invoice-wise');
    const [showNetOffModal, setShowNetOffModal] = useState(false);

    // Mock ledger data
    const mockLedgerData: LedgerEntry[] = [
        { id: '1', date: '2026-01-05', postFrom: 'Sales', ledger: 'INV-2026-001', status: 'Not Due', debit: 50000, credit: 0, runningBalance: 50000 },
        { id: '2', date: '2026-01-10', postFrom: 'Receipt', ledger: 'RCP-2026-001', status: 'Received', debit: 0, credit: 25000, runningBalance: 25000 },
        { id: '3', date: '2026-01-12', postFrom: 'Sales', ledger: 'INV-2026-002', status: 'Due', debit: 35000, credit: 0, runningBalance: 60000 },
        { id: '4', date: '2026-01-15', postFrom: 'Receipt', ledger: 'RCP-2026-002', status: 'Received', debit: 0, credit: 20000, runningBalance: 40000 },
        { id: '5', date: '2026-01-18', postFrom: 'Credit Note', ledger: 'CN-2026-001', status: 'Received', debit: 0, credit: 5000, runningBalance: 35000 },
    ];

    // Mock Month Ledger Data
    interface MonthLedgerEntry {
        month: string;
        debit: number;
        credit: number;
        closingBalance: number;
    }

    const mockMonthLedgerData: MonthLedgerEntry[] = [
        { month: 'April 2025', debit: 150000, credit: 120000, closingBalance: 30000 },
        { month: 'May 2025', debit: 200000, credit: 180000, closingBalance: 50000 },
        { month: 'June 2025', debit: 180000, credit: 100000, closingBalance: 130000 },
        { month: 'July 2025', debit: 220000, credit: 200000, closingBalance: 150000 },
        { month: 'August 2025', debit: 160000, credit: 140000, closingBalance: 170000 },
        { month: 'September 2025', debit: 190000, credit: 160000, closingBalance: 200000 },
        { month: 'October 2025', debit: 210000, credit: 190000, closingBalance: 220000 },
        { month: 'November 2025', debit: 250000, credit: 220000, closingBalance: 250000 },
        { month: 'December 2025', debit: 180000, credit: 150000, closingBalance: 280000 },
        { month: 'January 2026', debit: 85000, credit: 50000, closingBalance: 315000 },
    ];

    const MonthLedgerView: React.FC = () => {
        const totalDebit = mockMonthLedgerData.reduce((sum, item) => sum + item.debit, 0);
        const totalCredit = mockMonthLedgerData.reduce((sum, item) => sum + item.credit, 0);

        return (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
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
                            {mockMonthLedgerData.map((entry, index) => (
                                <tr key={index} className="hover:bg-gray-50 transition-colors group">
                                    <td className="px-6 py-5 whitespace-nowrap text-sm font-bold text-gray-700">{entry.month}</td>
                                    <td className="px-6 py-5 whitespace-nowrap text-sm text-right text-gray-600 font-medium">₹{entry.debit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                    <td className="px-6 py-5 whitespace-nowrap text-sm text-right text-gray-600 font-medium">₹{entry.credit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                    <td className="px-6 py-5 whitespace-nowrap text-sm text-right font-bold text-gray-900">₹{entry.closingBalance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                                </tr>
                            ))}
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

    // Store original data for running balance calculation
    const [originalData] = useState(mockLedgerData);

    // Filter data based on current filters
    const getFilteredData = () => {
        return originalData.filter(entry => {
            if (dateFilter.start && entry.date < dateFilter.start) return false;
            if (dateFilter.end && entry.date > dateFilter.end) return false;
            if (postFromFilter && entry.postFrom !== postFromFilter) return false;
            if (ledgerFilter && !entry.ledger.toLowerCase().includes(ledgerFilter.toLowerCase())) return false;
            if (statusFilter && entry.status !== statusFilter) return false;
            if (debitFilter && entry.debit === 0) return false;
            if (creditFilter && entry.credit === 0) return false;
            return true;
        });
    };

    const filteredData = getFilteredData();
    const totalDebit = filteredData.reduce((sum, entry) => sum + entry.debit, 0);
    const totalCredit = filteredData.reduce((sum, entry) => sum + entry.credit, 0);

    const formatCurrency = (amount: number): string => {
        if (amount === 0) return '-';
        return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const getStatusBadgeColor = (status: string): string => {
        if (status === 'Paid') return 'bg-green-100 text-green-800';
        if (status === 'Unpaid') return 'bg-red-100 text-red-800';
        if (status === 'Partially Paid') return 'bg-yellow-100 text-yellow-800';
        if (status === 'Approved') return 'bg-blue-100 text-blue-800';
        if (status === 'Not Due') return 'bg-gray-100 text-gray-800';
        if (status === 'Due') return 'bg-orange-100 text-orange-800';
        if (status === 'Partially Received') return 'bg-yellow-100 text-yellow-800';
        if (status === 'Received') return 'bg-green-100 text-green-800';
        return 'bg-gray-100 text-gray-800';
    };

    const postFromOptions: TransactionType[] = ['Sales', 'Receipt', 'Purchase', 'Payment', 'Debit Note', 'Credit Note'];
    const statusOptions = ['Paid', 'Unpaid', 'Partially Paid', 'Approved', 'Not Due', 'Due', 'Partially Received', 'Received'];

    return (
        <div className="text-left">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <button onClick={onBack} className="flex items-center text-gray-600 hover:text-gray-900 transition-colors">
                    <ChevronLeft className="w-5 h-5 mr-1" />
                    <span className="text-lg font-medium">{customer.name}</span>
                </button>
                <div className="flex gap-3">
                    <button
                        onClick={() => setShowNetOffModal(true)}
                        className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                        Net Off
                    </button>
                    <button
                        onClick={() => setViewMode(viewMode === 'invoice-wise' ? 'month-wise' : 'invoice-wise')}
                        className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 min-w-[140px]"
                    >
                        {viewMode === 'invoice-wise' ? 'Month View' : 'Invoice-wise view'}
                    </button>
                </div>
            </div>

            {/* Content based on view mode */}
            {viewMode === 'month-wise' ? (
                <MonthLedgerView />
            ) : (
                /* Invoice-wise Table */
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50 sticky top-0">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                                        <div className="flex items-center justify-between">
                                            <span>Date</span>
                                            <div className="ml-2 relative group">
                                                <Filter className="w-4 h-4 cursor-pointer text-gray-400 hover:text-gray-600" />
                                                <div className="hidden group-hover:block absolute z-10 top-6 right-0 bg-white shadow-lg rounded-md p-3 w-48">
                                                    <input type="date" value={dateFilter.start} onChange={(e) => setDateFilter({ ...dateFilter, start: e.target.value })} className="w-full px-2 py-1 text-xs border rounded mb-2" placeholder="Start" />
                                                    <input type="date" value={dateFilter.end} onChange={(e) => setDateFilter({ ...dateFilter, end: e.target.value })} className="w-full px-2 py-1 text-xs border rounded" placeholder="End" />
                                                </div>
                                            </div>
                                        </div>
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                                        <div className="flex items-center justify-between">
                                            <span>Post From</span>
                                            <div className="ml-2 relative group">
                                                <Filter className="w-4 h-4 cursor-pointer text-gray-400 hover:text-gray-600" />
                                                <div className="hidden group-hover:block absolute z-10 top-6 right-0 bg-white shadow-lg rounded-md p-2 w-40">
                                                    <select value={postFromFilter} onChange={(e) => setPostFromFilter(e.target.value as TransactionType | '')} className="w-full px-2 py-1 text-xs border rounded">
                                                        <option value="">All</option>
                                                        {postFromOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                                        <div className="flex items-center justify-between">
                                            <span>Ledger</span>
                                            <div className="ml-2 relative group">
                                                <Filter className="w-4 h-4 cursor-pointer text-gray-400 hover:text-gray-600" />
                                                <div className="hidden group-hover:block absolute z-10 top-6 right-0 bg-white shadow-lg rounded-md p-2 w-40">
                                                    <input type="text" value={ledgerFilter} onChange={(e) => setLedgerFilter(e.target.value)} placeholder="Search..." className="w-full px-2 py-1 text-xs border rounded" />
                                                </div>
                                            </div>
                                        </div>
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                                        <div className="flex items-center justify-between">
                                            <span>Status</span>
                                            <div className="ml-2 relative group">
                                                <Filter className="w-4 h-4 cursor-pointer text-gray-400 hover:text-gray-600" />
                                                <div className="hidden group-hover:block absolute z-10 top-6 right-0 bg-white shadow-lg rounded-md p-2 w-40 max-h-60 overflow-y-auto">
                                                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as PurchaseStatus | SalesStatus | '')} className="w-full px-2 py-1 text-xs border rounded">
                                                        <option value="">All</option>
                                                        {statusOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                    </th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                                        <div className="flex items-center justify-end">
                                            <span>Debit</span>
                                            <div className="ml-2 relative group">
                                                <Filter className="w-4 h-4 cursor-pointer text-gray-400 hover:text-gray-600" />
                                                <div className="hidden group-hover:block absolute z-10 top-6 right-0 bg-white shadow-lg rounded-md p-2 w-32">
                                                    <label className="flex items-center text-xs"><input type="checkbox" checked={!!debitFilter} onChange={(e) => setDebitFilter(e.target.checked ? 'show' : '')} className="mr-1" />Show only</label>
                                                </div>
                                            </div>
                                        </div>
                                    </th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                                        <div className="flex items-center justify-end">
                                            <span>Credit</span>
                                            <div className="ml-2 relative group">
                                                <Filter className="w-4 h-4 cursor-pointer text-gray-400 hover:text-gray-600" />
                                                <div className="hidden group-hover:block absolute z-10 top-6 right-0 bg-white shadow-lg rounded-md p-2 w-32">
                                                    <label className="flex items-center text-xs"><input type="checkbox" checked={!!creditFilter} onChange={(e) => setCreditFilter(e.target.checked ? 'show' : '')} className="mr-1" />Show only</label>
                                                </div>
                                            </div>
                                        </div>
                                    </th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Running Balance</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {filteredData.map((entry) => (
                                    <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 border-r border-gray-100">{entry.date}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 border-r border-gray-100">{entry.postFrom}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 border-r border-gray-100">{entry.ledger}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm border-r border-gray-100">
                                            <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeColor(entry.status)}`}>{entry.status}</span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 border-r border-gray-100 font-medium">{formatCurrency(entry.debit)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 border-r border-gray-100 font-medium">{formatCurrency(entry.credit)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 font-semibold">{formatCurrency(entry.runningBalance)}</td>
                                    </tr>
                                ))}
                                {filteredData.length === 0 && (
                                    <tr><td colSpan={7} className="px-6 py-12 text-center text-gray-500">No ledger entries found.</td></tr>
                                )}
                            </tbody>
                            <tfoot className="bg-gray-100 font-semibold">
                                <tr>
                                    <td colSpan={4} className="px-6 py-4 text-sm text-right text-gray-700">Totals:</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 font-bold border-l border-gray-200">{formatCurrency(totalDebit)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 font-bold border-l border-gray-200">{formatCurrency(totalCredit)}</td>
                                    <td className="px-6 py-4 text-sm text-right text-gray-400 italic">(unchanged)</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            )}

            {/* Info */}
            {/* Info */}
            <div className="mt-4 text-xs text-gray-500 space-y-1">
                {viewMode === 'invoice-wise' ? (
                    <>
                        <p>• Running Balance values remain unchanged when filters are applied - they reflect the true sequential ledger balance.</p>
                        <p>• Totals (Debit and Credit) update based on filtered visible rows.</p>
                        <p>• All columns are filterable except Running Balance.</p>
                    </>
                ) : (
                    <>
                        <p>• Month View aggregates all transactions by month.</p>
                        <p>• Closing Balance represents the balance at the end of each month.</p>
                    </>
                )}
            </div>

            {/* Net Off Modal */}
            <NetOffModal
                isOpen={showNetOffModal}
                onClose={() => setShowNetOffModal(false)}
                customerName={customer.name}
            />
        </div>
    );
};

// Sales Content Component with Aging Buckets
const SalesContent: React.FC = () => {
    const [activeCategory, setActiveCategory] = useState<SalesCategory>('Stock-in-Trade');
    const [showLedgerView, setShowLedgerView] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState<{ id: string, name: string } | null>(null);

    // Mock data for demonstration - same structure for all categories
    const getMockData = (category: SalesCategory): AgingData[] => {
        // In a real app, this would fetch data based on category
        const baseData: AgingData[] = [
            {
                customerId: '1',
                customerCode: 'CUST-001',
                customerName: 'Acme Corporation',
                notDue: 50000,
                days0to45: 25000,
                days45to90: 15000,
                months6: 10000,
                year1: 5000
            },
            {
                customerId: '2',
                customerCode: 'CUST-002',
                customerName: 'Global Traders Pvt Ltd',
                notDue: 75000,
                days0to45: 0,
                days45to90: 30000,
                months6: 0,
                year1: 12000
            },
            {
                customerId: '3',
                customerCode: 'CUST-003',
                customerName: 'TechVision Solutions',
                notDue: 0,
                days0to45: 45000,
                days45to90: 0,
                months6: 25000,
                year1: 0
            },
            {
                customerId: '4',
                customerCode: 'CUST-004',
                customerName: 'Sunrise Enterprises',
                notDue: 120000,
                days0to45: 35000,
                days45to90: 18000,
                months6: 8000,
                year1: 3000
            },
            {
                customerId: '5',
                customerCode: 'CUST-005',
                customerName: 'Metro Supplies Inc',
                notDue: 0,
                days0to45: 0,
                days45to90: 42000,
                months6: 15000,
                year1: 22000
            },
        ];

        return baseData;
    };

    const formatCurrency = (amount: number): string => {
        return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const handleViewCustomer = (customerId: string, customerName: string) => {
        // Navigate to Customer Ledger View
        setSelectedCustomer({ id: customerId, name: customerName });
        setShowLedgerView(true);
    };

    const handleBackToAging = () => {
        setShowLedgerView(false);
        setSelectedCustomer(null);
    };

    const handleSendMail = (customer: AgingData) => {
        // TODO: Auto-draft reminder email
        const totalDue = customer.days0to45 + customer.days45to90 + customer.months6 + customer.year1;
        alert(
            `Draft Reminder Email for ${customer.customerName}\n\n` +
            `Customer Code: ${customer.customerCode}\n` +
            `Total Outstanding: ${formatCurrency(totalDue)}\n\n` +
            `Aging Breakdown:\n` +
            `• 0-45 Days: ${formatCurrency(customer.days0to45)}\n` +
            `• 45-90 Days: ${formatCurrency(customer.days45to90)}\n` +
            `• 6 Months: ${formatCurrency(customer.months6)}\n` +
            `• 1 Year+: ${formatCurrency(customer.year1)}\n\n` +
            `This email would be editable before sending.`
        );
    };

    const categories: SalesCategory[] = ['Stock-in-Trade', 'Finished Goods', 'Services'];
    const currentData = getMockData(activeCategory);

    // Show ledger view if customer is selected
    if (showLedgerView && selectedCustomer) {
        return <CustomerLedgerView customer={selectedCustomer} onBack={handleBackToAging} />;
    }

    return (
        <div className="text-left">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-medium text-gray-900">Sales - Customer Aging</h3>
            </div>

            {/* Category Tabs */}
            <div className="mb-6 bg-gray-50 p-2 rounded-lg inline-block border border-gray-200">
                <div className="flex space-x-2">
                    {categories.map((category) => (
                        <button
                            key={category}
                            onClick={() => setActiveCategory(category)}
                            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeCategory === category
                                ? 'bg-white text-indigo-700 shadow-sm'
                                : 'text-gray-600 hover:bg-white/50'
                                }`}
                        >
                            {category}
                        </button>
                    ))}
                </div>
            </div>

            {/* All Categories Note */}
            <div className="mb-4 flex items-center text-sm text-emerald-600">
                <span className="mr-2">→</span>
                <span className="font-medium">All categories use the same table layout and behavior</span>
            </div>

            {/* Aging Table */}
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
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
                                    &gt; 6 Months
                                </th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider bg-indigo-50 border-r border-gray-200">
                                    &gt; 1 Year
                                </th>
                                <th className="border-l border-gray-200"></th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {currentData.map((customer) => (
                                <tr key={customer.customerId} className="hover:bg-gray-50 transition-colors">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 border-r border-gray-100">
                                        {customer.customerCode}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 border-r border-gray-100">
                                        {customer.customerName}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 border-r border-gray-100">
                                        {customer.notDue > 0 ? formatCurrency(customer.notDue) : '-'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 border-r border-gray-100">
                                        {customer.days0to45 > 0 ? formatCurrency(customer.days0to45) : '-'}
                                    </td>
                                    <td
                                        className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 border-r border-gray-100">
                                        {customer.days45to90 > 0 ? formatCurrency(customer.days45to90) : '-'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 border-r border-gray-100">
                                        {customer.months6 > 0 ? formatCurrency(customer.months6) : '-'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 border-r border-gray-100">
                                        {customer.year1 > 0 ? formatCurrency(customer.year1) : '-'}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium border-l border-gray-100">
                                        <div className="flex items-center justify-center space-x-4">
                                            <button
                                                onClick={() => handleViewCustomer(customer.customerId, customer.customerName)}
                                                className="text-indigo-600 hover:text-indigo-900 transition-colors"
                                                title="View Customer Ledger"
                                            >
                                                <Eye className="w-5 h-5" />
                                            </button>
                                            <button
                                                onClick={() => handleSendMail(customer)}
                                                className="text-blue-600 hover:text-blue-900 transition-colors"
                                                title="Send Reminder Email"
                                            >
                                                <Mail className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}

                            {/* Empty State */}
                            {currentData.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                                        No sales aging data available for {activeCategory}.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Footer Notes */}
            <div className="mt-4 flex items-start space-x-4 text-xs text-gray-500">
                <div className="flex items-center">
                    <Eye className="w-4 h-4 mr-1 text-indigo-600" />
                    <span>View icon → navigates to Customer Ledger filtered for selected customer</span>
                </div>
                <div className="flex items-center">
                    <Mail className="w-4 h-4 mr-1 text-blue-600" />
                    <span>Mail icon → auto-drafts reminder email with due amounts and aging breakup</span>
                </div>
            </div>
        </div>
    );
};

export default CustomerPortalPage;
