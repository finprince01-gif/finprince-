import re

file_path = r"d:\ledger_report0.22\AI-accounting-0.03\frontend\src\pages\Reports\Reports.tsx"

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

start_marker = "{/* ── LEDGER VIEW ── */}"
end_marker = "{/* ── MONTH VIEW ── */}"

start_idx = content.find(start_marker)
end_idx = content.find(end_marker)

if start_idx == -1 or end_idx == -1:
    print(f"Markers not found: start_idx={start_idx}, end_idx={end_idx}")
else:
    new_content = """{/* ── LEDGER VIEW ── */}
        {ledgerViewMode === 'ledger' && (
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
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-r border-slate-200">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-r border-slate-200">Created From</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-r border-slate-200">Reference No</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-r border-slate-200">Ledger</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider border-r border-slate-200">Status</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider border-r border-slate-200">Debit (₹)</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider border-r border-slate-200">Credit (₹)</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider border-r border-slate-200">Running Bal</th>
                      <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {filteredDrillData.length > 0 ? filteredDrillData.map((e, idx) => {
                      const st = allocationRows.find(r => r.refNo === e.voucherNo && r.isFirstInSource)?.status || '-';
                      return (
                      <tr key={`dd-${idx}`}
                        className={`transition-colors ${e.voucherType==='Opening' ? 'bg-indigo-50/50' : 'hover:bg-indigo-50'}`}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 border-r border-gray-50">{fmtDate(e.date)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 border-r border-gray-50">{e.voucherType||'-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-blue-600 font-medium border-r border-gray-50">{e.voucherNo||'-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 border-r border-gray-50">{e.particulars||'-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap border-r border-gray-50">
                          {st !== '-' && e.voucherType !== 'Opening' ? (
                            <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-[4px] ${st === 'Paid' || st === 'Utilized' ? 'bg-green-100 text-green-800' : st === 'Due' ? 'bg-red-100 text-red-800' : st === 'Partially Paid' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>{st}</span>
                          ) : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 border-r border-gray-50">{e.debit>0?`₹${e.debit.toFixed(2)}`:'-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900 border-r border-gray-50">{e.credit>0?`₹${e.credit.toFixed(2)}`:'-'}</td>
                        <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-bold border-r border-gray-50 ${e.balanceType==='Dr'?'text-orange-600':e.balanceType==='Cr'?'text-green-700':'text-gray-400'}`}>
                          {e.balance>0 ? <>{`₹${e.balance.toFixed(2)} `}<span className={`text-[10px] font-normal uppercase ${e.balanceType==='Dr'?'text-orange-600':'text-green-700'}`}>{e.balanceType}</span></> : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          {e.voucherType !== 'Opening' && (
                            <button onClick={() => setSelectedTransaction({ ...e, ledgerName: drillDownLedger })} className="text-indigo-600 hover:text-indigo-900 mx-auto inline-block" title="View Transaction">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                            </button>
                          )}
                        </td>
                      </tr>
                    )}) : (
                      <tr><td colSpan={9} className="px-6 py-12 text-center text-sm text-gray-400">No transactions found for <strong>{drillDownLedger}</strong>.</td></tr>
                    )}
                  </tbody>
                  {filteredDrillData.length > 0 && (
                    <tfoot className="bg-gray-50 font-bold border-t border-gray-200">
                      <tr>
                        <td colSpan={5} className="px-6 py-3 text-right text-gray-900 text-sm">TOTAL</td>
                        <td className="px-6 py-3 text-right text-gray-900 text-sm">₹{totalDr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td className="px-6 py-3 text-right text-gray-900 text-sm">₹{totalCr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td className={`px-6 py-3 text-right text-sm ${last?.balanceType==='Dr'?'text-orange-600':'text-green-700'}`}>{last?`₹${last.balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`:''}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── JOURNAL VIEW ── */}
        {ledgerViewMode === 'journal' && (
          <div className="erp-card border border-slate-200 overflow-hidden p-0">
            {isDrillDownLoading ? (
              <div className="flex items-center justify-center py-16 gap-3 text-indigo-600">
                <svg className="animate-spin h-6 w-6" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                <span className="text-sm font-semibold">Loading journal view...</span>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="border-y border-gray-100 bg-white">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider w-[120px] border-r border-gray-50">Date</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider min-w-[350px] border-r border-gray-50">Transaction Particulars</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider w-[120px] border-r border-gray-50">Type</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider w-[120px] border-r border-gray-50">VCH No.</th>
                      <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase tracking-wider w-[120px] border-r border-gray-50">Status</th>
                      <th className="px-6 py-4 text-right text-xs font-bold text-gray-400 uppercase tracking-wider w-[150px] border-r border-gray-50">Running Bal</th>
                      <th className="px-6 py-4 text-right text-xs font-bold text-gray-400 uppercase tracking-wider w-[140px] border-r border-gray-50">Debit (₹)</th>
                      <th className="px-6 py-4 text-right text-xs font-bold text-gray-400 uppercase tracking-wider w-[140px] border-r border-gray-50">Credit (₹)</th>
                      <th className="px-6 py-4 text-center text-xs font-bold text-gray-400 uppercase tracking-wider w-[80px]">Action</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {filteredDrillData.length > 0 ? filteredDrillData.map((e, idx) => {
                      const st = allocationRows.find(r => r.refNo === e.voucherNo && r.isFirstInSource)?.status || '-';
                      return (
                      <React.Fragment key={`dd-j-${idx}`}>
                        <tr className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                          <td className="px-6 py-4 text-sm font-medium text-gray-600 align-top border-r border-gray-50">{fmtDate(e.date)}</td>
                          <td className="px-6 py-4 text-sm font-bold text-gray-800 border-r border-gray-50">{e.particulars||'-'}</td>
                          <td className="px-6 py-4 text-sm text-gray-500 uppercase border-r border-gray-50">{e.voucherType||'-'}</td>
                          <td className="px-6 py-4 text-sm text-gray-500 border-r border-gray-50">{e.voucherNo||'-'}</td>
                          <td className="px-6 py-4 whitespace-nowrap border-r border-gray-50">
                            {st !== '-' && e.voucherType !== 'Opening' ? (
                              <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-[4px] ${st === 'Paid' || st === 'Utilized' ? 'bg-green-100 text-green-800' : st === 'Due' ? 'bg-red-100 text-red-800' : st === 'Partially Paid' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>{st}</span>
                            ) : '-'}
                          </td>
                          <td className="px-6 py-4 text-sm text-right font-bold text-gray-900 border-r border-gray-50">
                            {e.balance>0 ? <>{`₹${e.balance.toLocaleString('en-IN', {minimumFractionDigits:2})} `}<span className={`text-[10px] font-normal uppercase ${e.balanceType==='Dr'?'text-orange-600':'text-green-700'}`}>{e.balanceType}</span></> : '-'}
                          </td>
                          <td className="px-6 py-4 text-sm font-bold text-indigo-600 text-right border-r border-gray-50">{e.debit>0?`₹${e.debit.toLocaleString('en-IN', {minimumFractionDigits:2})}`:'-'}</td>
                          <td className="px-6 py-4 text-sm font-bold text-gray-900 text-right border-r border-gray-50">{e.credit>0?`₹${e.credit.toLocaleString('en-IN', {minimumFractionDigits:2})}`:'-'}</td>
                          <td className="px-6 py-4 text-center">
                            {e.voucherType !== 'Opening' && (
                              <button onClick={() => setSelectedTransaction({ ...e, ledgerName: drillDownLedger })} className="text-indigo-600 hover:text-indigo-900 mx-auto inline-block" title="View Transaction">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                              </button>
                            )}
                          </td>
                        </tr>
                        {/* Sub-rows for journal view */}
                        {e.debit > 0 && e.voucherType !== 'Opening' && (
                          <tr className="bg-white border-b border-gray-50/30">
                            <td className="border-r border-gray-50"></td>
                            <td className="px-6 py-1.5 border-r border-gray-50 pl-12">
                              <div className="flex justify-between items-center w-full text-xs font-medium text-gray-700">
                                <span>{drillDownLedger} A/c</span>
                                <div className="flex items-center gap-1">
                                  <span className="font-bold">₹{e.debit.toLocaleString('en-IN', {minimumFractionDigits:2})}</span>
                                  <span className="text-gray-400 text-[10px]">Dr</span>
                                </div>
                              </div>
                            </td>
                            <td colSpan={7}></td>
                          </tr>
                        )}
                        {e.credit > 0 && e.voucherType !== 'Opening' && (
                          <tr className="bg-white border-b border-gray-50/30">
                            <td className="border-r border-gray-50"></td>
                            <td className="px-6 py-1.5 border-r border-gray-50 pl-20">
                              <div className="flex justify-between items-center w-full text-xs font-bold text-indigo-600">
                                <span>{drillDownLedger} A/c</span>
                                <div className="flex items-center gap-1">
                                  <span className="font-bold">₹{e.credit.toLocaleString('en-IN', {minimumFractionDigits:2})}</span>
                                  <span className="text-gray-400 text-[10px]">Cr</span>
                                </div>
                              </div>
                            </td>
                            <td colSpan={7}></td>
                          </tr>
                        )}
                      </React.Fragment>
                    )}) : (
                      <tr><td colSpan={9} className="px-6 py-12 text-center text-sm text-gray-400">No transactions found for <strong>{drillDownLedger}</strong>.</td></tr>
                    )}
                  </tbody>
                  {filteredDrillData.length > 0 && (
                    <tfoot className="bg-gray-50 border-t-2 border-gray-200 font-bold">
                      <tr>
                        <td colSpan={5} className="px-6 py-4 text-right text-sm text-gray-700">TOTAL</td>
                        <td className={`px-6 py-4 text-sm font-mono text-right ${last?.balanceType==='Dr'?'text-orange-600':'text-green-700'}`}>{last?`₹${last.balance.toLocaleString('en-IN', {minimumFractionDigits:2})} ${last.balanceType}`:''}</td>
                        <td className="px-6 py-4 text-sm text-right text-orange-600">₹{totalDr.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
                        <td className="px-6 py-4 text-sm text-right text-green-700">₹{totalCr.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>
        )}

        """

    final_content = content[:start_idx] + new_content + content[end_idx:]
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(final_content)
    print("Successfully replaced content.")
