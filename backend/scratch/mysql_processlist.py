import os, pymysql
from dotenv import load_dotenv
load_dotenv(override=True)

db_name = os.getenv('DB_NAME')
db_user = os.getenv('DB_USER')
db_pass = os.getenv('DB_PASSWORD')
db_host = os.getenv('DB_HOST', 'localhost')
db_port = int(os.getenv('DB_PORT', '3306'))

print(f"Connecting to {db_host}:{db_port} as {db_user}...")
conn = pymysql.connect(
    host=db_host,
    port=db_port,
    user=db_user,
    password=db_pass,
    database=db_name,
    autocommit=True
)

try:
    with conn.cursor() as cursor:
        cursor.execute("SHOW PROCESSLIST")
        rows = cursor.fetchall()
        print("\n=== SHOW PROCESSLIST ===")
        for r in rows:
            print(r)
            
        cursor.execute("SELECT * FROM information_schema.innodb_locks")
        locks = cursor.fetchall()
        print("\n=== INNODB LOCKS ===")
        for l in locks:
            print(l)
            
        cursor.execute("SELECT * FROM information_schema.innodb_lock_waits")
        waits = cursor.fetchall()
        print("\n=== INNODB LOCK WAITS ===")
        for w in waits:
            print(w)
            
        cursor.execute("SELECT * FROM information_schema.innodb_trx")
        trx = cursor.fetchall()
        print("\n=== INNODB TRANSACTIONS ===")
        for t in trx:
            print(t)
finally:
    conn.close()
