import mysql.connector

def check_tables():
    try:
        conn = mysql.connector.connect(
            user='root', 
            password='Ulaganathan123', 
            database='Finpixe_AI_Accounting', 
            host='localhost', 
            port=3306
        )
        cursor = conn.cursor()
        
        tables = ['customer', 'outward_slip', 'sales_voucher', 'customer_master', 'inventory_operation_outward', 'voucher_sales_invoicedetails']
        
        for table in tables:
            try:
                cursor.execute(f"DESCRIBE {table}")
                print(f"\n--- Table: {table} ---")
                columns = cursor.fetchall()
                for col in columns:
                    print(col)
            except mysql.connector.Error as err:
                print(f"\nTable {table} not found or error: {err}")
                
        conn.close()
    except mysql.connector.Error as err:
        print(f"Connection error: {err}")

if __name__ == "__main__":
    check_tables()
