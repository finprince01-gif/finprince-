import React, { useState, useEffect } from 'react';
import { httpClient } from '../services/httpClient';
import { showError, showSuccess } from '../utils/toast';
import Icon from './Icon';

export interface GstCorrectionModalProps {
    onClose: () => void;
    /** The staging record ID (maps to InvoiceTempOCR.id) */
    stagingId: string | number;
    /** The staging record or purchase object containing extracted_data / extraction_payload */
    record: any;
    /** Callback on successful save, receives the updated row payload */
    onSaveSuccess: (updatedRow: any) => void;
}

export const GstCorrectionModal: React.FC<GstCorrectionModalProps> = ({
    onClose,
    stagingId,
    record,
    onSaveSuccess,
}) => {
    // Determine the source of extraction data (varies between SmartInvoiceUploadModal and PendingPurchases)
    const extData = record.extracted_data || record.extraction_payload || {};
    const auditTrail = extData.gst_audit_trail || {};
    const expectedValues = auditTrail.expected_tax_values || {};
    const extractedValues = auditTrail.extracted_tax_values || {};

    const expectedCgst = Number(expectedValues.cgst || 0);
    const expectedSgst = Number(expectedValues.sgst || 0);
    const expectedIgst = Number(expectedValues.igst || 0);

    const initialCgst = Number(extractedValues.cgst || extData.total_cgst || extData.cgst || 0);
    const initialSgst = Number(extractedValues.sgst || extData.total_sgst || extData.sgst || 0);
    const initialIgst = Number(extractedValues.igst || extData.total_igst || extData.igst || 0);

    const taxableValue = Number(auditTrail.taxable_value || extData.total_taxable_value || extData.taxable_value || 0);
    const gstRate = auditTrail.gst_rate || extData.gst_rate || '—';

    // Editable form state
    const [cgst, setCgst] = useState<string>(initialCgst.toFixed(2));
    const [sgst, setSgst] = useState<string>(initialSgst.toFixed(2));
    const [igst, setIgst] = useState<string>(initialIgst.toFixed(2));

    const [submitting, setSubmitting] = useState(false);

    // Calculate interactive live differences
    const cgstVal = Number(cgst) || 0;
    const sgstVal = Number(sgst) || 0;
    const igstVal = Number(igst) || 0;

    const liveTotalGst = cgstVal + sgstVal + igstVal;
    const expectedTotalGst = expectedCgst + expectedSgst + expectedIgst;
    const liveDifference = Math.abs(expectedTotalGst - liveTotalGst);
    const isWithinTolerance = liveDifference <= 1.0;

    const handleSave = async () => {
        if (!stagingId) {
            showError('Invalid record ID. Cannot perform GST correction.');
            return;
        }

        setSubmitting(true);
        try {
            const result = await httpClient.post<any>(
                `/api/ocr-staging/${stagingId}/correct-gst/`,
                {
                    cgst: cgstVal,
                    sgst: sgstVal,
                    igst: igstVal,
                }
            );

            const updatedRow = result; // Response is the updated staging row payload
            const newAuditTrail = (updatedRow.extracted_data || updatedRow.extraction_payload || {}).gst_audit_trail || {};
            const newDiff = Number(newAuditTrail.difference_amount || 0);

            if (newDiff <= 1.0) {
                showSuccess('GST mismatch corrected successfully! Status updated to VALID/NEED_TO_SAVE.');
            } else {
                showSuccess(`GST values updated, but difference of ₹${newDiff.toFixed(2)} still exceeds tolerance limit.`);
            }

            onSaveSuccess(updatedRow);
            onClose();
        } catch (err: any) {
            console.error('[GST_CORRECTION_MODAL] Correction failed:', err);
            showError(err?.response?.data?.error || 'Failed to update GST values.');
        } finally {
            setSubmitting(true);
        }
    };

    return (
        <div
            id="gst-correction-modal-overlay"
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 transition-opacity duration-300 animate-in fade-in duration-150"
        >
            <div className="bg-white border border-gray-200 text-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col transform transition-all duration-300 scale-100 max-h-[90vh]">
                {/* Header */}
                <div className="p-6 border-b border-gray-200 bg-rose-50/30 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center text-rose-600">
                            <Icon name="edit" className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-extrabold text-lg tracking-wide text-gray-800">
                                Correct GST Mismatch
                            </h3>
                            <p className="text-xs text-gray-500 font-medium">
                                Adjust tax values to resolve invoice validation discrepancy
                            </p>
                        </div>
                    </div>
                    <button
                        id="gst-correction-modal-close"
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-2 rounded-lg transition-colors cursor-pointer"
                    >
                        <Icon name="close" className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 flex-1 overflow-y-auto space-y-6">
                    {/* Summary Card */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-50 border border-slate-200/80 rounded-xl shadow-sm">
                        <div>
                            <span className="block text-[10px] uppercase font-bold text-gray-400 tracking-wider">Taxable Value</span>
                            <span className="text-sm font-extrabold text-gray-700">₹{taxableValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div>
                            <span className="block text-[10px] uppercase font-bold text-gray-400 tracking-wider">GST Rate</span>
                            <span className="text-sm font-extrabold text-gray-700">{gstRate}</span>
                        </div>
                        <div>
                            <span className="block text-[10px] uppercase font-bold text-gray-400 tracking-wider">Expected Tax</span>
                            <span className="text-sm font-extrabold text-gray-700">₹{expectedTotalGst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                        <div>
                            <span className="block text-[10px] uppercase font-bold text-gray-400 tracking-wider">Current Tax</span>
                            <span className="text-sm font-extrabold text-gray-700">₹{liveTotalGst.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                    </div>

                    {/* Main correction columns */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* Expected Values Panel */}
                        <div className="md:col-span-1 border border-slate-100 rounded-xl p-4 bg-slate-50/40 space-y-4">
                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider border-b pb-2">Expected (Calculated)</h4>
                            <div className="space-y-3">
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-gray-500">Expected CGST:</span>
                                    <span className="font-bold text-gray-800">₹{expectedCgst.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-gray-500">Expected SGST:</span>
                                    <span className="font-bold text-gray-800">₹{expectedSgst.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center text-xs">
                                    <span className="text-gray-500">Expected IGST:</span>
                                    <span className="font-bold text-gray-800">₹{expectedIgst.toFixed(2)}</span>
                                </div>
                                <div className="pt-2 border-t flex justify-between items-center text-xs">
                                    <span className="font-semibold text-gray-500">Expected Total:</span>
                                    <span className="font-black text-emerald-600">₹{expectedTotalGst.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>

                        {/* Editable Form Inputs */}
                        <div className="md:col-span-2 space-y-4">
                            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider border-b pb-2">Enter Corrected Values</h4>
                            
                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-1">
                                    <label htmlFor="cgst-input" className="block text-xs font-semibold text-gray-600">CGST Amount (₹)</label>
                                    <input
                                        id="cgst-input"
                                        type="number"
                                        step="0.01"
                                        value={cgst}
                                        onChange={(e) => setCgst(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label htmlFor="sgst-input" className="block text-xs font-semibold text-gray-600">SGST Amount (₹)</label>
                                    <input
                                        id="sgst-input"
                                        type="number"
                                        step="0.01"
                                        value={sgst}
                                        onChange={(e) => setSgst(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label htmlFor="igst-input" className="block text-xs font-semibold text-gray-600">IGST Amount (₹)</label>
                                    <input
                                        id="igst-input"
                                        type="number"
                                        step="0.01"
                                        value={igst}
                                        onChange={(e) => setIgst(e.target.value)}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
                                    />
                                </div>
                            </div>

                            {/* Live calculations */}
                            <div className="p-4 bg-slate-50 border border-slate-200/60 rounded-xl space-y-2.5 text-xs">
                                <div className="flex justify-between text-gray-500">
                                    <span>Calculated Expected Total GST:</span>
                                    <span className="font-bold text-gray-800">₹{expectedTotalGst.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-gray-500">
                                    <span>Entered Corrected Total GST:</span>
                                    <span className="font-bold text-gray-800">₹{liveTotalGst.toFixed(2)}</span>
                                </div>
                                <div className="border-t pt-2 flex justify-between items-center">
                                    <span className="font-semibold text-gray-600">Calculated Difference:</span>
                                    <span className={`font-black text-sm ${isWithinTolerance ? 'text-emerald-600' : 'text-rose-600 animate-pulse'}`}>
                                        ₹{liveDifference.toFixed(2)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Interactive validation warning/helper info */}
                    <div className={`p-4 border rounded-xl flex items-start gap-3 text-xs leading-relaxed shadow-sm transition-all duration-300 ${
                        isWithinTolerance 
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                            : 'bg-rose-50 border-rose-200 text-rose-800'
                    }`}>
                        <div className={`p-1.5 rounded-lg ${isWithinTolerance ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                            <Icon name={isWithinTolerance ? 'check' : 'warning'} className="w-4 h-4" />
                        </div>
                        <div>
                            {isWithinTolerance ? (
                                <>
                                    <span className="font-extrabold block mb-0.5 text-emerald-900">Difference within tolerance limit (₹1.00)</span>
                                    The entered values match the calculated expected tax values within the allowable limit. Upon saving, the invoice GST status will resolve to <strong>VALID</strong>.
                                </>
                            ) : (
                                <>
                                    <span className="font-extrabold block mb-0.5 text-rose-900">Difference exceeds tolerance limit (₹1.00)</span>
                                    The difference (₹{liveDifference.toFixed(2)}) is still outside the allowable tolerance limit. Saving these values will update the staging record but will keep the invoice in <strong>GST MISMATCH</strong> status.
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-slate-50 border-t border-gray-200 flex items-center justify-end gap-3 flex-shrink-0">
                    <button
                        id="gst-correction-modal-cancel"
                        onClick={onClose}
                        className="px-4 py-2 border border-gray-300 text-xs font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none transition-colors cursor-pointer disabled:opacity-50"
                        disabled={submitting}
                    >
                        Cancel
                    </button>
                    <button
                        id="gst-correction-modal-submit"
                        onClick={handleSave}
                        disabled={submitting}
                        className="inline-flex items-center justify-center px-5 py-2 text-xs font-bold rounded-lg text-white bg-rose-600 hover:bg-rose-700 border border-rose-700 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-300 focus:outline-none shadow-sm transition-all flex items-center gap-2 cursor-pointer"
                    >
                        {submitting ? (
                            <>
                                <Icon name="spinner" className="w-4 h-4 animate-spin" />
                                Saving Correction...
                            </>
                        ) : (
                            <>
                                <Icon name="check" className="w-4 h-4" />
                                Save &amp; Correct GST
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
