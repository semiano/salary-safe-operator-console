from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.agent_runtime.providers import LLMProvider, get_provider


PROMPT_FILE_MAP = {
    "IntakeNormalizerAgent": "intake_normalizer.txt",
    "CandidateRepAgent": "candidate_rep.txt",
    "CompanyRepAgent": "company_rep.txt",
    "PolicyGuardAgent": "policy_guard.txt",
    "ArbitratorAgent": "arbitrator.txt",
}


@dataclass(slots=True)
class AgentInstance:
    name: str
    system_prompt: str
    provider: LLMProvider
    config: dict[str, Any]

    async def generate(self, messages: list[dict[str, str]], **kwargs: Any) -> dict[str, Any]:
        return await self.provider.generate(self.system_prompt, messages, **kwargs)


def _prompt_dir() -> Path:
    return Path(__file__).resolve().parent / "prompts"


def load_prompt(prompt_filename: str) -> str:
    prompt_path = _prompt_dir() / prompt_filename
    return prompt_path.read_text(encoding="utf-8")


def build_agent(name: str, run_config: dict[str, Any], provider_name: str | None = None) -> AgentInstance:
    if name not in PROMPT_FILE_MAP:
        raise ValueError(f"Unknown agent name: {name}")

    prompt = load_prompt(PROMPT_FILE_MAP[name])
    provider = get_provider(provider_name)
    return AgentInstance(name=name, system_prompt=prompt, provider=provider, config=run_config)


def build_default_agents(run_config: dict[str, Any], provider_name: str | None = None) -> dict[str, AgentInstance]:
    return {
        "intake": build_agent("IntakeNormalizerAgent", run_config, provider_name),
        "candidate": build_agent("CandidateRepAgent", run_config, provider_name),
        "company": build_agent("CompanyRepAgent", run_config, provider_name),
        "policy": build_agent("PolicyGuardAgent", run_config, provider_name),
        "arbitrator": build_agent("ArbitratorAgent", run_config, provider_name),
    }
