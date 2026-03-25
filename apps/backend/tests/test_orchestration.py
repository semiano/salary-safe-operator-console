import asyncio
import unittest

from app.agent_runtime.orchestration import (
    build_final_report_from_workflow,
    detect_repeated_positions,
    run_guided_workflow,
)
from app.schemas.report import validate_final_report


class OrchestrationTests(unittest.TestCase):
    def test_detect_repeated_positions(self) -> None:
        self.assertTrue(detect_repeated_positions([100, 100, 100], threshold=2))
        self.assertFalse(detect_repeated_positions([100, 101, 100], threshold=2))

    def test_guided_workflow_and_final_report_validation(self) -> None:
        case_payload = {
            "case_id": "test-case",
            "candidate": {
                "public_payload": {"desired_compensation": {"base_salary_target": 210000}},
                "confidential_payload": {"walkaway_base_salary": 190000},
            },
            "company": {
                "public_payload": {"budget_context": "structured"},
                "confidential_payload": {
                    "budget_floor": 180000,
                    "budget_target": 195000,
                    "budget_ceiling": 205000,
                },
            },
        }
        run_config = {
            "max_rounds": 5,
            "deadlock_repeat_threshold": 2,
        }

        workflow_result = asyncio.run(run_guided_workflow(case_payload, run_config))

        self.assertIn("normalized", workflow_result)
        self.assertIn("rounds", workflow_result)
        self.assertIn("final_state", workflow_result)
        self.assertLessEqual(len(workflow_result["rounds"]), run_config["max_rounds"])

        report = build_final_report_from_workflow(
            run_id="run-1",
            case_id="case-1",
            workflow_result=workflow_result,
            currency="USD",
        )
        validated = validate_final_report(report)
        self.assertEqual(validated.schema_version, "1.0")
        self.assertEqual(validated.run_id, "run-1")


if __name__ == "__main__":
    unittest.main()
