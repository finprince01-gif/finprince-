import socket
import threading
import time

# Thread-safe in-memory store
store = {}
store_lock = threading.Lock()

def _int_safe(val, key=None):
    """Parse a stored value as int, or reset to 0 if corrupted."""
    try:
        return int(val)
    except (TypeError, ValueError):
        if key is not None:
            store[key] = "0"
        return 0

def handle_client(conn, addr):
    try:
        buffer = b""
        while True:
            data = conn.recv(4096)
            if not data:
                break
            buffer += data
            while b"\r\n" in buffer:
                if not buffer.startswith(b"*"):
                    buffer = b""
                    break

                lines = buffer.split(b"\r\n")
                try:
                    num_args = int(lines[0][1:])
                except ValueError:
                    buffer = b""
                    break

                if len(lines) < 2 * num_args + 1:
                    break  # wait for more data

                args = []
                for i in range(num_args):
                    args.append(lines[2 + i * 2].decode('utf-8', errors='ignore'))

                consumed = lines[0] + b"\r\n"
                for i in range(num_args):
                    consumed += lines[1 + i * 2] + b"\r\n" + lines[2 + i * 2] + b"\r\n"
                buffer = buffer[len(consumed):]

                cmd = args[0].upper()

                with store_lock:
                    # ── String commands ──────────────────────────────
                    if cmd == "PING":
                        conn.sendall(b"+PONG\r\n")

                    elif cmd == "COMMAND":
                        conn.sendall(b"*0\r\n")

                    elif cmd == "SET":
                        # SET key value [EX seconds] [KEEPTTL] ...
                        store[args[1]] = args[2]
                        conn.sendall(b"+OK\r\n")

                    elif cmd == "GET":
                        val = store.get(args[1])
                        if val is None or isinstance(val, (dict, list)):
                            conn.sendall(b"$-1\r\n")
                        else:
                            vb = str(val).encode('utf-8')
                            conn.sendall(f"${len(vb)}\r\n".encode() + vb + b"\r\n")

                    elif cmd == "DEL":
                        count = sum(1 for k in args[1:] if store.pop(k, None) is not None)
                        conn.sendall(f":{count}\r\n".encode())

                    elif cmd == "EXISTS":
                        count = sum(1 for k in args[1:] if k in store)
                        conn.sendall(f":{count}\r\n".encode())

                    elif cmd in ("EXPIRE", "EXPIREAT", "PEXPIRE", "PEXPIREAT", "PERSIST"):
                        # Emulator has no real TTL; just acknowledge
                        conn.sendall(b":1\r\n")

                    # ── Integer counter commands ─────────────────────
                    elif cmd == "INCR":
                        key = args[1]
                        store[key] = str(_int_safe(store.get(key), key) + 1)
                        conn.sendall(f":{store[key]}\r\n".encode())

                    elif cmd == "DECR":
                        key = args[1]
                        val = max(0, _int_safe(store.get(key), key) - 1)
                        store[key] = str(val)
                        conn.sendall(f":{val}\r\n".encode())

                    elif cmd == "INCRBY":
                        key, delta = args[1], _int_safe(args[2] if len(args) > 2 else 1)
                        store[key] = str(_int_safe(store.get(key), key) + delta)
                        conn.sendall(f":{store[key]}\r\n".encode())

                    elif cmd == "DECRBY":
                        key, delta = args[1], _int_safe(args[2] if len(args) > 2 else 1)
                        val = max(0, _int_safe(store.get(key), key) - delta)
                        store[key] = str(val)
                        conn.sendall(f":{val}\r\n".encode())

                    # ── Hash commands ────────────────────────────────
                    elif cmd == "HSET":
                        # HSET key field value [field value ...]
                        key = args[1]
                        if not isinstance(store.get(key), dict):
                            store[key] = {}
                        pairs = args[2:]
                        added = 0
                        for i in range(0, len(pairs) - 1, 2):
                            field, value = pairs[i], pairs[i + 1]
                            if field not in store[key]:
                                added += 1
                            store[key][field] = value
                        conn.sendall(f":{added}\r\n".encode())

                    elif cmd == "HMSET":
                        key = args[1]
                        if not isinstance(store.get(key), dict):
                            store[key] = {}
                        pairs = args[2:]
                        for i in range(0, len(pairs) - 1, 2):
                            store[key][pairs[i]] = pairs[i + 1]
                        conn.sendall(b"+OK\r\n")

                    elif cmd == "HGET":
                        key, field = args[1], args[2]
                        h = store.get(key)
                        if isinstance(h, dict) and field in h:
                            vb = str(h[field]).encode('utf-8')
                            conn.sendall(f"${len(vb)}\r\n".encode() + vb + b"\r\n")
                        else:
                            conn.sendall(b"$-1\r\n")

                    elif cmd == "HGETALL":
                        key = args[1]
                        h = store.get(key)
                        if isinstance(h, dict) and h:
                            parts = []
                            for k, v in h.items():
                                kb = str(k).encode('utf-8')
                                vb = str(v).encode('utf-8')
                                parts.append(f"${len(kb)}\r\n".encode() + kb + b"\r\n")
                                parts.append(f"${len(vb)}\r\n".encode() + vb + b"\r\n")
                            conn.sendall(f"*{len(h) * 2}\r\n".encode() + b"".join(parts))
                        else:
                            conn.sendall(b"*0\r\n")

                    elif cmd == "HINCRBY":
                        key, field, delta = args[1], args[2], _int_safe(args[3] if len(args) > 3 else 1)
                        if not isinstance(store.get(key), dict):
                            store[key] = {}
                        cur = _int_safe(store[key].get(field, 0))
                        store[key][field] = str(cur + delta)
                        conn.sendall(f":{cur + delta}\r\n".encode())

                    # ── List commands ────────────────────────────────
                    elif cmd == "LPUSH":
                        key = args[1]
                        if not isinstance(store.get(key), list):
                            store[key] = []
                        for v in args[2:]:
                            store[key].insert(0, v)
                        conn.sendall(f":{len(store[key])}\r\n".encode())

                    elif cmd == "RPUSH":
                        key = args[1]
                        if not isinstance(store.get(key), list):
                            store[key] = []
                        for v in args[2:]:
                            store[key].append(v)
                        conn.sendall(f":{len(store[key])}\r\n".encode())

                    elif cmd == "LPOP":
                        key = args[1]
                        lst = store.get(key)
                        if isinstance(lst, list) and lst:
                            vb = str(lst.pop(0)).encode('utf-8')
                            conn.sendall(f"${len(vb)}\r\n".encode() + vb + b"\r\n")
                        else:
                            conn.sendall(b"$-1\r\n")

                    elif cmd == "RPOP":
                        key = args[1]
                        lst = store.get(key)
                        if isinstance(lst, list) and lst:
                            vb = str(lst.pop()).encode('utf-8')
                            conn.sendall(f"${len(vb)}\r\n".encode() + vb + b"\r\n")
                        else:
                            conn.sendall(b"$-1\r\n")

                    elif cmd == "BRPOP":
                        timeout = _int_safe(args[-1])
                        keys = args[1:-1]
                        found = False
                        for k in keys:
                            lst = store.get(k)
                            if isinstance(lst, list) and lst:
                                vb = str(lst.pop()).encode('utf-8')
                                kb = k.encode('utf-8')
                                conn.sendall(
                                    f"*2\r\n${len(kb)}\r\n".encode() + kb +
                                    f"\r\n${len(vb)}\r\n".encode() + vb + b"\r\n"
                                )
                                found = True
                                break
                        if not found:
                            if timeout > 0:
                                time.sleep(min(timeout, 1))
                            conn.sendall(b"*-1\r\n")

                    elif cmd == "LLEN":
                        key = args[1]
                        lst = store.get(key)
                        l = len(lst) if isinstance(lst, list) else 0
                        conn.sendall(f":{l}\r\n".encode())

                    elif cmd == "LTRIM":
                        key = args[1]
                        start, stop = _int_safe(args[2]), _int_safe(args[3])
                        lst = store.get(key)
                        if isinstance(lst, list):
                            store[key] = lst[start: stop + 1]
                        conn.sendall(b"+OK\r\n")

                    # ── Sorted set stubs (not needed for rate limiting) ──
                    elif cmd == "ZADD":
                        conn.sendall(b":1\r\n")
                    elif cmd == "ZREM":
                        conn.sendall(b":1\r\n")
                    elif cmd == "ZREMRANGEBYSCORE":
                        conn.sendall(b":0\r\n")
                    elif cmd == "ZCARD":
                        conn.sendall(b":0\r\n")
                    elif cmd == "ZRANGE":
                        conn.sendall(b"*0\r\n")

                    # ── Script / pipeline stubs ──────────────────────
                    elif cmd in ("EVAL", "SCRIPT", "MULTI", "EXEC", "DISCARD"):
                        conn.sendall(b"+OK\r\n")

                    elif cmd == "KEYS":
                        pattern = args[1] if len(args) > 1 else "*"
                        matched = list(store.keys()) if pattern == "*" else [
                            k for k in store if k.startswith(pattern.rstrip("*"))
                        ]
                        resp = f"*{len(matched)}\r\n".encode()
                        for k in matched:
                            kb = k.encode('utf-8')
                            resp += f"${len(kb)}\r\n".encode() + kb + b"\r\n"
                        conn.sendall(resp)

                    elif cmd == "FLUSHALL":
                        store.clear()
                        conn.sendall(b"+OK\r\n")

                    else:
                        conn.sendall(b"+OK\r\n")

    except Exception:
        pass
    finally:
        conn.close()


def run_server():
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(('127.0.0.1', 6379))
    server.listen(100)
    print("Redis emulator running on 127.0.0.1:6379 (full command set)")
    while True:
        conn, addr = server.accept()
        t = threading.Thread(target=handle_client, args=(conn, addr), daemon=True)
        t.start()


if __name__ == "__main__":
    run_server()


