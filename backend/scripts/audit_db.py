import mysql.connector

def check_structure():
    conn = mysql.connector.connect(
        user='root', 
        password='Ulaganathan123', 
        database='Finpixe_AI_Accounting', 
        host='localhost', 
        port=3306
    )
    cursor = conn.cursor()
    cursor.execute("SHOW TABLES")
    tables = [row[0] for row in cursor.fetchall()]
    
    with open('scripts/full_structure_audit.txt', 'w') as f:
        f.write("=== DATABASE TABLES ===\n")
        f.write("\n".join(tables) + "\n\n")
        
        for table in ['customer', 'outward_slip', 'sales_voucher']:
            if table in tables:
                f.write(f"--- DESCRIBE {table} ---\n")
                cursor.execute(f"DESCRIBE {table}")
                cols = cursor.fetchall()
                for c in cols:
                    f.write(str(c) + "\n")
                f.write("\n")
            else:
                f.write(f"Table {table} DOES NOT exist.\n\n")
                
    conn.close()

if __name__ == "__main__":
    check_structure()
