import django, os
os.environ['DJANGO_SETTINGS_MODULE'] = 'backend.settings'
django.setup()

from ocr_pipeline.normalize import normalize_date, normalize_amount, recover_item_description, ocr_recover_amount

print("=== DATE RECOVERY ===")
cases_date = [
    ("31-12-25",    "2025-12-31", "clean short format"),
    ("31/12/2025",  "2025-12-31", "clean slash format"),
    ("31-12-2025",  "2025-12-31", "clean long format"),
    ("2025-12-31",  "2025-12-31", "ISO format passthrough"),
    ("31.12.25",    "2025-12-31", "dot separator"),
    ("3l-l2-25",    "2025-12-31", "OCR l->1 correction"),
    ("51-)A.J{",    "",           "garbled - returns raw (no valid digits)"),
]
for raw, expected, label in cases_date:
    result = normalize_date(raw)
    if expected == "":
        ok = result == raw  # returns raw when all fails
    else:
        ok = result == expected
    status = "PASS" if ok else "FAIL"
    print(f"  [{status}] {raw!r:20} -> {result!r:15} | {label}")

print()
print("=== AMOUNT RECOVERY ===")
cases_amount = [
    ("42000",     42000.0, "clean integer"),
    ("4 2o0o",   42000.0, "spaces + OCR o->0"),
    ("4,2,000",  42000.0, "comma-separated"),
    ("Rs.42000",  42000.0, "currency prefix"),
    ("4 2 0 0 0", 42000.0, "all-spaced digits"),
    (42000,       42000.0, "already int"),
]
for raw, expected, label in cases_amount:
    result = normalize_amount(raw)
    ok = abs(result - expected) < 0.01
    status = "PASS" if ok else "FAIL"
    print(f"  [{status}] {str(raw)!r:20} -> {result!r:12} (expected {expected}) | {label}")

print()
print("=== ITEM DESCRIPTION ===")
ocr_texts = [
    "PARTICULARS: Rent for the month of December",
    "RENT FOR THE MONTH OF DECEMBER\n42000",
    "Date  Amount\nRent for December\n42000",
]
for raw in ocr_texts:
    result = recover_item_description(raw)
    ok = bool(result)
    status = "PASS" if ok else "FAIL"
    print(f"  [{status}] {result!r}")

print()
print("=== OCR AMOUNT FROM RAW TEXT ===")
text = "PARTICULARS  AMOUNT\nRent for Dec  4 2o0o\nTOTAL  4 2o0o"
result = ocr_recover_amount(text)
ok = abs(result - 42000.0) < 1.0
status = "PASS" if ok else "FAIL"
print(f"  [{status}] ocr_recover_amount -> {result} (expected ~42000)")
