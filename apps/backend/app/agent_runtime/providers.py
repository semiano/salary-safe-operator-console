from typing import Any, Protocol

import httpx

from app.core.settings import Settings, get_settings


class LLMProvider(Protocol):
    async def generate(self, system_prompt: str, messages: list[dict[str, str]], **kwargs: Any) -> dict[str, Any]:
        ...


class OpenAIProvider:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def generate(self, system_prompt: str, messages: list[dict[str, str]], **kwargs: Any) -> dict[str, Any]:
        payload = {
            "model": kwargs.get("model_name", self.settings.openai_model),
            "messages": [{"role": "system", "content": system_prompt}] + messages,
            "temperature": kwargs.get("temperature", 0.2),
        }

        headers = {
            "Authorization": f"Bearer {self.settings.openai_api_key}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()

        return {
            "content": data["choices"][0]["message"]["content"],
            "raw": data,
            "usage": data.get("usage"),
        }


class AzureOpenAIProvider:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def generate(self, system_prompt: str, messages: list[dict[str, str]], **kwargs: Any) -> dict[str, Any]:
        deployment = kwargs.get("deployment_name", self.settings.azure_openai_deployment_name)
        api_version = self.settings.azure_openai_api_version
        endpoint = self.settings.azure_openai_endpoint.rstrip("/")

        url = f"{endpoint}/openai/deployments/{deployment}/chat/completions"
        payload = {
            "messages": [{"role": "system", "content": system_prompt}] + messages,
            "temperature": kwargs.get("temperature", 0.2),
        }

        headers = {
            "api-key": self.settings.azure_openai_api_key,
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(url, headers=headers, params={"api-version": api_version}, json=payload)
            response.raise_for_status()
            data = response.json()

        return {
            "content": data["choices"][0]["message"]["content"],
            "raw": data,
            "usage": data.get("usage"),
        }


def get_provider(provider_name: str | None = None) -> LLMProvider:
    settings = get_settings()
    selected = provider_name or settings.llm_provider

    if selected == "openai":
        return OpenAIProvider(settings)
    if selected == "azure_openai":
        return AzureOpenAIProvider(settings)

    raise ValueError(f"Unsupported provider: {selected}")
