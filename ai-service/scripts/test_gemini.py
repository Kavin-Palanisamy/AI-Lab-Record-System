import os
import sys
import time
from pathlib import Path

# Add ai-service to Python module search path
current_dir = Path(__file__).resolve().parent
ai_service_dir = current_dir.parent
root_dir = ai_service_dir.parent
sys.path.insert(0, str(ai_service_dir))

from app.ocr.extractor import extract

def main():
    # 1. Resolve image paths
    index_path = root_dir / "dataset" / "pilot" / "processed" / "index" / "PILOT-PILOT_STUDENT_01-EXP04_index.png"
    endbox_path = root_dir / "dataset" / "pilot" / "processed" / "endbox" / "PILOT-PILOT_STUDENT_01-EXP04_endbox.png"

    print("================================================================")
    print("SecureLab AI - Phase 2 Gemini Extraction Provider Test")
    print("================================================================")
    print(f"Index Image:  {index_path}")
    print(f"EndBox Image: {endbox_path}")

    if not index_path.exists() or not endbox_path.exists():
        print(f"Error: Sample images not found at expected paths!")
        sys.exit(1)

    # 2. Read bytes
    with open(index_path, "rb") as f:
        contents_bytes = f.read()
    with open(endbox_path, "rb") as f:
        endbox_bytes = f.read()

    print(f"Contents image size: {len(contents_bytes)} bytes")
    print(f"EndBox image size:   {len(endbox_bytes)} bytes")
    
    provider = os.getenv("AI_PROVIDER", "tesseract")
    print(f"Configured AI_PROVIDER: {provider}")
    print(f"Model: {os.getenv('GEMINI_MODEL', 'gemini-2.5-flash')}")
    print("Calling extract()...")

    # 3. Call extract() and measure timing
    start_time = time.perf_counter()
    result = extract(contents_bytes, endbox_bytes, expected_exp_no=4)
    elapsed_time = time.perf_counter() - start_time

    # 4. Print raw JSON and timing
    print("\n---------------------- RAW JSON OUTPUT ----------------------")
    print(result.model_dump_json(indent=2))
    print("-------------------------------------------------------------")
    print(f"Execution Timing: {elapsed_time:.3f} seconds")
    print("================================================================")

if __name__ == "__main__":
    main()
