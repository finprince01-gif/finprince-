import React, { useState, useEffect } from 'react';
import {
    X, Mail, Phone, MapPin, CreditCard,
    FileText, CheckCircle, Info,
    ExternalLink, User, ShoppingBag, Truck, Calendar, Clock
} from 'lucide-react';
import Landmark from 'lucide-react/dist/esm/icons/landmark';
import ShieldCheck from 'lucide-react/dist/esm/icons/shield-check';
import { httpClient } from '../../services/httpClient';
import { handleApiError } from '../../utils/errorHandler';
import Icon from '../../components/Icon';

interface CustomerViewModalProps {
    customer: any;
    onClose: () => void;
}

const CustomerViewModal: React.FC<CustomerViewModalProps> = ({ customer, onClose }) => {
    const [activeTab, setActiveTab] = useState<'basic' | 'gst' | 'products' | 'statutory' | 'banking' | 'terms'>('basic');
    const [localCustomer, setLocalCustomer] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!customer) {
            setLocalCustomer(null);
            setLoading(false);
            return;
        }

        if (typeof customer === 'object') {
            setLocalCustomer(customer);
            setLoading(false);
        } else {
            // It is an ID (number or string)
            const fetchCustomer = async () => {
                setLoading(true);
                try {
                    const [fullCustomer, categoriesRes] = await Promise.all([
                        httpClient.get<any>(`/api/customerportal/customer-master/${customer}/`),
                        httpClient.get<any[]>('/api/customerportal/categories/').catch(() => [])
                    ]);
                    
                    let resolvedCategoryName = '';
                    if (fullCustomer?.customer_category_name) {
                        resolvedCategoryName = fullCustomer.customer_category_name;
                    } else if (categoriesRes.length > 0 && fullCustomer?.customer_category) {
                        const cat = categoriesRes.find((c: any) => c.id === fullCustomer.customer_category);
                        if (cat) resolvedCategoryName = cat.full_path || cat.category;
                    }
                    
                    setLocalCustomer({ ...fullCustomer, customer_category_name: resolvedCategoryName });
                } catch (error) {
                    handleApiError(error, 'Fetch Customer Details');
                } finally {
                    setLoading(false);
                }
            };
            fetchCustomer();
        }
    }, [customer]);

    if (loading) {
        return (
            <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-4 animate-pulse">
                    <Icon name="loader" className="w-12 h-12 text-indigo-600 animate-spin" />
                    <p className="text-gray-600 font-medium">Preparing Customer Profile...</p>
                </div>
            </div>
        );
    }

    const displayCustomer = localCustomer;
    if (!displayCustomer) return null;

    const renderBasicInfo = () => (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="space-y-6">
                <div className="section-card bg-slate-50 border border-slate-100 p-6 rounded-xl hover:shadow-md transition-shadow">
                    <h3 className="flex items-center gap-2 text-slate-800 font-bold mb-6 border-b border-slate-200 pb-3">
                        <ShoppingBag className="w-5 h-5 text-indigo-600" />
                        Basic Information
                    </h3>
                    <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-4">
                        <div className="col-span-2 sm:col-span-1">
                            <dt className="text-xs uppercase tracking-wider text-slate-400 font-bold mb-1">Customer Code</dt>
                            <dd className="text-slate-900 font-semibold">{displayCustomer.customer_code || displayCustomer.code || 'N/A'}</dd>
                        </div>
                        <div className="col-span-2 sm:col-span-1">
                            <dt className="text-xs uppercase tracking-wider text-slate-400 font-bold mb-1">Status</dt>
                            <dd>
                                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                                    (displayCustomer.status || 'Live') === 'Live' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                                }`}>
                                    {(displayCustomer.status || 'Live') === 'Live' ? <CheckCircle className="w-3 h-3" /> : <X className="w-3 h-3" />}
                                    {String(displayCustomer.status || 'Live').toUpperCase()}
                                </span>
                            </dd>
                        </div>
                        <div className="col-span-2">
                            <dt className="text-xs uppercase tracking-wider text-slate-400 font-bold mb-1">Category</dt>
                            <dd className="text-slate-900 font-semibold">{displayCustomer.customer_category_name || displayCustomer.category_name || displayCustomer.category || 'N/A'}</dd>
                        </div>
                        <div className="col-span-2 sm:col-span-1">
                            <dt className="text-xs uppercase tracking-wider text-slate-400 font-bold mb-1">Billing Currency</dt>
                            <dd className="text-slate-900 font-semibold">{displayCustomer.billing_currency || 'INR'}</dd>
                        </div>
                        <div className="col-span-2 sm:col-span-1 border-l-2 border-indigo-100 pl-4">
                            <dt className="text-xs uppercase tracking-wider text-slate-400 font-bold mb-1">PAN No.</dt>
                            <dd className="text-slate-900 font-bold tracking-widest">{displayCustomer.pan_number || displayCustomer.pan_no || 'N/A'}</dd>
                        </div>
                    </dl>
                </div>

                <div className="section-card bg-slate-50 border border-slate-100 p-6 rounded-xl hover:shadow-md transition-shadow">
                    <h3 className="flex items-center gap-2 text-slate-800 font-bold mb-6 border-b border-slate-200 pb-3">
                        <Info className="w-5 h-5 text-indigo-600" />
                        System Metadata
                    </h3>
                    <div className="grid grid-cols-2 gap-4 text-xs font-medium text-slate-500">
                        <div>CREATED AT: {displayCustomer.created_at ? new Date(displayCustomer.created_at).toLocaleDateString() : 'N/A'}</div>
                        <div>LAST UPDATED: {displayCustomer.updated_at ? new Date(displayCustomer.updated_at).toLocaleDateString() : 'N/A'}</div>
                        <div className="col-span-2 flex items-center gap-4 pt-2">
                            <label className="flex items-center gap-2 cursor-default">
                                <input type="checkbox" checked={displayCustomer.is_also_vendor || false} readOnly className="rounded border-slate-300 text-indigo-600 focus:ring-0" />
                                <span>ALSO A VENDOR</span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                <div className="section-card bg-slate-50 border border-slate-100 p-6 rounded-xl hover:shadow-md transition-shadow h-full">
                    <h3 className="flex items-center gap-2 text-slate-800 font-bold mb-6 border-b border-slate-200 pb-3">
                        <User className="w-5 h-5 text-indigo-600" />
                        Contact Presence
                    </h3>
                    <div className="space-y-8">
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-white rounded-xl shadow-sm border border-slate-200 text-indigo-600">
                                <MapPin className="w-6 h-6" />
                            </div>
                            <div>
                                <dt className="text-xs uppercase tracking-wider text-slate-400 font-bold mb-1">Primary Contact</dt>
                                <dd className="text-slate-900 font-bold text-lg">{displayCustomer.contact_person || 'N/A'}</dd>
                            </div>
                        </div>

                        <div className="space-y-4 pt-4 border-t border-slate-200 border-dashed">
                            <div className="flex items-center gap-4 group">
                                <Mail className="w-5 h-5 text-slate-400 group-hover:text-indigo-600" />
                                <span className="text-slate-700 font-medium group-hover:text-slate-900 transition-colors">{displayCustomer.email_address || displayCustomer.email || 'N/A'}</span>
                            </div>
                            <div className="flex items-center gap-4 group">
                                <Phone className="w-5 h-5 text-slate-400 group-hover:text-indigo-600" />
                                <span className="text-slate-700 font-medium group-hover:text-slate-900 transition-colors">{displayCustomer.contact_number || displayCustomer.contact_no || 'N/A'}</span>
                            </div>
                            {displayCustomer.address && (
                                <div className="flex items-start gap-4 group pt-2">
                                    <MapPin className="w-5 h-5 text-slate-400 group-hover:text-indigo-600 mt-1" />
                                    <span className="text-slate-700 leading-relaxed group-hover:text-slate-900 transition-colors">{displayCustomer.address}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );

    const renderGSTInfo = () => {
        const gstData = displayCustomer.gst_details || {};
        const branches = gstData.branches || [];
        const gstins = gstData.gstins || [];

        return (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {gstins.length === 0 && branches.length === 0 ? (
                    <div className="p-20 text-center bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl">
                        <FileText className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                        <p className="text-slate-400 font-bold uppercase tracking-widest text-sm">No Branch Details Linked</p>
                    </div>
                ) : (
                    <>
                        {gstins.length > 0 && (
                            <div className="bg-indigo-50/50 border border-indigo-100 p-6 rounded-2xl flex items-center justify-between shadow-sm">
                                <div>
                                    <span className="text-indigo-600 text-xs font-black tracking-[0.2em] uppercase mb-1 block">Identification</span>
                                    <h4 className="text-indigo-950 text-xl font-bold tracking-wider">GST Registered Customer</h4>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {gstins.map((gst: string, idx: number) => (
                                        <span key={idx} className="px-4 py-1.5 bg-indigo-100 text-indigo-700 border border-indigo-200 text-[10px] font-black tracking-widest uppercase rounded-lg">
                                            {gst}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {branches.map((record: any, idx: number) => (
                            <div key={idx} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                                <div className="bg-slate-50 border-b border-slate-100 p-6 flex items-center justify-between">
                                    <div>
                                        <span className="text-indigo-600 text-xs font-black tracking-[0.2em] uppercase mb-1 block">Branch {idx + 1}</span>
                                        <h4 className="text-slate-800 text-xl font-bold tracking-wider">{record.defaultRef || `Branch ${idx + 1}`}</h4>
                                    </div>
                                    {record.gstin && (
                                        <span className="px-4 py-1.5 bg-indigo-50 border border-indigo-100 text-indigo-700 text-[10px] font-black tracking-widest uppercase rounded-lg font-mono">
                                            {record.gstin}
                                        </span>
                                    )}
                                </div>

                                <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-12">
                                    <div className="space-y-8">
                                        <div>
                                            <dt className="text-xs uppercase tracking-wider text-slate-400 font-bold mb-2">Contact Person</dt>
                                            <dd className="text-slate-900 font-bold text-lg leading-snug">{record.contactPerson || 'N/A'}</dd>
                                        </div>
                                        <div>
                                            <dt className="text-xs uppercase tracking-wider text-slate-400 font-bold mb-2">Email Address</dt>
                                            <dd className="text-slate-900 font-medium text-lg leading-snug">{record.email || 'N/A'}</dd>
                                        </div>
                                    </div>

                                    <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 flex flex-col justify-center">
                                        <h5 className="text-[10px] font-black text-slate-400 tracking-[0.2em] mb-4 uppercase border-b border-slate-200 pb-2 flex justify-between items-center">
                                            Place of Business
                                            <MapPin className="w-3 h-3" />
                                        </h5>
                                        <div className="text-slate-700 font-semibold leading-relaxed mb-4">
                                            <div className="text-sm">
                                                {[
                                                    record.addressLine1,
                                                    record.addressLine2,
                                                    record.addressLine3
                                                ].filter(Boolean).join(', ') || record.address || 'Address information not provided.'}
                                            </div>
                                            <div className="text-xs text-slate-500 mt-2">
                                                {[record.city, record.state, record.country].filter(Boolean).join(', ')}
                                                {record.pincode && ` - ${record.pincode}`}
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4 border-t border-slate-200 pt-4 mt-2">
                                            <div>
                                                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest block mb-1">Phone</span>
                                                <span className="text-xs text-slate-900 font-bold">{record.contactNumber || 'N/A'}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </>
                )}
            </div>
        );
    };

    const renderItemsInfo = () => {
        const items = displayCustomer.products_services?.items || [];
        return (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {items.length === 0 ? (
                    <div className="p-20 text-center bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl">
                        <ShoppingBag className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                        <p className="text-slate-400 font-bold uppercase tracking-widest text-sm">No Products or Services Defined</p>
                    </div>
                ) : (
                    <div className="overflow-hidden border border-slate-200 rounded-2xl shadow-sm bg-white">
                        <table className="min-w-full divide-y divide-slate-200">
                            <thead>
                                <tr className="bg-slate-50">
                                    <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Item Detail</th>
                                    <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Codes</th>
                                    <th className="px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Customer Reference</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {items.map((item: any, idx: number) => (
                                    <tr key={idx} className="hover:bg-indigo-50/20 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-slate-900 font-bold text-sm group-hover:text-indigo-600 transition-colors">{item.itemName}</span>
                                                <span className="text-slate-400 text-xs">UOM: {item.uom || 'N/A'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col items-center gap-1">
                                                <span className="px-3 py-1 bg-indigo-50 text-indigo-700 font-black text-[10px] rounded border border-indigo-100 tracking-tighter w-full text-center">Internal Code: {item.itemCode || '---'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-slate-700 font-semibold text-sm">{item.custItemName || 'N/A'}</span>
                                                <span className="text-slate-400 text-[10px]">{item.custItemCode || 'No Customer Code'}</span>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        );
    };

    const renderLegalInfo = () => (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="section-card bg-white border border-slate-200 p-8 rounded-2xl shadow-sm space-y-8">
                <h3 className="text-indigo-600 text-xs font-black tracking-[0.2em] uppercase border-b border-slate-100 pb-4 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5" />
                    Taxation & Compliance
                </h3>

                <div className="space-y-6">
                    <div className="flex justify-between items-center p-4 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="flex flex-col">
                            <span className="text-slate-500 font-bold text-xs uppercase tracking-wider">TCS Status</span>
                            <span className="text-xs text-slate-400 mt-0.5">{displayCustomer.tcs_section && displayCustomer.tcs_section.split('|')[1]}</span>
                        </div>
                        <span className={`px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider ${displayCustomer.tcs_enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                            {displayCustomer.tcs_enabled ? 'Enabled' : 'Disabled'}
                        </span>
                    </div>

                    {displayCustomer.tcs_enabled && displayCustomer.tcs_section && (
                        <div className="flex justify-between items-center p-4 bg-slate-50 rounded-xl border border-slate-100">
                            <span className="text-slate-500 font-bold text-xs uppercase tracking-wider">TCS Section</span>
                            <span className="text-indigo-700 font-black tracking-tight">{displayCustomer.tcs_section.split('|')[0]}</span>
                        </div>
                    )}

                    <div className="flex justify-between items-center p-4 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="flex flex-col">
                            <span className="text-slate-500 font-bold text-xs uppercase tracking-wider">TDS Status</span>
                            <span className="text-xs text-slate-400 mt-0.5">{displayCustomer.tds_section && displayCustomer.tds_section.split('|')[1]}</span>
                        </div>
                        <span className={`px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider ${displayCustomer.tds_enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                            {displayCustomer.tds_enabled ? 'Enabled' : 'Disabled'}
                        </span>
                    </div>

                    {displayCustomer.tds_enabled && displayCustomer.tds_section && (
                        <div className="flex justify-between items-center p-4 bg-slate-50 rounded-xl border border-slate-100">
                            <span className="text-slate-500 font-bold text-xs uppercase tracking-wider">TDS Section</span>
                            <span className="text-indigo-700 font-black tracking-tight">{displayCustomer.tds_section.split('|')[0]}</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="section-card bg-white border border-slate-200 p-8 rounded-2xl shadow-sm space-y-8">
                <h3 className="text-indigo-600 text-xs font-black tracking-[0.2em] uppercase border-b border-slate-100 pb-4 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5" />
                    Statutory Registrations
                </h3>

                <div className="grid grid-cols-1 gap-4">
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">MSME Udyam No.</span>
                        <span className="text-slate-900 font-bold py-2 border-b border-slate-50">{displayCustomer.msme_no || 'NOT REGISTERED'}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">FSSAI License No.</span>
                        <span className="text-slate-900 font-bold py-2 border-b border-slate-50">{displayCustomer.fssai_no || 'NOT APPLICABLE'}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Import/Export Code (IEC)</span>
                        <span className="text-slate-900 font-bold py-2 border-b border-slate-50">{displayCustomer.iec_code || 'N/A'}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">EOU Status</span>
                        <span className="text-slate-900 font-bold py-2 border-b border-slate-50">{displayCustomer.eou_status || 'NOT APPLICABLE'}</span>
                    </div>
                </div>
            </div>
        </div>
    );

    const renderBankingInfo = () => {
        const accounts = displayCustomer.banking_info?.accounts || [];
        return (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {accounts.length === 0 ? (
                    <div className="p-20 text-center bg-slate-50 border-2 border-dashed border-slate-200 rounded-2xl">
                        <CreditCard className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                        <p className="text-slate-400 font-bold uppercase tracking-widest text-sm">No Banking Accounts Linked</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {accounts.map((bank: any, idx: number) => (
                            <div key={idx} className="relative overflow-hidden bg-gradient-to-br from-indigo-600 to-indigo-900 rounded-[2rem] p-8 shadow-2xl group border border-white/5">
                                <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                                    <CreditCard className="w-32 h-32 text-white" />
                                </div>

                                <div className="relative z-10 flex flex-col h-full justify-between gap-12">
                                    <div className="flex justify-between items-start">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-indigo-300 text-[10px] font-black uppercase tracking-widest">{bank.accountType || 'Current Account'}</span>
                                            <h4 className="text-white text-xl font-bold tracking-tight">{bank.bankName}</h4>
                                        </div>
                                        <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-md">
                                            <Landmark className="w-6 h-6 text-white" />
                                        </div>
                                    </div>

                                    <div>
                                        <span className="text-indigo-300 text-[10px] font-bold uppercase tracking-widest block mb-2 opacity-60">Account Number</span>
                                        <div className="text-white text-2xl font-mono tracking-[0.2em]">{bank.accountNumber}</div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 border-t border-white/10 pt-6">
                                        <div>
                                            <span className="text-[10px] text-white/40 font-bold uppercase tracking-widest block mb-1">IFSC Code</span>
                                            <span className="text-sm text-white font-bold font-mono tracking-widest">{bank.ifscCode}</span>
                                        </div>
                                        <div>
                                            <span className="text-[10px] text-white/40 font-bold uppercase tracking-widest block mb-1">Branch</span>
                                            <span className="text-sm text-white font-bold truncate block">{bank.branchName || 'N/A'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    const renderTermsInfo = () => (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="md:col-span-2 section-card bg-indigo-600 rounded-2xl p-8 flex flex-col md:flex-row items-center justify-between gap-8 text-white shadow-xl">
                <div className="flex items-center gap-6">
                    <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md">
                        <FileText className="w-8 h-8" />
                    </div>
                    <div>
                        <h4 className="text-xl font-bold mb-1 tracking-tight">Financial Agreement Summary</h4>
                        <p className="text-indigo-100 text-sm font-medium">Core credit and penalty terms agreed with customer.</p>
                    </div>
                </div>
                <div className="flex gap-4">
                    <div className="px-6 py-4 bg-white/10 rounded-2xl backdrop-blur-md text-center border border-white/10">
                        <span className="text-[10px] font-black text-indigo-200 uppercase tracking-widest block mb-1">Credit Days</span>
                        <span className="text-2xl font-black">{displayCustomer.credit_period || '0'}</span>
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm">
                    <h4 className="text-xs font-black text-indigo-400 uppercase tracking-widest mb-4 border-b border-slate-50 pb-2">Credit Terms</h4>
                    <p className="text-sm text-indigo-900 leading-relaxed italic">{displayCustomer.credit_terms || 'Standard credit terms applied.'}</p>
                </div>
                <div className="p-6 bg-rose-50 border border-rose-100 rounded-2xl shadow-sm">
                    <h4 className="text-xs font-black text-rose-400 uppercase tracking-widest mb-4 border-b border-rose-100 pb-2">Penalty Clause</h4>
                    <p className="text-sm text-rose-700 leading-relaxed">{displayCustomer.penalty_terms || 'No specific penalty clauses defined.'}</p>
                </div>
            </div>

            <div className="space-y-6">
                <div className="p-6 bg-white border border-slate-200 rounded-2xl shadow-sm h-full">
                    <h4 className="text-xs font-black text-indigo-400 uppercase tracking-widest mb-4 border-b border-slate-50 pb-2">Other Notes/Conditions</h4>
                    <ul className="space-y-4 pt-2">
                        {[
                            { label: 'Delivery Terms', val: displayCustomer.delivery_terms },
                            { label: 'Warranty/Guarantee', val: displayCustomer.warranty_details },
                            { label: 'Force Majeure', val: displayCustomer.force_majeure },
                            { label: 'Dispute Redressal', val: displayCustomer.dispute_terms }
                        ].filter(t => t.val).map((t, idx) => (
                            <li key={idx} className="flex flex-col gap-1">
                                <span className="text-[10px] font-black text-indigo-500 uppercase tracking-tighter">{t.label}</span>
                                <span className="text-xs text-indigo-900 leading-snug">{t.val}</span>
                            </li>
                        ))}
                        {!displayCustomer.delivery_terms && !displayCustomer.warranty_details && !displayCustomer.force_majeure && !displayCustomer.dispute_terms && (
                            <li className="text-slate-400 text-xs italic py-10 text-center">No additional terms specified.</li>
                        )}
                    </ul>
                </div>
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 lg:p-10">
            <div className="bg-[#FAF9F6] w-full h-full max-w-7xl rounded-3xl overflow-hidden shadow-2xl flex flex-col border border-white/20 animate-in zoom-in-95 duration-300">
                {/* Header Section */}
                <header className="bg-white px-8 pt-8 pb-4 border-b border-slate-200 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-2 h-full bg-indigo-600"></div>

                    <div className="flex justify-between items-start mb-6">
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-600 text-[10px] font-black tracking-widest uppercase rounded">Customer Profile</span>
                                <span className="text-indigo-400 text-xs font-bold font-mono">#{displayCustomer.id}</span>
                            </div>
                            <h2 className="text-3xl font-black text-indigo-950 tracking-tight leading-tight">{displayCustomer.customer_name || displayCustomer.name}</h2>
                            <p className="text-indigo-400 font-medium flex items-center gap-1.5 uppercase text-[10px] tracking-widest mt-1">
                                <Calendar className="w-3 h-3 text-indigo-500" />
                                Partner Relationship since {displayCustomer.created_at ? new Date(displayCustomer.created_at).getFullYear() : 2026}
                            </p>
                        </div>

                        <button
                            onClick={onClose}
                            className="p-3 bg-slate-100 text-indigo-400 hover:bg-rose-50 hover:text-rose-500 rounded-2xl transition-all shadow-sm border border-slate-200/50 active:scale-95"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    <nav className="flex items-center gap-1 overflow-x-auto no-scrollbar pb-1">
                        {[
                            { id: 'basic', label: 'Overview', icon: CheckCircle },
                            { id: 'gst', label: 'Branch details', icon: FileText },
                            { id: 'products', label: 'Inventory', icon: ShoppingBag },
                            { id: 'statutory', label: 'Compliance', icon: CheckCircle },
                            { id: 'banking', label: 'Banking', icon: CreditCard },
                            { id: 'terms', label: 'Terms', icon: FileText },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`flex items-center gap-2 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap active:scale-95
                  ${activeTab === tab.id
                                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100 -translate-y-0.5'
                                        : 'text-indigo-400 hover:text-indigo-600 hover:bg-slate-100'
                                    }`}
                            >
                                <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-white' : 'text-indigo-300'}`} />
                                {tab.label}
                            </button>
                        ))}
                    </nav>
                </header>

                {/* Content Section */}
                <main className="flex-1 overflow-y-auto p-8 lg:p-12 custom-scrollbar">
                    {activeTab === 'basic' && renderBasicInfo()}
                    {activeTab === 'gst' && renderGSTInfo()}
                    {activeTab === 'products' && renderItemsInfo()}
                    {activeTab === 'statutory' && renderLegalInfo()}
                    {activeTab === 'banking' && renderBankingInfo()}
                    {activeTab === 'terms' && renderTermsInfo()}
                </main>

                {/* Footer Actions */}
                <footer className="bg-white px-8 py-6 border-t border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-6">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Global Reach</span>
                            <span className="text-xs text-slate-900 font-bold">{displayCustomer.billing_currency || 'INR'} • {displayCustomer.is_also_vendor ? 'Dual Partner' : 'Customer Only'}</span>
                        </div>
                        <div className="w-px h-8 bg-slate-200"></div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Compliance</span>
                            <span className="text-xs text-emerald-600 font-bold flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" />
                                Verified Entity
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white text-xs font-black uppercase tracking-widest rounded-xl hover:bg-indigo-700 transition-all shadow-md active:scale-95"
                            onClick={() => window.print()}
                        >
                            <FileText className="w-4 h-4 text-white" />
                            Download PDF
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
};

export default CustomerViewModal;
