from datetime import datetime, timezone
from types import SimpleNamespace
from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, patch
from uuid import UUID, uuid4

from fastapi.testclient import TestClient

from app.core.db import get_db
from app.core.security import get_current_user
from app.main import app


class _FakeDB:
    def __init__(self, *, case_id: UUID, run_config_id: UUID, prompt_set_id: UUID) -> None:
        self._case_id = case_id
        self._run_config_id = run_config_id
        self._prompt_set_id = prompt_set_id

    def get(self, model: type, obj_id: UUID):
        model_name = model.__name__
        if model_name == "RunConfig" and obj_id == self._run_config_id:
            return SimpleNamespace(
                id=self._run_config_id,
                case_id=self._case_id,
                config_json={
                    "provider": "azure_openai",
                    "model_name": "gpt-4.1",
                    "conversation_mode": "hybrid_guided_groupchat",
                },
            )
        if model_name == "PromptSet" and obj_id == self._prompt_set_id:
            return SimpleNamespace(id=self._prompt_set_id)
        return None


class ApiFlowIntegrationTests(IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.case_id = uuid4()
        self.run_id = uuid4()
        self.run_config_id = uuid4()
        self.prompt_set_id = uuid4()

        self.fake_db = _FakeDB(
            case_id=self.case_id,
            run_config_id=self.run_config_id,
            prompt_set_id=self.prompt_set_id,
        )

        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=uuid4(), role="admin")
        app.dependency_overrides[get_db] = lambda: self.fake_db
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    def _build_run_obj(self):
        now = datetime.now(timezone.utc)
        return SimpleNamespace(
            id=self.run_id,
            case_id=self.case_id,
            run_config_id=self.run_config_id,
            prompt_set_id=self.prompt_set_id,
            status="completed",
            started_at=now,
            completed_at=now,
            provider="azure_openai",
            model_name="gpt-4.1",
            orchestration_mode="hybrid_guided_groupchat",
            summary_json={"status": "completed"},
            final_report_json={
                "schema_version": "1.0",
                "negotiation_id": str(self.case_id),
                "run_id": str(self.run_id),
                "status": "near_agreement",
                "summary": {
                    "public_summary": "Test summary",
                    "executive_summary": "Test executive summary",
                },
                "recommended_package": {
                    "base_salary": 200000,
                    "bonus_pct": 15,
                    "equity_value": 40000,
                    "sign_on_bonus": 10000,
                    "title": "Staff Engineer",
                    "review_timeline_months": 6,
                    "flexibility_terms": [],
                    "other_terms": [],
                },
                "recommended_range": {
                    "base_salary_min": 195000,
                    "base_salary_max": 205000,
                    "total_package_min": 225000,
                    "total_package_max": 255000,
                    "currency": "USD",
                },
                "alternative_packages": [],
                "candidate_arguments": [],
                "company_arguments": [],
                "decisive_factors": [],
                "unsupported_claims": [],
                "policy_flags": [],
                "confidence": {
                    "overall_confidence": 0.7,
                    "data_completeness_score": 0.7,
                    "market_alignment_score": 0.7,
                    "internal_equity_confidence": 0.7,
                    "notes": "test",
                },
                "run_metrics": {
                    "rounds_completed": 2,
                    "deadlock_risk_final": "medium",
                    "candidate_concession_count": 1,
                    "company_concession_count": 1,
                },
                "next_actions": {
                    "candidate": [],
                    "company": [],
                    "system": [],
                },
                "admin_only": {
                    "candidate_private_assessment": {},
                    "company_private_assessment": {},
                    "arbitrator_private_notes": [],
                },
            },
            error_text=None,
            created_at=now,
            updated_at=now,
        )

    async def test_case_run_create_then_report_fetch(self) -> None:
        run_obj = self._build_run_obj()

        with (
            patch("app.api.routes_cases.CaseService.get_case", return_value=SimpleNamespace(id=self.case_id)),
            patch("app.api.routes_cases.RunService.create_run", return_value=run_obj),
            patch("app.api.routes_cases.RunService.get_run", return_value=run_obj),
            patch("app.api.routes_cases.NegotiationRunner.run", new=AsyncMock(return_value=run_obj.final_report_json)),
            patch("app.api.routes_runs.RunService.get_run", return_value=run_obj),
        ):
            create_response = self.client.post(
                f"/api/cases/{self.case_id}/runs",
                json={
                    "run_config_id": str(self.run_config_id),
                    "prompt_set_id": str(self.prompt_set_id),
                },
            )
            self.assertEqual(create_response.status_code, 201)
            create_body = create_response.json()
            self.assertEqual(create_body["id"], str(self.run_id))
            self.assertEqual(create_body["case_id"], str(self.case_id))

            report_response = self.client.get(f"/api/runs/{self.run_id}/report")
            self.assertEqual(report_response.status_code, 200)
            report_body = report_response.json()
            self.assertEqual(report_body["schema_version"], "1.0")
            self.assertEqual(report_body["run_id"], str(self.run_id))

    async def test_run_stream_emits_status_message_artifact_and_completion(self) -> None:
        run_obj = self._build_run_obj()
        message_id = uuid4()
        artifact_id = uuid4()
        now = datetime.now(timezone.utc)

        message = SimpleNamespace(
            id=message_id,
            run_id=self.run_id,
            phase="openings",
            round_number=1,
            speaker_agent="candidate_proxy",
            visibility="public",
            message_type="proposal",
            content="Candidate proposes updated base salary.",
            structured_payload={"base_salary": 205000},
            created_at=now,
        )
        artifact = SimpleNamespace(
            id=artifact_id,
            run_id=self.run_id,
            artifact_type="round_snapshot",
            payload={"round": 1, "delta": "candidate_up"},
            created_at=now,
        )

        with (
            patch("app.api.routes_runs.RunService.get_run", return_value=run_obj),
            patch("app.api.routes_runs.RunService.list_messages", return_value=[message]),
            patch("app.api.routes_runs.RunService.list_artifacts", return_value=[artifact]),
        ):
            stream_response = self.client.get(f"/api/runs/{self.run_id}/stream")

        self.assertEqual(stream_response.status_code, 200)
        self.assertIn("event: status", stream_response.text)
        self.assertIn("event: message", stream_response.text)
        self.assertIn("event: artifact", stream_response.text)
        self.assertIn("event: completion", stream_response.text)
        self.assertIn("Candidate proposes updated base salary.", stream_response.text)


if __name__ == "__main__":
    import unittest

    unittest.main()
