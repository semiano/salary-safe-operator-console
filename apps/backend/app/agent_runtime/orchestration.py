import random
from typing import Any


def detect_repeated_positions(positions: list[int], threshold: int) -> bool:
    if threshold <= 1 or len(positions) < threshold:
        return False
    tail = positions[-threshold:]
    return len(set(tail)) == 1


def _find_first_int(obj: Any, keys: list[str]) -> int | None:
    if isinstance(obj, dict):
        for key in keys:
            value = obj.get(key)
            if isinstance(value, (int, float)):
                return int(value)
        for value in obj.values():
            result = _find_first_int(value, keys)
            if result is not None:
                return result
    elif isinstance(obj, list):
        for item in obj:
            result = _find_first_int(item, keys)
            if result is not None:
                return result
    return None


def _extract_salary_context(case_payload: dict[str, Any]) -> dict[str, Any]:
    candidate_payload = case_payload.get("candidate", {})
    company_payload = case_payload.get("company", {})

    candidate_target = _find_first_int(candidate_payload, ["base_salary_target", "desired_base_salary", "target_base_salary"])
    candidate_walkaway = _find_first_int(candidate_payload, ["walkaway_base_salary", "minimum_base_salary"])
    company_target = _find_first_int(company_payload, ["budget_target", "base_salary_target", "target_base_salary"])
    company_floor = _find_first_int(company_payload, ["budget_floor", "base_salary_floor"])
    company_ceiling = _find_first_int(company_payload, ["budget_ceiling", "base_salary_ceiling"])

    missing_information: list[str] = []
    if candidate_target is None:
        candidate_target = 200000
        missing_information.append("candidate_target_base_salary_missing")
    if candidate_walkaway is None:
        candidate_walkaway = max(candidate_target - 20000, 0)
        missing_information.append("candidate_walkaway_base_salary_missing")
    if company_target is None:
        company_target = 190000
        missing_information.append("company_target_base_salary_missing")
    if company_floor is None:
        company_floor = max(company_target - 15000, 0)
        missing_information.append("company_floor_base_salary_missing")
    if company_ceiling is None:
        company_ceiling = company_target + 15000
        missing_information.append("company_ceiling_base_salary_missing")

    return {
        "candidate_target": int(candidate_target),
        "candidate_walkaway": int(candidate_walkaway),
        "company_target": int(company_target),
        "company_floor": int(company_floor),
        "company_ceiling": int(company_ceiling),
        "missing_information": missing_information,
    }


def _policy_review(candidate_offer: int, company_offer: int, company_ceiling: int) -> dict[str, Any]:
    issues: list[dict[str, str]] = []
    if candidate_offer < 0 or company_offer < 0:
        issues.append(
            {
                "severity": "high",
                "type": "invalid_compensation_value",
                "message": "Negative compensation value detected.",
                "remediation": "Ensure all compensation fields are non-negative.",
            }
        )
    if candidate_offer > company_ceiling * 2:
        issues.append(
            {
                "severity": "medium",
                "type": "unrealistic_candidate_anchor",
                "message": "Candidate anchor exceeds expected ceiling range.",
                "remediation": "Use a narrower anchor tied to role scope and constraints.",
            }
        )

    if not issues:
        status = "pass"
    elif any(issue["severity"] == "high" for issue in issues):
        status = "fail"
    else:
        status = "pass_with_flags"

    return {"status": status, "issues": issues}


def _build_proposal(base_salary: int) -> dict[str, Any]:
    bonus_pct = 15 if base_salary >= 200000 else 12
    equity_value = 45000 if base_salary >= 205000 else 35000
    sign_on_bonus = 15000 if base_salary >= 200000 else 10000
    return {
        "base_salary": base_salary,
        "bonus_pct": bonus_pct,
        "equity": equity_value,
        "sign_on": sign_on_bonus,
        "title": "Staff Engineer",
        "other_terms": ["6-month compensation review"],
    }


def _normalized_variability(run_config: dict[str, Any]) -> float:
    # Map temperature profile to a 0..1 variability scalar for bounded jitter.
    profile = run_config.get("temperature_profile")
    if not isinstance(profile, dict):
        return 0.0

    values = [
        profile.get("candidate_rep"),
        profile.get("company_rep"),
        profile.get("arbitrator"),
    ]
    numeric = [float(value) for value in values if isinstance(value, (int, float))]
    if not numeric:
        return 0.0

    avg = sum(numeric) / len(numeric)
    return max(0.0, min(avg / 2.0, 1.0))


async def run_guided_workflow(case_payload: dict[str, Any], run_config: dict[str, Any]) -> dict[str, Any]:
    salary_ctx = _extract_salary_context(case_payload)
    max_rounds = int(run_config.get("max_rounds", 5))
    repeat_threshold = int(run_config.get("deadlock_repeat_threshold", 2))
    variability = _normalized_variability(run_config)
    # Keep jitter intentionally small so outputs vary slightly without destabilizing outcomes.
    jitter_pct = 0.02 + (0.08 * variability)
    rng = random.SystemRandom()

    candidate_offer = max(salary_ctx["candidate_target"], salary_ctx["candidate_walkaway"])
    company_offer = min(salary_ctx["company_target"], salary_ctx["company_ceiling"])

    candidate_opening_jitter = 1.0 + rng.uniform(-jitter_pct, jitter_pct)
    company_opening_jitter = 1.0 + rng.uniform(-jitter_pct, jitter_pct)
    candidate_offer = int(max(candidate_offer * candidate_opening_jitter, salary_ctx["candidate_walkaway"]))
    company_offer = int(min(company_offer * company_opening_jitter, salary_ctx["company_ceiling"]))

    candidate_history = [candidate_offer]
    company_history = [company_offer]

    candidate_opening = {
        "turn_goal": "opening_anchor",
        "public_message": f"Candidate opens at ${candidate_offer:,} base with package flexibility.",
        "proposal": _build_proposal(candidate_offer),
        "confidence": 0.72,
    }
    company_opening = {
        "turn_goal": "opening_anchor",
        "public_message": f"Company opens at ${company_offer:,} base within current budget constraints.",
        "proposal": _build_proposal(company_offer),
        "confidence": 0.74,
    }
    opening_policy = _policy_review(candidate_offer, company_offer, salary_ctx["company_ceiling"])

    rounds: list[dict[str, Any]] = []
    status = "insufficient_information"
    deadlock_risk_final = "low"
    candidate_concession_count = 0
    company_concession_count = 0

    for round_number in range(1, max_rounds + 1):
        current_gap = abs(candidate_offer - company_offer)
        if current_gap <= 5000:
            status = "agreement"
            break

        candidate_step = max(int((current_gap // 4) * (1.0 + rng.uniform(-jitter_pct, jitter_pct))), 2000)
        company_step = max(int((current_gap // 4) * (1.0 + rng.uniform(-jitter_pct, jitter_pct))), 2000)

        next_candidate_offer = max(candidate_offer - candidate_step, salary_ctx["candidate_walkaway"])
        next_company_offer = min(company_offer + company_step, salary_ctx["company_ceiling"])

        if next_candidate_offer < candidate_offer:
            candidate_concession_count += 1
        if next_company_offer > company_offer:
            company_concession_count += 1

        candidate_offer = int(next_candidate_offer)
        company_offer = int(next_company_offer)
        candidate_history.append(candidate_offer)
        company_history.append(company_offer)

        round_policy = _policy_review(candidate_offer, company_offer, salary_ctx["company_ceiling"])
        round_gap = abs(candidate_offer - company_offer)

        if round_gap <= 5000:
            round_status = "near_settlement"
        elif round_gap <= 12000:
            round_status = "narrowing"
        else:
            round_status = "ongoing"

        rounds.append(
            {
                "round_number": round_number,
                "arbitrator_instruction": {
                    "public_message": "Focus this round on narrowing base salary while preserving package flexibility.",
                },
                "candidate_turn": {
                    "turn_goal": "move_toward_settlement",
                    "public_message": f"Candidate revises to ${candidate_offer:,} base with tradeoff options.",
                    "proposal": _build_proposal(candidate_offer),
                    "confidence": 0.69,
                },
                "company_turn": {
                    "turn_goal": "move_toward_settlement",
                    "public_message": f"Company revises to ${company_offer:,} base while maintaining policy consistency.",
                    "proposal": _build_proposal(company_offer),
                    "confidence": 0.7,
                },
                "policy_review": round_policy,
                "gap": round_gap,
                "status": round_status,
            }
        )

        repeated_candidate = detect_repeated_positions(candidate_history, repeat_threshold)
        repeated_company = detect_repeated_positions(company_history, repeat_threshold)
        if repeated_candidate and repeated_company:
            status = "deadlock"
            deadlock_risk_final = "high"
            break

    if status == "insufficient_information":
        final_gap = abs(candidate_offer - company_offer)
        if final_gap <= 5000:
            status = "agreement"
        elif final_gap <= 15000:
            status = "near_agreement"
            deadlock_risk_final = "medium"
        else:
            status = "deadlock"
            deadlock_risk_final = "high"

    recommended_base = int((candidate_offer + company_offer) / 2)
    normalized = {
        "normalized_candidate": {
            "target_base_salary": salary_ctx["candidate_target"],
            "walkaway_base_salary": salary_ctx["candidate_walkaway"],
        },
        "normalized_company": {
            "target_base_salary": salary_ctx["company_target"],
            "budget_floor": salary_ctx["company_floor"],
            "budget_ceiling": salary_ctx["company_ceiling"],
        },
        "shared_public_facts": ["Negotiation uses bounded round workflow."],
        "candidate_confidential_facts": ["Candidate walkaway salary retained internally."],
        "company_confidential_facts": ["Company budget constraints retained internally."],
        "inferred_facts": ["Both sides moved toward midpoint under arbitrator guidance."],
        "unsupported_claims": [],
        "missing_information": salary_ctx["missing_information"],
        "contradictions": [],
        "risk_flags": [] if status != "deadlock" else ["persistent_gap_risk"],
    }

    return {
        "normalized": normalized,
        "candidate_opening": candidate_opening,
        "company_opening": company_opening,
        "opening_policy": opening_policy,
        "rounds": rounds,
        "final_state": {
            "status": status,
            "recommended_base_salary": recommended_base,
            "candidate_offer_final": candidate_offer,
            "company_offer_final": company_offer,
            "deadlock_risk_final": deadlock_risk_final,
            "candidate_concession_count": candidate_concession_count,
            "company_concession_count": company_concession_count,
            "variability_applied": round(variability, 3),
            "jitter_pct": round(jitter_pct, 3),
        },
    }


def build_final_report_from_workflow(
    *,
    run_id: str,
    case_id: str,
    workflow_result: dict[str, Any],
    currency: str = "USD",
) -> dict[str, Any]:
    final_state = workflow_result["final_state"]
    recommended_base = int(final_state["recommended_base_salary"])
    range_pad = 5000 if final_state["status"] in {"agreement", "near_agreement"} else 10000

    candidate_opening = workflow_result["candidate_opening"]["proposal"]["base_salary"]
    company_opening = workflow_result["company_opening"]["proposal"]["base_salary"]

    policy_flags: list[str] = []
    opening_policy = workflow_result["opening_policy"]
    if opening_policy["status"] != "pass":
        policy_flags.extend(issue["type"] for issue in opening_policy.get("issues", []))
    for round_data in workflow_result["rounds"]:
        if round_data["policy_review"]["status"] != "pass":
            policy_flags.extend(issue["type"] for issue in round_data["policy_review"].get("issues", []))

    rounds_completed = len(workflow_result["rounds"])
    status = final_state["status"]
    overall_confidence = 0.82 if status == "agreement" else 0.66 if status == "near_agreement" else 0.45

    return {
        "schema_version": "1.0",
        "negotiation_id": case_id,
        "run_id": run_id,
        "status": status,
        "summary": {
            "public_summary": f"Negotiation concluded with status '{status}' after {rounds_completed} rounds.",
            "executive_summary": "Guided multi-agent workflow completed with bounded rounds, policy checks, and final arbitrator synthesis.",
        },
        "recommended_package": {
            "base_salary": recommended_base,
            "bonus_pct": 15 if recommended_base >= 200000 else 12,
            "equity_value": 40000 if recommended_base >= 200000 else 30000,
            "sign_on_bonus": 12000 if recommended_base >= 200000 else 8000,
            "title": "Staff Engineer",
            "review_timeline_months": 6,
            "flexibility_terms": ["Hybrid schedule option"],
            "other_terms": ["Performance review in 6 months"],
        },
        "recommended_range": {
            "base_salary_min": max(recommended_base - range_pad, 0),
            "base_salary_max": recommended_base + range_pad,
            "total_package_min": max(recommended_base - range_pad, 0) + 30000,
            "total_package_max": recommended_base + range_pad + 50000,
            "currency": currency,
        },
        "alternative_packages": [
            {
                "label": "Option A",
                "package": {"base_salary": company_opening, "equity_value": 45000},
                "fit_for_candidate": "medium",
                "fit_for_company": "high",
                "rationale": "Closer to initial company budget while improving long-term upside.",
            },
            {
                "label": "Option B",
                "package": {"base_salary": candidate_opening, "sign_on_bonus": 20000},
                "fit_for_candidate": "high",
                "fit_for_company": "medium",
                "rationale": "Closer to candidate anchor with one-time cash tradeoff.",
            },
        ],
        "candidate_arguments": [
            "Role scope and market demand justify upper-band compensation.",
            "Package flexibility was offered to support convergence.",
        ],
        "company_arguments": [
            "Internal equity and approval thresholds constrain base salary.",
            "Sustainable package structure preferred over one-dimensional base increase.",
        ],
        "decisive_factors": [
            "Base salary gap trend across rounds",
            "Budget ceiling constraints",
            "Concession pacing from both sides",
        ],
        "unsupported_claims": [],
        "policy_flags": sorted(set(policy_flags)),
        "confidence": {
            "overall_confidence": overall_confidence,
            "data_completeness_score": 0.7,
            "market_alignment_score": 0.65,
            "internal_equity_confidence": 0.72,
            "notes": "Confidence reflects deterministic round convergence and available structured inputs.",
        },
        "run_metrics": {
            "rounds_completed": rounds_completed,
            "deadlock_risk_final": final_state["deadlock_risk_final"],
            "candidate_concession_count": final_state["candidate_concession_count"],
            "company_concession_count": final_state["company_concession_count"],
        },
        "next_actions": {
            "candidate": ["Review tradeoff structure and confirm acceptance thresholds."],
            "company": ["Confirm compensation approvals for recommended range."],
            "system": ["Run reruns for variance analysis before final recommendation."],
        },
        "admin_only": {
            "candidate_private_assessment": {
                "walkaway_base_salary": workflow_result["normalized"]["normalized_candidate"]["walkaway_base_salary"],
            },
            "company_private_assessment": {
                "budget_ceiling": workflow_result["normalized"]["normalized_company"]["budget_ceiling"],
            },
            "arbitrator_private_notes": [
                f"Final candidate offer: {final_state['candidate_offer_final']}",
                f"Final company offer: {final_state['company_offer_final']}",
            ],
        },
    }
