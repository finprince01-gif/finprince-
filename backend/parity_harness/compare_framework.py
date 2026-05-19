import json
from pathlib import Path
from typing import Dict, Any, List
import logging

logger = logging.getLogger("CompareFramework")

def compare_snapshots(golden: Dict[str, Any], new: Dict[str, Any]) -> Dict[str, Any]:
    report = {
        "parity": True,
        "mismatches": [],
        "metrics": {
            "total_score": 0.0,
            "fields_matched": 0,
            "fields_total": 0
        }
    }
    
    # Extract invoices list (FinalizedSnapshot structure)
    g_invoices = golden.get("invoices", [])
    n_invoices = new.get("invoices", [])
    
    if len(g_invoices) != len(n_invoices):
        report["parity"] = False
        report["mismatches"].append({
            "field": "invoice_count",
            "golden": len(g_invoices),
            "new": len(n_invoices),
            "severity": "CRITICAL"
        })
    
    # Compare each invoice
    for i in range(min(len(g_invoices), len(n_invoices))):
        g_inv = g_invoices[i]
        n_inv = n_invoices[i]
        
        # Key fields to check
        critical_fields = [
            "invoice_no", "vendor_name", "gstin", "total_amount", 
            "taxable_value", "cgst", "sgst", "igst", "invoice_date"
        ]
        
        for field in critical_fields:
            report["fields_total"] += 1
            g_val = str(g_inv.get(field, "")).strip().upper()
            n_val = str(n_inv.get(field, "")).strip().upper()
            
            if g_val != n_val:
                report["parity"] = False
                report["mismatches"].append({
                    "invoice_idx": i,
                    "field": field,
                    "golden": g_val,
                    "new": n_val,
                    "severity": "HIGH"
                })
            else:
                report["fields_matched"] += 1
                
        # Compare items
        g_items = g_inv.get("items", [])
        n_items = n_inv.get("items", [])
        
        if len(g_items) != len(n_items):
            report["parity"] = False
            report["mismatches"].append({
                "invoice_idx": i,
                "field": "items_count",
                "golden": len(g_items),
                "new": len(n_items),
                "severity": "MEDIUM"
            })
            
    if report["fields_total"] > 0:
        report["metrics"]["total_score"] = (report["fields_matched"] / report["fields_total"]) * 100
        
    return report

def main():
    # Example usage (can be called by a runner script)
    pass

if __name__ == "__main__":
    main()
