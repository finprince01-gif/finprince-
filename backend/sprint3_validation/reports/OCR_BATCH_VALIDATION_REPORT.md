# OCR Batch Validation Report — Sprint 3
Generated: 2026-06-21 10:29:41 UTC
Session ID: `c1311ebd-e123-411b-91fb-7451ba3a0705`

---

## 1. Corpus Summary
| Metric | Value |
|---|---|
| Total invoice files | 22 |
| Total pages | 228 |
| Total corpus size | 169.76 MB |

## 2. OCR Engine Configuration
| Setting | Value |
|---|---|
| OCR Engine | PaddleOCR |
| Base DPI (normal) | 300 |
| Base DPI (small page <400pt) | 200 |
| Blur upgrade DPI | 400 |
| Blur threshold | `OCR_BLUR_THRESHOLD=80.0` (Laplacian variance) |
| Preprocessing | Deskew + Bilateral Filter + CLAHE + Unsharp Mask + Border Cleanup |
| Pages with preprocessing enabled | N/A |

## 3. DPI Distribution
| DPI | Pages | Notes |
|---|---|---|
| 200 DPI | 0 | Small page (<400pt width/height) |
| 300 DPI | 0 | Standard quality |
| 400 DPI | 0 | Blur-upgraded |

## 4. Blur & Quality Analysis
| Metric | Value |
|---|---|
| Pages upgraded to 400 DPI (blur detected) | 0 |
| Low confidence extractions | 0 |
| Pages with empty OCR output (<10 chars) | 0 |
| Average focus score (Laplacian variance) | N/A |
| Min focus score | N/A |
| Max focus score | N/A |

## 5. OCR Performance
| Metric | Value |
|---|---|
| Average OCR duration | N/A ms |
| Max OCR duration | N/A ms |
| Average characters per page | N/A |

## 6. Sprint 2 vs Sprint 3 Comparison
| Metric | Sprint 1 Baseline | Sprint 3 |
|---|---|---|
| Header accuracy | 56.0% | See extraction report |
| GSTIN accuracy | 60.0% | See extraction report |
| Blur-upgrade feature | Not present | ACTIVE (400 DPI) |
| Preprocessing pipeline | Not present | ACTIVE (5 stages) |

> **Note**: Sprint 2 baseline metrics not available. Sprint 1 metrics from `sprint1_summary_metrics.json` used for comparison.

## 7. DPI Upgrade Events (Sample)
*No DPI upgrade events found in logs.*

## 8. Verdict
> ⚠️ **No OCR telemetry found** — confirm cluster was running during batch upload.