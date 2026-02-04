
import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

with connection.cursor() as cursor:
    cursor.execute("SHOW TABLES")
    tables = [row[0] for row in cursor.fetchall()]
    
with open('tables_list.txt', 'w', encoding='utf-8') as f:
    for t in tables:
        f.write(t + "\n")
        
print(f"Listed {len(tables)} tables to tables_list.txt")
