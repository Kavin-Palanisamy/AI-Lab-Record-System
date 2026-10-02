import cv2
import numpy as np
import os

def generate_fixtures():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    demo_docs_dir = os.path.join(base_dir, "..", "docs", "demo-docs")
    os.makedirs(demo_docs_dir, exist_ok=True)

    kavin_path = os.path.join(demo_docs_dir, "kavin_exp3_document.png")
    if not os.path.exists(kavin_path):
        print(f"Error: Base file {kavin_path} not found")
        return

    base_img = cv2.imread(kavin_path)
    h, w = base_img.shape[:2]

    # 1. Blurry Document Fixture
    print("Generating blurry_document.png...")
    blurry = cv2.GaussianBlur(base_img, (35, 35), 15.0)
    cv2.imwrite(os.path.join(demo_docs_dir, "blurry_document.png"), blurry)

    # 2. Cropped Document Fixture (Missing Student Info & Header)
    print("Generating cropped_document.png...")
    # Keep only bottom 40% of page (y=600 to 1000)
    cropped = base_img[int(h * 0.60):h, 0:w]
    cv2.imwrite(os.path.join(demo_docs_dir, "cropped_document.png"), cropped)

    # 3. Missing QR Document Fixture
    print("Generating missing_qr_document.png...")
    missing_qr = base_img.copy()
    # Blank QR code located at x=480..740, y=250..510
    missing_qr[245:515, 480:745] = 255
    cv2.imwrite(os.path.join(demo_docs_dir, "missing_qr_document.png"), missing_qr)

    # 4. Tampered Mark Document Fixture (Overwritten / Digital Alteration)
    print("Generating tampered_mark_document.png...")
    tampered = base_img.copy()
    # Paste perfectly uniform white rectangle patch on mark box (std dev = 0)
    tampered[530:572, 480:685] = [255, 255, 255]
    # Draw digital text and jagged double strokes over it
    cv2.putText(tampered, "10.0 / 10", (495, 562), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0, 0, 0), 3)
    cv2.putText(tampered, "10.0 / 10", (498, 563), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (40, 40, 40), 2)
    # Add dark rectangular cut line
    cv2.rectangle(tampered, (480, 530), (685, 572), (20, 20, 20), 2)
    cv2.imwrite(os.path.join(demo_docs_dir, "tampered_mark_document.png"), tampered)

    # 5. Wrong Experiment Document Fixture (Exp 1 instead of Exp 3)
    print("Generating wrong_exp_document.png...")
    wrong_exp = base_img.copy()
    # Blank experiment details row
    wrong_exp[180:240, 40:700] = 255
    cv2.putText(wrong_exp, "Experiment Number: 1", (50, 205), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 2)
    cv2.putText(wrong_exp, "Experiment Title: Basic Electrical Measurements", (50, 230), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 2)
    cv2.imwrite(os.path.join(demo_docs_dir, "wrong_exp_document.png"), wrong_exp)

    print("All Phase 3 test fixtures successfully generated in docs/demo-docs/!")

if __name__ == "__main__":
    generate_fixtures()
