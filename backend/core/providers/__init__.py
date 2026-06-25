"""
AI Provider Abstraction Layer
=============================
Provides a pluggable interface for AI extraction providers.
Current sole provider: QwenProvider (self-hosted vLLM / Dashscope).
"""
from .base import BaseAIProvider
from .qwen_provider import QwenProvider

__all__ = ["BaseAIProvider", "QwenProvider"]
