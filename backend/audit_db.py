import os
import django
from django.db import connection
import json

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

def get_db_schema():
    cursor = connection.cursor()
    cursor.execute("SHOW TABLES")
    tables = [t[0] for t in cursor.fetchall()]
    
    db_schema = {}
    for table in tables:
        cursor.execute(f"DESCRIBE `{table}`")
        columns = cursor.fetchall()
        
        cols = []
        for col in columns:
            cols.append({
                "Field": col[0],
                "Type": col[1],
                "Null": col[2],
                "Key": col[3],
                "Default": col[4],
                "Extra": col[5]
            })
        db_schema[table] = cols
    return db_schema

if __name__ == "__main__":
    db_schema = get_db_schema()
    with open("db_audit.json", "w") as f:
        json.dump(db_schema, f, indent=4)
    print("DB audit saved to db_audit.json")
