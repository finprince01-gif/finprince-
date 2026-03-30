import os
import django
from django.db import connection
from django.db.models import fields

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from accounting.models_voucher_payment import PaymentVoucher, PaymentVoucherItem

def sync_table(model):
    table_name = model._meta.db_table
    with connection.cursor() as cursor:
        cursor.execute(f"SHOW TABLES LIKE '{table_name}'")
        if not cursor.fetchone():
            print(f"Table '{table_name}' does not exist. Please create it manually.")
            return

        cursor.execute(f"DESCRIBE {table_name}")
        existing_cols = {row[0]: row[1] for row in cursor.fetchall()}

        for field in model._meta.fields:
            col_name = field.column
            if col_name not in existing_cols:
                # Basic mapping for common types
                col_type = "TEXT"
                if isinstance(field, django.db.models.CharField):
                    col_type = f"VARCHAR({field.max_length})"
                elif isinstance(field, django.db.models.IntegerField) or isinstance(field, django.db.models.BigIntegerField) or isinstance(field, django.db.models.AutoField):
                    col_type = "BIGINT"
                elif isinstance(field, django.db.models.DecimalField):
                    col_type = f"DECIMAL({field.max_digits}, {field.decimal_places})"
                elif isinstance(field, django.db.models.DateField):
                    col_type = "DATE"
                elif isinstance(field, django.db.models.DateTimeField):
                    col_type = "DATETIME(6)"
                elif isinstance(field, django.db.models.BooleanField):
                    col_type = "BOOLEAN"
                elif isinstance(field, django.db.models.JSONField):
                    col_type = "JSON"
                
                sql = f"ALTER TABLE {table_name} ADD COLUMN {col_name} {col_type} NULL"
                print(f"Executing: {sql}")
                cursor.execute(sql)

if __name__ == "__main__":
    sync_table(PaymentVoucher)
    sync_table(PaymentVoucherItem)
