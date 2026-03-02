import re
content = open('c:/108/muthu/testing-/frontend/src/services/mappingEngine.ts', 'r', encoding='utf-8').read()
m = re.search(r'export const EXACT_TALLY_COLUMNS = \[(.*?)\];', content, re.DOTALL)
if m:
    lines = m.group(1).split(',\n')
    arr = [x.strip().strip('"').strip("'") for x in lines if x.strip()]
    print('Columns in EXACT_TALLY_COLUMNS:', len(arr))
    if 'GST Registration' in arr:
        idx = arr.index('GST Registration')
        print('Extra cols start at:', idx)
        print('Extra cols count:', len(arr) - idx)
        print('Base cols:', len(arr[:idx]))
