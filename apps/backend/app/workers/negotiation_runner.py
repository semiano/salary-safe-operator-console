import asyncio
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from app.agent_runtime.agent_factory import build_default_agents
from app.agent_runtime.orchestration import build_final_report_from_workflow, run_guided_workflow
from app.models.case import NegotiationCase
from app.models.config import RunConfig
from app.models.prompt import PromptSet
from app.schemas.report import validate_final_report
from app.services.run_service import RunService


class NegotiationRunner:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.run_service = RunService(db)

    def _load_case(self, case_id: UUID) -> NegotiationCase:
        case = self.db.get(NegotiationCase, case_id)
        if case is None:
            raise ValueError("Case not found")
        return case

    @staticmethod
    def _case_payload(case: NegotiationCase) -> dict[str, Any]:
        candidate_party = next((party for party in case.parties if party.party_type == "candidate"), None)
        company_party = next((party for party in case.parties if party.party_type == "company"), None)

        return {
            "case_id": str(case.id),
            "candidate": {
                "public_payload": candidate_party.public_payload if candidate_party else {},
                "confidential_payload": candidate_party.confidential_payload if candidate_party else {},
            },
            "company": {
                "public_payload": company_party.public_payload if company_party else {},
                "confidential_payload": company_party.confidential_payload if company_party else {},
            },
        }

    def _load_config(self, run_config_id: UUID) -> RunConfig:
        config = self.db.get(RunConfig, run_config_id)
        if config is None:
            raise ValueError("Run config not found")
        return config

    def _load_prompt_set(self, prompt_set_id: UUID) -> PromptSet:
        prompt_set = self.db.get(PromptSet, prompt_set_id)
        if prompt_set is None:
            raise ValueError("Prompt set not found")
        return prompt_set

    @staticmethod
    async def _sleep_between_messages(delay_seconds: float) -> None:
        if delay_seconds > 0:
            await asyncio.sleep(delay_seconds)

    async def run(self, run_id: UUID) -> dict[str, Any]:
        run = self.run_service.get_run(run_id)
        if run is None:
            raise ValueError("Run not found")

        self.run_service.set_run_status(run, "running")

        try:
            case = self._load_case(run.case_id)
            config = self._load_config(run.run_config_id)
            prompt_set = self._load_prompt_set(run.prompt_set_id)
            message_delay_seconds = float(config.config_json.get("turn_delay_seconds", 1.5))

            _agents = build_default_agents(config.config_json, provider_name=run.provider)

            case_payload = self._case_payload(case)
            workflow_result = await run_guided_workflow(case_payload, config.config_json)

            self.run_service.save_run_artifact(run_id, "normalized_intake", workflow_result["normalized"])
            self.run_service.save_run_message(
                run_id=run_id,
                phase="intake",
                round_number=0,
                speaker_agent="IntakeNormalizerAgent",
                visibility="admin_only",
                message_type="summary",
                content="Intake normalization completed.",
                structured_payload=workflow_result["normalized"],
            )
            await self._sleep_between_messages(message_delay_seconds)
            self.run_service.save_run_message(
                run_id=run_id,
                phase="preparation",
                round_number=0,
                speaker_agent="CandidateRepAgent",
                visibility="public",
                message_type="turn",
                content=workflow_result["candidate_opening"]["public_message"],
                structured_payload=workflow_result["candidate_opening"],
            )
            await self._sleep_between_messages(message_delay_seconds)
            self.run_service.save_run_message(
                run_id=run_id,
                phase="preparation",
                round_number=0,
                speaker_agent="CompanyRepAgent",
                visibility="public",
                message_type="turn",
                content=workflow_result["company_opening"]["public_message"],
                structured_payload=workflow_result["company_opening"],
            )
            await self._sleep_between_messages(message_delay_seconds)
            self.run_service.save_run_artifact(run_id, "policy_report", workflow_result["opening_policy"])
            self.run_service.save_run_message(
                run_id=run_id,
                phase="policy_review",
                round_number=0,
                speaker_agent="PolicyGuardAgent",
                visibility="admin_only",
                message_type="policy_flag",
                content=f"Opening policy review status: {workflow_result['opening_policy']['status']}",
                structured_payload=workflow_result["opening_policy"],
            )
            await self._sleep_between_messages(message_delay_seconds)

            for round_data in workflow_result["rounds"]:
                round_number = int(round_data["round_number"])
                self.run_service.save_run_message(
                    run_id=run_id,
                    phase="negotiation",
                    round_number=round_number,
                    speaker_agent="ArbitratorAgent",
                    visibility="public",
                    message_type="summary",
                    content=round_data["arbitrator_instruction"]["public_message"],
                    structured_payload=round_data["arbitrator_instruction"],
                )
                await self._sleep_between_messages(message_delay_seconds)
                self.run_service.save_run_message(
                    run_id=run_id,
                    phase="negotiation",
                    round_number=round_number,
                    speaker_agent="CandidateRepAgent",
                    visibility="public",
                    message_type="proposal",
                    content=round_data["candidate_turn"]["public_message"],
                    structured_payload=round_data["candidate_turn"],
                )
                await self._sleep_between_messages(message_delay_seconds)
                self.run_service.save_run_message(
                    run_id=run_id,
                    phase="negotiation",
                    round_number=round_number,
                    speaker_agent="CompanyRepAgent",
                    visibility="public",
                    message_type="proposal",
                    content=round_data["company_turn"]["public_message"],
                    structured_payload=round_data["company_turn"],
                )
                await self._sleep_between_messages(message_delay_seconds)
                self.run_service.save_run_message(
                    run_id=run_id,
                    phase="negotiation",
                    round_number=round_number,
                    speaker_agent="PolicyGuardAgent",
                    visibility="admin_only",
                    message_type="policy_flag",
                    content=f"Round {round_number} policy status: {round_data['policy_review']['status']}",
                    structured_payload=round_data["policy_review"],
                )
                self.run_service.save_run_artifact(run_id, f"round_{round_number}_state", round_data)
                await self._sleep_between_messages(message_delay_seconds)

            final_report_payload = build_final_report_from_workflow(
                run_id=str(run.id),
                case_id=str(run.case_id),
                workflow_result=workflow_result,
                currency=case.currency,
            )
            final_report = validate_final_report(final_report_payload)
            run.final_report_json = final_report.model_dump(mode="json")
            run.summary_json = {
                "status": "completed",
                "prompt_set_version": prompt_set.version,
                "provider": run.provider,
                "model_name": run.model_name,
                "workflow_status": workflow_result["final_state"]["status"],
                "rounds_completed": len(workflow_result["rounds"]),
            }
            self.db.commit()

            self.run_service.save_run_artifact(run_id, "final_json", run.final_report_json)
            self.run_service.set_run_status(run, "completed")
            return run.final_report_json
        except Exception as exc:
            self.run_service.set_run_error(run, str(exc))
            raise
