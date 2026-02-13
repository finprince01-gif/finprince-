import mysql.connector
import os
from dotenv import load_dotenv

env_path = os.path.join('backend', '.env')
load_dotenv(env_path)

conn = mysql.connector.connect(
    host="localhost",
    user=os.getenv("DB_USER"),
    password=os.getenv("DB_PASSWORD"),
    database=os.getenv("DB_NAME")
)
cursor = conn.cursor()

tables = [
    'customer_transaction_salesorder_basicdetails',
    'customer_transaction_salesorder_items',
    'customer_transaction_salesorder_deliveryterms'
]

for table in tables:
    print(f"\nStructure for {table}:")
    cursor.execute(f"DESCRIBE {table}")
    for row in cursor.fetchall():
        print(row)

conn.close()
