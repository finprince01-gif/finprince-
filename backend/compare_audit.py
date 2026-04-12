import json

def compare_audit():
    with open("model_audit.json", "r") as f:
        model_schema = json.load(f)
    with open("db_audit.json", "r") as f:
        db_schema = json.load(f)
    
    mismatches = []
    
    # Track which DB tables are used by models
    used_tables = set()
    
    for app, models in model_schema.items():
        for model_name, model_info in models.items():
            table_name = model_info["db_table"]
            used_tables.add(table_name)
            
            if table_name not in db_schema:
                mismatches.append({
                    "type": "MISSING TABLE",
                    "app": app,
                    "model": model_name,
                    "table": table_name
                })
                continue
                
            db_cols = {col["Field"]: col for col in db_schema[table_name]}
            model_cols = {field["column"] for field in model_info["fields"] if field["column"]}
            
            for field in model_info["fields"]:
                col_name = field["column"]
                if not col_name: continue
                
                if col_name not in db_cols:
                    mismatches.append({
                        "type": "MISSING COLUMN",
                        "app": app,
                        "model": model_name,
                        "table": table_name,
                        "column": col_name,
                        "field_type": field["type"]
                    })
                else:
                    # Optional: Type check (can be loose because Django mapping vs DB type)
                    pass
            
            # Check for extra columns in DB that are not in model
            for col_name in db_cols:
                if col_name not in model_cols and col_name != 'id': # common to have id
                     mismatches.append({
                        "type": "UNUSED COLUMN",
                        "app": app,
                        "model": model_name,
                        "table": table_name,
                        "column": col_name
                    })

    # Extra tables in DB not linked to models
    for table_name in db_schema:
        if table_name not in used_tables and not table_name.startswith(('django_', 'auth_', 'sessions', 'admin_')):
            mismatches.append({
                "type": "UNUSED TABLE",
                "table": table_name
            })
            
    return mismatches

if __name__ == "__main__":
    mismatches = compare_audit()
    with open("mismatches.json", "w") as f:
        json.dump(mismatches, f, indent=4)
    print(f"Found {len(mismatches)} mismatches. Saved to mismatches.json")
