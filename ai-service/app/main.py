from fastapi import FastAPI, File, UploadFile, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
from .models.schemas import AnalysisResponse
from .pipeline.processor import DocumentProcessor
from .ocr.factory import OCRFactory

app = FastAPI(
    title="SecureLab AI Document Intelligence Service",
    description="Microservice for laboratory record document detection, OCR, field extraction, and confidence scoring.",
    version="2.0.0"
)

# Enable CORS for internal backend service communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

processor = DocumentProcessor()

@app.get("/health")
async def health_check():
    provider = OCRFactory.get_provider()
    return {
        "status": "healthy",
        "service": "SecureLab AI Document Intelligence Service",
        "version": "2.0.0",
        "ocr_provider": getattr(provider, "name", "unknown")
    }

@app.post("/analyze", response_model=AnalysisResponse)
async def analyze_document(
    file: UploadFile = File(...),
    ocr_engine: Optional[str] = Query(default="auto")
):
    """
    Analyze photograph or scan of a laboratory record page.
    Extracts student identity, experiment data, faculty mark, and signature presence.
    """
    # 1. Validate MIME type
    if not file.content_type.startswith("image/"):
        raise HTTPException(
            status_code=422,
            detail=f"Unsupported file type '{file.content_type}'. Expected an image file (PNG, JPEG, WEBP)."
        )

    # 2. Read image content
    try:
        contents = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read uploaded file: {str(e)}")

    if len(contents) > 15 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image size exceeds maximum limit of 15MB")

    # 3. Execute document intelligence pipeline
    try:
        result = processor.process_image(contents, filename=file.filename or "record.png")
        return result
    except ValueError as ve:
        raise HTTPException(status_code=422, detail=str(ve))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Internal document intelligence pipeline error: {str(e)}"
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
