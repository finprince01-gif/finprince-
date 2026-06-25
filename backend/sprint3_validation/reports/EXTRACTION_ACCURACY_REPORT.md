# Extraction Accuracy Report — Sprint 3
Generated: 2026-06-21 10:29:41 UTC

> **Amendment 1 Implementation**: Two-tier accuracy validation.
> Tier A = Human verified ground truth (10 invoices).
> Tier B = Automated validation (12 invoices).

> ⚠️ **ACTION REQUIRED**: `GROUND_TRUTH_VALIDATION.csv` has not been filled in yet.
> Fill Tier A values manually before running final reports.
> Template: `sprint3_validation/reports/GROUND_TRUTH_VALIDATION_TEMPLATE.csv`

## 1. Human Verified Accuracy (Tier A — 10 Invoices)
| Field | Matches | Misses | Accuracy |
|---|---|---|---|
| vendor_name | 0 | 0 | N/A |
| gstin | 0 | 0 | N/A |
| invoice_no | 0 | 0 | N/A |
| invoice_date | 0 | 0 | N/A |
| taxable_value | 0 | 0 | N/A |
| cgst | 0 | 0 | N/A |
| sgst | 0 | 0 | N/A |
| igst | 0 | 0 | N/A |
| total_amount | 0 | 0 | N/A |

**Tier A Overall Accuracy: None%**

## 2. Automated Validation Accuracy (Tier B — 12 Invoices)
| Field | Matches | Misses | Accuracy |
|---|---|---|---|
| vendor_name | 0 | 0 | N/A |
| gstin | 0 | 0 | N/A |
| invoice_no | 0 | 0 | N/A |
| invoice_date | 0 | 0 | N/A |
| taxable_value | 0 | 0 | N/A |
| cgst | 0 | 0 | N/A |
| sgst | 0 | 0 | N/A |
| igst | 0 | 0 | N/A |
| total_amount | 0 | 0 | N/A |

**Tier B Overall Accuracy: None%**

## 3. Combined Findings
| Metric | Value |
|---|---|
| Total invoices audited | 0 |
| Combined average accuracy | **None%** |
| Tier A (Human) accuracy | **None%** |
| Tier B (Automated) accuracy | **None%** |

## 4. Worst 20 Extraction Failures
| Rank | Filename | Tier | Misses | Accuracy | Failed Fields |
|---|---|---|---|---|---|

## 5. Root Cause Breakdown
Based on field-level miss patterns:

| Failure Category | Description |
|---|---|
| Vendor name mismatch | OCR abbreviation vs full legal name |
| GSTIN extraction | Formatting/spacing differences |
| Invoice number | Prefix/suffix not captured |
| Tax field mismatch | Rounding differences >5% |
| Date format | YYYY-MM-DD vs DD/MM/YYYY |