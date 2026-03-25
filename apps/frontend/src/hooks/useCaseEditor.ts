import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiGet, apiPost, apiPut } from "../api/client";

type CaseDetail = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  jurisdiction: string | null;
  currency: string;
  parties: Array<{
    party_type: "candidate" | "company";
    public_payload: Record<string, unknown>;
    confidential_payload: Record<string, unknown>;
  }>;
};

type PromptSet = {
  id: string;
  name: string;
  version: string;
};

type RunConfig = {
  id: string;
  case_id: string;
  name: string;
  config_json: Record<string, unknown>;
};

type CreateRunPayload = {
  run_config_id: string;
  prompt_set_id: string;
};

type RunResponse = {
  id: string;
};

type RunConfigCreatePayload = {
  provider: "openai" | "azure_openai";
  model_name: string;
};

export function useCaseDetail(caseId: string) {
  return useQuery({
    queryKey: ["case", caseId],
    queryFn: () => apiGet<CaseDetail>(`/cases/${caseId}`),
    enabled: Boolean(caseId),
  });
}

export function usePromptSets() {
  return useQuery({
    queryKey: ["prompt-sets"],
    queryFn: () => apiGet<PromptSet[]>("/prompts"),
  });
}

export function useRunConfigs(caseId: string) {
  return useQuery({
    queryKey: ["run-configs", caseId],
    queryFn: () => apiGet<RunConfig[]>(`/configs?case_id=${caseId}`),
    enabled: Boolean(caseId),
  });
}

export function useUpdateCase(caseId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: unknown) => apiPut<CaseDetail>(`/cases/${caseId}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["case", caseId] });
      queryClient.invalidateQueries({ queryKey: ["cases"] });
    },
  });
}

export function useCreateRun(caseId: string) {
  return useMutation({
    mutationFn: (payload: CreateRunPayload) => apiPost<RunResponse>(`/cases/${caseId}/runs`, payload),
  });
}

export function useCreateBaselineRunConfig(caseId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: RunConfigCreatePayload) =>
      apiPost(`/configs?case_id=${caseId}`, {
        name: "baseline_hybrid_guided",
        config: {
          provider: payload.provider,
          model_name: payload.model_name,
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["run-configs", caseId] });
    },
  });
}
