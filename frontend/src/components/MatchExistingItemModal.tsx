import React, { useState, useEffect } from 'react';
import { httpClient } from '../services/httpClient';
import { apiService } from '../services/api';
import { showError, showSuccess } from '../utils/toast';
import SearchableSelect from './SearchableSelect';
import Icon from './Icon';

/**
 * MatchExistingItemModal — Direct Inventory Linking
 *
 * REQUIRED BUSINESS FLOW:
 *   CREATE ITEM → MATCH EXISTING → Select Inventory Master → Save → ALREADY EXIST
 *
 * This modal does NOT require:
 *   - vendor_id
 *   - vendor product mapping
 *   - vendor product/service configuration
 *
 * It saves inventory_item_id directly onto the staging item via:
 *   POST /api/ocr-staging/<stagingId>/match-item/
 */

export interface MatchExistingItemModalProps {
    onClose: () => void;
    /** Staging record identifier — either numeric id or file_hash string */
    stagingId: string | number;
    /** 0-based line item index within extracted_data.items[] */
    lineIndex?: number;
    extractedItem: {
        item_name?: string;
        item_code?: string;
        hsn_code?: string;
        description?: string;
        rate?: string | number;
        uom?: string;
        gst_rate?: string | number;
    };
    /**
     * Called on successful match — receives the updated row object
     * so callers can update UI without a full page refresh.
     */
    onItemMatched: (updatedRow?: any) => void;
    // Legacy props — accepted but ignored. Vendor is no longer required.
    vendorId?: number | null;
    vendorName?: string;
}

export const MatchExistingItemModal: React.FC<MatchExistingItemModalProps> = ({
    onClose,
    stagingId,
    lineIndex = 0,
    extractedItem,
    onItemMatched,
    // vendorId and vendorName are accepted for backward-compat but not used
}) => {
    const [stockItems, setStockItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [selectedItemId, setSelectedItemId] = useState<string>('');

    // Fetch master inventory items on mount — no vendor needed
    useEffect(() => {
        const loadItems = async () => {
            try {
                const items = await apiService.getStockItems();
                setStockItems(items || []);
            } catch (err) {
                console.error('[MATCH_ITEM_MODAL] Failed to load inventory items:', err);
                showError('Failed to load inventory items.');
            } finally {
                setLoading(false);
            }
        };
        loadItems();
    }, []);

    const selectedStockItem = stockItems.find((item) => String(item.id) === selectedItemId);

    const handleMatch = async () => {
        if (!selectedStockItem) {
            showError('Please select an inventory item to match.');
            return;
        }
        if (!stagingId) {
            showError('No staging record identified. Cannot save match.');
            return;
        }

        setSubmitting(true);
        try {
            const canonicalName = selectedStockItem.item_name || selectedStockItem.name || '';

            const result = await httpClient.post<any>(
                `/api/ocr-staging/${stagingId}/match-item/`,
                {
                    inventory_item_id: selectedStockItem.id,
                    item_name: canonicalName,
                    line_index: lineIndex,
                }
            );

            showSuccess(`Matched to "${canonicalName}" — status set to ALREADY EXIST.`);
            onItemMatched(result?.row);
        } catch (err: any) {
            console.error('[MATCH_ITEM_MODAL] Match failed:', err);
            showError(err?.response?.data?.error || 'Failed to save inventory match.');
        } finally {
            setSubmitting(false);
        }
    };

    const stockOptions = stockItems.map((item) => ({
        label: `${item.item_name || item.name} (${item.item_code || item.code || 'No Code'})`,
        value: String(item.id),
    }));

    return (
        <div
            id="match-existing-item-modal-overlay"
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 transition-opacity duration-300 animate-in fade-in duration-150"
        >
            <div className="bg-white border border-gray-200 text-gray-800 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col transform transition-all duration-300 scale-100 max-h-[90vh]">

                {/* Header */}
                <div className="p-6 border-b border-gray-200 bg-emerald-50/40 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600">
                            <Icon name="link" className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="font-extrabold text-lg tracking-wide text-gray-800">
                                Match to Existing Inventory
                            </h3>
                            <p className="text-xs text-gray-500 font-medium">
                                Select a master stock item to link this invoice line
                            </p>
                        </div>
                    </div>
                    <button
                        id="match-item-modal-close"
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 hover:bg-gray-100 p-2 rounded-lg transition-colors cursor-pointer"
                    >
                        <Icon name="close" className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 flex-1 overflow-y-auto space-y-6">

                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-12 space-y-4">
                            <Icon name="spinner" className="w-8 h-8 text-emerald-600 animate-spin" />
                            <p className="text-sm text-gray-500">Loading inventory master...</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                            {/* Left — Incoming Invoice Item */}
                            <div className="bg-slate-50/60 border border-slate-200/80 rounded-xl p-5 relative overflow-hidden flex flex-col justify-between shadow-sm">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-violet-500/5 rounded-full blur-2xl" />
                                <div>
                                    <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-violet-50 text-violet-700 border border-violet-200 mb-3 uppercase tracking-wider">
                                        Incoming (Invoice)
                                    </span>
                                    <h4 className="font-bold text-gray-800 text-sm mb-1 break-words">
                                        {extractedItem.item_name || extractedItem.description || '—'}
                                    </h4>
                                    <p className="text-xs text-gray-500 mb-4 font-medium italic break-words">
                                        {extractedItem.description ? `"${extractedItem.description}"` : ''}
                                    </p>
                                </div>
                                <div className="space-y-2.5 pt-4 border-t border-slate-200 text-xs">
                                    <div className="flex justify-between text-gray-500">
                                        <span>Code:</span>
                                        <span className="font-semibold text-gray-800">{extractedItem.item_code || '—'}</span>
                                    </div>
                                    <div className="flex justify-between text-gray-500">
                                        <span>HSN/SAC:</span>
                                        <span className="font-semibold text-gray-800">{extractedItem.hsn_code || '—'}</span>
                                    </div>
                                    <div className="flex justify-between text-gray-500">
                                        <span>Rate:</span>
                                        <span className="font-semibold text-gray-800">
                                            {extractedItem.rate ? `₹${Number(extractedItem.rate).toFixed(2)}` : '—'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Right — Master Item Selector */}
                            <div className="bg-slate-50/60 border border-slate-200/80 rounded-xl p-5 relative overflow-hidden flex flex-col justify-between shadow-sm">
                                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl" />
                                <div>
                                    <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 mb-3 uppercase tracking-wider">
                                        Target Master Item
                                    </span>
                                    <div className="mb-4">
                                        <label className="block text-xs font-semibold text-gray-500 mb-2">
                                            Select Inventory Item
                                        </label>
                                        <SearchableSelect
                                            value={selectedItemId}
                                            onChange={setSelectedItemId}
                                            options={stockOptions}
                                            placeholder="Search inventory items..."
                                        />
                                    </div>
                                </div>

                                {selectedStockItem ? (
                                    <div className="space-y-2.5 pt-4 border-t border-slate-200 text-xs">
                                        <div className="flex justify-between text-gray-500">
                                            <span>Master Code:</span>
                                            <span className="font-semibold text-gray-800">{selectedStockItem.item_code || selectedStockItem.code || '—'}</span>
                                        </div>
                                        <div className="flex justify-between text-gray-500">
                                            <span>Master HSN:</span>
                                            <span className="font-semibold text-gray-800">{selectedStockItem.hsn_code || selectedStockItem.hsn_sac || '—'}</span>
                                        </div>
                                        <div className="flex justify-between text-gray-500">
                                            <span>Master UOM:</span>
                                            <span className="font-semibold text-gray-800">{selectedStockItem.unit || selectedStockItem.uom || '—'}</span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="py-6 flex items-center justify-center text-gray-400 text-xs italic">
                                        Select an item to preview details
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Match confirmation info */}
                    {selectedStockItem && (
                        <div className="bg-emerald-50 border border-emerald-200 text-gray-700 rounded-xl p-4 text-xs leading-relaxed shadow-sm">
                            <span className="font-bold text-emerald-700 block mb-1">What will happen:</span>
                            Invoice item <strong className="text-gray-900">"{extractedItem.item_name || extractedItem.description}"</strong>
                            {' '}will be directly linked to master item{' '}
                            <strong className="text-emerald-700">"{selectedStockItem.item_name || selectedStockItem.name}"</strong>.
                            {' '}Status will be set to <strong className="text-emerald-600">ALREADY EXIST</strong> immediately.
                            No vendor configuration required.
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-slate-50 border-t border-gray-200 flex items-center justify-end gap-3 flex-shrink-0">
                    <button
                        id="match-item-modal-cancel"
                        onClick={onClose}
                        className="px-4 py-2 border border-gray-300 text-xs font-medium rounded-lg text-gray-700 bg-white hover:bg-gray-50 focus:outline-none transition-colors cursor-pointer disabled:opacity-50"
                        disabled={submitting}
                    >
                        Cancel
                    </button>
                    <button
                        id="match-item-modal-confirm"
                        onClick={handleMatch}
                        disabled={!selectedStockItem || submitting}
                        className="inline-flex items-center justify-center px-5 py-2 text-xs font-bold rounded-lg text-white bg-emerald-600 hover:bg-emerald-700 border border-emerald-700 disabled:bg-gray-100 disabled:text-gray-400 disabled:border-gray-300 focus:outline-none shadow-sm transition-all flex items-center gap-2 cursor-pointer"
                    >
                        {submitting ? (
                            <>
                                <Icon name="spinner" className="w-4 h-4 animate-spin" />
                                Saving Match...
                            </>
                        ) : (
                            <>
                                <Icon name="check" className="w-4 h-4" />
                                Match &amp; Link Item
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
