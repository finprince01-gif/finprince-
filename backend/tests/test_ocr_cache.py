import pytest
from unittest.mock import patch
from ocr_pipeline.ocr_cache import OCRResponseCache, ItemExtractionConsensusEngine
from ocr_pipeline.models import AICache

@pytest.mark.django_db
def test_ocr_response_cache_store_and_get():
    file_hash = "abc123hash"
    page_number = 1
    
    # Payload with missing anchors or low confidence should not be cached
    invalid_payload = {
        "status": "OCR_FAILED",
        "invoice_no": "",
        "vendor_name": ""
    }
    assert OCRResponseCache.store(file_hash, page_number, invalid_payload) is False
    assert OCRResponseCache.get(file_hash, page_number) is None
    
    # High confidence valid payload
    valid_payload = {
        "invoice_no": "INV-100",
        "vendor_name": "SUPPLIER INC",
        "gstin": "33ABYFS6343M1ZC",
        "invoice_date": "2026-06-06",
        "items": [
            {"item_name": "WIDGET A", "qty": 10, "hsn_sac": "123456"},
            {"item_name": "WIDGET B", "qty": 5, "hsn_sac": "654321"}
        ]
    }
    
    # Store it
    assert OCRResponseCache.store(file_hash, page_number, valid_payload) is True
    
    # Retrieve it
    retrieved = OCRResponseCache.get(file_hash, page_number)
    assert retrieved is not None
    assert retrieved["invoice_no"] == "INV-100"
    assert retrieved["vendor_name"] == "SUPPLIER INC"
    assert len(retrieved["items"]) == 2
    
    # Test invalidation
    OCRResponseCache.invalidate(file_hash, page_number)
    assert OCRResponseCache.get(file_hash, page_number) is None


def test_item_consensus_engine_election():
    payloads = [
        # Run 1: 2 items
        {
            "invoice_no": "INV-100",
            "items": [
                {"item_name": "WIDGET A", "description": "WIDGET A", "qty": "10", "hsn_sac": "123456"},
                {"item_name": "WIDGET B", "description": "WIDGET B", "qty": "5", "hsn_sac": "654321"}
            ]
        },
        # Run 2: 2 items (with slight difference in item B description and HSN)
        {
            "invoice_no": "INV-100",
            "items": [
                {"item_name": "WIDGET A", "description": "WIDGET A", "qty": "10", "hsn_sac": "123456"},
                {"item_name": "WIDGET B", "description": "WIDGET B OCR", "qty": "5", "hsn_sac": "654321"}
            ]
        },
        # Run 3: 1 item (Gemini failed to extract the second)
        {
            "invoice_no": "INV-100",
            "items": [
                {"item_name": "WIDGET A", "description": "WIDGET A", "qty": "10", "hsn_sac": "123456"}
            ]
        }
    ]
    
    elected, conf, reason = ItemExtractionConsensusEngine.elect(
        payloads, invoice_no="INV-100", file_hash="hash1", page_number=1
    )
    
    # Consensus should pick 2 items (votes: 2/3)
    assert len(elected["items"]) == 2
    assert conf == pytest.approx(2.0 / 3.0)
    assert "item_count_consensus:2" in reason
    
    # Check item details elected by consensus
    assert elected["items"][0]["item_name"] == "WIDGET A"
    assert elected["items"][1]["item_name"] == "WIDGET B"
    # For description, "WIDGET B" has 1 vote, "WIDGET B OCR" has 1 vote. The election picks the first candidate's value as fallback/majority.
    # Let's ensure both are strings.
    assert isinstance(elected["items"][1]["description"], str)
