"""Thin wrapper over the Anthropic SDK with prompt caching enabled by default.

Phase 1 uses Anthropic only. When we add OpenAI/Gemini variants for the
multi-model bake-off (red-team variety), we'll grow this into a Backbone
protocol with provider-specific implementations.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

from anthropic import Anthropic

DEFAULT_BLUE_MODEL = "claude-sonnet-4-6"
LENIENT_BLUE_MODEL = "claude-haiku-4-5-20251001"
DEFAULT_RED_MODEL = "claude-sonnet-4-6"
DEFAULT_JUDGE_MODEL = "claude-opus-4-7"


@dataclass
class LLMResponse:
    text: str
    tool_uses: list[dict[str, Any]]
    raw: Any


class Backbone:
    """Anthropic-backed LLM with prompt caching on the system block."""

    def __init__(self, model: str, client: Anthropic | None = None) -> None:
        self.model = model
        self.client = client or Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
        # Opus 4.7 deprecated the temperature parameter — skip it for that family.
        self.supports_temperature = "opus-4-7" not in model

    def complete(
        self,
        *,
        system: str,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        max_tokens: int = 2048,
        temperature: float = 0.7,
    ) -> LLMResponse:
        # Cache the system prompt — it's large and stable across turns.
        system_blocks = [
            {
                "type": "text",
                "text": system,
                "cache_control": {"type": "ephemeral"},
            }
        ]

        kwargs: dict[str, Any] = {
            "model": self.model,
            "max_tokens": max_tokens,
            "system": system_blocks,
            "messages": messages,
        }
        if self.supports_temperature:
            kwargs["temperature"] = temperature
        if tools:
            kwargs["tools"] = tools

        resp = self.client.messages.create(**kwargs)

        text_parts: list[str] = []
        tool_uses: list[dict[str, Any]] = []
        for block in resp.content:
            if block.type == "text":
                text_parts.append(block.text)
            elif block.type == "tool_use":
                tool_uses.append(
                    {
                        "id": block.id,
                        "name": block.name,
                        "input": block.input,
                    }
                )

        return LLMResponse(
            text="\n".join(text_parts).strip(),
            tool_uses=tool_uses,
            raw=resp,
        )
