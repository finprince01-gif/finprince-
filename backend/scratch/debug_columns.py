import os
import mysql.connector
from dotenv import load_dotenv

load_dotenv()

def check_columns():
    conn = mysql.connector.connect(
        host=os.getenv('DB_HOST', 'localhost'),
        user=os.getenv('DB_USER', 'root'),
        password=os.getenv('DB_PASSWORD', ''),
        database=os.getenv('DB_NAME', 'ai_accounting'),
        port=int(os.getenv('DB_PORT', 3306))
    )
    cursor = conn.cursor()
    
    tables = [
        "voucher_credit_note_invoice_details",
        "voucher_credit_note_due_details"
    ]
    
    for table in tables:
        print(f"\nColumns in {table}:")
        cursor.execute(f"SHOW COLUMNS FROM {table}")
        for col in cursor.fetchall():
            print(f" - {col[0]} ({col[1]})")
            
    cursor.close()
    conn.close()

if __name__ == "__main__":
    check_columns()
