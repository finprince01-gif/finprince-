from accounting.sales_excel_api import SALES_VOUCHER_COLUMNS
for c in SALES_VOUCHER_COLUMNS:
    print(f"[{c['tab']}] {c['label']} ({c['key']})")
