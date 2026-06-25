# Prefix Cache Effectiveness Report — Sprint 3
Generated: 2026-06-21 10:29:41 UTC

## Background
The prefix cache works by sharing a common prompt prefix across all pages of the same invoice.
If implemented correctly, all pages of a single invoice should share an identical `PREFIX_HASH`.

**Expected behaviour:**
```
Page 1 → PREFIX_HASH=A
Page 2 → PREFIX_HASH=A
Page 3 → PREFIX_HASH=A
```

## 1. Cache Event Summary
| Metric | Value |
|---|---|
| Total PREFIX_CACHE_TELEMETRY events | 57 |
| Invoices with cache telemetry | 8 |
| Cache-consistent invoices | 5 |
| Cache-invalidated invoices | 2 |
| Single-page invoices (undetermined) | 1 |
| Global unique prefix hashes | 2 |
| Identical prefix ratio | **54.4%** |

## 2. Cache Effectiveness Assessment
> ❌ **Cache is NOT functioning correctly.** Only 54.4% identical prefix ratio.

## 3. Cache-Invalidated Invoices
| Invoice ID | Pages | Unique Prefix Hashes | Root Cause |
|---|---|---|---|
| 1007697 | 26 | 2 | Prompt content differs between pages |
| 1007700 | 11 | 2 | Prompt content differs between pages |

## 4. Verdict
> Sprint 3 prefix cache: **NEEDS INVESTIGATION**
> Consistent invoices: 5 / 7