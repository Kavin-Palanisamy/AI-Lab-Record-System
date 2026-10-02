import cv2
import numpy as np
import pytesseract
from typing import Dict, Any
from .base import BaseOCRProvider

class TesseractOCRProvider(BaseOCRProvider):
    name = "tesseract"

    def __init__(self, tesseract_cmd: str = None):
        if tesseract_cmd:
            pytesseract.pytesseract.tesseract_cmd = tesseract_cmd

    async def extract_text(self, image: np.ndarray) -> Dict[str, Any]:
        """
        Run pytesseract on preprocessed image array.
        """
        try:
            # If color, convert to RGB for PIL / Tesseract
            if len(image.shape) == 3 and image.shape[2] == 3:
                rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            else:
                rgb = image

            # Extract detailed data with confidences
            data = pytesseract.image_to_data(rgb, output_type=pytesseract.Output.DICT)
            words = []
            confidences = []

            for i in range(len(data['text'])):
                word = data['text'][i].strip()
                conf = float(data['conf'][i])
                if word and conf > 0:
                    words.append({
                        'text': word,
                        'confidence': conf / 100.0,
                        'left': data['left'][i],
                        'top': data['top'][i],
                        'width': data['width'][i],
                        'height': data['height'][i],
                    })
                    confidences.append(conf / 100.0)

            full_text = " ".join([w['text'] for w in words])
            avg_conf = sum(confidences) / len(confidences) if confidences else 0.0

            return {
                'text': full_text,
                'words': words,
                'confidence': avg_conf,
                'available': True
            }
        except pytesseract.TesseractNotFoundError:
            return {
                'text': '',
                'words': [],
                'confidence': 0.0,
                'available': False,
                'error': 'Tesseract binary not installed on host machine'
            }
        except Exception as e:
            return {
                'text': '',
                'words': [],
                'confidence': 0.0,
                'available': False,
                'error': str(e)
            }
