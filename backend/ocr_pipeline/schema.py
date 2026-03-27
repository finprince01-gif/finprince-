from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

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
    """Final normalized data structure stored in the database."""
    invoice_number: str
    gstin: str
    invoice_date: str # ISO Format YYYY-MM-DD
    total_amount: float
    status: str
    error_code: Optional[str] = None
