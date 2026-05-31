import os
import sys
import pymysql
from dotenv import load_dotenv

load_dotenv()

db_user = os.getenv('DB_USER')
db_password = os.getenv('DB_PASSWORD')
db_host = os.getenv('DB_HOST', 'localhost')
db_port = int(os.getenv('DB_PORT', '3306'))

print(f"Connecting to MySQL at {db_host}:{db_port} as {db_user}...")
conn = pymysql.connect(
    host=db_host,
    user=db_user,
    password=db_password,
    port=db_port
)

try:
    with conn.cursor() as cursor:
        print("Dropping database test_ai_accounting2 if it exists...")
        cursor.execute("DROP DATABASE IF EXISTS test_ai_accounting2")
        print("Database dropped successfully!")
finally:
    conn.close()
