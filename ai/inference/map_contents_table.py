import json
from pathlib import Path


JSON_PATH = Path(
    "ai/inference/ppstructure_output/contents_res.json"
)

OUTPUT_PATH = Path(
    "ai/inference/contents_table_mapping.json"
)


def center(box):
    x1, y1, x2, y2 = box
    return (
        (x1 + x2) / 2,
        (y1 + y2) / 2,
    )


def intersection_area(a, b):
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b

    x1 = max(ax1, bx1)
    y1 = max(ay1, by1)
    x2 = min(ax2, bx2)
    y2 = min(ay2, by2)

    if x2 <= x1 or y2 <= y1:
        return 0.0

    return (x2 - x1) * (y2 - y1)


def area(box):
    x1, y1, x2, y2 = box
    return max(0, x2 - x1) * max(0, y2 - y1)


def iou(a, b):
    inter = intersection_area(a, b)
    union = area(a) + area(b) - inter

    if union <= 0:
        return 0.0

    return inter / union


with JSON_PATH.open("r", encoding="utf-8") as f:
    data = json.load(f)

table = data["table_res_list"][0]

cell_boxes = table["cell_box_list"]

ocr = table["table_ocr_pred"]

ocr_boxes = ocr["rec_boxes"]
ocr_texts = ocr["rec_texts"]
ocr_scores = ocr["rec_scores"]


# ---------------------------------------------------------
# 1. Build cell objects
# ---------------------------------------------------------

cells = []

for index, box in enumerate(cell_boxes):
    cx, cy = center(box)

    cells.append({
        "cell_id": index,
        "box": box,
        "center_x": cx,
        "center_y": cy,
        "texts": []
    })


# ---------------------------------------------------------
# 2. Assign each OCR region to the best table cell
# ---------------------------------------------------------

for text, score, box in zip(
    ocr_texts,
    ocr_scores,
    ocr_boxes
):

    if not str(text).strip():
        continue

    best_cell = None
    best_score = 0.0

    text_center_x, text_center_y = center(box)

    for cell in cells:

        cell_box = cell["box"]

        overlap = iou(box, cell_box)

        cell_x1, cell_y1, cell_x2, cell_y2 = cell_box

        inside = (
            cell_x1 <= text_center_x <= cell_x2
            and
            cell_y1 <= text_center_y <= cell_y2
        )

        candidate_score = overlap

        if inside:
            candidate_score += 1.0

        if candidate_score > best_score:
            best_score = candidate_score
            best_cell = cell

    if best_cell is not None:
        best_cell["texts"].append({
            "text": text,
            "score": float(score),
            "ocr_box": box
        })


# ---------------------------------------------------------
# 3. Group cells into rows using Y coordinate
# ---------------------------------------------------------

cells_sorted = sorted(
    cells,
    key=lambda c: (
        c["center_y"],
        c["center_x"]
    )
)

rows = []

ROW_TOLERANCE = 25

for cell in cells_sorted:

    placed = False

    for row in rows:

        row_center_y = sum(
            c["center_y"] for c in row
        ) / len(row)

        if abs(cell["center_y"] - row_center_y) <= ROW_TOLERANCE:
            row.append(cell)
            placed = True
            break

    if not placed:
        rows.append([cell])


# Sort cells left-to-right inside each row

for row in rows:
    row.sort(key=lambda c: c["center_x"])


# ---------------------------------------------------------
# 4. Build readable output
# ---------------------------------------------------------

output_rows = []

for row_index, row in enumerate(rows):

    row_data = {
        "row_index": row_index,
        "cells": []
    }

    for col_index, cell in enumerate(row):

        cell_text = " ".join(
            item["text"]
            for item in cell["texts"]
        ).strip()

        confidence = None

        if cell["texts"]:
            confidence = max(
                item["score"]
                for item in cell["texts"]
            )

        row_data["cells"].append({
            "column_index": col_index,
            "cell_id": cell["cell_id"],
            "text": cell_text,
            "confidence": confidence,
            "box": cell["box"]
        })

    output_rows.append(row_data)


result = {
    "source": str(JSON_PATH),
    "total_cells": len(cell_boxes),
    "total_ocr_regions": len(ocr_boxes),
    "rows": output_rows
}


with OUTPUT_PATH.open("w", encoding="utf-8") as f:
    json.dump(
        result,
        f,
        indent=2,
        ensure_ascii=False
    )


# ---------------------------------------------------------
# 5. Print readable table
# ---------------------------------------------------------

print()
print("=" * 100)
print("SECURELAB CONTENTS TABLE MAPPING")
print("=" * 100)

print(f"Cells       : {len(cell_boxes)}")
print(f"OCR regions : {len(ocr_boxes)}")
print(f"Rows        : {len(output_rows)}")
print()

for row in output_rows:

    values = []

    for cell in row["cells"]:

        text = cell["text"]

        if not text:
            text = "<EMPTY>"

        values.append(text)

    print(
        f"ROW {row['row_index']:02d}: "
        + " | ".join(values)
    )

print()
print("=" * 100)
print(f"Saved: {OUTPUT_PATH}")
