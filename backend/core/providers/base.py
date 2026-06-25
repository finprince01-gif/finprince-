"""
BaseAIProvider — Abstract Interface for AI Extraction Providers
===============================================================
All AI providers must implement this interface to be compatible
with the OCR pipeline's extraction and retry machinery.

Contract:
---------
- Input:  prompt_text (str), image data (b64), batch support
- Output: raw response text (str) — the pipeline handles JSON parsing downstream
- Errors: raise TerminalTaskError for non-retryable, Exception for retryable
"""
import os
import logging
from typing import Optional, List

logger = logging.getLogger(__name__)


class BaseAIProvider:
    """
    Abstract base class for all AI extraction providers.
    Subclasses must implement call_single() and optionally recheck_key_health().
    """

    def call_single(
        self,
        prompt_text: str,
        image_b64: Optional[str],
        mime_type: str,
        batch_images: Optional[List[dict]],
        request_data: dict,
        api_key: str,
        model_name: str,
        attempt_label: str = "Attempt 1",
    ) -> str:
        """
        Execute a single AI extraction call.

        Args:
            prompt_text: The instruction + OCR text prompt string
            image_b64:   Base64-encoded JPEG image (single-page mode)
            mime_type:   MIME type of the image (e.g. 'image/jpeg')
            batch_images: List of {'data': b64_str, 'mime_type': str} for batch mode
            request_data: Full SQS/request payload dict (for token accounting)
            api_key:     The resolved API key for this call
            model_name:  The model identifier string
            attempt_label: Human-readable label for logging (e.g. 'Attempt 3')

        Returns:
            Raw text response from the AI model (JSON string from model).

        Raises:
            TerminalTaskError: For non-retryable errors (auth, invalid input, etc.)
            Exception: For transient/retryable errors (timeout, 5xx, rate limits)
        """
        raise NotImplementedError(
            f"{self.__class__.__name__} must implement call_single()"
        )

    def get_model_name(self) -> str:
        """Return the configured model name for logging/accounting."""
        raise NotImplementedError

    def recheck_key_health(self, api_key: str, model_name: str) -> bool:
        """
        Test if an API key is healthy.
        Called by APIKeyManager during key rehab after quarantine.

        Returns:
            True if key is healthy, False otherwise.
        """
        raise NotImplementedError
