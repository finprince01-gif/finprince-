"""
RBAC Utilities and Constants
============================
Centralized structure and helper functions for Role-Based Access Control.
"""

# The full structure of pages and tabs in the application
APP_PERMISSIONS_STRUCTURE = {
    "Dashboard": {
        "tabs": []
    },
    "Masters": {
        "tabs": ["Ledgers", "Ledger Groups", "Chart of Accounts"]
    },
    "Inventory": {
        "tabs": ["Master", "Operations", "Reports"]
    },
    "Vouchers": {
        "tabs": ["Sales", "Purchase", "Payment", "Receipt", "Contra", "Journal", "Expenses"]
    },
    "Vendor Portal": {
        "tabs": ["Vendors", "Purchase Orders", "Payments"]
    },
    "Customer Portal": {
        "tabs": ["Customers", "Sales Orders", "Receipts"]
    },
    "Payroll": {
        "tabs": ["Employees", "Salary", "Attendance", "Reports"]
    },
    "Service": {
        "tabs": ["Services", "Bookings", "Invoices"]
    },
    "GST": {
        "tabs": ["GSTR-1", "GSTR-3B", "GST Reports"]
    },
    "Reports": {
        "tabs": ["Trial Balance", "Profit & Loss", "Balance Sheet", "GST Reports", "Ledger Reports"]
    },
    "Settings": {
        "tabs": ["Company", "Users", "Preferences", "Integrations"]
    },
    "Users & Roles": {
        "tabs": ["Users", "Roles"]
    }
}

def get_all_permission_ids():
    """
    Returns a list of all possible permission identifiers.
    Used during registration to grant full access to owner accounts.
    """
    permissions = []
    for page, data in APP_PERMISSIONS_STRUCTURE.items():
        # Add page-level view permission identifier
        permissions.append(page)
        # Add tab-level permission identifiers
        for tab in data.get('tabs', []):
            permissions.append(f"{page}.{tab}")
    return permissions

def get_permission_codes_from_ids(permission_ids):
    """
    Converts a flat list of permission identifiers into the hierarchical 
    nested dictionary structure used by the application.
    
    Structure:
    {
        "PageName": {
            "view": True,
            "tabs": {
                "TabName": True,
                ...
            }
        },
        ...
    }
    """
    structure = {}
    
    for perm_id in permission_ids:
        if '.' in perm_id:
            # Tab-level permission
            page, tab = perm_id.split('.', 1)
            if page not in structure:
                structure[page] = {'view': False, 'tabs': {}}
            if 'tabs' not in structure[page]:
                structure[page]['tabs'] = {}
            structure[page]['tabs'][tab] = True
        else:
            # Page-level permission
            page = perm_id
            if page not in structure:
                structure[page] = {'view': False, 'tabs': {}}
            structure[page]['view'] = True
            
    return structure
