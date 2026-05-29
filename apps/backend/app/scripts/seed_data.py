from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any
from uuid import UUID

from sqlalchemy import select

from app.core.security import get_password_hash
from app.core.db import SessionLocal
from app.core.settings import get_settings
from app.models.case import CaseParty, NegotiationCase, Phase1Bid
from app.models.config import RunConfig
from app.models.prompt import PromptSet
from app.models.tenant import Tenant
from app.models.user import User


@dataclass
class SeedCase:
    title: str
    description: str
    candidate_public: dict[str, Any]
    candidate_confidential: dict[str, Any]
    company_public: dict[str, Any]
    company_confidential: dict[str, Any]


PROMPT_SET_NAME = "SalarySafe System Baseline"
LEGACY_PROMPT_SET_NAME = "PoC Baseline"
PROMPT_SET_VERSION = "1.0"
RUN_CONFIG_NAME = "baseline_hybrid_guided"
SEED_TENANT_SLUG = "default"
SEED_TENANT_ALIAS = "Default Tenant"

SEEDED_NON_ADMIN_USERS: list[dict[str, str]] = [
    {
        "email": "operator1@salarysafe.dev",
        "password": "Operator1!salarysafe",
        "role": "operator",
    },
    {
        "email": "reviewer1@salarysafe.dev",
        "password": "Reviewer1!salarysafe",
        "role": "reviewer",
    },
    {
        "email": "support1@salarysafe.dev",
        "password": "Support1!salarysafe",
        "role": "support",
    },
]


def _prompt_file_path(filename: str) -> Path:
    return Path(__file__).resolve().parent.parent / "agent_runtime" / "prompts" / filename


def _load_seed_prompt_values() -> dict[str, str]:
    return {
        "intake_prompt": _prompt_file_path("intake_normalizer.txt").read_text(encoding="utf-8"),
        "candidate_rep_prompt": _prompt_file_path("candidate_rep.txt").read_text(encoding="utf-8"),
        "company_rep_prompt": _prompt_file_path("company_rep.txt").read_text(encoding="utf-8"),
        "policy_prompt": _prompt_file_path("policy_guard.txt").read_text(encoding="utf-8"),
        "arbitrator_prompt": _prompt_file_path("arbitrator.txt").read_text(encoding="utf-8"),
    }


def _build_seed_cases() -> list[SeedCase]:
    return [
        SeedCase(
            title="Easy agreement scenario",
            description="Candidate and company starts are already close.",
            candidate_public={"desired_compensation": {"base_salary_target": 198000}},
            candidate_confidential={"walkaway_base_salary": 188000},
            company_public={"budget_context": "Targeting market midpoint"},
            company_confidential={"budget_floor": 185000, "budget_target": 193000, "budget_ceiling": 200000},
        ),
        SeedCase(
            title="Moderate gap with tradeoffs",
            description="Gaps exist but equity/sign-on can close it.",
            candidate_public={"desired_compensation": {"base_salary_target": 215000}},
            candidate_confidential={"walkaway_base_salary": 195000},
            company_public={"budget_context": "Flexible package, tighter base"},
            company_confidential={"budget_floor": 185000, "budget_target": 195000, "budget_ceiling": 208000},
        ),
        SeedCase(
            title="Deadlock risk on base",
            description="Large base salary gap likely to trigger deadlock.",
            candidate_public={"desired_compensation": {"base_salary_target": 235000}},
            candidate_confidential={"walkaway_base_salary": 220000},
            company_public={"budget_context": "Strict budget controls"},
            company_confidential={"budget_floor": 170000, "budget_target": 182000, "budget_ceiling": 190000},
        ),
        SeedCase(
            title="Missing data inputs",
            description="Sparse candidate and company input coverage.",
            candidate_public={"strengths": ["systems design"]},
            candidate_confidential={},
            company_public={"role_scope": "Platform modernization"},
            company_confidential={},
        ),
        SeedCase(
            title="Policy flagged scenario",
            description="Inputs likely to trigger policy caution checks.",
            candidate_public={"desired_compensation": {"base_salary_target": 260000}},
            candidate_confidential={"walkaway_base_salary": 210000},
            company_public={"budget_context": "Band-constrained"},
            company_confidential={"budget_floor": 175000, "budget_target": 190000, "budget_ceiling": 205000},
        ),
    ]


def seed() -> None:
    session = SessionLocal()
    settings = get_settings()

    try:
        tenant = session.scalar(select(Tenant).where(Tenant.slug == SEED_TENANT_SLUG))
        if tenant is None:
            tenant = Tenant(alias=SEED_TENANT_ALIAS, slug=SEED_TENANT_SLUG, plan="free")
            session.add(tenant)
            session.flush()

        existing_admin = session.scalar(select(User).where(User.email == settings.admin_seed_email))
        if existing_admin is None:
            session.add(
                User(
                    email=settings.admin_seed_email,
                    password_hash=get_password_hash(settings.admin_seed_password),
                    role="admin",
                    tenant_id=tenant.id,
                )
            )
            session.flush()
        elif existing_admin.tenant_id != tenant.id:
            existing_admin.tenant_id = tenant.id

        seeded_users: list[dict[str, str]] = []
        for user_seed in SEEDED_NON_ADMIN_USERS:
            existing_user = session.scalar(select(User).where(User.email == user_seed["email"]))
            if existing_user is None:
                session.add(
                    User(
                        email=user_seed["email"],
                        password_hash=get_password_hash(user_seed["password"]),
                        role=user_seed["role"],
                        tenant_id=tenant.id,
                    )
                )
                seeded_users.append(user_seed)
            elif existing_user.tenant_id != tenant.id:
                existing_user.tenant_id = tenant.id

        prompt_values = _load_seed_prompt_values()

        prompt_set = session.scalar(
            select(PromptSet).where(PromptSet.name == PROMPT_SET_NAME).where(PromptSet.version == PROMPT_SET_VERSION)
        )
        if prompt_set is None:
            prompt_set = session.scalar(
                select(PromptSet)
                .where(PromptSet.name == LEGACY_PROMPT_SET_NAME)
                .where(PromptSet.version == PROMPT_SET_VERSION)
            )

        if prompt_set is None:
            prompt_set = PromptSet(
                name=PROMPT_SET_NAME,
                version=PROMPT_SET_VERSION,
                description="Production-ready baseline prompts for SalarySafe operator deployments",
                **prompt_values,
            )
            session.add(prompt_set)
            session.flush()
        else:
            prompt_set.name = PROMPT_SET_NAME
            prompt_set.version = PROMPT_SET_VERSION
            prompt_set.description = "Production-ready baseline prompts for SalarySafe operator deployments"
            prompt_set.intake_prompt = prompt_values["intake_prompt"]
            prompt_set.candidate_rep_prompt = prompt_values["candidate_rep_prompt"]
            prompt_set.company_rep_prompt = prompt_values["company_rep_prompt"]
            prompt_set.policy_prompt = prompt_values["policy_prompt"]
            prompt_set.arbitrator_prompt = prompt_values["arbitrator_prompt"]

        seed_cases = _build_seed_cases()
        created_case_ids: list[UUID] = []

        for seed_case in seed_cases:
            existing_case = session.scalar(
                select(NegotiationCase)
                .where(NegotiationCase.title == seed_case.title)
                .where(NegotiationCase.tenant_id == tenant.id)
            )
            if existing_case is not None:
                created_case_ids.append(existing_case.id)
                continue

            case = NegotiationCase(
                title=seed_case.title,
                description=seed_case.description,
                status="ready",
                jurisdiction="US",
                currency="USD",
                created_by=None,
                tenant_id=tenant.id,
            )
            session.add(case)
            session.flush()

            session.add_all(
                [
                    CaseParty(
                        case_id=case.id,
                        party_type="candidate",
                        public_payload=seed_case.candidate_public,
                        confidential_payload=seed_case.candidate_confidential,
                    ),
                    CaseParty(
                        case_id=case.id,
                        party_type="company",
                        public_payload=seed_case.company_public,
                        confidential_payload=seed_case.company_confidential,
                    ),
                ]
            )
            created_case_ids.append(case.id)

        baseline_provider = settings.llm_provider
        baseline_model_name = settings.openai_model if baseline_provider == "openai" else (
            settings.azure_openai_deployment_name or "gpt-4.1"
        )

        run_config_payload = {
            "provider": baseline_provider,
            "model_name": baseline_model_name,
            "temperature_profile": {
                "intake": 0.1,
                "candidate_rep": 0.55,
                "company_rep": 0.45,
                "policy_guard": 0.0,
                "arbitrator": 0.25,
            },
            "conversation_mode": "hybrid_guided_groupchat",
            "max_rounds": 5,
            "max_turns_per_round": 3,
            "enable_policy_guard": True,
            "enable_admin_trace": True,
            "require_structured_proposals": True,
            "allow_title_tradeoffs": True,
            "allow_equity_tradeoffs": True,
            "allow_review_cycle_tradeoffs": True,
            "deadlock_repeat_threshold": 2,
            "rerun_count": 3,
            "turn_delay_seconds": 1.5,
        }

        for case_id in created_case_ids:
            existing_config = session.scalar(
                select(RunConfig)
                .where(RunConfig.case_id == case_id)
                .where(RunConfig.name == RUN_CONFIG_NAME)
            )
            if existing_config is None:
                session.add(RunConfig(case_id=case_id, name=RUN_CONFIG_NAME, config_json=run_config_payload))
            else:
                existing_config.config_json = run_config_payload

        azure_presales_cases = list(
            session.scalars(select(NegotiationCase).where(NegotiationCase.title.ilike("%Microsoft Azure Pre-Sales%"))).all()
        )
        seeded_phase1_bid_count = 0
        if azure_presales_cases:
            bid_seed_rows = [
                {
                    "applicant_identifier": "alex.chen@example.com",
                    "salary_min": 172000,
                    "salary_max": 186000,
                    "insurance_importance_rank": 2,
                    "pto_importance_rank": 3,
                    "wfh_importance_rank": 2,
                },
                {
                    "applicant_identifier": "priya.narayanan@example.com",
                    "salary_min": 184000,
                    "salary_max": 202000,
                    "insurance_importance_rank": 1,
                    "pto_importance_rank": 2,
                    "wfh_importance_rank": 3,
                },
                {
                    "applicant_identifier": "miguel.santos@example.com",
                    "salary_min": 165000,
                    "salary_max": 178000,
                    "insurance_importance_rank": 3,
                    "pto_importance_rank": 2,
                    "wfh_importance_rank": 1,
                },
                {
                    "applicant_identifier": "sophia.reed@example.com",
                    "salary_min": 188000,
                    "salary_max": 210000,
                    "insurance_importance_rank": 2,
                    "pto_importance_rank": 1,
                    "wfh_importance_rank": 3,
                },
                {
                    "applicant_identifier": "jamal.wright@example.com",
                    "salary_min": 176000,
                    "salary_max": 192000,
                    "insurance_importance_rank": 1,
                    "pto_importance_rank": 3,
                    "wfh_importance_rank": 2,
                },
            ]

            for azure_presales_case in azure_presales_cases:
                for bid_row in bid_seed_rows:
                    existing_bid = session.scalar(
                        select(Phase1Bid)
                        .where(Phase1Bid.case_id == azure_presales_case.id)
                        .where(Phase1Bid.applicant_identifier == bid_row["applicant_identifier"])
                    )
                    if existing_bid is not None:
                        continue

                    session.add(
                        Phase1Bid(
                            case_id=azure_presales_case.id,
                            tenant_id=azure_presales_case.tenant_id,
                            applicant_identifier=bid_row["applicant_identifier"],
                            salary_min=bid_row["salary_min"],
                            salary_max=bid_row["salary_max"],
                            insurance_importance_rank=bid_row["insurance_importance_rank"],
                            pto_importance_rank=bid_row["pto_importance_rank"],
                            wfh_importance_rank=bid_row["wfh_importance_rank"],
                            submission_status="applicant_bid_submitted",
                            decision_status="pending",
                            decision_reason=None,
                            response_message="",
                        )
                    )
                    seeded_phase1_bid_count += 1

        session.commit()
        print("Seed completed.")
        print(f"Admin user: {settings.admin_seed_email}")
        if seeded_users:
            print("Non-admin users seeded this run:")
            for user_seed in seeded_users:
                print(f"- {user_seed['email']} / {user_seed['password']} ({user_seed['role']})")
        else:
            print("Non-admin users seeded this run: none (already existed)")
        print(f"Prompt set: {PROMPT_SET_NAME} v{PROMPT_SET_VERSION}")
        print(f"Cases available: {len(created_case_ids)}")
        print("Run configs created/verified: baseline_hybrid_guided per seeded case")
        print(f"Azure Pre-Sales phase 1 bids seeded this run: {seeded_phase1_bid_count}")
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


if __name__ == "__main__":
    seed()
