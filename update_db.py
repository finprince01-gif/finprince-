import mysql.connector
import os
from dotenv import load_dotenv

env_path = os.path.join('backend', '.env')
load_dotenv(env_path)

db_user = os.getenv("DB_USER")
db_password = os.getenv("DB_PASSWORD")
db_name = os.getenv("DB_NAME")

print(f"Applying changes to {db_name}...")

try:
    conn = mysql.connector.connect(
        host="localhost",
        user=db_user,
        password=db_password,
        database=db_name
    )
    cursor = conn.cursor()
    
    # 1. Update basicdetails
    try:
        print("Adding gst_no to basicdetails...")
        cursor.execute("ALTER TABLE customer_transaction_salesorder_basicdetails ADD COLUMN gst_no varchar(20) DEFAULT NULL AFTER contact_number")
        print("Success.")
    except Exception as e:
        print(f"Note: {e}")

    # 2. Update items
    try:
        print("Adding gst_rate to items...")
        cursor.execute("ALTER TABLE customer_transaction_salesorder_items ADD COLUMN gst_rate decimal(5,2) DEFAULT '0.00' AFTER gst")
        print("Success.")
    except Exception as e:
        print(f"Note: {e}")

    try:
        print("Adding uom to items...")
        cursor.execute("ALTER TABLE customer_transaction_salesorder_items ADD COLUMN uom varchar(50) DEFAULT NULL AFTER net_value")
        print("Success.")
    except Exception as e:
        print(f"Note: {e}")

    # 3. Update deliveryterms
    try:
        print("Adding third_party_address to deliveryterms...")
        cursor.execute("ALTER TABLE customer_transaction_salesorder_deliveryterms ADD COLUMN third_party_address json DEFAULT NULL AFTER delivery_date")
        print("Success.")
    except Exception as e:
        print(f"Note: {e}")

    conn.commit()
    conn.close()
    print("Database update complete.")
except Exception as e:
    print(f"Critical Error: {e}")
