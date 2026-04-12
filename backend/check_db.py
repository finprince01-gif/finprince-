
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from accounting.models_voucher_receipt import ReceiptVoucher
from django.db import connection

with connection.cursor() as cursor:
    cursor.execute("DESCRIBE receipt_vouchers")
    columns = cursor.fetchall()
    for col in columns:
        print(col)
