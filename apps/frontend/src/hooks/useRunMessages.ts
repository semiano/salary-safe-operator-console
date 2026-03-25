import { useQuery } from "@tanstack/react-query";

import { apiGet } from "../api/client";
import type { RunArtifact, RunMessage } from "../types/api";

export function useRunMessages(runId: string) {
  return useQuery({
    queryKey: ["run-messages", runId],
    queryFn: () => apiGet<RunMessage[]>(`/runs/${runId}/messages`),
    enabled: Boolean(runId),
    refetchInterval: 4000,
  });
}

export function useRunArtifacts(runId: string) {
  return useQuery({
    queryKey: ["run-artifacts", runId],
    queryFn: () => apiGet<RunArtifact[]>(`/runs/${runId}/artifacts`),
    enabled: Boolean(runId),
    refetchInterval: 4000,
  });
}
