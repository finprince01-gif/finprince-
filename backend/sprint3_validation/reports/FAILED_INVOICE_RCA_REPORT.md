# Failed Invoice RCA Report — Sprint 3
Generated: 2026-06-21 10:29:41 UTC
Session ID: `c1311ebd-e123-411b-91fb-7451ba3a0705`

> **Amendment 4**: Validation ran to completion across all 22 invoices.
> All failures collected here — pipeline was NOT stopped on first failure.

## 1. Failure Summary
| Category | Count |
|---|---|
| Upload Failure | 20 |
| Timeout | 2 |
| Unknown | 1 |
| **Total** | **23** |

## 2. Failure Detail by Category

### Upload Failure

- **IMG_20260319_0003.pdf**: {"success":false,"error_code":"token_not_valid","message":"{'detail': ErrorDetail(string='Given token not valid for any token type', code='token_not_valid'), 'code': ErrorDetail(string='token_not_valid', code='token_not_valid'), 'messages': [{'token_class': ErrorDetail(string='AccessToken', code='token_not_valid'), 'token_type': ErrorDetail(string='access', code='token_not_valid'), 'message': ErrorDetail(string='Token is expired', code='token_not_valid')}]}","details":{},"field":null}
- **IMG_20260319_0004.pdf**: {"success":false,"error_code":"token_not_valid","message":"{'detail': ErrorDetail(string='Given token not valid for any token type', code='token_not_valid'), 'code': ErrorDetail(string='token_not_valid', code='token_not_valid'), 'messages': [{'token_class': ErrorDetail(string='AccessToken', code='token_not_valid'), 'token_type': ErrorDetail(string='access', code='token_not_valid'), 'message': ErrorDetail(string='Token is expired', code='token_not_valid')}]}","details":{},"field":null}
- **IMG_20260319_0005.pdf**: {"success":false,"error_code":"token_not_valid","message":"{'detail': ErrorDetail(string='Given token not valid for any token type', code='token_not_valid'), 'code': ErrorDetail(string='token_not_valid', code='token_not_valid'), 'messages': [{'token_class': ErrorDetail(string='AccessToken', code='token_not_valid'), 'token_type': ErrorDetail(string='access', code='token_not_valid'), 'message': ErrorDetail(string='Token is expired', code='token_not_valid')}]}","details":{},"field":null}
- **IMG_20260319_0006.pdf**: {"success":false,"error_code":"token_not_valid","message":"{'detail': ErrorDetail(string='Given token not valid for any token type', code='token_not_valid'), 'code': ErrorDetail(string='token_not_valid', code='token_not_valid'), 'messages': [{'token_class': ErrorDetail(string='AccessToken', code='token_not_valid'), 'token_type': ErrorDetail(string='access', code='token_not_valid'), 'message': ErrorDetail(string='Token is expired', code='token_not_valid')}]}","details":{},"field":null}
- **IMG_20260319_0007.pdf**: {"success":false,"error_code":"token_not_valid","message":"{'detail': ErrorDetail(string='Given token not valid for any token type', code='token_not_valid'), 'code': ErrorDetail(string='token_not_valid', code='token_not_valid'), 'messages': [{'token_class': ErrorDetail(string='AccessToken', code='token_not_valid'), 'token_type': ErrorDetail(string='access', code='token_not_valid'), 'message': ErrorDetail(string='Token is expired', code='token_not_valid')}]}","details":{},"field":null}
- **IMG_20260319_0008.pdf**: {"success":false,"error_code":"token_not_valid","message":"{'detail': ErrorDetail(string='Given token not valid for any token type', code='token_not_valid'), 'code': ErrorDetail(string='token_not_valid', code='token_not_valid'), 'messages': [{'token_class': ErrorDetail(string='AccessToken', code='token_not_valid'), 'token_type': ErrorDetail(string='access', code='token_not_valid'), 'message': ErrorDetail(string='Token is expired', code='token_not_valid')}]}","details":{},"field":null}
- **IMG_20260319_0009.pdf**: {"success":false,"error_code":"token_not_valid","message":"{'detail': ErrorDetail(string='Given token not valid for any token type', code='token_not_valid'), 'code': ErrorDetail(string='token_not_valid', code='token_not_valid'), 'messages': [{'token_class': ErrorDetail(string='AccessToken', code='token_not_valid'), 'token_type': ErrorDetail(string='access', code='token_not_valid'), 'message': ErrorDetail(string='Token is expired', code='token_not_valid')}]}","details":{},"field":null}
- **IMG_20260319_0010.pdf**: {"success":false,"error_code":"token_not_valid","message":"{'detail': ErrorDetail(string='Given token not valid for any token type', code='token_not_valid'), 'code': ErrorDetail(string='token_not_valid', code='token_not_valid'), 'messages': [{'token_class': ErrorDetail(string='AccessToken', code='token_not_valid'), 'token_type': ErrorDetail(string='access', code='token_not_valid'), 'message': ErrorDetail(string='Token is expired', code='token_not_valid')}]}","details":{},"field":null}
- **IMG_20260319_0011.pdf**: {"success":false,"error_code":"token_not_valid","message":"{'detail': ErrorDetail(string='Given token not valid for any token type', code='token_not_valid'), 'code': ErrorDetail(string='token_not_valid', code='token_not_valid'), 'messages': [{'token_class': ErrorDetail(string='AccessToken', code='token_not_valid'), 'token_type': ErrorDetail(string='access', code='token_not_valid'), 'message': ErrorDetail(string='Token is expired', code='token_not_valid')}]}","details":{},"field":null}
- **IMG_20260319_0012.pdf**: {"success":false,"error_code":"token_not_valid","message":"{'detail': ErrorDetail(string='Given token not valid for any token type', code='token_not_valid'), 'code': ErrorDetail(string='token_not_valid', code='token_not_valid'), 'messages': [{'token_class': ErrorDetail(string='AccessToken', code='token_not_valid'), 'token_type': ErrorDetail(string='access', code='token_not_valid'), 'message': ErrorDetail(string='Token is expired', code='token_not_valid')}]}","details":{},"field":null}

### Timeout

- **IMG_20260319_0001.pdf**: Pipeline timed out after 10 minutes
- **IMG_20260319_0002.pdf**: Pipeline timed out after 10 minutes

### Unknown

- **N/A**: DB record in FAILED state

## 3. Log Evidence
Refer to `WORKER_STABILITY_RAW.json` and `REDIS_FORENSICS_RAW.json` for raw log lines.

## 4. Proposed Fixes
| Category | Proposed Fix |
|---|---|
| Upload Failure | Increase API timeout, check multipart size limits |
| OCR Failure | Verify PaddleOCR subprocess memory limit |
| AI/Qwen Failure | Check Ollama GPU availability, increase retry count |
| Timeout | Increase SESSION_POLL_TIMEOUT_S, check queue backlog |
| Assembly Failure | Verify barrier convergence logic |

## 5. Verdict
> Total failures: **23** out of 22 invoices.
> ❌ **Significant failures — requires remediation before production.**