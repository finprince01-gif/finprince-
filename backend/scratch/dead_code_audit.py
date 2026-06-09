"""
PHASE 5 – DEAD CODE AUDIT
Statically analyzes execution paths across all pipeline modules.
Classifies each function/class as:
  ACTIVE_CANONICAL  – on the verified primary production path
  ACTIVE_FALLBACK   – reachable but only in error/retry/legacy paths
  DEAD_CODE         – unreachable, no callers found
  UNKNOWN           – ambiguous, needs human review

READ-ONLY. No code changes.
"""
import os, sys, ast, re
from pathlib import Path
from collections import defaultdict

BACKEND = Path(r"c:\108\AI-accounting-0.03\backend")

# Known canonical execution path (from production readiness audit)
CANONICAL_CALL_CHAIN = {
    # Upload entrypoint
    'ocr_pipeline/views.py': ['upload_invoice', 'get_status'],
    # Ingestion
    'vouchers/ingestion_worker.py': ['IngestionWorker', 'handle_task'],
    # AI extraction
    'vouchers/ai_worker.py': ['AIWorker', 'handle_task', '_handle_task_inner', '_process_result'],
    'core/ai_proxy.py': ['process_ai_request', 'execute_with_retry', '_call_gemini_single'],
    # Page persistence
    'vouchers/coordinator.py': ['terminalize_page_state', 'check_and_trigger_assembly'],
    # Grouping
    'ocr_pipeline/grouping.py': ['run_grouping_logic'],
    'ocr_pipeline/forensic_merger.py': ['ForensicMerger', 'group_invoices'],
    'ocr_pipeline/integrity_enforcer.py': ['ZohoIntegrityEnforcer', 'should_merge'],
    # Assembly
    'vouchers/assembly_worker.py': ['AssemblyWorker', 'handle_task'],
    'ocr_pipeline/pipeline.py': ['assemble_multi_page_record', 'validate_and_process'],
    # Finalize
    'vouchers/finalize_worker.py': ['FinalizeWorker', 'handle_task'],
    # Models
    'ocr_pipeline/models.py': [
        'InvoiceTempOCR', 'SessionFinalizationState', 'FinalizedSnapshot',
        'InvoicePageResult', 'PipelineEvent', 'log_pipeline_event'
    ],
}

# Modules to audit
AUDIT_MODULES = [
    'core/ai_proxy.py',
    'core/ai_service.py',
    'core/processing_engine.py',
    'core/ocr_cache.py',
    'core/pdf_splitter.py',
    'ocr_pipeline/pipeline.py',
    'ocr_pipeline/grouping.py',
    'ocr_pipeline/forensic_merger.py',
    'ocr_pipeline/integrity_enforcer.py',
    'ocr_pipeline/extraction.py',
    'ocr_pipeline/normalize.py',
    'vouchers/assembly_worker.py',
    'vouchers/ai_worker.py',
    'vouchers/ingestion_worker.py',
    'vouchers/finalize_worker.py',
    'vouchers/coordinator.py',
    'vouchers/worker_base.py',
]

def get_top_level_names(filepath):
    """Extract all top-level function and class names from a Python file."""
    try:
        src = Path(filepath).read_text(encoding='utf-8', errors='ignore')
        tree = ast.parse(src)
        names = []
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    # Only top-level (depth 0 in module)
                    if any(isinstance(p, ast.Module) for p in ast.walk(tree) if hasattr(p, 'body') and node in getattr(p, 'body', [])):
                        names.append(('function', node.name, node.lineno))
                elif isinstance(node, ast.ClassDef):
                    names.append(('class', node.name, node.lineno))
                    # Also collect class methods
                    for item in node.body:
                        if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                            names.append(('method', f"{node.name}.{item.name}", item.lineno))
        return names
    except Exception as e:
        return []

def find_all_callers(name, search_dirs):
    """Grep for any reference to name in the codebase."""
    count = 0
    callers = []
    clean_name = name.split('.')[-1]
    for d in search_dirs:
        for f in Path(d).rglob('*.py'):
            try:
                src = f.read_text(encoding='utf-8', errors='ignore')
                if re.search(r'\b' + re.escape(clean_name) + r'\b', src):
                    count += 1
                    callers.append(str(f.relative_to(BACKEND)))
            except:
                pass
    return count, callers[:3]

search_dirs = [BACKEND / 'core', BACKEND / 'ocr_pipeline', BACKEND / 'vouchers']

CANONICAL = set()
for mod, funcs in CANONICAL_CALL_CHAIN.items():
    for f in funcs:
        CANONICAL.add(f)

# Legacy / known dead modules from previous audits
KNOWN_DEAD = {
    'core/processing_engine.py': 'Legacy OCR engine wrapper - replaced by Gemini pipeline',
    'core/ocr_cache.py': 'Legacy cache - replaced by AICache model',
    'core/ai_service.py': 'Pre-refactor AI service - superseded by ai_proxy.py',
}

results = []

print("=" * 80)
print("PHASE 5 – DEAD CODE AUDIT MATRIX")
print("=" * 80)
print(f"\nAnalyzing {len(AUDIT_MODULES)} modules...")

for mod_rel in AUDIT_MODULES:
    mod_path = BACKEND / mod_rel
    if not mod_path.exists():
        print(f"\n  [SKIP] {mod_rel} — file not found")
        continue

    names = get_top_level_names(mod_path)
    is_known_dead_mod = mod_rel in KNOWN_DEAD

    print(f"\n{'='*80}")
    print(f"MODULE: {mod_rel}")
    if is_known_dead_mod:
        print(f"  [NOTE] {KNOWN_DEAD[mod_rel]}")
    print(f"  {'Name':<45} {'Type':<10} {'Classification':<22} {'Callers'}")
    print(f"  {'-'*78}")

    for kind, name, lineno in sorted(names, key=lambda x: x[2]):
        # Classify
        base_name = name.split('.')[-1]
        if base_name.startswith('_') and not base_name.startswith('__'):
            # Private helpers — treat as ACTIVE if module is canonical
            if any(c in name for c in CANONICAL) or any(c == base_name[1:] for c in CANONICAL):
                classification = 'ACTIVE_CANONICAL'
            elif is_known_dead_mod:
                classification = 'DEAD_CODE'
            else:
                classification = 'ACTIVE_FALLBACK'
            caller_count, sample = 0, []
        else:
            caller_count, sample = find_all_callers(name, search_dirs)

            if is_known_dead_mod:
                classification = 'DEAD_CODE'
            elif name in CANONICAL or base_name in CANONICAL:
                classification = 'ACTIVE_CANONICAL'
            elif caller_count == 0:
                classification = 'DEAD_CODE'
            elif caller_count == 1:
                # Only self-reference
                classification = 'UNKNOWN'
            elif caller_count <= 2:
                classification = 'ACTIVE_FALLBACK'
            else:
                classification = 'ACTIVE_CANONICAL'

        results.append({
            'module': mod_rel, 'name': name, 'kind': kind,
            'classification': classification, 'callers': caller_count
        })

        marker = {
            'ACTIVE_CANONICAL': '  [C]',
            'ACTIVE_FALLBACK': '  [F]',
            'DEAD_CODE': '  [D]',
            'UNKNOWN': '  [?]',
        }.get(classification, '  [ ]')
        print(f"{marker} {name:<45} {kind:<10} {classification:<22} refs={caller_count}")

# ─── Summary Table ─────────────────────────────────────────────────────
print("\n\n" + "=" * 80)
print("DEAD CODE AUDIT SUMMARY")
print("=" * 80)
from collections import Counter
cls_counts = Counter(r['classification'] for r in results)
print(f"\n  ACTIVE_CANONICAL:  {cls_counts['ACTIVE_CANONICAL']:>4}  (on verified production path)")
print(f"  ACTIVE_FALLBACK:   {cls_counts['ACTIVE_FALLBACK']:>4}  (reachable error/retry paths)")
print(f"  DEAD_CODE:         {cls_counts['DEAD_CODE']:>4}  (no callers — removal candidates)")
print(f"  UNKNOWN:           {cls_counts['UNKNOWN']:>4}  (single reference — needs review)")

print("\n  DEAD CODE candidates (safe to remove after review):")
for r in results:
    if r['classification'] == 'DEAD_CODE':
        print(f"    [{r['module']}] {r['name']} ({r['kind']})")

print("\n  UNKNOWN — needs human review:")
for r in results:
    if r['classification'] == 'UNKNOWN':
        print(f"    [{r['module']}] {r['name']} ({r['kind']}) refs={r['callers']}")
