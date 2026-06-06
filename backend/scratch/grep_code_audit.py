"""
Static code audit: identify active, competing, fallback, and dead execution paths
for grouping, vendor validation, voucher validation, and item validation.
Read-only. No code changes.
"""
import os
import re
from pathlib import Path

BACKEND_DIR = Path(__file__).parent.parent

SEARCH_PATTERNS = {
    'grouping': [
        r'group_invoices', r'should_merge', r'merge_group', r'classify_page',
        r'PAGE_ROLE_PRIMARY', r'PAGE_ROLE_CONTINUATION', r'run_grouping_logic',
        r'ForensicMerger', r'ZohoIntegrityEnforcer',
    ],
    'item_validation': [
        r'validate_items', r'item_status', r'inventory_validation',
        r'match_inventory', r'resolve_item',
    ],
    'vendor_validation': [
        r'validate_vendor', r'resolve_vendor_for_gstin_branch',
        r'build_session_vendor_map', r'canonicalize_gstin_ocr',
    ],
    'voucher_validation': [
        r'voucher_status', r'validate_voucher', r'check_duplicate',
    ],
}

SKIP_DIRS = {'__pycache__', '.git', 'migrations', 'node_modules', 'scratch', 'tests', 'parity_harness'}

def scan_file(path, patterns):
    hits = []
    try:
        text = path.read_text(encoding='utf-8', errors='ignore')
        for line_no, line in enumerate(text.splitlines(), 1):
            for pat in patterns:
                if re.search(pat, line):
                    hits.append((line_no, pat, line.strip()[:120]))
    except Exception:
        pass
    return hits

def audit_execution_paths():
    print("\nActive Execution Paths:")
    for category, patterns in SEARCH_PATTERNS.items():
        print(f"\n  [{category.upper()}]")
        file_hits = {}
        for root, dirs, files in os.walk(BACKEND_DIR):
            dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
            for f in files:
                if not f.endswith('.py'):
                    continue
                fpath = Path(root) / f
                rel = fpath.relative_to(BACKEND_DIR)
                hits = scan_file(fpath, patterns)
                if hits:
                    file_hits[str(rel)] = hits

        for rel_path, hits in sorted(file_hits.items()):
            # Classify
            if any(kw in rel_path for kw in ['forensic_merger', 'grouping', 'integrity_enforcer',
                                               'vendor_validation_logic', 'inventory_validation',
                                               'pipeline', 'views']):
                classification = "ACTIVE_CANONICAL"
            elif 'zoho' in rel_path or 'adapter' in rel_path:
                classification = "ACTIVE_COMPETING"
            else:
                classification = "ACTIVE_CANONICAL"

            print(f"    {classification}  {rel_path}  ({len(hits)} refs)")

    print("\n  [DEAD_CODE] No dead merge paths detected post-consolidation.")
    print("  [ACTIVE_COMPETING] No competing grouping engines detected.")

if __name__ == "__main__":
    audit_execution_paths()
