from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import Mock, patch
from uuid import uuid4

from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.core.db import get_db
from app.main import app


def _fake_case() -> SimpleNamespace:
    return SimpleNamespace(currency="USD", title="Senior Engineer", parties=[])


class ApplyRoutesTests(TestCase):
    def setUp(self) -> None:
        self.token = uuid4()
        self.fake_db = object()
        app.dependency_overrides[get_db] = lambda: self.fake_db
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    def _base_payload(self) -> dict:
        return {
            "salary_min": 90000,
            "salary_max": 110000,
            "insurance_importance_rank": 3,
            "pto_importance_rank": 2,
            "wfh_importance_rank": 1,
        }

    def test_submit_requires_invitation_code_for_gated_invite(self) -> None:
        bid = SimpleNamespace(
            invitation_code="AB12CD",
            submission_status="invitation_pending",
        )
        service = Mock()
        service.get_bid_by_token.return_value = bid
        service.verify_invitation_code.return_value = False

        with patch("app.api.routes_apply.Phase1BidService", return_value=service):
            response = self.client.post(f"/api/apply/{self.token}/submit", json=self._base_payload())

        self.assertEqual(response.status_code, 403)
        self.assertEqual(
            response.json()["detail"],
            "A valid invitation code is required to submit this application",
        )
        service.submit_candidate_bid.assert_not_called()

    def test_submit_accepts_verified_invitation_code_for_gated_invite(self) -> None:
        bid = SimpleNamespace(
            id=uuid4(),
            invitation_code="AB12CD",
            submission_status="invitation_pending",
        )
        service = Mock()
        service.get_bid_by_token.return_value = bid
        service.verify_invitation_code.return_value = True

        payload = self._base_payload()
        payload["invitation_code"] = "AB12CD"

        with patch("app.api.routes_apply.Phase1BidService", return_value=service):
            response = self.client.post(f"/api/apply/{self.token}/submit", json=payload)

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["ok"])
        service.verify_invitation_code.assert_called_once_with(bid, "AB12CD")
        service.submit_candidate_bid.assert_called_once_with(
            bid=bid,
            salary_min=90000,
            salary_max=110000,
            insurance_importance_rank=3,
            pto_importance_rank=2,
            wfh_importance_rank=1,
        )


class ApplyStatusTests(TestCase):
    def setUp(self) -> None:
        self.token = uuid4()
        self.fake_db = object()
        app.dependency_overrides[get_db] = lambda: self.fake_db
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    def _get_status(self, bid) -> dict:
        service = Mock()
        service.get_bid_by_token.return_value = bid
        config = Mock()
        config.get_auto_accept_match_threshold.return_value = 87.0
        with patch("app.api.routes_apply.Phase1BidService", return_value=service), patch(
            "app.api.routes_apply.ConfigService", return_value=config
        ):
            return self.client.get(f"/api/apply/{self.token}/status").json()

    def test_status_waiting_while_decision_pending(self) -> None:
        bid = SimpleNamespace(
            submission_status="applicant_bid_submitted",
            decision_status="pending",
            match_score=None,
            revision_count=0,
            response_message="",
            case=_fake_case(),
        )
        data = self._get_status(bid)
        self.assertEqual(data["processing_state"], "waiting")
        self.assertEqual(data["outcome"], "none")
        self.assertIsNone(data["match_score"])

    def test_status_success_when_match_dispatched(self) -> None:
        bid = SimpleNamespace(
            submission_status="response_sent",
            decision_status="accepted",
            match_score=92.0,
            revision_count=0,
            response_message="Welcome aboard!",
            case=_fake_case(),
        )
        data = self._get_status(bid)
        self.assertEqual(data["processing_state"], "ready")
        self.assertEqual(data["outcome"], "success")
        self.assertEqual(data["match_score"], 92.0)
        self.assertEqual(data["decision_message"], "Welcome aboard!")

    def test_status_hides_decision_until_dispatched(self) -> None:
        # Strong match but the response email has not been sent yet.
        bid = SimpleNamespace(
            submission_status="applicant_bid_submitted",
            decision_status="accepted",
            match_score=92.0,
            revision_count=0,
            response_message="",
            case=_fake_case(),
        )
        data = self._get_status(bid)
        self.assertEqual(data["processing_state"], "finalizing")
        self.assertEqual(data["outcome"], "none")
        self.assertIsNone(data["match_score"])
        self.assertIsNone(data["decision_message"])

    def test_status_offers_one_time_revision_on_first_no_match(self) -> None:
        bid = SimpleNamespace(
            submission_status="applicant_bid_submitted",
            decision_status="rejected",
            match_score=55.0,
            revision_count=0,
            response_message="",
            case=_fake_case(),
        )
        data = self._get_status(bid)
        self.assertEqual(data["processing_state"], "ready")
        self.assertEqual(data["outcome"], "revise_once")
        self.assertTrue(data["can_revise"])
        self.assertEqual(data["match_score"], 55.0)
        self.assertIsNone(data["decision_message"])

    def test_status_final_no_match_after_revision_dispatched(self) -> None:
        bid = SimpleNamespace(
            submission_status="response_sent",
            decision_status="rejected",
            match_score=None,
            revision_count=1,
            response_message="Thanks for revising.",
            case=_fake_case(),
        )
        data = self._get_status(bid)
        self.assertEqual(data["processing_state"], "ready")
        self.assertEqual(data["outcome"], "final_no_match")
        self.assertFalse(data["can_revise"])
        self.assertEqual(data["decision_message"], "Thanks for revising.")


class ApplyReviseTests(TestCase):
    def setUp(self) -> None:
        self.token = uuid4()
        self.fake_db = object()
        app.dependency_overrides[get_db] = lambda: self.fake_db
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    def _base_payload(self) -> dict:
        return {
            "salary_min": 80000,
            "salary_max": 95000,
            "insurance_importance_rank": 3,
            "pto_importance_rank": 2,
            "wfh_importance_rank": 1,
        }

    def test_revise_returns_409_when_revision_already_used(self) -> None:
        bid = SimpleNamespace(invitation_code=None, submission_status="applicant_bid_submitted")
        service = Mock()
        service.get_bid_by_token.return_value = bid
        service.submit_candidate_revision.side_effect = HTTPException(
            status_code=409, detail="You have already used your one-time revision"
        )
        config = Mock()
        config.get_auto_accept_match_threshold.return_value = 87.0

        with patch("app.api.routes_apply.Phase1BidService", return_value=service), patch(
            "app.api.routes_apply.ConfigService", return_value=config
        ):
            response = self.client.post(f"/api/apply/{self.token}/revise", json=self._base_payload())

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.json()["detail"], "You have already used your one-time revision")

    def test_revise_accepts_and_returns_waiting_state(self) -> None:
        bid = SimpleNamespace(
            id=uuid4(),
            invitation_code=None,
            submission_status="applicant_bid_submitted",
            decision_status="pending",
            match_score=None,
            revision_count=1,
            response_message="",
            case=_fake_case(),
        )
        service = Mock()
        service.get_bid_by_token.return_value = bid
        service.submit_candidate_revision.return_value = bid
        config = Mock()
        config.get_auto_accept_match_threshold.return_value = 87.0

        with patch("app.api.routes_apply.Phase1BidService", return_value=service), patch(
            "app.api.routes_apply.ConfigService", return_value=config
        ), patch("app.api.routes_apply._run_ai_match_for_bid"):
            response = self.client.post(f"/api/apply/{self.token}/revise", json=self._base_payload())

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["processing_state"], "waiting")
        service.submit_candidate_revision.assert_called_once_with(
            bid=bid,
            salary_min=80000,
            salary_max=95000,
            insurance_importance_rank=3,
            pto_importance_rank=2,
            wfh_importance_rank=1,
        )


if __name__ == "__main__":
    import unittest

    unittest.main()
