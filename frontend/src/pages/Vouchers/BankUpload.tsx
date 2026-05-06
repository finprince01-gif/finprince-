import React, { useState, useRef, useCallback, useEffect } from 'react';
import { httpClient, apiService } from '../../services';
import Icon from '../../components/Icon';
import SearchableSelect from '../../components/SearchableSelect';
import { useBankPartyOptions } from './useBankPartyOptions';
import BankAllocationPanel, { AllocationState } from './BankAllocationPanel';

// ─── Types ────────────────────────────────────────────────────────────────────
interface StagedFile {
  id: number;
  file_name: string;
  account_id: number | null;
  uploaded_at: string;
  status: string;
  expires_at: string;
  transaction_count: number;
}

interface StagingRow {
  id: number;
  session_id: string;
  date: string;
  narration: string;
  voucher_number: string | null;
  debit: string | null;
  credit: string | null;
  ref_no: string | null;
  amount: string;
  inferred_type: 'payment' | 'receipt';
  ledger_id: number | null;
  ledger_name: string;
  bank_ledger_id: number | null;
  bank_ledger_name: string;
  status: 'draft' | 'mapped' | 'posted' | 'failed' | 'duplicate';

  error_message: string | null;
  voucher_id: number | null;
  allocation_data?: AllocationState | null;
  voucher_type_id?: number | null;
  voucher_name?: string;
  posting_note?: string;
}

interface Ledger { id?: number; name: string; group?: string; category?: string; }

type Step = 'upload' | 'map';

// ─── Component ────────────────────────────────────────────────────────────────
interface BankUploadProps {
  ledgers?: Ledger[];
  defaultType?: 'payment' | 'receipt' | 'mixed';
  onClose?: () => void;
}

const BankUpload: React.FC<BankUploadProps> = ({ ledgers = [], defaultType = 'mixed', onClose }) => {
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep]               = useState<Step>('upload');
  const [sessionId, setSessionId]     = useState<string | null>(null);
  const [allRows, setAllRows]         = useState<StagingRow[]>([]);
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [payFromOptions, setPayFromOptions] = useState<Ledger[]>([]);
  const [selectedType, setSelectedType] = useState<'payment' | 'receipt' | 'mixed'>(defaultType);
  const [uploading, setUploading]     = useState(false);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [posting, setPosting]         = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [postSuccess, setPostSuccess] = useState<string | null>(null);
  const [countdownSeconds, setCountdownSeconds] = useState(180);

  const [bankLedgerId, setBankLedgerId]     = useState<number | null>(null);
  const [bankLedgerName, setBankLedgerName] = useState('');
  
  // Date Range Filter State
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate]     = useState<string>('');

  // ── Voucher metadata state ────────────────────────────────────────────────
  const [paymentConfigs, setPaymentConfigs] = useState<any[]>([]);
  const [receiptConfigs, setReceiptConfigs] = useState<any[]>([]);
  const [rowVoucherTypeIds, setRowVoucherTypeIds] = useState<Record<number, number>>({});
  const [rowVoucherNumbers, setRowVoucherNumbers] = useState<Record<number, string>>({});

  // ── Allocation panel state ─────────────────────────────────────────────────
  const [panelRowId, setPanelRowId] = useState<number | null>(null);
  const [rowAllocations, setRowAllocations] = useState<Record<number, AllocationState>>({});

  // ── Duplicate visibility toggle ────────────────────────────────────────────
  const [showDuplicates, setShowDuplicates] = useState(true);

  // ── Countdown Timer Effect ────────────────────────────────────────────────
  useEffect(() => {
    let timer: any;
    if (uploading) {
      const file = fileRef.current?.files?.[0];
      const sizeMB = (file?.size || 0) / (1024 * 1024);
      // Rough heuristic: 60s base + 60s per MB, capped between 2-8 mins
      const estimate = Math.max(120, Math.min(480, Math.floor(60 + (sizeMB * 60))));
      
      setCountdownSeconds(estimate);
      timer = setInterval(() => {
        setCountdownSeconds(prev => prev > 1 ? prev - 1 : 1);
      }, 1000);
    } else {
      clearInterval(timer);
    }
    return () => clearInterval(timer);
  }, [uploading]);

  // Bank/cash ledger options — fetched from the unified Pay From endpoint
  useEffect(() => {
    const fetchPayFrom = async () => {
      try {
        const data = await apiService.getPayFromLedgers();
        setPayFromOptions(data || []);
      } catch (err) {
        console.error('Failed to fetch pay from ledgers:', err);
      }
    };
    fetchPayFrom();
  }, []);

  // Party options — single combined fetch (shared for payment + receipt)
  const { options: allPartyOptions, loading: partyLoading } = useBankPartyOptions();

  const fetchStagedFiles = useCallback(async () => {
    try {
      const data = await httpClient.get<StagedFile[]>('/api/bank-upload/staging/');
      setStagedFiles(data || []);
    } catch (err) {
      console.error('Failed to fetch staged files:', err);
    }
  }, []);

  useEffect(() => {
    if (step === 'upload') {
      fetchStagedFiles();
    }
  }, [step, fetchStagedFiles]);

  // Rows filtered by type AND date range (duplicates always included in allRows but
  // shown as disabled — hidden only when the user toggles them off)
  const filteredRows = allRows.filter(r => {
    if (selectedType !== 'mixed' && r.inferred_type !== selectedType) return false;
    if (startDate && r.date && r.date < startDate) return false;
    if (endDate && r.date && r.date > endDate) return false;
    if (r.status === 'duplicate' && !showDuplicates) return false;
    return true;
  });

  const duplicateRows = allRows.filter(r => r.status === 'duplicate');
  const mapped = filteredRows.filter(r => {
    const total = (rowAllocations[r.id]?.totalAllocated || r.allocation_data?.totalAllocated || 0);
    return total > 0 && r.status !== 'posted' && r.status !== 'duplicate';
  }).length;

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleProcessStaging = async (file: StagedFile) => {
    setProcessingId(file.id);
    setUploadError(null);
    try {
      const res = await httpClient.post<any>(`/api/bank-upload/staging/${file.id}/process/`, {
        bank_ledger_id: bankLedgerId,
        bank_ledger_name: bankLedgerName
      });
      
      setSessionId(res.session_id);
      const rows = res.rows || [];
      setAllRows(rows);

      // Fetch voucher configs
      const [p, r] = await Promise.all([
        httpClient.get<any[]>('/api/masters/master-voucher-payments/'),
        httpClient.get<any[]>('/api/masters/master-voucher-receipts/')
      ]);
      setPaymentConfigs(p || []);
      setReceiptConfigs(r || []);

      // Auto-assign configs
      const types: Record<number, number> = {};
      const nums: Record<number, string> = {};
      rows.forEach((row: any) => {
        const configs = row.inferred_type === 'payment' ? p : r;
        if (configs && configs.length > 0) {
          types[row.id] = configs[0].id;
          nums[row.id]  = 'Auto';
        }
      });
      setRowVoucherTypeIds(types);
      setRowVoucherNumbers(nums);

      setStep('map');
      setSelectedType('mixed');
    } catch (err: any) {
      setUploadError(err?.data?.error || 'Processing failed.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleUpload = useCallback(async () => {
    const file = fileRef.current?.files?.[0];
    if (!file || !bankLedgerId) {
      setUploadError('Please select both a bank account and a file.');
      return;
    }

    setUploading(true);
    setUploadError(null);
    setPostSuccess(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('bank_ledger_id', String(bankLedgerId));
      fd.append('bank_ledger_name', bankLedgerName);

      const res = await httpClient.postFormData<any>('/api/bank-upload/upload/', fd);
      
      // Success: refresh list but also IMMEDIATELY process to go inside
      await fetchStagedFiles();
      if (fileRef.current) fileRef.current.value = '';

      // Auto-transition to mapping step
      if (res.staging_id) {
        handleProcessStaging({
          id: res.staging_id,
          file_name: file.name,
          account_id: bankLedgerId,
          uploaded_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 15 * 86400000).toISOString(),
          transaction_count: res.count || 0,
          status: 'pending'
        });
      }
    } catch (err: any) {
      setUploadError(err?.data?.error || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }, [bankLedgerId, bankLedgerName, fetchStagedFiles, handleProcessStaging]);

  const handleDeleteStaging = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this pending upload?')) return;
    try {
      await httpClient.delete(`/api/bank-upload/staging/${id}/`);
      fetchStagedFiles();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const handlePickType = (type: 'payment' | 'receipt' | 'mixed') => {
    setSelectedType(type);
    setPanelRowId(null);
  };

  const handlePartyChange = useCallback(async (row: StagingRow, partyName: string) => {
    // Look up full option to get ledger_id (value is rawName, not label)
    const opt      = allPartyOptions.find(o => o.value === partyName);
    const ledgerId = opt?.ledger_id ? Number(opt.ledger_id) : null;

    try {
      const updated = await httpClient.patch<StagingRow>(`/api/bank-upload/rows/${row.id}/`, {
        ledger_id:   ledgerId,
        ledger_name: partyName,
        allocation_data: null, // Clear old allocation data when party changes
      });
      setAllRows(prev => prev.map(r => r.id === row.id ? updated : r));
      // Clear any existing allocation for this row since the party has changed
      setRowAllocations(prev => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      setPanelRowId(row.id);
    } catch (err) {
      console.error('Failed to update party mapping:', err);
    }
  }, [allPartyOptions]);

  const handleSaveAllocation = (rowId: number, state: AllocationState) => {
    setRowAllocations(prev => ({ ...prev, [rowId]: state }));
    setAllRows(prev => prev.map(r => r.id === rowId ? { ...r, status: 'mapped' } : r));
    setPanelRowId(null);
  };

  const handleClearAllocation = async (rowId: number) => {
    try {
      const updated = await httpClient.patch<StagingRow>(`/api/bank-upload/rows/${rowId}/`, {
        ledger_id: null,
        ledger_name: '',
        allocation_data: null
      });
      setAllRows(prev => prev.map(r => r.id === rowId ? updated : r));
      setRowAllocations(prev => {
        const next = { ...prev };
        delete next[rowId];
        return next;
      });
      setPanelRowId(null);
    } catch (err) {
      console.error('Failed to clear allocation:', err);
    }
  };

  const handlePost = useCallback(async () => {
    // Exclude duplicates from posting — backend enforces this too but we guard in UI
    const readyToPost = filteredRows.filter(r => {
      const total = (rowAllocations[r.id]?.totalAllocated || r.allocation_data?.totalAllocated || 0);
      return total > 0 && r.status !== 'posted' && r.status !== 'duplicate';
    });
    if (readyToPost.length === 0) return;

    setPosting(true);
    setUploadError(null);
    try {
      const payload = {
        allocations: readyToPost.map(r => ({
          row_id: r.id,
          allocation: {
            ...(rowAllocations[r.id] || r.allocation_data || {}),
            voucher_type_id: rowVoucherTypeIds[r.id],
            voucher_number: rowVoucherNumbers[r.id] === 'Auto' ? null : rowVoucherNumbers[r.id],
            posting_note: r.posting_note
          }
        }))
      };

      await httpClient.post(`/api/bank-upload/sessions/${sessionId}/post/`, payload);
      const res = await httpClient.get<any>(`/api/bank-upload/sessions/${sessionId}/`);
      setAllRows(res.rows || []);
      setPostSuccess(`Successfully posted ${readyToPost.length} vouchers.`);
    } catch (err: any) {
      setUploadError(err?.data?.error || 'Posting failed.');
    } finally {
      setPosting(false);
    }
  }, [sessionId, filteredRows, rowAllocations, rowVoucherTypeIds, rowVoucherNumbers]);

  const handleReset = () => {
    setStep('upload');
    setSessionId(null);
    setAllRows([]);
    setRowAllocations({});
    setRowVoucherTypeIds({});
    setRowVoucherNumbers({});
  };

  return (
    <div className="max-w-[1600px] mx-auto p-6">
      {/* ── HEADER ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-3">
            <span className="bg-indigo-600 text-white p-2 rounded-xl shadow-lg shadow-indigo-200">
              <Icon name="bank" className="w-6 h-6" />
            </span>
            Bank Statement Upload
          </h1>
          <p className="text-slate-500 text-sm mt-1">Extract and reconcile transactions with AI-powered mapping</p>
        </div>

        <button
          onClick={step === 'map' ? handleReset : onClose}
          className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 rounded-xl text-[10px] font-black text-slate-500 uppercase tracking-widest hover:bg-slate-50 hover:border-indigo-200 hover:text-indigo-600 transition-all shadow-sm group"
        >
          <Icon name="arrow-left" className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
          Back to Vouchers
        </button>
      </div>

      {/* ── STEP 1: Upload ────────────────────────────────────────────────── */}
      {step === 'upload' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 shadow-sm max-w-2xl mx-auto">
          <div className="grid grid-cols-2 gap-6 mb-8">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Bank / Cash Account *</label>
              <SearchableSelect
                value={String(bankLedgerId || '')}
                onChange={val => {
                  const id = Number(val);
                  const l = payFromOptions.find(x => x.id === id);
                  setBankLedgerId(id);
                  setBankLedgerName(l?.name || '');
                }}
                options={payFromOptions.map(l => ({ label: l.name, value: String(l.id) }))}
                placeholder="Select Account..."
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Upload File *</label>
              <input
                ref={fileRef}
                type="file"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-600 focus:outline-none file:mr-4 file:py-1 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-indigo-600 file:text-white hover:file:bg-indigo-700 cursor-pointer"
              />
            </div>
          </div>

          {/* New Date Range Row */}
          <div className="grid grid-cols-2 gap-6 mb-8 border-t border-slate-50 pt-8">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Extract From Date</label>
              <input 
                type="date" 
                value={startDate} 
                onChange={e => setStartDate(e.target.value)} 
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all" 
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Extract To Date</label>
              <input 
                type="date" 
                value={endDate} 
                onChange={e => setEndDate(e.target.value)} 
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all" 
              />
            </div>
          </div>
          {uploadError && <div className="p-4 mb-6 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm flex items-center gap-3"><Icon name="warning" className="w-5 h-5" /> {uploadError}</div>}
          <button onClick={handleUpload} disabled={uploading} className="w-full erp-button-primary py-4 rounded-xl text-lg shadow-xl shadow-indigo-100 flex items-center justify-center gap-3">
            <Icon name={uploading ? 'spinner' : 'upload'} className={`w-6 h-6 ${uploading ? 'animate-spin' : ''}`} />
            {uploading ? (
              <div className="flex flex-col items-center">
                <span className="font-black animate-pulse">
                  {countdownSeconds > 1 
                    ? `Analyzing Statement... ${Math.floor(countdownSeconds / 60)}:${(countdownSeconds % 60).toString().padStart(2, '0')}`
                    : "Still processing large document..."
                  }
                </span>
                <span className="text-[10px] opacity-70 font-bold uppercase tracking-wider mt-0.5">
                  {countdownSeconds > 30 ? 'Estimated time remaining' : 'Finalizing extraction results...'}
                </span>
              </div>
            ) : 'Upload & Extract'}
          </button>

          {/* ── Pending Uploads Section ── */}
          {stagedFiles.length > 0 && (
            <div className="mt-12 pt-8 border-t border-slate-100">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                  <Icon name="clock" className="w-4 h-4 text-indigo-500" />
                  Pending Bank Uploads
                  <span className="bg-indigo-100 text-indigo-600 px-2.5 py-0.5 rounded-full text-[10px] ml-1">{stagedFiles.length}</span>
                </h3>
                <p className="text-[10px] text-slate-400 italic">Records older than 15 days are automatically purged.</p>
              </div>
              
              <div className="grid gap-4">
                {stagedFiles.map(file => (
                  <div
                    key={file.id}
                    onClick={() => !processingId && handleProcessStaging(file)}
                    className={`flex items-center justify-between p-5 rounded-2xl border transition-all cursor-pointer group relative ${
                      processingId === file.id 
                        ? 'bg-indigo-50 border-indigo-200 ring-4 ring-indigo-500/10' 
                        : 'bg-white border-slate-100 hover:border-indigo-300 hover:shadow-xl hover:shadow-indigo-500/5 hover:-translate-y-0.5'
                    }`}
                  >
                    <div className="flex items-center gap-5">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${
                        file.status === 'processed' 
                          ? 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100' 
                          : 'bg-amber-50 text-amber-600 group-hover:bg-amber-100'
                      }`}>
                        <Icon name={processingId === file.id ? 'spinner' : 'file-text'} className={`w-7 h-7 ${processingId === file.id ? 'animate-spin' : ''}`} />
                      </div>
                      <div>
                        <div className="text-base font-black text-slate-800 group-hover:text-indigo-600 transition-colors">{file.file_name}</div>
                        <div className="flex items-center gap-3 mt-1.5">
                          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-50 rounded text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                            <Icon name="clock" className="w-3 h-3" />
                            {new Date(file.uploaded_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                          </div>
                          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-50 rounded text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                            <Icon name="file-text" className="w-3 h-3" />
                            {file.transaction_count} Rows
                          </div>
                          <div className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${
                            file.status === 'processed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {file.status}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm ${
                        file.status === 'processed' 
                          ? 'bg-emerald-600 text-white shadow-emerald-200' 
                          : 'bg-indigo-600 text-white shadow-indigo-200'
                      } hover:scale-105 active:scale-95`}>
                        {processingId === file.id ? 'Loading...' : file.status === 'processed' ? 'Resume' : 'Process Now'}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteStaging(file.id);
                        }}
                        className="p-2.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                        title="Delete Staging"
                      >
                        <Icon name="trash" className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── STEP 3: Map & Post ────────────────────────────────────────────── */}
      {step === 'map' && (
        <div className="space-y-6">
          <div className="bg-indigo-600 rounded-2xl p-6 flex items-center justify-between text-white shadow-xl shadow-indigo-100">
            <div className="flex items-center gap-4">
              <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-sm"><Icon name="check-circle" className="w-8 h-8" /></div>
              <div>
                <h3 className="text-2xl font-black">Processing Complete</h3>
                <p className="text-indigo-100 text-sm font-medium opacity-80">{filteredRows.length} transactions imported and ready for reconciliation</p>
              </div>
            </div>
            <button onClick={handleReset} className="p-2 hover:bg-white/10 rounded-full transition-colors"><Icon name="close" className="w-6 h-6" /></button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex items-end justify-between gap-8">
            <div className="flex items-center gap-8 flex-[2]">
              <div className="flex-1">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Bank Account</label>
                <div className="px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold text-slate-700">{bankLedgerName}</div>
              </div>
              <div className="flex-1">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Type</label>
                <select value={selectedType} onChange={e => handlePickType(e.target.value as any)} className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-bold text-slate-700 focus:outline-none">
                  <option value="mixed">Mixed (All)</option>
                  <option value="payment">Payments (Out)</option>
                  <option value="receipt">Receipts (In)</option>
                </select>
              </div>
              <div className="flex-[1.5]">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Date Range</label>
                <div className="flex items-center gap-3">
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="flex-1 px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  <span className="text-slate-300 font-bold">to</span>
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="flex-1 px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4 bg-slate-50 p-2 rounded-2xl border border-slate-100">
              <div className="px-6 py-2">
                <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5 text-center">SAVED ROWS</span>
                <span className="block text-2xl font-black text-indigo-600 text-center">{mapped}</span>
              </div>
              <button onClick={handlePost} disabled={posting || mapped === 0} className="erp-button-primary h-[56px] px-10 rounded-xl shadow-lg shadow-indigo-100">
                <Icon name={posting ? 'spinner' : 'check'} className={`w-5 h-5 mr-3 ${posting ? 'animate-spin' : ''}`} />
                {posting ? 'Posting...' : 'POST ALL SAVED'}
              </button>
            </div>
          </div>

          {postSuccess && <div className="p-4 bg-green-50 border border-green-100 rounded-xl text-green-700 text-sm font-bold flex items-center gap-3"><Icon name="check-circle" className="w-5 h-5" /> {postSuccess}</div>}

          {/* Duplicate warning banner */}
          {duplicateRows.length > 0 && (
            <div className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs font-semibold mb-0">
              <div className="flex items-center gap-2">
                <span className="text-amber-500 text-base">⚠️</span>
                <span>{duplicateRows.length} duplicate transaction{duplicateRows.length > 1 ? 's' : ''} detected — these will not be posted.</span>
              </div>
              <button
                onClick={() => setShowDuplicates(v => !v)}
                className="ml-4 px-3 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 border border-amber-300 text-amber-800 text-[10px] font-bold uppercase tracking-widest transition-all"
              >
                {showDuplicates ? 'Hide Duplicates' : 'Show Duplicates'}
              </button>
            </div>
          )}

          <div className="flex items-start gap-6 relative">
            {/* Table Area */}
            <div className={`transition-all duration-300 min-w-0 ${panelRowId ? 'flex-[0.55]' : 'flex-1'}`}>
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-200">
                      <th className="text-left p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Date</th>
                      <th className="text-left p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Narration</th>
                      <th className="text-left p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest" style={{ minWidth: 130 }}>Ref No</th>
                      <th className="text-right p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Amount</th>
                      <th className="text-left p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest" style={{ minWidth: 240 }}>Party / Ledger</th>
                      <th className="text-left p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest" style={{ minWidth: 160 }}>Voucher Type</th>
                      <th className="text-left p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest" style={{ minWidth: 120 }}>Voucher No</th>
                      <th className="text-left p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest" style={{ minWidth: 180 }}>Posting Note</th>
                      <th className="text-center p-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Allocated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRows.map(row => {
                      const configs = row.inferred_type === 'payment' ? paymentConfigs : receiptConfigs;
                      const vTypeId = rowVoucherTypeIds[row.id];
                      const isActive = panelRowId === row.id;

                      return (
                        <tr key={row.id} className={`transition-all ${
                          row.status === 'duplicate'
                            ? 'bg-amber-50/60 opacity-70'
                            : isActive
                              ? 'bg-indigo-50 ring-2 ring-inset ring-indigo-500'
                              : row.status === 'posted'
                                ? 'bg-slate-50'
                                : 'hover:bg-slate-50/50'
                        }`}>
                          <td className="p-4 text-slate-500 font-bold whitespace-nowrap">{row.date?.split('-').reverse().join('-')}</td>
                          <td className="p-4 max-w-[400px]"><div className="text-slate-800 text-xs font-medium leading-relaxed">{row.narration}</div></td>
                          <td className="p-3">
                            <input
                              type="text"
                              value={row.ref_no || ''}
                              onChange={async e => {
                                const val = e.target.value;
                                try {
                                  const updated = await httpClient.patch<StagingRow>(`/api/bank-upload/rows/${row.id}/`, { ref_no: val });
                                  setAllRows(prev => prev.map(r => r.id === row.id ? updated : r));
                                } catch (err) {
                                  console.error('Failed to update ref_no:', err);
                                }
                              }}
                              placeholder="—"
                              disabled={row.status === 'posted' || row.status === 'duplicate'}
                              className={`w-full px-2 py-1.5 rounded-lg text-xs font-mono border transition-all focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                                row.ref_no
                                  ? 'bg-indigo-50 border-indigo-200 text-indigo-800 font-bold'
                                  : 'bg-slate-50 border-slate-200 text-slate-400'
                              } ${(row.status === 'posted' || row.status === 'duplicate') ? 'opacity-60 cursor-not-allowed' : ''}`}
                            />
                          </td>
                          <td className="p-4 text-right">
                            <div className={`text-sm font-black ${row.inferred_type === 'payment' ? 'text-orange-600' : 'text-emerald-600'}`}>
                              ₹{parseFloat(row.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </div>
                          </td>
                          <td className="p-4">
                            <div className="flex flex-col gap-1.5">
                              {(() => {
                                const totalAllocated = (rowAllocations[row.id]?.totalAllocated || row.allocation_data?.totalAllocated || 0);
                                return totalAllocated > 0 && row.status !== 'posted' && (
                                  <div className="flex items-center gap-1.5 px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-md border border-indigo-100 w-fit">
                                    <Icon name="check" className="w-2.5 h-2.5" />
                                    <span className="text-[9px] font-black uppercase tracking-wider">Saved to Post</span>
                                  </div>
                                );
                              })()}
                              <SearchableSelect
                                value={row.ledger_name || ''}
                                onChange={val => handlePartyChange(row, val)}
                                options={partyLoading
                                  ? [{ label: 'Loading parties…', value: '__loading__' }]
                                  : allPartyOptions.map(o => ({ label: o.label, value: o.value }))
                                }
                                placeholder={partyLoading ? 'Loading…' : 'Select Party...'}
                                disabled={row.status === 'posted' || row.status === 'duplicate' || partyLoading}
                              />
                            </div>
                          </td>
                          <td className="p-4">
                            <select
                              value={vTypeId || ''}
                              disabled={row.status === 'posted' || row.status === 'duplicate'}
                              onChange={e => {
                                const id = Number(e.target.value);
                                setRowVoucherTypeIds(prev => ({ ...prev, [row.id]: id }));
                                const cfg = configs.find(c => c.id === id);
                                if (cfg?.enable_auto_numbering) {
                                  const endpoint = row.inferred_type === 'payment' ? '/api/masters/master-voucher-payments/' : '/api/masters/master-voucher-receipts/';
                                  httpClient.get<any>(`${endpoint}${cfg.id}/next-number/`).then(res => {
                                    setRowVoucherNumbers(prev => ({ ...prev, [row.id]: res.invoice_number || 'Auto' }));
                                  });
                                }
                              }}
                              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <option value="">Select Type</option>
                              {configs.map(cfg => <option key={cfg.id} value={cfg.id}>{cfg.voucher_name}</option>)}
                            </select>
                          </td>
                          <td className="p-4">
                            <input
                              type="text"
                              value={rowVoucherNumbers[row.id] || ''}
                              onChange={e => setRowVoucherNumbers(prev => ({ ...prev, [row.id]: e.target.value }))}
                              placeholder="Auto"
                              disabled={row.status === 'posted' || row.status === 'duplicate'}
                              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                          </td>
                          <td className="p-4">
                            <input
                              type="text"
                              value={row.posting_note || ''}
                              onChange={e => {
                                const val = e.target.value;
                                setAllRows(prev => prev.map(r => r.id === row.id ? { ...r, posting_note: val } : r));
                              }}
                              placeholder="Add note..."
                              disabled={row.status === 'posted' || row.status === 'duplicate'}
                              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                            />
                          </td>
                          <td className="p-4 text-center">
                            {!row.ledger_id ? (
                              <span className="text-slate-300 font-bold">--</span>
                            ) : row.status === 'posted' ? (
                              <span className="text-emerald-600 font-black text-[10px] uppercase tracking-widest">Posted</span>
                            ) : (
                              <div className="flex flex-col items-center gap-0.5">
                                <div className="text-xs font-bold text-slate-700">
                                  ₹{(rowAllocations[row.id]?.totalAllocated || row.allocation_data?.totalAllocated || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                </div>
                                <button
                                  onClick={() => setPanelRowId(isActive ? null : row.id)}
                                  className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 uppercase tracking-wider"
                                >
                                  <span className="text-[8px]">▼</span> Edit
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Allocation Panel Area */}
            {panelRowId && (() => {
              const row = allRows.find(r => r.id === panelRowId)!;
              // Resolve full party option including type/id/category so the
              // allocation panel can load vendor/customer transactions correctly
              const fullPartyOption = allPartyOptions.find(o => o.value === row.ledger_name);
              const partyOption = fullPartyOption ?? {
                label:     row.ledger_name || 'Unknown',
                value:     row.ledger_name || '',
                ledger_id: row.ledger_id,
                id:        row.ledger_id,
                name:      row.ledger_name || '',
                type:      'ledger' as const,
                category:  row.inferred_type === 'payment' ? 'vendor' : 'customer' as any,
              };

              return (
                <div className="flex-[0.45] sticky top-6 bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden animate-slide-in-right z-10 h-[calc(100vh-200px)] flex flex-col">
                  <BankAllocationPanel
                    key={panelRowId}
                    row={row}
                    voucherType={row.inferred_type}
                    partyOption={partyOption}
                    savedState={rowAllocations[panelRowId] || row.allocation_data}
                    onClose={async (isCancel) => {
                      if (isCancel && panelRowId) {
                        await handleClearAllocation(panelRowId);
                      }
                      setPanelRowId(null);
                    }}
                    onSave={handleSaveAllocation}
                  />
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

export default BankUpload;
