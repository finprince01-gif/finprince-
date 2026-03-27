import sys
import re

path = 'c:/108/AI-accounting-0.03/frontend/src/components/SmartInvoiceUploadModal.tsx'
with open(path, 'r', encoding='utf-8') as f:
    orig_content = f.read()

# Pattern matches the <td ...> block for status badges
# Starts after the total_amount <td>
pattern = r'(<td className="px-3 py-3 text-right font-black text-gray-900 text-\[11px\]">₹\{getCellValue\(row, \'total_amount\'\)\}</td>\s*)<td className="px-2 py-3 text-center">.*?</td>'

replacement = r'\1<td className="px-2 py-3 text-center">\n' \
    '                                                             {row.validationStatus === "VOUCHER_CREATED" ? (\n' \
    '                                                                 <span className="px-2 py-1 bg-emerald-600 text-white rounded text-[10px] font-bold uppercase whitespace-nowrap shadow-sm">✅ Saved</span>\n' \
    '                                                             ) : row.validationStatus === "DUPLICATE" ? (\n' \
    '                                                                 <span className="px-2 py-1 bg-red-100 text-red-800 border border-red-300 rounded text-[10px] font-bold uppercase whitespace-nowrap" title="Already in ERP">Duplicate</span>\n' \
    '                                                             ) : row.validationStatus === "INCOMPLETE" ? (\n' \
    '                                                                 <span className="px-2 py-1 bg-amber-100 text-amber-800 border border-amber-300 rounded text-[10px] font-bold uppercase whitespace-nowrap" title="Missing Invoice Number">Incomplete</span>\n' \
    '                                                             ) : (["READY", "SUCCESS", "RESOLVED", "FOUND"].includes(row.validationStatus)) ? (\n' \
    '                                                                 <span className="px-2 py-1 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded text-[10px] font-bold uppercase whitespace-nowrap" title="Ready to Finalize & Save">Ready</span>\n' \
    '                                                             ) : row.vendor_id ? (\n' \
    '                                                                 <span className="px-2 py-1 bg-indigo-100 text-indigo-800 border border-indigo-300 rounded text-[10px] font-bold uppercase whitespace-nowrap" title="Vendor Matched">Registered</span>\n' \
    '                                                             ) : row.validationStatus === "NEED_VENDOR" ? (\n' \
    '                                                                 <span className="px-2 py-1 bg-orange-100 text-orange-800 border border-orange-300 rounded text-[10px] font-bold uppercase whitespace-nowrap">Create Vendor</span>\n' \
    '                                                             ) : row.validationStatus === "GSTIN_CONFLICT" ? (\n' \
    '                                                                 <span className="px-2 py-1 bg-red-600 text-white rounded text-[10px] font-bold uppercase whitespace-nowrap" title="GSTIN Conflict">Conflict</span>\n' \
    '                                                             ) : (row.validationStatus === "NEEDS_ATTENTION" || row.validationStatus === "LOW_CONFIDENCE" || row.validationStatus === "VALIDATION_FAILED") ? (\n' \
    '                                                                 <span className="px-2 py-1 bg-amber-500 text-white rounded text-[10px] font-bold uppercase whitespace-nowrap" title="Review Required">Review</span>\n' \
    '                                                             ) : row.validationStatus === "EXTRACTION_FAILED" ? (\n' \
    '                                                                 <span className="px-2 py-1 bg-red-500 text-white rounded text-[10px] font-bold uppercase whitespace-nowrap" title="AI Extraction Failed">Error</span>\n' \
    '                                                             ) : (\n' \
    '                                                                 <span className="px-2 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded text-[10px] font-bold uppercase inline-flex items-center gap-1 whitespace-nowrap">\n' \
    '                                                                     <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent animate-spin rounded-full" /> PROCESSING\n' \
    '                                                                 </span>\n' \
    '                                                             )}\n' \
    '                                                         </td>'

new_content, count = re.subn(pattern, replacement, orig_content, flags=re.DOTALL)

if count > 0:
    with open(path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f"Success! Replaced {count} occurrences.")
else:
    print("No matches found.")
