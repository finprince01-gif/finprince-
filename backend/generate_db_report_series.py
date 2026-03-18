import os
import sys

# Add backend to path so we can import django etc if needed
backend_path = os.path.dirname(os.path.abspath(__file__))
if backend_path not in sys.path:
    sys.path.append(backend_path)

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
try:
    import django
    django.setup()
    from django.db import connection
except ImportError:
    print("Django not found in the current environment.")
    sys.exit(1)

def main():
    table = 'customer_masters_salesorder'
    try:
        with connection.cursor() as cursor:
            cursor.execute(f"SHOW COLUMNS FROM {table}")
            cols = [row[0] for row in cursor.fetchall()]
            print(f"{table} columns: {', '.join(cols)}")
    except Exception as e:
        print(f"Error checking table {table}: {e}")

if __name__ == "__main__":
    main()
