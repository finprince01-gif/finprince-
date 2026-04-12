import mysql.connector
import os

def fix_collations():
    try:
        # DB connection details - standard for this project
        conn = mysql.connector.connect(
            host="localhost",
            user="root",
            password="Dha10903@",
            database="ai_accounting"
        )
        cursor = conn.cursor()

        # 1. Get all tables with utf8mb4_0900_ai_ci collation
        cursor.execute("""
            SELECT TABLE_NAME 
            FROM information_schema.TABLES 
            WHERE TABLE_SCHEMA = 'ai_accounting' 
            AND TABLE_COLLATION = 'utf8mb4_0900_ai_ci'
        """)
        tables = [row[0] for row in cursor.fetchall()]

        print(f"Found {len(tables)} tables with utf8mb4_0900_ai_ci collation.")

        # 2. Convert each table to utf8mb4_unicode_ci
        for table in tables:
            print(f"Converting table: {table}")
            try:
                # This converts the table and all its character columns
                cursor.execute(f"ALTER TABLE `{table}` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
                conn.commit()
            except mysql.connector.Error as err:
                print(f"Error converting table {table}: {err}")

        # 3. Also check for columns that might have explicit collations even if table doesn't
        cursor.execute("""
            SELECT TABLE_NAME, COLUMN_NAME 
            FROM information_schema.COLUMNS 
            WHERE TABLE_SCHEMA = 'ai_accounting' 
            AND COLLATION_NAME = 'utf8mb4_0900_ai_ci'
        """)
        columns = cursor.fetchall()

        if columns:
            print(f"Found {len(columns)} extra columns with specific utf8mb4_0900_ai_ci collation.")
            for table, column in columns:
                print(f"Converting column: {table}.{column}")
                try:
                    # We need to know the column type to alter it correctly, but usually CONVERT TO on table handles most.
                    # This is a safety measure.
                    cursor.execute(f"ALTER TABLE `{table}` MODIFY `{column}` VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
                    conn.commit()
                except Exception as e:
                    print(f"Could not convert column {table}.{column} individually (might need specific type): {e}")

        print("Collation fix completed.")

    except mysql.connector.Error as err:
        print(f"Database error: {err}")
    finally:
        if 'conn' in locals() and conn.is_connected():
            cursor.close()
            conn.close()

if __name__ == "__main__":
    fix_collations()
