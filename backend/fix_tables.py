
import os
import django
import re

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.db import connection

def fix_tables():
    schema_path = '../schema.sql' # d:\finpixe\Final_ai_accV01\Ai_Accounting_v1\schema.sql
    
    try:
        with open(schema_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except UnicodeDecodeError:
        with open(schema_path, 'r', encoding='latin-1') as f:
            content = f.read()

    # Find all customer_master_customer tables
    # Regex look for CREATE TABLE `X` (...);
    # Pattern: CREATE TABLE `(customer_master_customer_[^`]+)` \((.*?)\) ENGINE=
    


    # Use regex to find ANY vendor master table
    matches = re.findall(r"(CREATE TABLE `vendor_master_[^`]+` .*?;)", content, re.DOTALL | re.IGNORECASE)
    
    found = []
    # Just grab all of them
    for sql in matches:
        found.append(sql)
        # Extract table name for printing
        m = re.search(r"CREATE TABLE `([^`]+)`", sql)
        if m:
            print(f"Found SQL for: {m.group(1)}")

    if not found:
        print("No matching vendor tables found.")
        return
                
    if not found:
        print("No matching tables found in schema.sql. Checking regex/splitting...")
        return

    print(f"Found {len(found)} statements. Executing...")
    
    with connection.cursor() as cursor:
        cursor.execute("SET FOREIGN_KEY_CHECKS=0;")
        for sql in found:
            try:
                cursor.execute(sql)
                print(f"[SUCCESS] Executed SQL for table.")
            except Exception as e:
                if "1050" in str(e): # Exists
                    print(f"[SKIPPED] Table already exists.")
                else:
                    print(f"[ERROR] {e}")
        cursor.execute("SET FOREIGN_KEY_CHECKS=1;")

if __name__ == '__main__':
    fix_tables()
