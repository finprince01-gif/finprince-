from django.core.management.base import BaseCommand
from accounting.models_voucher_purchase import VoucherPurchaseSupplierDetails
from accounting.serializers_voucher_purchase import VoucherPurchaseSupplierDetailsSerializer
from vendors.models import VendorMasterBasicDetail, VendorTransaction

class Command(BaseCommand):
    help = 'Backfills VendorTransaction rows for all existing Purchase Vouchers'

    def handle(self, *args, **options):
        purchases = VoucherPurchaseSupplierDetails.objects.all()
        self.stdout.write(f"Syncing {purchases.count()} Purchase Vouchers...")
        
        serializer = VoucherPurchaseSupplierDetailsSerializer()
        
        count = 0
        for purchase in purchases:
            try:
                # Reuse the logic I just added to the serializer
                serializer._mirror_to_vendor_portal(purchase)
                count += 1
                if count % 10 == 0:
                    self.stdout.write(f"Processed {count}...")
            except Exception as e:
                self.stderr.write(f"Error syncing purchase {purchase.id}: {str(e)}")
        
        self.stdout.write(self.style.SUCCESS(f"Successfully synced {count} Purchase Vouchers!"))
