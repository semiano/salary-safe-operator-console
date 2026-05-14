export type CaseSummary = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  jurisdiction: string | null;
  currency: string;
  operator_guidance: string;
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

export type PromptSetSummary = {
  id: string;
  name: string;
  version: string;
  description: string | null;
  candidate_rep_prompt: string;
  company_rep_prompt: string;
  arbitrator_prompt: string;
  intake_prompt: string;
  policy_prompt: string;
  created_at: string;
  updated_at: string;
};

export type Phase1Bid = {
  id: string;
  case_id: string;
  token: string;
  applicant_identifier: string;
  candidate_email: string | null;
  candidate_name: string | null;
  is_invitation: boolean;
  invitation_code: string | null;
  salary_min: number;
  salary_max: number;
  insurance_importance_rank: number;
  pto_importance_rank: number;
  wfh_importance_rank: number;
  submission_status: "invitation_pending" | "applicant_bid_submitted" | "response_sent";
  decision_status: "pending" | "accepted" | "rejected";
  decision_reason: string | null;
  response_message: string;
  received_at: string;
  sent_at: string | null;
  candidate_submitted_at: string | null;
  created_at: string;
  updated_at: string;
};

export type BidStats = {
  invitations_sent: number;
  bids_received: number;
};

export type PublicBidLookup = {
  ok: boolean;
  already_submitted: boolean;
  requires_code: boolean;
  candidate_name: string | null;
  job_title: string;
  company_description: string | null;
  work_arrangement: string | null;
  location: string | null;
  currency: string;
  benefits: string[];
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
