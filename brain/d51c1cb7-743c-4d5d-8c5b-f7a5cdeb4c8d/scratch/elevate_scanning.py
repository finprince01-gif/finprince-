import sys

file_path = 'c:/108/AI-accounting-0.03/frontend/src/components/SmartInvoiceUploadModal.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    text = f.read()

# Define the old block (the whole badge conditional logic)
old_badge_logic = """                             <td className="px-2 py-3 text-center">
                                                              {row.validationStatus === "VOUCHER_CREATED" ? (
                                                                  <span className="px-2 py-1 bg-emerald-600 text-white rounded text-[10px] font-bold uppercase whitespace-nowrap shadow-sm">✅ Saved</span>
                                                              ) : row.validationStatus === "DUPLICATE" ? (
                                                                  <span className="px-2 py-1 bg-red-100 text-red-800 border border-red-300 rounded text-[10px] font-bold uppercase whitespace-nowrap" title="Already in ERP">ALREADY EXIST</span>
                                                              ) : row.validationStatus === "INCOMPLETE" ? (
                                                                  <span className="px-2 py-1 bg-amber-100 text-amber-800 border border-amber-300 rounded text-[10px] font-bold uppercase whitespace-nowrap" title="Missing Invoice Number">Incomplete</span>
                                                              ) : (["READY", "SUCCESS", "RESOLVED", "FOUND"].includes(row.validationStatus)) ? (
                                                                  <span className="px-2 py-1 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded text-[10px] font-bold uppercase whitespace-nowrap" title="Ready to Finalize & Save">ALREADY EXIST</span>
                                                              ) : row.vendor_id ? (
                                                                  <span className="px-2 py-1 bg-indigo-100 text-indigo-800 border border-indigo-300 rounded text-[10px] font-bold uppercase whitespace-nowrap" title="Vendor Matched">ALREADY EXIST</span>
                                                              ) : row.validationStatus === "NEED_VENDOR" ? (
                                                                  <span className="px-2 py-1 bg-orange-100 text-orange-800 border border-orange-300 rounded text-[10px] font-bold uppercase whitespace-nowrap">Create Vendor</span>
                                                              ) : row.validationStatus === "GSTIN_CONFLICT" ? (
                                                                  <span className="px-2 py-1 bg-red-600 text-white rounded text-[10px] font-bold uppercase whitespace-nowrap" title="GSTIN Conflict">Conflict</span>
                                                              ) : (row.validationStatus === "NEEDS_ATTENTION" || row.validationStatus === "LOW_CONFIDENCE" || row.validationStatus === "VALIDATION_FAILED") ? (
                                                                  <span className="px-2 py-1 bg-amber-500 text-white rounded text-[10px] font-bold uppercase whitespace-nowrap" title="Review Required">Review</span>
                                                              ) : row.validationStatus === "EXTRACTION_FAILED" ? (
                                                                  <span className="px-2 py-1 bg-red-500 text-white rounded text-[10px] font-bold uppercase whitespace-nowrap" title="AI Extraction Failed">Error</span>
                                                              ) : (
                                                                  <span className="px-2 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded text-[10px] font-bold uppercase inline-flex items-center gap-1 whitespace-nowrap shadow-sm">
                                                                      <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent animate-spin rounded-full" /> SCANNING
                                                                  </span>
                                                              )}
                                                          </td>"""

# Note: The above string might have whitespace issues. I'll use a more robust replacement.
# I will just find the first conditional and inject the processing check.

new_badge_logic = """                             <td className="px-2 py-3 text-center">
                                                              {row.validationStatus === "processing" || row.validationStatus === "PENDING" || row.validationStatus === "EXTRACTING" ? (
                                                                   <span className="px-2 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded text-[10px] font-bold uppercase inline-flex items-center gap-1 whitespace-nowrap shadow-sm">
                                                                      <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent animate-spin rounded-full" /> SCANNING
                                                                  </span>
                                                              ) : row.validationStatus === "VOUCHER_CREATED" ? (
                                                                  <span className="px-2 py-1 bg-emerald-600 text-white rounded text-[10px] font-bold uppercase whitespace-nowrap shadow-sm">✅ Saved</span>
                                                              ) : row.validationStatus === "DUPLICATE" ? (
                                                                  <span className="px-2 py-1 bg-red-100 text-red-800 border border-red-300 rounded text-[10px] font-bold uppercase whitespace-nowrap" title="Already in ERP">ALREADY EXIST</span>
                                                              ) : row.validationStatus === "INCOMPLETE" ? (
                                                                  <span className="px-2 py-1 bg-amber-100 text-amber-800 border border-amber-300 rounded text-[10px] font-bold uppercase whitespace-nowrap" title="Missing Invoice Number">Incomplete</span>
                                                              ) : (["READY", "SUCCESS", "RESOLVED", "FOUND"].includes(row.validationStatus)) ? (
                                                                  <span className="px-2 py-1 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded text-[10px] font-bold uppercase whitespace-nowrap" title="Ready to Finalize & Save">ALREADY EXIST</span>
                                                              ) : row.vendor_id ? (
                                                                  <span className="px-2 py-1 bg-indigo-100 text-indigo-800 border border-indigo-300 rounded text-[10px] font-bold uppercase whitespace-nowrap" title="Vendor Matched">ALREADY EXIST</span>
                                                              ) : row.validationStatus === "NEED_VENDOR" ? (
                                                                  <span className="px-2 py-1 bg-orange-100 text-orange-800 border border-orange-300 rounded text-[10px] font-bold uppercase whitespace-nowrap">Create Vendor</span>
                                                              ) : row.validationStatus === "GSTIN_CONFLICT" ? (
                                                                  <span className="px-2 py-1 bg-red-600 text-white rounded text-[10px] font-bold uppercase whitespace-nowrap" title="GSTIN Conflict">Conflict</span>
                                                              ) : (row.validationStatus === "NEEDS_ATTENTION" || row.validationStatus === "LOW_CONFIDENCE" || row.validationStatus === "VALIDATION_FAILED") ? (
                                                                  <span className="px-2 py-1 bg-amber-500 text-white rounded text-[10px] font-bold uppercase whitespace-nowrap" title="Review Required">Review</span>
                                                              ) : row.validationStatus === "EXTRACTION_FAILED" ? (
                                                                  <span className="px-2 py-1 bg-red-500 text-white rounded text-[10px] font-bold uppercase whitespace-nowrap" title="AI Extraction Failed">Error</span>
                                                              ) : (
                                                                  <span className="px-2 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded text-[10px] font-bold uppercase inline-flex items-center gap-1 whitespace-nowrap shadow-sm">
                                                                      <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent animate-spin rounded-full" /> SCANNING
                                                                  </span>
                                                              )}
                                                          </td>"""

import re
# Regex to find the whole td block
pattern = r'<td className="px-2 py-3 text-center">\s+\{row\.validationStatus === "VOUCHER_CREATED"(.*?)\)\}\s+</td>'
# Actually it's easier to just search for the start line.

# I'll just use a direct line replace for the start of the ternary.
target = '{row.validationStatus === "VOUCHER_CREATED" ? ('
replacement = '{row.validationStatus === "processing" || row.validationStatus === "PENDING" || row.validationStatus === "EXTRACTING" ? (\n                                                                   <span className="px-2 py-1 bg-blue-50 text-blue-700 border border-blue-100 rounded text-[10px] font-bold uppercase inline-flex items-center gap-1 whitespace-nowrap shadow-sm">\n                                                                      <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent animate-spin rounded-full" /> SCANNING\n                                                                  </span>\n                                                              ) : row.validationStatus === "VOUCHER_CREATED" ? ('

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

found = False
for i in range(len(lines)):
    if target in lines[i]:
        indent = lines[i].split('{')[0]
        # Adjust the replacement indent
        r_lines = replacement.split('\n')
        lines[i] = indent + r_lines[0] + '\n' + \
                   indent + r_lines[1] + '\n' + \
                   indent + r_lines[2] + '\n' + \
                   indent + r_lines[3] + '\n' + \
                   indent + r_lines[4]
        found = True
        break

if found:
    with open(file_path, 'w', encoding='utf-8') as f:
        f.writelines(lines)
    print("Injected SCANNING check at the top.")
else:
    print("Target not found.")
