"""
Run PaddleOCR on ONE page image and save the text lines TOGETHER WITH the exact
image size the coordinates belong to, so boxes and image can never disagree.

Doc-unwarping / orientation models are switched OFF on purpose: every box is then
in the pixel coordinates of the original photo (what you see when you open it).

Usage (from project root, with the Paddle environment):
  .\\ai\\.venv\\Scripts\\python.exe ai\\inference\\ocr_page.py <image> [out_json]
"""
import json
import os
import sys

import cv2


def run_ocr(image_path: str) -> dict:
    img = cv2.imread(image_path)
    if img is None:
        raise FileNotFoundError(f"Cannot read image: {image_path}")
    h, w = img.shape[:2]

    from paddleocr import PaddleOCR  # imported late: slow, and only needed here

    ocr = PaddleOCR(
        use_doc_orientation_classify=False,
        use_doc_unwarping=False,
        use_textline_orientation=True,
    )
    results = list(ocr.predict(img))  # we pass the pixels we read, not a path
    if not results:
        raise RuntimeError("PaddleOCR returned no result")

    data = results[0].json
    data = data.get("res", data)  # some versions wrap everything in {"res": ...}
    texts = [str(t) for t in data["rec_texts"]]
    scores = [float(s) for s in data["rec_scores"]]
    boxes = [[float(v) for v in b] for b in data["rec_boxes"]]

    return {
        "image_path": image_path,
        "image_size": [w, h],
        "rec_texts": texts,
        "rec_scores": scores,
        "rec_boxes": boxes,
    }


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    image_path = sys.argv[1]
    stem = os.path.splitext(os.path.basename(image_path))[0]
    out_path = sys.argv[2] if len(sys.argv) > 2 else os.path.join("ai", "inference", "ocr_out", f"{stem}_lines.json")
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)

    out = run_ocr(image_path)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)

    w, h = out["image_size"]
    xs = [b[2] for b in out["rec_boxes"]]
    ys = [b[3] for b in out["rec_boxes"]]
    print(f"image size: {w}x{h}")
    print(f"lines found: {len(out['rec_texts'])}")
    if xs:
        print(f"text reaches: x={max(xs):.0f} y={max(ys):.0f}")
        if max(xs) > w * 1.02 or max(ys) > h * 1.02:
            print("WARNING: boxes extend beyond the image - coordinates do not match this image.")
    print(f"saved: {out_path}")


if __name__ == "__main__":
    main()
