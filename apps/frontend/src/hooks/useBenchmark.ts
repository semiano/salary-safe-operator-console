import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiDelete, apiGet, apiPatch, apiPost, apiUpload } from "../api/client";
import type {
  BenchmarkDataset,
  BenchmarkRecommendation,
  BenchmarkRun,
  ChatMessage,
  ChatResponse,
  DatasetRowsResponse,
} from "../types/benchmark";

// ── Datasets ──────────────────────────────────────────────────────────────────

export function useBenchmarkDatasets() {
  return useQuery({
    queryKey: ["benchmark-datasets"],
    queryFn: () => apiGet<BenchmarkDataset[]>("/benchmark/datasets"),
  });
}

export function useDatasetRows(datasetId: string | null, limit = 100, offset = 0) {
  return useQuery({
    queryKey: ["benchmark-dataset-rows", datasetId, limit, offset],
    queryFn: () =>
      apiGet<DatasetRowsResponse>(`/benchmark/datasets/${datasetId}/rows?limit=${limit}&offset=${offset}`),
    enabled: Boolean(datasetId),
  });
}

export function useUploadBenchmarkDataset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      file,
      sourceType,
      datasetName,
    }: {
      file: File;
      sourceType: string;
      datasetName?: string;
    }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("source_type", sourceType);
      if (datasetName) formData.append("dataset_name", datasetName);
      return apiUpload<BenchmarkDataset>("/benchmark/datasets", formData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["benchmark-datasets"] });
    },
  });
}

export function useUpdateDatasetMapping() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ datasetId, mapping }: { datasetId: string; mapping: Record<string, string> }) =>
      apiPatch<BenchmarkDataset>(`/benchmark/datasets/${datasetId}/mapping`, { mapping }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["benchmark-datasets"] });
    },
  });
}

export function useDeactivateDataset() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (datasetId: string) => apiDelete(`/benchmark/datasets/${datasetId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["benchmark-datasets"] });
    },
  });
}

// ── Benchmark runs ────────────────────────────────────────────────────────────

export function useBenchmarkRuns(listingId: string | null) {
  return useQuery({
    queryKey: ["benchmark-runs", listingId],
    queryFn: () => apiGet<BenchmarkRun[]>(`/benchmark/runs?listing_id=${listingId}`),
    enabled: Boolean(listingId),
  });
}

export function useBenchmarkRun(runId: string | null) {
  return useQuery({
    queryKey: ["benchmark-run", runId],
    queryFn: () => apiGet<BenchmarkRun>(`/benchmark/runs/${runId}`),
    enabled: Boolean(runId),
  });
}

export function useRunInternalBenchmark() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      job_listing_id: string;
      dataset_ids: string[];
      minimum_cohort?: number;
      suppress_exact_below_cohort?: boolean;
    }) => apiPost<BenchmarkRun>("/benchmark/runs/internal", payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["benchmark-runs", data.job_listing_id] });
    },
  });
}

export function useRunExternalBenchmark() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      job_listing_id: string;
      sources?: string[];
      dataset_ids?: string[];
      search_params?: Record<string, unknown>;
    }) => apiPost<BenchmarkRun>("/benchmark/runs/external", payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["benchmark-runs", data.job_listing_id] });
    },
  });
}

// ── Recommendation chat ───────────────────────────────────────────────────────

export function useBenchmarkChat() {
  return useMutation({
    mutationFn: (payload: {
      job_listing_id: string;
      run_ids: string[];
      messages: ChatMessage[];
    }) => apiPost<ChatResponse>("/benchmark/chat", payload),
  });
}

// ── Apply recommendation ──────────────────────────────────────────────────────

export function useApplyRecommendation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (recommendationId: string) =>
      apiPost<BenchmarkRecommendation>(`/benchmark/recommendations/${recommendationId}/apply`, {
        confirm: true,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["job-listing", data.job_listing_id] });
      queryClient.invalidateQueries({ queryKey: ["benchmark-runs", data.job_listing_id] });
    },
  });
}
