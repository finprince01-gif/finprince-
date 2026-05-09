/**
 * CreateNewVendorFullModal
 * A full-featured vendor creation modal that mirrors every section
 * of the Vendor Portal > Create New Vendor flow.
 * Used from Purchase Voucher > Supplier Details tab.
 */
import React, { useState, useEffect } from 'react';
import { httpClient } from '../services/httpClient';
import { showError, showSuccess, showInfo } from '../utils/toast';
import { BILLING_CURRENCIES } from '../constants/customerPortalConstants';
import { ChevronDown } from 'lucide-react';

/* ─── Types ──────────────────────────────────────────────── */
interface PlaceOfBusiness {
    id: string;
    referenceName: string;
    address: string;
    contactPerson: string;
    email: string;
    contactNumber: string;
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

interface VendorItem {
    id: number;
    hsnSacCode: string;
    itemCode: string;
    itemName: string;
    supplierItemCode: string;
    supplierItemName: string;
}

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

interface CreateNewVendorFullModalProps {
    onClose: () => void;
    /** Called after vendor is saved; receives the new vendor's name & id */
    onVendorCreated: (vendorName: string, vendorId: number) => void;
}

const TDS_SECTIONS = [
    'Section 194C', 'Section 194D', 'Section 194H', 'Section 194I',
    'Section 194J', 'Section 194K', 'Section 194LA', 'Section 194-IA',
    'Section 194-IB', 'Section 195',
];

const VENDOR_SYSTEM_CATEGORIES = [
    'Raw Material', 'Work in Progress', 'Finished Goods',
    'Stores and Spares', 'Packing Material', 'Stock in Trade',
];

const GST_TYPES = ['Regular', 'Composition', 'SEZ', 'Unregistered'] as const;

const genId = () => Math.random().toString(36).slice(2, 9);

type TabId = 'basic' | 'gst' | 'products' | 'tds' | 'banking' | 'terms';

const TABS: { id: TabId; label: string }[] = [
    { id: 'basic', label: 'Basic Details' },
    { id: 'gst', label: 'GST Details' },
    { id: 'products', label: 'Products / Services' },
    { id: 'tds', label: 'TDS & Statutory' },
    { id: 'banking', label: 'Banking Info' },
    { id: 'terms', label: 'Terms & Conditions' },
];

/* ─── Component ───────────────────────────────────────────── */
const CreateNewVendorFullModal: React.FC<CreateNewVendorFullModalProps> = ({
    onClose,
    onVendorCreated,
}) => {
    const [activeTab, setActiveTab] = useState<TabId>('basic');
    const [isSaving, setIsSaving] = useState(false);
    const [createdVendorId, setCreatedVendorId] = useState<number | null>(null);

    /* ── Basic Details State ─────────────────── */
    const [vendorCode, setVendorCode] = useState(`VEN-${Date.now().toString().slice(-6)}`);
    const [vendorName, setVendorName] = useState('');
    const [panNo, setPanNo] = useState('');
    const [contactPerson, setContactPerson] = useState('');
    const [vendorEmail, setVendorEmail] = useState('');
    const [contactNo, setContactNo] = useState('');
    const [vendorCategory, setVendorCategory] = useState('');
    const [billingCurrency, setBillingCurrency] = useState('');
    const [isAlsoCustomer, setIsAlsoCustomer] = useState(false);
    const [tcsApplicable, setTcsApplicable] = useState(false);

    // Customer search states
    const [matchingCustomer, setMatchingCustomer] = useState<any | null>(null);
    const [isLoadingCustomer, setIsLoadingCustomer] = useState(false);
    const [linkVendorToCustomer, setLinkVendorToCustomer] = useState<boolean | null>(null);
    const [createCustomerOption, setCreateCustomerOption] = useState<boolean | null>(null);
    const [customerSearchAttempted, setCustomerSearchAttempted] = useState(false);

    /* ── GST Details State ──────────────────── */
    const [gstRecords, setGstRecords] = useState<GSTRecord[]>([{
        id: genId(), gstin: '', registrationType: 'Regular',
        tradeName: '', legalName: '', placesOfBusiness: [], isExpanded: true,
    }]);

    /* ── Products / Services State ──────────── */
    const [items, setItems] = useState<VendorItem[]>([
        { id: 1, hsnSacCode: '', itemCode: '', itemName: '', supplierItemCode: '', supplierItemName: '' },
    ]);

    /* ── TDS State ──────────────────────────── */
    const [msmeUdyamNo, setMsmeUdyamNo] = useState('');
    const [fssaiLicenseNo, setFssaiLicenseNo] = useState('');
    const [importExportCode, setImportExportCode] = useState('');
    const [eouStatus, setEouStatus] = useState('');
    const [tdsSectionApplicable, setTdsSectionApplicable] = useState('');
    const [enableAutoTds, setEnableAutoTds] = useState(false);

    /* ── Banking State ──────────────────────── */
    const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([{
        id: 1, accountNumber: '', bankName: '', ifscCode: '',
        branchName: '', swiftCode: '', vendorBranch: [], accountType: 'Savings',
    }]);

    /* ── Terms State ────────────────────────── */
    const [creditLimit, setCreditLimit] = useState('');
    const [creditPeriod, setCreditPeriod] = useState('');
    const [creditTerms, setCreditTerms] = useState('');
    const [penaltyTerms, setPenaltyTerms] = useState('');
    const [ifscCache, setIfscCache] = useState<Record<string, { bank: string, branch: string }>>({});
    const [deliveryTerms, setDeliveryTerms] = useState('');

    const [categories, setCategories] = useState<string[]>([]);

    useEffect(() => {
        const fetchCategories = async () => {
            try {
                // Use a standard set of defaults matching backend/vendorcategory_api.py
                const DEFAULT_CATEGORIES = [
                    "Raw Material", "Work in Progress", "Services", "Jobwork", "Stores and Spares",
                    "Packing Material", "Stock in Trade", "Fixed Assets", "Capital Goods", "Consumables"
                ];

                const res: any = await httpClient.get('/api/vendors/categories/');
                const arr = Array.isArray(res) ? res : (res.results || []);

                const dbPaths = arr.map((item: any) => {
                    const parts = [item.category];
                    if (item.group) parts.push(item.group);
                    if (item.subgroup) parts.push(item.subgroup);
                    return parts.join(' > ');
                }).filter(Boolean);

                const allPaths = [...DEFAULT_CATEGORIES, ...dbPaths];
                const uniquePaths: string[] = [];
                const seen = new Set<string>();

                allPaths.forEach(path => {
                    const lower = path.toLowerCase();
                    if (!seen.has(lower)) {
                        seen.add(lower);
                        uniquePaths.push(path);
                    }
                });

                setCategories(uniquePaths.sort((a, b) => a.localeCompare(b)));
            } catch (error) {
                console.error('Error fetching vendor categories:', error);
            }
        };

        fetchCategories();
    }, []);

    const handleFileUpload = (type: keyof typeof uploadedFiles, file: File | null) => {
        if (file) {
            setUploadedFiles(prev => ({ ...prev, [type]: file }));
            showSuccess(`${file.name} uploaded successfully!`);
        }
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

    const [uploadedFiles, setUploadedFiles] = useState<{
        msmeFile: File | null;
        fssaiFile: File | null;
        iecFile: File | null;
    }>({
        msmeFile: null,
        fssaiFile: null,
        iecFile: null,
    });

    /* ─── GST helpers ──────────────────────── */
    const addGstRecord = () => setGstRecords(prev => [...prev, {
        id: genId(), gstin: '', registrationType: 'Regular',
        tradeName: '', legalName: '', placesOfBusiness: [], isExpanded: true,
    }]);

    const removeGstRecord = (id: string) =>
        setGstRecords(prev => prev.filter(r => r.id !== id));

    const updateGstField = (id: string, field: keyof GSTRecord, value: any) =>
        setGstRecords(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));

    const toggleGst = (id: string) =>
        setGstRecords(prev => prev.map(r => r.id === id ? { ...r, isExpanded: !r.isExpanded } : r));

    const addPob = (gstId: string) => setGstRecords(prev => prev.map(r =>
        r.id === gstId
            ? { ...r, placesOfBusiness: [...r.placesOfBusiness, { id: genId(), referenceName: '', address: '', contactPerson: '', email: '', contactNumber: '' }] }
            : r,
    ));

    const removePob = (gstId: string, pobId: string) => setGstRecords(prev => prev.map(r =>
        r.id === gstId
            ? { ...r, placesOfBusiness: r.placesOfBusiness.filter(p => p.id !== pobId) }
            : r,
    ));

    const updatePob = (gstId: string, pobId: string, field: keyof PlaceOfBusiness, value: string) =>
        setGstRecords(prev => prev.map(r =>
            r.id === gstId
                ? { ...r, placesOfBusiness: r.placesOfBusiness.map(p => p.id === pobId ? { ...p, [field]: value } : p) }
                : r,
        ));

    /* ─── Product helpers ──────────────────── */
    const addItem = () => setItems(prev => [...prev, {
        id: prev.length + 1, hsnSacCode: '', itemCode: '', itemName: '',
        supplierItemCode: '', supplierItemName: '',
    }]);

    const removeItem = (id: number) =>
        setItems(prev => prev.length > 1 ? prev.filter(i => i.id !== id) : prev);

    const updateItem = (id: number, field: keyof VendorItem, value: string) =>
        setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));

    /* ─── Bank helpers ─────────────────────── */
    const addBank = () => setBankAccounts(prev => [...prev, {
        id: prev.length + 1, accountNumber: '', bankName: '', ifscCode: '',
        branchName: '', swiftCode: '', vendorBranch: [], accountType: 'Savings'
    }]);

    const removeBank = (id: number) =>
        setBankAccounts(prev => prev.length > 1 ? prev.filter(b => b.id !== id) : prev);

    const updateBank = async (id: number, field: keyof BankAccount, value: any) => {
        // Update the field first in local state
        const updatedAccounts = bankAccounts.map(b => b.id === id ? { ...b, [field]: value } : b);
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

        // If field being updated is bankName, branchName or ifscCode, check against cache
        if (field === 'bankName' || field === 'branchName' || field === 'ifscCode') {
            const ifsc = currentBank.ifscCode;
            if (ifsc.length === 11) {
                if (ifscCache[ifsc]) {
                    checkMismatch(ifsc, currentBank.bankName, currentBank.branchName, ifscCache[ifsc]);
                    if (field === 'ifscCode') {
                        updateBank(id, 'bankName', ifscCache[ifsc].bank);
                        updateBank(id, 'branchName', ifscCache[ifsc].branch);
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

    /* ─── Registration type map ────────────── */
    const mapRegType = (type: string): string => ({
        'Regular': 'regular', 'Composition': 'composition',
        'SEZ': 'special_economic_zone', 'Unregistered': 'unregistered',
    }[type] || type.toLowerCase());

    /* ─── Main Save ────────────────────────── */
    const handleFinish = async () => {
        if (!vendorName.trim()) {
            showError('Vendor Name is required.');
            setActiveTab('basic');
            return;
        }

        // Validation for Also Customer logic
        if (isAlsoCustomer) {
            if (matchingCustomer && linkVendorToCustomer === null) {
                showError('Please decide whether to link the vendor to the existing customer.');
                setActiveTab('basic');
                return;
            }
            if (!matchingCustomer && createCustomerOption === null) {
                showError('Please decide whether to create a new customer.');
                setActiveTab('basic');
                return;
            }
            if (matchingCustomer && linkVendorToCustomer === false && createCustomerOption === null) {
                showError('Please decide whether to create a new customer.');
                setActiveTab('basic');
                return;
            }
        }

        // Statutory Validations
        if (msmeUdyamNo) {
            const msmeRegex = /^(UDYAM|UDHYAM)-[A-Z]{2}-\d{2}-\d{7}$/;
            if (!msmeRegex.test(msmeUdyamNo)) {
                showError('Invalid MSME Udyam No format. Expected: UDYAM-TN-01-2345678 (or UDHYAM)');
                setActiveTab('tds');
                return;
            }
        }
        if (fssaiLicenseNo) {
            if (fssaiLicenseNo.length !== 14 || !/^\d+$/.test(fssaiLicenseNo)) {
                showError('Invalid FSSAI License No. Must be exactly 14 digits.');
                setActiveTab('tds');
                return;
            }
        }
        if (importExportCode) {
            const iecRegex = /^[A-Z]{5}\d{4}[A-Z]{1}$/;
            if (!iecRegex.test(importExportCode)) {
                showError('Invalid IEC format. Expected: ABCDE1234F');
                setActiveTab('tds');
                return;
            }
        }

        setIsSaving(true);
        try {
            // 1. Basic Details
            const basicPayload = {
                vendor_code: vendorCode || undefined,
                vendor_name: vendorName,
                pan_no: panNo || undefined,
                contact_person: contactPerson || undefined,
                email: vendorEmail || `noreply+${Date.now()}@vendor.local`,
                contact_no: contactNo || '0000000000',
                vendor_category: vendorCategory || null,
                billing_currency: billingCurrency || null,
                is_also_customer: isAlsoCustomer,
                tcs_applicable: tcsApplicable,
            };

            console.log('Sending Master Vendor Basic Payload:', basicPayload);
            let newId = createdVendorId;
            if (!newId) {
                const basicRes: any = await httpClient.post('/api/vendors/basic-details/', basicPayload);
                newId = basicRes.id;
                setCreatedVendorId(newId);
                showInfo('Basic details saved. Saving remaining sections…');
            } else {
                await httpClient.patch(`/api/vendors/basic-details/${newId}/`, basicPayload);
            }

            // 2. GST Details
            try {
                const existingGst: any = await httpClient.get(`/api/vendors/gst-details/?vendor_basic_detail=${newId}`);
                const existingGstList: any[] = Array.isArray(existingGst) ? existingGst : (existingGst.results || []);

                for (const gst of gstRecords) {
                    const registrationType = gst.registrationType || 'Regular';
                    const isUnregistered = registrationType === 'Unregistered';
                    const normalizedGstin = (gst.gstin || '').trim().toUpperCase();

                    if (!isUnregistered && !normalizedGstin) continue;

                    const branches = gst.placesOfBusiness.length > 0
                        ? gst.placesOfBusiness
                        : [{ referenceName: '', address: '', contactPerson: '', email: '', contactNumber: '' }];

                    for (let branchIndex = 0; branchIndex < branches.length; branchIndex++) {
                        const branch = branches[branchIndex];
                        const resolvedReferenceName = (branch.referenceName || '').trim() || `Branch ${branchIndex + 1}`;
                        const gstPayload = {
                            vendor_basic_detail: newId,
                            gstin: isUnregistered ? '' : normalizedGstin,
                            gst_registration_type: mapRegType(registrationType),
                            legal_name: gst.legalName || vendorName || 'N/A',
                            trade_name: gst.tradeName || gst.legalName || vendorName || 'N/A',
                            reference_name: resolvedReferenceName,
                            branch_address: branch.address || '',
                            branch_contact_person: (branch as any).contactPerson || '',
                            branch_email: branch.email || '',
                            branch_contact_no: (branch as any).contactNumber || '',
                        };
                        const existing = existingGstList.find(g =>
                            (g.gstin || '') === gstPayload.gstin && (g.reference_name || '') === resolvedReferenceName,
                        );
                        if (existing) {
                            await httpClient.patch(`/api/vendors/gst-details/${existing.id}/`, gstPayload);
                        } else {
                            await httpClient.post('/api/vendors/gst-details/', gstPayload);
                        }
                    }
                }
            } catch (e) { console.error('GST save error (non-fatal):', e); }

            // 3. Products / Services
            try {
                const cleanItems = items
                    .filter(i => i.itemName?.trim())
                    .map(i => ({
                        hsn_sac_code: i.hsnSacCode || '',
                        item_code: i.itemCode || '',
                        item_name: i.itemName.trim(),
                        supplier_item_code: i.supplierItemCode || '',
                        supplier_item_name: i.supplierItemName || '',
                    }));
                await httpClient.post('/api/vendors/product-services/', {
                    vendor_basic_detail: newId,
                    items: cleanItems,
                    is_active: true,
                });
            } catch (e) { console.error('Products/Services save error (non-fatal):', e); }

            // 4. TDS
            try {
                const existingTds: any = await httpClient.get(`/api/vendors/tds-details/by-vendor/${newId}/`);
                const existingTdsRecord = existingTds?.data?.[0] || (existingTds?.id ? existingTds : null);

                const fd = new FormData();
                fd.append('vendor_basic_detail', newId!.toString());
                fd.append('msme_udyam_no', msmeUdyamNo);
                fd.append('fssai_license_no', fssaiLicenseNo);
                fd.append('import_export_code', importExportCode);
                fd.append('eou_status', eouStatus);
                fd.append('tds_section_applicable', tdsSectionApplicable);
                fd.append('tds_section', tdsSectionApplicable);
                fd.append('pan_number', panNo || '');
                fd.append('enable_automatic_tds_posting', enableAutoTds ? 'true' : 'false');

                if (existingTdsRecord) {
                    await httpClient.patchFormData(`/api/vendors/tds-details/${existingTdsRecord.id}/`, fd);
                } else {
                    await httpClient.postFormData('/api/vendors/tds-details/', fd);
                }
            } catch (e) { console.error('TDS save error (non-fatal):', e); }

            // 5. Banking
            try {
                const existingBanking: any = await httpClient.get(`/api/vendors/banking-details/by-vendor/${newId}/`);
                const existingBankingList: any[] = Array.isArray(existingBanking) ? existingBanking : (existingBanking.results || []);

                for (const bank of bankAccounts.filter(b => b.accountNumber?.trim())) {
                    const bankPayload = {
                        vendor_basic_detail: newId,
                        bank_account_no: bank.accountNumber,
                        bank_name: bank.bankName || '',
                        ifsc_code: bank.ifscCode || '',
                        branch_name: bank.branchName || '',
                        swift_code: bank.swiftCode || '',
                        vendor_branch: (bank.vendorBranch || []).join(','),
                        account_type: bank.accountType ? bank.accountType.toLowerCase().replace(' ', '_') : 'savings',
                        is_active: true,
                    };
                    const existing = existingBankingList.find(b => b.bank_account_no === bank.accountNumber);
                    if (existing) {
                        await httpClient.patch(`/api/vendors/banking-details/${existing.id}/`, bankPayload);
                    } else {
                        await httpClient.post('/api/vendors/banking-details/', bankPayload);
                    }
                }
            } catch (e) { console.error('Banking save error (non-fatal):', e); }

            // 6. Terms & Conditions
            try {
                const termsRes: any = await httpClient.get(`/api/vendors/terms/by_vendor/${newId}/`);
                const termsArray = termsRes?.data || (Array.isArray(termsRes) ? termsRes : []);
                const existingTermsId = termsArray.length > 0 ? termsArray[0].id : null;

                const termsPayload = {
                    vendor_basic_detail: newId,
                    credit_limit: creditLimit || '',
                    credit_period: creditPeriod || '',
                    credit_terms: creditTerms || '',
                    penalty_terms: penaltyTerms || '',
                    delivery_terms: deliveryTerms || '',
                };
                if (existingTermsId) {
                    await httpClient.patch(`/api/vendors/terms/${existingTermsId}/`, termsPayload);
                } else {
                    await httpClient.post('/api/vendors/terms/', termsPayload);
                }
            } catch (e) { console.error('Terms save error (non-fatal):', e); }

            showSuccess('Vendor created successfully!');
            onVendorCreated(vendorName, newId!);
        } catch (err: any) {
            console.error('Error saving vendor:', err);
            // Enhanced error parsing for httpClient/axios-style error objects
            let msg = 'Request failed';

            // Check if it's a structured error from httpClient
            if (err.data) {
                const data = err.data;
                if (data.error) msg = typeof data.error === 'string' ? data.error : (data.error.message || JSON.stringify(data.error));
                else if (data.detail) msg = data.detail;
                else if (typeof data === 'object') {
                    // Handle validation errors like {"email": ["..."]}
                    const firstKey = Object.keys(data)[0];
                    if (Array.isArray(data[firstKey])) msg = `${firstKey}: ${data[firstKey][0]}`;
                    else msg = JSON.stringify(data);
                }
            } else if (err.message) {
                msg = err.message;
            }

            showError(`Failed to create vendor: ${msg}`);
        } finally {
            setIsSaving(false);
        }
    };

    /* ─── Styles helpers ───────────────────── */
    const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-[4px] text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400';
    const labelCls = 'block text-xs font-semibold text-gray-600 mb-1 uppercase tracking-wide';
    const sectionTitle = 'text-sm font-bold text-gray-800 uppercase tracking-widest mb-4 pb-2 border-b border-gray-100';

    /* ─── Tab content renderers ────────────── */
    const renderBasic = () => (
        <div className="space-y-5">
            <p className={sectionTitle}>Basic Details</p>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className={labelCls}>Vendor Code</label>
                    <input className={inputCls} value={vendorCode} onChange={e => setVendorCode(e.target.value)} placeholder="Auto-generated" />
                </div>
                <div>
                    <label className={labelCls}>Vendor Name <span className="text-red-500">*</span></label>
                    <input className={inputCls} value={vendorName} onChange={e => setVendorName(e.target.value)} placeholder="Enter vendor name" required />
                </div>
                <div>
                    <label className={labelCls}>Vendor Category <span className="text-red-500">*</span></label>
                    <select className={inputCls} value={vendorCategory} onChange={e => setVendorCategory(e.target.value)}>
                        <option value="">Select Category</option>
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <div>
                    <label className={labelCls}>Billing Currency</label>
                    <select className={inputCls} value={billingCurrency} onChange={e => setBillingCurrency(e.target.value)}>
                        <option value="">Select Currency</option>
                        {BILLING_CURRENCIES.map((c: any) => (
                            <option key={c.code} value={c.code}>{c.code} – {c.name} ({c.symbol})</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className={labelCls}>PAN No.</label>
                    <input className={inputCls} value={panNo} onChange={e => setPanNo(e.target.value.toUpperCase())} placeholder="AAAAA0000A" maxLength={10} />
                </div>
                <div>
                    <label className={labelCls}>Contact Person</label>
                    <input className={inputCls} value={contactPerson} onChange={e => setContactPerson(e.target.value)} placeholder="Primary contact name" />
                </div>
                <div>
                    <label className={labelCls}>Email Address <span className="text-red-500">*</span></label>
                    <input className={inputCls} type="email" value={vendorEmail} onChange={e => setVendorEmail(e.target.value)} placeholder="vendor@example.com" />
                </div>
                <div>
                    <label className={labelCls}>Contact No <span className="text-red-500">*</span></label>
                    <input className={inputCls} type="tel" value={contactNo} onChange={e => { if (/^\d*$/.test(e.target.value)) setContactNo(e.target.value); }} placeholder="+91 XXXXX XXXXX" />
                </div>
            </div>
            <div className="flex items-center gap-10 pt-2">
                <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Is also a Customer?</span>
                    {[true, false].map(v => (
                        <button key={String(v)} type="button" onClick={() => setIsAlsoCustomer(v)}
                            className={`px-5 py-1.5 text-sm border-2 rounded transition-colors ${isAlsoCustomer === v
                                ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-semibold'
                                : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}>
                            {v ? 'Yes' : 'No'}
                        </button>
                    ))}
                </div>
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
                            <label className="block text-sm font-medium text-indigo-700">
                                Link the Vendor to this Customer &lt;{matchingCustomer.customer_code}- {matchingCustomer.customer_name}&gt;?
                            </label>
                            <div className="flex gap-2 mt-2">
                                <button
                                    type="button"
                                    onClick={() => setLinkVendorToCustomer(true)}
                                    className={`px-4 py-1.5 text-xs border rounded transition-colors ${linkVendorToCustomer === true
                                        ? 'border-indigo-600 bg-indigo-600 text-white font-semibold'
                                        : 'border-indigo-300 text-indigo-600 bg-white hover:bg-indigo-50'
                                        }`}
                                >
                                    Yes
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setLinkVendorToCustomer(false)}
                                    className={`px-4 py-1.5 text-xs border rounded transition-colors ${linkVendorToCustomer === false
                                        ? 'border-indigo-600 bg-indigo-600 text-white font-semibold'
                                        : 'border-indigo-300 text-indigo-600 bg-white hover:bg-indigo-50'
                                        }`}
                                >
                                    No
                                </button>
                            </div>
                        </div>
                    ) : customerSearchAttempted && vendorName && panNo ? (
                        <div className="p-4 bg-orange-50 border border-orange-100 rounded-[4px]">
                            <p className="text-xs text-orange-700 mb-1 font-medium italic">No matching customer found in Masters.</p>
                        </div>
                    ) : null}

                    {/* Create Customer Prompt: shown if mismatch or linking declined */}
                    {((matchingCustomer && linkVendorToCustomer === false) || (!matchingCustomer && customerSearchAttempted && vendorName && panNo)) && (
                        <div className="p-4 bg-teal-50 border border-teal-100 rounded-[4px]">
                            <label className="block text-sm font-medium text-teal-700">
                                Create a Customer?
                            </label>
                            <div className="flex gap-2 mt-2">
                                <button
                                    type="button"
                                    onClick={() => setCreateCustomerOption(true)}
                                    className={`px-4 py-1.5 text-xs border rounded transition-colors ${createCustomerOption === true
                                        ? 'border-teal-600 bg-teal-600 text-white font-semibold'
                                        : 'border-teal-300 text-teal-600 bg-white hover:bg-teal-50'
                                        }`}
                                >
                                    Yes
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCreateCustomerOption(false)}
                                    className={`px-4 py-1.5 text-xs border rounded transition-colors ${createCustomerOption === false
                                        ? 'border-teal-600 bg-teal-600 text-white font-semibold'
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
    );

    const renderGST = () => (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <p className={sectionTitle + ' mb-0 border-0'}>GST Details</p>
                <button type="button" onClick={addGstRecord}
                    className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 border border-indigo-300 rounded px-3 py-1.5 transition-colors">
                    + Add GSTIN
                </button>
            </div>
            {gstRecords.map((rec, idx) => (
                <div key={rec.id} className="border border-gray-200 rounded-[4px] overflow-hidden">
                    <div
                        className="flex items-center justify-between px-4 py-3 bg-gray-50 cursor-pointer"
                        onClick={() => toggleGst(rec.id)}>
                        <span className="text-sm font-semibold text-gray-700">
                            GST Record #{idx + 1} {rec.gstin && `– ${rec.gstin}`}
                        </span>
                        <div className="flex items-center gap-2">
                            {gstRecords.length > 1 && (
                                <button type="button" onClick={e => { e.stopPropagation(); removeGstRecord(rec.id); }}
                                    className="text-red-500 hover:text-red-700 text-xs font-semibold">Remove</button>
                            )}
                            <span className="text-gray-400 text-xs">{rec.isExpanded ? '▲' : '▼'}</span>
                        </div>
                    </div>
                    {rec.isExpanded && (
                        <div className="p-4 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={labelCls}>GSTIN</label>
                                    <input className={inputCls} value={rec.gstin}
                                        onChange={e => updateGstField(rec.id, 'gstin', e.target.value.toUpperCase().slice(0, 15))}
                                        placeholder="22AAAAA0000A1Z5" maxLength={15} />
                                </div>
                                <div>
                                    <label className={labelCls}>Registration Type</label>
                                    <select className={inputCls} value={rec.registrationType}
                                        onChange={e => updateGstField(rec.id, 'registrationType', e.target.value)}>
                                        {GST_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className={labelCls}>Legal Name</label>
                                    <input className={inputCls} value={rec.legalName || ''}
                                        onChange={e => updateGstField(rec.id, 'legalName', e.target.value)} placeholder="Legal entity name" />
                                </div>
                                <div>
                                    <label className={labelCls}>Trade Name</label>
                                    <input className={inputCls} value={rec.tradeName || ''}
                                        onChange={e => updateGstField(rec.id, 'tradeName', e.target.value)} placeholder="Trade / brand name" />
                                </div>
                            </div>
                            {/* Places of Business */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Places of Business</span>
                                    <button type="button" onClick={() => addPob(rec.id)}
                                        className="text-xs text-indigo-600 font-semibold border border-indigo-200 rounded px-2 py-1 hover:bg-indigo-50">
                                        + Add Branch
                                    </button>
                                </div>
                                {rec.placesOfBusiness.length === 0 && (
                                    <p className="text-xs text-gray-400 italic">No branches added yet.</p>
                                )}
                                {rec.placesOfBusiness.map((pob, pi) => (
                                    <div key={pob.id} className="border border-gray-100 rounded-[4px] p-3 mb-2 bg-gray-50/50">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs font-semibold text-gray-600">Branch {pi + 1}</span>
                                            <button type="button" onClick={() => removePob(rec.id, pob.id)}
                                                className="text-xs text-red-500 hover:text-red-700 font-semibold">Remove</button>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className={labelCls}>Reference Name</label>
                                                <input className={inputCls} value={pob.referenceName}
                                                    onChange={e => updatePob(rec.id, pob.id, 'referenceName', e.target.value)} placeholder="e.g. Main Branch" />
                                            </div>
                                            <div>
                                                <label className={labelCls}>Address</label>
                                                <input className={inputCls} value={pob.address}
                                                    onChange={e => updatePob(rec.id, pob.id, 'address', e.target.value)} placeholder="Branch address" />
                                            </div>
                                            <div>
                                                <label className={labelCls}>Contact Person</label>
                                                <input className={inputCls} value={pob.contactPerson}
                                                    onChange={e => updatePob(rec.id, pob.id, 'contactPerson', e.target.value)} placeholder="Contact person" />
                                            </div>
                                            <div>
                                                <label className={labelCls}>Email</label>
                                                <input className={inputCls} type="email" value={pob.email}
                                                    onChange={e => updatePob(rec.id, pob.id, 'email', e.target.value)} placeholder="email@example.com" />
                                            </div>
                                            <div className="col-span-2">
                                                <label className={labelCls}>Contact Number</label>
                                                <input className={inputCls} value={pob.contactNumber}
                                                    onChange={e => updatePob(rec.id, pob.id, 'contactNumber', e.target.value)} placeholder="Phone number" />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );

    const renderProducts = () => (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <p className={sectionTitle + ' mb-0 border-0'}>Products / Services</p>
                <button type="button" onClick={addItem}
                    className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 border border-indigo-300 rounded px-3 py-1.5">
                    + Add Item
                </button>
            </div>
            <div className="border border-gray-200 rounded-[4px] overflow-hidden">
                <div className="grid grid-cols-[2rem_1fr_1fr_1fr_1fr_1fr_2rem] bg-indigo-600 text-white text-xs font-semibold">
                    {['#', 'HSN/SAC', 'Item Code', 'Item Name', 'Supplier Code', 'Supplier Name', ''].map((h, i) => (
                        <div key={i} className="px-2 py-2 truncate">{h}</div>
                    ))}
                </div>
                {items.map((item, idx) => (
                    <div key={item.id} className={`grid grid-cols-[2rem_1fr_1fr_1fr_1fr_1fr_2rem] items-center border-t ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                        <div className="px-2 py-1.5 text-center text-xs text-gray-400">{idx + 1}</div>
                        {([
                            ['hsnSacCode', 'HSN/SAC', 8],
                            ['itemCode', 'Item Code', 50],
                            ['itemName', 'Item Name', 100],
                            ['supplierItemCode', 'Supplier Code', 50],
                            ['supplierItemName', 'Supplier Name', 100],
                        ] as [keyof VendorItem, string, number][]).map(([field, placeholder, maxLen]) => (
                            <div key={field} className="px-1.5 py-1">
                                <input
                                    type="text"
                                    value={item[field] as string}
                                    onChange={e => updateItem(item.id, field, e.target.value)}
                                    placeholder={placeholder}
                                    maxLength={maxLen}
                                    className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:border-indigo-400 bg-transparent"
                                />
                            </div>
                        ))}
                        <div className="px-1 flex justify-center">
                            <button type="button" onClick={() => removeItem(item.id)}
                                disabled={items.length === 1}
                                className="text-red-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed">
                                ✕
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    const renderTDS = () => (
        <div className="space-y-5">
            <p className={sectionTitle}>TDS & Other Statutory Details</p>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className={labelCls}>MSME / UDYAM No. (UDHYAM-TN-0123456)</label>
                    <div className="flex gap-2">
                        <input className={`${inputCls} flex-1`}
                            value={msmeUdyamNo}
                            onChange={e => setMsmeUdyamNo(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))}
                            placeholder="UDHYAM-TN-0123456" />
                        <input type="file" id="modal-msme-upload" className="hidden" accept=".pdf,.jpg,.jpeg,.png"
                            onChange={e => handleFileUpload('msmeFile', e.target.files?.[0] || null)} />
                        <button type="button" onClick={() => document.getElementById('modal-msme-upload')?.click()}
                            className="px-2 py-1 bg-gray-100 border border-gray-300 rounded hover:bg-gray-200">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                        </button>
                    </div>
                    {uploadedFiles.msmeFile && <p className="text-[10px] text-indigo-600 truncate mt-0.5">{uploadedFiles.msmeFile.name}</p>}
                </div>
                <div>
                    <label className={labelCls}>FSSAI License No. (14 digits)</label>
                    <div className="flex gap-2">
                        <input className={`${inputCls} flex-1`}
                            value={fssaiLicenseNo}
                            onChange={e => {
                                const val = e.target.value.replace(/[^0-9]/g, '');
                                if (val.length <= 14) setFssaiLicenseNo(val);
                            }}
                            maxLength={14}
                            placeholder="14-digit numeric code" />
                        <input type="file" id="modal-fssai-upload" className="hidden" accept=".pdf,.jpg,.jpeg,.png"
                            onChange={e => handleFileUpload('fssaiFile', e.target.files?.[0] || null)} />
                        <button type="button" onClick={() => document.getElementById('modal-fssai-upload')?.click()}
                            className="px-2 py-1 bg-gray-100 border border-gray-300 rounded hover:bg-gray-200">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                        </button>
                    </div>
                    {uploadedFiles.fssaiFile && <p className="text-[10px] text-indigo-600 truncate mt-0.5">{uploadedFiles.fssaiFile.name}</p>}
                </div>
                <div>
                    <label className={labelCls}>Import / Export Code (IEC)</label>
                    <div className="flex gap-2">
                        <input className={`${inputCls} flex-1`}
                            value={importExportCode}
                            onChange={e => {
                                const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                                if (val.length <= 10) setImportExportCode(val);
                            }}
                            maxLength={10}
                            placeholder="ABCDE1234F" />
                        <input type="file" id="modal-iec-upload" className="hidden" accept=".pdf,.jpg,.jpeg,.png"
                            onChange={e => handleFileUpload('iecFile', e.target.files?.[0] || null)} />
                        <button type="button" onClick={() => document.getElementById('modal-iec-upload')?.click()}
                            className="px-2 py-1 bg-gray-100 border border-gray-300 rounded hover:bg-gray-200">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                        </button>
                    </div>
                    {uploadedFiles.iecFile && <p className="text-[10px] text-indigo-600 truncate mt-0.5">{uploadedFiles.iecFile.name}</p>}
                </div>
                <div>
                    <label className={labelCls}>EOU Status</label>
                    <select className={inputCls} value={eouStatus} onChange={e => setEouStatus(e.target.value)}>
                        <option value="">Select Status</option>
                        <option value="EOU">EOU (Export Oriented Unit)</option>
                        <option value="STPI">STPI Unit</option>
                        <option value="SEZ">SEZ Unit</option>
                        <option value="Non-EOU">Non-EOU</option>
                    </select>
                </div>
                <div>
                    <label className={labelCls}>TDS Section Applicable</label>
                    <select className={inputCls} value={tdsSectionApplicable} onChange={e => setTdsSectionApplicable(e.target.value)}>
                        <option value="">None</option>
                        {TDS_SECTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
                <div className="flex items-center gap-3 pt-5">
                    <input type="checkbox" id="autoTds" checked={enableAutoTds} onChange={e => setEnableAutoTds(e.target.checked)}
                        className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500" />
                    <label htmlFor="autoTds" className="text-sm text-gray-700 font-medium cursor-pointer">Enable Automatic {tcsApplicable ? 'TCS' : 'TDS'} Posting</label>
                </div>
            </div>
        </div>
    );

    const renderBanking = () => (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <p className={sectionTitle + ' mb-0 border-0'}>Banking Information</p>
                <button type="button" onClick={addBank}
                    className="flex items-center gap-1 text-xs font-semibold text-indigo-600 border border-indigo-300 rounded px-3 py-1.5 hover:bg-indigo-50">
                    + Add Bank Account
                </button>
            </div>
            {bankAccounts.map((bank, idx) => (
                <div key={bank.id} className="border border-gray-200 rounded-[4px] p-4 space-y-3">
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-gray-600 uppercase tracking-wider">Account {idx + 1}</span>
                        {bankAccounts.length > 1 && (
                            <button type="button" onClick={() => removeBank(bank.id)}
                                className="text-xs text-red-500 hover:text-red-700 font-semibold">Remove</button>
                        )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className={labelCls}>Account Number</label>
                            <input className={inputCls} value={bank.accountNumber}
                                onChange={e => updateBank(bank.id, 'accountNumber', e.target.value)} placeholder="Account number" />
                        </div>
                        <div>
                            <label className={labelCls}>Account Type</label>
                            <select className={inputCls} value={bank.accountType}
                                onChange={e => updateBank(bank.id, 'accountType', e.target.value)}>
                                <option value="Savings">Savings</option>
                                <option value="Current">Current</option>
                            </select>
                        </div>
                        <div>
                            <label className={labelCls}>Bank Name</label>
                            <input className={inputCls} value={bank.bankName}
                                onChange={e => updateBank(bank.id, 'bankName', e.target.value)} placeholder="e.g. HDFC Bank" />
                        </div>
                        <div>
                            <label className={labelCls}>IFSC Code</label>
                            <input className={inputCls} value={bank.ifscCode}
                                onChange={e => updateBank(bank.id, 'ifscCode', e.target.value.toUpperCase())} placeholder="HDFC0001234" maxLength={11} />
                        </div>
                        <div>
                            <label className={labelCls}>Branch Name</label>
                            <input className={inputCls} value={bank.branchName}
                                onChange={e => updateBank(bank.id, 'branchName', e.target.value)} placeholder="Branch name" />
                        </div>
                        <div>
                            <label className={labelCls}>SWIFT Code</label>
                            <input className={inputCls} value={bank.swiftCode}
                                onChange={e => updateBank(bank.id, 'swiftCode', e.target.value.toUpperCase())} placeholder="HDFCINBB" maxLength={11} />
                        </div>
                        <div className="col-span-2">
                            <label className={labelCls}>Associate to a vendor branch</label>
                            <div className="relative">
                                <button
                                    type="button"
                                    className={inputCls + " w-full text-left flex justify-between items-center"}
                                    onClick={() => {
                                        const dropdown = document.getElementById(`vendor-branch-dropdown-${bank.id}`);
                                        if (dropdown) dropdown.classList.toggle('hidden');
                                    }}
                                >
                                    <span className="truncate">
                                        {bank.vendorBranch && bank.vendorBranch.length > 0
                                            ? `${bank.vendorBranch.length} Selected`
                                            : "Select vendor branch"}
                                    </span>
                                    <ChevronDown className="w-4 h-4 text-gray-500" />
                                </button>

                                <div
                                    id={`vendor-branch-dropdown-${bank.id}`}
                                    className="hidden absolute z-[100] mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm"
                                >
                                    {(() => {
                                        const allBranches = [...new Set(
                                            (gstRecords || []).flatMap((record, rIdx) => {
                                                const branches = (record?.placesOfBusiness || [])
                                                    .map((pob, pIdx) => {
                                                        const name = (pob.referenceName || '').trim();
                                                        return name || `Branch ${pIdx + 1} (${record.gstin || 'New GST'})`;
                                                    })
                                                    .filter(name => name !== '');

                                                if (branches.length === 0) {
                                                    return [record.gstin || record.tradeName || `GST Detail #${rIdx + 1}`];
                                                }
                                                return branches;
                                            })
                                        )];

                                        if (allBranches.length === 0) {
                                            return <div className="px-4 py-2 text-gray-500 text-xs italic">No branch reference names found.</div>;
                                        }

                                        return allBranches.map((branchName, bIdx) => {
                                            const isSelected = (bank.vendorBranch || []).includes(branchName);
                                            return (
                                                <div key={bIdx} className="flex items-center px-4 py-2 hover:bg-gray-100 cursor-pointer"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const current = bank.vendorBranch || [];
                                                        const next = isSelected
                                                            ? current.filter(b => b !== branchName)
                                                            : [...current, branchName];
                                                        updateBank(bank.id, 'vendorBranch', next);
                                                    }}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        readOnly
                                                        className="h-4 w-4 text-indigo-600 border-gray-300 rounded mr-3"
                                                    />
                                                    <span className="text-gray-900">{branchName}</span>
                                                </div>
                                            );
                                        });
                                    })()}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );

    const renderTerms = () => (
        <div className="space-y-5">
            <p className={sectionTitle}>Terms & Conditions</p>
            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className={labelCls}>Credit Limit (₹)</label>
                    <input className={inputCls} type="number" min="0" value={creditLimit}
                        onChange={e => setCreditLimit(e.target.value)} placeholder="e.g. 500000" />
                </div>
                <div>
                    <label className={labelCls}>Credit Period (Days)</label>
                    <input className={inputCls} type="number" min="0" value={creditPeriod}
                        onChange={e => setCreditPeriod(e.target.value)} placeholder="e.g. 30" />
                </div>
            </div>
            <div>
                <label className={labelCls}>Credit Terms</label>
                <textarea className={inputCls + ' resize-none'} rows={2} value={creditTerms}
                    onChange={e => setCreditTerms(e.target.value)} placeholder="Describe credit terms..." />
            </div>
            <div>
                <label className={labelCls}>Penalty Terms</label>
                <textarea className={inputCls + ' resize-none'} rows={2} value={penaltyTerms}
                    onChange={e => setPenaltyTerms(e.target.value)} placeholder="Describe penalty terms..." />
            </div>
            <div>
                <label className={labelCls}>Delivery Terms</label>
                <textarea className={inputCls + ' resize-none'} rows={2} value={deliveryTerms}
                    onChange={e => setDeliveryTerms(e.target.value)} placeholder="Describe delivery terms..." />
            </div>
        </div>
    );

    const renderContent = () => {
        switch (activeTab) {
            case 'basic': return renderBasic();
            case 'gst': return renderGST();
            case 'products': return renderProducts();
            case 'tds': return renderTDS();
            case 'banking': return renderBanking();
            case 'terms': return renderTerms();
        }
    };

    const currentTabIdx = TABS.findIndex(t => t.id === activeTab);

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-[8px] shadow-2xl w-full max-w-7xl flex flex-col"
                style={{ maxHeight: '92vh' }}>

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b bg-indigo-600 rounded-t-[8px] flex-shrink-0">
                    <div>
                        <h2 className="text-lg font-bold text-white">Create New Vendor</h2>
                        <p className="text-indigo-200 text-xs mt-0.5">Fill in the details below. All sections will be saved together.</p>
                    </div>
                    <button onClick={onClose} className="text-white/70 hover:text-white transition-colors text-xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10">
                        ✕
                    </button>
                </div>

                {/* Tab Bar */}
                <div className="flex border-b flex-shrink-0 overflow-x-auto bg-gray-50">
                    {TABS.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-5 py-3 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${activeTab === tab.id
                                ? 'border-indigo-600 text-indigo-600 bg-white'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {renderContent()}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50 flex-shrink-0 rounded-b-[8px]">
                    <div className="flex gap-2">
                        {currentTabIdx > 0 && (
                            <button type="button" onClick={() => setActiveTab(TABS[currentTabIdx - 1].id)}
                                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-[4px] hover:bg-gray-100 transition-colors">
                                ← Back
                            </button>
                        )}
                    </div>
                    <div className="flex gap-3">
                        <button type="button" onClick={onClose}
                            className="px-5 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-[4px] hover:bg-gray-100 transition-colors">
                            Cancel
                        </button>
                        {currentTabIdx < TABS.length - 1 ? (
                            <button type="button" onClick={() => setActiveTab(TABS[currentTabIdx + 1].id)}
                                className="px-8 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-[4px] transition-colors flex items-center justify-center min-w-[120px]">
                                Next →
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={handleFinish}
                                disabled={isSaving}
                                className="px-8 py-2 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed rounded-[4px] transition-colors flex items-center gap-2 min-w-[140px] justify-center shadow-md">
                                {isSaving ? (
                                    <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" /> Saving…</>
                                ) : 'SAVE VENDOR'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CreateNewVendorFullModal;
