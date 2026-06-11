import React, { useState, useEffect, useCallback } from 'react';
import { httpClient } from '../../services';
import { CheckCircle, Trash2, Save, X } from 'lucide-react';
import Package from 'lucide-react/dist/esm/icons/package';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';
import Edit2 from 'lucide-react/dist/esm/icons/edit-2';
import Zap from 'lucide-react/dist/esm/icons/zap';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import { CreateNewInventoryItemModal } from '../../components/CreateNewInventoryItemModal';
import { MatchExistingItemModal } from '../../components/MatchExistingItemModal';
import CreateNewVendorFullModal from '../../components/CreateNewVendorFullModal';
import { EditInvoiceModal, type ScanResult } from '../../components/SmartInvoiceUploadModal';
import { showSuccess, showError } from '../../utils/toast';
import Icon from '../../components/Icon';

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

// ── Helper to resolve line items from various payload structures ────────────
const getLineItems = (purchase: any) => {
  if (purchase?.review_payload?.items) return purchase.review_payload.items;
  const ext = purchase?.extraction_payload || {};
  if (ext.items) return ext.items;
  if (ext.sections?.items) return ext.sections.items;
  if (ext.line_items) return ext.line_items;
  if (ext.assembled_exports && ext.assembled_exports[0]?.items) return ext.assembled_exports[0].items;
  if (ext.invoice?.items) return ext.invoice.items;
  return [];
};

// ─────────────────────────────────────────────────────────────────────────────

const PendingPurchases: React.FC<PendingPurchasesProps> = ({ onNavigate }) => {
  const [purchases, setPurchases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  // Modal states
  const [isCreateItemModalOpen, setIsCreateItemModalOpen] = useState(false);
  const [isMatchItemModalOpen, setIsMatchItemModalOpen] = useState(false);
  const [itemResolvingRow, setItemResolvingRow] = useState<any>(null);
  const [extractedItemData, setExtractedItemData] = useState<any>(null);
  const [matchingLineIndex, setMatchingLineIndex] = useState<number>(0);

  const [isCreateVendorModalOpen, setIsCreateVendorModalOpen] = useState(false);
  const [vendorResolvingRow, setVendorResolvingRow] = useState<any>(null);

  const [editingRow, setEditingRow] = useState<{ pp: any; stagingRow: ScanResult } | null>(null);

  // Per-row loading states
  const [revalidating, setRevalidating] = useState<Set<number>>(new Set());
  const [resolving, setResolving] = useState<Set<number>>(new Set());

  // ── Bulk Finalize state ────────────────────────────────────────────────────
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [bulkPreview, setBulkPreview] = useState<{ eligible: number; skipped: number; total: number } | null>(null);
  const [bulkFinalizing, setBulkFinalizing] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ processed: number; skipped: number; failed: number; errors: any[] } | null>(null);

  const openBulkConfirm = useCallback(async () => {
    try {
      const res = await httpClient.get<any>('/api/pending-purchases/finalize-all/preview/');
      setBulkPreview(res);
      setBulkResult(null);
      setShowBulkConfirm(true);
    } catch (e) {
      showError('Failed to load eligible record count');
    }
  }, []);

  const executeBulkFinalize = useCallback(async () => {
    setBulkFinalizing(true);
    try {
      const res = await httpClient.post<any>('/api/pending-purchases/finalize-all/', {});
      setBulkResult(res);
      setBulkPreview(null);
      await fetchPurchases();
      if (res.processed > 0) {
        showSuccess(`Bulk Finalize: ${res.processed} voucher(s) created, ${res.skipped} skipped, ${res.failed} failed.`);
      }
    } catch (e: any) {
      showError(e?.response?.data?.error || 'Bulk finalize failed');
    } finally {
      setBulkFinalizing(false);
    }
  }, []);
  // ── end Bulk Finalize state ────────────────────────────────────────────────

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
      // Immediately patch the row in state so vendor/item/voucher badges refresh without waiting for a full list reload
      setPurchases(prev => prev.map(p => {
        if (p.id !== purchase.id) return p;
        return {
          ...p,
          vendor_status: res.vendor_status ?? p.vendor_status,
          item_status: res.item_status ?? p.item_status,
          voucher_status: res.voucher_status ?? p.voucher_status,
          pending_purchase_status: res.pending_purchase_status ?? p.pending_purchase_status,
        };
      }));
      showSuccess(`Revalidation complete — Vendor: ${res.vendor_status}, Item: ${res.item_status}, Voucher: ${res.voucher_status}`);
      // Full refresh to ensure list consistency
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
      
      if (onNavigate) {
        onNavigate('Vouchers', { editOcrRow: scanResult, returnTo: 'Pending Purchases' });
      }
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

  const openMatchItemModal = (purchase: any, item: any, lineIdx: number = 0) => {
    const name = item.item_name || item.name || item.description || '';
    const hsn = item.hsn_code || item.hsn || item.hsn_sac || item.hsnSacCode || '';
    const rate = item.rate || item.unit_price || item.price || '0.00';
    const uom = item.uom || item.unit || 'nos';
    const desc = item.description || name || '';

    const prefData = {
      item_name: name,
      item_code: item.item_code || '',
      hsn_code: hsn,
      description: desc,
      rate: rate,
      uom: uom,
      gst_rate: item.gst_rate || item.igst_rate || '',
    };
    setExtractedItemData(prefData);
    setMatchingLineIndex(lineIdx);
    setItemResolvingRow(purchase);
    setIsMatchItemModalOpen(true);
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
          prefilledData={(() => {
            if (!extractedItemData) return undefined;
            const name = extractedItemData.item_name || extractedItemData.name || extractedItemData.description || '';
            const hsn = extractedItemData.hsn_code || extractedItemData.hsn || extractedItemData.hsn_sac || extractedItemData.hsnSacCode || '';
            const rate = extractedItemData.rate || extractedItemData.unit_price || extractedItemData.price || '0.00';
            const uom = extractedItemData.uom || extractedItemData.unit || 'nos';
            const desc = extractedItemData.description || name || '';
            
            return {
              item_name: name,
              hsn_code: hsn,
              rate: rate,
              uom: uom,
              description: desc,
              gst_rate: extractedItemData.gst_rate || extractedItemData.igst_rate || '',
              cgst_rate: extractedItemData.cgst_rate || '',
              sgst_rate: extractedItemData.sgst_rate || '',
              igst_rate: extractedItemData.igst_rate || '',
              cess_rate: extractedItemData.cess_rate || '',
            };
          })()}
          onClose={() => { setIsCreateItemModalOpen(false); setItemResolvingRow(null); }}
          onItemCreated={async () => {
            const rowToRevalidate = itemResolvingRow;
            setIsCreateItemModalOpen(false);
            setItemResolvingRow(null);
            if (rowToRevalidate) {
              await revalidatePurchase(rowToRevalidate);
            } else {
              await fetchPurchases();
            }
          }}
        />
      )}

      {isMatchItemModalOpen && itemResolvingRow && (
        <MatchExistingItemModal
          stagingId={itemResolvingRow.source_scan_row_id}
          lineIndex={matchingLineIndex}
          extractedItem={extractedItemData}
          onClose={() => {
            setIsMatchItemModalOpen(false);
            setItemResolvingRow(null);
          }}
          onItemMatched={async () => {
            const rowToRevalidate = itemResolvingRow;
            setIsMatchItemModalOpen(false);
            setItemResolvingRow(null);
            if (rowToRevalidate) {
              await revalidatePurchase(rowToRevalidate);
            } else {
              await fetchPurchases();
            }
          }}
        />
      )}

      {/* Create Vendor Modal */}
      {isCreateVendorModalOpen && vendorResolvingRow && (
        <CreateNewVendorFullModal
          prefilledData={(() => {
            const ext = vendorResolvingRow.extraction_payload || {};
            const supplier = ext.sections?.supplier_details || ext.supplier_details || {};
            const header = ext.header || {};
            
            const vendorName = vendorResolvingRow.vendor_name || ext.vendor_name || header.vendor_name || supplier.vendor_name || '';
            const gstin = vendorResolvingRow.vendor_gstin || ext.canonical_vendor_gstin || ext.vendor_gstin || ext.gstin || '';
            const branch = vendorResolvingRow.branch_id || ext.branch || 'Main Branch';
            const address = ext.bill_from || ext.billing_address || supplier.address || supplier.billing_address || ext.address || '';
            const email = supplier.email || ext.email || ext.vendor_email || '';
            const phone = supplier.phone || supplier.contact || ext.phone || ext.contact_no || ext.contact || '';
            const state = supplier.state || ext.state || ext.vendor_state || '';
            
            const rawItems = getLineItems(vendorResolvingRow) || [];
            const supplierItems = rawItems.map((itm: any) => ({
              hsnSacCode: itm.hsn_code || itm.hsn || itm.hsn_sac || itm.hsnSacCode || '',
              itemName: itm.item_name || itm.name || itm.description || '',
              supplierItemName: itm.supplierItemName || itm.item_name || itm.name || itm.description || '',
              supplierItemCode: itm.supplierItemCode || itm.item_code || itm.code || itm.itemCode || '',
              itemCode: itm.item_code || itm.code || itm.itemCode || '',
            }));
            
            return {
              vendor_name: vendorName,
              pan_no: ext.pan_no || ext.pan || '',
              email: email,
              contact_no: phone,
              gstin: gstin,
              address: address,
              branch: branch,
              state: state,
              contact_person: supplier.contact_person || ext.contact_person || '',
              supplier_items: supplierItems,
            };
          })()}
          onClose={() => { setIsCreateVendorModalOpen(false); setVendorResolvingRow(null); }}
          onVendorCreated={async () => {
            const rowToRevalidate = vendorResolvingRow;
            setIsCreateVendorModalOpen(false);
            setVendorResolvingRow(null);
            if (rowToRevalidate) {
              await revalidatePurchase(rowToRevalidate);
            } else {
              await fetchPurchases();
            }
          }}
        />
      )}



      {/* ── Bulk Finalize Confirmation Modal ── */}
      {showBulkConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md mx-4 overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-white" />
                <span className="text-white font-bold text-base">Finalize & Save All Eligible Vouchers</span>
              </div>
              <button onClick={() => setShowBulkConfirm(false)} className="text-white/70 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Pre-execution preview */}
              {bulkPreview && !bulkResult && (
                <>
                  <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-600">Eligible Records</span>
                      <span className="font-bold text-emerald-700 text-lg">{bulkPreview.eligible}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-600">Skipped (unresolved vendor/item)</span>
                      <span className="font-bold text-amber-600">{bulkPreview.skipped}</span>
                    </div>
                    <div className="border-t border-slate-200 pt-2 flex justify-between items-center text-sm">
                      <span className="text-slate-500">Total Pending</span>
                      <span className="font-bold text-slate-700">{bulkPreview.total}</span>
                    </div>
                  </div>
                  {bulkPreview.eligible === 0 ? (
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                      <p className="text-amber-700 text-sm">No eligible records found. Resolve vendor and item issues first.</p>
                    </div>
                  ) : (
                    <p className="text-slate-500 text-xs">This will create vouchers, journals, and GRNs for all {bulkPreview.eligible} eligible record(s). This action cannot be undone.</p>
                  )}
                  <div className="flex gap-2 pt-2">
                    <button onClick={() => setShowBulkConfirm(false)} className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                      Cancel
                    </button>
                    <button
                      onClick={executeBulkFinalize}
                      disabled={bulkPreview.eligible === 0 || bulkFinalizing}
                      className="flex-1 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-lg text-sm font-bold shadow hover:from-emerald-700 hover:to-teal-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {bulkFinalizing ? <><RefreshCw className="w-4 h-4 animate-spin" /> Processing...</> : <><Zap className="w-4 h-4" /> Finalize {bulkPreview.eligible} Voucher(s)</>}
                    </button>
                  </div>
                </>
              )}

              {/* Post-execution result */}
              {bulkResult && (
                <>
                  <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-600">Successfully Finalized</span>
                      <span className="font-bold text-emerald-700 text-lg">{bulkResult.processed}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-600">Skipped</span>
                      <span className="font-bold text-amber-600">{bulkResult.skipped}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-600">Failed</span>
                      <span className="font-bold text-red-600">{bulkResult.failed}</span>
                    </div>
                  </div>
                  {bulkResult.failed > 0 && bulkResult.errors.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 space-y-1 max-h-32 overflow-y-auto">
                      {bulkResult.errors.slice(0, 5).map((e: any, i: number) => (
                        <div key={i}><span className="font-bold">{e.invoice || `#${e.pending_id}`}:</span> {e.error}</div>
                      ))}
                    </div>
                  )}
                  <button onClick={() => setShowBulkConfirm(false)} className="w-full px-4 py-2 bg-slate-800 text-white rounded-lg text-sm font-bold hover:bg-slate-700 transition-colors">
                    Done
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
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
          <button
            onClick={openBulkConfirm}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-lg shadow-sm text-sm font-bold hover:from-emerald-700 hover:to-teal-700 transition-all"
            title="Finalize all eligible records (vendor + item resolved, voucher not yet saved)"
          >
            <Zap className="w-4 h-4" />
            Finalize &amp; Save All Eligible
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
                          <td className="px-3 py-3 text-[11px] text-gray-600 font-medium">
                            {(() => {
                              const ext = purchase.extraction_payload || {};
                              const extBranch = ext.branch || ext.sections?.supplier_details?.branch || ext.header?.branch;
                              const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(purchase.branch_id || '');
                              if (isUuid && extBranch) return extBranch;
                              return purchase.branch_id && !isUuid ? purchase.branch_id : (extBranch || '—');
                            })()}
                          </td>

                          {/* Amount */}
                          <td className="px-3 py-3 text-right font-black text-gray-900 text-[11px]">
                            ₹{(() => {
                              const ext = purchase.extraction_payload || {};
                              const header = ext.header || {};
                              let amt = purchase.amount;
                              if (!amt || Number(amt) === 0) {
                                amt = header.total_amount || header.invoice_total || ext.total_amount || ext.invoice_total || 0;
                              }
                              // Strip commas if it's a formatted string from extraction
                              if (typeof amt === 'string') amt = parseFloat(amt.replace(/[^\d.-]/g, '')) || 0;
                              return Number(amt).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                            })()}
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
                                    Total Items: {getLineItems(purchase).length}
                                  </span>
                                </div>
                                <table className="w-full text-left text-[11px]">
                                  <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-150 uppercase text-[9px] tracking-wider">
                                    <tr>
                                      <th className="px-3 py-2 w-10 text-center">#</th>
                                      <th className="px-3 py-2">Item Name</th>
                                      <th className="px-3 py-2">HSN/SAC</th>
                                      <th className="px-3 py-2">UOM</th>
                                      <th className="px-3 py-2 text-right">Quantity</th>
                                      <th className="px-3 py-2 text-right">Rate</th>
                                      <th className="px-3 py-2 text-right">Amount</th>
                                      <th className="px-3 py-2 text-center">Item Status</th>
                                      <th className="px-3 py-2 text-center">Action</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {getLineItems(purchase).map((item: any, itemIdx: number) => (
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
                                        <td className="px-3 py-2 text-right text-slate-600">{item.qty || item.quantity || '—'}</td>
                                        <td className="px-3 py-2 text-right text-slate-700 font-bold">₹{parseFloat(item.rate || item.unit_price || 0).toFixed(2)}</td>
                                        <td className="px-3 py-2 text-right text-slate-700 font-bold">₹{parseFloat(item.total_amount || item.amount || 0).toFixed(2)}</td>
                                        <td className="px-3 py-2 text-center whitespace-nowrap">
                                          <ItemStatusBadge status={item.item_status || ''} />
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                          {(item.item_status === 'CREATE ITEM' || item.item_status === 'ITEM_STATUS_CREATE' || !item.item_status) ? (
                                            <div className="flex items-center justify-center gap-1.5">
                                              <button
                                                onClick={() => openCreateItemModal(purchase, item)}
                                                className="bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white border border-amber-600 px-2.5 py-1 rounded text-[10px] font-bold cursor-pointer transition-colors shadow-sm whitespace-nowrap"
                                              >
                                                Create Item
                                              </button>
                                              <button
                                                onClick={() => openMatchItemModal(purchase, item, item.line_index ?? itemIdx)}
                                                className="bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white border border-indigo-700 px-2.5 py-1 rounded text-[10px] font-bold cursor-pointer transition-colors shadow-sm whitespace-nowrap flex items-center gap-1"
                                              >
                                                <Icon name="link" className="w-3 h-3" />
                                                Match Existing
                                              </button>
                                            </div>
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
