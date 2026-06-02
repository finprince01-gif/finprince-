import React, { useState, useEffect } from 'react';
import { httpClient } from '../../services';
import { Package, Search, ExternalLink, CheckCircle } from 'lucide-react';
import { CreateNewInventoryItemModal } from '../../components/CreateNewInventoryItemModal';

interface PendingPurchasesProps {
  onNavigate?: (page: string, params?: any) => void;
}

const PendingPurchases: React.FC<PendingPurchasesProps> = ({ onNavigate }) => {
  const [purchases, setPurchases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [isCreateItemModalOpen, setIsCreateItemModalOpen] = useState(false);
  const [itemResolvingRow, setItemResolvingRow] = useState<any>(null);
  const [extractedItemData, setExtractedItemData] = useState<any>(null);

  const fetchPurchases = async () => {
    try {
      const response = await httpClient.get<any>('/api/pending-purchases/');
      const data = Array.isArray(response) ? response : (response?.results || []);
      setPurchases(data.filter((p: any) => {
        if (p.pending_purchase_status === 'RESOLVED') return false;
        
        const vendorOk = p.vendor_status === 'ALREADY_EXIST' || p.vendor_status === 'VENDOR_STATUS_EXISTING';
        const voucherOk = p.voucher_status === 'ALREADY_EXIST' || p.voucher_status === 'VOUCHER_STATUS_EXISTING';
        const itemOk = p.item_status === 'ALREADY_EXIST' || p.item_status === 'ITEM_STATUS_EXISTING';
        
        if (vendorOk && voucherOk && itemOk) return false;
        return true;
      }));
    } catch (error) {
      console.error('Failed to fetch pending purchases', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPurchases();
  }, []);

  const resolvePurchase = async (id: number) => {
    try {
      await httpClient.post(`/api/pending-purchases/${id}/resolve/`);
      fetchPurchases();
    } catch (error) {
      console.error('Failed to resolve', error);
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

  const getStatusBadge = (status: string) => {
    if (status === 'ALREADY_EXIST' || status === 'RESOLVED') {
      return <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-semibold rounded-full">{status}</span>;
    }
    if (status === 'CREATE ITEM') {
      return <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded-full">{status}</span>;
    }
    return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-semibold rounded-full">{status}</span>;
  };

  return (
    <>
      {isCreateItemModalOpen && itemResolvingRow && (
        <CreateNewInventoryItemModal
          prefilledData={extractedItemData}
          onClose={() => {
            setIsCreateItemModalOpen(false);
            setItemResolvingRow(null);
          }}
          onItemCreated={(itemName, itemCode, itemId) => {
            setIsCreateItemModalOpen(false);
            // After item is created, we can attempt to re-validate the pending purchase
            // or simply refresh the list.
            fetchPurchases();
          }}
        />
      )}
      <div className="flex flex-col h-full bg-slate-50 relative p-6">
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
            Unresolved invoices requiring item creation before finalization.
          </p>
        </div>
        </div>
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
                    Loading pending purchases...
                  </td>
                </tr>
              ) : purchases.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-6 py-12 text-center">
                    <div className="mx-auto w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                      <Package className="w-8 h-8 text-slate-400" />
                    </div>
                    <p className="text-slate-600 font-medium">No pending purchases</p>
                    <p className="text-slate-400 text-sm mt-1">All invoices have been resolved.</p>
                  </td>
                </tr>
              ) : (
                purchases.map((purchase, idx) => {
                  const hasEffectiveMatch = purchase.vendor_status === 'ALREADY_EXIST' || purchase.vendor_status === 'VENDOR_STATUS_EXISTING';
                  return (
                  <React.Fragment key={purchase.id}>
                  <tr className="group hover:bg-indigo-50/40 transition-colors">
                    <td className="px-3 py-3 text-center text-xs font-bold text-gray-500">
                      {idx + 1}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col">
                          <div className="flex items-center gap-1.5 min-w-0">
                              <span className="truncate max-w-[120px] font-medium text-gray-700" title={purchase.source_document_hash || 'Unknown'}>
                                  {purchase.source_document_hash ? purchase.source_document_hash.substring(0, 16) + '...' : 'Unknown'}
                              </span>
                          </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 font-bold text-gray-800 text-[11px]">{purchase.invoice_number || '—'}</td>
                    <td className="px-3 py-3 text-[11px] text-gray-600 font-medium whitespace-nowrap">{purchase.invoice_date || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                          <span className="font-bold text-gray-900 text-[11px] leading-tight truncate max-w-[120px]" title={purchase.vendor_name}>{purchase.vendor_name || '—'}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 font-mono text-[10px] text-gray-500">{purchase.vendor_gstin || '—'}</td>
                    <td className="px-3 py-3 text-[11px] text-gray-600 font-medium">{purchase.branch_id || '—'}</td>
                    <td className="px-3 py-3 text-right font-black text-gray-900 text-[11px]">₹{purchase.amount ? Number(purchase.amount).toFixed(2) : '0.00'}</td>
                    
                    <td className="px-2 py-3 text-center text-[10px] font-bold uppercase whitespace-nowrap">
                        {hasEffectiveMatch ? (
                            <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-1 rounded inline-block">ALREADY EXIST</span>
                        ) : (
                            <span className="bg-orange-500 text-white border border-orange-600 px-2 py-1 rounded inline-block">Create Vendor</span>
                        )}
                    </td>

                    <td className="px-2 py-3 text-center text-[10px] font-bold uppercase whitespace-nowrap">
                        {purchase.item_status === 'ITEM_STATUS_CREATE' || purchase.item_status === 'CREATE ITEM' ? (
                            <div className="flex flex-col items-center gap-1">
                                <span className="bg-amber-100 text-amber-800 border border-amber-300 px-2 py-1 rounded inline-block">CREATE ITEM</span>
                                <button
                                    onClick={() => toggleExpandRow(purchase.id)}
                                    className="text-[9px] text-indigo-600 hover:text-indigo-800 font-bold underline focus:outline-none"
                                >
                                    {expandedRows.has(purchase.id) ? 'Hide Items' : 'Expand Items'}
                                </button>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-1">
                                <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-1 rounded inline-block">ALREADY EXIST</span>
                                <button
                                    onClick={() => toggleExpandRow(purchase.id)}
                                    className="text-[9px] text-indigo-600 hover:text-indigo-800 font-bold underline focus:outline-none"
                                >
                                    {expandedRows.has(purchase.id) ? 'Hide Items' : 'View Items'}
                                </button>
                            </div>
                        )}
                    </td>

                    <td className="px-2 py-3 text-center text-[10px] font-bold uppercase whitespace-nowrap">
                        {purchase.voucher_status === 'VOUCHER_STATUS_EXISTING' ? (
                            <span className="bg-indigo-100 text-indigo-700 border border-indigo-200 px-2 py-1 rounded inline-block">Need to Save</span>
                        ) : (
                            <span className="bg-gray-100 text-gray-400 border border-gray-200 px-2 py-1 rounded inline-block">Wait</span>
                        )}
                    </td>

                    <td className="px-2 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                          <button className="p-1 hover:bg-indigo-100 rounded text-indigo-400 hover:text-indigo-700 transition-colors" title="Revalidate vendor">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                          </button>
                          <button onClick={() => console.log('Edit', purchase.id)} className="p-1 hover:bg-indigo-100 rounded text-indigo-600" title="Edit in Purchase Voucher">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                          </button>
                          <button onClick={() => resolvePurchase(purchase.id)} className="p-1 hover:bg-emerald-100 rounded text-emerald-600" title="Resolve Pending Entry">
                              <CheckCircle className="w-4 h-4" />
                          </button>
                          <button onClick={() => console.log('Remove', purchase.id)} className="p-1 hover:bg-red-100 rounded text-red-600" title="Remove Invoice">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                          </button>
                      </div>
                    </td>
                  </tr>

                  {expandedRows.has(purchase.id) && (
                      <tr className="bg-slate-50/30">
                          <td colSpan={12} className="px-6 py-4">
                              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3">
                                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                      <span className="text-xs font-bold text-indigo-700 uppercase tracking-wider">Line Items Validation</span>
                                      <span className="text-[10px] text-gray-500 font-mono">Total Items: {purchase.review_payload?.items?.length || purchase.extraction_payload?.invoice?.items?.length || 0}</span>
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
                                                      {item.item_status === 'ALREADY EXIST' || item.item_status === 'ITEM_STATUS_EXISTING' ? (
                                                          <span className="bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded text-[9px] font-extrabold tracking-wider">ALREADY EXIST</span>
                                                      ) : (
                                                          <span className="bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded text-[9px] font-extrabold tracking-wider">CREATE ITEM</span>
                                                      )}
                                                  </td>
                                                  <td className="px-3 py-2 text-center">
                                                      {item.item_status === 'CREATE ITEM' || item.item_status === 'ITEM_STATUS_CREATE' || !item.item_status ? (
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
                )})
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
