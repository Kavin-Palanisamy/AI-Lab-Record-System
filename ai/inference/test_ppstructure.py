from pathlib import Path
from paddleocr import PPStructureV3

IMAGE_PATH = Path(
    "ai/datasets/raw/student_001/exp_001/contents.jpg"
)

OUTPUT_DIR = Path(
    "ai/inference/ppstructure_output"
)

if not IMAGE_PATH.exists():
    raise FileNotFoundError(f"Image not found: {IMAGE_PATH}")

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

pipeline = PPStructureV3(
    lang="en",
    use_doc_orientation_classify=True,
    use_doc_unwarping=True,
    use_textline_orientation=True,
)

print("Running PP-StructureV3...")

results = pipeline.predict(input=str(IMAGE_PATH))

for res in results:
    res.print()
    res.save_to_json(save_path=str(OUTPUT_DIR))
    res.save_to_markdown(save_path=str(OUTPUT_DIR))

print("\nPP-StructureV3 complete.")
print(f"Output saved to: {OUTPUT_DIR}")
