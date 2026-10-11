import io
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch
from PIL import Image

# Ensure ai-service is on path
current_dir = Path(__file__).resolve().parent
ai_service_dir = current_dir.parent
sys.path.insert(0, str(ai_service_dir))

from app.ocr.gemini_provider import GeminiExtractionProvider
from app.models.schemas import GeminiExtractionResult

def create_dummy_png_bytes(width: int = 200, height: int = 200) -> bytes:
    img = Image.new("RGB", (width, height), color=(240, 240, 240))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()

class TestGeminiModelFallback(unittest.TestCase):
    def setUp(self):
        self.dummy_bytes = create_dummy_png_bytes()

    @patch("time.sleep", return_value=None)  # Fast test execution: skip actual sleeping
    def test_fallback_on_503_to_second_model(self, mock_sleep):
        """
        Verify that if the primary model returns 503 UNAVAILABLE,
        the provider retries and seamlessly falls back to the next model,
        returning a successful result that specifies which model answered.
        """
        mock_client = MagicMock()
        models_called = []

        def mock_generate_content(model, contents, config):
            models_called.append(model)
            if model == "gemini-3.5-flash":
                raise Exception(
                    "503 UNAVAILABLE. {'error': {'code': 503, 'message': 'This model is currently overloaded. Please try again later.'}}"
                )
            elif model == "gemini-2.5-flash-lite":
                mock_resp = MagicMock()
                mock_resp.text = """
                {
                  "contents": {
                    "experiment_no": 4,
                    "title": "Superposition Theorem",
                    "date": "28-09-2026",
                    "page_no": 32,
                    "marks": 9.5,
                    "signature_present": true
                  },
                  "endbox": {
                    "experiment_no": 4,
                    "page_no": 32,
                    "pre_lab": 2.0,
                    "execution": 3.0,
                    "result": 1.5,
                    "post_lab": 1.0,
                    "lab_record": 2.0,
                    "total": 9.5,
                    "signature_present": true
                  },
                  "image1_is_contents_page": true,
                  "image2_is_endbox_page": true,
                  "legibility": "good"
                }
                """
                return mock_resp
            else:
                raise Exception(f"Unexpected model: {model}")

        mock_client.models.generate_content.side_effect = mock_generate_content

        provider = GeminiExtractionProvider(
            api_key="mock-test-key",
            model_name="gemini-3.5-flash",
            fallback_models="gemini-2.5-flash-lite,gemini-3.7-flash",
            client=mock_client
        )

        result: GeminiExtractionResult = provider.extract(
            contents_bytes=self.dummy_bytes,
            endbox_bytes=self.dummy_bytes,
            expected_exp_no=4
        )

        # 1. Assertions on the result
        self.assertIsNone(result.error)
        self.assertFalse(result.is_fallback)
        self.assertEqual(result.model_used, "gemini-2.5-flash-lite")
        self.assertEqual(result.contents.experiment_no, 4)
        self.assertEqual(result.contents.title, "Superposition Theorem")
        self.assertEqual(result.contents.marks, 9.5)
        self.assertEqual(result.endbox.total, 9.5)
        self.assertTrue(result.image1_is_contents_page)
        self.assertTrue(result.image2_is_endbox_page)
        self.assertEqual(result.legibility, "good")

        # 2. Assertions on retry & fallback sequence
        # Primary model (gemini-3.5-flash) was attempted 3 times (initial + 2 retries)
        self.assertEqual(models_called.count("gemini-3.5-flash"), 3)
        # Fallback model (gemini-2.5-flash-lite) was called once and succeeded
        self.assertEqual(models_called.count("gemini-2.5-flash-lite"), 1)
        # sleep was called twice during exponential backoff
        self.assertEqual(mock_sleep.call_count, 2)

    @patch("time.sleep", return_value=None)
    def test_all_models_fail_returns_structured_error(self, mock_sleep):
        """
        Verify that if all candidate models fail, the provider never crashes,
        but returns a structured error object with is_fallback=True.
        """
        mock_client = MagicMock()
        mock_client.models.generate_content.side_effect = Exception("503 UNAVAILABLE overload")

        provider = GeminiExtractionProvider(
            api_key="mock-test-key",
            model_name="gemini-3.5-flash",
            fallback_models="gemini-2.5-flash-lite",
            client=mock_client
        )

        result = provider.extract(
            contents_bytes=self.dummy_bytes,
            endbox_bytes=self.dummy_bytes,
            expected_exp_no=4
        )

        self.assertIsNotNone(result.error)
        self.assertTrue(result.is_fallback)
        self.assertIsNone(result.model_used)
        self.assertEqual(result.legibility, "poor")

if __name__ == "__main__":
    unittest.main()
