from core.exceptions import BranchAccessDenied

def nested_multipart_to_nested_dict(query_dict):
    """
    Helper to expand flattend keys from FormData into a nested dictionary.
    Handles 'obj.prop' and 'arr[0].prop' style keys.
    """
    import re
    result = {}
    
    for key in query_dict:
        # Get value - if it's a list (like from a QueryDict), take the first one
        # Unless it's truly a list of files or something, but here we expect unique keys
        value = query_dict[key]
        if hasattr(query_dict, 'getlist'):
             # If there's only one item, don't return as list unless it's an array key?
             # Actually, DRF-nested multipart usually has unique keys per item.
             pass

        parts = re.split(r'\.|(?=\[)', key)
        # parts might be ['items', '[0]', '.item_code'] if we used a different split
        # Let's use a simpler approach:
        
        # Split by '.' first
        top_parts = key.split('.')
        current = result
        
        for i, part in enumerate(top_parts):
            # Check for array notation in part: 'name[index]'
            if '[' in part and ']' in part:
                 name = part[:part.find('[')]
                 # Multiple indexes could exist like 'arr[0][1]' but we probably only have one
                 indexes = re.findall(r'\[(\d+)\]', part)
                 
                 # Navigate into 'name'
                 if name:
                     if name not in current or not isinstance(current[name], list):
                         current[name] = []
                     current = current[name]
                 
                 # Navigate through indexes
                 for j, idx_str in enumerate(indexes):
                     idx = int(idx_str)
                     while len(current) <= idx:
                         current.append({})
                     
                     if j < len(indexes) - 1 or i < len(top_parts) - 1:
                         # More to go
                         if not isinstance(current[idx], (dict, list)):
                             current[idx] = {}
                         current = current[idx]
                     else:
                         # Last part
                         current[idx] = value
            else:
                # Normal property
                if i < len(top_parts) - 1:
                    if part not in current or not isinstance(current[part], dict):
                        current[part] = {}
                    current = current[part]
                else:
                    current[part] = value
                    
    return result

def normalize_header(header):
    if not header:
        return ""
    import re
    return re.sub(r'[^a-z0-9]', '', str(header).lower())

def match_headers(excel_headers, target_columns):
    """
    Matches excel headers to standard target column labels using a pre-defined alias mapping.
    Returns: a dict of { target_label: 1-based index }
    """
    # Define comprehensive alias mapping
    ALIASES = {
        # Inventory
        "Item Code": ["itemcode", "code", "sku", "itemsku", "productcode", "itemid", "materialcode"],
        "Item Name": ["itemname", "name", "productname", "title", "materialname"],
        "Description": ["description", "desc", "itemdescription", "details"],
        "Category Path": ["categorypath", "category", "cat", "group", "subgroup", "categoryname"],
        "UOM": ["uom", "unit", "units", "uomcode", "measure"],
        "Alternate UOM": ["alternateuom", "altuom", "altunit", "alternateunit"],
        "Conversion Factor": ["conversionfactor", "conversion", "factor"],
        "Rate": ["rate", "cost", "price", "unitprice", "unitcost"],
        "Rate Unit": ["rateunit"],
        "HSN Code": ["hsncode", "hsn", "hsnsac", "hsn_sac"],
        "GST Rate": ["gstrate", "gst", "tax", "taxrate"],
        "Cess Rate": ["cessrate", "cess"],
        "Reorder Level": ["reorderlevel", "reorder"],
        "Is Saleable": ["issaleable", "saleable"],
        
        # Vendor / Customer
        "Vendor Name": ["vendorname", "vendor", "suppliername", "supplier", "companyname", "company"],
        "Vendor Code": ["vendorcode", "suppliercode"],
        "Customer Name": ["customername", "customer", "clientname", "client", "companyname", "company"],
        "Customer Code": ["customercode", "clientcode"],
        "PAN Number": ["pan", "pannumber", "panno", "pan_no"],
        "Contact Person": ["contactperson", "contact", "person", "representative"],
        "Email Address": ["email", "emailaddress", "email_address", "mail"],
        "Contact Number": ["contactnumber", "phone", "phonenumber", "mobile", "tel", "contact_no"],
        "Billing Currency": ["currency", "billingcurrency"],
        "GSTIN": ["gstin", "gstnumber", "gst_no"],
        "Branch Name": ["branch", "branchname", "reference_name"],
        "Address Line 1": ["address1", "addressline1", "address_line_1", "street"],
        "Address Line 2": ["address2", "addressline2", "address_line_2", "area"],
        "Address Line 3": ["address3", "addressline3", "address_line_3", "locality"],
        "City": ["city", "town"],
        "State": ["state", "province"],
        "Pincode": ["pincode", "zip", "zipcode", "pin"],
        "Country": ["country"],
        "Branch Contact Person": ["branchcontactperson", "branchcontact"],
        "Branch Email Address": ["branchemail", "branchemailaddress"],
        "Branch Contact Number": ["branchcontactnumber", "branchphone"],
        "MSME No": ["msme", "msmeno", "msme_no", "udyam", "udyamno"],
        "FSSAI No": ["fssai", "fssaino", "fssai_no"],
        "IEC Code": ["iec", "ieccode", "iec_code"],
        
        # Sales Vouchers
        "Date": ["date", "invoicedate"],
        "Sales Invoice Series": ["series", "invoiceseries"],
        "Sales Invoice No.": ["invoice_no", "invoiceno", "bill_no", "billno", "invoice number"],
        "Outward Slip No.": ["outwardslip", "slipno"],
        "Branch": ["branch", "customerbranch"],
        "Place of Supply": ["placeofsupply", "supplyplace"],
        "Reverse Charge": ["reversecharge"],
        "Nature of Supply": ["natureofsupply", "invoicetype"],
        "Exchange Rate": ["exchangerate"],
        "Bill To - Address Line 1": ["billtoaddress1"],
        "Bill To - Address Line 2": ["billtoaddress2"],
        "Bill To - Address Line 3": ["billtoaddress3"],
        "Bill To - City": ["billtocity"],
        "Bill To - State": ["billtostate"],
        "Bill To - Pincode": ["billtopincode"],
        "Bill To - Country": ["billtocountry"]
    }
    
    mapped = {}
    excel_headers_clean = [normalize_header(h) for h in excel_headers]
    matched_indices = set()
    
    # Pre-clean target labels
    target_clean_to_label = {}
    for col in target_columns:
        lbl = col["label"]
        target_clean_to_label[normalize_header(lbl)] = lbl
        if "key" in col:
            target_clean_to_label[normalize_header(col["key"])] = lbl
            
    # Pass 1: Direct matches
    for clean_lbl, lbl in target_clean_to_label.items():
        for idx, clean_eh in enumerate(excel_headers_clean):
            if clean_eh == clean_lbl and idx not in matched_indices:
                mapped[lbl] = idx + 1
                matched_indices.add(idx)
                break
                
    # Pass 2: Alias matches
    for lbl in [col["label"] for col in target_columns]:
        if lbl in mapped:
            continue
        aliases = ALIASES.get(lbl, [])
        cleaned_aliases = [normalize_header(a) for a in aliases]
        for clean_alias in cleaned_aliases:
            for idx, clean_eh in enumerate(excel_headers_clean):
                if clean_eh == clean_alias and idx not in matched_indices:
                    mapped[lbl] = idx + 1
                    matched_indices.add(idx)
                    break
            if lbl in mapped:
                break
                
    # Pass 3: Substring matches
    for clean_lbl, lbl in target_clean_to_label.items():
        if lbl in mapped:
            continue
        for idx, clean_eh in enumerate(excel_headers_clean):
            if idx not in matched_indices and clean_eh and clean_lbl and (clean_eh in clean_lbl or clean_lbl in clean_eh):
                mapped[lbl] = idx + 1
                matched_indices.add(idx)
                break
                
    return mapped
