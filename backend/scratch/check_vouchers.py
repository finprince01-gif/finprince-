import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from django.db import connection

def check_vouchers():
    with connection.cursor() as cursor:
        try:
            cursor.execute("SELECT * FROM accounting_voucher LIMIT 1")
            row = cursor.fetchone()
            print(f"Successfully fetched a row: {row}")
        except Exception as e:
            print(f"Error fetching vouchers: {e}")

    # Check for missing fields in serializer vs model
    from accounting.models import Voucher
    from accounting.serializers import VoucherSerializer
    
    fields = [f.name for f in Voucher._meta.get_fields()]
    print(f"Voucher model fields: {fields}")

if __name__ == "__main__":
    check_vouchers()
