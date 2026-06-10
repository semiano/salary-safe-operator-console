import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiDelete, apiGet, apiPost, apiPut } from "../api/client";
import type { BidStats, Phase1Bid } from "../types/api";

export type Phase1BidCreatePayload = {
  caseId: string;
  applicant_identifier: string;
  salary_min: number;
  salary_max: number;
  insurance_importance_rank: 1 | 2 | 3;
  pto_importance_rank: 1 | 2 | 3;
  wfh_importance_rank: 1 | 2 | 3;
};

type UpdateDecisionPayload = {
  bidId: string;
  decision_status: "accepted" | "rejected";
  decision_reason?: string;
  response_message?: string;
};

type UpdateResponseMessagePayload = {
  bidId: string;
  response_message: string;
};

type BulkDecisionResult = {
  processed_count: number;
  skipped_count: number;
  updated_bid_ids: string[];
};

type RandomGenerateResult = {
  created_count: number;
  created_bid_ids: string[];
};

export function usePhase1Bids(caseId: string | null) {
  return useQuery({
    queryKey: ["phase1-bids", caseId],
    queryFn: () => apiGet<Phase1Bid[]>(`/cases/${caseId}/phase1-bids`),
    enabled: Boolean(caseId),
  });
}

export function useBidDetail(bidId: string | null) {
  return useQuery({
    queryKey: ["phase1-bid-detail", bidId],
    queryFn: () => apiGet<Phase1Bid>(`/phase1-bids/${bidId}`),
    enabled: Boolean(bidId),
  });
}

type UpdateBidFieldsPayload = {
  bidId: string;
  caseId: string;
  candidate_name: string | null;
  candidate_email: string | null;
  salary_min: number;
  salary_max: number;
  insurance_importance_rank: 1 | 2 | 3;
  pto_importance_rank: 1 | 2 | 3;
  wfh_importance_rank: 1 | 2 | 3;
};

export function useUpdatePhase1BidFields() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateBidFieldsPayload) =>
      apiPut<Phase1Bid>(`/phase1-bids/${payload.bidId}`, {
        candidate_name: payload.candidate_name,
        candidate_email: payload.candidate_email,
        salary_min: payload.salary_min,
        salary_max: payload.salary_max,
        insurance_importance_rank: payload.insurance_importance_rank,
        pto_importance_rank: payload.pto_importance_rank,
        wfh_importance_rank: payload.wfh_importance_rank,
      }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["phase1-bid-detail", updated.id] });
      queryClient.invalidateQueries({ queryKey: ["phase1-bids", updated.case_id] });
    },
  });
}

export function useCreatePhase1Bid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: Phase1BidCreatePayload) =>
      apiPost<Phase1Bid>(`/cases/${payload.caseId}/phase1-bids`, {
        applicant_identifier: payload.applicant_identifier,
        salary_min: payload.salary_min,
        salary_max: payload.salary_max,
        insurance_importance_rank: payload.insurance_importance_rank,
        pto_importance_rank: payload.pto_importance_rank,
        wfh_importance_rank: payload.wfh_importance_rank,
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["phase1-bids", created.case_id] });
    },
  });
}

export function useUpdatePhase1BidDecision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateDecisionPayload) =>
      apiPut<Phase1Bid>(`/phase1-bids/${payload.bidId}/decision`, {
        decision_status: payload.decision_status,
        decision_reason: payload.decision_reason ?? null,
        response_message: payload.response_message,
      }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["phase1-bids", updated.case_id] });
    },
  });
}

export function useSavePhase1BidResponseMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateResponseMessagePayload) =>
      apiPut<Phase1Bid>(`/phase1-bids/${payload.bidId}/response-message`, {
        response_message: payload.response_message,
      }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["phase1-bids", updated.case_id] });
    },
  });
}

export function useSendPhase1BidResponse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bidId: string) => apiPost<Phase1Bid>(`/phase1-bids/${bidId}/send-response`, {}),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["phase1-bids", updated.case_id] });
    },
  });
}

export function useAiAutoRespondPhase1Bid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bidId: string) => apiPost<Phase1Bid>(`/applications/${bidId}/ai-auto-respond`, {}),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["phase1-bid-detail", updated.id] });
      queryClient.invalidateQueries({ queryKey: ["phase1-bids", updated.case_id] });
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      queryClient.invalidateQueries({ queryKey: ["listing-applications", updated.case_id] });
    },
  });
}

export function useBulkDecidePhase1Bids() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ caseId, operatorGuidance }: { caseId: string; operatorGuidance: string }) =>
      apiPost<BulkDecisionResult>(`/cases/${caseId}/phase1-bids/bulk-llm-decision`, {
        operator_guidance: operatorGuidance.trim(),
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["phase1-bids", variables.caseId] });
    },
  });
}

export type SimulatedBidPayload = {
  caseId: string;
  candidate_name: string;
  candidate_email: string;
  salary_min: number;
  salary_max: number;
  insurance_importance_rank: 1 | 2 | 3;
  pto_importance_rank: 1 | 2 | 3;
  wfh_importance_rank: 1 | 2 | 3;
};

export function useCreateSimulatedBid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SimulatedBidPayload) =>
      apiPost<Phase1Bid>(`/cases/${payload.caseId}/phase1-bids/simulate`, {
        candidate_name: payload.candidate_name,
        candidate_email: payload.candidate_email,
        salary_min: payload.salary_min,
        salary_max: payload.salary_max,
        insurance_importance_rank: payload.insurance_importance_rank,
        pto_importance_rank: payload.pto_importance_rank,
        wfh_importance_rank: payload.wfh_importance_rank,
      }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["phase1-bids", created.case_id] });
    },
  });
}

export function useRandomGeneratePhase1Bids() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ caseId, count, additionalGuidance }: { caseId: string; count?: number; additionalGuidance?: string }) =>
      apiPost<RandomGenerateResult>(`/cases/${caseId}/phase1-bids/random-generate`, {
        count: count ?? 5,
        additional_guidance: additionalGuidance?.trim() || null,
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["phase1-bids", variables.caseId] });
    },
  });
}

export type InvitePayload = { candidate_email: string; candidate_name?: string | null };

export function useGenerateRandomInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (caseId: string) =>
      apiPost<Phase1Bid>(`/cases/${caseId}/phase1-bids/random-invite`, {}),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["phase1-bids", created.case_id] });
      queryClient.invalidateQueries({ queryKey: ["bid-stats", created.case_id] });
    },
  });
}

export function useSendPhase1BidInvitations() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ caseId, invitations }: { caseId: string; invitations: InvitePayload[] }) =>
      apiPost<Phase1Bid[]>(`/cases/${caseId}/phase1-bids/invite`, { invitations }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["phase1-bids", variables.caseId] });
      queryClient.invalidateQueries({ queryKey: ["bid-stats", variables.caseId] });
    },
  });
}

export function useBidStats(caseId: string | null) {
  return useQuery({
    queryKey: ["bid-stats", caseId],
    queryFn: () => apiGet<BidStats>(`/cases/${caseId}/bid-stats`),
    enabled: Boolean(caseId),
  });
}

export function useResendInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bidId: string) => apiPost<Phase1Bid>(`/phase1-bids/${bidId}/resend-invitation`, {}),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["phase1-bid-detail", updated.id] });
      queryClient.invalidateQueries({ queryKey: ["phase1-bids", updated.case_id] });
    },
  });
}

export function useRevokeBid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ bidId, caseId: _caseId }: { bidId: string; caseId: string }) =>
      apiDelete(`/phase1-bids/${bidId}`),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["phase1-bids", variables.caseId] });
      queryClient.invalidateQueries({ queryKey: ["bid-stats", variables.caseId] });
    },
  });
}
