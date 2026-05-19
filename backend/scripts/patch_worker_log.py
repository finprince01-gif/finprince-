"""
One-shot patch: replace the broken walrus-operator log expression in worker.py
with a clean, simple version.
"""
import re, sys

path = "vouchers/worker.py"
src  = open(path, encoding="utf-8").read()

# The walrus-operator block we injected accidentally — match it loosely
PATTERN = re.compile(
    r"""(                    else:\s*\n"""
    r"""                        # Source is healthy.*?\n"""
    r"""                        logger\.info\(\s*\n"""
    r""".*?"""
    r"""                        \)\s*\n)""",
    re.DOTALL,
)

REPLACEMENT = (
    "                    else:\n"
    "                        # Source is healthy \u2014 replay normally\n"
    "                        _d = dedup_check[\"details\"]\n"
    "                        logger.info(\n"
    "                            f\"[DEDUP_SOURCE_VALID] record={record_id} source={source_id} \"\n"
    "                            f\"payload_bytes={_d.get('payload_bytes')} \"\n"
    "                            f\"items={_d.get('items_count')} \"\n"
    "                            f\"inv_no='{_d.get('invoice_no')}'\"\n"
    "                        )\n"
)

m = PATTERN.search(src)
if not m:
    print("[FAIL] Pattern not found — check worker.py manually", file=sys.stderr)
    sys.exit(1)

patched = src[: m.start()] + REPLACEMENT + src[m.end() :]
open(path, "w", encoding="utf-8").write(patched)
print("[OK] Walrus-operator log replaced successfully")
