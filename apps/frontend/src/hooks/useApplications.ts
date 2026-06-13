import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiGet, apiPost, apiPut } from "../api/client";
import type { Phase1Bid } from "../types/api";

type BulkNudgeResult = {
  requested_count: number;
  nudged_count: number;
  skipped_count: number;
  nudged_application_ids: string[];
};

// ── Query all applications (global list) ──────────────────────────────────────
export function useAllApplications() {
  return useQuery({
    queryKey: ["applications"],
    queryFn: () => apiGet<Phase1Bid[]>("/applications"),
  });
}

// ── Query applications for a specific job listing ─────────────────────────────
export function useListingApplications(listingId: string | null) {
  return useQuery({
    queryKey: ["listing-applications", listingId],
    queryFn: () => apiGet<Phase1Bid[]>(`/job-listings/${listingId}/applications`),
    enabled: Boolean(listingId),
  });
}

// ── Update application decision ───────────────────────────────────────────────
export function useUpdateApplicationDecision() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      applicationId,
      decision_status,
      decision_reason,
      response_message,
    }: {
      applicationId: string;
      decision_status: "accepted" | "rejected";
      decision_reason?: string;
      response_message?: string;
    }) =>
      apiPut<Phase1Bid>(`/applications/${applicationId}/decision`, {
        decision_status,
        decision_reason: decision_reason ?? null,
        response_message,
      }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      queryClient.invalidateQueries({ queryKey: ["listing-applications", updated.case_id] });
      queryClient.invalidateQueries({ queryKey: ["phase1-bid-detail", updated.id] });
    },
  });
}

// ── Update application response message ──────────────────────────────────────
export function useUpdateApplicationResponseMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ applicationId, response_message }: { applicationId: string; response_message: string }) =>
      apiPut<Phase1Bid>(`/applications/${applicationId}/response-message`, { response_message }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      queryClient.invalidateQueries({ queryKey: ["listing-applications", updated.case_id] });
    },
  });
}

// ── Send application response ─────────────────────────────────────────────────
export function useSendApplicationResponse() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (applicationId: string) =>
      apiPost<Phase1Bid>(`/applications/${applicationId}/send-response`, {}),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      queryClient.invalidateQueries({ queryKey: ["listing-applications", updated.case_id] });
      queryClient.invalidateQueries({ queryKey: ["phase1-bid-detail", updated.id] });
    },
  });
}

// ── Random invite for a listing ───────────────────────────────────────────────
export function useRandomInviteForListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (listingId: string) =>
      apiPost<Phase1Bid>(`/job-listings/${listingId}/applications/random-invite`, {}),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["listing-applications", created.case_id] });
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      queryClient.invalidateQueries({ queryKey: ["bid-stats", created.case_id] });
    },
  });
}

// ── AI Auto-respond (admin only) ──────────────────────────────────────────────
export function useAiAutoRespond() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (applicationId: string) =>
      apiPost<Phase1Bid>(`/applications/${applicationId}/ai-auto-respond`, {}),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
      queryClient.invalidateQueries({ queryKey: ["listing-applications", updated.case_id] });
      queryClient.invalidateQueries({ queryKey: ["phase1-bid-detail", updated.id] });
    },
  });
}

export function useNudgeAwaitingApplications() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (applicationIds: string[]) =>
      apiPost<BulkNudgeResult>("/applications/nudge-awaiting", {
        application_ids: applicationIds,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
    },
  });
}
