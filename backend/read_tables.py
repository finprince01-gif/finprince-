with open("all_tables_final.txt", "r", encoding='utf-16le') as f:
    for line in f:
        l = line.strip()
        if 'ent' in l.lower() or 'journal' in l.lower():
            print(l)
