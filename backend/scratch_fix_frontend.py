import os
import re

def fix_payment_voucher_single():
    filepath = r'D:\ledger_report\AI-accounting-0.03\frontend\src\pages\Vouchers\PaymentVoucherSingle.tsx'
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Fix hierarchySeedLedgers
    # id: `hierarchy-${l.id}`,
    # ledger_id: l.id,
    content = re.sub(
        r"id: `hierarchy-\$\{l\.id\}`,\n\s*name: l\.name,",
        "id: `hierarchy-${l.id}`,\n                        ledger_id: l.id,\n                        name: l.name,",
        content
    )

    # Fix portalEntities vendors
    # id: `portal-vend-${v.id}`,
    # ledger_id: v.ledger_id,
    content = re.sub(
        r"id: `portal-vend-\$\{v\.id\}`,\n\s*name: v\.vendor_name \|\| v\.name,",
        "id: `portal-vend-${v.id}`,\n                        ledger_id: v.ledger_id,\n                        name: v.vendor_name || v.name,",
        content
    )

    # Fix portalEntities customers
    # id: `portal-cust-${c.id}`,
    # ledger_id: c.ledger_id,
    content = re.sub(
        r"id: `portal-cust-\$\{c\.id\}`,\n\s*name: c\.customer_name \|\| c\.name,",
        "id: `portal-cust-${c.id}`,\n                        ledger_id: c.ledger_id,\n                        name: c.customer_name || c.name,",
        content
    )

    # Fix ledgerOptions
    # ...l,
    # ledger_id: l.id,
    content = re.sub(
        r"\.\.\.l,\n\s*type: l\.group === 'Sundry Debtors'",
        "...l,\n                        ledger_id: l.id,\n                        type: l.group === 'Sundry Debtors'",
        content
    )

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Fixed PaymentVoucherSingle.tsx")

if __name__ == "__main__":
    fix_payment_voucher_single()
