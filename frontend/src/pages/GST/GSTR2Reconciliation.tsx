import React, { useState } from 'react';
import { httpClient } from '../../services/httpClient';
import { apiService } from '../../services/api';

export default function GSTR2Reconciliation() {
    const [isLoading, setIsLoading] = useState(false);
    const [recoStatus, setRecoStatus] = useState<any>(null);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsLoading(true);
        try {
            // In a real app, read file and send to API
            // For now, simulate upload
            const reader = new FileReader();
            reader.onload = async (event) => {
                const text = event.target?.result as string;
                try {
                    const json = JSON.parse(text);
                    await httpClient.post('/api/gst/reconciliation/upload_2b/', json);
                    alert('GSTR-2B Ingested successfully');
                } catch (e) {
                    alert('Invalid JSON file');
                }
            };
            reader.readAsText(file);
        } finally {
            setIsLoading(false);
        }
    };

    const runReconciliation = async () => {
        setIsLoading(true);
        try {
            await httpClient.post('/api/gst/reconciliation/run_reconciliation/', { month: 'January', year: '2024-25' });
            alert('Reconciliation process completed');
        } finally {
            setIsLoading(false);
        }
    };

    const handleFetchFromSandbox = async () => {
        setIsLoading(true);
        try {
            // Fetch directly via Sandbox API (Mocked in backend)
            const res = await apiService.fetchGSTR2BSandbox('January', '2024-25');
            if (res?.data?.b2b) {
                // Ingest the fetched data into our system
                await httpClient.post('/api/gst/reconciliation/upload_2b/', res.data.b2b);
                alert('GSTR-2B data fetched from Sandbox and ingested successfully!');
            }
        } catch (e: any) {
            alert('Failed to fetch from Sandbox API: ' + (e.message || 'Error'));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="erp-container">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h2 className="section-title border-none pb-0">GSTR-2B Reconciliation Dashboard</h2>
                        <p className="helper-text">Match government data with your purchase books</p>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={handleFetchFromSandbox} className="erp-button-secondary bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100" disabled={isLoading}>
                            ⚡ Fetch from Sandbox API
                        </button>
                        <label className="erp-button-secondary cursor-pointer">
                            Upload JSON
                            <input type="file" className="hidden" onChange={handleUpload} accept=".json" />
                        </label>
                        <button onClick={runReconciliation} className="erp-button-primary" disabled={isLoading}>
                            {isLoading ? 'Processing...' : 'Run Reconciliation'}
                        </button>
                    </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    <div className="p-4 bg-emerald-50 rounded-[4px] border border-emerald-100">
                        <span className="text-sm text-emerald-700 font-medium">Exact Match</span>
                        <div className="text-2xl font-bold text-emerald-900">0</div>
                    </div>
                    <div className="p-4 bg-orange-50 rounded-[4px] border border-orange-100">
                        <span className="text-sm text-orange-700 font-medium">Partial Match</span>
                        <div className="text-2xl font-bold text-orange-900">0</div>
                    </div>
                    <div className="p-4 bg-rose-50 rounded-[4px] border border-rose-100">
                        <span className="text-sm text-rose-700 font-medium">Missing in Books</span>
                        <div className="text-2xl font-bold text-rose-900">0</div>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-[4px] border border-slate-100">
                        <span className="text-sm text-slate-700 font-medium">Missing in 2B</span>
                        <div className="text-2xl font-bold text-slate-900">0</div>
                    </div>
                </div>

                <div className="erp-table-container">
                    <table className="erp-table">
                        <thead>
                            <tr>
                                <th>Status</th>
                                <th>Supplier GSTIN</th>
                                <th>Invoice No (2B)</th>
                                <th>Date (2B)</th>
                                <th>Value (2B)</th>
                                <th>Match %</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td colSpan={7} className="text-center py-10 text-slate-400">
                                    No reconciliation data found. Upload GSTR-2B to begin.
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
