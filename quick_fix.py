import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'backend'))

import mysql.connector
from dotenv import load_dotenv

env_path = os.path.join(os.path.dirname(__file__), 'backend', '.env')
load_dotenv(env_path)

db_config = {
    'host': 'localhost',
    'user': os.getenv('DB_USER', 'root'),
    'password': os.getenv('DB_PASSWORD'),
    'database': os.getenv('DB_NAME', 'ai_accounting'),
    'port': int(os.getenv('DB_PORT', 3306))
}

conn = mysql.connector.connect(**db_config)
cursor = conn.cursor()

# Check current columns
cursor.execute("DESCRIBE `customer_master_customer_productservice`")
columns = cursor.fetchall()

print("Current columns in customer_master_customer_productservice:")
for col in columns:
    print(f"{col[0]}")

# Check if customer_uom exists
has_customer_uom = any(col[0] == 'customer_uom' for col in columns)

if has_customer_uom:
    print("\nRemoving customer_uom column...")
    cursor.execute("ALTER TABLE `customer_master_customer_productservice` DROP COLUMN `customer_uom`")
    conn.commit()
    print("DONE: customer_uom column removed!")
else:
    print("\nOK: customer_uom column does not exist")

cursor.close()
conn.close()
