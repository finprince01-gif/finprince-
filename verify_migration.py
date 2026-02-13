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

try:
    conn = mysql.connector.connect(**db_config)
    cursor = conn.cursor()
    
    # Get table structure
    cursor.execute("DESCRIBE `customer_master_customer_productservice`")
    columns = cursor.fetchall()
    
    # Write to file
    with open('table_structure.txt', 'w', encoding='utf-8') as f:
        f.write("=" * 80 + "\n")
        f.write("TABLE: customer_master_customer_productservice\n")
        f.write("=" * 80 + "\n\n")
        f.write(f"{'Field':<30} {'Type':<25} {'Null':<6} {'Key':<6}\n")
        f.write("-" * 80 + "\n")
        
        for col in columns:
            field, type_, null, key, default, extra = col
            f.write(f"{field:<30} {type_:<25} {null:<6} {key:<6}\n")
        
        f.write("\n" + "=" * 80 + "\n")
        
        # Check for customer_uom
        has_customer_uom = any(col[0] == 'customer_uom' for col in columns)
        
        if has_customer_uom:
            f.write("STATUS: customer_uom column EXISTS (needs to be removed)\n")
            print("customer_uom column EXISTS")
        else:
            f.write("STATUS: customer_uom column REMOVED (migration successful!)\n")
            print("customer_uom column REMOVED - SUCCESS!")
        
        f.write("=" * 80 + "\n")
    
    cursor.close()
    conn.close()
    
    print("Table structure saved to table_structure.txt")
    
except Exception as e:
    print(f"Error: {e}")
    with open('table_structure.txt', 'w', encoding='utf-8') as f:
        f.write(f"ERROR: {e}\n")
