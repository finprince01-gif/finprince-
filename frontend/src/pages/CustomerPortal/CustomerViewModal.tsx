import React, { useState } from 'react';
import { X, ChevronRight, FileText } from 'lucide-react';
import Building2 from 'lucide-react/dist/esm/icons/building-2';
import CreditCard from 'lucide-react/dist/esm/icons/credit-card';
import ShoppingBag from 'lucide-react/dist/esm/icons/shopping-bag';
import Landmark from 'lucide-react/dist/esm/icons/landmark';
import ShieldCheck from 'lucide-react/dist/esm/icons/shield-check';

interface CustomerViewModalProps {
    customer: any;
    onClose: () => void;
}

const CustomerViewModal: React.FC<CustomerViewModalProps> = ({ customer, onClose }) => {
    const [activeTab, setActiveTab] = useState('basic');

    if (!customer) return null;

    const tabs = [
        { id: 'basic', label: 'Basic Details', icon: Building2 },
        { id: 'gst', label: 'GST Details', icon: FileText },
        { id: 'products', label: 'Products & Services', icon: ShoppingBag },
        { id: 'statutory', label: 'Statutory Info', icon: ShieldCheck },
        { id: 'banking', label: 'Banking Info', icon: Landmark },
        { id: 'terms', label: 'Terms & Conditions', icon: FileText },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn">
            <div className="bg-white rounded-[4px] shadow-none border border-slate-200-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-slideUp">
                {/* Header */}
                <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 bg-gray-50/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 rounded-[4px]">
                            <Building2 className="w-6 h-6 text-indigo-600" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900">Customer Details</h2>
                            <div className="flex items-center gap-2 text-sm">
                                <span className="text-gray-500">Code:</span>
                                <span className="font-mono font-medium text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded text-xs">
                                    {customer.customer_code || customer.code || 'N/A'}
                                </span>
                                <span className="text-gray-300">|</span>
                                <span className={`px-2 py-0.5 rounded-[4px] text-xs font-medium ${(customer.status || 'Live') === 'Live' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                    {customer.status || 'Live'}
                                </span>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-red-50 hover:text-red-500 rounded-[4px] transition-colors text-gray-400"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex flex-1 overflow-hidden">
                    {/* Sidebar Tabs */}
                    <div className="w-64 bg-gray-50 border-r border-gray-200 overflow-y-auto hidden md:block flex-shrink-0">
                        <div className="p-4">
                            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4 px-2">Information Sections</h3>
                            <nav className="space-y-1">
                                {tabs.map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-[4px] transition-all ${activeTab === tab.id
                                            ? 'bg-indigo-50 text-indigo-700 shadow-none border border-slate-200-none border border-slate-200 ring-1 ring-indigo-200'
                                            : 'text-gray-600 hover:bg-white hover:shadow-none border border-slate-200-none border border-slate-200 hover:text-gray-900'
                                            }`}
                                    >
                                        <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-indigo-600' : 'text-gray-400'}`} />
                                        {tab.label}
                                        {activeTab === tab.id && <ChevronRight className="w-4 h-4 ml-auto text-indigo-400" />}
                                    </button>
                                ))}
                            </nav>
                        </div>
                    </div>

                    {/* Content Area */}
                    <div className="flex-1 overflow-y-auto bg-white p-6 md:p-8 scroll-smooth">
                        {activeTab === 'basic' && <BasicDetailsView customer={customer} />}
                        {activeTab === 'gst' && <GSTDetailsView customer={customer} />}
                        {activeTab === 'products' && <ProductsServicesView customer={customer} />}
                        {activeTab === 'statutory' && <StatutoryDetailsView customer={customer} />}
                        {activeTab === 'banking' && <BankingInfoView customer={customer} />}
                        {activeTab === 'terms' && <TermsConditionsView customer={customer} />}
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Sub-components for identifying/viewing data ---

const InfoField = ({ label, value, fullWidth = false }: { label: string, value: React.ReactNode, fullWidth?: boolean }) => (
    <div className={`${fullWidth ? 'col-span-full' : ''}`}>
        <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1.5">{label}</label>
        <div className="text-sm font-medium text-gray-900 break-words bg-gray-50/50 px-3 py-2 rounded border border-gray-100 min-h-[38px] flex items-center">
            {value || <span className="text-gray-400 italic">N/A</span>}
        </div>
    </div>
);

const SectionHeading = ({ title }: { title: string }) => (
    <h3 className="text-lg font-bold text-gray-900 mb-6 pb-2 border-b border-gray-100 flex items-center gap-2">
        {title}
    </h3>
);

const BasicDetailsView = ({ customer }: { customer: any }) => {
    return (
        <div className="space-y-6 animate-fadeIn">
            <SectionHeading title="Basic Information" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                <InfoField label="Customer Name" value={customer.customer_name || customer.name} />
                <InfoField label="Customer Category" value={customer.customer_category_name || customer.category_name || customer.category || ''} />
                <InfoField label="Customer Code" value={customer.customer_code || customer.code} />
                <InfoField label="PAN Number" value={customer.pan_number} />
                <InfoField label="Contact Person" value={customer.contact_person} />
                <InfoField label="Email Address" value={customer.email_address} />
                <InfoField label="Contact Number" value={customer.contact_number} />

                <div className="md:col-span-2 mt-4 p-4 bg-gray-50 rounded-[4px] border border-gray-200">
                    <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-[4px] ${customer.is_also_vendor ? 'bg-indigo-500' : 'bg-gray-300'}`} />
                        <span className="text-sm font-medium text-gray-700">
                            Is this customer also a vendor?
                            <span className="ml-2 font-bold text-gray-900">{customer.is_also_vendor ? 'Yes' : 'No'}</span>
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

const GSTDetailsView = ({ customer }: { customer: any }) => {
    const gstData = customer.gst_details || {};
    const branches = gstData.branches || [];
    const gstins = gstData.gstins || [];

    return (
        <div className="space-y-8 animate-fadeIn">
            <SectionHeading title="GST & Branch Configuration" />

            {/* Registered/Unregistered Status & Main GSTINs */}
            <div className="bg-gray-50 rounded-[4px] p-6 border border-gray-100">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <span className={`inline-block px-3 py-1 rounded-[4px] text-xs font-semibold mb-2 ${gstins.length > 0 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                            {gstins.length > 0 ? 'Registered Customer' : 'Unregistered Customer'}
                        </span>
                        <h4 className="text-sm font-bold text-gray-900 uppercase tracking-tight">Main Identification</h4>
                    </div>
                    {gstins.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {gstins.map((gst: string) => (
                                <span key={gst} className="px-3 py-1.5 bg-white border border-indigo-200 rounded text-sm font-mono font-bold text-indigo-700 shadow-sm">
                                    {gst}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {branches.length > 0 ? (
                <div className="space-y-4">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">Branch Details ({branches.length})</h4>
                    <div className="grid grid-cols-1 gap-4">
                        {branches.map((branch: any, idx: number) => (
                            <div key={idx} className="border border-gray-200 rounded-[4px] p-5 bg-white shadow-none border border-slate-200-none border border-slate-200 hover:shadow-none border border-slate-200-none border border-slate-200 transition-shadow-none border border-slate-200">
                                <div className="flex justify-between items-start mb-4 border-b border-gray-100 pb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-[4px] bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs font-bold ring-1 ring-indigo-100">
                                            {idx + 1}
                                        </div>
                                        <div>
                                            <h5 className="font-bold text-gray-900">{branch.defaultRef || `Branch ${idx + 1}`}</h5>
                                            {branch.gstin && <span className="text-xs text-indigo-600 font-mono bg-indigo-50 px-1.5 py-0.5 rounded mt-1 inline-block">{branch.gstin}</span>}
                                        </div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="col-span-full">
                                        <p className="text-xs text-gray-500 uppercase mb-1">Address</p>
                                        <p className="text-sm text-gray-800 whitespace-pre-wrap">
                                            {(() => {
                                                // Build address from individual lines (API returns addressLine1/2/3, not a combined address)
                                                const parts = [
                                                    branch.addressLine1,
                                                    branch.addressLine2,
                                                    branch.addressLine3,
                                                    branch.city,
                                                    branch.state,
                                                    branch.pincode,
                                                    branch.country
                                                ].filter(Boolean);
                                                // Also support legacy branch.address field
                                                return parts.length > 0 ? parts.join(', ') : (branch.address || 'N/A');
                                            })()}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-500 uppercase mb-1">Contact Person</p>
                                        <p className="text-sm text-gray-800">{branch.contactPerson || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-500 uppercase mb-1">Email</p>
                                        <p className="text-sm text-gray-800">{branch.email || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-500 uppercase mb-1">Contact Number</p>
                                        <p className="text-sm text-gray-800">{branch.contactNumber || 'N/A'}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="text-center py-12 bg-gray-50 rounded-[4px] border-2 border-dashed border-gray-200">
                    <p className="text-gray-500 text-sm">No branch details available.</p>
                </div>
            )}
        </div>
    );
};

const ProductsServicesView = ({ customer }: { customer: any }) => {
    const items = customer.products_services?.items || [];

    return (
        <div className="space-y-6 animate-fadeIn">
            <SectionHeading title="Products & Services" />

            {items.length > 0 ? (
                <div className="border border-gray-200 rounded-[4px] overflow-hidden shadow-none border border-slate-200-none border border-slate-200">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50 text-xs font-semibold text-gray-500 uppercase">
                                <tr>
                                    <th className="px-6 py-3 text-left">No</th>
                                    <th className="px-6 py-3 text-left">Item Code</th>
                                    <th className="px-6 py-3 text-left">Item Name</th>
                                    <th className="px-6 py-3 text-left">UOM</th>
                                    <th className="px-6 py-3 text-left">Cust Item Code</th>
                                    <th className="px-6 py-3 text-left">Cust Item Name</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 bg-white">
                                {items.map((item: any, idx: number) => (
                                    <tr key={idx} className="hover:bg-gray-50/50">
                                        <td className="px-6 py-4 text-sm text-gray-500">{idx + 1}</td>
                                        <td className="px-6 py-4 text-sm font-medium text-indigo-600">{item.itemCode || '-'}</td>
                                        <td className="px-6 py-4 text-sm text-gray-900">{item.itemName || '-'}</td>
                                        <td className="px-6 py-4 text-sm text-gray-500">{item.uom || '-'}</td>
                                        <td className="px-6 py-4 text-sm text-gray-500">{item.custItemCode || '-'}</td>
                                        <td className="px-6 py-4 text-sm text-gray-500">{item.custItemName || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="text-center py-12 bg-gray-50 rounded-[4px] border-2 border-dashed border-gray-200">
                    <ShoppingBag className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 text-sm">No specific products or services mapped.</p>
                </div>
            )}
        </div>
    );
};

const StatutoryDetailsView = ({ customer }: { customer: any }) => {
    return (
        <div className="space-y-8 animate-fadeIn">
            <SectionHeading title="Statutory Information" />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <InfoField label="MSME (Udyam) No." value={customer.msme_no} />
                <InfoField label="FSSAI License No." value={customer.fssai_no} />
            </div>

            <div className="mt-8 pt-6 border-t border-gray-100">
                <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">Import / Export & Compliance</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <InfoField label="Import Export Code (IEC)" value={customer.iec_code} />
                    <InfoField label="EOU Status" value={customer.eou_status} />
                </div>
            </div>

            <div className="mt-8 pt-6 border-t border-gray-100">
                <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wide mb-4">Tax Configuration</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* TCS */}
                    <div className="p-4 bg-gray-50 rounded-[4px] border border-gray-200">
                        <h5 className="font-semibold text-gray-900 mb-3 flex items-center justify-between">
                            TCS Configuration
                            <span className={`px-2 py-0.5 rounded text-xs ${customer.tcs_enabled ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                                {customer.tcs_enabled ? 'Enabled' : 'Disabled'}
                            </span>
                        </h5>
                        <InfoField label="Applicable Section" value={customer.tcs_section && customer.tcs_section.split('|')[0]} />
                        {customer.tcs_section && (
                            <p className="mt-2 text-xs text-gray-500 italic">{customer.tcs_section.split('|')[1]}</p>
                        )}
                    </div>

                    {/* TDS */}
                    <div className="p-4 bg-gray-50 rounded-[4px] border border-gray-200">
                        <h5 className="font-semibold text-gray-900 mb-3 flex items-center justify-between">
                            TDS Configuration
                            <span className={`px-2 py-0.5 rounded text-xs ${customer.tds_enabled ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                                {customer.tds_enabled ? 'Enabled' : 'Disabled'}
                            </span>
                        </h5>
                        <InfoField label="Receivable Section" value={customer.tds_section && customer.tds_section.split('|')[0]} />
                        {customer.tds_section && (
                            <p className="mt-2 text-xs text-gray-500 italic">{customer.tds_section.split('|')[1]}</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const BankingInfoView = ({ customer }: { customer: any }) => {
    const accounts = customer.banking_info?.accounts || [];

    return (
        <div className="space-y-6 animate-fadeIn">
            <SectionHeading title="Banking Information" />

            {accounts.length > 0 ? (
                <div className="grid grid-cols-1 gap-6">
                    {accounts.map((account: any, idx: number) => (
                        <div key={idx} className="border border-gray-200 rounded-[4px] p-5 bg-gradient-to-br from-white to-gray-50 shadow-none border border-slate-200-none border border-slate-200 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50/50 rounded-[4px] -mr-8 -mt-8 pointer-events-none" />

                            <div className="relative z-10">
                                <h4 className="font-bold text-gray-800 text-lg mb-4 flex items-center gap-2">
                                    <Landmark className="w-5 h-5 text-indigo-600" />
                                    {account.bankName || 'Unknown Bank'}
                                </h4>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                                    <div className="space-y-1">
                                        <label className="text-xs text-gray-500 uppercase font-medium">Account Number</label>
                                        <p className="font-mono text-gray-900 font-medium tracking-wide">{account.accountNumber || 'N/A'}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs text-gray-500 uppercase font-medium">IFSC Code</label>
                                        <p className="font-mono text-gray-900">{account.ifscCode || 'N/A'}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs text-gray-500 uppercase font-medium">Branch Name</label>
                                        <p className="text-gray-900">{account.branchName || 'N/A'}</p>
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-xs text-gray-500 uppercase font-medium">SWIFT Code</label>
                                        <p className="font-mono text-gray-900">{account.swiftCode || 'N/A'}</p>
                                    </div>
                                </div>

                                {(account.associatedBranches || []).length > 0 && (
                                    <div className="mt-6 pt-4 border-t border-gray-200/60">
                                        <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">Associated Branches</span>
                                        <div className="flex flex-wrap gap-2 mt-2">
                                            {account.associatedBranches.map((b: string, i: number) => (
                                                <span key={i} className="px-2.5 py-1 bg-white border border-gray-200 rounded-[4px] text-xs font-medium text-gray-600 shadow-none border border-slate-200-none border border-slate-200">
                                                    {b}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-12 bg-gray-50 rounded-[4px] border-2 border-dashed border-gray-200">
                    <CreditCard className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 text-sm">No banking information added.</p>
                </div>
            )}
        </div>
    );
};

const TermsConditionsView = ({ customer }: { customer: any }) => {
    return (
        <div className="space-y-6 animate-fadeIn">
            <SectionHeading title="Terms & Conditions" />
            <div className="grid grid-cols-1 gap-6">
                <InfoField label="Credit Period" value={customer.credit_period} />
                <InfoField label="Credit Terms" value={customer.credit_terms} fullWidth />
                <InfoField label="Penalty Terms" value={customer.penalty_terms} fullWidth />
                <InfoField label="Delivery Terms" value={customer.delivery_terms} fullWidth />
                <InfoField label="Warranty / Guarantee" value={customer.warranty_details} fullWidth />
                <InfoField label="Force Majeure" value={customer.force_majeure} fullWidth />
                <InfoField label="Dispute & Redressal" value={customer.dispute_terms} fullWidth />
            </div>
        </div>
    );
};

export default CustomerViewModal;

