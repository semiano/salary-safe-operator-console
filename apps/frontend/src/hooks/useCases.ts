import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiGet, apiPost, apiPut } from "../api/client";
import type { CaseSummary } from "../types/api";

type CaseCreatePayload = {
  title: string;
  description: string | null;
  status: string;
  jurisdiction: string;
  currency: string;
  candidate: {
    public_payload: Record<string, unknown>;
    confidential_payload: Record<string, unknown>;
  };
  company: {
    public_payload: Record<string, unknown>;
    confidential_payload: Record<string, unknown>;
  };
};

type CaseCreateFromPromptPayload = {
  prompt: string;
  jurisdiction?: string;
  currency?: string;
};

type CaseDraftPayload = CaseCreatePayload;

type RandomCasePromptResponse = {
  prompt: string;
};

type RunConfigCreatePayload = {
  caseId: string;
  provider: "openai" | "azure_openai";
  modelName: string;
};

export function useCases() {
  return useQuery({
    queryKey: ["cases"],
    queryFn: () => apiGet<CaseSummary[]>("/cases"),
  });
}

export function useCreateCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CaseCreatePayload) => apiPost<CaseSummary>("/cases", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cases"] });
    },
  });
}

export function useCreateCaseFromPrompt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CaseCreateFromPromptPayload) => apiPost<CaseSummary>("/cases/from-prompt", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cases"] });
    },
  });
}

export function usePreviewCaseFromPrompt() {
  return useMutation({
    mutationFn: (payload: CaseCreateFromPromptPayload) => apiPost<CaseDraftPayload>("/cases/from-prompt/preview", payload),
  });
}

export function useRandomCasePrompt() {
  return useMutation({
    mutationFn: () => apiGet<RandomCasePromptResponse>("/cases/from-prompt/random"),
  });
}

export function useUpdateCaseGuidance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ caseId, operatorGuidance }: { caseId: string; operatorGuidance: string }) =>
      apiPut<CaseSummary>(`/cases/${caseId}`, { operator_guidance: operatorGuidance }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cases"] });
    },
  });
}

export function useUpdateCaseStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ caseId, status }: { caseId: string; status: string }) =>
      apiPut<CaseSummary>(`/cases/${caseId}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cases"] });
    },
  });
}

export type RoleAutofillData = {
  job_title: string;
  category: string;
  work_arrangement: string;
  location: string;
  job_description: string;
  responsibilities: string[];
  currency: string;
  budget_floor: number;
  budget_ceiling: number;
  pto_days: number;
  wfh_days_per_week: number;
  health_insurance: boolean;
  retirement_401k: boolean;
  dental_vision: boolean;
  stock_options: boolean;
  invitations: Array<{ name: string; email: string }>;
};

export function useAutofillRole() {
  return useMutation({
    mutationFn: () => apiPost<RoleAutofillData>("/cases/autofill-role", {}),
  });
}

export type ParsedInvitation = { name: string; email: string };

export function useParseInvitations() {
  return useMutation({
    mutationFn: (text: string) =>
      apiPost<{ invitations: ParsedInvitation[] }>("/cases/parse-invitations", { text }),
  });
}

export function useCreateBaselineRunConfig() {
  return useMutation({
    mutationFn: ({ caseId, provider, modelName }: RunConfigCreatePayload) =>
      apiPost(`/configs?case_id=${caseId}`, {
        name: "baseline_hybrid_guided",
        config: {
          provider,
          model_name: modelName,
          temperature_profile: {
            intake: 0.1,
            candidate_rep: 0.55,
            company_rep: 0.45,
            policy_guard: 0.0,
            arbitrator: 0.25,
          },
          conversation_mode: "hybrid_guided_groupchat",
          max_rounds: 5,
          max_turns_per_round: 3,
          enable_policy_guard: true,
          enable_admin_trace: true,
          require_structured_proposals: true,
          allow_title_tradeoffs: true,
          allow_equity_tradeoffs: true,
          allow_review_cycle_tradeoffs: true,
          deadlock_repeat_threshold: 2,
          rerun_count: 3,
          turn_delay_seconds: 1.5,
        },
      }),
  });
}
