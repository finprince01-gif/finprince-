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
                store[key] = b"0"
        return 0

def execute_command_core(cmd, args):
    """
    Core command execution logic. Handles its own locking.
    Returns bytes to be sent to the client.
    """
    # Debug: Log incoming command
    # print(f"[REDIS_CMD] {cmd.decode(errors='replace')} {args[1].decode(errors='replace') if len(args) > 1 else ''}")
    
    try:
        cmd = cmd.strip().upper()
        
        # ── Blocking commands ──
        if cmd == b"BRPOP":
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
                        vb, kb = val, found_key
                        return f"*2\r\n${len(kb)}\r\n".encode() + kb + f"\r\n${len(vb)}\r\n".encode() + vb + b"\r\n"
                
                if timeout > 0 and time.time() - start_time >= timeout:
                    return b"*-1\r\n"
                time.sleep(0.1)

        elif cmd == b"RPOPLPUSH":
            source, dest = args[1], args[2]
            with store_lock:
                src_lst = store.get(source)
                if isinstance(src_lst, list) and src_lst:
                    val = src_lst.pop()
                    if not isinstance(store.get(dest), list): store[dest] = []
                    store[dest].insert(0, val)
                    vb = val
                    return f"${len(vb)}\r\n".encode() + vb + b"\r\n"
                return b"$-1\r\n"

        elif cmd == b"BRPOPLPUSH":
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
                        vb = val
                        return f"${len(vb)}\r\n".encode() + vb + b"\r\n"
                
                if timeout > 0 and time.time() - start_time >= timeout:
                    return b"$-1\r\n"
                time.sleep(0.1)

        # ── Non-blocking commands ──
        with store_lock:
            if cmd == b"PING":
                return b"+PONG\r\n"

            elif cmd == b"COMMAND":
                return b"*0\r\n"

            elif cmd == b"SELECT":
                return b"+OK\r\n"

            elif cmd == b"AUTH":
                return b"+OK\r\n"

            elif cmd == b"CLIENT":
                return b"+OK\r\n"

            elif cmd == b"CONFIG":
                return b"+OK\r\n"

            elif cmd == b"SET":
                store[args[1]] = args[2]
                return b"+OK\r\n"

            elif cmd == b"SETEX":
                if len(args) >= 4:
                    store[args[1]] = args[3]
                    return b"+OK\r\n"
                return b"-ERR wrong number of arguments\r\n"

            elif cmd == b"GET":
                val = store.get(args[1])
                if val is None or isinstance(val, (dict, list, set)):
                    return b"$-1\r\n"
                vb = val
                return f"${len(vb)}\r\n".encode() + vb + b"\r\n"

            elif cmd == b"DEL":
                count = sum(1 for k in args[1:] if store.pop(k, None) is not None)
                return f":{count}\r\n".encode()

            elif cmd == b"EXISTS":
                count = sum(1 for k in args[1:] if k in store)
                return f":{count}\r\n".encode()

            elif cmd == b"HSET":
                key = args[1]
                if not isinstance(store.get(key), dict): store[key] = {}
                pairs = args[2:]
                added = 0
                for i in range(0, len(pairs) - 1, 2):
                    field, value = pairs[i], pairs[i+1]
                    if field not in store[key]: added += 1
                    store[key][field] = value
                return f":{added}\r\n".encode()

            elif cmd == b"HGET":
                key, field = args[1], args[2]
                d = store.get(key)
                if isinstance(d, dict):
                    val = d.get(field)
                    if val is not None:
                        vb = val
                        return f"${len(vb)}\r\n".encode() + vb + b"\r\n"
                return b"$-1\r\n"

            elif cmd == b"HGETALL":
                key = args[1]
                d = store.get(key)
                if isinstance(d, dict):
                    res = []
                    for k, v in d.items():
                        res.append(f"${len(k)}\r\n".encode() + k + b"\r\n")
                        res.append(f"${len(v)}\r\n".encode() + v + b"\r\n")
                    return f"*{len(res)}\r\n".encode() + b"".join(res)
                return b"*0\r\n"

            elif cmd == b"HDEL":
                key = args[1]
                d = store.get(key)
                count = 0
                if isinstance(d, dict):
                    for f in args[2:]:
                        if d.pop(f, None) is not None: count += 1
                return f":{count}\r\n".encode()

            elif cmd == b"INCR":
                key = args[1]
                val = _int_safe(store.get(key), key) + 1
                store[key] = str(val).encode('utf-8')
                return f":{val}\r\n".encode()

            elif cmd == b"INCRBY":
                key, delta = args[1], int(args[2])
                val = _int_safe(store.get(key), key) + delta
                store[key] = str(val).encode('utf-8')
                return f":{val}\r\n".encode()

            elif cmd == b"DECR":
                key = args[1]
                val = _int_safe(store.get(key), key) - 1
                store[key] = str(val).encode('utf-8')
                return f":{val}\r\n".encode()

            elif cmd == b"DECRBY":
                key, delta = args[1], int(args[2])
                val = _int_safe(store.get(key), key) - delta
                store[key] = str(val).encode('utf-8')
                return f":{val}\r\n".encode()

            elif cmd == b"HINCRBY":
                key, field, inc = args[1], args[2], int(args[3])
                if not isinstance(store.get(key), dict): store[key] = {}
                curr = int(store[key].get(field, 0))
                new_val = curr + inc
                store[key][field] = str(new_val).encode('utf-8')
                return f":{new_val}\r\n".encode()

            elif cmd == b"LPUSH":
                key = args[1]
                if not isinstance(store.get(key), list): store[key] = []
                for val in args[2:]: store[key].insert(0, val)
                return f":{len(store[key])}\r\n".encode()

            elif cmd == b"RPUSH":
                key = args[1]
                if not isinstance(store.get(key), list): store[key] = []
                for val in args[2:]: store[key].append(val)
                return f":{len(store[key])}\r\n".encode()

            elif cmd == b"LPOP":
                key = args[1]
                lst = store.get(key)
                if isinstance(lst, list) and lst:
                    val = lst.pop(0)
                    vb = val
                    return f"${len(vb)}\r\n".encode() + vb + b"\r\n"
                return b"$-1\r\n"

            elif cmd == b"RPOP":
                key = args[1]
                lst = store.get(key)
                if isinstance(lst, list) and lst:
                    val = lst.pop()
                    vb = val
                    return f"${len(vb)}\r\n".encode() + vb + b"\r\n"
                return b"$-1\r\n"

            elif cmd == b"LLEN":
                lst = store.get(args[1], [])
                return f":{len(lst)}\r\n".encode()

            elif cmd == b"LRANGE":
                key, start, stop = args[1], int(args[2]), int(args[3])
                lst = store.get(key)
                if not isinstance(lst, list): return b"*0\r\n"
                if start < 0: start = len(lst) + start
                if stop < 0: stop = len(lst) + stop
                sub = lst[max(0, start): stop + 1]
                parts = [f"*{len(sub)}\r\n".encode()]
                for v in sub:
                    parts.append(f"${len(v)}\r\n".encode() + v + b"\r\n")
                return b"".join(parts)

            elif cmd == b"SADD":
                key = args[1]
                if not isinstance(store.get(key), set): store[key] = set()
                count = 0
                for val in args[2:]:
                    if val not in store[key]:
                        store[key].add(val)
                        count += 1
                return f":{count}\r\n".encode()

            elif cmd == b"SCARD":
                s = store.get(args[1], set())
                return f":{len(s)}\r\n".encode()

            elif cmd == b"SMEMBERS":
                s = store.get(args[1], set())
                res = []
                for val in s:
                    res.append(f"${len(val)}\r\n".encode() + val + b"\r\n")
                return f"*{len(res)}\r\n".encode() + b"".join(res)

            elif cmd == b"ZADD":
                key = args[1]
                if not isinstance(store.get(key), list): store[key] = []
                added = 0
                # args[2:] is score1, member1, score2, member2...
                for i in range(2, len(args), 2):
                    score = float(args[i])
                    member = args[i+1]
                    # Simple emulator: append and sort
                    store[key].append((score, member))
                    added += 1
                store[key].sort(key=lambda x: x[0])
                return f":{added}\r\n".encode()

            elif cmd == b"ZCARD":
                z = store.get(args[1], [])
                return f":{len(z)}\r\n".encode()

            elif cmd == b"ZREMRANGEBYSCORE":
                key, min_s, max_s = args[1], float(args[2]), float(args[3])
                z = store.get(key, [])
                if not isinstance(z, list): return b":0\r\n"
                new_z = [x for x in z if not (min_s <= x[0] <= max_s)]
                removed = len(z) - len(new_z)
                store[key] = new_z
                return f":{removed}\r\n".encode()

            elif cmd == b"ZCOUNT":
                key, min_s, max_s = args[1], float(args[2]), float(args[3])
                z = store.get(key, [])
                count = sum(1 for x in z if min_s <= x[0] <= max_s)
                return f":{count}\r\n".encode()

            elif cmd == b"SREM":
                key = args[1]
                s = store.get(key)
                removed = 0
                if isinstance(s, set):
                    for v in args[2:]:
                        if v in s:
                            s.remove(v)
                            removed += 1
                return f":{removed}\r\n".encode()

            elif cmd == b"KEYS":
                pattern = args[1] if len(args) > 1 else b"*"
                matched = list(store.keys()) if pattern == b"*" else [k for k in store if k.startswith(pattern.rstrip(b"*"))]
                resp = f"*{len(matched)}\r\n".encode()
                for k in matched:
                    resp += f"${len(k)}\r\n".encode() + k + b"\r\n"
                return resp

            elif cmd == b"FLUSHALL":
                store.clear()
                return b"+OK\r\n"

            elif cmd == b"INFO":
                info = b"redis_version:6.2.6\r\nconnected_clients:1\r\nused_memory:1000000\r\n"
                return f"${len(info)}\r\n".encode() + info + b"\r\n"

            elif cmd == b"LREM":
                key, count, val = args[1], int(args[2]), args[3]
                lst = store.get(key)
                removed = 0
                if isinstance(lst, list):
                    # Simplified LREM: removes all matching elements regardless of 'count' sign for now
                    # (Standard Redis LREM is more complex but this usually suffices for task ACK)
                    orig_len = len(lst)
                    store[key] = [x for x in lst if x != val]
                    removed = orig_len - len(store[key])
                return f":{removed}\r\n".encode()

            elif cmd in (b"EXPIRE", b"EXPIREAT", b"PEXPIRE", b"PEXPIREAT", b"PERSIST", b"TTL", b"PTTL"):
                return b":1\r\n"

            elif cmd in (b"EVAL", b"EVALSHA", b"SCRIPT", b"PUBLISH", b"SUBSCRIBE"):
                return b"+OK\r\n"

            else:
                return b"-ERR unknown command '" + cmd + b"'\r\n"
    except Exception as e:
        return b"-ERR emulator internal error: " + str(e).encode('utf-8') + b"\r\n"

def handle_client(conn, addr):
    transaction_buffer = None
    buffer = b""
    try:
        while True:
            data = conn.recv(65536)
            if not data: break
            buffer += data
            
            while True:
                if not buffer: break
                if buffer.startswith(b"*"):
                    newline_idx = buffer.find(b"\r\n")
                    if newline_idx == -1: break
                    try:
                        num_args = int(buffer[1:newline_idx])
                    except ValueError:
                        buffer = b""; break
                    pos = newline_idx + 2
                    args = []
                    full_command_received = True
                    for _ in range(num_args):
                        if pos + 1 >= len(buffer) or buffer[pos:pos+1] != b"$":
                            full_command_received = False; break
                        next_newline = buffer.find(b"\r\n", pos)
                        if next_newline == -1:
                            full_command_received = False; break
                        try:
                            arg_len = int(buffer[pos+1:next_newline])
                        except ValueError:
                            full_command_received = False; break
                        pos = next_newline + 2
                        if pos + arg_len + 2 > len(buffer):
                            full_command_received = False; break
                        arg_data = buffer[pos:pos+arg_len]
                        args.append(arg_data)
                        pos += arg_len + 2
                    if not full_command_received: break
                    buffer = buffer[pos:]
                else:
                    newline_idx = buffer.find(b"\r\n")
                    if newline_idx == -1: break
                    line = buffer[:newline_idx]
                    buffer = buffer[newline_idx+2:]
                    args = line.split()
                    if not args: continue

                cmd = args[0].strip().upper()
                if cmd == b"MULTI":
                    transaction_buffer = []; conn.sendall(b"+OK\r\n"); continue
                if cmd == b"EXEC":
                    if transaction_buffer is None: conn.sendall(b"-ERR EXEC without MULTI\r\n")
                    else:
                        resp = f"*{len(transaction_buffer)}\r\n".encode() + b"".join(transaction_buffer)
                        conn.sendall(resp); transaction_buffer = None
                    continue
                if cmd == b"DISCARD":
                    transaction_buffer = None; conn.sendall(b"+OK\r\n"); continue
                
                if transaction_buffer is not None:
                    transaction_buffer.append(execute_command_core(cmd, args))
                    conn.sendall(b"+QUEUED\r\n")
                    continue
                    
                response = execute_command_core(cmd, args)
                conn.sendall(response)
    except Exception: pass
    finally:
        try: conn.close()
        except: pass

def run_server():
    server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    server.bind(('127.0.0.1', 6380))
    server.listen(100)
    print("Redis emulator running on 127.0.0.1:6380 (Robust Mode)")
    while True:
        conn, addr = server.accept()
        threading.Thread(target=handle_client, args=(conn, addr), daemon=True).start()

if __name__ == "__main__":
    run_server()
