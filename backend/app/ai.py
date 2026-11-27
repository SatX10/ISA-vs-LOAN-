"""Structured requests to the configured OpenAI model."""

import json
import os

import httpx


def ai_enabled():
    return bool(os.getenv("OPENAI_API_KEY", "").strip())


def structured_output(name, instructions, context, properties):
    payload = {
        "model": os.getenv("OPENAI_MODEL", "gpt-4.1-mini"),
        "store": False,
        "instructions": instructions,
        "input": json.dumps(context, ensure_ascii=False),
        "max_output_tokens": 240,
        "text": {"format": {"type": "json_schema", "name": name, "strict": True, "schema": {
            "type": "object", "properties": properties, "required": list(properties), "additionalProperties": False,
        }}},
    }
    try:
        response = httpx.post(
            "https://api.openai.com/v1/responses",
            headers={"Authorization": f"Bearer {os.environ['OPENAI_API_KEY'].strip()}"},
            json=payload,
            timeout=8,
        )
        response.raise_for_status()
        for item in response.json().get("output", []):
            for part in item.get("content", []):
                if part.get("type") == "output_text":
                    result = json.loads(part["text"])
                    if isinstance(result, dict):
                        return result
    except (httpx.HTTPError, KeyError, ValueError, TypeError, AttributeError):
        pass
    return None
