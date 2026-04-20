import React, { useState, useEffect } from 'react';
import { httpClient } from '../../services/httpClient';

export default function GSTR3BPreview() {
    const [isLoading, setIsLoading] = useState(false);
    const [report, setReport] = useState<any>(null);

    const fetch3B = async () => {
        setIsLoading(true);
        try {
            const res = await httpClient.get('/api/gst/reconciliation/gstr3b_preview/?month=January&year=2024-25');
            setReport(res);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetch3B();
    }, []);

    if (isLoading) return <div className="p-20 text-center">Loading GSTR-3B Preview...</div>;

    return (
        <div className="space-y-6">
            <div className="erp-container">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h2 className="section-title border-none pb-0">GSTR-3B Monthly Summary</h2>
                        <p className="helper-text">Liability and ITC computation for January 2024-25</p>
                    </div>
                </div>

                <div className="space-y-4">
                    {/* Liability */}
                    <div className="border rounded-[4px] overflow-hidden">
                        <div className="bg-slate-50 p-3 border-b font-semibold">3.1 Details of Outward Supplies (from GSTR-1)</div>
                        <div className="p-4 grid grid-cols-3 gap-6">
                            <div className="space-y-1">
                                <label className="text-xs text-slate-500 uppercase font-bold">IGST</label>
                                <div className="text-lg font-mono">₹{report?.output_tax_igst || '0.00'}</div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-slate-500 uppercase font-bold">CGST</label>
                                <div className="text-lg font-mono">₹{report?.output_tax_cgst || '0.00'}</div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-slate-500 uppercase font-bold">SGST</label>
                                <div className="text-lg font-mono">₹{report?.output_tax_sgst || '0.00'}</div>
                            </div>
                        </div>
                    </div>

                    {/* ITC */}
                    <div className="border rounded-[4px] overflow-hidden">
                        <div className="bg-indigo-50 p-3 border-b font-semibold text-indigo-900">4. Eligible ITC (from Reconciliation)</div>
                        <div className="p-4 grid grid-cols-3 gap-6">
                            <div className="space-y-1">
                                <label className="text-xs text-indigo-500 uppercase font-bold">IGST</label>
                                <div className="text-lg font-mono">₹{report?.input_tax_igst || '0.00'}</div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-indigo-500 uppercase font-bold">CGST</label>
                                <div className="text-lg font-mono">₹{report?.input_tax_cgst || '0.00'}</div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-indigo-500 uppercase font-bold">SGST</label>
                                <div className="text-lg font-mono">₹{report?.input_tax_sgst || '0.00'}</div>
                            </div>
                        </div>
                    </div>

                    {/* Payable */}
                    <div className="border rounded-[4px] overflow-hidden bg-slate-900 text-white">
                        <div className="p-3 border-b border-white/10 font-semibold">Net Tax Payable (After ITC Offset)</div>
                        <div className="p-4 grid grid-cols-3 gap-6">
                            <div className="space-y-1">
                                <label className="text-xs text-slate-400 uppercase font-bold">IGST Payable</label>
                                <div className="text-xl font-bold text-emerald-400">₹{report?.net_igst || '0.00'}</div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-slate-400 uppercase font-bold">CGST Payable</label>
                                <div className="text-xl font-bold text-emerald-400">₹{report?.net_cgst || '0.00'}</div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-slate-400 uppercase font-bold">SGST Payable</label>
                                <div className="text-xl font-bold text-emerald-400">₹{report?.net_sgst || '0.00'}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
