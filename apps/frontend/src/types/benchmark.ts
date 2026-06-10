// Benchmark domain types

export type BenchmarkDataset = {
  id: string;
  source_type: "internal_hibob" | "internal_other_hris" | "talentup" | "external_upload" | "other";
  dataset_name: string;
  original_filename: string;
  uploaded_by: string | null;
  row_count: number;
  column_mapping_json: Record<string, string> | null;
  status: "uploaded" | "mapped" | "indexed" | "failed";
  is_global: boolean;
  is_active: boolean;
  tenant_id: string;
  created_at: string;
  updated_at: string;
};

export type DatasetRowPreview = {
  id: string;
  normalized_title: string | null;
  normalized_level: string | null;
  department: string | null;
  location: string | null;
  currency: string | null;
  base_salary: number | null;
  total_compensation: number | null;
};

export type DatasetRowsResponse = {
  dataset_id: string;
  total: number;
  rows: DatasetRowPreview[];
};

export type BenchmarkMatch = {
  id: string;
  dataset_id: string | null;
  source_type: string;
  matched_title: string | null;
  matched_level: string | null;
  matched_location: string | null;
  base_salary: number | null;
  total_compensation: number | null;
  currency: string | null;
  percentile: string | null;
  citation_url: string | null;
  source_file_reference: string | null;
  confidence_score: number | null;
  match_rationale: string | null;
};

export type BenchmarkRecommendation = {
  id: string;
  job_listing_id: string;
  benchmark_run_id: string;
  recommended_base_min: number | null;
  recommended_base_mid: number | null;
  recommended_base_max: number | null;
  recommended_total_comp_min: number | null;
  recommended_total_comp_mid: number | null;
  recommended_total_comp_max: number | null;
  bonus_target: number | null;
  equity_guidance: string | null;
  currency: string | null;
  location_basis: string | null;
  confidence_score: number | null;
  rationale: string | null;
  caveats: string | null;
  source_references_json: string[] | null;
  applied_to_listing: boolean;
  applied_at: string | null;
  applied_by: string | null;
  created_at: string;
  updated_at: string;
};

export type BenchmarkRun = {
  id: string;
  job_listing_id: string;
  run_type: "internal" | "external" | "recommendation";
  status: "pending" | "running" | "completed" | "failed";
  created_by: string | null;
  completed_at: string | null;
  input_params_json: Record<string, unknown> | null;
  result_summary_json: Record<string, unknown> | null;
  confidence_score: number | null;
  created_at: string;
  updated_at: string;
  matches: BenchmarkMatch[];
  recommendation: BenchmarkRecommendation | null;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatResponse = {
  message: string;
  recommendation: BenchmarkRecommendation | null;
};
