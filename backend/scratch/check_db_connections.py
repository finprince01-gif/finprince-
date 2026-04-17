import os
import sys
import django

# Add current directory to path so 'backend' can be found
sys.path.append(os.getcwd())

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.db import connection

with connection.cursor() as cursor:
    cursor.execute("SHOW STATUS LIKE 'Threads_connected'")
    row = cursor.fetchone()
    print(f"Current connected threads: {row[1]}")

    cursor.execute("SHOW VARIABLES LIKE 'max_connections'")
    row = cursor.fetchone()
    print(f"Max connections: {row[1]}")
