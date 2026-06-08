import React, { useState, useEffect, useCallback } from 'react';
import { httpClient } from '../../services';
import { Package, RefreshCw, CheckCircle, Trash2, Edit2, Save } from 'lucide-react';
import { CreateNewInventoryItemModal } from '../../components/CreateNewInventoryItemModal';
import CreateNewVendorFullModal from '../../components/CreateNewVendorFullModal';
import { EditInvoiceModal, type ScanResult } from '../../components/SmartInvoiceUploadModal';
import { showSuccess, showError } from '../../utils/toast';

interface PendingPurchasesProps {
  onNavigate?: (page: string, params?: any) => void;
}

// ── Status Badge helpers matching Purchase Upload Review styles ──────────────

const VendorStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const isExisting = status === 'VENDOR_STATUS_EXISTING' || status === 'ALREADY_EXIST' || status === 'EXISTS';
  if (isExisting) {
    return <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-1 rounded inline-block text-[10px] font-bold uppercase">ALREADY EXIST</span>;
  }
  return <span className="bg-orange-500 text-white border border-orange-600 px-2 py-1 rounded inline-block text-[10px] font-bold uppercase">CREATE VENDOR</span>;
};

const ItemStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const isExisting = status === 'ITEM_STATUS_EXISTING' || status === 'ALREADY_EXIST' || status === 'ALREADY EXIST';
  if (isExisting) {
    return <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-1 rounded inline-block text-[10px] font-bold uppercase">ALREADY EXIST</span>;
  }
  return <span className="bg-amber-100 text-amber-800 border border-amber-300 px-2 py-1 rounded inline-block text-[10px] font-bold uppercase">CREATE ITEM</span>;
};

const VoucherStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const isNew = status === 'VOUCHER_STATUS_NEW' || status === 'NEED_TO_SAVE' || status === 'NEED TO SAVE';
  const isExisting = status === 'VOUCHER_STATUS_EXISTING' || status === 'ALREADY_EXIST';
  if (isNew) {
    return <span className="bg-indigo-100 text-indigo-700 border border-indigo-300 px-2 py-1 rounded inline-block text-[10px] font-bold uppercase">NEED TO SAVE</span>;
  }
  if (isExisting) {
    return <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-1 rounded inline-block text-[10px] font-bold uppercase">ALREADY EXIST</span>;
  }
  return <span className="bg-gray-100 text-gray-500 border border-gray-200 px-2 py-1 rounded inline-block text-[10px] font-bold uppercase">PENDING</span>;
};

// ─────────────────────────────────────────────────────────────────────────────

const PendingPurchases: React.FC<PendingPurchasesProps> = ({ onNavigate }) => {
  const [purchases, setPurchases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  // Modal states
  const [isCreateItemModalOpen, setIsCreateItemModalOpen] = useState(false);
  const [itemResolvingRow, setItemResolvingRow] = useState<any>(null);
  const [extractedItemData, setExtractedItemData] = useState<any>(null);

  const [isCreateVendorModalOpen, setIsCreateVendorModalOpen] = useState(false);
  const [vendorResolvingRow, setVendorResolvingRow] = useState<any>(null);

  const [editingRow, setEditingRow] = useState<{ pp: any; stagingRow: ScanResult } | null>(null);

  // Per-row loading states
  const [revalidating, setRevalidating] = useState<Set<number>>(new Set());
  const [resolving, setResolving] = useState<Set<number>>(new Set());

  const fetchPurchases = useCallback(async () => {
    try {
      setLoading(true);
      const response = await httpClient.get<any>('/api/pending-purchases/');
      const data = Array.isArray(response) ? response : (response?.results || []);
      // Show all non-resolved purchases
      setPurchases(data.filter((p: any) => p.pending_purchase_status !== 'RESOLVED'));
    } catch (error) {
      console.error('Failed to fetch pending purchases', error);
      showError('Failed to load pending purchases');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPurchases();
  }, [fetchPurchases]);

  // ── Determine if a row is ready to finalize ─────────────────────────────────
  const isReadyToFinalize = (purchase: any) => {
    const vendorOk = purchase.vendor_status === 'VENDOR_STATUS_EXISTING' || purchase.vendor_status === 'ALREADY_EXIST' || purchase.vendor_status === 'EXISTS';
    const itemOk = purchase.item_status === 'ITEM_STATUS_EXISTING' || purchase.item_status === 'ALREADY_EXIST' || purchase.item_status === 'ALREADY EXIST';
    return vendorOk && itemOk;
  };

  // ── Revalidate (runs validate_and_process on staging record) ────────────────
  const revalidatePurchase = async (purchase: any) => {
    setRevalidating(prev => new Set([...prev, purchase.id]));
    try {
      const res = await httpClient.post<any>(`/api/pending-purchases/${purchase.id}/revalidate/`);
      showSuccess(`Revalidation complete — Vendor: ${res.vendor_status}, Item: ${res.item_status}`);
      await fetchPurchases();
    } catch (error: any) {
      showError(error?.response?.data?.error || 'Revalidation failed');
    } finally {
      setRevalidating(prev => { const s = new Set(prev); s.delete(purchase.id); return s; });
    }
  };

  // ── Finalize & Save Vouchers (calls the same pipeline as Purchase Upload) ───
  const resolvePurchase = async (purchase: any) => {
    setResolving(prev => new Set([...prev, purchase.id]));
    try {
      const res = await httpClient.post<any>(`/api/pending-purchases/${purchase.id}/resolve/`);
      showSuccess(`Voucher saved successfully! Voucher ID: ${res.voucher_id}`);
      await fetchPurchases();
    } catch (error: any) {
      showError(error?.response?.data?.error || 'Failed to finalize voucher');
    } finally {
      setResolving(prev => { const s = new Set(prev); s.delete(purchase.id); return s; });
    }
  };

  // ── Open EditInvoiceModal with staging row ──────────────────────────────────
  const openEditModal = async (purchase: any) => {
    try {
      const res = await httpClient.get<any>(`/api/pending-purchases/${purchase.id}/staging_row/`);
      const stagingData = res.staging_row;
      // Map staging record to ScanResult shape expected by EditInvoiceModal
      const scanResult: ScanResult = {
        id: String(stagingData.id),
        file_hash: stagingData.file_hash || '',
        file_path: stagingData.file_path || '',
        vendor_status: (purchase.vendor_status === 'VENDOR_STATUS_EXISTING' ? 'EXISTS' : 'NEW') as any,
        vendor_id: stagingData.vendor_id || null,
        vendor_name: purchase.vendor_name || '',
        vendor_gstin: purchase.vendor_gstin || '',
        invoice_number: purchase.invoice_number || '',
        invoice_date: purchase.invoice_date || '',
        total_amount: purchase.amount || 0,
        status: purchase.pending_purchase_status,
        extracted_data: stagingData.extracted_data,
        created_at: purchase.created_at || '',
        validationStatus: (stagingData.validation_status || 'PENDING_PURCHASE') as any,
        branch: stagingData.branch || '',
        item_status: purchase.item_status || '',
        processed: false,
      };
      setEditingRow({ pp: purchase, stagingRow: scanResult });
    } catch (error: any) {
      showError(error?.response?.data?.error || 'Failed to load staging record for editing');
    }
  };

  const toggleExpandRow = (id: number) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  };

  const openCreateItemModal = (purchase: any, item: any) => {
    setExtractedItemData(item);
    setItemResolvingRow(purchase);
    setIsCreateItemModalOpen(true);
  };

  const openCreateVendorModal = (purchase: any) => {
    setVendorResolvingRow(purchase);
    setIsCreateVendorModalOpen(true);
  };

  return (
    <>
      {/* Create Inventory Item Modal */}
      {isCreateItemModalOpen && itemResolvingRow && (
        <CreateNewInventoryItemModal
          prefilledData={extractedItemData}
          onClose={() => { setIsCreateItemModalOpen(false); setItemResolvingRow(null); }}
          onItemCreated={async () => {
            setIsCreateItemModalOpen(false);
            setItemResolvingRow(null);
            await fetchPurchases();
          }}
        />
      )}

      {/* Create Vendor Modal */}
      {isCreateVendorModalOpen && vendorResolvingRow && (
        <CreateNewVendorFullModal
          prefilledData={{
            vendor_name: vendorResolvingRow.vendor_name || '',
            gstin: vendorResolvingRow.vendor_gstin || '',
            branch: vendorResolvingRow.branch_id || '',
          }}
          onClose={() => { setIsCreateVendorModalOpen(false); setVendorResolvingRow(null); }}
          onVendorCreated={async () => {
            setIsCreateVendorModalOpen(false);
            setVendorResolvingRow(null);
            await fetchPurchases();
          }}
        />
      )}

      {/* Edit Invoice Modal — SAME component as Purchase Upload Review */}
      {editingRow && (
        <EditInvoiceModal
          row={editingRow.stagingRow}
          voucherType="Purchase"
          onClose={() => setEditingRow(null)}
          onSave={async (_updatedData, _reval) => {
            setEditingRow(null);
            await fetchPurchases();
          }}
        />
      )}

      <div className="flex flex-col h-full bg-slate-50 relative p-6">
        {/* Header */}
        <div className="mb-6 flex justify-between items-center">
          <div className="flex items-center gap-4">
            {onNavigate && (
              <button
                onClick={() => onNavigate('Vouchers')}
                className="p-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
                title="Back to Vouchers"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <div>
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
                <Package className="w-7 h-7 text-indigo-600" />
                Pending Purchases
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                Resolve unmatched invoices — create vendors/items, then finalize to post vouchers, journals and GRNs.
              </p>
            </div>
          </div>
          <button
            onClick={fetchPurchases}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-sm text-sm font-medium text-slate-600"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex-1 flex flex-col">
          <div className="overflow-auto flex-1">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr className="text-gray-600 text-[10px] uppercase font-bold tracking-wider">
                  <th className="px-3 py-3 text-center w-10">S.No</th>
                  <th className="px-3 py-3 text-left">File Name</th>
                  <th className="px-3 py-3 text-left">Inv No</th>
                  <th className="px-3 py-3 text-left">Date</th>
                  <th className="px-3 py-3 text-left">Vendor</th>
                  <th className="px-3 py-3 text-left">GSTIN</th>
                  <th className="px-3 py-3 text-left">Branch</th>
                  <th className="px-3 py-3 text-right">Amount</th>
                  <th className="px-3 py-3 text-center">Vendor Status</th>
                  <th className="px-3 py-3 text-center">Item Status</th>
                  <th className="px-3 py-3 text-center">Voucher Status</th>
                  <th className="px-3 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={12} className="px-6 py-8 text-center text-slate-500">
                      <RefreshCw className="w-5 h-5 animate-spin inline-block mr-2" />
                      Loading pending purchases...
                    </td>
                  </tr>
                ) : purchases.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-6 py-12 text-center">
                      <div className="mx-auto w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mb-4">
                        <CheckCircle className="w-8 h-8 text-emerald-500" />
                      </div>
                      <p className="text-slate-600 font-medium">No pending purchases</p>
                      <p className="text-slate-400 text-sm mt-1">All invoices have been resolved.</p>
                    </td>
                  </tr>
                ) : (
                  purchases.map((purchase, idx) => {
                    const ready = isReadyToFinalize(purchase);
                    const isRevalidating = revalidating.has(purchase.id);
                    const isResolving = resolving.has(purchase.id);
                    return (
                      <React.Fragment key={purchase.id}>
                        <tr className="group hover:bg-indigo-50/40 transition-colors">
                          <td className="px-3 py-3 text-center text-xs font-bold text-gray-500">{idx + 1}</td>

                          {/* File Name */}
                          <td className="px-3 py-3">
                            <span className="truncate max-w-[120px] font-medium text-gray-700 font-mono text-[10px]" title={purchase.source_document_hash || 'Unknown'}>
                              {purchase.source_document_hash ? purchase.source_document_hash.substring(0, 16) + '...' : 'Unknown'}
                            </span>
                          </td>

                          {/* Invoice Number */}
                          <td className="px-3 py-3 font-bold text-gray-800 text-[11px]">{purchase.invoice_number || '—'}</td>

                          {/* Date */}
                          <td className="px-3 py-3 text-[11px] text-gray-600 font-medium whitespace-nowrap">{purchase.invoice_date || '—'}</td>

                          {/* Vendor */}
                          <td className="px-4 py-3">
                            <span className="font-bold text-gray-900 text-[11px] leading-tight truncate max-w-[120px] block" title={purchase.vendor_name}>{purchase.vendor_name || '—'}</span>
                          </td>

                          {/* GSTIN */}
                          <td className="px-3 py-3 font-mono text-[10px] text-gray-500">{purchase.vendor_gstin || '—'}</td>

                          {/* Branch */}
                          <td className="px-3 py-3 text-[11px] text-gray-600 font-medium">{purchase.branch_id || '—'}</td>

                          {/* Amount */}
                          <td className="px-3 py-3 text-right font-black text-gray-900 text-[11px]">
                            ₹{purchase.amount ? Number(purchase.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                          </td>

                          {/* Vendor Status */}
                          <td className="px-2 py-3 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <VendorStatusBadge status={purchase.vendor_status} />
                              {(purchase.vendor_status === 'VENDOR_STATUS_CREATE' || purchase.vendor_status === 'CREATE_VENDOR') && (
                                <button
                                  onClick={() => openCreateVendorModal(purchase)}
                                  className="text-[9px] text-orange-600 hover:text-orange-800 font-bold underline focus:outline-none"
                                >
                                  + Create Vendor
                                </button>
                              )}
                            </div>
                          </td>

                          {/* Item Status */}
                          <td className="px-2 py-3 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <ItemStatusBadge status={purchase.item_status} />
                              {(purchase.item_status === 'ITEM_STATUS_CREATE' || purchase.item_status === 'CREATE ITEM') && (
                                <button
                                  onClick={() => toggleExpandRow(purchase.id)}
                                  className="text-[9px] text-amber-600 hover:text-amber-800 font-bold underline focus:outline-none"
                                >
                                  {expandedRows.has(purchase.id) ? 'Hide Items' : 'Expand Items'}
                                </button>
                              )}
                            </div>
                          </td>

                          {/* Voucher Status */}
                          <td className="px-2 py-3 text-center">
                            <VoucherStatusBadge status={purchase.voucher_status} />
                          </td>

                          {/* Actions */}
                          <td className="px-2 py-3 text-center">
                            <div className="flex items-center justify-center gap-1 flex-wrap">
                              {/* Revalidate */}
                              <button
                                onClick={() => revalidatePurchase(purchase)}
                                disabled={isRevalidating}
                                className="p-1.5 hover:bg-indigo-100 rounded text-indigo-500 hover:text-indigo-700 transition-colors disabled:opacity-40"
                                title="Revalidate — re-run Purchase Upload validation engine"
                              >
                                <RefreshCw className={`w-3.5 h-3.5 ${isRevalidating ? 'animate-spin' : ''}`} />
                              </button>

                              {/* Edit — opens same EditInvoiceModal as Purchase Upload */}
                              <button
                                onClick={() => openEditModal(purchase)}
                                className="p-1.5 hover:bg-indigo-100 rounded text-indigo-600 hover:text-indigo-800 transition-colors"
                                title="Edit in same modal as Purchase Upload Review"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>

                              {/* Finalize & Save Vouchers — only enabled when ready */}
                              <button
                                onClick={() => resolvePurchase(purchase)}
                                disabled={!ready || isResolving}
                                className={`p-1.5 rounded transition-colors disabled:opacity-40 ${ready ? 'hover:bg-emerald-100 text-emerald-600 hover:text-emerald-800' : 'text-gray-300 cursor-not-allowed'}`}
                                title={ready ? 'Finalize & Save Vouchers — identical to Purchase Upload finalize' : 'Resolve vendor and item issues first'}
                              >
                                {isResolving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                              </button>

                              {/* Remove */}
                              <button
                                onClick={() => console.log('Remove', purchase.id)}
                                className="p-1.5 hover:bg-red-100 rounded text-red-500 hover:text-red-700 transition-colors"
                                title="Remove Invoice"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* Finalize & Save Vouchers full-width button when ready */}
                            {ready && (
                              <button
                                onClick={() => resolvePurchase(purchase)}
                                disabled={isResolving}
                                className="mt-1.5 w-full px-2 py-1 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded text-[9px] font-bold shadow-sm hover:from-emerald-700 hover:to-teal-700 transition-all disabled:opacity-40 flex items-center justify-center gap-1"
                              >
                                <Save className="w-2.5 h-2.5" />
                                {isResolving ? 'Saving...' : 'Finalize & Save Vouchers'}
                              </button>
                            )}
                          </td>
                        </tr>

                        {/* Expanded Line Items */}
                        {expandedRows.has(purchase.id) && (
                          <tr className="bg-slate-50/30">
                            <td colSpan={12} className="px-6 py-4">
                              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
                                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                  <span className="text-xs font-bold text-indigo-700 uppercase tracking-wider">Line Items Validation</span>
                                  <span className="text-[10px] text-gray-500 font-mono">
                                    Total Items: {purchase.review_payload?.items?.length || purchase.extraction_payload?.invoice?.items?.length || 0}
                                  </span>
                                </div>
                                <table className="w-full text-left text-[11px]">
                                  <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-150 uppercase text-[9px] tracking-wider">
                                    <tr>
                                      <th className="px-3 py-2 w-10 text-center">#</th>
                                      <th className="px-3 py-2">Item Name</th>
                                      <th className="px-3 py-2">HSN/SAC</th>
                                      <th className="px-3 py-2">UOM</th>
                                      <th className="px-3 py-2 text-right">Rate</th>
                                      <th className="px-3 py-2 text-center">Item Status</th>
                                      <th className="px-3 py-2 text-center">Action</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {(purchase.review_payload?.items || purchase.extraction_payload?.invoice?.items || []).map((item: any, itemIdx: number) => (
                                      <tr key={itemIdx} className="hover:bg-indigo-50/20 transition-colors">
                                        <td className="px-3 py-2 text-center text-slate-400 font-bold">{itemIdx + 1}</td>
                                        <td className="px-3 py-2">
                                          <div className="flex flex-col">
                                            <span className="font-bold text-slate-900 leading-tight">{item.item_name || item.name}</span>
                                            {(item.item_code || item.code) && <span className="text-[9px] text-slate-400 font-mono mt-0.5">Code: {item.item_code || item.code}</span>}
                                          </div>
                                        </td>
                                        <td className="px-3 py-2 font-mono text-slate-600">{item.hsn_code || item.hsn || '—'}</td>
                                        <td className="px-3 py-2 text-slate-600 uppercase font-bold">{item.uom || item.unit || '—'}</td>
                                        <td className="px-3 py-2 text-right text-slate-700 font-bold">₹{parseFloat(item.rate || item.unit_price || 0).toFixed(2)}</td>
                                        <td className="px-3 py-2 text-center whitespace-nowrap">
                                          <ItemStatusBadge status={item.item_status || ''} />
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                          {(item.item_status === 'CREATE ITEM' || item.item_status === 'ITEM_STATUS_CREATE' || !item.item_status) ? (
                                            <button
                                              onClick={() => openCreateItemModal(purchase, item)}
                                              className="bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white border border-amber-600 px-3 py-1 rounded text-[10px] font-bold cursor-pointer transition-colors shadow-sm"
                                            >
                                              Create Item
                                            </button>
                                          ) : (
                                            <span className="text-gray-400">—</span>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
};

export default PendingPurchases;
