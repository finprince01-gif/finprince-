"""
Grant Full Permissions to All Roles
====================================
Management command to grant full permissions to all roles
"""

from django.core.management.base import BaseCommand
from rbac.models import Role
import json


class Command(BaseCommand):
    help = 'Grant full permissions to all roles'

    def handle(self, *args, **options):
        # Define full permissions structure
        full_permissions = {
            "Dashboard": {
                "view": True,
                "tabs": {}
            },
            "Masters": {
                "view": True,
                "tabs": {
                    "Ledgers": True,
                    "Ledger Groups": True,
                    "Chart of Accounts": True
                }
            },
            "Inventory": {
                "view": True,
                "tabs": {
                    "Master": True,
                    "Operations": True,
                    "Reports": True
                }
            },
            "Vouchers": {
                "view": True,
                "tabs": {
                    "Sales": True,
                    "Purchase": True,
                    "Payment": True,
                    "Receipt": True,
                    "Contra": True,
                    "Journal": True,
                    "Expenses": True
                }
            },
            "Vendor Portal": {
                "view": True,
                "tabs": {
                    "Vendors": True,
                    "Purchase Orders": True,
                    "Payments": True
                }
            },
            "Customer Portal": {
                "view": True,
                "tabs": {
                    "Customers": True,
                    "Sales Orders": True,
                    "Receipts": True
                }
            },
            "Payroll": {
                "view": True,
                "tabs": {
                    "Employees": True,
                    "Salary": True,
                    "Attendance": True,
                    "Reports": True
                }
            },
            "Service": {
                "view": True,
                "tabs": {
                    "Services": True,
                    "Bookings": True,
                    "Invoices": True
                }
            },
            "GST": {
                "view": True,
                "tabs": {
                    "GSTR-1": True,
                    "GSTR-3B": True,
                    "GST Reports": True
                }
            },
            "Reports": {
                "view": True,
                "tabs": {
                    "Trial Balance": True,
                    "Profit & Loss": True,
                    "Balance Sheet": True,
                    "GST Reports": True,
                    "Ledger Reports": True
                }
            },
            "Settings": {
                "view": True,
                "tabs": {
                    "Company": True,
                    "Users": True,
                    "Preferences": True,
                    "Integrations": True
                }
            },
            "Users & Roles": {
                "view": True,
                "tabs": {
                    "Users": True,
                    "Roles": True
                }
            }
        }
        
        # Update all roles
        roles = Role.objects.all()
        
        self.stdout.write(self.style.SUCCESS(f'\nFound {roles.count()} roles\n'))
        
        for role in roles:
            self.stdout.write(f'Updating role: {role.name}')
            role.permissions = full_permissions
            role.save()
            self.stdout.write(self.style.SUCCESS(f'  ✓ Updated {role.name}'))
        
        self.stdout.write(self.style.SUCCESS(f'\n✓ All roles updated with full permissions!'))
        self.stdout.write(self.style.WARNING('\nNote: Users need to log out and log back in for changes to take effect.'))
