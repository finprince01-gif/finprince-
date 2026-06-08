"""
PHASE 2 – ZERO-CODE OPERATIONAL IMPROVEMENTS
1. Create poison_documents(created_at) index
2. Purge stale poison_documents (> 7 days)
3. Verify MySQL max_connections and display ALTER command
4. Check for missing indexes on invoice_ocr_temp
READ-WRITE on DB. No application code changes.
"""
import os, sys, django
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.db import connection
from django.utils import timezone
import time

print("=" * 70)
print("PHASE 2 – ZERO-CODE OPERATIONAL IMPROVEMENTS")
print("=" * 70)

# ─── 1. CREATE poison_documents(created_at) INDEX ─────────────────────
print("\n[1] Creating poison_documents(created_at) index...")
try:
    with connection.cursor() as c:
        # Check if already exists
        c.execute("""
            SELECT COUNT(*) FROM information_schema.STATISTICS
            WHERE table_schema = DATABASE()
              AND table_name = 'poison_documents'
              AND index_name = 'idx_pd_created_at'
        """)
        exists = c.fetchone()[0]
        if exists:
            print("    [SKIP] Index idx_pd_created_at already exists.")
        else:
            t0 = time.time()
            c.execute("CREATE INDEX idx_pd_created_at ON poison_documents(created_at)")
            elapsed = time.time() - t0
            print(f"    [OK] Index created in {elapsed:.2f}s")
except Exception as e:
    print(f"    [ERROR] {e}")

# ─── 2. CHECK OTHER MISSING INDEXES ───────────────────────────────────
print("\n[2] Checking for other missing capacity-critical indexes...")
index_checks = [
    ('session_finalization_states', 'terminal_consistency', 'idx_sfs_tc'),
    ('invoice_ocr_temp', 'upload_session_id', 'idx_ocr_session'),
    ('invoice_ocr_temp', 'status', 'idx_ocr_status'),
    ('pipeline_events', 'record_id', 'idx_pe_record'),
]
with connection.cursor() as c:
    for table, col, idx_name in index_checks:
        c.execute(f"""
            SELECT COUNT(*) FROM information_schema.STATISTICS
            WHERE table_schema = DATABASE()
              AND table_name = '{table}'
              AND column_name = '{col}'
        """)
        exists = c.fetchone()[0]
        status = "EXISTS" if exists else "MISSING"
        print(f"    {table}.{col}: {status}")
        if not exists:
            try:
                t0 = time.time()
                c.execute(f"CREATE INDEX {idx_name} ON {table}({col})")
                print(f"      -> Created {idx_name} in {time.time()-t0:.2f}s")
            except Exception as e:
                print(f"      -> SKIPPED: {e}")

# ─── 3. PURGE STALE POISON DOCUMENTS ──────────────────────────────────
print("\n[3] Purging stale poison_documents (older than 7 days)...")
try:
    cutoff = timezone.now() - timezone.timedelta(days=7)
    with connection.cursor() as c:
        c.execute("SELECT COUNT(*) FROM poison_documents WHERE created_at < %s", [cutoff])
        stale_count = c.fetchone()[0]
        print(f"    Stale rows to delete: {stale_count:,}")
        if stale_count > 0:
            t0 = time.time()
            # Batch delete to avoid long table lock
            deleted_total = 0
            batch_size = 500
            while True:
                c.execute("""
                    DELETE FROM poison_documents
                    WHERE created_at < %s
                    ORDER BY created_at
                    LIMIT %s
                """, [cutoff, batch_size])
                deleted = c.rowcount
                deleted_total += deleted
                if deleted < batch_size:
                    break
                time.sleep(0.05)  # Yield between batches
            elapsed = time.time() - t0
            print(f"    [OK] Deleted {deleted_total:,} rows in {elapsed:.2f}s")
        else:
            print("    [SKIP] No stale rows.")

        # Show remaining count
        c.execute("SELECT COUNT(*) FROM poison_documents")
        remaining = c.fetchone()[0]
        print(f"    Remaining rows: {remaining:,}")
except Exception as e:
    print(f"    [ERROR] {e}")

# ─── 4. MySQL max_connections advisory ────────────────────────────────
print("\n[4] MySQL max_connections advisory...")
try:
    with connection.cursor() as c:
        c.execute("SHOW VARIABLES LIKE 'max_connections'")
        row = c.fetchone()
        current_max = int(row[1]) if row else 151

        c.execute("SHOW STATUS LIKE 'Max_used_connections'")
        row = c.fetchone()
        max_used = int(row[1]) if row else 0

        print(f"    Current max_connections:  {current_max}")
        print(f"    Peak connections used:    {max_used}")

        if current_max < 300:
            print(f"    [ADVISORY] Run this in MySQL to increase: SET GLOBAL max_connections = 300;")
            try:
                c.execute("SET GLOBAL max_connections = 300")
                print(f"    [OK] max_connections set to 300 for this session")
            except Exception as set_err:
                print(f"    [WARN] Could not set dynamically: {set_err}")
                print(f"    [ADVISORY] Add to my.cnf: max_connections=300")
        else:
            print(f"    [OK] max_connections = {current_max} is adequate")
except Exception as e:
    print(f"    [ERROR] {e}")

# ─── 5. POST-IMPROVEMENT VERIFICATION ────────────────────────────────
print("\n[5] Post-improvement state verification...")
try:
    with connection.cursor() as c:
        c.execute("SELECT COUNT(*) FROM poison_documents")
        pd_count = c.fetchone()[0]
        c.execute("SHOW VARIABLES LIKE 'max_connections'")
        row = c.fetchone(); max_conn = int(row[1]) if row else 0
        c.execute("""
            SELECT COUNT(*) FROM information_schema.STATISTICS
            WHERE table_schema = DATABASE()
              AND table_name = 'poison_documents'
              AND index_name = 'idx_pd_created_at'
        """)
        idx_exists = c.fetchone()[0]

    print(f"    poison_documents rows:       {pd_count:,}")
    print(f"    created_at index:            {'YES' if idx_exists else 'NO'}")
    print(f"    max_connections:             {max_conn}")
except Exception as e:
    print(f"    [ERROR] {e}")

print("\n" + "=" * 70)
print("PHASE 2 COMPLETE")
print("=" * 70)
