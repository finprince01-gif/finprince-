import logging
import re
from typing import Dict, Any

# Mock logger
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

_INV_BLACKLIST = {"INVOICE", "INV", "BILL", "NO"}

def is_valid_invoice_no(val: str, _source: str = "") -> bool:
    if not val: return False
    cleaned = str(val).strip()
    upper = cleaned.upper()
    if not (1 <= len(cleaned) <= 35): return False
    if not any(c.isdigit() for c in cleaned):
        logger.info(f"[INVOICE_REGEX_TRACE] REJECT '{cleaned}' ({_source}) -> no digits")
        return False
    if not re.match(r'^[A-Za-z0-9/\-._\s()]+$', cleaned):
        logger.info(f"[INVOICE_REGEX_TRACE] REJECT '{cleaned}' ({_source}) -> illegal chars")
        return False
    if upper in _INV_BLACKLIST:
        logger.info(f"[INVOICE_REGEX_TRACE] REJECT '{cleaned}' ({_source}) -> blacklisted")
        return False
    logger.info(f"[INVOICE_REGEX_TRACE] ACCEPT '{cleaned}' ({_source})")
    return True

# Test cases
test_cases = [
    "4742/25-26",
    "TDI130",
    "2022/2025-26",
    "INV-2025-001",
    "INVALID!",
    "ABC"
]

print("--- REGEX TESTS ---")
for tc in test_cases:
    is_valid_invoice_no(tc, "TEST")

print("\n--- NORMALIZATION TESTS ---")
def safe_set(target_dict, key, value, field_name_for_trace):
    current = target_dict.get(key)
    if current and current not in (None, "", 0, "0.00", "—") and value in (None, "", 0, "0.00", "—"):
        print(f"[NORMALIZATION_OVERRIDE_BLOCKED] field='{field_name_for_trace}' (Preserved '{current}' vs Null '{value}')")
        return
    target_dict[key] = value

result = {"invoice_no": "4742/25-26", "total": 73442.0}
print(f"Before: {result}")
safe_set(result, "invoice_no", "", "invoice_no")
safe_set(result, "total", 0, "total")
print(f"After (attempted empty overwrite): {result}")
