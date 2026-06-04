from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

class CanonicalInvoiceItem(BaseModel):
    """Authoritative schema for invoice line items."""
    description: str = ""
    hsn_sac: str = ""
    qty: float = 0.0
    uom: str = ""
    rate: float = 0.0
    taxable_value: float = 0.0
    igst: float = 0.0
    cgst: float = 0.0
    sgst: float = 0.0
    total_amount: float = 0.0
    igst_rate: float = 0.0
    cgst_rate: float = 0.0
    sgst_rate: float = 0.0
    cess_rate: float = 0.0

class CanonicalInvoiceSchema(BaseModel):
    """
    [CANONICAL_SCHEMA_LOCKED]
    ONE authoritative invoice schema for ALL layers:
    extraction -> normalization -> merger -> snapshots -> API -> frontend -> exports.
    """
    # Identity
    invoice_no: str = ""
    invoice_date: str = "" # Format: DD-MM-YYYY
    vendor_name: str = ""
    gstin: str = ""
    raw_gstin: str = ""
    canonical_gstin: str = ""
    branch: str = ""
    hsn_sac: str = ""
    
    # Address & Logistics
    bill_from: str = ""
    bill_to: str = ""
    place_of_supply: str = ""
    
    # Totals
    total_taxable_value: float = 0.0
    total_igst: float = 0.0
    total_cgst: float = 0.0
    total_sgst: float = 0.0
    total_cess: float = 0.0
    round_off: float = 0.0
    total_invoice_value: float = 0.0
    
    # E-Invoicing (GST compliance)
    irn: str = ""
    ack_no: str = ""
    ack_date: str = ""
    
    # Line Items
    items: List[CanonicalInvoiceItem] = Field(default_factory=list)
    
    # Internal Metadata (not exported but preserved for lifecycle)
    warnings: List[str] = Field(default_factory=list)
    _is_canonical: bool = True
    _status: str = "SUCCESS"
    _error: Optional[str] = None
    _raw_response: Optional[Dict[str, Any]] = None
    _pdf_ocr_text: Optional[str] = None

class RawExtractionSchema(BaseModel):
    """Schema for AI extraction results before mapping."""
    invoice_number: Optional[str] = None
    invoice_date: Optional[str] = None
    gstin: Optional[str] = None
    total_amount: Optional[str] = None
    raw_response: Dict[str, Any] = Field(default_factory=dict)

class MappingConfig(BaseModel):
    """Configuration for alias-based field mapping."""
    aliases: List[str]

class NormalizedInvoiceSchema(BaseModel):
    """Legacy: use CanonicalInvoiceSchema instead."""
    invoice_number: str
    gstin: str
    invoice_date: str
    total_amount: float
    status: str
    error_code: Optional[str] = None
