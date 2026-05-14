import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiGet, apiPost, apiPut } from "../api/client";
import type { CaseSummary } from "../types/api";

// ── Queries ───────────────────────────────────────────────────────────────────

export function useJobListings() {
  return useQuery({
    queryKey: ["job-listings"],
    queryFn: () => apiGet<CaseSummary[]>("/job-listings"),
  });
}

export function useJobListing(listingId: string | null) {
  return useQuery({
    queryKey: ["job-listing", listingId],
    queryFn: () => apiGet<CaseSummary>(`/job-listings/${listingId}`),
    enabled: Boolean(listingId),
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────────

type ListingCreatePayload = {
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

export function useCreateJobListing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ListingCreatePayload) => apiPost<CaseSummary>("/job-listings", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-listings"] });
      // Keep cases cache in sync for Under Construction pages that still use useCases
      queryClient.invalidateQueries({ queryKey: ["cases"] });
    },
  });
}

export function useCreateJobListingFromPrompt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: { prompt: string; jurisdiction?: string; currency?: string }) =>
      apiPost<CaseSummary>("/job-listings/from-prompt", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-listings"] });
      queryClient.invalidateQueries({ queryKey: ["cases"] });
    },
  });
}

export function usePreviewJobListingFromPrompt() {
  return useMutation({
    mutationFn: (payload: { prompt: string; jurisdiction?: string; currency?: string }) =>
      apiPost<ListingCreatePayload>("/job-listings/from-prompt/preview", payload),
  });
}

export function useRandomJobListingPrompt() {
  return useMutation({
    mutationFn: () => apiGet<{ prompt: string }>("/job-listings/from-prompt/random"),
  });
}

export function useUpdateJobListingGuidance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ listingId, operatorGuidance }: { listingId: string; operatorGuidance: string }) =>
      apiPut<CaseSummary>(`/job-listings/${listingId}`, { operator_guidance: operatorGuidance }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["job-listings"] });
      queryClient.invalidateQueries({ queryKey: ["cases"] });
    },
  });
}

export function useAutofillJobListing() {
  return useMutation({
    mutationFn: () => apiPost<Record<string, unknown>>("/job-listings/autofill-role", {}),
  });
}

export function useParseJobListingInvitations() {
  return useMutation({
    mutationFn: (text: string) =>
      apiPost<{ invitations: { name: string; email: string }[] }>("/job-listings/parse-invitations", { text }),
  });
}
