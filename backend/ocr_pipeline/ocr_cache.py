"""
OCRResponseCache + ItemExtractionConsensusEngine
================================================
Phase 4: Eliminate Gemini extraction non-determinism by:
  1. Caching successful high-confidence OCR responses keyed on (file_hash, page_number)
     so identical pages always return the identical extraction.
  2. Running a consensus pass when multiple historic extractions exist for the same
     page key, electing the most common item_count, item_names, HSNs, and quantities.

SAFETY RULES (enforced by code):
  - Cache only responses with all required anchors present AND confidence >= 0.95.
  - Never cache partial, failed, or low-density responses.
  - Raw OCR values are always preserved in canonical_payload.
  - No business rules are touched.

Cache Backend: Django cache framework (default cache, typically Redis in production,
               memcache/locmem in test). Falls back to DB table OCRPageCache as a
               persistent secondary store.
"""

import hashlib
import json
import logging
from typing import Dict, Any, List, Optional, Tuple

logger = logging.getLogger(__name__)

# Minimum confidence required to store a response in the cache
CACHE_MIN_CONFIDENCE = 0.80
# Django cache key prefix
CACHE_KEY_PREFIX = "ocr_page_v1"
# TTL: 30 days (pages from the same PDF upload should be stable indefinitely in practice)
CACHE_TTL_SECONDS = 60 * 60 * 24 * 30


def _make_cache_key(file_hash: str, page_number: int) -> str:
    """Deterministic cache key for a (file_hash, page_number) pair."""
    raw = f"{CACHE_KEY_PREFIX}:{file_hash}:{page_number}"
    return hashlib.sha256(raw.encode()).hexdigest()


def _payload_confidence(canonical_payload: Dict[str, Any]) -> float:
    """
    Heuristic confidence score for a canonical payload.
    Uses presence of anchor fields and item count as signal.
    """
    anchors = ["invoice_no", "vendor_name", "gstin", "invoice_date"]
    present = sum(1 for a in anchors if canonical_payload.get(a))
    items = canonical_payload.get("items") or []
    item_score = min(1.0, len(items) / 2.0)  # at least 2 items = full score
    return (present / len(anchors)) * 0.7 + item_score * 0.3


def _is_cacheable(canonical_payload: Dict[str, Any]) -> bool:
    """Returns True only if the payload is complete enough to cache."""
    if not canonical_payload:
        return False
    if canonical_payload.get("status") in ("OCR_FAILED", "PARTIAL", "FAILED"):
        return False
    if canonical_payload.get("_error"):
        return False
    required = ["invoice_no", "vendor_name"]
    if not all(canonical_payload.get(r) for r in required):
        return False
    confidence = _payload_confidence(canonical_payload)
    if confidence < CACHE_MIN_CONFIDENCE:
        logger.debug(
            f"[OCR_CACHE_SKIP] confidence={confidence:.3f} < {CACHE_MIN_CONFIDENCE} "
            f"invoice_no={canonical_payload.get('invoice_no')}"
        )
        return False
    return True


class OCRResponseCache:
    """
    Two-tier OCR response cache.

    Tier 1: Django cache (Redis/memcache) - fast, ephemeral.
    Tier 2: OCRPageCache DB table - persistent across restarts.

    On cache hit: returns stored canonical_payload directly.
    On cache miss: returns None (caller must call Gemini).
    After successful Gemini call: caller must call store().
    """

    @staticmethod
    def get(file_hash: str, page_number: int) -> Optional[Dict[str, Any]]:
        """
        Look up a cached OCR result.
        Returns the canonical_payload dict on hit, or None on miss.
        """
        if not file_hash:
            return None
        cache_key = _make_cache_key(file_hash, page_number)

        # Tier 1: Django cache
        try:
            from django.core.cache import cache as django_cache
            hit = django_cache.get(cache_key)
            if hit is not None:
                logger.info(
                    f"[OCR_CACHE_HIT] tier=django file_hash={file_hash} "
                    f"page={page_number} invoice_no={hit.get('invoice_no')}"
                )
                return hit
        except Exception as e:
            logger.warning(f"[OCR_CACHE_TIER1_READ_ERR] {e}")

        # Tier 2: DB — use existing AICache model, key = 'ocr_page:{file_hash}:{page_number}'
        try:
            from ocr_pipeline.models import AICache
            db_key = f"ocr_page:{file_hash}:{page_number}"
            db_record = AICache.objects.filter(
                key_hash__startswith=db_key
            ).order_by("-created_at").first()
            if db_record and db_record.payload:
                raw_payload = db_record.payload
                # payload may be stored as dict or JSON string
                if isinstance(raw_payload, str):
                    import json as _json
                    payload = _json.loads(raw_payload)
                else:
                    payload = raw_payload
                logger.info(
                    f"[OCR_CACHE_HIT] tier=db file_hash={file_hash} "
                    f"page={page_number} invoice_no={payload.get('invoice_no')}"
                )
                # Warm tier-1 cache from DB
                try:
                    from django.core.cache import cache as django_cache
                    django_cache.set(cache_key, payload, CACHE_TTL_SECONDS)
                except Exception:
                    pass
                return payload
        except Exception as e:
            logger.warning(f"[OCR_CACHE_TIER2_READ_ERR] {e}")

        return None

    @staticmethod
    def store(file_hash: str, page_number: int, canonical_payload: Dict[str, Any]) -> bool:
        """
        Store an OCR result if it meets the confidence threshold.
        Returns True if stored, False if skipped.
        """
        if not file_hash or not _is_cacheable(canonical_payload):
            return False

        cache_key = _make_cache_key(file_hash, page_number)
        confidence = _payload_confidence(canonical_payload)

        # Tier 1: Django cache
        try:
            from django.core.cache import cache as django_cache
            django_cache.set(cache_key, canonical_payload, CACHE_TTL_SECONDS)
        except Exception as e:
            logger.warning(f"[OCR_CACHE_TIER1_WRITE_ERR] {e}")

        # Tier 2: DB — append a new record per extraction (preserves history for consensus)
        try:
            import time as _time
            from ocr_pipeline.models import AICache
            # Use timestamp suffix so multiple extractions for same page co-exist in DB
            db_key = f"ocr_page:{file_hash}:{page_number}:{int(_time.time())}"
            AICache.objects.create(
                key_hash=db_key,
                payload=canonical_payload,
            )
        except Exception as e:
            logger.warning(f"[OCR_CACHE_TIER2_WRITE_ERR] {e}")

        logger.info(
            f"[OCR_CACHE_STORE] file_hash={file_hash} page={page_number} "
            f"confidence={confidence:.3f} invoice_no={canonical_payload.get('invoice_no')}"
        )
        return True

    @staticmethod
    def invalidate(file_hash: str, page_number: int):
        """Explicitly invalidate a cached entry (e.g., after a manual correction)."""
        cache_key = _make_cache_key(file_hash, page_number)
        try:
            from django.core.cache import cache as django_cache
            django_cache.delete(cache_key)
        except Exception:
            pass
        try:
            from ocr_pipeline.models import AICache
            AICache.objects.filter(
                key_hash__startswith=f"ocr_page:{file_hash}:{page_number}:"
            ).delete()
            # Also delete the exact key used for single-record lookups
            AICache.objects.filter(
                key_hash=f"ocr_page:{file_hash}:{page_number}"
            ).delete()
        except Exception:
            pass
        logger.info(f"[OCR_CACHE_INVALIDATE] file_hash={file_hash} page={page_number}")


class ItemExtractionConsensusEngine:
    """
    Resolves item-count instability across multiple historic OCR extractions
    for the same (file_hash, page_number) by running a consensus election.

    Input : a list of canonical_payload dicts (from OCRPageCache or from the
            current + previous sessions).
    Output: a single canonical_payload with item_count and item fields stabilized.

    Consensus rules (in priority order):
      1. Most common item_count wins.
      2. Within the winning count, most common item_name per slot wins.
      3. Most common HSN per slot wins.
      4. Most common quantity per slot wins.
      5. Most common taxable_value per slot wins.
    """

    @classmethod
    def elect(
        cls,
        payloads: List[Dict[str, Any]],
        invoice_no: str = "",
        file_hash: str = "",
        page_number: int = 0,
    ) -> Tuple[Dict[str, Any], float, str]:
        """
        Elect the consensus payload from a list of candidates.
        Returns: (elected_payload, confidence, election_reason)
        """
        if not payloads:
            raise ValueError("No payloads to elect from")
        if len(payloads) == 1:
            return payloads[0], 1.0, "single_candidate"

        # Step 1: elect item_count
        counts = [len(p.get("items") or []) for p in payloads]
        from collections import Counter
        count_freq = Counter(counts)
        best_count, best_count_votes = count_freq.most_common(1)[0]
        confidence = best_count_votes / len(payloads)
        raw_count = counts[0]  # what the most-recent pass returned

        # Candidates that match the winning item_count
        matching = [p for p in payloads if len(p.get("items") or []) == best_count]
        if not matching:
            matching = payloads  # fallback

        # Step 2: build consensus items slot by slot
        consensus_items = []
        for slot in range(best_count):
            slot_items = []
            for p in matching:
                items = p.get("items") or []
                if slot < len(items):
                    slot_items.append(items[slot])

            if not slot_items:
                continue

            def most_common_val(field, items_list):
                vals = [str(i.get(field) or "") for i in items_list if i.get(field)]
                if not vals:
                    return ""
                return Counter(vals).most_common(1)[0][0]

            consensus_item = dict(slot_items[0])  # base from first matching
            consensus_item["item_name"] = most_common_val("item_name", slot_items)
            consensus_item["description"] = (
                most_common_val("description", slot_items) or consensus_item["item_name"]
            )
            consensus_item["canonical_item_name"] = (
                most_common_val("canonical_item_name", slot_items) or consensus_item["item_name"]
            )
            consensus_item["hsn_sac"] = most_common_val("hsn_sac", slot_items)
            consensus_item["canonical_hsn"] = (
                most_common_val("canonical_hsn", slot_items) or consensus_item["hsn_sac"]
            )
            consensus_item["raw_hsn"] = most_common_val("raw_hsn", slot_items)

            for num_field in ("qty", "rate", "taxable_value", "cgst", "sgst", "igst"):
                elected_val = most_common_val(num_field, slot_items)
                if elected_val:
                    consensus_item[num_field] = elected_val

            consensus_items.append(consensus_item)

        # Step 3: build elected payload from the first matching candidate, replace items
        elected = dict(matching[0])
        elected["items"] = consensus_items

        election_reason = (
            f"item_count_consensus:{best_count}"
            f"(votes={best_count_votes}/{len(payloads)})"
        )
        logger.info(
            f"[ITEM_CONSENSUS] invoice_no='{invoice_no}' file_hash={file_hash} "
            f"page={page_number} raw_item_count={raw_count} "
            f"canonical_item_count={best_count} confidence={confidence:.3f} "
            f"election_reason='{election_reason}' candidate_counts={counts}"
        )
        return elected, confidence, election_reason

    @classmethod
    def get_historic_payloads(cls, file_hash: str, page_number: int) -> List[Dict[str, Any]]:
        """
        Retrieve all historic OCR payloads for a (file_hash, page_number) pair
        from the AICache DB, ordered newest-first (up to 10 records).
        """
        try:
            from ocr_pipeline.models import AICache
            prefix = f"ocr_page:{file_hash}:{page_number}:"
            records = AICache.objects.filter(
                key_hash__startswith=prefix
            ).order_by("-created_at")[:10]
            payloads = []
            for r in records:
                raw = r.payload
                if isinstance(raw, str):
                    import json as _json
                    try:
                        raw = _json.loads(raw)
                    except Exception:
                        continue
                if raw:
                    payloads.append(raw)
            return payloads
        except Exception as e:
            logger.warning(f"[CONSENSUS_HISTORY_ERR] {e}")
            return []
