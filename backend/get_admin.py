
import os
import django
from django.db import connection

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()


with connection.cursor() as cursor:
    cursor.execute("SELECT username, email FROM users WHERE email = 'admin@gmail.com'")
    row = cursor.fetchone()
    if row:
        print(f"Username: {row[0]}, Email: {row[1]}")
    else:
        print("Admin user not found.")
