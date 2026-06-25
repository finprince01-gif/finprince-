import os
import sys
import django
import json

# Set up Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
django.setup()

from ocr_pipeline.models import AICache
# Let's import the cache models or tables
from django.db import connection

print("=== AICache count ===")
print(f"Total AICache records: {AICache.objects.count()}")

# Read REAL_BATCH_MANIFEST
manifest_path = "sprint3_validation/reports/REAL_BATCH_MANIFEST.json"
if os.path.exists(manifest_path):
    with open(manifest_path, "r") as f:
        manifest = json.load(f)
    
    file_hashes = [f["file_hash_sha256"] for f in manifest["files"]]
    print(f"Total files in manifest: {len(file_hashes)}")
    
    # Check if they exist in some cache.
    # Where does OCRResponseCache store? Let's look at ocr_pipeline/ocr_cache.py
    # We can inspect the table ocr_response_cache or similar if it exists.
    with connection.cursor() as cursor:
        cursor.execute("SHOW TABLES")
        tables = [row[0] for row in cursor.fetchall()]
        print("Tables in DB:", [t for t in tables if 'cache' in t or 'response' in t or 'lock' in t])
        
        # If ocr_response_cache exists, count hits
        if 'ocr_response_cache' in tables:
            cursor.execute("SELECT COUNT(*) FROM ocr_response_cache")
            print("Total records in ocr_response_cache:", cursor.fetchone()[0])
            
            # Check how many of our file hashes are in ocr_response_cache
            placeholders = ','.join(['%s'] * len(file_hashes))
            cursor.execute(f"SELECT COUNT(DISTINCT file_hash) FROM ocr_response_cache WHERE file_hash IN ({placeholders})", file_hashes)
            print("Matching file hashes in ocr_response_cache:", cursor.fetchone()[0])
            
            cursor.execute(f"SELECT file_hash, COUNT(*) FROM ocr_response_cache WHERE file_hash IN ({placeholders}) GROUP BY file_hash", file_hashes)
            print("Details of cache per hash:")
            for row in cursor.fetchall():
                print(f"  Hash {row[0][:10]}... -> {row[1]} pages cached")
else:
    print("Manifest not found.")
