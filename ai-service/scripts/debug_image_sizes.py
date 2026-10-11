import json, os
import cv2

j = json.load(open(r"ai\inference\paddleocr_output\contents_res.json", encoding="utf-8"))
print("input_path:", j.get("input_path"))
dp = j.get("doc_preprocessor_res", {})
print("doc_preprocessor_res:", {k: (v if not isinstance(v, (list, dict)) else "...") for k, v in dp.items()})
print("model_settings:", j.get("model_settings"))
polys = j.get("dt_polys") or []
if polys:
    xs = [p[0] for poly in polys for p in poly]
    ys = [p[1] for poly in polys for p in poly]
    print("dt_polys extent  x:", min(xs), "-", max(xs), "  y:", min(ys), "-", max(ys))
for p in [j.get("input_path"),
          r"ai\inference\paddleocr_output\contents_preprocessed_img.jpg",
          r"ai\inference\paddleocr_output\contents_ocr_res_img.jpg"]:
    if p and os.path.exists(p):
        im = cv2.imread(p)
        print(p, "->", im.shape[1], "x", im.shape[0])
    else:
        print(p, "-> not found")
