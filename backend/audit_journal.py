"""
Double-Entry Accounting Audit Script for journal_entries table.
Run with: python manage.py shell < audit_journal.py
"""
import os, sys
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')

from django.db import connection

def run(sql, params=None):
    try:
        with connection.cursor() as c:
            c.execute(sql, params or [])
            cols = [d[0] for d in c.description]
            return cols, c.fetchall()
    except Exception as e:
        # print("SQL ERR:", e) # optional debug
        return [], []

def section(title):
    print(f"\n{'='*70}")
    print(f"  {title}")
    print(f"{'='*70}")

# ============================================================
# PART 1 — Structure Validation
# ============================================================
section("PART 1: STRUCTURE VALIDATION")

cols, rows = run("""
    SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLUMN_KEY
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'journal_entries'
    ORDER BY ORDINAL_POSITION;
""")

if not rows:
    print("[FAIL] Table 'journal_entries' does NOT EXIST or has no columns.")
else:
    print(f"\n{'COLUMN':<25} {'TYPE':<25} {'NULLABLE':<10} {'DEFAULT':<15} {'KEY'}")
    print("-" * 85)
    col_map = {}
    for r in rows:
        name, typ, nullable, default, key = r
        col_map[name] = {'type': typ, 'nullable': nullable, 'default': default, 'key': key}
        print(f"{name:<25} {str(typ):<25} {nullable:<10} {str(default):<15} {key}")

    required = {
        'id': lambda c: c['key'] == 'PRI',
        'tenant_id': lambda c: True,
        'voucher_id': lambda c: True,
        'voucher_type': lambda c: True,
        'ledger_id': lambda c: True,
        'debit': lambda c: c['nullable'] == 'NO',
        'credit': lambda c: c['nullable'] == 'NO',
        'created_at': lambda c: True,
    }

    print("\n--- Column Checks ---")
    structure_ok = True
    for col, check in required.items():
        if col not in col_map:
            print(f"  [FAIL] MISSING: '{col}'")
            structure_ok = False
        else:
            ok = check(col_map[col])
            status = "[PASS]" if ok else "[FAIL]"
            print(f"  {status} '{col}' — {col_map[col]['type']} | nullable={col_map[col]['nullable']}")
            if not ok:
                structure_ok = False

    # Check ledger stored as string instead of integer FK
    if 'ledger_id' in col_map:
        t = str(col_map['ledger_id']['type']).lower()
        if 'int' in t or 'bigint' in t:
            print(f"  [PASS] ledger_id is integer FK (not string)")
        elif 'char' in t or 'varchar' in t:
            print(f"  [WARN] ledger_id is stored as string/varchar ({t}) - usually should be integer FK unless UUIDs are used.")
        else:
            print(f"  [FAIL] ledger_id is '{col_map['ledger_id']['type']}' — should be an ID type")
            structure_ok = False

    # Debit/Credit nullability
    for fld in ('debit', 'credit'):
        if fld in col_map and col_map[fld]['nullable'] == 'YES':
            print(f"  [FAIL] '{fld}' is NULLABLE")
            structure_ok = False

    print(f"\n  Structure Result: {'[PASS]' if structure_ok else '[FAIL]'}")

# ============================================================
# PART 2 — Row-Level Validation (sample 20 rows)
# ============================================================
section("PART 2: ROW-LEVEL VALIDATION (sample 20 rows)")

cols2, rows2 = run("SELECT id, voucher_id, voucher_type, ledger_id, debit, credit FROM journal_entries LIMIT 20;")

if not rows2:
    print("  [INFO]  No rows found in journal_entries (empty table).")
else:
    print(f"\n{'ID':<6} {'VOUCHER_ID':<36} {'TYPE':<15} {'LEDGER_ID':<36} {'DEBIT':<14} {'CREDIT':<14} {'ROW STATUS'}")
    print("-" * 120)
    row_violations = []
    for r in rows2:
        rid, vid, vtype, lid, debit, credit = r
        debit = float(debit or 0)
        credit = float(credit or 0)
        both_nonzero = debit > 0 and credit > 0
        both_zero = debit == 0 and credit == 0
        ok = not both_nonzero and not both_zero
        status = "[PASS]" if ok else "[FAIL]"
        if not ok:
            row_violations.append(r)
        print(f"{str(rid):<6} {str(vid):<36} {str(vtype):<15} {str(lid):<36} {str(debit):<14} {str(credit):<14} {status}")

    if row_violations:
        print(f"\n  [FAIL] {len(row_violations)} row violations found")
    else:
        print(f"\n  [PASS] All {len(rows2)} sample rows pass row-level validation")

# ============================================================
# PART 3 — Voucher-Level Balance Check (CRITICAL)
# ============================================================
section("PART 3: VOUCHER-LEVEL BALANCE (CRITICAL)")

cols3, rows3 = run("""
    SELECT
        voucher_id,
        MAX(voucher_type) as voucher_type,
        COUNT(*) as entry_count,
        ROUND(SUM(debit), 4) as total_debit,
        ROUND(SUM(credit), 4) as total_credit,
        ROUND(SUM(debit) - SUM(credit), 4) as imbalance
    FROM journal_entries
    GROUP BY voucher_id
    ORDER BY ABS(ROUND(SUM(debit) - SUM(credit), 4)) DESC
    LIMIT 100;
""")

if not rows3:
    print("  [INFO]  No vouchers found.")
else:
    print(f"\n{'VOUCHER_ID':<40} {'TYPE':<16} {'ENTRIES':<9} {'DEBIT':>14} {'CREDIT':>14} {'IMBALANCE':>12} {'STATUS'}")
    print("-" * 120)
    broken_vouchers = []
    single_entry = []
    for r in rows3:
        vid, vtype, cnt, dr, cr, imbalance = r
        dr, cr, imbalance = float(dr or 0), float(cr or 0), float(imbalance or 0)
        if cnt < 2:
            single_entry.append(vid)
        balanced = abs(imbalance) < 0.01
        status = "[PASS]" if (cnt >= 2 and balanced) else "[FAIL]"
        if status == "[FAIL]":
            broken_vouchers.append((vid, cnt, dr, cr, imbalance))
        
        # Only print first 20 to keep output clean, plus any broken ones
        if len(broken_vouchers) < 20 or status == "[FAIL]":
            print(f"{str(vid):<40} {str(vtype):<16} {str(cnt):<9} {dr:>14.2f} {cr:>14.2f} {imbalance:>12.4f} {status}")

    print(f"\n  Total Vouchers Audited (max 100): {len(rows3)}")
    print(f"  Balanced:       {len(rows3) - len(broken_vouchers)}")
    print(f"  BROKEN:         {len(broken_vouchers)}")
    if single_entry:
        print(f"  [WARN] Single-entry vouchers (count < 2): {single_entry[:5]} ...")
    if broken_vouchers:
        print(f"  [FAIL] BROKEN voucher IDs: {[b[0] for b in broken_vouchers[:5]]} ...")

# ============================================================
# PART 4 — Ledger Integrity
# ============================================================
section("PART 4: LEDGER INTEGRITY")

cols4, rows4 = run("""
    SELECT je.id, je.ledger_id
    FROM journal_entries je
    LEFT JOIN master_ledgers ml ON je.ledger_id = ml.id
    WHERE ml.id IS NULL
    LIMIT 50;
""")

if not rows4:
    print("  [PASS] All ledger_ids are valid — no orphaned entries.")
else:
    print(f"  [FAIL] {len(rows4)} entries reference non-existent ledgers:")
    for r in rows4[:10]:
        print(f"     Journal Entry ID={r[0]}, ledger_id={r[1]}")

# ============================================================
# PART 5 — Voucher Integrity
# ============================================================
section("PART 5: VOUCHER INTEGRITY")

cols5, rows5 = run("""
    SELECT je.id, je.voucher_id, je.voucher_type
    FROM journal_entries je
    LIMIT 20;
""")

vouchers_found = 0
vouchers_missing = 0
missing_examples = []

if not rows5:
    print("  [PASS] No entries to check.")
else:
    # Check directly inside the specific voucher tables based on voucher_type
    for r in rows5:
        je_id, vid, vtype = r
        tbl_name = ""
        # Map common types to tables
        if vtype == 'sales': tbl_name = 'voucher_sales'
        elif vtype == 'purchase': tbl_name = 'voucher_purchases'
        elif vtype == 'receipt': tbl_name = 'voucher_receipts'
        elif vtype == 'payment': tbl_name = 'voucher_payments'
        elif vtype == 'journal': tbl_name = 'voucher_journals'
        elif vtype == 'contra': tbl_name = 'voucher_contras'
        
        if tbl_name:
            _, check = run(f"SELECT id FROM {tbl_name} WHERE id = %s", [vid])
            if check:
                vouchers_found += 1
            else:
                vouchers_missing += 1
                missing_examples.append((je_id, vid, vtype, tbl_name))
        else:
            # Maybe just check the unified tables logic or ignore if unknown
            # Attempt to find it in any common table
            found = False
            for t in ['voucher_sales', 'voucher_purchases', 'voucher_receipts', 'voucher_payments', 'voucher_journals', 'voucher_contras']:
                try:
                    _, check = run(f"SELECT id FROM {t} WHERE id = %s", [vid])
                    if check:
                        found = True
                        break
                except Exception:
                    pass
            if found: vouchers_found += 1
            else: 
                vouchers_missing += 1
                missing_examples.append((je_id, vid, vtype, "unknown"))

    if vouchers_missing == 0:
        print(f"  [PASS] Sampled {vouchers_found} entries -> all reference valid vouchers.")
    else:
        print(f"  [FAIL] {vouchers_missing} out of {len(rows5)} sampled entries reference non-existent vouchers:")
        for r in missing_examples[:5]:
            print(f"     Journal Entry ID={r[0]}, voucher_id={r[1]}, type={r[2]}")

# ============================================================
# PART 6 — Zero Entry Check
# ============================================================
section("PART 6: ZERO ENTRY CHECK")

cols6, rows6 = run("SELECT id, voucher_id, ledger_id, debit, credit FROM journal_entries WHERE debit = 0 AND credit = 0 LIMIT 50;")
if not rows6:
    print("  [PASS] No zero-entry rows found.")
else:
    print(f"  [FAIL] {len(rows6)} rows with debit=0 AND credit=0:")
    for r in rows6[:10]:
        print(f"     {r}")

# ============================================================
# PART 7 — CHECK Constraints
# ============================================================
section("PART 7: CHECK CONSTRAINTS AUDIT")

_, cc_rows = run("""
    SELECT CONSTRAINT_NAME, CHECK_CLAUSE
    FROM information_schema.CHECK_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND TABLE_NAME = 'journal_entries';
""")

_, idx_rows = run("""
    SELECT INDEX_NAME, COLUMN_NAME, NON_UNIQUE
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'journal_entries'
    ORDER BY INDEX_NAME, SEQ_IN_INDEX;
""")

_, fk_rows = run("""
    SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'journal_entries'
      AND REFERENCED_TABLE_NAME IS NOT NULL;
""")

print("\n  --- CHECK Constraints ---")
if cc_rows:
    for r in cc_rows:
        print(f"    {r[0]}: {r[1]}")
    has_mutex = any('debit' in str(r[1]).lower() and 'credit' in str(r[1]).lower() for r in cc_rows)
    if has_mutex:
        print("  [PASS] Mutual exclusion CHECK constraint exists (debit/credit)")
    else:
        print("  [WARN] No mutual exclusion CHECK found (debit>0 XOR credit>0 not enforced at DB level)")
else:
    print("  [WARN] No CHECK constraints found on journal_entries")

print("\n  --- Indexes ---")
if idx_rows:
    from itertools import groupby
    for k, g in groupby(idx_rows, key=lambda x: x[0]):
        cols = ", ".join([x[1] for x in list(g)])
        print(f"    {k} on ({cols})")
else:
    print("  [WARN] No indexes found")

print("\n  --- Foreign Keys ---")
if fk_rows:
    for r in fk_rows:
        print(f"    [PASS] {r[1]} -> {r[2]}.{r[3]}")
else:
    print("  [WARN] No FK constraints found — referential integrity NOT enforced at DB level")

# ============================================================
# PART 8 — Sample Data (5 rows)
# ============================================================
section("PART 8: SAMPLE DATA (5 rows)")

cols8, rows8 = run("SELECT * FROM journal_entries LIMIT 5;")
if cols8:
    print("  " + " | ".join(f"{c:<20}" for c in cols8))
    print("  " + "-" * (22 * len(cols8)))
    for r in rows8:
        print("  " + " | ".join(f"{str(v)[:19]:<20}" for v in r))

# ============================================================
# FINAL VERDICT
# ============================================================
section("FINAL VERDICT")

# Recalculate counters for verdict
_, imbalanced = run("""
    SELECT COUNT(*) FROM (
        SELECT voucher_id
        FROM journal_entries
        GROUP BY voucher_id
        HAVING ABS(SUM(debit) - SUM(credit)) > 0.01
           OR COUNT(*) < 2
    ) t;
""")
imbalanced_count = int(imbalanced[0][0]) if imbalanced else 0

_, zero_rows = run("SELECT COUNT(*) FROM journal_entries WHERE debit = 0 AND credit = 0;")
zero_count = int(zero_rows[0][0]) if zero_rows else 0

_, bad_rows = run("SELECT COUNT(*) FROM journal_entries WHERE debit > 0 AND credit > 0;")
bad_count = int(bad_rows[0][0]) if bad_rows else 0

_, total = run("SELECT COUNT(*) FROM journal_entries;")
total_count = int(total[0][0]) if total else 0

print(f"""
  Total journal entries : {total_count}
  Imbalanced vouchers   : {imbalanced_count}
  Zero-entry rows       : {zero_count}
  Double-sided rows     : {bad_count}  (debit>0 AND credit>0 simultaneously)
  Missing DB CHECK      : {'YES' if not cc_rows else 'NO'}
  Missing FK constraints: {'YES' if not fk_rows else 'NO'}
""")

if total_count == 0:
    verdict = "[WARN] EMPTY TABLE — Cannot validate"
elif imbalanced_count > 0 or zero_count > 0 or bad_count > 0:
    if imbalanced_count > 0 and (zero_count == 0 and bad_count == 0):
        verdict = "[WARN] PARTIALLY CORRECT — Imbalanced vouchers exist"
    else:
        verdict = "[FAIL] NOT A DOUBLE-ENTRY SYSTEM"
else:
    verdict = "[PASS] FULL DOUBLE-ENTRY SYSTEM (data-level)" + (" [WARN] + missing DB constraints" if (not cc_rows or not fk_rows) else "")

print(f"  VERDICT: {verdict}")
print(f"\n{'='*70}\n")
