import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from accounting.models_voucher_sales import (
    VoucherSalesInvoiceDetails, VoucherSalesItems, VoucherSalesItemsForeign,
    VoucherSalesPaymentDetails, VoucherSalesDispatchDetails,
    VoucherSalesEwayBill
)

def compare_model_to_db(model_class):
    table_name = model_class._meta.db_table
    model_fields = [f.column for f in model_class._meta.fields if not f.auto_created]
    
    with connection.cursor() as cursor:
        try:
            cursor.execute(f"DESCRIBE {table_name}")
            db_columns = [row[0] for row in cursor.fetchall()]
        except Exception as e:
            print(f"Error checking table {table_name}: {e}")
            return

    missing_in_db = [f for f in model_fields if f not in db_columns]
    print(f"Table: {table_name}")
    if missing_in_db:
        print(f"  MISSING in DB: {missing_in_db}")
    else:
        print(f"  All model fields present in DB.")

if __name__ == "__main__":
    models = [
        VoucherSalesInvoiceDetails, VoucherSalesItems, VoucherSalesItemsForeign,
        VoucherSalesPaymentDetails, VoucherSalesDispatchDetails,
        VoucherSalesEwayBill
    ]
    for m in models:
        compare_model_to_db(m)
