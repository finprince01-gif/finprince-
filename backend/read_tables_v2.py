with open("all_tables_final.txt", "r", encoding='utf-16le') as f:
    with open("filtered_tables_utf8.txt", "w", encoding='utf-8') as f2:
        for line in f:
            l = line.strip()
            if 'ent' in l.lower() or 'journal' in l.lower():
                f2.write(f"{l}\n")
