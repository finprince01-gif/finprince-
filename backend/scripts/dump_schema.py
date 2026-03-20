import mysql.connector

def dump_schema():
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
    
    with open('scripts/full_db_dump.txt', 'w') as f:
        for table in tables:
            f.write(f"=== TABLE: {table} ===\n")
            cursor.execute(f"DESCRIBE `{table}`")
            cols = cursor.fetchall()
            for c in cols:
                f.write(f"  {c}\n")
            f.write("\n")
    conn.close()

if __name__ == "__main__":
    dump_schema()
