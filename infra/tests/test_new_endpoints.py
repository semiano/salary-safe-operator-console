"""
Integration tests for the new-taxonomy endpoints added during the navigation overhaul.
Runs against a live stack at http://localhost:8000.

Coverage:
  1.  Auth         — login, bearer token, unauthenticated rejection
  2.  Job Listings — CRUD, list, update
  3.  Applications — simulate, invite (with code), list per-listing, list global,
                     get-by-id, update decision, update response-message
  4.  Public Apply — GET /apply/{token}, verify-code gate, submit (with & without code)
  5.  Backward compat — old /api/cases and /api/phase1-bids still respond
"""

import json
import unittest
import urllib.error
import urllib.request
from typing import Any

# ── Config ────────────────────────────────────────────────────────────────────

BASE = "http://localhost:8000/api"
ADMIN_EMAIL = "admin@salarysafe.dev"
ADMIN_PASSWORD = "admin123!"  # nosec B105 - test credentials only


# ── HTTP helpers ──────────────────────────────────────────────────────────────

def _request(
    method: str,
    url: str,
    payload: dict | None = None,
    *,
    token: str | None = None,
) -> tuple[int, Any]:
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:  # nosec B310
            body = resp.read().decode()
            return resp.status, (json.loads(body) if body.strip() else {})
    except urllib.error.HTTPError as exc:
        body = exc.read().decode()
        return exc.code, (json.loads(body) if body.strip() else {})


def _get(url: str, *, token: str | None = None) -> tuple[int, Any]:
    return _request("GET", url, token=token)


def _post(url: str, payload: dict, *, token: str | None = None) -> tuple[int, Any]:
    return _request("POST", url, payload, token=token)


def _put(url: str, payload: dict, *, token: str | None = None) -> tuple[int, Any]:
    return _request("PUT", url, payload, token=token)


def _get_admin_token() -> str:
    status, body = _post(f"{BASE}/auth/login", {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert status == 200, f"Admin login failed: {status} {body}"
    return body["access_token"]


# ── Minimal listing payload ───────────────────────────────────────────────────

def _listing_payload(title: str = "Test Listing") -> dict:
    return {
        "title": title,
        "description": "Integration test listing",
        "status": "draft",
        "jurisdiction": "US",
        "currency": "USD",
        "candidate": {
            "public_payload": {},
            "confidential_payload": {"salary_floor": 80000, "salary_ceiling": 120000},
        },
        "company": {
            "public_payload": {
                "job_title": title,
                "work_arrangement": "hybrid",
                "location": "New York, NY",
                "health_insurance": True,
                "retirement_401k": True,
                "pto_days": 20,
            },
            "confidential_payload": {"budget_ceiling": 130000},
        },
    }


# ── 1. Auth ───────────────────────────────────────────────────────────────────

class TestAuth(unittest.TestCase):
    """Auth endpoint tests."""

    def test_login_returns_access_token(self) -> None:
        """POST /api/auth/login with valid creds returns 200 + access_token."""
        status, body = _post(f"{BASE}/auth/login", {"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        self.assertEqual(status, 200, f"Unexpected status: {status} {body}")
        self.assertIn("access_token", body)
        self.assertIsInstance(body["access_token"], str)
        self.assertGreater(len(body["access_token"]), 20)
        self.assertEqual(body.get("token_type"), "bearer")

    def test_login_wrong_password_returns_401(self) -> None:
        """POST /api/auth/login with wrong password returns 401."""
        status, body = _post(f"{BASE}/auth/login", {"email": ADMIN_EMAIL, "password": "wrongpassword"})
        self.assertEqual(status, 401, f"Expected 401 but got {status}: {body}")

    def test_unauthenticated_request_to_job_listings_returns_401(self) -> None:
        """GET /api/job-listings without a token returns 401."""
        status, _ = _get(f"{BASE}/job-listings")
        self.assertEqual(status, 401)

    def test_unauthenticated_request_to_applications_returns_401(self) -> None:
        """GET /api/applications without a token returns 401."""
        status, _ = _get(f"{BASE}/applications")
        self.assertEqual(status, 401)

    def test_invalid_bearer_token_returns_401(self) -> None:
        """GET /api/job-listings with a garbage token returns 401."""
        status, _ = _get(f"{BASE}/job-listings", token="not.a.real.token")
        self.assertEqual(status, 401)


# ── 2. Job Listings ───────────────────────────────────────────────────────────

class TestJobListings(unittest.TestCase):
    """CRUD tests for /api/job-listings."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.token = _get_admin_token()

    def test_01_list_returns_200(self) -> None:
        """GET /api/job-listings returns 200 + a list."""
        status, body = _get(f"{BASE}/job-listings", token=self.token)
        self.assertEqual(status, 200, f"Got {status}: {body}")
        self.assertIsInstance(body, list)

    def test_02_create_listing_returns_201(self) -> None:
        """POST /api/job-listings creates a listing and returns 201."""
        status, body = _post(f"{BASE}/job-listings", _listing_payload("Acme Sr. Engineer"), token=self.token)
        self.assertEqual(status, 201, f"Got {status}: {body}")
        self.assertIn("id", body)
        self.assertEqual(body["title"], "Acme Sr. Engineer")
        self.__class__._new_listing_id = body["id"]

    def test_03_get_listing_by_id(self) -> None:
        """GET /api/job-listings/{id} returns the listing we just created."""
        listing_id = self.__class__._new_listing_id
        status, body = _get(f"{BASE}/job-listings/{listing_id}", token=self.token)
        self.assertEqual(status, 200, f"Got {status}: {body}")
        self.assertEqual(body["id"], listing_id)
        self.assertEqual(body["title"], "Acme Sr. Engineer")

    def test_04_listing_has_parties(self) -> None:
        """The created listing returns candidate + company parties."""
        listing_id = self.__class__._new_listing_id
        _, body = _get(f"{BASE}/job-listings/{listing_id}", token=self.token)
        parties = body.get("parties", [])
        party_types = {p["party_type"] for p in parties}
        self.assertIn("candidate", party_types)
        self.assertIn("company", party_types)

    def test_05_update_listing_guidance(self) -> None:
        """PUT /api/job-listings/{id} updates operator_guidance."""
        listing_id = self.__class__._new_listing_id
        status, body = _put(
            f"{BASE}/job-listings/{listing_id}",
            {"operator_guidance": "Prioritise work-life balance"},
            token=self.token,
        )
        self.assertEqual(status, 200, f"Got {status}: {body}")
        self.assertEqual(body.get("operator_guidance"), "Prioritise work-life balance")

    def test_06_listing_appears_in_list(self) -> None:
        """The newly created listing is returned in GET /api/job-listings."""
        listing_id = self.__class__._new_listing_id
        _, body = _get(f"{BASE}/job-listings", token=self.token)
        ids = [item["id"] for item in body]
        self.assertIn(listing_id, ids)

    def test_07_unknown_listing_id_returns_404(self) -> None:
        """GET /api/job-listings/{non-existent-uuid} returns 404."""
        fake_id = "00000000-0000-0000-0000-000000000000"
        status, _ = _get(f"{BASE}/job-listings/{fake_id}", token=self.token)
        self.assertEqual(status, 404)

    def test_08_create_listing_missing_title_returns_422(self) -> None:
        """POST /api/job-listings without a title returns 422 validation error."""
        payload = _listing_payload()
        del payload["title"]
        status, _ = _post(f"{BASE}/job-listings", payload, token=self.token)
        self.assertEqual(status, 422)


# ── 3. Applications ───────────────────────────────────────────────────────────

class TestApplications(unittest.TestCase):
    """Tests for /api/job-listings/{id}/applications and /api/applications."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.token = _get_admin_token()
        # Create a fresh listing to work with
        status, body = _post(f"{BASE}/job-listings", _listing_payload("Applications Test Role"), token=cls.token)
        assert status == 201, f"Setup listing failed: {body}"
        cls.listing_id = body["id"]

    def test_01_empty_applications_list(self) -> None:
        """GET /api/job-listings/{id}/applications returns empty list for new listing."""
        status, body = _get(f"{BASE}/job-listings/{self.listing_id}/applications", token=self.token)
        self.assertEqual(status, 200, f"Got {status}: {body}")
        self.assertIsInstance(body, list)
        self.assertEqual(len(body), 0)

    def test_02_simulate_creates_application(self) -> None:
        """POST /api/job-listings/{id}/applications/simulate creates a submitted application."""
        payload = {
            "candidate_name": "Jane Doe",
            "candidate_email": "jane.doe@test.example",
            "salary_min": 90000,
            "salary_max": 110000,
            "insurance_importance_rank": 1,
            "pto_importance_rank": 2,
            "wfh_importance_rank": 3,
        }
        status, body = _post(
            f"{BASE}/job-listings/{self.listing_id}/applications/simulate",
            payload,
            token=self.token,
        )
        self.assertEqual(status, 201, f"Got {status}: {body}")
        self.assertIn("id", body)
        self.assertEqual(body["candidate_name"], "Jane Doe")
        self.assertEqual(body["candidate_email"], "jane.doe@test.example")
        self.__class__._simulated_app_id = body["id"]

    def test_03_invite_creates_pending_application(self) -> None:
        """POST /api/job-listings/{id}/applications/invite creates a pending invitation."""
        # Endpoint accepts Phase1BidBulkInviteRequest -- wraps in 'invitations' list
        payload = {"invitations": [{"candidate_email": "bob.smith@test.example", "candidate_name": "Bob Smith"}]}
        status, body = _post(
            f"{BASE}/job-listings/{self.listing_id}/applications/invite",
            payload,
            token=self.token,
        )
        self.assertEqual(status, 201, f"Got {status}: {body}")
        self.assertIsInstance(body, list)
        self.assertEqual(len(body), 1)
        invited = body[0]
        self.assertIn("id", invited)
        self.assertIn("token", invited)
        self.assertEqual(invited["submission_status"], "invitation_pending")
        # Invitation code should be set (6-char uppercase/digit)
        self.assertIsNotNone(invited.get("invitation_code"))
        self.assertRegex(invited["invitation_code"], r"^[A-Z0-9]{6}$")
        self.__class__._invited_app = invited  # save full object for later tests

    def test_04_per_listing_applications_list(self) -> None:
        """GET /api/job-listings/{id}/applications returns both simulate + invite."""
        _, body = _get(f"{BASE}/job-listings/{self.listing_id}/applications", token=self.token)
        ids = [item["id"] for item in body]
        self.assertIn(self.__class__._simulated_app_id, ids)
        self.assertIn(self.__class__._invited_app["id"], ids)

    def test_05_global_applications_list_contains_new_apps(self) -> None:
        """GET /api/applications returns applications across all listings."""
        status, body = _get(f"{BASE}/applications", token=self.token)
        self.assertEqual(status, 200, f"Got {status}: {body}")
        self.assertIsInstance(body, list)
        ids = [item["id"] for item in body]
        self.assertIn(self.__class__._simulated_app_id, ids)

    def test_06_get_application_by_id(self) -> None:
        """GET /api/applications/{id} returns the specific application."""
        app_id = self.__class__._simulated_app_id
        status, body = _get(f"{BASE}/applications/{app_id}", token=self.token)
        self.assertEqual(status, 200, f"Got {status}: {body}")
        self.assertEqual(body["id"], app_id)
        self.assertEqual(body["candidate_name"], "Jane Doe")

    def test_07_update_decision(self) -> None:
        """PUT /api/applications/{id}/decision sets accepted/rejected."""
        app_id = self.__class__._simulated_app_id
        status, body = _put(
            f"{BASE}/applications/{app_id}/decision",
            {"decision_status": "accepted", "decision_reason": "Strong candidate"},
            token=self.token,
        )
        self.assertEqual(status, 200, f"Got {status}: {body}")
        self.assertEqual(body.get("decision_status"), "accepted")
        self.assertEqual(body.get("decision_reason"), "Strong candidate")

    def test_08_update_response_message(self) -> None:
        """PUT /api/applications/{id}/response-message sets the message."""
        app_id = self.__class__._simulated_app_id
        status, body = _put(
            f"{BASE}/applications/{app_id}/response-message",
            {"response_message": "Congratulations! We would like to offer you the role."},
            token=self.token,
        )
        self.assertEqual(status, 200, f"Got {status}: {body}")
        self.assertEqual(body.get("response_message"), "Congratulations! We would like to offer you the role.")

    def test_09_unknown_application_returns_404(self) -> None:
        """GET /api/applications/{non-existent-uuid} returns 404."""
        fake_id = "00000000-0000-0000-0000-000000000001"
        status, _ = _get(f"{BASE}/applications/{fake_id}", token=self.token)
        self.assertEqual(status, 404)

    def test_10_bid_stats_returns_counts(self) -> None:
        """GET /api/job-listings/{id}/bid-stats returns invitations_sent + bids_received."""
        status, body = _get(f"{BASE}/job-listings/{self.listing_id}/bid-stats", token=self.token)
        self.assertEqual(status, 200, f"Got {status}: {body}")
        self.assertIn("invitations_sent", body)
        self.assertIn("bids_received", body)
        # One simulate (counts as bid_received) + one invite
        self.assertGreaterEqual(body["bids_received"] + body["invitations_sent"], 2)


# ── 4. Public Apply — no code gate ───────────────────────────────────────────

class TestPublicApplyNoCode(unittest.TestCase):
    """
    Tests for GET/POST /api/apply/{token} when the application has no invitation code
    (bare simulate — no code required).
    """

    @classmethod
    def setUpClass(cls) -> None:
        token = _get_admin_token()
        # Create a listing
        _, listing = _post(f"{BASE}/job-listings", _listing_payload("No-Code Apply Role"), token=token)
        cls.listing_id = listing["id"]
        # Simulate a submitted application — this has no invitation_code
        payload = {
            "candidate_name": "Alice Test",
            "candidate_email": "alice.test@example.com",
            "salary_min": 80000,
            "salary_max": 100000,
            "insurance_importance_rank": 1,
            "pto_importance_rank": 2,
            "wfh_importance_rank": 3,
        }
        _, app = _post(f"{BASE}/job-listings/{cls.listing_id}/applications/simulate", payload, token=token)
        cls.app_token = app["token"]
        cls.app_id = app["id"]

    def test_01_get_apply_returns_job_info(self) -> None:
        """GET /api/apply/{token} returns 200 + job info."""
        status, body = _get(f"{BASE}/apply/{self.app_token}")
        self.assertEqual(status, 200, f"Got {status}: {body}")
        self.assertIn("job_title", body)
        self.assertIn("already_submitted", body)
        # Simulated apps are already submitted
        self.assertTrue(body["already_submitted"])

    def test_02_requires_code_false_for_no_code_app(self) -> None:
        """GET /api/apply/{token} sets requires_code=false when no invitation_code."""
        _, body = _get(f"{BASE}/apply/{self.app_token}")
        self.assertFalse(body.get("requires_code"), f"Expected requires_code=false, got: {body}")

    def test_03_apply_nonexistent_token_returns_404(self) -> None:
        """GET /api/apply/{random-uuid} returns 404."""
        fake_token = "00000000-0000-0000-0000-000000000002"
        status, _ = _get(f"{BASE}/apply/{fake_token}")
        self.assertEqual(status, 404)


# ── 5. Public Apply — with code gate ─────────────────────────────────────────

class TestPublicApplyWithCodeGate(unittest.TestCase):
    """
    Tests for the invitation-code gate.
    Uses POST /api/job-listings/{id}/applications/invite which sets invitation_code.
    """

    @classmethod
    def setUpClass(cls) -> None:
        tok = _get_admin_token()
        cls.admin_token = tok
        # Create listing
        _, listing = _post(f"{BASE}/job-listings", _listing_payload("Code Gate Apply Role"), token=tok)
        cls.listing_id = listing["id"]
        # Create invitation (sets invitation_code) — endpoint takes bulk list
        _, apps = _post(
            f"{BASE}/job-listings/{cls.listing_id}/applications/invite",
            {"invitations": [{"candidate_email": "carol.gate@test.example", "candidate_name": "Carol Gate"}]},
            token=tok,
        )
        assert isinstance(apps, list) and len(apps) == 1, f"Invite response unexpected: {apps}"
        app = apps[0]
        cls.app_token = app["token"]
        cls.invitation_code = app["invitation_code"]
        cls.app_id = app["id"]

    def test_01_get_apply_requires_code_true(self) -> None:
        """GET /api/apply/{token} returns requires_code=true for invitation with code."""
        status, body = _get(f"{BASE}/apply/{self.app_token}")
        self.assertEqual(status, 200, f"Got {status}: {body}")
        self.assertTrue(body.get("requires_code"), f"Expected requires_code=true, got: {body}")
        self.assertFalse(body.get("already_submitted"))

    def test_02_verify_wrong_code_returns_403(self) -> None:
        """POST /api/apply/{token}/verify-code with wrong code returns 403."""
        status, body = _post(f"{BASE}/apply/{self.app_token}/verify-code", {"code": "WRONG1"})
        self.assertEqual(status, 403, f"Expected 403 for wrong code, got {status}: {body}")

    def test_03_verify_correct_code_returns_200(self) -> None:
        """POST /api/apply/{token}/verify-code with correct code returns 200 valid=true."""
        status, body = _post(f"{BASE}/apply/{self.app_token}/verify-code", {"code": self.invitation_code})
        self.assertEqual(status, 200, f"Expected 200, got {status}: {body}")
        self.assertTrue(body.get("valid"), f"Expected valid=true, got: {body}")

    def test_04_verify_code_case_insensitive(self) -> None:
        """Invitation code verification is case-insensitive."""
        lower_code = self.invitation_code.lower()
        status, body = _post(f"{BASE}/apply/{self.app_token}/verify-code", {"code": lower_code})
        self.assertEqual(status, 200, f"Got {status}: {body}")
        self.assertTrue(body.get("valid"))

    def test_05_submit_without_code_returns_403(self) -> None:
        """POST /api/apply/{token}/submit without code when code is required returns 403."""
        payload = {
            "applicant_identifier": "carol_no_code",
            "salary_min": 85000,
            "salary_max": 105000,
            "insurance_importance_rank": 1,
            "pto_importance_rank": 2,
            "wfh_importance_rank": 3,
        }
        status, body = _post(f"{BASE}/apply/{self.app_token}/submit", payload)
        self.assertEqual(status, 403, f"Expected 403 without code, got {status}: {body}")

    def test_06_submit_with_wrong_code_returns_403(self) -> None:
        """POST /api/apply/{token}/submit with wrong code returns 403."""
        payload = {
            "applicant_identifier": "carol_wrong",
            "salary_min": 85000,
            "salary_max": 105000,
            "insurance_importance_rank": 1,
            "pto_importance_rank": 2,
            "wfh_importance_rank": 3,
            "invitation_code": "BADCOD",
        }
        status, body = _post(f"{BASE}/apply/{self.app_token}/submit", payload)
        self.assertEqual(status, 403, f"Expected 403 with wrong code, got {status}: {body}")

    def test_07_submit_with_correct_code_succeeds(self) -> None:
        """POST /api/apply/{token}/submit with correct code returns 200."""
        payload = {
            "applicant_identifier": "carol.gate@test.example",
            "salary_min": 85000,
            "salary_max": 105000,
            "insurance_importance_rank": 1,
            "pto_importance_rank": 2,
            "wfh_importance_rank": 3,
            "invitation_code": self.invitation_code,
        }
        status, body = _post(f"{BASE}/apply/{self.app_token}/submit", payload)
        self.assertEqual(status, 200, f"Expected 200 with correct code, got {status}: {body}")
        self.assertTrue(body.get("ok"), f"Expected ok=true, got: {body}")

    def test_08_already_submitted_apply_get_shows_flag(self) -> None:
        """GET /api/apply/{token} after submission returns already_submitted=true."""
        _, body = _get(f"{BASE}/apply/{self.app_token}")
        self.assertTrue(body.get("already_submitted"), f"Expected already_submitted=true, got: {body}")

    def test_09_second_submit_returns_409(self) -> None:
        """POST /api/apply/{token}/submit a second time returns 409 conflict."""
        payload = {
            "applicant_identifier": "carol.gate@test.example",
            "salary_min": 85000,
            "salary_max": 105000,
            "insurance_importance_rank": 1,
            "pto_importance_rank": 2,
            "wfh_importance_rank": 3,
            "invitation_code": self.invitation_code,
        }
        status, _ = _post(f"{BASE}/apply/{self.app_token}/submit", payload)
        self.assertEqual(status, 409, f"Expected 409 on re-submit, got {status}")

    def test_10_admin_can_see_invitation_code_on_application(self) -> None:
        """Admin GET /api/applications/{id} includes invitation_code field."""
        status, body = _get(f"{BASE}/applications/{self.app_id}", token=self.admin_token)
        self.assertEqual(status, 200, f"Got {status}: {body}")
        self.assertEqual(body.get("invitation_code"), self.invitation_code)


# ── 6. Backward Compatibility ─────────────────────────────────────────────────

class TestBackwardCompatibility(unittest.TestCase):
    """Old /api/cases and /api/phase1-bids endpoints must still respond."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.token = _get_admin_token()

    def test_cases_health_still_returns_200(self) -> None:
        """GET /api/cases/health still returns 200 (Under Construction pages)."""
        status, body = _get(f"{BASE}/cases/health", token=self.token)
        self.assertEqual(status, 200, f"Got {status}: {body}")

    def test_cases_list_still_returns_200(self) -> None:
        """GET /api/cases still returns 200."""
        status, body = _get(f"{BASE}/cases", token=self.token)
        self.assertEqual(status, 200, f"Got {status}: {body}")
        self.assertIsInstance(body, list)

    def test_old_bid_token_path_still_works(self) -> None:
        """GET /api/bid/{token} for a non-existent token returns 404 (not 401/500)."""
        fake_token = "00000000-0000-0000-0000-000000000003"
        status, _ = _get(f"{BASE}/bid/{fake_token}")
        # 404 is expected — route still exists and is reachable
        self.assertEqual(status, 404)

    def test_job_listings_and_cases_share_same_data(self) -> None:
        """Listings created via /api/job-listings appear in /api/cases (same table)."""
        # Create via new endpoint
        _, new_listing = _post(
            f"{BASE}/job-listings",
            _listing_payload("Cross-Check Role"),
            token=self.token,
        )
        new_id = new_listing["id"]

        # Verify it appears in old /cases endpoint
        _, all_cases = _get(f"{BASE}/cases", token=self.token)
        case_ids = [c["id"] for c in all_cases]
        self.assertIn(new_id, case_ids, "Listing created via /job-listings should appear in /cases")


# ── 7. Health & Infrastructure ────────────────────────────────────────────────

class TestInfrastructure(unittest.TestCase):
    """Basic smoke tests to confirm the stack is healthy before running deeper tests."""

    def test_backend_health_endpoint(self) -> None:
        """GET /health returns status=ok."""
        import urllib.request as _urllib_req
        with _urllib_req.urlopen("http://localhost:8000/health", timeout=10) as resp:  # nosec B310
            body = json.loads(resp.read().decode())
        self.assertEqual(body.get("status"), "ok")

    def test_api_root_via_proxy(self) -> None:
        """GET /api/health via nginx proxy returns status=ok."""
        import urllib.request as _urllib_req
        with _urllib_req.urlopen("http://localhost/api/health", timeout=10) as resp:  # nosec B310
            body = json.loads(resp.read().decode())
        self.assertEqual(body.get("status"), "ok")

    def test_frontend_serves_html(self) -> None:
        """GET / returns HTML containing 'SalarySafe'."""
        import urllib.request as _urllib_req
        with _urllib_req.urlopen("http://localhost/", timeout=10) as resp:  # nosec B310
            html = resp.read().decode()
        self.assertIn("SalarySafe", html)


if __name__ == "__main__":
    unittest.main(verbosity=2)
