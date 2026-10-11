import sys
sys.path.insert(0, "ai-service")
from app.verification.contents_parser import load_paddleocr_json, _find_columns, DATE_RE

lines = load_paddleocr_json(sys.argv[1])
first = next(i for i, l in enumerate(lines) if DATE_RE.search(l.text))
cols = _find_columns(lines[:first])
print("columns (b1, b2, b3):", cols)
for i, l in enumerate(lines):
    b = l.box
    zone = cols.zone((b[0] + b[2]) / 2) if (cols and b) else "-"
    box = [round(v) for v in b] if b else None
    print(f"{i:02d} {zone:5s} {l.score:.2f} box={box} {l.text!r}")
