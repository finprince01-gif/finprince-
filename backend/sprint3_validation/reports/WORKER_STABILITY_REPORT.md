# Worker Stability Report — Sprint 3
Generated: 2026-06-21 10:29:41 UTC
Session ID: `c1311ebd-e123-411b-91fb-7451ba3a0705`

## 1. Worker Fleet Status
| Worker Role | Starts Detected | Crashes | Status |
|---|---|---|---|
| ingestion | 0 | 0 | ✅ STABLE |
| ai | 0 | 0 | ✅ STABLE |
| assembly | 0 | 0 | ✅ STABLE |
| finalize | 0 | 0 | ✅ STABLE |
| export | 0 | 0 | ✅ STABLE |
| materialization | 0 | 0 | ✅ STABLE |

## 2. Pipeline Throughput
| Metric | Count |
|---|---|
| Files uploaded (UPLOAD_ACCEPTED) | 47 |
| Records created in DB | 47 |
| Queue push successes | 602 |
| Downstream enqueue success | 92 |
| Downstream enqueue failures | 0 |
| DLQ events | 51 |
| Zombie messages | 51 |
| Worker lock refreshes | 53609 |

## 3. Success Rates
| Stage | Success Rate |
|---|---|
| Upload → Ingestion queue | 195.7% |
| Ingestion → AI queue | See ingestion.log |
| DLQ contamination rate | 108.5% |

## 4. Worker Crash Events
*No worker crash events detected.*

## 5. DLQ Events
| Timestamp | Raw Event |
|---|---|
| 2026-06-16 16:56:28 | `WARNING 2026-06-16 16:56:28,416 worker_base 5004 29184 [MESSAGE_DLQ_REDIRECT] id=2f806f99-9125-4f6c-` |
| 2026-06-16 16:56:28 | `WARNING 2026-06-16 16:56:28,651 worker_base 5004 29184 [MESSAGE_DLQ_REDIRECT] id=ee146275-f278-41b8-` |
| 2026-06-16 16:56:28 | `WARNING 2026-06-16 16:56:28,660 worker_base 5004 29184 [MESSAGE_DLQ_REDIRECT] id=ae58e433-9005-4b30-` |
| 2026-06-16 16:56:29 | `WARNING 2026-06-16 16:56:29,615 worker_base 5004 29184 [MESSAGE_DLQ_REDIRECT] id=30573265-6673-4c6d-` |
| 2026-06-16 16:56:29 | `WARNING 2026-06-16 16:56:29,730 worker_base 5004 29184 [MESSAGE_DLQ_REDIRECT] id=3a2cb7d9-4d00-407c-` |
| 2026-06-17 18:05:37 | `WARNING 2026-06-17 18:05:37,895 worker_base 32504 34496 [MESSAGE_DLQ_REDIRECT] id=c980b037-c672-4f93` |
| 2026-06-18 10:31:51 | `WARNING 2026-06-18 10:31:51,034 worker_base 17292 8924 [MESSAGE_DLQ_REDIRECT] id=ca623363-5f98-44f8-` |
| 2026-06-18 11:14:45 | `WARNING 2026-06-18 11:14:45,567 worker_base 16992 18332 [MESSAGE_DLQ_REDIRECT] id=c41a833d-f764-4100` |
| 2026-06-18 11:14:45 | `WARNING 2026-06-18 11:14:45,938 worker_base 16992 18332 [MESSAGE_DLQ_REDIRECT] id=642ed7bb-d758-45c6` |
| 2026-06-18 11:52:41 | `WARNING 2026-06-18 11:52:41,710 worker_base 2900 13132 [MESSAGE_DLQ_REDIRECT] id=2e22da87-3d2d-41ef-` |

## 6. Verdict
> Worker crashes: **0** | DLQ events: **51** | Zombie messages: **51**
> ⚠️ **No crashes but 51 DLQ events — investigate payload issues.**