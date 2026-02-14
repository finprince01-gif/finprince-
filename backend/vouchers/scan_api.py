import os
import json
import tempfile
import uuid
import base64
from datetime import datetime
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.conf import settings
import google.generativeai as genai
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill

# Configure Gemini
GEN_API_KEY = os.environ.get('GEMINI_API_KEY')
if GEN_API_KEY:
    genai.configure(api_key=GEN_API_KEY)

# 109 Field Headers as defined in specification
FIELD_HEADERS = [
    'Voucher Date', 'Invoice Number', 'Purchase Order No.', 'PO Date',
    'Supplier Name', 'Supplier Address - Bill from', 'Supplier Address - Ship from',
    'Email ID', 'Phone Number', 'Sales Person', 'GSTIN', 'PAN', 'MSME Number',
    'Mode/Terms of Payment', 'Terms of Delivery',
    'Ledger Amount', 'Ledger Rate', 'Ledger Amount Dr/Cr', 'Ledger Narration',
    'Description of Ledger', 'Type of Tax Payment',
    'Item Code', 'Item/Description', 'Quantity', 'Quantity UOM', 'Item Rate',
    'Disc%', 'Item Amount', 'Marks', 'No. of Packages', 'Freight Charges',
    'HSN/SAC Details',
    'GST Rate', 'IGST Amount', 'CGST Amount', 'SGST/UTGST Amount',
    'Cess Rate', 'Cess Amount', 'State Cess Rate', 'State Cess Amount',
    'Applicable for Reverse Charge', 'Taxable Value', 'Invoice Value',
    'VAT Registration No.', 'VAT Tax Rate', 'VAT Taxable Value',
    'Mode of Transport', 'Freight Basis', 'Delivery Challan No.',
    'Delivery Challan Date', 'Carrier Name/Agent', 'LR RR No.', 'LR RR No. - Date',
    'Motor Vehicle No.', 'Vessel/Flight No.', 'Port of Loading', 'Port of Discharge',
    'Port Code (Discharge)', 'Additional Docs', 'Special Instructions',
    'Original Invoice No.', 'Original Invoice - Date',
    'e-Invoice - Ack No.', 'e-Invoice - Ack Date', 'e-Invoice - IRN',
    'e-Way Bill No.', 'e-Way Bill Date', 'Consolidated e-Way Bill No.',
    'Consolidated e-Way Bill Date', 'e-Way Bill Extension Details',
    'Advance Amount', 'Advance Taxable Value', 'Advance IGST Amount',
    'Advance SGST Amount', 'Advance CGST Amount', 'Advance Cess Amount',
    'Advance State Cess Amount',
    'TDS - Section', 'TDS - Description', 'TDS - Assessable Value',
    'Override TDS Exemption u/s 206C', 'Deductee Type',
    'TCS - Section', 'TCS - Description', 'TCS - Assessable Value',
    'Exemption from TCS for Buyer-Deductible TDS', 'TCS Party Details - Collectee Type',
    'Bank - A/c No.', 'Bank - Bank Name', 'Bank - Branch', 'Bank - IFS Code',
    'Payment Details (if any already paid)'
]

@csrf_exempt
@require_http_methods(["POST"])
def extract_invoice(request):
    """
    1. Accept uploaded invoice image.
    2. Extract data via Gemini OCR.
    3. Generate temporary Excel.
    4. Provide for download and delete.
    """
    if not request.FILES.get('file'):
        return JsonResponse({'error': 'No file uploaded'}, status=400)

    uploaded_file = request.FILES['file']
    
    try:
        # OCR using Gemini Vision
        model = genai.GenerativeModel('gemini-1.5-flash-latest')
        
        # Read file bytes
        file_bytes = uploaded_file.read()
        
        # Construct prompt for the 109 fields
        prompt = f"""
        Extract invoice data from this image. 
        Structure the output as a JSON object where the keys are exactly from this list:
        {json.dumps(FIELD_HEADERS)}
        
        Rules:
        - If a field is not found, leave it as an empty string "".
        - Format dates as dd/mm/yyyy.
        - Ensure numeric values are strings.
        - Search for "Supplier Address - Bill from", "Supplier Address - Ship from", "GSTIN", "PAN", etc.
        """
        
        response = model.generate_content([
            prompt,
            {'mime_type': uploaded_file.content_type, 'data': file_bytes}
        ])
        
        # Parse Gemini response (cleaning up potential markdown code blocks)
        raw_text = response.text.strip()
        if raw_text.startswith('```json'):
            raw_text = raw_text[7:-3].strip()
        elif raw_text.startswith('```'):
            raw_text = raw_text[3:-3].strip()
            
        extracted_json = json.loads(raw_text)
        
        # Filter only non-empty fields for UI and Excel
        filtered_data = {k: v for k, v in extracted_json.items() if v and str(v).strip() != ""}
        
        # Use all headers for Excel export as requested
        active_headers = FIELD_HEADERS
        
        # Create temporary Excel file with ONLY active headers
        temp_dir = tempfile.gettempdir()
        file_name = f"Invoice_Export_{uuid.uuid4().hex[:8]}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        file_path = os.path.join(temp_dir, file_name)
        
        wb = Workbook()
        ws = wb.active
        ws.title = "Extracted Invoice"
        
        # Header Styling
        header_fill = PatternFill(start_color="1E40AF", end_color="1E40AF", fill_type="solid")
        header_font = Font(color="FFFFFF", bold=True)
        
        # Write Headers (only active ones)
        for col, header in enumerate(active_headers, start=1):
            cell = ws.cell(row=1, column=col, value=header)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal="center")
            
        # Write Data (only active ones)
        for col, header in enumerate(active_headers, start=1):
            value = filtered_data.get(header, '')
            ws.cell(row=2, column=col, value=value)
            
        # Auto-adjust column width
        for column in ws.columns:
            max_length = 0
            column_letter = column[0].column_letter
            for cell in column:
                try:
                    if cell.value and len(str(cell.value)) > max_length:
                        max_length = len(str(cell.value))
                except:
                    pass
            ws.column_dimensions[column_letter].width = min(max_length + 4, 50)
            
        wb.save(file_path)
        
        # Read the file and encode to base64 for JSON response
        with open(file_path, "rb") as f:
            excel_base64 = base64.b64encode(f.read()).decode('utf-8')
            
        # Cleanup
        if os.path.exists(file_path):
            os.remove(file_path)
            
        return JsonResponse({
            'success': True,
            'data': filtered_data,
            'excel_file': excel_base64,
            'file_name': file_name
        })

    except Exception as e:

        return JsonResponse({'error': str(e)}, status=500)
