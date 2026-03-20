import mysql.connector

def find_tables():
    conn = mysql.connector.connect(
        user='root', 
        password='Ulaganathan123', 
        host='localhost', 
        port=3306
    )
    cursor = conn.cursor()
    cursor.execute("SHOW DATABASES")
    databases = [row[0] for row in cursor.fetchall()]
    
    target_tables = ['customer', 'outward_slip', 'sales_voucher']
    
    with open('scripts/db_search_results.txt', 'w') as f:
        for db in databases:
            if db in ['information_schema', 'mysql', 'performance_schema', 'sys']:
                continue
            f.write(f"=== DB: {db} ===\n")
            try:
                cursor.execute(f"USE `{db}`")
                cursor.execute("SHOW TABLES")
                tables = [row[0] for row in cursor.fetchall()]
                found_any = False
                for target in target_tables:
                    if target in tables:
                        f.write(f"FOUND TABLE: {target}\n")
                        cursor.execute(f"DESCRIBE `{target}`")
                        cols = cursor.fetchall()
                        for c in cols:
                            f.write(f"  {c}\n")
                        found_any = True
                if not found_any:
                    f.write("None of the target tables found.\n")
            except Exception as e:
                f.write(f"Error accessing DB: {e}\n")
            f.write("\n")
            
    conn.close()

if __name__ == "__main__":
    find_tables()
