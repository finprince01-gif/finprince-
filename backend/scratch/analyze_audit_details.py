import json

with open("scratch/audit_results.json", "r") as f:
    data = json.load(f)

print("### 1. Invoice Number Stability (Pages 7 & 8)")
print("| Run | Page 7 Raw | Page 7 Normalized/Canonical | Page 8 Raw | Page 8 Normalized/Canonical | Status |")
print("| :--- | :--- | :--- | :--- | :--- | :--- |")

for r in data:
    run_no = r["run_number"]
    session_id = r["session_id"]
    if len(r["pages"]) < 8:
        print("| Run {} | N/A (Failed Run) | N/A | N/A | N/A | FAILED |".format(run_no))
        continue
    
    p7 = r["pages"][6]
    p8 = r["pages"][7]
    
    p7_raw_inv = p7["raw"]["invoice_no"]
    p8_raw_inv = p8["raw"]["invoice_no"]
    
    p7_canonical = "unknown"
    p8_canonical = "unknown"
    
    grouped_list = r.get("grouped_records", [])
    p7_match = [gr for gr in grouped_list if "4216" in str(gr["invoice_no"])]
    if p7_match:
        p7_canonical = ", ".join([str(gr["invoice_no"]) for gr in p7_match])
        
    status = "MERGED" if len(grouped_list) == 8 else "SPLIT"
    if r["barrier_status"] == "FAILED":
        status = "FAILED"
        
    print("| Run {} | `{}` | `{}` | `{}` | `{}` | {} |".format(
        run_no, p7_raw_inv, p7_canonical, p8_raw_inv, p7_canonical, status
    ))

print("\n### 2. GSTIN Stability (Run-by-Run)")
print("| Run | Raw GSTIN (Page 7) | Raw GSTIN (Page 8) | Grouped GSTINs |")
print("| :--- | :--- | :--- | :--- |")
for r in data:
    run_no = r["run_number"]
    if len(r["pages"]) < 8:
        print("| Run {} | N/A | N/A | N/A |".format(run_no))
        continue
    p7_gst = r["pages"][6]["raw"]["gstin"]
    p8_gst = r["pages"][7]["raw"]["gstin"]
    grouped_gsts = sorted(list(set([str(gr["gstin"]) for gr in r.get("grouped_records", [])])))
    print("| Run {} | `{}` | `{}` | `{}` |".format(run_no, p7_gst, p8_gst, ", ".join(grouped_gsts)))

print("\n### 3. Snapshot Consistency")
print("| Run | Snapshot Invoice Count | Invoice Numbers in Snapshot |")
print("| :--- | :--- | :--- |")
for r in data:
    run_no = r["run_number"]
    snap = r.get("snapshot", {})
    if not snap or not snap.get("id"):
        print("| Run {} | 0 (No Snapshot) | N/A |".format(run_no))
        continue
    inv_list = [str(inv["invoice_no"]) for inv in snap.get("invoices", [])]
    print("| Run {} | {} | {} |".format(run_no, snap["invoice_count"], ", ".join(inv_list)))
