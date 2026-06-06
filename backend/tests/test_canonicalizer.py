import pytest
import os
from unittest.mock import patch
from ocr_pipeline.canonicalizer import DocumentIdentityCanonicalizer, is_canonicalization_enabled

def test_is_canonicalization_enabled():
    with patch.dict(os.environ, {"ENABLE_DOCUMENT_CANONICALIZATION": "True"}):
        assert is_canonicalization_enabled() is True

    with patch.dict(os.environ, {"ENABLE_DOCUMENT_CANONICALIZATION": "False"}):
        with patch("django.conf.settings.ENABLE_DOCUMENT_CANONICALIZATION", False, create=True):
            assert is_canonicalization_enabled() is False

def test_canonicalize_invoice_no():
    # Correct slash mutation for FY YY-YY
    val, conf, rule = DocumentIdentityCanonicalizer.canonicalize_invoice_no("4216125-26")
    assert val == "4216/25-26"
    assert conf == 0.98
    assert rule == "fy_separator_repair"

    val, conf, rule = DocumentIdentityCanonicalizer.canonicalize_invoice_no("4216I25-26")
    assert val == "4216/25-26"

    val, conf, rule = DocumentIdentityCanonicalizer.canonicalize_invoice_no("4216|25-26")
    assert val == "4216/25-26"

    # No mutation when already has /
    val, conf, rule = DocumentIdentityCanonicalizer.canonicalize_invoice_no("4216/25-26")
    assert val == "4216/25-26"
    assert rule == "none"

def test_canonicalize_gstin():
    # Valid GSTIN should not change
    # (GSTIN format: 2 digits, 5 letters, 4 digits, 1 letter, 1 digit, 1 Z, 1 digit/letter)
    valid_gstin = "33ABYFS6343M1ZC"  # Actually Z is at position 13 (index 13)
    val, conf, rule = DocumentIdentityCanonicalizer.canonicalize_gstin(valid_gstin)
    assert val == valid_gstin
    assert rule == "none"

    # OCR map correct length 15 (e.g. 33ABYFS6343M1ZC with some space/noise)
    val, conf, rule = DocumentIdentityCanonicalizer.canonicalize_gstin("33ABYFS6343M1ZC ")
    assert val == "33ABYFS6343M1ZC"

    # Corrupted check (e.g., S instead of 5 in numeric digit position)
    # GSTIN digits at: 0, 1, 7, 8, 9, 10, 12.
    # In position 12: 'S' is repaired to '5'
    # For "33ABYFS6343MSZ8", index 12 is 'S', which should map to '5' -> "33ABYFS6343M5Z8"
    val, conf, rule = DocumentIdentityCanonicalizer.canonicalize_gstin("33ABYFS6343MSZ8")
    assert val == "33ABYFS6343M5Z8"

    # Length 16: "33ABYFS63431M1ZC" (has extra digit/character '1' at index 11 or similar)
    val, conf, rule = DocumentIdentityCanonicalizer.canonicalize_gstin("33ABYFS63431M1ZC")
    # Removing index 11 (the '1') gives "33ABYFS6343M1ZC"
    assert val == "33ABYFS6343M1ZC"

    # Length 14: "33ADTPR8731K1Z" (missing last check character 'T')
    val, conf, rule = DocumentIdentityCanonicalizer.canonicalize_gstin("33ADTPR8731K1Z")
    assert val == "33ADTPR8731K1ZT"
    assert rule == "length_14_checksum_append"

def test_canonicalize_invoice_date():
    # Repair 25-Aug-202S -> 25-Aug-2025
    val, conf, rule = DocumentIdentityCanonicalizer.canonicalize_invoice_date("25-Aug-202S")
    assert val == "25-Aug-2025"
    assert conf == 0.98
    assert rule == "digit_ocr_map"

    # Repair 2S-Aug-202S -> 25-Aug-2025
    val, conf, rule = DocumentIdentityCanonicalizer.canonicalize_invoice_date("2S-Aug-202S")
    assert val == "25-Aug-2025"

def test_canonicalize_hsn():
    # HSN translation
    val, conf, rule = DocumentIdentityCanonicalizer.canonicalize_hsn("99834G")
    assert val == "998346"
    assert conf == 0.98
    assert rule == "digit_ocr_map"

def test_canonicalize_vendor_name():
    # Phase 3: only trim, uppercase, and collapse spaces — no suffix stripping
    val, conf, rule = DocumentIdentityCanonicalizer.canonicalize_vendor_name("SRI VISHNU HEAT TREATERS PVT LTD")
    assert val == "SRI VISHNU HEAT TREATERS PVT LTD"
    assert rule == "none"  # already uppercase, single spaces

    # Mixed-case normalised to uppercase
    val, conf, rule = DocumentIdentityCanonicalizer.canonicalize_vendor_name("Sri Vishnu Heat Treaters")
    assert val == "SRI VISHNU HEAT TREATERS"
    assert "uppercase" in rule

    # Duplicate internal spaces collapsed
    val, conf, rule = DocumentIdentityCanonicalizer.canonicalize_vendor_name("SRI  VISHNU  HEAT  TREATERS")
    assert val == "SRI VISHNU HEAT TREATERS"
    assert "space_collapse" in rule

    # Empty returns empty
    val, conf, rule = DocumentIdentityCanonicalizer.canonicalize_vendor_name("")
    assert val == ""
    assert rule == "default_empty"

def test_canonicalize_invoice_integration():
    invoice = {
        "invoice_no": "4216125-26",
        "gstin": "33ABYFS63431M1ZC",
        "invoice_date": "25-Aug-202S",
        "vendor_name": "SRI VISHNU HEAT TREATERS PVT LTD",
        "items": [
            {
                "description": "CASEHARDENTNG",
                "hsn_sac": "99834G"
            }
        ]
    }

    # When feature flag is OFF, standard fields are not mutated but raw/canonical fields are populated
    with patch("ocr_pipeline.canonicalizer.is_canonicalization_enabled", return_value=False):
        res = DocumentIdentityCanonicalizer.canonicalize_invoice(invoice)
        assert res["invoice_no"] == "4216125-26"
        assert res["raw_invoice_no"] == "4216125-26"
        assert res["canonical_invoice_no"] == "4216/25-26"
        assert res["gstin"] == "33ABYFS63431M1ZC"
        assert res["raw_gstin"] == "33ABYFS63431M1ZC"
        assert res["canonical_gstin"] == "33ABYFS6343M1ZC"
        # Phase 3: canonical_vendor_name is uppercase of the raw value (no suffix stripping)
        assert res["raw_vendor_name"] == "SRI VISHNU HEAT TREATERS PVT LTD"
        assert res["canonical_vendor_name"] == "SRI VISHNU HEAT TREATERS PVT LTD"
        assert res["items"][0]["description"] == "CASEHARDENTNG"
        assert res["items"][0]["raw_item_name"] == "CASEHARDENTNG"
        assert res["items"][0]["canonical_item_name"] == "CASEHARDENING"
        assert res["items"][0]["hsn_sac"] == "99834G"
        assert res["items"][0]["raw_hsn"] == "99834G"
        assert res["items"][0]["canonical_hsn"] == "998346"

    # When feature flag is ON, standard fields are mutated to canonical values
    with patch("ocr_pipeline.canonicalizer.is_canonicalization_enabled", return_value=True):
        res = DocumentIdentityCanonicalizer.canonicalize_invoice(invoice)
        assert res["invoice_no"] == "4216/25-26"
        assert res["raw_invoice_no"] == "4216125-26"
        assert res["canonical_invoice_no"] == "4216/25-26"
        assert res["gstin"] == "33ABYFS6343M1ZC"
        assert res["raw_gstin"] == "33ABYFS63431M1ZC"
        assert res["canonical_gstin"] == "33ABYFS6343M1ZC"
        # Phase 3: vendor_name set to canonical (uppercase, space-collapsed)
        assert res["vendor_name"] == "SRI VISHNU HEAT TREATERS PVT LTD"
        assert res["raw_vendor_name"] == "SRI VISHNU HEAT TREATERS PVT LTD"
        assert res["canonical_vendor_name"] == "SRI VISHNU HEAT TREATERS PVT LTD"
        assert res["items"][0]["description"] == "CASEHARDENING"
        assert res["items"][0]["raw_item_name"] == "CASEHARDENTNG"
        assert res["items"][0]["canonical_item_name"] == "CASEHARDENING"
        assert res["items"][0]["hsn_sac"] == "998346"
        assert res["items"][0]["raw_hsn"] == "99834G"
        assert res["items"][0]["canonical_hsn"] == "998346"
