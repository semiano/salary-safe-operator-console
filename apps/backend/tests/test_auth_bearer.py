from datetime import datetime, timezone
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.db import get_db
from app.core.security import create_access_token
from app.main import app


class _FakeDB:
    def __init__(self, user: SimpleNamespace | None = None) -> None:
        self._user = user

    def get(self, model: type, obj_id):
        if self._user is None:
            return None
        if getattr(self._user, "id", None) != obj_id:
            return None
        return self._user


class BearerAuthTests(TestCase):
    def setUp(self) -> None:
        app.dependency_overrides.clear()
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    def test_login_returns_bearer_token_payload(self) -> None:
        fake_user = SimpleNamespace(id=uuid4())
        app.dependency_overrides[get_db] = lambda: _FakeDB()

        with patch("app.api.routes_auth.AuthService.authenticate", return_value=fake_user):
            response = self.client.post(
                "/api/auth/login",
                json={"email": "admin@salarysafe.dev", "password": "admin123!"},
            )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("access_token", body)
        self.assertTrue(isinstance(body["access_token"], str) and len(body["access_token"]) > 20)
        self.assertEqual(body["token_type"], "bearer")

    def test_protected_data_endpoint_requires_bearer_token(self) -> None:
        response = self.client.get("/api/cases/health")
        self.assertEqual(response.status_code, 401)

    def test_protected_data_endpoint_allows_valid_bearer_token(self) -> None:
        user_id = uuid4()
        fake_user = SimpleNamespace(
            id=user_id,
            email="admin@salarysafe.dev",
            role="admin",
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        app.dependency_overrides[get_db] = lambda: _FakeDB(user=fake_user)

        token = create_access_token(str(user_id), expires_delta_minutes=30)
        response = self.client.get(
            "/api/cases/health",
            headers={"Authorization": f"Bearer {token}"},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})


if __name__ == "__main__":
    import unittest

    unittest.main()
