from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import Mock, patch
from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.db import get_db
from app.main import app


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


if __name__ == "__main__":
    import unittest

    unittest.main()
