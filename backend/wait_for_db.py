import socket
import time
import os

def wait_for_db():
    host = os.getenv('DB_HOST', 'db')
    port = int(os.getenv('DB_PORT', 3306))
    print(f"Waiting for database at {host}:{port}...")
    while True:
        try:
            with socket.create_connection((host, port), timeout=1):
                print("Database is UP!")
                break
        except (socket.timeout, ConnectionRefusedError):
            print("Database not ready yet, retrying in 2 seconds...")
            time.sleep(2)

if __name__ == "__main__":
    wait_for_db()
