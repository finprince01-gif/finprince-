"""
Delete Ledger Seed Data
Removes all seed data from the MasterLedger table.
"""

from django.core.management.base import BaseCommand
from django.db import transaction
from accounting.models import MasterLedger
from core.models import User


class Command(BaseCommand):
    help = 'Deletes all seed data from MasterLedger table'

    def add_arguments(self, parser):
        parser.add_argument(
            '--tenant-id',
            type=str,
            help='Tenant ID to delete data for (optional, will delete for all tenants if not provided)',
        )
        parser.add_argument(
            '--confirm',
            action='store_true',
            help='Confirm deletion without prompting',
        )

    def handle(self, *args, **options):
        tenant_id = options.get('tenant_id')
        confirm = options.get('confirm')
        
        # Build query
        if tenant_id:
            ledgers = MasterLedger.objects.filter(tenant_id=tenant_id)
            scope_msg = f'tenant {tenant_id}'
        else:
            ledgers = MasterLedger.objects.all()
            scope_msg = 'ALL tenants'
        
        count = ledgers.count()
        
        if count == 0:
            self.stdout.write(self.style.WARNING('No ledger data found to delete.'))
            return
        
        # Confirmation prompt
        if not confirm:
            self.stdout.write(self.style.WARNING(f'\n[WARNING] This will delete {count} ledger(s) for {scope_msg}!'))
            self.stdout.write('This action cannot be undone.\n')
            response = input('Type "DELETE" to confirm: ')
            
            if response != 'DELETE':
                self.stdout.write(self.style.ERROR('Deletion cancelled.'))
                return
        
        # Delete the data
        self.stdout.write(f'[INFO] Deleting {count} ledger(s) from {scope_msg}...')
        
        with transaction.atomic():
            deleted_count, _ = ledgers.delete()
        
        self.stdout.write(self.style.SUCCESS(f'[SUCCESS] Successfully deleted {deleted_count} ledger(s)!'))
