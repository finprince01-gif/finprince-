# Redis Forensic Report — Sprint 3
Generated: 2026-06-21 10:29:41 UTC

## 1. Redis Instance Health
| Metric | Pre-Batch Baseline | Post-Batch |
|---|---|---|
| Memory used | 0.93 MB | OK |
| Total key count | 56 | (live) |
| Lock key count | 0 | — |
| Session key count | 0 | — |
| Connected clients | 14 | — |

## 2. Barrier Latency
| Statistic | Value (ms) |
|---|---|
| Count | 0 |
| Average | 0 ms |
| p50 (Median) | 0 ms |
| p95 | 0 ms |
| p99 | 0 ms |
| Maximum | 0 ms |

## 3. Lock Contention & Orchestration
| Metric | Count |
|---|---|
| Finalize lock acquisitions | 47 |
| Finalize lock rejections (contention) | 1 |
| Fair-share throttle events | 0 |
| Barrier timeouts | 0 |
| Barrier corruption events | 0 |
| Backward state transitions blocked | 0 |
| Lifecycle rejections | 58 |
| Window leaks (watchdog cleanup) | 9 |

## 4. Connection Health
| Metric | Count |
|---|---|
| Redis operation errors | 1 |
| Disconnection events | 0 |
| Reconnection events | 0 |
| Orphaned tasks rescued | 0 |

## 5. Slow Commands
*No slow commands recorded in Redis slow log.*

## 6. Top Commands by Call Count
| Command | Calls | μs/call |
|---|---|---|
| expire | 1688 | 5.68 |
| hset | 1375 | 6.44 |
| client | 930 | 2.93 |
| zremrangebyscore | 204 | 3.62 |
| zrem | 176 | 4.86 |
| zcard | 164 | 1.24 |
| eval | 95 | 59.46 |
| set | 80 | 13.8 |
| sadd | 68 | 4.87 |
| zadd | 56 | 5.23 |

## 7. Barrier Bottleneck Events
*No barrier timeouts detected.*

## 8. Verdict
> ⚠️ Redis errors: 1, disconnects: 0