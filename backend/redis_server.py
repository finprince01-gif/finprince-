import socket
import threading
import time

# Thread-safe in-memory store
store = {}
store_lock = threading.Lock()

def _int_safe(val, key=None):
    """Parse a stored value as int, or reset to 0 if corrupted."""
    try:
        if val is None: return 0
        return int(val)
    except (TypeError, ValueError):
        if key is not None:
            with store_lock:
                store[key] = "0"
        return 0

def execute_command_core(cmd, args):
    """
    Core command execution logic. Handles its own locking.
    Returns bytes to be sent to the client.
    """
    cmd = cmd.upper()
    
    # ── Blocking commands (Special handling to avoid deadlocks) ──
    if cmd == "BRPOP":
        timeout = _int_safe(args[-1])
        keys = args[1:-1]
        start_time = time.time()
        while True:
            with store_lock:
                val = None
                found_key = None
                for k in keys:
                    lst = store.get(k)
                    if isinstance(lst, list) and lst:
                        val = lst.pop()
                        found_key = k
                        break
                if val is not None:
                    vb, kb = str(val).encode('utf-8'), found_key.encode('utf-8')
                    return f"*2\r\n${len(kb)}\r\n".encode() + kb + f"\r\n${len(vb)}\r\n".encode() + vb + b"\r\n"
            
            if timeout > 0 and time.time() - start_time >= timeout:
                return b"*-1\r\n"
            time.sleep(0.1) # Short sleep, no lock held

    elif cmd == "BRPOPLPUSH":
        source, dest, timeout = args[1], args[2], _int_safe(args[3])
        start_time = time.time()
        while True:
            with store_lock:
                val = None
                src_lst = store.get(source)
                if isinstance(src_lst, list) and src_lst:
                    val = src_lst.pop()
                    if not isinstance(store.get(dest), list): store[dest] = []
                    store[dest].insert(0, val)
                    vb = str(val).encode('utf-8')
                    return f"${len(vb)}\r\n".encode() + vb + b"\r\n"
            
            if timeout > 0 and time.time() - start_time >= timeout:
                return b"$-1\r\n"
            time.sleep(0.1)

    # ── Non-blocking commands ──
    with store_lock:
        if cmd == "PING":
            return b"+PONG\r\n"

        elif cmd == "COMMAND":
            return b"*0\r\n"

        elif cmd == "SET":
            store[args[1]] = args[2]
            return b"+OK\r\n"

        elif cmd == "SETEX":
            # SETEX <key> <seconds> <value>
            if len(args) >= 4:
                store[args[1]] = args[3]
                return b"+OK\r\n"
            return b"-ERR wrong number of arguments for 'setex' command\r\n"

        elif cmd == "GET":
            val = store.get(args[1])
            if val is None or isinstance(val, (dict, list)):
                return b"$-1\r\n"
            else:
                vb = str(val).encode('utf-8')
                return f"${len(vb)}\r\n".encode() + vb + b"\r\n"

        elif cmd == "DEL":
            count = sum(1 for k in args[1:] if store.pop(k, None) is not None)
            return f":{count}\r\n".encode()

        elif cmd == "EXISTS":
            count = sum(1 for k in args[1:] if k in store)
            return f":{count}\r\n".encode()

        elif cmd in ("EXPIRE", "EXPIREAT", "PEXPIRE", "PEXPIREAT", "PERSIST"):
            return b":1\r\n"

        elif cmd == "INCR":
            key = args[1]
            val = _int_safe(store.get(key), key) + 1
            store[key] = str(val)
            return f":{val}\r\n".encode()

        elif cmd == "DECR":
            key = args[1]
            val = max(0, _int_safe(store.get(key), key) - 1)
            store[key] = str(val)
            return f":{val}\r\n".encode()

        elif cmd == "INCRBY":
            key, delta = args[1], _int_safe(args[2] if len(args) > 2 else 1)
            val = _int_safe(store.get(key), key) + delta
            store[key] = str(val)
            return f":{val}\r\n".encode()

        elif cmd == "RPOPLPUSH":
            source, destination = args[1], args[2]
            src_list = store.get(source)
            if not isinstance(src_list, list) or not src_list:
                return b"$-1\r\n"
            val = src_list.pop()
            if not isinstance(store.get(destination), list):
                store[destination] = []
            store[destination].insert(0, val)
            vb = val.encode('utf-8') if isinstance(val, str) else val
            return f"${len(vb)}\r\n".encode() + vb + b"\r\n"

        elif cmd == "LREM":
            # LREM key count value
            key, count, value = args[1], int(args[2]), args[3]
            lst = store.get(key)
            if not isinstance(lst, list):
                return b":0\r\n"
            original_len = len(lst)
            store[key] = [x for x in lst if x != value]
            removed = original_len - len(store[key])
            return f":{removed}\r\n".encode()

        elif cmd == "HSET":
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
            return f":{added}\r\n".encode()

        elif cmd == "HMSET":
            key = args[1]
            if not isinstance(store.get(key), dict):
                store[key] = {}
            pairs = args[2:]
            for i in range(0, len(pairs) - 1, 2):
                store[key][pairs[i]] = pairs[i + 1]
            return b"+OK\r\n"

        elif cmd == "HGET":
            key, field = args[1], args[2]
            h = store.get(key)
            if isinstance(h, dict) and field in h:
                vb = str(h[field]).encode('utf-8')
                return f"${len(vb)}\r\n".encode() + vb + b"\r\n"
            else:
                return b"$-1\r\n"

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
                return f"*{len(h) * 2}\r\n".encode() + b"".join(parts)
            else:
                return b"*0\r\n"

        elif cmd == "HINCRBY":
            key, field, delta = args[1], args[2], _int_safe(args[3] if len(args) > 3 else 1)
            if not isinstance(store.get(key), dict):
                store[key] = {}
            cur = _int_safe(store[key].get(field, 0))
            store[key][field] = str(cur + delta)
            return f":{cur + delta}\r\n".encode()

        elif cmd == "LPUSH":
            key = args[1]
            if not isinstance(store.get(key), list):
                store[key] = []
            for v in args[2:]:
                store[key].insert(0, v)
            return f":{len(store[key])}\r\n".encode()

        elif cmd == "RPUSH":
            key = args[1]
            if not isinstance(store.get(key), list):
                store[key] = []
            for v in args[2:]:
                store[key].append(v)
            return f":{len(store[key])}\r\n".encode()

        elif cmd == "LPOP":
            key = args[1]
            lst = store.get(key)
            if isinstance(lst, list) and lst:
                vb = str(lst.pop(0)).encode('utf-8')
                return f"${len(vb)}\r\n".encode() + vb + b"\r\n"
            else:
                return b"$-1\r\n"

        elif cmd == "RPOP":
            key = args[1]
            lst = store.get(key)
            if isinstance(lst, list) and lst:
                vb = str(lst.pop()).encode('utf-8')
                return f"${len(vb)}\r\n".encode() + vb + b"\r\n"
            else:
                return b"$-1\r\n"

        elif cmd == "LLEN":
            key = args[1]
            lst = store.get(key)
            l = len(lst) if isinstance(lst, list) else 0
            return f":{l}\r\n".encode()

        elif cmd == "LTRIM":
            key, start, stop = args[1], _int_safe(args[2]), _int_safe(args[3])
            lst = store.get(key)
            if isinstance(lst, list): store[key] = lst[start: stop + 1]
            return b"+OK\r\n"

        elif cmd == "LREM":
            key, count, value = args[1], _int_safe(args[2]), args[3]
            lst = store.get(key); removed = 0
            if isinstance(lst, list):
                new_list = []
                for x in lst:
                    if x == value and (count == 0 or removed < abs(count)): removed += 1
                    else: new_list.append(x)
                store[key] = new_list
            return f":{removed}\r\n".encode()

        elif cmd in ("ZADD", "ZREM", "ZREMRANGEBYSCORE", "ZCARD"):
            return b":1\r\n"
        elif cmd == "ZRANGE":
            return b"*0\r\n"

        elif cmd == "KEYS":
            pattern = args[1] if len(args) > 1 else "*"
            matched = list(store.keys()) if pattern == "*" else [k for k in store if k.startswith(pattern.rstrip("*"))]
            resp = f"*{len(matched)}\r\n".encode()
            for k in matched:
                kb = k.encode('utf-8')
                resp += f"${len(kb)}\r\n".encode() + kb + b"\r\n"
            return resp

        elif cmd == "FLUSHALL":
            store.clear()
            return b"+OK\r\n"

        elif cmd in ("EVAL", "SCRIPT"):
            return b"+OK\r\n"

        else:
            return b"-ERR unknown command '" + cmd.encode('utf-8') + b"'\r\n"

def handle_client(conn, addr):
    transaction_buffer = None
    buffer = b""
    try:
        while True:
            data = conn.recv(65536) # Larger buffer
            if not data: break
            buffer += data
            
            while True:
                if not buffer: break
                
                # Check for *<num_args>\r\n (Array format)
                if buffer.startswith(b"*"):
                    newline_idx = buffer.find(b"\r\n")
                    if newline_idx == -1: break # Wait for more
                    
                    try:
                        num_args = int(buffer[1:newline_idx])
                    except ValueError:
                        buffer = b"" # Corrupted
                        break
                    
                    pos = newline_idx + 2
                    args = []
                    full_command_received = True
                    
                    for _ in range(num_args):
                        if pos + 1 >= len(buffer):
                            full_command_received = False; break
                        
                        if buffer[pos:pos+1] != b"$":
                            full_command_received = False; break
                        
                        next_newline = buffer.find(b"\r\n", pos)
                        if next_newline == -1:
                            full_command_received = False; break
                        
                        try:
                            arg_len = int(buffer[pos+1:next_newline])
                        except ValueError:
                            full_command_received = False; break
                        
                        pos = next_newline + 2
                        # Check if we have the arg + terminating \r\n
                        if pos + arg_len + 2 > len(buffer):
                            full_command_received = False; break
                        
                        # Extract argument
                        arg_data = buffer[pos:pos+arg_len]
                        args.append(arg_data.decode('utf-8', errors='ignore'))
                        pos += arg_len + 2
                    
                    if not full_command_received:
                        break # Wait for more data
                    
                    # Advance buffer
                    buffer = buffer[pos:]
                    
                else:
                    # Inline command fallback (e.g. PING)
                    newline_idx = buffer.find(b"\r\n")
                    if newline_idx == -1: break
                    line = buffer[:newline_idx].decode('utf-8', errors='ignore')
                    buffer = buffer[newline_idx+2:]
                    args = line.split()
                    if not args: continue

                # ── COMMAND EXECUTION ──
                cmd = args[0].upper()
                if cmd == "MULTI":
                    transaction_buffer = []; conn.sendall(b"+OK\r\n")
                    continue
                if cmd == "EXEC":
                    if transaction_buffer is None: conn.sendall(b"-ERR EXEC without MULTI\r\n")
                    else:
                        resp = f"*{len(transaction_buffer)}\r\n".encode() + b"".join(transaction_buffer)
                        conn.sendall(resp); transaction_buffer = None
                    continue
                if cmd == "DISCARD":
                    transaction_buffer = None; conn.sendall(b"+OK\r\n")
                    continue
                
                response = execute_command_core(cmd, args)
                if transaction_buffer is not None:
                    transaction_buffer.append(response)
                    conn.sendall(b"+QUEUED\r\n")
                else:
                    conn.sendall(response)
    except Exception:
        pass
    finally:
        try: conn.close()
        except: pass


def run_server():
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(('127.0.0.1', 6379))
    server.listen(100)
    print("Redis emulator running on 127.0.0.1:6379 (transaction support)")
    while True:
        conn, addr = server.accept()
        threading.Thread(target=handle_client, args=(conn, addr), daemon=True).start()

if __name__ == "__main__":
    run_server()
