export type CaseSummary = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  jurisdiction: string | null;
  currency: string;
  created_at: string;
  updated_at: string;
  parties: Array<{
    party_type: "candidate" | "company";
    public_payload: Record<string, unknown>;
    confidential_payload: Record<string, unknown>;
  }>;
};

export type RunMessage = {
  id: string;
  run_id: string;
  phase: string;
  round_number: number;
  speaker_agent: string;
  visibility: string;
  message_type: string;
  content: string;
  structured_payload?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
};

export type RunArtifact = {
  id: string;
  run_id?: string;
  artifact_type: string;
  payload: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
};

export type RunSummary = {
  id: string;
  case_id: string;
  run_config_id?: string;
  prompt_set_id?: string;
  status: string;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at?: string;
  provider: string;
  model_name: string;
  orchestration_mode?: string;
  summary_json?: Record<string, unknown> | null;
  final_report_json?: Record<string, unknown> | null;
};

export type RunConfigSummary = {
  id: string;
  case_id: string;
  name: string;
  config_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type FinalReport = {
  schema_version: string;
  negotiation_id: string;
  run_id: string;
  status: "agreement" | "near_agreement" | "deadlock" | "insufficient_information";
  summary: {
    public_summary: string;
    executive_summary: string;
  };
  recommended_package: {
    base_salary: number;
    bonus_pct: number;
    equity_value: number;
    sign_on_bonus: number;
    title: string;
    review_timeline_months: number;
    flexibility_terms: string[];
    other_terms: string[];
  };
  recommended_range: {
    base_salary_min: number;
    base_salary_max: number;
    total_package_min: number;
    total_package_max: number;
    currency: string;
  };
  confidence: {
    overall_confidence: number;
    data_completeness_score: number;
    market_alignment_score: number;
    internal_equity_confidence: number;
    notes: string;
  };
  run_metrics: {
    rounds_completed: number;
    deadlock_risk_final: "low" | "medium" | "high";
    candidate_concession_count: number;
    company_concession_count: number;
  };
};
