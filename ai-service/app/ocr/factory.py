from typing import Optional
from .base import BaseOCRProvider
from .tesseract_provider import TesseractOCRProvider
from .pattern_provider import DocumentPatternOCRProvider

class OCRFactory:
    _instance: Optional[BaseOCRProvider] = None

    @classmethod
    def get_provider(cls, provider_type: str = "auto") -> BaseOCRProvider:
        if cls._instance is not None:
            return cls._instance

        if provider_type == "tesseract":
            cls._instance = TesseractOCRProvider()
        elif provider_type == "pattern":
            cls._instance = DocumentPatternOCRProvider()
        else:
            # Auto: Try Tesseract first, fallback to Pattern
            tess = TesseractOCRProvider()
            cls._instance = tess

        return cls._instance
