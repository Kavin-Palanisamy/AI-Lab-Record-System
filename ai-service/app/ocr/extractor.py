import os
import logging
from typing import Optional
from dotenv import load_dotenv

from .gemini_provider import GeminiExtractionProvider
from ..models.schemas import GeminiExtractionResult, ContentsData, EndBoxData

load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env"))

logger = logging.getLogger("securelab.extractor")

def _extract_with_tesseract(
    contents_bytes: bytes,
    endbox_bytes: bytes,
    expected_exp_no: Optional[int] = None
) -> GeminiExtractionResult:
    """
    Fallback extraction using the existing Tesseract / pattern-matching pipeline.
    Preserves full backward compatibility without breaking existing tests.
    """
    try:
        from ..pipeline.processor import DocumentProcessor
        processor = DocumentProcessor()
        
        # Process contents image
        res1 = processor.process_image(contents_bytes, filename="index.png")
        # Process endbox image
        res2 = processor.process_image(endbox_bytes, filename="endbox.png")

        exp_num = expected_exp_no
        if exp_num is None and res1.document.experimentNumber:
            try:
                exp_num = int(res1.document.experimentNumber)
            except ValueError:
                pass

        contents_data = ContentsData(
            experiment_no=exp_num,
            title=res1.document.experimentTitle,
            date=res1.document.date,
            page_no=None,
            marks=res1.document.mark,
            signature_present=res1.document.facultySignaturePresent,
        )

        endbox_data = EndBoxData(
            experiment_no=exp_num,
            page_no=None,
            total=res2.document.mark,
            signature_present=res2.document.facultySignaturePresent,
        )

        return GeminiExtractionResult(
            contents=contents_data,
            endbox=endbox_data,
            image1_is_contents_page=True,
            image2_is_endbox_page=True,
            legibility="good" if res1.quality.decision == "GOOD" else "fair",
            is_fallback=True
        )
    except Exception as e:
        logger.error(f"Tesseract fallback extraction error: {e}")
        return GeminiExtractionResult(
            error=f"Tesseract extraction error: {str(e)}",
            is_fallback=True,
            legibility="poor"
        )

def extract(
    contents_bytes: bytes,
    endbox_bytes: bytes,
    expected_exp_no: Optional[int] = None
) -> GeminiExtractionResult:
    """
    Unified extraction entry point.
    Selects extraction provider via AI_PROVIDER environment variable:
      - 'gemini': Calls Google Gemini Vision model via google-genai SDK
      - 'tesseract': Uses existing Tesseract / pattern provider (default fallback)
    Never crashes on API or parse failures; always returns a structured result.
    """
    provider_name = os.getenv("AI_PROVIDER", "tesseract").strip().lower()

    if provider_name == "gemini":
        gemini = GeminiExtractionProvider()
        result = gemini.extract(contents_bytes, endbox_bytes, expected_exp_no)
        # If Gemini experienced a fatal error or missing key, we return the structured result with error
        return result
    else:
        # Default fallback to existing Tesseract pipeline
        return _extract_with_tesseract(contents_bytes, endbox_bytes, expected_exp_no)
