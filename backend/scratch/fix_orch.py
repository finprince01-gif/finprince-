with open('core/redis_orchestrator.py', encoding='utf-8') as f:
    lines = f.readlines()

# Lines 509-515 (0-indexed: 508-514) are the corrupted block
# Replace them with correct Python
good_lines = [
    '            else:\n',
    '                if not barrier_complete:\n',
    '                    if all_bootstrapping:\n',
    '                        # expected=0: ingestion worker has not set page count yet. Transient state.\n',
    '                        terminal_reason = "ORCHESTRATION_BOOTSTRAPPING"\n',
    '                        logger.info(f"[ORCHESTRATION_BOOTSTRAPPING] session={session_id} stub rows exist but expected=0")\n',
    '                    else:\n',
    '                        terminal_reason = "BARRIER_INCOMPLETE"\n',
    '                        logger.info(f"[TERMINALIZATION_BLOCKED_BARRIER] session={session_id} expected={expected} completed={completed} failed={failed}")\n',
    '                elif not snapshot_complete:\n',
    '                    terminal_reason = "SNAPSHOT_PENDING"\n',
    '                    logger.info(f"[TERMINALIZATION_BLOCKED_SNAPSHOT_PENDING] session={session_id}")\n',
    '                elif not materialization_complete:\n',
    '                    terminal_reason = "MATERIALIZATION_PENDING"\n',
    '                    logger.info(f"[TERMINALIZATION_BLOCKED_MATERIALIZATION] session={session_id}")\n',
]

# Remove lines 508..514 (inclusive, 0-indexed) and insert good_lines
new_lines = lines[:508] + good_lines + lines[515:]

with open('core/redis_orchestrator.py', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print(f"Done. Total lines: {len(new_lines)}")

# Verify syntax
import ast
with open('core/redis_orchestrator.py', encoding='utf-8') as f:
    src = f.read()
ast.parse(src)
print("SYNTAX OK")
