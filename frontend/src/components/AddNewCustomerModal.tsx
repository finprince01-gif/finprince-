/**
 * AddNewCustomerModal.tsx
 * 
 * A full-featured modal that replicates the Customer Portal > Master > Customer > Create New Customer form.
 * Opens from the Sales Voucher Invoice Details section.
 * Saves to the same /api/customerportal/customer-master/ endpoint.
 */

import React, { useState, useEffect } from 'react';
import { httpClient } from '../services/httpClient';
import { showSuccess, showError } from '../utils/toast';
import { Country, State, City } from 'country-state-city';
import { BILLING_CURRENCIES } from '../constants/customerPortalConstants';
import { X, ChevronLeft, ChevronRight, ChevronDown, Info } from 'lucide-react';

const TDS_SECTIONS = [
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

const TCS_SECTIONS = [
    { section: 'Section 206C(1)', name: 'Sale of Scrap, Alcoholic Liquor, Minerals', rate: '1%', description: 'Sale of Scrap, Alcoholic Liquor for human consumption, and Minerals being coal or lignite or iron ore' },
    { section: 'Section 206C(1)', name: 'Sale of Tendu Leaves', rate: '5%', description: 'Sale of Tendu Leaves' },
    { section: 'Section 206C(1)', name: 'Sale of Forest Produce', rate: '2%', description: 'Sale of Timber and Forest produce under a forest lease' },
    { section: 'Section 206C(1)', name: 'Sale of Timber', rate: '2%', description: 'Sale of Timber from modes other than forest lease' },
    { section: 'Section 206C(1F)', name: 'Sale of Motor Vehicles', rate: '1%', description: 'Sale of Motor Vehicle for value of more than Rs.10 Lakhs' },
    { section: 'Section 206C(1F)', name: 'Sale of Specified Luxury Goods', rate: '1%', description: 'Sale of Luxury Goods like yachts, helicopters, aircraft, jewellery, home theatre systems, etc. for value of more than Rs 10 Lakhs' }
];

interface AddNewCustomerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCustomerCreated: (customerName: string) => void;
    initialData?: {
        customer_name?: string;
        gstin?: string;
        address?: string;
        state?: string;
        branch?: string;
        email?: string;
        phone?: string;
    };
}

const TABS = [
    { name: 'Basic Details', description: 'Name, code, contact info' },
    { name: 'GST Details', description: 'GSTIN & branch addresses' },
    { name: 'Products/Services', description: 'Associated products' },
    { name: 'TDS & Statutory', description: 'TDS/TCS & compliance info' },
    { name: 'Banking Info', description: 'Bank accounts' },
    { name: 'Terms & Conditions', description: 'Credit & payment terms' },
];

const getAvailableStates = (countryCode: string) => {
    return State.getStatesOfCountry(countryCode) || [];
};

const AddNewCustomerModal: React.FC<AddNewCustomerModalProps> = ({ isOpen, onClose, onCustomerCreated, initialData }) => {
    const [activeTab, setActiveTab] = useState('Basic Details');
    const [isSaving, setIsSaving] = useState(false);
    const [categories, setCategories] = useState<any[]>([]);
    const [stockItems, setStockItems] = useState<any[]>([]);

    // Basic Details
    const [formData, setFormData] = useState({
        customer_name: '',
        customer_code: `CUST-${Date.now().toString().slice(-6)}`,
        customer_category: '',
        pan_number: '',
        contact_person: '',
        email_address: '',
        contact_number: '',
        billing_currency: '',
        is_also_vendor: false,
        gst_tds_applicable: false,
    });

    // GST Details
    const [isUnregistered, setIsUnregistered] = useState(false);
    const [addMultipleBranches, setAddMultipleBranches] = useState(false);
    const [gstInput, setGstInput] = useState('');
    const [selectedGSTINs, setSelectedGSTINs] = useState<string[]>([]);
    const [showGstDropdown, setShowGstDropdown] = useState(false);
    const [showBranchDetails, setShowBranchDetails] = useState(false);
    const [expandedBranches, setExpandedBranches] = useState<number[]>([1]);
    const [registeredBranches, setRegisteredBranches] = useState<any[]>([]);

    const emptyUnregBranch = (id: number) => ({
        id,
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
        gstin: null as null,
    });

    const [unregisteredBranches, setUnregisteredBranches] = useState([emptyUnregBranch(1)]);


    // Products/Services
    const [productRows, setProductRows] = useState([
        { id: 1, itemCode: '', itemName: '', uom: '', custItemCode: '', custItemName: '' }
    ]);

    // TDS & Statutory
    const [statutory, setStatutory] = useState({
        msme_no: '', fssai_no: '', iec_code: '', eou_status: '',
        taxType: 'NONE' as 'TDS' | 'TCS' | 'NONE',
        tcs_section: '', tcs_enabled: false, tds_section: '', tds_enabled: false,
    });


    // Banking Info
    const [bankAccounts, setBankAccounts] = useState<{
        id: number; accountNumber: string; bankName: string; ifscCode: string; branchName: string; swiftCode: string; associatedBranches: string[];
    }[]>([]);

    const [openBranchDropdown, setOpenBranchDropdown] = useState<number | null>(null);

    // Terms & Conditions
    const [terms, setTerms] = useState({
        credit_period: '', credit_terms: '', penalty_terms: '',
        delivery_terms: '', warranty_details: '', force_majeure: '', dispute_terms: '',
    });

    useEffect(() => {
        if (!isOpen) return;

        // Pre-fill if initialData is provided
        if (initialData) {
            setFormData(prev => ({
                ...prev,
                // Only pre-fill customer name — do NOT pre-fill pan_number, email, or phone
                // as these are not from Excel and may conflict with existing records
                customer_name: initialData.customer_name || prev.customer_name,
            }));

            if (initialData.gstin) {
                setIsUnregistered(false);
                setSelectedGSTINs([initialData.gstin]);
                setGstInput('');
                // Prepare registered branch with initial info
                setRegisteredBranches([{
                    gstin: initialData.gstin,
                    defaultRef: initialData.branch || 'Main Branch',
                    addressLine1: initialData.address || '',
                    addressLine2: '',
                    addressLine3: '',
                    city: '',
                    pincode: '',
                    state: initialData.state || '',
                    country: 'India',
                    contactPerson: '',
                    contactNumber: '',
                    email: ''
                }]);
                setShowBranchDetails(true);
            } else {
                setIsUnregistered(true);
                setUnregisteredBranches([{
                    ...emptyUnregBranch(1),
                    referenceName: initialData.branch || 'Main Branch',
                    addressLine1: initialData.address || '',
                    state: initialData.state || '',
                    contactNumber: '',
                    email: ''
                }]);
            }
        }

        // Fetch categories and stock items
        httpClient.get<any[]>('/api/customerportal/categories/').then(res => {
            setCategories(Array.isArray(res) ? res : (res as any).results || []);
        }).catch(() => { });
        httpClient.get<any[]>('/api/inventory/items/').then(res => {
            const items = Array.isArray(res) ? res : (res as any).results || [];
            setStockItems(items.map((i: any) => ({ code: i.item_code, name: i.item_name, uom: i.uom || '' })));
        }).catch(() => { });
    }, [isOpen, initialData]);

    const resetForm = () => {
        setActiveTab('Basic Details');
        setFormData({
            customer_name: '', customer_code: `CUST-${Date.now().toString().slice(-6)}`,
            customer_category: '', pan_number: '', contact_person: '', email_address: '',
            contact_number: '', billing_currency: '', is_also_vendor: false, gst_tds_applicable: false,
        });
        setIsUnregistered(false);
        setAddMultipleBranches(false);
        setGstInput(''); setSelectedGSTINs([]); setShowGstDropdown(false);
        setShowBranchDetails(false);
        setExpandedBranches([1]);
        setRegisteredBranches([]);
        setUnregisteredBranches([emptyUnregBranch(1)]);
        setProductRows([{ id: 1, itemCode: '', itemName: '', uom: '', custItemCode: '', custItemName: '' }]);
        setStatutory({
            msme_no: '', fssai_no: '', iec_code: '', eou_status: '',
            taxType: 'NONE',
            tcs_section: '', tcs_enabled: false, tds_section: '', tds_enabled: false
        });

        setBankAccounts([]);
        setTerms({ credit_period: '', credit_terms: '', penalty_terms: '', delivery_terms: '', warranty_details: '', force_majeure: '', dispute_terms: '' });
    };

    const handleClose = () => { resetForm(); onClose(); };

    const handleSave = async () => {
        if (!formData.customer_name.trim()) {
            showError('Customer Name is required');
            setActiveTab('Basic Details');
            return;
        }
        if (formData.email_address && formData.email_address.trim()) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(formData.email_address)) {
                showError('Invalid email format');
                setActiveTab('Basic Details');
                return;
            }
        }

        setIsSaving(true);
        try {
            const payload = {
                ...formData,
                customer_category: formData.customer_category || null,
                gst_details: {
                    gstins: isUnregistered ? [] : selectedGSTINs,
                    branches: isUnregistered
                        ? unregisteredBranches.map(b => ({
                            defaultRef: b.referenceName,
                            gstin: null,
                            addressLine1: b.addressLine1,
                            addressLine2: b.addressLine2,
                            addressLine3: b.addressLine3,
                            city: b.city,
                            pincode: b.pincode,
                            state: b.state,
                            country: b.country,
                            contactPerson: b.contactPerson,
                            email: b.email,
                            contactNumber: b.contactNumber,
                        }))
                        : registeredBranches.map(b => ({
                            defaultRef: b.defaultRef || '',
                            gstin: b.gstin || null,
                            addressLine1: b.addressLine1 || '',
                            addressLine2: b.addressLine2 || '',
                            addressLine3: b.addressLine3 || '',
                            city: b.city || '',
                            pincode: b.pincode || '',
                            state: b.state || '',
                            country: b.country || 'India',
                            contactPerson: b.contactPerson || '',
                            email: b.email || '',
                            contactNumber: b.contactNumber || '',
                        })),
                },
                products_services: { items: productRows.filter(r => r.itemCode || r.itemName) },
                ...statutory,
                taxType: undefined, // Omit from payload if not needed by backend
                banking_info: bankAccounts.length > 0 ? { accounts: bankAccounts } : null,
                ...terms,
            };
            await httpClient.post('/api/customerportal/customer-master/', payload);
            showSuccess(`Customer "${formData.customer_name}" created successfully!`);
            onCustomerCreated(formData.customer_name);
            resetForm();
        } catch (err: any) {
            let errorMsg = err?.message || 'Failed to create customer';

            // Extract DRF field validation errors (e.g., pan_number uniqueness)
            if (err?.data && typeof err.data === 'object' && !Array.isArray(err.data)) {
                const ignoreKeys = ['error', 'message', 'detail', 'status', 'code'];
                const fieldErrors = Object.entries(err.data)
                    .filter(([k]) => !ignoreKeys.includes(k))
                    .map(([k, v]) => {
                        const val = Array.isArray(v) ? v[0] : v;
                        // Keep PAN capitalized, otherwise title case
                        const niceKey = k === 'pan_number' ? 'PAN Number'
                            : k.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                        return `${niceKey}: ${val}`;
                    });

                if (fieldErrors.length > 0) {
                    errorMsg = fieldErrors.join(' | ');
                } else if (err.data.error || err.data.detail) {
                    errorMsg = err.data.error || err.data.detail;
                }
            }

            showError(errorMsg);
        } finally {
            setIsSaving(false);
        }
    };

    const tabIndex = TABS.findIndex(t => t.name === activeTab);
    const isFirst = tabIndex === 0;
    const isLast = tabIndex === TABS.length - 1;
    const goNext = () => {
        if (activeTab === 'Basic Details') {
            if (!formData.customer_name.trim()) {
                showError('Customer Name is required');
                return;
            }
            if (formData.email_address && formData.email_address.trim()) {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(formData.email_address)) {
                    showError('Invalid email format');
                    return;
                }
            }
        }
        if (!isLast) setActiveTab(TABS[tabIndex + 1].name);
    };
    const goPrev = () => !isFirst && setActiveTab(TABS[tabIndex - 1].name);

    if (!isOpen) return null;

    // ── GST helpers ──
    const toggleBranchExpand = (id: number) =>
        setExpandedBranches(prev => prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]);

    const handleManualBranchChange = (id: number, field: string, value: string) =>
        setUnregisteredBranches(prev => prev.map(b => b.id === id ? { ...b, [field]: value } : b));

    const handleAddManualBranch = () => {
        const newId = (unregisteredBranches[unregisteredBranches.length - 1]?.id || 0) + 1;
        setUnregisteredBranches(prev => [...prev, emptyUnregBranch(newId)]);
        setExpandedBranches(prev => [...prev, newId]);
    };

    const handleRegisteredBranchChange = (gstin: string, field: string, value: string) =>
        setRegisteredBranches(prev => prev.map(b => b.gstin === gstin ? { ...b, [field]: value } : b));

    const handleFetchBranchDetails = () => {
        if (selectedGSTINs.length > 0) {
            // Initialize any new GSTINs
            setRegisteredBranches(prev => {
                const existing = prev.map(b => b.gstin);
                const newOnes = selectedGSTINs
                    .filter(g => !existing.includes(g))
                    .map(g => ({ gstin: g, defaultRef: '', addressLine1: '', addressLine2: '', addressLine3: '', city: '', pincode: '', state: '', country: 'India', contactPerson: '', contactNumber: '', email: '' }));
                return [...prev.filter(b => selectedGSTINs.includes(b.gstin)), ...newOnes];
            });
            setShowBranchDetails(true);
            setExpandedBranches(selectedGSTINs.map((_, i) => i + 1));
        }
    };

    // Geo helper for a branch object that has country/state
    const getBranchGeo = (branch: { country: string; state: string }) => {
        const countryCode = Country.getAllCountries().find(c => c.name === branch.country)?.isoCode || '';
        const states = getAvailableStates(countryCode);
        const stateCode = states.find(s => s.name === branch.state)?.isoCode || '';
        const cities = (countryCode && stateCode) ? City.getCitiesOfState(countryCode, stateCode) : [];
        return { countryCode, states, stateCode, cities };
    };

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
            <div className="bg-white rounded-lg shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-indigo-600 to-indigo-700 rounded-t-lg">
                    <div>
                        <h2 className="text-lg font-bold text-white">Add New Customer</h2>
                        <p className="text-xs text-indigo-200 mt-0.5">Fill in the details to create a new customer</p>
                    </div>
                    <button onClick={handleClose} className="text-white/80 hover:text-white transition-colors p-1 rounded hover:bg-white/10">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tab Navigation */}
                <div className="flex border-b border-gray-200 bg-gray-50 px-6 overflow-x-auto">
                    {TABS.map((tab, i) => (
                        <button
                            key={tab.name}
                            onClick={() => {
                                // Validate if trying to move away from current tab to a later tab
                                if (i > tabIndex) {
                                    if (activeTab === 'Basic Details') {
                                        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                                        const isEmailValid = !formData.email_address?.trim() || emailRegex.test(formData.email_address);

                                        if (!formData.customer_name.trim() || !isEmailValid) {
                                            if (!isEmailValid) showError('Please enter a valid email address.');
                                            else showError('Please enter a Customer Name before moving.');
                                            return;
                                        }
                                    }
                                }
                                setActiveTab(tab.name);
                            }}
                            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.name
                                ? 'border-indigo-600 text-indigo-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${activeTab === tab.name ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-600'}`}>{i + 1}</span>
                            {tab.name}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {/* ── BASIC DETAILS ── */}
                    {activeTab === 'Basic Details' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Customer Name <span className="text-red-500">*</span></label>
                                <input type="text" value={formData.customer_name} onChange={e => setFormData(p => ({ ...p, customer_name: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-indigo-500 focus:border-indigo-500" placeholder="Enter customer name" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Customer Code</label>
                                <input type="text" value={formData.customer_code} readOnly
                                    className="w-full px-3 py-2 border border-gray-200 rounded text-sm bg-gray-50 text-gray-500" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Customer Category</label>
                                <select value={formData.customer_category} onChange={e => setFormData(p => ({ ...p, customer_category: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white">
                                    <option value="">Select Category</option>
                                    {categories.map(cat => (
                                        <option key={cat.id} value={cat.id}>
                                            {cat.full_path || [cat.category, cat.group, cat.subgroup].filter(Boolean).join(' > ')}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">PAN Number</label>
                                <input type="text" value={formData.pan_number} onChange={e => setFormData(p => ({ ...p, pan_number: e.target.value.toUpperCase() }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-indigo-500 focus:border-indigo-500" placeholder="ABCDE1234F" maxLength={10} />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Contact Person</label>
                                <input type="text" value={formData.contact_person} onChange={e => setFormData(p => ({ ...p, contact_person: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-indigo-500 focus:border-indigo-500" placeholder="Name" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Email Address</label>
                                <input type="email" value={formData.email_address} onChange={e => setFormData(p => ({ ...p, email_address: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-indigo-500 focus:border-indigo-500" placeholder="email@example.com" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Contact Number</label>
                                <input type="tel" value={formData.contact_number} onChange={e => setFormData(p => ({ ...p, contact_number: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-indigo-500 focus:border-indigo-500" placeholder="+91 9876543210" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">Billing Currency</label>
                                <select value={formData.billing_currency} onChange={e => setFormData(p => ({ ...p, billing_currency: e.target.value }))}
                                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white">
                                    <option value="">Select Currency</option>
                                    {BILLING_CURRENCIES.map(cur => (
                                        <option key={cur.code} value={cur.code}>{cur.code} - {cur.name} ({cur.symbol})</option>
                                    ))}
                                </select>
                            </div>
                            <div className="md:col-span-2 p-4 border border-gray-200 rounded bg-gray-50/50">
                                <p className="text-sm font-semibold text-gray-700 mb-2">Is this customer also a vendor?</p>
                                <div className="flex gap-6">
                                    {[true, false].map(v => (
                                        <label key={String(v)} className="flex items-center gap-2 cursor-pointer">
                                            <input type="radio" checked={formData.is_also_vendor === v} onChange={() => setFormData(p => ({ ...p, is_also_vendor: v }))} className="text-indigo-600 w-4 h-4" />
                                            <span className="text-sm text-gray-700">{v ? 'Yes' : 'No'}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                            <div className="md:col-span-2">
                                <p className="text-sm font-semibold text-gray-700 mb-2">TDS Applicable under GST?</p>
                                <div className="flex gap-6">
                                    {[true, false].map(v => (
                                        <label key={String(v)} className="flex items-center gap-2 cursor-pointer">
                                            <input type="radio" checked={formData.gst_tds_applicable === v} onChange={() => setFormData(p => ({ ...p, gst_tds_applicable: v }))} className="text-indigo-600 w-4 h-4" />
                                            <span className="text-sm text-gray-700">{v ? 'Yes' : 'No'}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── GST DETAILS ── */}
                    {activeTab === 'GST Details' && (
                        <div className="max-w-3xl mx-auto space-y-6 pt-2">
                            {/* Unregistered checkbox – centred like Customer Portal */}
                            <div className="flex justify-center">
                                <label className="flex items-center gap-3 cursor-pointer p-2 px-4 rounded hover:bg-gray-50 border border-transparent hover:border-gray-200 transition-colors">
                                    <input type="checkbox" checked={isUnregistered}
                                        onChange={e => { setIsUnregistered(e.target.checked); setShowBranchDetails(false); setSelectedGSTINs([]); setRegisteredBranches([]); setUnregisteredBranches([emptyUnregBranch(1)]); setExpandedBranches([1]); setAddMultipleBranches(false); }}
                                        className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500" />
                                    <span className="text-sm font-semibold text-gray-700">Customer is Unregistered</span>
                                </label>
                            </div>

                            {/* ─── UNREGISTERED PATH ─── */}
                            {isUnregistered ? (
                                <div className="space-y-6">
                                    {/* GSTIN NA + Taxpayer Type */}
                                    <div className="grid grid-cols-2 gap-6">
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">GSTIN No.</label>
                                            <input type="text" value="NA" disabled
                                                className="w-full px-4 py-2 border border-gray-200 rounded-[4px] bg-gray-100 text-gray-500 cursor-not-allowed" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">Taxpayer Type</label>
                                            <div className="relative">
                                                <input type="text" value="Unregistered" readOnly
                                                    className="w-full px-4 py-2 border border-green-200 rounded-[4px] bg-green-50 text-slate-700 font-medium ring-1 ring-green-200" />
                                                <span className="absolute right-3 top-2.5 text-xs text-indigo-600">Auto-set</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Add Multiple Branches */}
                                    <div className="flex items-center gap-6">
                                        <label className="text-sm font-semibold text-gray-700">Add Multiple Branches</label>
                                        <div className="flex bg-gray-100 p-1 rounded-[4px]">
                                            <button type="button" onClick={() => setAddMultipleBranches(true)}
                                                className={`px-4 py-1 text-xs font-medium rounded transition-colors ${addMultipleBranches ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:text-gray-700'}`}>
                                                Yes
                                            </button>
                                            <button type="button" onClick={() => setAddMultipleBranches(false)}
                                                className={`px-4 py-1 text-xs font-medium rounded transition-colors ${!addMultipleBranches ? 'bg-white text-gray-800 ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-700'}`}>
                                                No
                                            </button>
                                        </div>
                                    </div>

                                    {/* Single branch (NO) */}
                                    {!addMultipleBranches ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            {([
                                                { field: 'addressLine1', label: 'Address Line 1', required: true, span2: true },
                                                { field: 'addressLine2', label: 'Address Line 2', span2: true },
                                                { field: 'addressLine3', label: 'Address Line 3', span2: true },
                                            ] as { field: string; label: string; required?: boolean; span2: boolean }[]).map(({ field, label, required, span2 }) => (
                                                <div key={field} className={span2 ? 'md:col-span-2' : ''}>
                                                    <label className="block text-sm font-semibold text-gray-700 mb-2">{label} {required && <span className="text-red-500">*</span>}</label>
                                                    <input type="text"
                                                        className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                                        value={(unregisteredBranches[0] as any)[field]}
                                                        onChange={e => handleManualBranchChange(1, field, e.target.value)}
                                                        placeholder={`Enter ${label.toLowerCase()}`} />
                                                </div>
                                            ))}
                                            {/* Country */}
                                            <div>
                                                <label className="block text-sm font-semibold text-gray-700 mb-2">Country</label>
                                                <select className="w-full px-4 py-2 border border-gray-300 rounded-[4px] text-sm bg-white"
                                                    value={Country.getAllCountries().find(c => c.name === unregisteredBranches[0].country)?.isoCode || ''}
                                                    onChange={e => { const ci = Country.getCountryByCode(e.target.value); handleManualBranchChange(1, 'country', ci?.name || ''); handleManualBranchChange(1, 'state', ''); handleManualBranchChange(1, 'city', ''); }}>
                                                    <option value="">Select Country</option>
                                                    {Country.getAllCountries().map(c => <option key={c.isoCode} value={c.isoCode}>{c.name}</option>)}
                                                </select>
                                            </div>
                                            {/* State */}
                                            <div>
                                                <label className="block text-sm font-semibold text-gray-700 mb-2">State</label>
                                                {(() => {
                                                    const cc = Country.getAllCountries().find(c => c.name === unregisteredBranches[0].country)?.isoCode || '';
                                                    const allStates = getAvailableStates(cc);
                                                    return (
                                                        <select className="w-full px-4 py-2 border border-gray-300 rounded-[4px] text-sm bg-white"
                                                            value={allStates.find(s => s.name === unregisteredBranches[0].state)?.isoCode || ''}
                                                            disabled={!unregisteredBranches[0].country}
                                                            onChange={e => { const si = allStates.find(s => s.isoCode === e.target.value); handleManualBranchChange(1, 'state', si?.name || ''); handleManualBranchChange(1, 'city', ''); }}>
                                                            <option value="">Select State</option>
                                                            {allStates.map(s => <option key={s.isoCode} value={s.isoCode}>{s.name}</option>)}
                                                        </select>
                                                    );
                                                })()}
                                            </div>
                                            {/* City */}
                                            <div>
                                                <label className="block text-sm font-semibold text-gray-700 mb-2">City</label>
                                                {(() => {
                                                    const { countryCode, stateCode, cities } = getBranchGeo(unregisteredBranches[0]);
                                                    return cities.length > 0 ? (
                                                        <select className="w-full px-4 py-2 border border-gray-300 rounded-[4px] text-sm bg-white"
                                                            value={unregisteredBranches[0].city}
                                                            disabled={!unregisteredBranches[0].state}
                                                            onChange={e => handleManualBranchChange(1, 'city', e.target.value)}>
                                                            <option value="">Select City</option>
                                                            {cities.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                                        </select>
                                                    ) : (
                                                        <input type="text" className="w-full px-4 py-2 border border-gray-300 rounded-[4px] text-sm"
                                                            value={unregisteredBranches[0].city}
                                                            disabled={!unregisteredBranches[0].state}
                                                            onChange={e => handleManualBranchChange(1, 'city', e.target.value)}
                                                            placeholder="Enter city" />
                                                    );
                                                })()}
                                            </div>
                                            {/* Pincode */}
                                            <div>
                                                <label className="block text-sm font-semibold text-gray-700 mb-2">Pincode</label>
                                                <input type="text" className="w-full px-4 py-2 border border-gray-300 rounded-[4px] text-sm"
                                                    value={unregisteredBranches[0].pincode}
                                                    onChange={e => handleManualBranchChange(1, 'pincode', e.target.value)}
                                                    placeholder="Enter pincode" />
                                            </div>
                                        </div>
                                    ) : (
                                        // Multiple branches – accordion cards
                                        <div className="space-y-4">
                                            {unregisteredBranches.map((branch, index) => {
                                                const isExpanded = expandedBranches.includes(branch.id);
                                                const { countryCode, states, stateCode, cities } = getBranchGeo(branch);
                                                return (
                                                    <div key={branch.id} className="border border-gray-200 rounded-[4px] overflow-hidden bg-white">
                                                        <div className="flex items-center justify-between px-6 py-4 bg-gray-50 cursor-pointer hover:bg-gray-100"
                                                            onClick={() => toggleBranchExpand(branch.id)}>
                                                            <div className="flex items-center gap-3">
                                                                <span className="w-6 h-6 flex items-center justify-center bg-white border border-gray-200 rounded text-xs font-semibold text-gray-600">{index + 1}</span>
                                                                <span className="font-semibold text-gray-800">{branch.referenceName || `Branch ${index + 1}`}</span>
                                                            </div>
                                                            <div className="flex items-center gap-3">
                                                                {unregisteredBranches.length > 1 && (
                                                                    <button type="button" onClick={e => { e.stopPropagation(); setUnregisteredBranches(p => p.filter(b => b.id !== branch.id)); }}
                                                                        className="text-xs text-red-500 hover:text-red-700">Remove</button>
                                                                )}
                                                                <span className="text-gray-400">{isExpanded ? '▲' : '▼'}</span>
                                                            </div>
                                                        </div>
                                                        {isExpanded && (
                                                            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                                                                <div className="md:col-span-2">
                                                                    <label className="block text-xs font-medium text-gray-500 mb-1">Reference Name</label>
                                                                    <input type="text" className="w-full px-4 py-2 border border-gray-300 rounded-[4px] text-sm"
                                                                        value={branch.referenceName}
                                                                        onChange={e => handleManualBranchChange(branch.id, 'referenceName', e.target.value)}
                                                                        placeholder="e.g. Warehouse, Main Office" />
                                                                </div>
                                                                {(['addressLine1', 'addressLine2', 'addressLine3'] as const).map(f => (
                                                                    <div key={f} className="md:col-span-2">
                                                                        <label className="block text-xs font-medium text-gray-500 mb-1">Address Line {f.slice(-1)}</label>
                                                                        <input type="text" className="w-full px-4 py-2 border border-gray-300 rounded-[4px] text-sm"
                                                                            value={(branch as any)[f]}
                                                                            onChange={e => handleManualBranchChange(branch.id, f, e.target.value)}
                                                                            placeholder={`Enter address line ${f.slice(-1)}`} />
                                                                    </div>
                                                                ))}
                                                                <div>
                                                                    <label className="block text-xs font-medium text-gray-500 mb-1">Country</label>
                                                                    <select className="w-full px-4 py-2 border border-gray-300 rounded-[4px] text-sm bg-white"
                                                                        value={countryCode}
                                                                        onChange={e => { const ci = Country.getCountryByCode(e.target.value); handleManualBranchChange(branch.id, 'country', ci?.name || ''); handleManualBranchChange(branch.id, 'state', ''); handleManualBranchChange(branch.id, 'city', ''); }}>
                                                                        <option value="">Select Country</option>
                                                                        {Country.getAllCountries().map(c => <option key={c.isoCode} value={c.isoCode}>{c.name}</option>)}
                                                                    </select>
                                                                </div>
                                                                <div>
                                                                    <label className="block text-xs font-medium text-gray-500 mb-1">State</label>
                                                                    <select className="w-full px-4 py-2 border border-gray-300 rounded-[4px] text-sm bg-white"
                                                                        value={stateCode} disabled={!countryCode}
                                                                        onChange={e => { const si = states.find(s => s.isoCode === e.target.value); handleManualBranchChange(branch.id, 'state', si?.name || ''); handleManualBranchChange(branch.id, 'city', ''); }}>
                                                                        <option value="">Select State</option>
                                                                        {states.map(s => <option key={s.isoCode} value={s.isoCode}>{s.name}</option>)}
                                                                    </select>
                                                                </div>
                                                                <div>
                                                                    <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
                                                                    {cities.length > 0 ? (
                                                                        <select className="w-full px-4 py-2 border border-gray-300 rounded-[4px] text-sm bg-white"
                                                                            value={branch.city || ''} disabled={!branch.state}
                                                                            onChange={e => handleManualBranchChange(branch.id, 'city', e.target.value)}>
                                                                            <option value="">Select City</option>
                                                                            {cities.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                                                        </select>
                                                                    ) : (
                                                                        <input type="text" className="w-full px-4 py-2 border border-gray-300 rounded-[4px] text-sm"
                                                                            value={branch.city || ''} disabled={!branch.state}
                                                                            onChange={e => handleManualBranchChange(branch.id, 'city', e.target.value)}
                                                                            placeholder="Enter city" />
                                                                    )}
                                                                </div>
                                                                <div>
                                                                    <label className="block text-xs font-medium text-gray-500 mb-1">Pincode</label>
                                                                    <input type="text" className="w-full px-4 py-2 border border-gray-300 rounded-[4px] text-sm"
                                                                        value={branch.pincode}
                                                                        onChange={e => handleManualBranchChange(branch.id, 'pincode', e.target.value)}
                                                                        placeholder="Enter pincode" />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-xs font-medium text-gray-500 mb-1">Contact Person</label>
                                                                    <input type="text" className="w-full px-4 py-2 border border-gray-300 rounded-[4px] text-sm"
                                                                        value={branch.contactPerson}
                                                                        onChange={e => handleManualBranchChange(branch.id, 'contactPerson', e.target.value)} />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-xs font-medium text-gray-500 mb-1">Contact Number</label>
                                                                    <input type="text" className="w-full px-4 py-2 border border-gray-300 rounded-[4px] text-sm"
                                                                        value={branch.contactNumber}
                                                                        onChange={e => handleManualBranchChange(branch.id, 'contactNumber', e.target.value)} />
                                                                </div>
                                                                <div className="md:col-span-2">
                                                                    <label className="block text-xs font-medium text-gray-500 mb-1">Email Address</label>
                                                                    <input type="email" className="w-full px-4 py-2 border border-gray-300 rounded-[4px] text-sm"
                                                                        value={branch.email}
                                                                        onChange={e => handleManualBranchChange(branch.id, 'email', e.target.value)} />
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                            <button type="button" onClick={handleAddManualBranch}
                                                className="w-full py-2 border-2 border-dashed border-gray-300 rounded-[4px] text-gray-500 font-medium hover:border-indigo-500 hover:text-indigo-600 transition-colors flex items-center justify-center gap-2">
                                                <span>+</span> Add Another Branch
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                // ─── REGISTERED PATH ───
                                <div className="space-y-6">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">GSTIN No. <span className="text-red-500">*</span></label>
                                        <div className="flex gap-4 items-start">
                                            <div className="relative flex-1">
                                                <input type="text"
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500"
                                                    placeholder={selectedGSTINs.length > 0 ? `${selectedGSTINs.length} selected — type to add more` : 'Enter or Select GSTIN'}
                                                    value={gstInput}
                                                    onChange={e => setGstInput(e.target.value)}
                                                    onFocus={() => setShowGstDropdown(true)}
                                                    onBlur={() => setTimeout(() => setShowGstDropdown(false), 200)}
                                                    onKeyDown={e => { if (e.key === 'Enter' && gstInput.trim() && !selectedGSTINs.includes(gstInput.trim())) { setSelectedGSTINs(p => [...p, gstInput.trim()]); setGstInput(''); } }}
                                                />
                                            </div>
                                            <button type="button" onClick={handleFetchBranchDetails}
                                                className="px-5 py-2 border border-gray-300 rounded-[4px] text-sm font-medium text-gray-600 hover:bg-gray-50 whitespace-nowrap">
                                                Fetch Branch Details
                                            </button>
                                        </div>
                                        {/* Manual add GSTIN */}
                                        {gstInput.trim() && (
                                            <div className="mt-2">
                                                <button type="button" onClick={() => { if (!selectedGSTINs.includes(gstInput.trim())) { setSelectedGSTINs(p => [...p, gstInput.trim()]); setGstInput(''); } }}
                                                    className="text-xs text-indigo-600 hover:underline">+ Add "{gstInput.trim()}"</button>
                                            </div>
                                        )}
                                        {/* Selected GSTINs chips */}
                                        {selectedGSTINs.length > 0 && (
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {selectedGSTINs.map(g => (
                                                    <span key={g} className="flex items-center gap-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded px-3 py-1 text-xs font-medium">
                                                        {g}
                                                        <button type="button" onClick={() => { setSelectedGSTINs(p => p.filter(x => x !== g)); setRegisteredBranches(p => p.filter(b => b.gstin !== g)); if (selectedGSTINs.length === 1) setShowBranchDetails(false); }}
                                                            className="ml-1 text-indigo-400 hover:text-red-500">×</button>
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Branch accordion cards – shown after Fetch */}
                                    {showBranchDetails && (
                                        <div className="space-y-4">
                                            {selectedGSTINs.map((gstin, index) => {
                                                const branch = registeredBranches.find(b => b.gstin === gstin) || { defaultRef: '', addressLine1: '', addressLine2: '', addressLine3: '', city: '', pincode: '', state: '', country: 'India', contactPerson: '', contactNumber: '', email: '' };
                                                const isExpanded = expandedBranches.includes(index + 1);
                                                const { countryCode, states, stateCode, cities } = getBranchGeo(branch);
                                                return (
                                                    <div key={gstin} className="border border-indigo-100 rounded-[4px] overflow-hidden bg-white">
                                                        <div className="flex items-center justify-between px-6 py-4 bg-indigo-50/50 cursor-pointer hover:bg-indigo-50"
                                                            onClick={() => toggleBranchExpand(index + 1)}>
                                                            <div className="flex items-center gap-3">
                                                                <span className="w-6 h-6 flex items-center justify-center bg-white border border-gray-200 rounded text-xs font-semibold text-gray-600">{index + 1}</span>
                                                                <span className="font-semibold text-gray-800">{branch.defaultRef || gstin}</span>
                                                            </div>
                                                            <span className="text-gray-400">{isExpanded ? '▲' : '▼'}</span>
                                                        </div>
                                                        {isExpanded && (
                                                            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                                                                <div className="md:col-span-2">
                                                                    <label className="block text-xs font-medium text-gray-500 mb-1">Reference Name</label>
                                                                    <input type="text" className="w-full px-4 py-2 border border-gray-300 rounded-[4px] text-sm"
                                                                        value={branch.defaultRef || ''}
                                                                        onChange={e => handleRegisteredBranchChange(gstin, 'defaultRef', e.target.value)}
                                                                        placeholder="e.g. Warehouse, Main Office" />
                                                                </div>
                                                                {(['addressLine1', 'addressLine2', 'addressLine3'] as const).map(f => (
                                                                    <div key={f} className="md:col-span-2">
                                                                        <label className="block text-xs font-medium text-gray-500 mb-1">Address Line {f.slice(-1)}</label>
                                                                        <input type="text" className="w-full px-4 py-2 border border-gray-300 rounded-[4px] text-sm"
                                                                            value={(branch as any)[f] || ''}
                                                                            onChange={e => handleRegisteredBranchChange(gstin, f, e.target.value)}
                                                                            placeholder={`Enter address line ${f.slice(-1)}`} />
                                                                    </div>
                                                                ))}
                                                                <div>
                                                                    <label className="block text-xs font-medium text-gray-500 mb-1">Country</label>
                                                                    <select className="w-full px-4 py-2 border border-gray-300 rounded-[4px] text-sm bg-white"
                                                                        value={countryCode}
                                                                        onChange={e => { const ci = Country.getCountryByCode(e.target.value); handleRegisteredBranchChange(gstin, 'country', ci?.name || ''); handleRegisteredBranchChange(gstin, 'state', ''); handleRegisteredBranchChange(gstin, 'city', ''); }}>
                                                                        <option value="">Select Country</option>
                                                                        {Country.getAllCountries().map(c => <option key={c.isoCode} value={c.isoCode}>{c.name}</option>)}
                                                                    </select>
                                                                </div>
                                                                <div>
                                                                    <label className="block text-xs font-medium text-gray-500 mb-1">State</label>
                                                                    <select className="w-full px-4 py-2 border border-gray-300 rounded-[4px] text-sm bg-white"
                                                                        value={stateCode} disabled={!countryCode}
                                                                        onChange={e => { const si = states.find(s => s.isoCode === e.target.value); handleRegisteredBranchChange(gstin, 'state', si?.name || ''); handleRegisteredBranchChange(gstin, 'city', ''); }}>
                                                                        <option value="">Select State</option>
                                                                        {states.map(s => <option key={s.isoCode} value={s.isoCode}>{s.name}</option>)}
                                                                    </select>
                                                                </div>
                                                                <div>
                                                                    <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
                                                                    {cities.length > 0 ? (
                                                                        <select className="w-full px-4 py-2 border border-gray-300 rounded-[4px] text-sm bg-white"
                                                                            value={branch.city || ''} disabled={!branch.state}
                                                                            onChange={e => handleRegisteredBranchChange(gstin, 'city', e.target.value)}>
                                                                            <option value="">Select City</option>
                                                                            {cities.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
                                                                        </select>
                                                                    ) : (
                                                                        <input type="text" className="w-full px-4 py-2 border border-gray-300 rounded-[4px] text-sm"
                                                                            value={branch.city || ''} disabled={!branch.state}
                                                                            onChange={e => handleRegisteredBranchChange(gstin, 'city', e.target.value)}
                                                                            placeholder="Enter city" />
                                                                    )}
                                                                </div>
                                                                <div>
                                                                    <label className="block text-xs font-medium text-gray-500 mb-1">Pincode</label>
                                                                    <input type="text" className="w-full px-4 py-2 border border-gray-300 rounded-[4px] text-sm"
                                                                        value={branch.pincode || ''}
                                                                        onChange={e => handleRegisteredBranchChange(gstin, 'pincode', e.target.value)}
                                                                        placeholder="Enter pincode" />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-xs font-medium text-gray-500 mb-1">Contact Person</label>
                                                                    <input type="text" className="w-full px-4 py-2 border border-gray-300 rounded-[4px] text-sm"
                                                                        value={branch.contactPerson || ''}
                                                                        onChange={e => handleRegisteredBranchChange(gstin, 'contactPerson', e.target.value)} />
                                                                </div>
                                                                <div>
                                                                    <label className="block text-xs font-medium text-gray-500 mb-1">Contact Number</label>
                                                                    <input type="text" className="w-full px-4 py-2 border border-gray-300 rounded-[4px] text-sm"
                                                                        value={branch.contactNumber || ''}
                                                                        onChange={e => handleRegisteredBranchChange(gstin, 'contactNumber', e.target.value)} />
                                                                </div>
                                                                <div className="md:col-span-2">
                                                                    <label className="block text-xs font-medium text-gray-500 mb-1">Email Address</label>
                                                                    <input type="email" className="w-full px-4 py-2 border border-gray-300 rounded-[4px] text-sm"
                                                                        value={branch.email || ''}
                                                                        onChange={e => handleRegisteredBranchChange(gstin, 'email', e.target.value)} />
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
                        </div>
                    )}

                    {/* ── PRODUCTS / SERVICES ── */}


                    {/* ── PRODUCTS / SERVICES ── */}
                    {activeTab === 'Products/Services' && (
                        <div>
                            <table className="w-full text-sm border-collapse">
                                <thead>
                                    <tr className="bg-gray-50">
                                        <th className="border border-gray-200 px-3 py-2 text-left font-semibold text-gray-600">Item Code</th>
                                        <th className="border border-gray-200 px-3 py-2 text-left font-semibold text-gray-600">Item Name</th>
                                        <th className="border border-gray-200 px-3 py-2 text-left font-semibold text-gray-600">UOM</th>
                                        <th className="border border-gray-200 px-3 py-2 text-left font-semibold text-gray-600">Cust. Item Code</th>
                                        <th className="border border-gray-200 px-3 py-2 text-left font-semibold text-gray-600">Cust. Item Name</th>
                                        <th className="border border-gray-200 px-2 py-2"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {productRows.map(row => (
                                        <tr key={row.id}>
                                            <td className="border border-gray-200 p-1">
                                                <select value={row.itemCode} onChange={e => {
                                                    const item = stockItems.find(i => i.code === e.target.value);
                                                    setProductRows(p => p.map(r => r.id === row.id ? { ...r, itemCode: e.target.value, itemName: item?.name || r.itemName, uom: item?.uom || r.uom } : r));
                                                }} className="w-full px-2 py-1.5 border-0 text-sm bg-transparent focus:ring-1 focus:ring-indigo-400 rounded">
                                                    <option value="">Select</option>
                                                    {stockItems.map(i => <option key={i.code} value={i.code}>{i.code}</option>)}
                                                </select>
                                            </td>
                                            <td className="border border-gray-200 p-1">
                                                <select value={row.itemName} onChange={e => {
                                                    const item = stockItems.find(i => i.name === e.target.value);
                                                    setProductRows(p => p.map(r => r.id === row.id ? { ...r, itemName: e.target.value, itemCode: item?.code || r.itemCode, uom: item?.uom || r.uom } : r));
                                                }} className="w-full px-2 py-1.5 border-0 text-sm bg-transparent focus:ring-1 focus:ring-indigo-400 rounded">
                                                    <option value="">Select</option>
                                                    {stockItems.map(i => <option key={i.name} value={i.name}>{i.name}</option>)}
                                                </select>
                                            </td>
                                            <td className="border border-gray-200 p-1">
                                                <input type="text" value={row.uom} readOnly className="w-full px-2 py-1.5 text-sm bg-gray-50 text-gray-500" />
                                            </td>
                                            <td className="border border-gray-200 p-1">
                                                <input type="text" value={row.custItemCode} onChange={e => setProductRows(p => p.map(r => r.id === row.id ? { ...r, custItemCode: e.target.value } : r))}
                                                    className="w-full px-2 py-1.5 text-sm border-0" />
                                            </td>
                                            <td className="border border-gray-200 p-1">
                                                <input type="text" value={row.custItemName} onChange={e => setProductRows(p => p.map(r => r.id === row.id ? { ...r, custItemName: e.target.value } : r))}
                                                    className="w-full px-2 py-1.5 text-sm border-0" />
                                            </td>
                                            <td className="border border-gray-200 p-1 text-center">
                                                <button type="button" onClick={() => productRows.length > 1 && setProductRows(p => p.filter(r => r.id !== row.id))}
                                                    className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <button type="button" onClick={() => setProductRows(p => [...p, { id: Date.now(), itemCode: '', itemName: '', uom: '', custItemCode: '', custItemName: '' }])}
                                className="mt-3 flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium">
                                + Add Product Row
                            </button>
                        </div>
                    )}

                    {/* ── TDS & STATUTORY ── */}
                    {activeTab === 'TDS & Statutory' && (
                        <div className="space-y-10">
                            {/* SECTION 1: STATUTORY INFORMATION */}
                            <div>
                                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-6">Statutory Information</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">MSME (Udyam) Registration Number</label>
                                        <input
                                            type="text"
                                            className="w-full px-4 py-2.5 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm placeholder-gray-400"
                                            placeholder="UDYAM-XX-00-000000"
                                            value={statutory.msme_no}
                                            onChange={(e) => setStatutory({ ...statutory, msme_no: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">FSSAI License Number</label>
                                        <input
                                            type="text"
                                            className="w-full px-4 py-2.5 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm placeholder-gray-400"
                                            placeholder="14-digit License Number"
                                            value={statutory.fssai_no}
                                            onChange={(e) => setStatutory({ ...statutory, fssai_no: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* SECTION 2: IMPORT / EXPORT & COMPLIANCE */}
                            <div>
                                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-6">Import / Export & Compliance</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">Import Export Code (IEC)</label>
                                        <input
                                            type="text"
                                            className="w-full px-4 py-2.5 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm placeholder-gray-400"
                                            placeholder="10-DIGIT IEC CODE"
                                            value={statutory.iec_code}
                                            onChange={(e) => setStatutory({ ...statutory, iec_code: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">EOU Status</label>
                                        <select
                                            className="w-full px-4 py-2.5 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
                                            value={statutory.eou_status || 'None'}
                                            onChange={(e) => setStatutory({ ...statutory, eou_status: e.target.value })}
                                        >
                                            <option value="None">None</option>
                                            <option value="Export Oriented Unit (EOU)">Export Oriented Unit (EOU)</option>
                                            <option value="SEZ Unit">SEZ Unit</option>
                                            <option value="STP Unit">STP Unit</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* SECTION 3: TAX CONFIGURATION */}
                            <div>
                                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Tax Configuration</h4>

                                {/* Toggle: TDS / TCS / NONE */}
                                <div className="mb-6">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Tax Deducted / Collected at Source</p>
                                    <div className="inline-flex rounded-[4px] border border-gray-300 overflow-hidden">
                                        {(['TDS', 'TCS', 'NONE'] as const).map((type) => (
                                            <button
                                                key={type}
                                                type="button"
                                                onClick={() => setStatutory({
                                                    ...statutory,
                                                    taxType: type,
                                                    tcs_section: type !== 'TCS' ? '' : statutory.tcs_section,
                                                    tcs_enabled: type !== 'TCS' ? false : statutory.tcs_enabled,
                                                    tds_section: type !== 'TDS' ? '' : statutory.tds_section,
                                                    tds_enabled: type !== 'TDS' ? false : statutory.tds_enabled,
                                                })}
                                                className={`px-6 py-2 text-sm font-semibold transition-colors border-r border-gray-300 last:border-r-0 ${statutory.taxType === type
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
                                {statutory.taxType === 'TCS' && (
                                    <div className="border border-gray-200 rounded-[4px] p-6 bg-gray-50/30 max-w-xl">
                                        <div className="flex justify-between items-start mb-4">
                                            <h5 className="font-semibold text-gray-800 text-sm">TCS Configuration</h5>
                                            <Info className="w-4 h-4 text-gray-400" />
                                        </div>
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-xs font-medium text-gray-500 mb-1">Applicable Section</label>
                                                <select
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
                                                    value={statutory.tcs_section}
                                                    onChange={(e) => setStatutory({ ...statutory, tcs_section: e.target.value })}
                                                >
                                                    <option value="">Select TCS Section</option>
                                                    {TCS_SECTIONS.map((tcs, index) => (
                                                        <option key={index} value={`${tcs.section}|${tcs.name}`}>
                                                            {tcs.section} - {tcs.name} @ {tcs.rate}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                                    checked={statutory.tcs_enabled}
                                                    onChange={(e) => setStatutory({ ...statutory, tcs_enabled: e.target.checked })}
                                                />
                                                <span className="text-sm text-gray-700">Enable automatic TCS posting</span>
                                            </label>
                                        </div>
                                    </div>
                                )}

                                {/* TDS Card */}
                                {statutory.taxType === 'TDS' && (
                                    <div className="border border-gray-200 rounded-[4px] p-6 bg-gray-50/30 max-w-xl">
                                        <div className="flex justify-between items-start mb-4">
                                            <h5 className="font-semibold text-gray-800 text-sm">TDS Configuration</h5>
                                            <Info className="w-4 h-4 text-gray-400" />
                                        </div>
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-xs font-medium text-gray-500 mb-1">Receivable Section</label>
                                                <select
                                                    className="w-full px-4 py-2 border border-gray-300 rounded-[4px] focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
                                                    value={statutory.tds_section}
                                                    onChange={(e) => setStatutory({ ...statutory, tds_section: e.target.value })}
                                                >
                                                    <option value="">Select TDS Section</option>
                                                    {TDS_SECTIONS.map((tds, index) => (
                                                        <option key={index} value={`${tds.section}|${tds.name}`}>
                                                            {tds.section} - {tds.name} @ {tds.rate}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                                    checked={statutory.tds_enabled}
                                                    onChange={(e) => setStatutory({ ...statutory, tds_enabled: e.target.checked })}
                                                />
                                                <span className="text-sm text-gray-700">Enable automatic TDS posting</span>
                                            </label>
                                        </div>
                                    </div>
                                )}

                                {/* NONE state */}
                                {statutory.taxType === 'NONE' && (
                                    <p className="text-sm text-gray-400 italic">No TDS / TCS applicable for this customer.</p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── BANKING INFO ── */}
                    {activeTab === 'Banking Info' && (
                        <div>
                            {bankAccounts.map((acc, i) => (
                                <div key={acc.id} className="border border-gray-200 rounded-lg p-4 mb-4 relative">
                                    <div className="flex items-center justify-between mb-3">
                                        <h4 className="text-sm font-semibold text-gray-700">Bank Account {i + 1}</h4>
                                        <button type="button" onClick={() => setBankAccounts(p => p.filter(a => a.id !== acc.id))} className="text-red-400 hover:text-red-600 text-sm">Remove</button>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {[
                                            { key: 'accountNumber', label: 'Account Number', placeholder: '' },
                                            { key: 'bankName', label: 'Bank Name', placeholder: '' },
                                            { key: 'ifscCode', label: 'IFSC Code', placeholder: '' },
                                            { key: 'branchName', label: 'Branch Name', placeholder: '' },
                                            { key: 'swiftCode', label: 'SWIFT Code', placeholder: '' },
                                        ].map(f => (
                                            <div key={f.key}>
                                                <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                                                <input type="text" value={(acc as any)[f.key]} onChange={e => setBankAccounts(p => p.map(a => a.id === acc.id ? { ...a, [f.key]: e.target.value } : a))}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm" />
                                            </div>
                                        ))}
                                    </div>
                                    {/* Associate to a Customer Branch */}
                                    <div className="mt-4 pt-4 border-t border-gray-100">
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">Associate to a Customer Branch</label>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div className="relative">
                                                <button
                                                    type="button"
                                                    onClick={() => setOpenBranchDropdown(openBranchDropdown === acc.id ? null : acc.id)}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded text-sm text-left bg-white flex items-center justify-between hover:border-indigo-400 transition-colors"
                                                >
                                                    <span className="text-gray-600">
                                                        {(acc.associatedBranches || []).length > 0
                                                            ? `${(acc.associatedBranches || []).length} branch(es) selected`
                                                            : 'Select Branches'}
                                                    </span>
                                                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${openBranchDropdown === acc.id ? 'rotate-180' : ''}`} />
                                                </button>

                                                {openBranchDropdown === acc.id && (
                                                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded shadow-lg max-h-48 overflow-y-auto">
                                                        <div className="p-2 space-y-1">
                                                            {(isUnregistered
                                                                ? unregisteredBranches.map(b => b.referenceName)
                                                                : registeredBranches.map(b => b.defaultRef)
                                                            ).filter(Boolean).map((branch) => (
                                                                <label key={branch} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-2 py-1.5 rounded">
                                                                    <input
                                                                        type="checkbox"
                                                                        className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                                                        checked={(acc.associatedBranches || []).includes(branch)}
                                                                        onChange={(e) => {
                                                                            const currentBranches = acc.associatedBranches || [];
                                                                            const newBranches = e.target.checked
                                                                                ? [...currentBranches, branch]
                                                                                : currentBranches.filter(b => b !== branch);
                                                                            setBankAccounts(p => p.map(a => a.id === acc.id ? { ...a, associatedBranches: newBranches } : a));
                                                                        }}
                                                                    />
                                                                    <span className="text-sm text-gray-700">{branch}</span>
                                                                </label>
                                                            ))}
                                                            {(isUnregistered ? unregisteredBranches : registeredBranches).filter(b => isUnregistered ? !b.referenceName : !b.defaultRef).length > 0 && (
                                                                <div className="px-2 py-1.5 text-xs text-gray-400 italic">Enter reference names in GST Details to see them here</div>
                                                            )}
                                                            {(isUnregistered ? unregisteredBranches : registeredBranches).length === 0 && (
                                                                <div className="px-2 py-1.5 text-xs text-gray-400 italic">No branches added in GST Details</div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="px-3 py-2 border border-gray-200 rounded bg-gray-50 min-h-[38px]">
                                                {(acc.associatedBranches || []).length > 0 ? (
                                                    <div className="flex flex-wrap gap-2">
                                                        {(acc.associatedBranches || []).map((branch, idx) => (
                                                            <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs font-medium rounded border border-indigo-100">
                                                                {branch}
                                                                <button type="button" onClick={() => {
                                                                    const newBranches = acc.associatedBranches.filter(b => b !== branch);
                                                                    setBankAccounts(p => p.map(a => a.id === acc.id ? { ...a, associatedBranches: newBranches } : a));
                                                                }} className="text-indigo-400 hover:text-red-500">×</button>
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-gray-400">Selected branches will appear here</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <button type="button" onClick={() => setBankAccounts(p => [...p, { id: Date.now(), accountNumber: '', bankName: '', ifscCode: '', branchName: '', swiftCode: '', associatedBranches: [] }])}
                                className="w-full py-2 border-2 border-dashed border-gray-300 rounded text-gray-500 hover:border-indigo-400 hover:text-indigo-600 text-sm font-medium transition-colors">
                                + Add Bank Account
                            </button>
                        </div>
                    )}

                    {/* ── TERMS & CONDITIONS ── */}
                    {activeTab === 'Terms & Conditions' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {[
                                { key: 'credit_period', label: 'Credit Period', placeholder: 'e.g. 30 days' },
                                { key: 'credit_terms', label: 'Credit Terms', placeholder: 'Enter terms' },
                                { key: 'penalty_terms', label: 'Penalty Terms', placeholder: 'Enter penalty terms' },
                                { key: 'delivery_terms', label: 'Delivery Terms', placeholder: 'Enter delivery terms' },
                                { key: 'warranty_details', label: 'Warranty Details', placeholder: 'Enter warranty info' },
                                { key: 'force_majeure', label: 'Force Majeure', placeholder: 'Enter force majeure clause' },
                                { key: 'dispute_terms', label: 'Dispute Terms', placeholder: 'Enter dispute resolution terms' },
                            ].map(field => (
                                <div key={field.key} className={field.key === 'dispute_terms' ? 'md:col-span-2' : ''}>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">{field.label}</label>
                                    <input type="text" value={(terms as any)[field.key]} onChange={e => setTerms(p => ({ ...p, [field.key]: e.target.value }))}
                                        className="w-full px-3 py-2 border border-gray-300 rounded text-sm" placeholder={field.placeholder} />
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4 bg-gray-50 rounded-b-lg">
                    <button type="button" onClick={goPrev} disabled={isFirst}
                        className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                        <ChevronLeft className="w-4 h-4" /> Previous
                    </button>
                    <div className="flex items-center gap-3">
                        <button type="button" onClick={handleClose}
                            className="px-4 py-2 border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">
                            Cancel
                        </button>
                        {!isLast ? (
                            <button type="button" onClick={goNext}
                                className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded text-sm font-medium hover:bg-indigo-700 transition-colors">
                                Next <ChevronRight className="w-4 h-4" />
                            </button>
                        ) : (
                            <button type="button" onClick={handleSave} disabled={isSaving}
                                className="px-6 py-2 bg-green-600 text-white rounded text-sm font-semibold hover:bg-green-700 disabled:opacity-60 transition-colors">
                                {isSaving ? 'Saving...' : '✓ Save Customer'}
                            </button>
                        )}
                    </div>
                </div>
            </div >
        </div >
    );
};

export default AddNewCustomerModal;
