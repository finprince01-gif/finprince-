import os
import sys
import time
import json
import subprocess
from datetime import datetime, timezone
import psutil

def query_nvidia_smi():
    try:
        # Query basic GPU telemetry
        result = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=memory.used,memory.total,utilization.gpu,utilization.memory,temperature.gpu,power.draw",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode != 0:
            return None

        line = result.stdout.strip().splitlines()[0]
        parts = [p.strip() for p in line.split(",")]
        if len(parts) < 6:
            return None

        # Query active compute processes
        proc_result = subprocess.run(
            [
                "nvidia-smi",
                "--query-compute-apps=pid,name,used_memory",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            text=True,
            timeout=5,
        )
        processes = []
        if proc_result.returncode == 0:
            for l in proc_result.stdout.strip().splitlines():
                l = l.strip()
                if l:
                    p_parts = [p.strip() for p in l.split(",")]
                    if len(p_parts) >= 3:
                        processes.append({
                            "pid": p_parts[0],
                            "name": p_parts[1],
                            "used_memory": p_parts[2]
                        })

        return {
            "vram_used_mib": float(parts[0]) if parts[0] not in ("N/A", "") else 0.0,
            "vram_total_mib": float(parts[1]) if parts[1] not in ("N/A", "") else 0.0,
            "gpu_util_pct": float(parts[2]) if parts[2] not in ("N/A", "") else 0.0,
            "mem_util_pct": float(parts[3]) if parts[3] not in ("N/A", "") else 0.0,
            "temp_c": float(parts[4]) if parts[4] not in ("N/A", "") else 0.0,
            "power_w": float(parts[5]) if parts[5] not in ("N/A", "") else 0.0,
            "processes": processes
        }
    except Exception as e:
        return {"error": str(e)}

def collect_telemetry(output_path):
    print(f"Starting telemetry collection. Saving to {output_path}")
    data_points = []
    
    # Pre-populate empty file
    with open(output_path, "w") as f:
        json.dump([], f)
        
    try:
        while True:
            ts = datetime.now(timezone.utc).isoformat()
            cpu_pct = psutil.cpu_percent(interval=None)
            ram = psutil.virtual_memory()
            gpu_stats = query_nvidia_smi()
            
            entry = {
                "timestamp": ts,
                "cpu_util_pct": cpu_pct,
                "ram_util_pct": ram.percent,
                "gpu": gpu_stats
            }
            
            data_points.append(entry)
            
            # Atomic rewrite to ensure file is always readable json
            temp_path = output_path + ".tmp"
            with open(temp_path, "w") as f:
                json.dump(data_points, f, indent=2)
            if os.path.exists(output_path):
                os.remove(output_path)
            os.rename(temp_path, output_path)
            
            time.sleep(5)
    except KeyboardInterrupt:
        print("Telemetry collection stopped by interrupt.")
    except Exception as e:
        print(f"Error in telemetry loop: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python telemetry_collector.py <output_file_path>")
        sys.exit(1)
    collect_telemetry(sys.argv[1])
