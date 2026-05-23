with open('c:/108/AI-accounting-0.03/backend/ocr_pipeline/pipeline.py', 'r') as f:
    lines = f.read().splitlines()

for i in range(1040, 1212):
    if lines[i].strip():
        lines[i] = "    " + lines[i]

with open('c:/108/AI-accounting-0.03/backend/ocr_pipeline/pipeline.py', 'w') as f:
    f.write("\n".join(lines) + "\n")
