import re

file_path = r"d:\ledger_report0.22\AI-accounting-0.03\frontend\src\pages\Reports\Reports.tsx"

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

start_marker = "  // ═══ LEVEL 2: Detail view — full transactions for a specific ledger ═════════\n  const renderLedgerDetail = () => {"
end_marker = "    );\n  };\n\n  const renderTrialBalance = () => ("

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx == -1 or end_idx == -1:
    print(f"Markers not found: start_idx={start_idx}, end_idx={end_idx}")
else:
    new_content = """  // ═══ LEVEL 2: Detail view — full transactions for a specific ledger ═════════
  const renderLedgerDetail = () => {
    const last = drillDownEntries[drillDownEntries.length - 1];
    const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-IN') : '-';
    const totalDr = filteredDrillData.reduce((s, e) => s + (e.debit || 0), 0);
    const totalCr = filteredDrillData.reduce((s, e) => s + (e.credit || 0), 0);

    const viewBtns = [
      { key: 'ledger', label: 'Bill-wise View' },
      { key: 'journal', label: 'Journal View' },
      { key: 'month', label: 'Month View' },
      { key: 'allocation', label: 'Allocation View' },
    ] as const;

    return (
      <div>
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-4 text-sm">
          <button onClick={() => setDrillDownLedger(null)} className="flex items-center gap-1 text-indigo-600 hover:text-indigo-900 font-semibold transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            All Ledgers
          </button>
          <span className="text-gray-300">/</span>
          <span className="font-bold text-gray-800">{drillDownLedger}</span>
        </div>

        {/* Header + View Switcher */}
        <div className="erp-card border border-slate-200 overflow-hidden p-0 mb-4">
          <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 bg-gray-50">
            <div>
              <div className="text-xs text-indigo-500 uppercase font-bold tracking-widest mb-1">Ledger Account</div>
              <div className="text-xl font-bold text-indigo-900">{drillDownLedger}</div>
            </div>
            <div className="flex items-center gap-3">
              {last && (
                <div className="text-right mr-4">
                  <div className="text-xs text-gray-500 uppercase font-bold tracking-widest mb-1">Closing Balance</div>
                  <div className={`text-2xl font-bold ${last.balanceType==='Dr'?'text-orange-600':'text-green-700'}`}>
                    ₹{last.balance.toFixed(2)}
                    <span className={`ml-2 text-sm px-2 py-0.5 rounded font-semibold ${last.balanceType==='Dr'?'bg-orange-100 text-orange-700':'bg-green-100 text-green-700'}`}>{last.balanceType}</span>
                  </div>
                </div>
              )}
              {viewBtns.map(b => (
                <button key={b.key} onClick={() => setLedgerViewMode(b.key as any)}
                  className={`px-4 py-2 rounded-[4px] text-sm font-medium border transition-colors shadow-sm ${ledgerViewMode===b.key ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                  {b.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── LEDGER / JOURNAL VIEW ── */}
        {(ledgerViewMode === 'ledger' || ledgerViewMode === 'journal') && (
          <div className="erp-card border border-slate-200 overflow-hidden p-0">
            {isDrillDownLoading ? (
              <div className="flex items-center justify-center py-16 gap-3 text-indigo-600">
                <svg className="animate-spin h-6 w-6" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                <span className="text-sm font-semibold">Loading transactions...</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="erp-table min-w-full">
                  <thead className="bg-[#F8F9FA] border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider border-r border-slate-200">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider border-r border-slate-200">Particulars</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider border-r border-slate-200">Voucher No</th>
                      <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider border-r border-slate-200">Type</th>
                      <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider border-r border-slate-200">Debit (₹)</th>
                      <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider border-r border-slate-200">Credit (₹)</th>
                      <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Running Bal</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {filteredDrillData.length > 0 ? filteredDrillData.map((e, idx) => (
                      <tr key={`dd-${idx}`}
                        onClick={() => e.voucherType !== 'Opening' && setSelectedTransaction({ ...e, ledgerName: drillDownLedger })}
                        className={`transition-colors ${e.voucherType==='Opening' ? 'bg-indigo-50/50 cursor-default' : 'hover:bg-indigo-50 cursor-pointer'}`}>
                        <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap border-r border-gray-50">{fmtDate(e.date)}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900 border-r border-gray-50">{e.particulars||'-'}</td>
                        <td className="px-4 py-3 text-sm text-indigo-500 font-mono whitespace-nowrap border-r border-gray-50">{e.voucherNo||'-'}</td>
                        <td className="px-4 py-3 whitespace-nowrap border-r border-gray-50">
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${e.voucherType==='Payment'?'bg-orange-100 text-orange-700':e.voucherType==='Receipt'?'bg-green-100 text-green-700':e.voucherType==='Opening'?'bg-indigo-100 text-indigo-700':e.voucherType==='Sales'?'bg-blue-100 text-blue-700':e.voucherType==='Purchase'?'bg-purple-100 text-purple-700':'bg-gray-100 text-gray-700'}`}>{e.voucherType||'-'}</span>
                        </td>
                        <td className="px-4 py-3 text-sm font-mono text-right font-semibold text-orange-600 border-r border-gray-50">{e.debit>0?`₹${e.debit.toFixed(2)}`:''}</td>
                        <td className="px-4 py-3 text-sm font-mono text-right font-semibold text-green-700 border-r border-gray-50">{e.credit>0?`₹${e.credit.toFixed(2)}`:''}</td>
                        <td className={`px-4 py-3 text-sm font-mono text-right font-bold whitespace-nowrap ${e.balanceType==='Dr'?'text-orange-600':e.balanceType==='Cr'?'text-green-700':'text-gray-400'}`}>
                          {e.balance>0 ? <>{`₹${e.balance.toFixed(2)} `}<span className={`text-xs px-1 py-0.5 rounded ${e.balanceType==='Dr'?'bg-orange-100 text-orange-700':'bg-green-100 text-green-700'}`}>{e.balanceType}</span></> : <span className="text-gray-300">₹0.00</span>}
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan={7} className="px-6 py-12 text-center text-sm text-gray-400">No transactions found for <strong>{drillDownLedger}</strong>.</td></tr>
                    )}
                  </tbody>
                  {filteredDrillData.length > 0 && (
                    <tfoot className="bg-gray-50 border-t-2 border-gray-200 font-bold">
                      <tr>
                        <td colSpan={4} className="px-4 py-3 text-sm text-gray-700">Total</td>
                        <td className="px-4 py-3 text-sm font-mono text-right text-orange-600">₹{totalDr.toFixed(2)}</td>
                        <td className="px-4 py-3 text-sm font-mono text-right text-green-700">₹{totalCr.toFixed(2)}</td>
                        <td className={`px-4 py-3 text-sm font-mono text-right ${last?.balanceType==='Dr'?'text-orange-600':'text-green-700'}`}>{last?`₹${last.balance.toFixed(2)} ${last.balanceType}`:''}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── MONTH VIEW ── */}
        {ledgerViewMode === 'month' && (
          <div className="erp-card border border-slate-200 p-0">
            <div className="flex justify-between items-center px-6 py-3 border-b border-gray-200 bg-gray-50">
              <span className="text-sm font-semibold text-gray-700">Monthly Summary — {drillDownLedger}</span>
              <div className="relative">
                <button onClick={() => setIsMonthFilterOpen(!isMonthFilterOpen)}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-[4px] text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                  <span>{selectedMonths.length > 0 ? `${selectedMonths.length} Selected` : 'All Months'}</span>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
                </button>
                {isMonthFilterOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                    {['April','May','June','July','August','September','October','November','December','January','February','March'].map(m => (
                      <label key={m} className="flex items-center px-4 py-2 hover:bg-gray-50 cursor-pointer">
                        <input type="checkbox" checked={selectedMonths.includes(m)} onChange={() => setSelectedMonths(selectedMonths.includes(m) ? selectedMonths.filter(x=>x!==m) : [...selectedMonths, m])} className="w-4 h-4 text-indigo-600 border-gray-300 rounded"/>
                        <span className="ml-2 text-sm text-gray-700">{m}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-[#F8F9FA]">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider w-1/4">Month</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider w-1/4">Debit</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider w-1/4">Credit</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider w-1/4">Closing Balance</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {ledgerMonthData.filter(e => selectedMonths.length === 0 || selectedMonths.includes(e.month)).map((e, i) => (
                    <tr key={i} onClick={() => { setLedgerFilters(f => ({ ...f, date: `-${monthNameToNumber[e.month]}-` })); setLedgerViewMode('ledger'); }}
                      className="hover:bg-indigo-50 transition-colors cursor-pointer group">
                      <td className="px-6 py-5 text-sm font-bold text-gray-700 group-hover:text-indigo-600">{e.month}</td>
                      <td className="px-6 py-5 text-sm text-right text-gray-600 font-medium">{e.debit !== '-' ? `₹${e.debit}` : '-'}</td>
                      <td className="px-6 py-5 text-sm text-right text-gray-600 font-medium">{e.credit !== '-' ? `₹${e.credit}` : '-'}</td>
                      <td className="px-6 py-5 text-sm text-right font-bold text-gray-900">
                        {e.closingBalance !== '-' ? <>₹{Math.abs(e.rawBalance).toLocaleString('en-IN',{minimumFractionDigits:2})}<span className="ml-1 text-gray-500 text-xs font-normal">{e.rawBalance>0?'Dr':'Cr'}</span></> : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-[#F8F9FA]">
                  <tr>
                    <td className="px-6 py-4 text-sm font-bold text-gray-500 text-center tracking-wide">TOTAL</td>
                    <td className="px-6 py-4 text-sm text-right font-bold text-gray-900">₹{ledgerMonthData.reduce((s,e)=>s+(e.debit!=='-'?parseFloat(e.debit.replace(/,/g,'')):0),0).toLocaleString('en-IN',{minimumFractionDigits:2})}</td>
                    <td className="px-6 py-4 text-sm text-right font-bold text-gray-900">₹{ledgerMonthData.reduce((s,e)=>s+(e.credit!=='-'?parseFloat(e.credit.replace(/,/g,'')):0),0).toLocaleString('en-IN',{minimumFractionDigits:2})}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* ── ALLOCATION VIEW ── */}
        {ledgerViewMode === 'allocation' && (
          <div className="erp-card border border-slate-200 overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="erp-table min-w-full">
                <thead className="bg-[#F8F9FA] border-b border-slate-200">
                  <tr className="border-b border-slate-200">
                    <th rowSpan={2} className="px-6 py-4 text-left text-[11px] font-black text-slate-500 uppercase tracking-widest border-r border-slate-200">Date</th>
                    <th rowSpan={2} className="px-6 py-4 text-left text-[11px] font-black text-slate-500 uppercase tracking-widest border-r border-slate-200">Posted From</th>
                    <th rowSpan={2} className="px-6 py-4 text-left text-[11px] font-black text-slate-500 uppercase tracking-widest border-r border-slate-200">Reference No.</th>
                    <th rowSpan={2} className="px-6 py-4 text-right text-[11px] font-black text-slate-500 uppercase tracking-widest border-r border-slate-200">Amount</th>
                    <th colSpan={3} className="px-6 py-2 border-r border-slate-200 bg-indigo-50/30 text-center text-[11px] font-black text-indigo-600 uppercase tracking-widest">Voucher Applied</th>
                    <th rowSpan={2} className="px-6 py-4 text-center text-[11px] font-black text-slate-500 uppercase tracking-widest">Status</th>
                  </tr>
                  <tr>
                    <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest border-r border-slate-200">Date</th>
                    <th className="px-6 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest border-r border-slate-200">Ref No.</th>
                    <th className="px-6 py-3 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest border-r border-slate-200">Pending</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allocationRows.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                      {row.isFirstInSource && (
                        <>
                          <td rowSpan={row.rowSpan} className="px-6 py-4 text-sm font-medium text-slate-600 border-r border-slate-100 align-top">{row.date ? new Date(row.date).toLocaleDateString('en-IN') : '-'}</td>
                          <td rowSpan={row.rowSpan} className="px-6 py-4 text-sm text-slate-600 border-r border-slate-100 align-top">
                            <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${row.postedFrom==='Purchase'?'bg-blue-50 text-blue-600 border border-blue-100':row.postedFrom==='Sales'?'bg-emerald-50 text-emerald-600 border border-emerald-100':'bg-slate-50 text-slate-600 border border-slate-100'}`}>{row.postedFrom}</span>
                          </td>
                          <td rowSpan={row.rowSpan} className="px-6 py-4 text-sm font-bold text-indigo-600 border-r border-slate-100 align-top">{row.refNo}</td>
                          <td rowSpan={row.rowSpan} className="px-6 py-4 text-sm text-right font-medium text-slate-900 border-r border-slate-100 align-top">{row.netAmount !== '-' ? `₹${Number(row.netAmount).toLocaleString('en-IN',{minimumFractionDigits:2})}` : '-'}</td>
                        </>
                      )}
                      <td className="px-6 py-4 text-sm text-slate-600 border-r border-slate-100">{row.appliedDate !== '-' ? new Date(row.appliedDate).toLocaleDateString('en-IN') : '-'}</td>
                      <td className="px-6 py-4 text-sm font-medium text-slate-700 border-r border-slate-100">{row.appliedRefNo}</td>
                      <td className="px-6 py-4 text-sm text-right font-bold text-slate-900 border-r border-slate-100">{row.pendingBalance !== '-' ? `₹${Number(row.pendingBalance).toLocaleString('en-IN',{minimumFractionDigits:2})}` : '-'}</td>
                      {row.isFirstInSource && (
                        <td rowSpan={row.rowSpan} className="px-6 py-4 text-center align-top">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${row.status==='Paid'||row.status==='Utilized'?'bg-emerald-50 text-emerald-600 border border-emerald-100':row.status==='Partially Paid'?'bg-amber-50 text-amber-600 border border-amber-100':row.status==='Due'?'bg-rose-50 text-rose-600 border border-rose-100':'bg-indigo-50 text-indigo-600 border border-indigo-100'}`}>{row.status}</span>
                        </td>
                      )}
                    </tr>
                  ))}
                  {allocationRows.length === 0 && (
                    <tr><td colSpan={8} className="px-6 py-20 text-center text-slate-400 text-sm">No allocation data found for <strong>{drillDownLedger}</strong>.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Transaction Detail Slide-Out Panel (Zoho Books style) ── */}
        {selectedTransaction && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
              onClick={() => setSelectedTransaction(null)}
              style={{ animation: 'fadeIn 0.15s ease' }}
            />
            {/* Slide panel */}
            <div
              className="fixed top-0 right-0 h-full w-full max-w-md z-50 bg-white shadow-2xl flex flex-col"
              style={{ animation: 'slideInRight 0.22s cubic-bezier(0.4,0,0.2,1)' }}
            >
              {/* Panel header */}
              <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white flex-shrink-0">
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest text-indigo-200 mb-0.5">Transaction Details</div>
                  <div className="text-lg font-bold">{selectedTransaction.voucherNo || 'N/A'}</div>
                </div>
                <button
                  onClick={() => setSelectedTransaction(null)}
                  className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                  aria-label="Close panel"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className={`px-6 py-2 text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${
                selectedTransaction.voucherType === 'PAYMENT' || selectedTransaction.voucherType === 'Payment' ? 'bg-orange-50 text-orange-700 border-b border-orange-100' :
                selectedTransaction.voucherType === 'RECEIPT' || selectedTransaction.voucherType === 'Receipt' ? 'bg-green-50 text-green-700 border-b border-green-100' :
                selectedTransaction.voucherType === 'Sales' ? 'bg-blue-50 text-blue-700 border-b border-blue-100' :
                selectedTransaction.voucherType === 'Purchase' ? 'bg-purple-50 text-purple-700 border-b border-purple-100' :
                'bg-gray-50 text-gray-600 border-b border-gray-100'
              }`}>
                {selectedTransaction.voucherType} Voucher
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-orange-50 rounded-xl p-4 border border-orange-100">
                    <div className="text-xs font-semibold text-orange-500 uppercase">Debit</div>
                    <div className="text-xl font-bold text-orange-700">{selectedTransaction.debit > 0 ? `₹${selectedTransaction.debit.toFixed(2)}` : '—'}</div>
                  </div>
                  <div className="bg-green-50 rounded-xl p-4 border border-green-100">
                    <div className="text-xs font-semibold text-green-500 uppercase">Credit</div>
                    <div className="text-xl font-bold text-green-700">{selectedTransaction.credit > 0 ? `₹${selectedTransaction.credit.toFixed(2)}` : '—'}</div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-xl border border-gray-100 overflow-hidden">
                  <div className="px-4 py-2.5 bg-gray-100 border-b border-gray-200">
                    <span className="text-xs font-bold text-gray-500 uppercase">Voucher Info</span>
                  </div>
                  {[
                    { label: 'Ledger Account', value: selectedTransaction.ledgerName },
                    { label: 'Date', value: selectedTransaction.date ? new Date(selectedTransaction.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) : '-' },
                    { label: 'Voucher No', value: selectedTransaction.voucherNo || '-' },
                    { label: 'Voucher Type', value: selectedTransaction.voucherType || '-' },
                    { label: 'Particulars', value: selectedTransaction.particulars || '-' },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-start justify-between px-4 py-3 border-b border-gray-100 last:border-b-0">
                      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide w-28 flex-shrink-0">{label}</span>
                      <span className="text-sm font-semibold text-gray-800 text-right">{value}</span>
                    </div>
                  ))}
                </div>

                {/* Accounting entry preview */}
                <div className="bg-gray-50 rounded-xl border border-gray-100 overflow-hidden">
                  <div className="px-4 py-2.5 bg-gray-100 border-b border-gray-200">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Journal Entry</span>
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="px-4 py-2 text-left font-semibold text-gray-500">Account</th>
                        <th className="px-4 py-2 text-right font-semibold text-gray-500">Dr</th>
                        <th className="px-4 py-2 text-right font-semibold text-gray-500">Cr</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedTransaction.debit > 0 && (
                        <tr className="border-b border-gray-100">
                          <td className="px-4 py-2.5 font-semibold text-gray-800">{selectedTransaction.ledgerName}</td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold text-orange-600">₹{selectedTransaction.debit.toFixed(2)}</td>
                          <td className="px-4 py-2.5 text-right text-gray-300">—</td>
                        </tr>
                      )}
                      {selectedTransaction.credit > 0 && (
                        <tr className="border-b border-gray-100">
                          <td className="px-4 py-2.5 font-semibold text-gray-800">{selectedTransaction.ledgerName}</td>
                          <td className="px-4 py-2.5 text-right text-gray-300">—</td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold text-green-600">₹{selectedTransaction.credit.toFixed(2)}</td>
                        </tr>
                      )}
                      {selectedTransaction.particulars && selectedTransaction.particulars !== '-' && (
                        <tr>
                          <td className="px-4 py-2.5 font-semibold text-gray-500 pl-8">↳ {selectedTransaction.particulars}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-green-600">{selectedTransaction.credit > 0 ? `₹${selectedTransaction.credit.toFixed(2)}` : ''}</td>
                          <td className="px-4 py-2.5 text-right font-mono text-orange-600">{selectedTransaction.debit > 0 ? `₹${selectedTransaction.debit.toFixed(2)}` : ''}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Footer */}
              <div className="flex-shrink-0 px-6 py-4 border-t border-gray-100 bg-gray-50">
                <button
                  onClick={() => setSelectedTransaction(null)}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg text-sm transition-colors"
                >
                  Close
                </button>
              </div>
            </div>

            <style>{`
              @keyframes slideInRight {
                from { transform: translateX(100%); opacity: 0; }
                to   { transform: translateX(0);    opacity: 1; }
              }
              @keyframes fadeIn {
                from { opacity: 0; }
                to   { opacity: 1; }
              }
            `}</style>
          </>
        )}
      </div>
    );
"""

    final_content = content[:start_idx] + new_content + content[end_idx:]
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(final_content)
    print("Successfully replaced content.")

