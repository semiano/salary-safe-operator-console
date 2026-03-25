from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class SummaryModel(BaseModel):
    public_summary: str
    executive_summary: str


class RecommendedPackageModel(BaseModel):
    base_salary: int = Field(ge=0)
    bonus_pct: int = Field(ge=0)
    equity_value: int = Field(ge=0)
    sign_on_bonus: int = Field(ge=0)
    title: str
    review_timeline_months: int = Field(ge=0)
    flexibility_terms: list[str] = Field(default_factory=list)
    other_terms: list[str] = Field(default_factory=list)


class RecommendedRangeModel(BaseModel):
    base_salary_min: int = Field(ge=0)
    base_salary_max: int = Field(ge=0)
    total_package_min: int = Field(ge=0)
    total_package_max: int = Field(ge=0)
    currency: str = Field(default="USD")


class AlternativePackageModel(BaseModel):
    label: str
    package: dict[str, Any]
    fit_for_candidate: Literal["low", "medium", "high"]
    fit_for_company: Literal["low", "medium", "high"]
    rationale: str


class ConfidenceModel(BaseModel):
    overall_confidence: float = Field(ge=0.0, le=1.0)
    data_completeness_score: float = Field(ge=0.0, le=1.0)
    market_alignment_score: float = Field(ge=0.0, le=1.0)
    internal_equity_confidence: float = Field(ge=0.0, le=1.0)
    notes: str


class RunMetricsModel(BaseModel):
    rounds_completed: int = Field(ge=0)
    deadlock_risk_final: Literal["low", "medium", "high"]
    candidate_concession_count: int = Field(ge=0)
    company_concession_count: int = Field(ge=0)


class NextActionsModel(BaseModel):
    candidate: list[str] = Field(default_factory=list)
    company: list[str] = Field(default_factory=list)
    system: list[str] = Field(default_factory=list)


class AdminOnlyModel(BaseModel):
    candidate_private_assessment: dict[str, Any] = Field(default_factory=dict)
    company_private_assessment: dict[str, Any] = Field(default_factory=dict)
    arbitrator_private_notes: list[str] = Field(default_factory=list)


class FinalNegotiationReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: str = Field(default="1.0")
    negotiation_id: str
    run_id: str
    status: Literal["agreement", "near_agreement", "deadlock", "insufficient_information"]
    summary: SummaryModel
    recommended_package: RecommendedPackageModel
    recommended_range: RecommendedRangeModel
    alternative_packages: list[AlternativePackageModel] = Field(default_factory=list)
    candidate_arguments: list[str] = Field(default_factory=list)
    company_arguments: list[str] = Field(default_factory=list)
    decisive_factors: list[str] = Field(default_factory=list)
    unsupported_claims: list[str] = Field(default_factory=list)
    policy_flags: list[str] = Field(default_factory=list)
    confidence: ConfidenceModel
    run_metrics: RunMetricsModel
    next_actions: NextActionsModel
    admin_only: AdminOnlyModel


def validate_final_report(payload: dict[str, Any]) -> FinalNegotiationReport:
    return FinalNegotiationReport.model_validate(payload)
