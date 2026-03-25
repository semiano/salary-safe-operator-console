import json
import subprocess
import unittest
from urllib.request import urlopen


def _read_json(url: str) -> dict:
    with urlopen(url, timeout=10) as response:  # nosec B310 - local smoke validation endpoints
        payload = response.read().decode("utf-8")
    return json.loads(payload)


def _read_text(url: str) -> str:
    with urlopen(url, timeout=10) as response:  # nosec B310 - local smoke validation endpoints
        return response.read().decode("utf-8")


class LiveContainerTests(unittest.TestCase):
    def test_docker_compose_services_running(self) -> None:
        result = subprocess.run(
            ["docker", "compose", "ps", "--format", "json"],
            capture_output=True,
            text=True,
            check=True,
        )

        lines = [line for line in result.stdout.splitlines() if line.strip()]
        self.assertGreaterEqual(len(lines), 4)

        statuses = {}
        for line in lines:
            service = json.loads(line)
            statuses[service["Service"]] = service["State"]

        self.assertEqual(statuses.get("postgres"), "running")
        self.assertEqual(statuses.get("backend"), "running")
        self.assertEqual(statuses.get("frontend"), "running")
        self.assertEqual(statuses.get("nginx"), "running")

    def test_health_endpoints(self) -> None:
        backend_health = _read_json("http://localhost:8000/health")
        proxied_health = _read_json("http://localhost/api/health")

        self.assertEqual(backend_health.get("status"), "ok")
        self.assertEqual(proxied_health.get("status"), "ok")

    def test_frontend_root_served(self) -> None:
        html = _read_text("http://localhost/")
        self.assertIn("SalarySafe", html)


if __name__ == "__main__":
    unittest.main()
