import os
import django
from django.db import connection, utils

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def add_columns():
    with connection.cursor() as cursor:
        try:
            cursor.execute("ALTER TABLE invoice_ocr_temp ADD COLUMN matched_by VARCHAR(50);")
            print("Column matched_by added.")
        except utils.Error:
            print("Column matched_by likely already exists.")
            
        try:
            cursor.execute("ALTER TABLE invoice_ocr_temp ADD COLUMN conflict_message TEXT;")
            print("Column conflict_message added.")
        except utils.Error:
            print("Column conflict_message likely already exists.")

if __name__ == "__main__":
    add_columns()
