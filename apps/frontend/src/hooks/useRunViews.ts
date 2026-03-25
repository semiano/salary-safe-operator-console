import { useQuery } from "@tanstack/react-query";

import { apiGet } from "../api/client";
import type { FinalReport, RunSummary } from "../types/api";

export function useRunDetail(runId: string) {
  return useQuery({
    queryKey: ["run-detail", runId],
    queryFn: () => apiGet<RunSummary>(`/runs/${runId}`),
    enabled: Boolean(runId),
  });
}

export function useRunReport(runId: string) {
  return useQuery({
    queryKey: ["run-report", runId],
    queryFn: () => apiGet<FinalReport>(`/runs/${runId}/report`),
    enabled: Boolean(runId),
  });
}

export function useCaseRuns(caseId: string) {
  return useQuery({
    queryKey: ["case-runs", caseId],
    queryFn: () => apiGet<RunSummary[]>(`/cases/${caseId}/runs`),
    enabled: Boolean(caseId),
  });
}
