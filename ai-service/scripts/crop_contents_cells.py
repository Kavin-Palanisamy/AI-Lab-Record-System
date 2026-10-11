"""
Cut the Page / Marks / Sign cell of every contents row out of the page image and
save them (enlarged) so you can SEE what the OCR is being asked to read.

Takes the JSON written by ai/inference/ocr_page.py (it records which image the
coordinates belong to and refuses to run if that image does not match).
"""
import json
import os
import statistics
import sys

import cv2
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from app.verification.contents_parser import DATE_RE, _find_columns, load_paddleocr_json  # noqa: E402

PAD_FRAC = 0.09   # row padding as a fraction of the row pitch
OUT_DIR = os.path.join("ai", "inference", "crops")


def main(json_path: str) -> None:
    meta = json.load(open(json_path, encoding="utf-8"))
    if "image_size" not in meta or "image_path" not in meta:
        sys.exit("This JSON has no image_path/image_size (old format). Re-run ai\\inference\\ocr_page.py first.")
    img = cv2.imread(meta["image_path"])
    if img is None:
        sys.exit(f"Cannot read image: {meta['image_path']}")
    h, w = img.shape[:2]
    if [w, h] != list(meta["image_size"]):
        sys.exit(f"Image is {w}x{h} but the OCR json was made on {meta['image_size']}. Re-run ocr_page.py.")

    lines = load_paddleocr_json(json_path)
    anchors = [i for i, ln in enumerate(lines) if DATE_RE.search(ln.text)]
    if not anchors:
        sys.exit("No dated rows found in the OCR json.")
    cols = _find_columns(lines[: anchors[0]])
    if cols is None:
        sys.exit("Could not find the Page/Marks header positions.")

    tops = [lines[i].box[1] for i in anchors]
    pitch = statistics.median(b - a for a, b in zip(tops, tops[1:])) if len(tops) > 1 else h * 0.07
    pad = PAD_FRAC * pitch
    scale = max(1, round(160 / max(1.0, pitch)))  # enlarge so each row is about 160 px tall
    os.makedirs(OUT_DIR, exist_ok=True)

    sign_right = min(w, cols.b3 + 1.6 * (cols.b3 - cols.b2))
    zones = {
        "page": (int(cols.b1), int(cols.b2)),
        "marks": (int(cols.b2), int(cols.b3)),
        "sign": (int(cols.b3), int(sign_right)),
    }
    print(f"image: {w}x{h}   rows: {len(tops)}   row pitch: {pitch:.0f}px   zoom: x{scale}")
    print("column x-ranges:", zones)

    sheet_rows = []
    for k, top in enumerate(tops):
        y1 = max(0, int(top - pad))
        y2 = int(tops[k + 1] - pad) if k + 1 < len(tops) else int(top + pitch - pad)
        y2 = min(h, y2)
        strip = []
        for name, (x1, x2) in zones.items():
            crop = img[y1:y2, max(0, x1):min(w, x2)]
            big = cv2.resize(crop, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
            cv2.imwrite(os.path.join(OUT_DIR, f"row{k + 1}_{name}.png"), big)
            strip.append(big)
        sheet_rows.append((k + 1, strip))

    row_h = max(s.shape[0] for _, strip in sheet_rows for s in strip)
    col_w = [max(strip[j].shape[1] for _, strip in sheet_rows) for j in range(3)]
    rows_img = []
    for k, strip in sheet_rows:
        parts = [np.full((row_h, 120, 3), 255, np.uint8)]
        cv2.putText(parts[0], f"row {k}", (8, row_h // 2), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (0, 0, 0), 2)
        for j, s in enumerate(strip):
            cell = np.full((row_h, col_w[j], 3), 255, np.uint8)
            cell[: s.shape[0], : s.shape[1]] = s
            cv2.rectangle(cell, (0, 0), (col_w[j] - 1, row_h - 1), (0, 0, 255), 1)
            parts.append(cell)
        rows_img.append(np.hstack(parts))
    header = np.full((40, rows_img[0].shape[1], 3), 255, np.uint8)
    x = 120
    for name, wj in zip(("PAGE", "MARKS", "SIGN"), col_w):
        cv2.putText(header, name, (x + 10, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 0), 2)
        x += wj
    sheet_path = os.path.join(OUT_DIR, "contact_sheet.png")
    cv2.imwrite(sheet_path, np.vstack([header] + rows_img))
    print(f"saved {len(sheet_rows) * 3} crops + {sheet_path}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: crop_contents_cells.py <ocr_lines.json from ocr_page.py>")
    main(sys.argv[1])
