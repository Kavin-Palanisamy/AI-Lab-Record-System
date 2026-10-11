import os
import io
import json
import time
import logging
from typing import Optional, Dict, Any, Tuple, List
from PIL import Image
from dotenv import load_dotenv

from ..models.schemas import GeminiExtractionResult, ContentsData, EndBoxData

# Load environment variables
load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env"))

logger = logging.getLogger("securelab.gemini")

def resize_image_for_api(image_bytes: bytes, max_long_side: int = 1600) -> Tuple[bytes, Image.Image]:
    """
    Resizes image to max_long_side (~1600px) on the long edge while maintaining aspect ratio.
    Returns (jpeg_bytes, PIL.Image).
    """
    img = Image.open(io.BytesIO(image_bytes))
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")
    
    w, h = img.size
    long_side = max(w, h)
    if long_side > max_long_side:
        scale = max_long_side / float(long_side)
        new_w = max(1, int(w * scale))
        new_h = max(1, int(h * scale))
        img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
    
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=92)
    return buf.getvalue(), img

class GeminiExtractionProvider:
    """
    Isolated Google Gemini extraction provider for SecureLab physical record verification.
    Features:
      - Multi-model fallback list (GEMINI_MODEL + GEMINI_FALLBACK_MODELS)
      - Retries up to 2 times with exponential backoff (1s, 3s) on 503 (overload) or 429 (rate-limit)
      - 20-second timeout per attempt
      - Returns structured error on complete failure (never crashes)
      - Reports model_used in the result
    """
    def __init__(
        self,
        api_key: Optional[str] = None,
        model_name: Optional[str] = None,
        fallback_models: Optional[str] = None,
        client: Optional[Any] = None
    ):
        self.api_key = api_key or os.getenv("GEMINI_API_KEY", "").strip()
        
        # Primary model
        primary = model_name or os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip()
        self.primary_model = primary.replace("models/", "")

        # Fallback models (comma-separated)
        fb_env = fallback_models if fallback_models is not None else os.getenv(
            "GEMINI_FALLBACK_MODELS",
            "gemini-2.5-flash-lite,gemini-3.5-flash-lite,gemini-3.7-flash,gemini-flash-latest"
        )
        self.fallback_models = [
            m.strip().replace("models/", "")
            for m in fb_env.split(",")
            if m.strip()
        ]

        # Combine into ordered list of candidates without duplicates
        self.candidate_models: List[str] = [self.primary_model]
        for m in self.fallback_models:
            if m not in self.candidate_models:
                self.candidate_models.append(m)

        self._client = client

    def _get_client(self):
        if self._client is None:
            if not self.api_key:
                raise ValueError("GEMINI_API_KEY is not configured in environment")
            from google import genai
            from google.genai import types
            # Initialize client with default 20s timeout
            self._client = genai.Client(
                api_key=self.api_key,
                http_options=types.HttpOptions(timeout=20_000)
            )
        return self._client

    def _is_transient_error(self, err_msg: str) -> bool:
        """Checks if the error is 503, 429, or overload-related."""
        err_lower = err_msg.lower()
        return any(term in err_lower for term in [
            "503", "429", "unavailable", "overloaded", "resource_exhausted",
            "quota", "rate limit", "deadline exceeded", "timed out"
        ])

    def extract(
        self,
        contents_bytes: bytes,
        endbox_bytes: bytes,
        expected_exp_no: Optional[int] = None
    ) -> GeminiExtractionResult:
        """
        Extracts structured record intelligence from two images using Gemini.
        Iterates through candidate models with exponential backoff on 503/429.
        Returns a validated GeminiExtractionResult with model_used populated.
        """
        if not self.api_key:
            return GeminiExtractionResult(
                error="GEMINI_API_KEY is not configured",
                is_fallback=True,
                legibility="poor",
                model_used=None
            )

        try:
            # 1. Resize both images to ~1600px long side once
            _, pil_contents = resize_image_for_api(contents_bytes, max_long_side=1600)
            _, pil_endbox = resize_image_for_api(endbox_bytes, max_long_side=1600)
        except Exception as img_err:
            return GeminiExtractionResult(
                error=f"Image preprocessing error: {str(img_err)}",
                is_fallback=True,
                legibility="poor",
                model_used=None
            )

        # 2. Build structured extraction prompt
        exp_hint = f"Expected Experiment Number: {expected_exp_no}\n" if expected_exp_no else ""
        system_prompt = (
            "You are an expert AI laboratory record assessment auditor for an engineering college.\n"
            "You are given exactly TWO photographs from a student's physical handwritten laboratory notebook:\n"
            "IMAGE 1: The row from the CONTENTS / INDEX page corresponding to this experiment.\n"
            "IMAGE 2: The END-OF-EXPERIMENT evaluation box at the end of the experiment report.\n\n"
            f"{exp_hint}"
            "Extract the handwritten and printed text accurately into JSON matching this exact schema:\n"
            "{\n"
            '  "contents": {\n'
            '    "experiment_no": integer or null,\n'
            '    "title": string or null,\n'
            '    "date": string or null,\n'
            '    "page_no": integer or null,\n'
            '    "marks": number or null,\n'
            '    "signature_present": boolean or null\n'
            "  },\n"
            '  "endbox": {\n'
            '    "experiment_no": integer or null,\n'
            '    "page_no": integer or null,\n'
            '    "pre_lab": number or null,\n'
            '    "execution": number or null,\n'
            '    "result": number or null,\n'
            '    "post_lab": number or null,\n'
            '    "lab_record": number or null,\n'
            '    "total": number or null,\n'
            '    "signature_present": boolean or null\n'
            "  },\n"
            '  "image1_is_contents_page": boolean,\n'
            '  "image2_is_endbox_page": boolean,\n'
            '  "legibility": "good" | "fair" | "poor"\n'
            "}\n\n"
            "RULES:\n"
            "1. If a value is unreadable, cut off, or missing, output null. NEVER GUESS OR FABRICATE.\n"
            "2. Look for the faculty awarded mark in the contents row and the evaluation box total.\n"
            "3. Check if faculty signature is visible in each image.\n"
            "4. Output ONLY the raw JSON object, without markdown formatting or commentary."
        )

        client = self._get_client()
        from google.genai import types

        config = types.GenerateContentConfig(
            temperature=0.0,
            response_mime_type="application/json",
            http_options=types.HttpOptions(timeout=20_000)
        )

        last_error = ""

        # 3. Model Fallback & Retry Loop
        for model in self.candidate_models:
            max_retries = 2
            for attempt in range(max_retries + 1):
                try:
                    logger.info(f"Attempting extraction with model: {model} (attempt {attempt + 1})")
                    response = client.models.generate_content(
                        model=model,
                        contents=[system_prompt, pil_contents, pil_endbox],
                        config=config,
                    )

                    raw_text = response.text or "{}"
                    clean_text = raw_text.strip()
                    if clean_text.startswith("```json"):
                        clean_text = clean_text[7:]
                    elif clean_text.startswith("```"):
                        clean_text = clean_text[3:]
                    if clean_text.endswith("```"):
                        clean_text = clean_text[:-3]
                    clean_text = clean_text.strip()

                    parsed_data = json.loads(clean_text)
                    validated = GeminiExtractionResult.model_validate(parsed_data)
                    validated.model_used = model
                    validated.is_fallback = False
                    return validated

                except json.JSONDecodeError as jde:
                    last_error = f"Model {model} returned invalid JSON: {str(jde)}"
                    logger.warning(last_error)
                    # Invalid JSON: break out to try next model
                    break

                except Exception as e:
                    err_msg = str(e)
                    last_error = f"Model {model} failed: {err_msg}"
                    
                    if self._is_transient_error(err_msg):
                        if attempt < max_retries:
                            backoff = 1.0 if attempt == 0 else 3.0
                            logger.warning(
                                f"Model {model} hit transient error ({err_msg}). Retrying in {backoff}s..."
                            )
                            time.sleep(backoff)
                            continue
                        else:
                            logger.warning(
                                f"Model {model} exhausted all {max_retries} retries. Switching to fallback model."
                            )
                            break
                    else:
                        # Non-retryable error (e.g. 404 NOT_FOUND): move directly to next candidate model
                        logger.warning(f"Model {model} encountered non-retryable error: {err_msg}. Switching to next model.")
                        break

        # 4. If all candidate models failed
        logger.error(f"All candidate Gemini models failed. Last error: {last_error}")
        return GeminiExtractionResult(
            error=f"Gemini API failure (all models exhausted): {last_error}",
            is_fallback=True,
            legibility="poor",
            model_used=None
        )
