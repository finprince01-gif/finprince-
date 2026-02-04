
import os
import django
import sys
import re

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.db import connection

def run_schema():
    print("Running schema.sql against current database...")
    
    schema_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'schema.sql')
    if not os.path.exists(schema_path):
        print(f"Error: schema.sql not found at {schema_path}")
        return

    with open(schema_path, 'r', encoding='utf-8') as f:
        sql_content = f.read()

    # Remove CREATE DATABASE statement
    sql_content = re.sub(r'create database .*?;', '', sql_content, flags=re.IGNORECASE)

    # Split into statements
    statements = sql_content.split(';')
    
    with connection.cursor() as cursor:
        cursor.execute("SET FOREIGN_KEY_CHECKS=0;")
        
        success_count = 0
        error_count = 0
        
        for statement in statements:
            if not statement.strip():
                continue
                
            try:
                cursor.execute(statement)
                success_count += 1
            except Exception as e:
                err_msg = str(e)
                # Ignore "Table already exists"
                if "1050" in err_msg and "already exists" in err_msg:
                    print(f"Skipping existing table.")
                elif "1007" in err_msg and "database exists" in err_msg:
                    print(f"Skipping database creation.")
                else:
                    print(f"Error executing statement: {statement[:50]}... \nError: {e}")
                    error_count += 1

        cursor.execute("SET FOREIGN_KEY_CHECKS=1;")
        
    print(f"\nSchema execution complete.")
    print(f"Success: {success_count}")
    print(f"Errors: {error_count}")

if __name__ == '__main__':
    run_schema()
