import socket
import threading
import time

# Simple in-memory storage for Redis commands
store = {}

def handle_client(conn, addr):
    try:
        buffer = b""
        while True:
            data = conn.recv(4096)
            if not data:
                break
            buffer += data
            while b"\r\n" in buffer:
                # Basic RESP parser
                # *N\r\n$M\r\narg\r\n
                if buffer.startswith(b"*"):
                    lines = buffer.split(b"\r\n")
                    try:
                        num_args = int(lines[0][1:])
                    except ValueError:
                        buffer = b""
                        break
                    
                    if len(lines) < 2 * num_args + 1:
                        break # wait for more data
                    
                    args = []
                    for i in range(num_args):
                        args.append(lines[2 + i*2].decode('utf-8', errors='ignore'))
                    
                    # Consume parsed bytes from the buffer
                    consumed = lines[0] + b"\r\n"
                    for i in range(num_args):
                        consumed += lines[1 + i*2] + b"\r\n" + lines[2 + i*2] + b"\r\n"
                    buffer = buffer[len(consumed):]

                    # Execute command
                    cmd = args[0].upper()
                    if cmd == "PING":
                        conn.sendall(b"+PONG\r\n")
                    elif cmd == "COMMAND":
                        conn.sendall(b"*0\r\n")
                    elif cmd == "SET":
                        store[args[1]] = args[2]
                        conn.sendall(b"+OK\r\n")
                    elif cmd == "GET":
                        val = store.get(args[1])
                        if val is None:
                            conn.sendall(b"$-1\r\n")
                        else:
                            val_bytes = str(val).encode('utf-8')
                            conn.sendall(f"${len(val_bytes)}\r\n".encode('utf-8') + val_bytes + b"\r\n")
                    elif cmd == "DEL":
                        keys = args[1:]
                        count = 0
                        for k in keys:
                            if k in store:
                                del store[k]
                                count += 1
                        conn.sendall(f":{count}\r\n".encode('utf-8'))
                    elif cmd == "EXISTS":
                        count = 1 if args[1] in store else 0
                        conn.sendall(f":{count}\r\n".encode('utf-8'))
                    elif cmd == "EXPIRE":
                        conn.sendall(b":1\r\n")
                    elif cmd == "LPUSH":
                        key = args[1]
                        vals = args[2:]
                        if key not in store or not isinstance(store[key], list):
                            store[key] = []
                        for v in vals:
                            store[key].insert(0, v)
                        conn.sendall(f":{len(store[key])}\r\n".encode('utf-8'))
                    elif cmd == "RPUSH":
                        key = args[1]
                        vals = args[2:]
                        if key not in store or not isinstance(store[key], list):
                            store[key] = []
                        for v in vals:
                            store[key].append(v)
                        conn.sendall(f":{len(store[key])}\r\n".encode('utf-8'))
                    elif cmd == "LPOP":
                        key = args[1]
                        if key in store and isinstance(store[key], list) and store[key]:
                            val = store[key].pop(0)
                            val_bytes = str(val).encode('utf-8')
                            conn.sendall(f"${len(val_bytes)}\r\n".encode('utf-8') + val_bytes + b"\r\n")
                        else:
                            conn.sendall(b"$-1\r\n")
                    elif cmd == "RPOP":
                        key = args[1]
                        if key in store and isinstance(store[key], list) and store[key]:
                            val = store[key].pop()
                            val_bytes = str(val).encode('utf-8')
                            conn.sendall(f"${len(val_bytes)}\r\n".encode('utf-8') + val_bytes + b"\r\n")
                        else:
                            conn.sendall(b"$-1\r\n")
                    elif cmd == "BRPOP":
                        timeout = int(args[-1])
                        keys = args[1:-1]
                        found = False
                        for k in keys:
                            if k in store and isinstance(store[k], list) and store[k]:
                                val = store[k].pop()
                                val_bytes = str(val).encode('utf-8')
                                k_bytes = k.encode('utf-8')
                                conn.sendall(f"*2\r\n${len(k_bytes)}\r\n".encode('utf-8') + k_bytes + f"\r\n${len(val_bytes)}\r\n".encode('utf-8') + val_bytes + b"\r\n")
                                found = True
                                break
                        if not found:
                            if timeout > 0:
                                time.sleep(min(timeout, 1))
                            conn.sendall(b"*-1\r\n")
                    elif cmd == "LLEN":
                        key = args[1]
                        l = len(store[key]) if key in store and isinstance(store[key], list) else 0
                        conn.sendall(f":{l}\r\n".encode('utf-8'))
                    elif cmd in ["ZADD", "ZREM", "ZREMRANGEBYSCORE", "ZCARD", "ZRANGE", "HGETALL", "HMSET", "HSET", "LTRIM", "EVAL", "SCRIPT"]:
                        if cmd == "ZCARD":
                            conn.sendall(b":0\r\n")
                        elif cmd == "ZRANGE":
                            conn.sendall(b"*0\r\n")
                        elif cmd in ["ZREMRANGEBYSCORE", "ZADD", "HSET"]:
                            conn.sendall(b":1\r\n")
                        else:
                            conn.sendall(b"+OK\r\n")
                    else:
                        conn.sendall(b"+OK\r\n")
                else:
                    buffer = b""
                    break
    except Exception:
        pass
    finally:
        conn.close()

def run_server():
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(('127.0.0.1', 6379))
    server.listen(100)
    print("Simulated Redis Server running on 127.0.0.1:6379...")
    while True:
        conn, addr = server.accept()
        t = threading.Thread(target=handle_client, args=(conn, addr), daemon=True)
        t.start()

if __name__ == "__main__":
    run_server()
