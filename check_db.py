import mysql.connector
import os
from dotenv import load_dotenv

env_path = os.path.join('backend', '.env')
load_dotenv(env_path)

db_user = os.getenv("DB_USER")
db_password = os.getenv("DB_PASSWORD")
db_name = os.getenv("DB_NAME")

print(f"Connecting as {db_user} to {db_name}...")

try:
    conn = mysql.connector.connect(
        host="localhost",
        user=db_user,
        password=db_password,
        database=db_name
    )
    cursor = conn.cursor()
    
    tables = [
        'customer_transaction_salesorder_basicdetails',
        'customer_transaction_salesorder_items',
        'customer_transaction_salesorder_deliveryterms'
    ]
    
    for table in tables:
        cursor.execute(f"DESCRIBE {table}")
        columns = [col[0] for col in cursor.fetchall()]
        print(f"Table {table} columns: {columns}")
        
    conn.close()
except Exception as e:
    print(f"Error: {e}")
