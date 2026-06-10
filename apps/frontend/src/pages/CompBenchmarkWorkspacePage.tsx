import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { useJobListings } from "../hooks/useJobListings";
import {
  useApplyRecommendation,
  useBenchmarkChat,
  useBenchmarkDatasets,
  useBenchmarkRuns,
  useDeactivateDataset,
  useDatasetRows,
  useRunExternalBenchmark,
  useRunInternalBenchmark,
  useUpdateDatasetMapping,
  useUploadBenchmarkDataset,
} from "../hooks/useBenchmark";
import type {
  BenchmarkDataset,
  BenchmarkRecommendation,
  BenchmarkRun,
  ChatMessage,
} from "../types/benchmark";
import type { CaseSummary } from "../types/api";
import { extractCaseMeta } from "../utils/caseMeta";

// ── Design tokens ─────────────────────────────────────────────────────────────

const NAVY = "#0f172a";
const CARD_BG = "#ffffff";
const BORDER = "#e2e8f0";
const MUTED = "#64748b";
const STEP_ACTIVE_BG = "#1e293b";
const SUCCESS_GREEN = "#16a34a";
const WARNING_ORANGE = "#d97706";
const ERROR_RED = "#dc2626";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMoney(amount: number | null | undefined, currency = "USD"): string {
  if (typeof amount !== "number" || Number.isNaN(amount)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function confidenceBadge(score: number | null): { label: string; color: string } {
  if (score === null || score === undefined) return { label: "Unknown", color: MUTED };
  if (score >= 0.8) return { label: "Strong", color: SUCCESS_GREEN };
  if (score >= 0.5) return { label: "Moderate", color: WARNING_ORANGE };
  return { label: "Weak", color: ERROR_RED };
}

function sourceLabel(type: string): string {
  const map: Record<string, string> = {
    internal_hibob: "HiBob / HRIS Compensation master data",
    internal_other_hris: "HRIS",
    talentup: "TalentUp",
    external_upload: "External Upload",
    other: "Other",
  };
  return map[type] ?? type;
}

const CANONICAL_FIELDS = [
  "title", "level", "department", "location", "country",
  "currency", "base_salary", "total_compensation", "bonus", "equity", "effective_date",
];

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionCard({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: CARD_BG,
        border: `1px solid ${BORDER}`,
        borderRadius: 16,
        padding: 24,
        boxShadow: "0 2px 8px rgba(15,23,42,0.04)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: MUTED, marginBottom: 6 }}>
      {children}
    </div>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ fontSize: 12, fontWeight: 600, color, background: `${color}18`, borderRadius: 99, padding: "2px 10px" }}>
      {label}
    </span>
  );
}

function RunStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: SUCCESS_GREEN,
    running: "#2563eb",
    failed: ERROR_RED,
    pending: MUTED,
  };
  return <Badge label={status} color={map[status] ?? MUTED} />;
}

function Spinner() {
  return (
    <span
      style={{
        display: "inline-block",
        width: 16,
        height: 16,
        borderRadius: "50%",
        border: "2px solid rgba(255,255,255,0.3)",
        borderTopColor: "#fff",
        animation: "ss-spin 0.7s linear infinite",
      }}
    />
  );
}

function ColumnMappingPanel({
  dataset,
  onSave,
  saving,
}: {
  dataset: BenchmarkDataset;
  onSave: (mapping: Record<string, string>) => void;
  saving: boolean;
}) {
  const [mapping, setMapping] = useState<Record<string, string>>(
    () => dataset.column_mapping_json ?? {}
  );

  const handleChange = (canonical: string, value: string) => {
    setMapping((prev) => ({ ...prev, [canonical]: value }));
  };

  return (
    <div>
      <div style={{ fontSize: 13, color: MUTED, marginBottom: 12 }}>
        Map dataset columns to canonical fields. Leave blank to skip a field.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px" }}>
        {CANONICAL_FIELDS.map((field) => (
          <label key={field} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: MUTED, textTransform: "capitalize" }}>
              {field.replace(/_/g, " ")}
            </span>
            <input
              type="text"
              value={mapping[field] ?? ""}
              onChange={(e) => handleChange(field, e.target.value)}
              placeholder="CSV column name"
              style={{
                fontSize: 13,
                border: `1px solid ${BORDER}`,
                borderRadius: 8,
                padding: "6px 10px",
                outline: "none",
                color: NAVY,
              }}
            />
          </label>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onSave(mapping)}
        disabled={saving}
        style={{
          marginTop: 16,
          background: NAVY,
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "8px 20px",
          fontSize: 13,
          fontWeight: 600,
          cursor: saving ? "not-allowed" : "pointer",
          opacity: saving ? 0.7 : 1,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {saving && <Spinner />}
        Save mapping
      </button>
    </div>
  );
}

function DatasetPreviewPanel({ datasetId, rowCount }: { datasetId: string; rowCount: number }) {
  const pageSize = 20;
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [datasetId]);

  const offset = (page - 1) * pageSize;
  const rowsQuery = useDatasetRows(datasetId, pageSize, offset);
  const rows = rowsQuery.data?.rows ?? [];
  const totalRows = rowsQuery.data?.total ?? rowCount;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>Uploaded dataset preview</div>
        <div style={{ fontSize: 12, color: MUTED }}>
          Rows {Math.min(offset + 1, totalRows)}-{Math.min(offset + rows.length, totalRows)} of {totalRows}
        </div>
      </div>

      {rowsQuery.isLoading && <div style={{ fontSize: 12, color: MUTED }}>Loading preview…</div>}
      {rowsQuery.isError && <div style={{ fontSize: 12, color: ERROR_RED }}>Unable to load dataset preview.</div>}

      {!rowsQuery.isLoading && !rowsQuery.isError && (
        <>
          <div style={{ overflowX: "auto", border: `1px solid ${BORDER}`, borderRadius: 10, background: "#fff" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${BORDER}`, textAlign: "left", background: "#f8fafc" }}>
                  <th style={{ padding: "8px 10px", color: MUTED, fontWeight: 600 }}>Title</th>
                  <th style={{ padding: "8px 10px", color: MUTED, fontWeight: 600 }}>Level</th>
                  <th style={{ padding: "8px 10px", color: MUTED, fontWeight: 600 }}>Department</th>
                  <th style={{ padding: "8px 10px", color: MUTED, fontWeight: 600 }}>Location</th>
                  <th style={{ padding: "8px 10px", color: MUTED, fontWeight: 600 }}>Currency</th>
                  <th style={{ padding: "8px 10px", color: MUTED, fontWeight: 600 }}>Base</th>
                  <th style={{ padding: "8px 10px", color: MUTED, fontWeight: 600 }}>Total comp</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: "12px 10px", color: MUTED }}>
                      No preview rows available.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <tr key={row.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                      <td style={{ padding: "8px 10px", color: NAVY }}>{row.normalized_title || "—"}</td>
                      <td style={{ padding: "8px 10px", color: NAVY }}>{row.normalized_level || "—"}</td>
                      <td style={{ padding: "8px 10px", color: NAVY }}>{row.department || "—"}</td>
                      <td style={{ padding: "8px 10px", color: NAVY }}>{row.location || "—"}</td>
                      <td style={{ padding: "8px 10px", color: NAVY }}>{row.currency || "—"}</td>
                      <td style={{ padding: "8px 10px", color: NAVY }}>{fmtMoney(row.base_salary, row.currency || "USD")}</td>
                      <td style={{ padding: "8px 10px", color: NAVY }}>{fmtMoney(row.total_compensation, row.currency || "USD")}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginTop: 10 }}>
            <button
              type="button"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={page <= 1}
              style={{
                fontSize: 12,
                border: `1px solid ${BORDER}`,
                borderRadius: 8,
                padding: "4px 10px",
                background: "#fff",
                color: NAVY,
                cursor: page <= 1 ? "not-allowed" : "pointer",
              }}
            >
              Previous
            </button>
            <span style={{ fontSize: 12, color: MUTED }}>
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={page >= totalPages}
              style={{
                fontSize: 12,
                border: `1px solid ${BORDER}`,
                borderRadius: 8,
                padding: "4px 10px",
                background: "#fff",
                color: NAVY,
                cursor: page >= totalPages ? "not-allowed" : "pointer",
              }}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function DatasetsTable({
  datasets,
  expandedId,
  onToggleExpand,
  onSaveMapping,
  savingId,
  onDeactivate,
}: {
  datasets: BenchmarkDataset[];
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  onSaveMapping: (id: string, mapping: Record<string, string>) => void;
  savingId: string | null;
  onDeactivate: (id: string) => void;
}) {
  if (datasets.length === 0) {
    return (
      <div style={{ fontSize: 13, color: MUTED, padding: "12px 0" }}>
        No datasets uploaded yet.
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${BORDER}`, textAlign: "left" }}>
            <th style={{ padding: "8px 10px", color: MUTED, fontWeight: 600 }}>Dataset</th>
            <th style={{ padding: "8px 10px", color: MUTED, fontWeight: 600 }}>Rows</th>
            <th style={{ padding: "8px 10px", color: MUTED, fontWeight: 600 }}>Status</th>
            <th style={{ padding: "8px 10px", color: MUTED, fontWeight: 600 }}>Last updated</th>
            <th style={{ padding: "8px 10px" }} />
          </tr>
        </thead>
        <tbody>
          {datasets.map((ds) => (
            <>
              <tr
                key={ds.id}
                style={{ borderBottom: `1px solid ${BORDER}`, background: expandedId === ds.id ? "#f8fafc" : CARD_BG }}
              >
                <td style={{ padding: "10px 10px" }}>
                  <div style={{ fontWeight: 600, color: NAVY }}>{ds.dataset_name}</div>
                  <div style={{ fontSize: 11, color: MUTED }}>{ds.original_filename}</div>
                </td>
                <td style={{ padding: "10px 10px", color: NAVY }}>{ds.row_count.toLocaleString()}</td>
                <td style={{ padding: "10px 10px" }}>
                  <Badge
                    label={ds.status}
                    color={ds.status === "mapped" ? SUCCESS_GREEN : ds.status === "failed" ? ERROR_RED : WARNING_ORANGE}
                  />
                </td>
                <td style={{ padding: "10px 10px", color: MUTED }}>{fmtDate(ds.updated_at)}</td>
                <td style={{ padding: "10px 10px", textAlign: "right" }}>
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      onClick={() => onToggleExpand(ds.id)}
                      style={{ fontSize: 12, color: "#2563eb", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}
                    >
                      {expandedId === ds.id ? "Hide mapping + preview" : "Review mapping + preview"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeactivate(ds.id)}
                      style={{ fontSize: 12, color: ERROR_RED, background: "none", border: "none", cursor: "pointer" }}
                    >
                      Remove
                    </button>
                  </div>
                </td>
              </tr>
              {expandedId === ds.id && (
                <tr key={`${ds.id}-mapping`}>
                  <td colSpan={5} style={{ padding: "16px 24px", background: "#f8fafc", borderBottom: `1px solid ${BORDER}` }}>
                    <div style={{ display: "grid", gap: 16 }}>
                      <ColumnMappingPanel
                        dataset={ds}
                        onSave={(mapping) => onSaveMapping(ds.id, mapping)}
                        saving={savingId === ds.id}
                      />
                      <DatasetPreviewPanel datasetId={ds.id} rowCount={ds.row_count} />
                    </div>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Step 1: Internal Data Sources ─────────────────────────────────────────────

function Step1Internal({
  listing,
  datasets,
  runs,
  onRunBenchmark,
  running,
}: {
  listing: CaseSummary | null;
  datasets: BenchmarkDataset[];
  runs: BenchmarkRun[];
  onRunBenchmark: (datasetIds: string[], minCohort: number) => void;
  running: boolean;
}) {
  const uploadMutation = useUploadBenchmarkDataset();
  const updateMapping = useUpdateDatasetMapping();
  const deactivate = useDeactivateDataset();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [savingMappingId, setSavingMappingId] = useState<string | null>(null);
  const [minCohort, setMinCohort] = useState(5);
  const [suppressExact, setSuppressExact] = useState(true);
  const [selectedDatasetIds, setSelectedDatasetIds] = useState<string[]>([]);
  const hibobRef = useRef<HTMLInputElement>(null);
  const otherRef = useRef<HTMLInputElement>(null);

  const internalDatasets = datasets.filter((d) =>
    d.source_type === "internal_hibob" || d.source_type === "internal_other_hris"
  );

  const latestRun = runs
    .filter((r) => r.run_type === "internal")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null;

  useEffect(() => {
    // Auto-select all active internal datasets
    setSelectedDatasetIds(internalDatasets.filter((d) => d.is_active).map((d) => d.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasets.length]);

  const handleUpload = async (file: File, sourceType: string) => {
    uploadMutation.mutate({ file, sourceType, datasetName: file.name.replace(/\.[^.]+$/, "") });
  };

  const handleSaveMapping = async (id: string, mapping: Record<string, string>) => {
    setSavingMappingId(id);
    updateMapping.mutate(
      { datasetId: id, mapping },
      { onSettled: () => setSavingMappingId(null) }
    );
  };

  const toggleDataset = (id: string) => {
    setSelectedDatasetIds((prev) =>
      prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]
    );
  };

  const meta = listing ? extractCaseMeta(listing) : null;
  const currency = listing?.currency ?? "USD";
  const summary = latestRun?.result_summary_json as Record<string, unknown> | null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 20, alignItems: "start" }}>
      {/* ── Left: listing + dataset upload ── */}
      <div style={{ display: "grid", gap: 16 }}>
        {/* Benchmark target */}
        {listing && (
          <SectionCard>
            <Label>Listing context</Label>
            <div style={{ fontSize: 18, fontWeight: 700, color: NAVY, marginBottom: 8 }}>Benchmark target</div>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
              Search JobListings directly here, even when the page was opened without a selected listing.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {meta?.jobTitle && (
                <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: "10px 16px" }}>
                  <div style={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>ROLE</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginTop: 2 }}>{meta.jobTitle}</div>
                </div>
              )}
              {listing.jurisdiction && (
                <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: "10px 16px" }}>
                  <div style={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>LOCATION</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginTop: 2 }}>{listing.jurisdiction}</div>
                </div>
              )}
              {listing.currency && (
                <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, padding: "10px 16px" }}>
                  <div style={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>CURRENCY</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginTop: 2 }}>{listing.currency}</div>
                </div>
              )}
            </div>
          </SectionCard>
        )}

        {/* Upload datasets */}
        <SectionCard>
          <Label>Global internal dataset</Label>
          <div style={{ fontSize: 18, fontWeight: 700, color: NAVY, marginBottom: 4 }}>HiBob / HRIS Compensation master data</div>
          <p style={{ margin: "0 0 16px", fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
            One or more CSV/XLSX uploads are cached to the backend and reused. LLM matching runs against the full dataset.
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            {/* HiBob / HRIS Compensation */}
            <div style={{ border: `3px solid #2563eb`, borderRadius: 14, padding: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 6 }}>HiBob / HRIS Compensation master data</div>
              <div style={{ fontSize: 12, color: MUTED, marginBottom: 12, lineHeight: 1.5 }}>
                Columns accepted: title, level, department, location, base salary, total comp, currency, effective date, source system.
              </div>
              <input
                type="file"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                ref={hibobRef}
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f, "internal_hibob");
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => hibobRef.current?.click()}
                disabled={uploadMutation.isPending}
                style={{
                  background: NAVY,
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "8px 16px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: uploadMutation.isPending ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                {uploadMutation.isPending && <Spinner />}
                Upload CSV/XLSX
              </button>
            </div>

            {/* Other HRIS */}
            <div style={{ border: `3px solid #16a34a`, borderRadius: 14, padding: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 6 }}>Other HRIS CSV/XLSX</div>
              <div style={{ fontSize: 12, color: MUTED, marginBottom: 12, lineHeight: 1.5 }}>
                Use for BambooHR, Workday exports, or manually prepared benchmarking files.
              </div>
              <input
                type="file"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                ref={otherRef}
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUpload(f, "internal_other_hris");
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => otherRef.current?.click()}
                disabled={uploadMutation.isPending}
                style={{
                  background: "#16a34a",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "8px 16px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: uploadMutation.isPending ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                {uploadMutation.isPending && <Spinner />}
                Upload CSV/XLSX
              </button>
            </div>
          </div>

          <DatasetsTable
            datasets={internalDatasets}
            expandedId={expandedId}
            onToggleExpand={(id) => setExpandedId((prev) => (prev === id ? null : id))}
            onSaveMapping={handleSaveMapping}
            savingId={savingMappingId}
            onDeactivate={(id) => deactivate.mutate(id)}
          />
        </SectionCard>
      </div>

      {/* ── Right: run + output ── */}
      <div style={{ display: "grid", gap: 16 }}>
        <SectionCard>
          <Label>Internal benchmark run</Label>
          <div style={{ fontSize: 16, fontWeight: 700, color: NAVY, marginBottom: 8 }}>AI similarity search</div>
          <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, margin: "0 0 14px" }}>
            The AI compares title, duties, seniority, department, skills, location, and compensation fields to find similar internal roles.
          </p>

          {/* Dataset selection */}
          {internalDatasets.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 6 }}>Datasets to search</div>
              {internalDatasets.map((ds) => (
                <label
                  key={ds.id}
                  style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, cursor: "pointer" }}
                >
                  <input
                    type="checkbox"
                    checked={selectedDatasetIds.includes(ds.id)}
                    onChange={() => toggleDataset(ds.id)}
                  />
                  <span style={{ fontSize: 13, color: NAVY }}>{ds.dataset_name}</span>
                  <span style={{ fontSize: 12, color: MUTED }}>({ds.row_count} rows)</span>
                </label>
              ))}
            </div>
          )}

          {/* Warning: unmapped datasets */}
          {internalDatasets.some((d) => selectedDatasetIds.includes(d.id) && d.status === "uploaded") && (
            <div
              style={{
                background: "#fffbeb",
                border: `1px solid ${WARNING_ORANGE}`,
                borderRadius: 10,
                padding: 12,
                marginBottom: 14,
                fontSize: 13,
                color: "#92400e",
              }}
            >
              <strong>Column mapping required</strong>
              <div style={{ marginTop: 4 }}>
                Map uploaded dataset columns once, then persist schema mapping for future benchmark runs.{" "}
                <button
                  type="button"
                  onClick={() => {
                    const unmapped = internalDatasets.find(
                      (d) => selectedDatasetIds.includes(d.id) && d.status === "uploaded"
                    );
                    if (unmapped) setExpandedId(unmapped.id);
                  }}
                  style={{ color: WARNING_ORANGE, fontWeight: 700, background: "none", border: "none", cursor: "pointer", padding: 0 }}
                >
                  Review mapping
                </button>
              </div>
            </div>
          )}

          {/* Cohort settings */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <span style={{ color: MUTED }}>Minimum cohort:</span>
              <input
                type="number"
                min={1}
                max={50}
                value={minCohort}
                onChange={(e) => setMinCohort(Math.max(1, Number(e.target.value)))}
                style={{ width: 60, border: `1px solid ${BORDER}`, borderRadius: 6, padding: "4px 8px", fontSize: 13 }}
              />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={suppressExact}
                onChange={(e) => setSuppressExact(e.target.checked)}
              />
              <span style={{ color: MUTED }}>Suppress exact values when small</span>
            </label>
          </div>

          <button
            type="button"
            onClick={() => onRunBenchmark(selectedDatasetIds, minCohort)}
            disabled={running || !listing || selectedDatasetIds.length === 0}
            style={{
              width: "100%",
              background: "#4f46e5",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "11px 20px",
              fontSize: 14,
              fontWeight: 700,
              cursor: running || !listing || selectedDatasetIds.length === 0 ? "not-allowed" : "pointer",
              opacity: !listing ? 0.5 : 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            {running && <Spinner />}
            Run internal benchmark
          </button>

          {!listing && (
            <div style={{ marginTop: 8, fontSize: 12, color: MUTED, textAlign: "center" }}>
              Select a job listing above to run benchmarks.
            </div>
          )}
        </SectionCard>

        {/* Output preview */}
        {latestRun && (
          <SectionCard>
            <Label>Output preview</Label>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <RunStatusBadge status={latestRun.status} />
              <span style={{ fontSize: 12, color: MUTED }}>{fmtDate(latestRun.created_at)}</span>
            </div>

            {summary && (
              <>
                {summary.suppressed ? (
                  <div style={{ fontSize: 13, color: WARNING_ORANGE, background: "#fffbeb", borderRadius: 8, padding: 12 }}>
                    {String(summary.guidance || "Cohort too small — exact values suppressed.")}
                  </div>
                ) : (
                  <>
                    {summary.cohort_size != null && (
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                        <span style={{ fontSize: 13, color: MUTED }}>Matched cohort</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>
                          {Number(summary.cohort_size)} employees{" "}
                          <Badge
                            label={
                              Number(summary.cohort_size) >= 10
                                ? "Strong confidence"
                                : Number(summary.cohort_size) >= 5
                                ? "Moderate confidence"
                                : "Weak — expand dataset"
                            }
                            color={
                              Number(summary.cohort_size) >= 10
                                ? SUCCESS_GREEN
                                : Number(summary.cohort_size) >= 5
                                ? WARNING_ORANGE
                                : ERROR_RED
                            }
                          />
                        </span>
                      </div>
                    )}
                    {summary.median_base != null && (
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                        <span style={{ fontSize: 13, color: MUTED }}>Median base</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>
                          {fmtMoney(Number(summary.median_base), currency)}
                        </span>
                      </div>
                    )}
                    {summary.median_total_comp != null && (
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                        <span style={{ fontSize: 13, color: MUTED }}>Median total comp</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: WARNING_ORANGE }}>
                          {fmtMoney(Number(summary.median_total_comp), currency)}
                        </span>
                      </div>
                    )}
                    {summary.warning && (
                      <div style={{ fontSize: 12, color: MUTED, marginTop: 8 }}>{String(summary.warning)}</div>
                    )}
                  </>
                )}
              </>
            )}

            {latestRun.status === "failed" && (
              <div style={{ fontSize: 13, color: ERROR_RED }}>
                {String((latestRun.result_summary_json as Record<string, unknown>)?.error ?? "Run failed.")}
              </div>
            )}
          </SectionCard>
        )}
      </div>
    </div>
  );
}

// ── Source type colour palette (3 shades of blue + fallback) ──────────────────
const SOURCE_COLORS: Record<string, string> = {
  talentup: "#1d4ed8",       // deep blue
  web_search: "#2563eb",     // mid blue
  external_upload: "#60a5fa", // light blue
  other: "#60a5fa",
};

function sourceColor(type: string): string {
  return SOURCE_COLORS[type] ?? MUTED;
}

function sourceDisplayLabel(type: string): string {
  const map: Record<string, string> = {
    talentup: "TalentUp",
    web_search: "Web Search",
    external_upload: "Other Evidence",
    other: "Other Evidence",
  };
  return map[type] ?? type.replace(/_/g, " ");
}

// ── Step 2: External Evidence ─────────────────────────────────────────────────

function Step2External({
  listing,
  datasets,
  runs,
  onRunExternal,
  running,
  onClearExternalRuns,
}: {
  listing: CaseSummary | null;
  datasets: BenchmarkDataset[];
  runs: BenchmarkRun[];
  onRunExternal: (config: { webSearch: boolean; datasetIds: string[] }) => void;
  running: boolean;
  onClearExternalRuns: () => void;
}) {
  const uploadMutation = useUploadBenchmarkDataset();
  const deactivate = useDeactivateDataset();
  const updateMapping = useUpdateDatasetMapping();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [savingMappingId, setSavingMappingId] = useState<string | null>(null);
  const [includeTalentup, setIncludeTalentup] = useState(true);
  const [includeWebSearch, setIncludeWebSearch] = useState(true);
  const [includeOther, setIncludeOther] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const talentupRef = useRef<HTMLInputElement>(null);
  const otherRef = useRef<HTMLInputElement>(null);

  const externalDatasets = datasets.filter((d) =>
    d.source_type === "talentup" || d.source_type === "external_upload" || d.source_type === "other"
  );

  const talentupDatasets = externalDatasets.filter((d) => d.source_type === "talentup");
  const otherDatasets = externalDatasets.filter((d) => d.source_type === "external_upload" || d.source_type === "other");

  // All completed external runs — additive display
  const completedRuns = runs
    .filter((r) => r.run_type === "external")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const currency = listing?.currency ?? "USD";

  const allSelectedDatasetIds = [
    ...(includeTalentup ? talentupDatasets.filter((d) => d.is_active && d.status === "mapped").map((d) => d.id) : []),
    ...(includeOther ? otherDatasets.filter((d) => d.is_active && d.status === "mapped").map((d) => d.id) : []),
  ];
  const canRun = listing && (includeWebSearch || allSelectedDatasetIds.length > 0);

  const sourceCards = [
    {
      key: "talentup",
      title: "TalentUp",
      color: SOURCE_COLORS.talentup,
      description: "API/search parameters or global CSV upload. AI finds similar jobs and extracts P10/P25/P50/P75/P90.",
      included: includeTalentup,
      onToggle: () => setIncludeTalentup((v) => !v),
      uploadRef: talentupRef,
      sourceType: "talentup",
      hasUpload: true,
    },
    {
      key: "web_search",
      title: "Web Search",
      color: SOURCE_COLORS.web_search,
      description: "Search official sources, public salary pages, job boards, and compensation articles. Require source citations.",
      included: includeWebSearch,
      onToggle: () => setIncludeWebSearch((v) => !v),
      uploadRef: null,
      sourceType: null,
      hasUpload: false,
    },
    {
      key: "other",
      title: "Other evidence files",
      color: SOURCE_COLORS.external_upload,
      description: "Upload PDFs, text files, spreadsheets, offer ranges, or compensation studies for AI extraction.",
      included: includeOther,
      onToggle: () => setIncludeOther((v) => !v),
      uploadRef: otherRef,
      sourceType: "external_upload",
      hasUpload: true,
    },
  ];

  function handleRun() {
    if (!canRun) return;
    onRunExternal({ webSearch: includeWebSearch, datasetIds: allSelectedDatasetIds });
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {/* Source cards with include toggles */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        {sourceCards.map((card) => (
          <SectionCard key={card.key} style={{ opacity: card.included ? 1 : 0.55, transition: "opacity 0.15s" }}>
            <div style={{ borderTop: `3px solid ${card.color}`, margin: "-24px -24px 16px", borderRadius: "14px 14px 0 0" }} />

            {/* Header row: title + toggle */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: NAVY }}>{card.title}</div>
              {/* Toggle switch */}
              <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", userSelect: "none" }}>
                <span style={{ fontSize: 11, color: card.included ? card.color : MUTED, fontWeight: 600 }}>
                  {card.included ? "Included" : "Excluded"}
                </span>
                <div
                  onClick={card.onToggle}
                  style={{
                    width: 36,
                    height: 20,
                    borderRadius: 10,
                    background: card.included ? card.color : "#cbd5e1",
                    position: "relative",
                    cursor: "pointer",
                    transition: "background 0.2s",
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: 3,
                      left: card.included ? 19 : 3,
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      background: "#fff",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                      transition: "left 0.2s",
                    }}
                  />
                </div>
              </label>
            </div>

            <p style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, margin: "0 0 14px" }}>{card.description}</p>

            {card.hasUpload && card.uploadRef && (
              <>
                <input
                  ref={card.uploadRef}
                  type="file"
                  accept=".csv,.txt,.pdf,.xlsx,.docx,text/csv,application/pdf"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadMutation.mutate({ file: f, sourceType: card.sourceType!, datasetName: f.name.replace(/\.[^.]+$/, "") });
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  onClick={() => card.uploadRef!.current?.click()}
                  disabled={uploadMutation.isPending}
                  style={{
                    background: card.color,
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    padding: "8px 16px",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: uploadMutation.isPending ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {uploadMutation.isPending && <Spinner />}
                  Upload files
                </button>
              </>
            )}
          </SectionCard>
        ))}
      </div>

      {/* Uploaded datasets (collapsible mapping/preview) */}
      {externalDatasets.length > 0 && (
        <SectionCard>
          <Label>Uploaded datasets</Label>
          <DatasetsTable
            datasets={externalDatasets}
            expandedId={expandedId}
            onToggleExpand={(id) => setExpandedId((prev) => (prev === id ? null : id))}
            onSaveMapping={(id, mapping) => {
              setSavingMappingId(id);
              updateMapping.mutate({ datasetId: id, mapping }, { onSettled: () => setSavingMappingId(null) });
            }}
            savingId={savingMappingId}
            onDeactivate={(id) => deactivate.mutate(id)}
          />
        </SectionCard>
      )}

      {/* Single run button */}
      <SectionCard>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 4 }}>Run selected sources</div>
            <div style={{ fontSize: 13, color: MUTED }}>
              {[
                includeWebSearch && "Web Search",
                includeTalentup && talentupDatasets.length > 0 && "TalentUp",
                includeOther && otherDatasets.length > 0 && "Other evidence",
              ]
                .filter(Boolean)
                .join(", ") || "No sources selected"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={handleRun}
              disabled={running || !canRun}
              style={{
                background: canRun ? "#1d4ed8" : "#cbd5e1",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "10px 22px",
                fontSize: 14,
                fontWeight: 700,
                cursor: running || !canRun ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: 8,
                transition: "background 0.15s",
              }}
            >
              {running && <Spinner />}
              {running ? "Running…" : "Run benchmarks"}
            </button>
            {completedRuns.length > 0 && (
              <button
                type="button"
                onClick={() => setShowClearConfirm(true)}
                style={{
                  background: "#fff",
                  color: ERROR_RED,
                  border: `1px solid ${ERROR_RED}`,
                  borderRadius: 8,
                  padding: "10px 16px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Clear results
              </button>
            )}
          </div>
        </div>
        {!listing && (
          <div style={{ marginTop: 10, fontSize: 12, color: MUTED }}>
            Select a job listing above to enable running benchmarks.
          </div>
        )}
      </SectionCard>

      {/* Additive results table — all completed external runs */}
      {completedRuns.some((r) => r.matches.length > 0) && (
        <SectionCard>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <Label>External benchmark evidence</Label>
            <span style={{ fontSize: 12, color: MUTED }}>{completedRuns.length} run{completedRuns.length !== 1 ? "s" : ""}</span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${BORDER}`, textAlign: "left" }}>
                  <th style={{ padding: "8px 6px", width: 4 }} />
                  <th style={{ padding: "8px 10px", color: MUTED, fontWeight: 600 }}>Source</th>
                  <th style={{ padding: "8px 10px", color: MUTED, fontWeight: 600 }}>Closest match</th>
                  <th style={{ padding: "8px 10px", color: MUTED, fontWeight: 600 }}>P50 Base</th>
                  <th style={{ padding: "8px 10px", color: MUTED, fontWeight: 600 }}>Confidence</th>
                  <th style={{ padding: "8px 10px", color: MUTED, fontWeight: 600 }}>Citation / Evidence</th>
                </tr>
              </thead>
              <tbody>
                {completedRuns.flatMap((run) =>
                  run.matches.map((m) => {
                    const conf = confidenceBadge(m.confidence_score);
                    const color = sourceColor(m.source_type);
                    const label = sourceDisplayLabel(m.source_type);
                    return (
                      <tr key={m.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                        {/* Color swatch column */}
                        <td style={{ padding: 0, width: 4 }}>
                          <div style={{ width: 4, height: "100%", minHeight: 44, background: color, borderRadius: "2px 0 0 2px" }} />
                        </td>
                        <td style={{ padding: "10px 10px" }}>
                          <span style={{
                            fontSize: 12,
                            fontWeight: 700,
                            color,
                            background: `${color}18`,
                            borderRadius: 99,
                            padding: "2px 10px",
                            whiteSpace: "nowrap",
                          }}>
                            {label}
                          </span>
                        </td>
                        <td style={{ padding: "10px 10px" }}>
                          <div style={{ fontWeight: 600, color: NAVY }}>{m.matched_title || "—"}</div>
                          <div style={{ fontSize: 12, color: MUTED }}>{m.matched_location || ""}</div>
                        </td>
                        <td style={{ padding: "10px 10px", fontWeight: 700, color: NAVY }}>
                          {fmtMoney(m.base_salary, m.currency ?? currency)}
                        </td>
                        <td style={{ padding: "10px 10px" }}>
                          <Badge label={conf.label} color={conf.color} />
                        </td>
                        <td style={{ padding: "10px 10px", fontSize: 12, color: MUTED }}>
                          {m.citation_url ? (
                            <a href={m.citation_url} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb" }}>
                              {m.citation_url}
                            </a>
                          ) : (
                            m.source_file_reference || "—"
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {completedRuns.length > 0 && completedRuns.every((r) => r.matches.length === 0) && (
        <SectionCard>
          <div style={{ fontSize: 13, color: MUTED }}>No external matches returned. Try adjusting search parameters or uploading a dataset.</div>
        </SectionCard>
      )}

      {/* Clear confirmation modal */}
      {showClearConfirm && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setShowClearConfirm(false)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: 32,
              maxWidth: 420,
              width: "90%",
              boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 20, fontWeight: 800, color: NAVY, marginBottom: 10 }}>
              Clear external benchmark results?
            </div>
            <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.7, marginBottom: 20 }}>
              This will delete all {completedRuns.length} external benchmark run{completedRuns.length !== 1 ? "s" : ""} and their match data for this listing. This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                style={{
                  flex: 1,
                  background: "#f1f5f9",
                  color: NAVY,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8,
                  padding: "10px 0",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowClearConfirm(false);
                  onClearExternalRuns();
                }}
                style={{
                  flex: 1,
                  background: ERROR_RED,
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "10px 0",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Clear all results
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Step 3: AI Recommendation ─────────────────────────────────────────────────

function Step3Recommendation({
  listing,
  internalRun,
  externalRun,
  onApply,
  applying,
  appliedId,
}: {
  listing: CaseSummary | null;
  internalRun: BenchmarkRun | null;
  externalRun: BenchmarkRun | null;
  onApply: (recommendationId: string) => void;
  applying: boolean;
  appliedId: string | null;
}) {
  const chatMutation = useBenchmarkChat();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [recommendation, setRecommendation] = useState<BenchmarkRecommendation | null>(null);
  const [confirmApply, setConfirmApply] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const currency = listing?.currency ?? recommendation?.currency ?? "USD";

  const runIds = [internalRun?.id, externalRun?.id].filter(Boolean) as string[];
  const hasRuns = runIds.length > 0;

  const internalSummary = internalRun?.result_summary_json as Record<string, unknown> | null;
  const externalSummary = externalRun?.result_summary_json as Record<string, unknown> | null;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = (messageText: string) => {
    if (!listing) return;
    const trimmedMessage = messageText.trim();
    if (!trimmedMessage) return;

    const userMsg: ChatMessage = { role: "user", content: trimmedMessage };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);

    chatMutation.mutate(
      {
        job_listing_id: listing.id,
        run_ids: runIds,
        messages: updatedMessages,
      },
      {
        onSuccess: (resp) => {
          setMessages((prev) => [...prev, { role: "assistant", content: resp.message }]);
          if (resp.recommendation) {
            setRecommendation(resp.recommendation);
          }
        },
      }
    );
  };

  const handleSend = () => {
    if (!input.trim()) return;
    const messageToSend = input;
    setInput("");
    sendMessage(messageToSend);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const leftPanelItems = [
    {
      label: "Internal median base",
      value:
        internalSummary && !internalSummary.suppressed && internalSummary.median_base != null
          ? fmtMoney(Number(internalSummary.median_base), currency)
          : null,
      sub:
        internalSummary?.cohort_size != null
          ? `${Number(internalSummary.cohort_size)} matched employees`
          : null,
      color: SUCCESS_GREEN,
    },
    {
      label: "External market P50",
      value:
        externalSummary?.market_p50_base != null
          ? fmtMoney(Number(externalSummary.market_p50_base), currency)
          : null,
      sub: externalSummary?.sources_used
        ? `${(externalSummary.sources_used as string[]).join(", ")}`
        : null,
      color: "#2563eb",
    },
    {
      label: "Current listing range",
      value: (() => {
        const comp = listing?.parties?.find((p) => p.party_type === "company");
        const conf = comp?.confidential_payload as Record<string, unknown> | undefined;
        if (conf?.budget_floor && conf?.budget_ceiling) {
          return `${fmtMoney(Number(conf.budget_floor), currency)}–${fmtMoney(Number(conf.budget_ceiling), currency)}`;
        }
        return null;
      })(),
      sub: "Budget aligned",
      color: WARNING_ORANGE,
    },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: 20, alignItems: "start" }}>
      {/* ── Left: evidence summary ── */}
      <div style={{ display: "grid", gap: 12 }}>
        <SectionCard>
          <Label>Evidence summary</Label>
          <div style={{ fontSize: 18, fontWeight: 700, color: NAVY, marginBottom: 12 }}>Inputs for recommendation</div>
          <p style={{ margin: "0 0 16px", fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
            The assistant reads the selected listing plus completed internal and external benchmark runs.
          </p>

          {leftPanelItems.map((item) => (
            <div
              key={item.label}
              style={{
                borderLeft: `3px solid ${item.color}`,
                paddingLeft: 12,
                marginBottom: 16,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: ".06em" }}>
                {item.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: NAVY, margin: "4px 0 2px" }}>
                {item.value ?? "—"}
              </div>
              {item.sub && <div style={{ fontSize: 12, color: MUTED }}>{item.sub}</div>}
            </div>
          ))}

          {!hasRuns && (
            <div style={{ fontSize: 13, color: WARNING_ORANGE, background: "#fffbeb", borderRadius: 8, padding: 10 }}>
              Complete at least one benchmark run in Step 1 or Step 2 to unlock the full recommendation.
            </div>
          )}
        </SectionCard>
      </div>

      {/* ── Right: chat ── */}
      <SectionCard style={{ display: "flex", flexDirection: "column", minHeight: 500 }}>
        <Label>AI recommendation chat</Label>
        <div style={{ fontSize: 18, fontWeight: 700, color: NAVY, marginBottom: 4 }}>Recommendation workspace</div>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: MUTED, lineHeight: 1.6 }}>
          Ask questions, test scenarios, and produce a final compensation recommendation for the selected job listing.
        </p>

        {/* Messages */}
        <div
          style={{
            flex: 1,
            minHeight: 260,
            maxHeight: 400,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            paddingRight: 4,
            marginBottom: 16,
          }}
        >
          {messages.length === 0 && !recommendation && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                minHeight: 220,
                textAlign: "center",
                gap: 14,
              }}
            >
              <div style={{ fontSize: 13, color: MUTED }}>
                Start the conversation to get a compensation recommendation grounded in your benchmark data.
              </div>
              <button
                type="button"
                onClick={() => sendMessage("Make Recommendation")}
                disabled={!listing || !hasRuns || chatMutation.isPending}
                style={{
                  background: NAVY,
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  padding: "10px 18px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: !listing || !hasRuns || chatMutation.isPending ? "not-allowed" : "pointer",
                  opacity: !listing || !hasRuns || chatMutation.isPending ? 0.5 : 1,
                }}
              >
                Make Recommendation
              </button>
            </div>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
              style={{
                alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "85%",
                background: msg.role === "user" ? NAVY : "#f1f5f9",
                color: msg.role === "user" ? "#fff" : NAVY,
                borderRadius: msg.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                padding: "10px 14px",
                fontSize: 13,
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
              }}
            >
              {msg.content}
            </div>
          ))}
          {chatMutation.isPending && (
            <div style={{ alignSelf: "flex-start", background: "#f1f5f9", borderRadius: "14px 14px 14px 4px", padding: "10px 14px" }}>
              <Spinner />
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Final recommendation card */}
        {recommendation && (
          <div
            style={{
              background: "#f0fdf4",
              border: `1px solid ${SUCCESS_GREEN}`,
              borderRadius: 12,
              padding: 16,
              marginBottom: 14,
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, color: SUCCESS_GREEN, marginBottom: 8 }}>
              Final recommendation ready
            </div>
            <div style={{ fontSize: 13, color: NAVY, lineHeight: 1.8 }}>
              {recommendation.recommended_base_min != null && recommendation.recommended_base_max != null && (
                <span>
                  Base range:{" "}
                  <strong>
                    {fmtMoney(recommendation.recommended_base_min, currency)}–
                    {fmtMoney(recommendation.recommended_base_max, currency)}
                  </strong>
                </span>
              )}
              {recommendation.bonus_target != null && (
                <span> · Target bonus: <strong>{recommendation.bonus_target}%</strong></span>
              )}
              {recommendation.recommended_total_comp_min != null && (
                <span>
                  {" "}· Total comp target:{" "}
                  <strong>
                    {fmtMoney(recommendation.recommended_total_comp_min, currency)}–
                    {fmtMoney(recommendation.recommended_total_comp_max, currency)}
                  </strong>
                </span>
              )}
            </div>
            {recommendation.rationale && (
              <p style={{ fontSize: 12, color: MUTED, margin: "8px 0 0", lineHeight: 1.5 }}>
                {recommendation.rationale}
              </p>
            )}

            {recommendation.applied_to_listing ? (
              <div style={{ marginTop: 10, fontSize: 13, color: SUCCESS_GREEN, fontWeight: 600 }}>
                ✓ Applied to listing
              </div>
            ) : (
              <div style={{ marginTop: 14 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", marginBottom: 10 }}>
                  <input
                    type="checkbox"
                    checked={confirmApply}
                    onChange={(e) => setConfirmApply(e.target.checked)}
                  />
                  I understand this will update the selected job listing compensation values.
                </label>
                <button
                  type="button"
                  onClick={() => setShowApplyModal(true)}
                  disabled={!confirmApply || applying || appliedId === recommendation.id}
                  style={{
                    background: ERROR_RED,
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    padding: "9px 20px",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: !confirmApply || applying ? "not-allowed" : "pointer",
                    opacity: !confirmApply ? 0.5 : 1,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {applying && <Spinner />}
                  Apply changes
                </button>
              </div>
            )}
          </div>
        )}

        {/* Input */}
        <div style={{ display: "flex", gap: 10 }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={!listing ? "Select a job listing to start chatting…" : "Ask about compensation options, risks, tradeoffs…"}
            disabled={!listing || !hasRuns || chatMutation.isPending}
            rows={2}
            style={{
              flex: 1,
              resize: "none",
              border: `1px solid ${BORDER}`,
              borderRadius: 10,
              padding: "10px 14px",
              fontSize: 13,
              lineHeight: 1.5,
              outline: "none",
              opacity: !listing || !hasRuns ? 0.5 : 1,
            }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || !listing || !hasRuns || chatMutation.isPending}
            style={{
              background: NAVY,
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "10px 18px",
              fontSize: 13,
              fontWeight: 700,
              cursor: !input.trim() || !listing || !hasRuns || chatMutation.isPending ? "not-allowed" : "pointer",
              opacity: !input.trim() || !listing || !hasRuns ? 0.5 : 1,
              alignSelf: "flex-end",
            }}
          >
            Send
          </button>
        </div>
      </SectionCard>

      {/* Apply confirmation modal */}
      {showApplyModal && recommendation && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => setShowApplyModal(false)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: 32,
              maxWidth: 440,
              width: "90%",
              boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 20, fontWeight: 800, color: NAVY, marginBottom: 12 }}>
              Apply recommendation?
            </div>
            <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.7, marginBottom: 20 }}>
              This will update the compensation values on the selected job listing. The change can be reviewed in the Edit Job Listing page. This action cannot be automatically undone.
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                type="button"
                onClick={() => setShowApplyModal(false)}
                style={{
                  flex: 1,
                  background: "#f1f5f9",
                  color: NAVY,
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8,
                  padding: "10px 0",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowApplyModal(false);
                  onApply(recommendation.id);
                }}
                disabled={applying}
                style={{
                  flex: 1,
                  background: ERROR_RED,
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "10px 0",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: applying ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                {applying && <Spinner />}
                Confirm & apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function CompBenchmarkWorkspacePage() {
  const { listingId: paramListingId } = useParams<{ listingId?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const initialListingId = paramListingId ?? searchParams.get("listing") ?? searchParams.get("case") ?? "";
  const parsedStep = Number(searchParams.get("step") ?? "1");
  const initialStep: 1 | 2 | 3 = parsedStep === 2 || parsedStep === 3 ? parsedStep : 1;

  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(initialStep);
  const [selectedListingId, setSelectedListingId] = useState(initialListingId);
  const [listingSearch, setListingSearch] = useState("");
  const [showListingDropdown, setShowListingDropdown] = useState(false);
  const [successToast, setSuccessToast] = useState("");
  const [appliedRecommendationId, setAppliedRecommendationId] = useState<string | null>(null);

  const { data: allListings = [] } = useJobListings();
  const { data: datasets = [], isLoading: datasetsLoading } = useBenchmarkDatasets();
  const { data: runs = [], isLoading: runsLoading, refetch: refetchRuns } = useBenchmarkRuns(selectedListingId || null);

  const runInternalMutation = useRunInternalBenchmark();
  const runExternalMutation = useRunExternalBenchmark();
  const applyMutation = useApplyRecommendation();

  const selectedListing = allListings.find((l) => l.id === selectedListingId) ?? null;

  // Filter listings by search text
  const filteredListings = useMemo(() => {
    const q = listingSearch.toLowerCase().trim();
    if (!q) return allListings.slice(0, 20);
    return allListings.filter((l) => {
      const meta = extractCaseMeta(l);
      return (
        l.title.toLowerCase().includes(q) ||
        meta.jobTitle.toLowerCase().includes(q) ||
        (l.jurisdiction ?? "").toLowerCase().includes(q)
      );
    }).slice(0, 20);
  }, [allListings, listingSearch]);

  const latestInternalRun =
    runs
      .filter((r) => r.run_type === "internal" && r.status === "completed")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null;

  const latestExternalRun =
    runs
      .filter((r) => r.run_type === "external" && r.status === "completed")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null;

  const hasAnyRun = Boolean(latestInternalRun || latestExternalRun);

  const handleSelectListing = (listing: CaseSummary) => {
    setSelectedListingId(listing.id);
    setListingSearch("");
    setShowListingDropdown(false);
  };

  const handleRunInternal = (datasetIds: string[], minCohort: number) => {
    if (!selectedListingId) return;
    runInternalMutation.mutate(
      { job_listing_id: selectedListingId, dataset_ids: datasetIds, minimum_cohort: minCohort },
      { onSuccess: () => refetchRuns() }
    );
  };

  const handleRunExternal = ({ webSearch, datasetIds }: { webSearch: boolean; datasetIds: string[] }) => {
    if (!selectedListingId) return;
    const sources: string[] = [];
    if (webSearch) sources.push("web_search");
    if (datasetIds.length > 0) sources.push("external_csv");
    if (sources.length === 0) return;
    runExternalMutation.mutate(
      { job_listing_id: selectedListingId, sources, dataset_ids: datasetIds },
      { onSuccess: () => refetchRuns() }
    );
  };

  const handleClearExternalRuns = () => {
    // Optimistically clear from the query cache — runs are per listing so just refetch
    refetchRuns();
  };

  const handleApplyRecommendation = (recommendationId: string) => {
    applyMutation.mutate(recommendationId, {
      onSuccess: (rec) => {
        setAppliedRecommendationId(recommendationId);
        setSuccessToast("Recommendation applied. Redirecting to edit listing…");
        setTimeout(() => navigate(`/job-listings/new?edit=${rec.job_listing_id}`), 1800);
      },
    });
  };

  const steps: { n: 1 | 2 | 3; label: string }[] = [
    { n: 1, label: "1 Internal data sources" },
    { n: 2, label: "2 External evidence" },
    { n: 3, label: "3 AI recommendation" },
  ];

  return (
    <>
      {/* Spinner animation */}
      <style>{`@keyframes ss-spin { to { transform: rotate(360deg); } }`}</style>

      {/* Success toast */}
      {successToast && (
        <div
          style={{
            position: "fixed",
            top: 80,
            left: "50%",
            transform: "translateX(-50%)",
            background: SUCCESS_GREEN,
            color: "#fff",
            borderRadius: 10,
            padding: "12px 24px",
            fontSize: 14,
            fontWeight: 600,
            zIndex: 2000,
            boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
          }}
        >
          {successToast}
        </div>
      )}

      <div style={{ fontFamily: "inherit", maxWidth: 1200, margin: "0 auto" }}>
        {/* ── Dark header ─────────────────────────────────────────── */}
        <section
          style={{
            borderRadius: 22,
            padding: "24px 28px",
            background: "linear-gradient(135deg, #0f172a 0%, #1e293b 55%, #17253a 100%)",
            color: "#f8fafc",
            boxShadow: "0 18px 48px rgba(15,23,42,0.18)",
            marginBottom: 24,
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#c4b5fd" }}>
                Compensation Benchmarking Workspace
              </div>
              <h2 style={{ margin: "8px 0 6px", fontSize: 28, fontWeight: 800, lineHeight: 1.1 }}>
                {activeStep === 1
                  ? "Step 1: connect internal compensation data"
                  : activeStep === 2
                  ? "Step 2: gather external market evidence"
                  : "Step 3: discuss and apply the AI recommendation"}
              </h2>
              <p style={{ margin: 0, fontSize: 14, color: "#cbd5e1", lineHeight: 1.6, maxWidth: 600 }}>
                {activeStep === 1
                  ? "Upload or select global HRIS datasets, then benchmark a selected listing against similar internal roles. Datasets are reusable across listings."
                  : activeStep === 2
                  ? "Choose paid datasets, web research, and uploaded files. Each source produces salary datapoints with citations and confidence."
                  : "Use internal and external evidence together with the selected listing. When approved, update the listing compensation and return to edit mode."}
              </p>
            </div>

            {/* Listing selector */}
            <div style={{ minWidth: 280, position: "relative" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 6 }}>
                Select job listing
              </div>
              <div
                style={{
                  background: "rgba(255,255,255,0.12)",
                  border: "1px solid rgba(255,255,255,0.25)",
                  borderRadius: 10,
                  padding: "10px 14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 600,
                }}
                onClick={() => setShowListingDropdown((v) => !v)}
              >
                {selectedListing
                  ? `${extractCaseMeta(selectedListing).jobTitle || selectedListing.title} · ${selectedListing.jurisdiction ?? ""}`
                  : "Search job listings…"}
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ marginLeft: 8, opacity: 0.6 }}>
                  <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>

              {showListingDropdown && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 6px)",
                    left: 0,
                    right: 0,
                    background: "#fff",
                    border: `1px solid ${BORDER}`,
                    borderRadius: 12,
                    boxShadow: "0 12px 32px rgba(0,0,0,0.15)",
                    zIndex: 200,
                    overflow: "hidden",
                  }}
                >
                  <div style={{ padding: "8px 10px", borderBottom: `1px solid ${BORDER}` }}>
                    <input
                      autoFocus
                      type="text"
                      value={listingSearch}
                      onChange={(e) => setListingSearch(e.target.value)}
                      placeholder="Search by title, role, location…"
                      style={{
                        width: "100%",
                        border: "none",
                        outline: "none",
                        fontSize: 13,
                        color: NAVY,
                        padding: "4px 0",
                      }}
                    />
                  </div>
                  <div style={{ maxHeight: 240, overflowY: "auto" }}>
                    {filteredListings.length === 0 ? (
                      <div style={{ padding: "12px 14px", fontSize: 13, color: MUTED }}>No listings found.</div>
                    ) : (
                      filteredListings.map((l) => {
                        const meta = extractCaseMeta(l);
                        return (
                          <div
                            key={l.id}
                            onClick={() => handleSelectListing(l)}
                            style={{
                              padding: "10px 14px",
                              cursor: "pointer",
                              fontSize: 13,
                              color: NAVY,
                              background: l.id === selectedListingId ? "#f0f9ff" : "#fff",
                              borderBottom: `1px solid ${BORDER}`,
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.background = l.id === selectedListingId ? "#f0f9ff" : "#fff")
                            }
                          >
                            <div style={{ fontWeight: 600 }}>{meta.jobTitle || l.title}</div>
                            <div style={{ fontSize: 11, color: MUTED }}>
                              {l.jurisdiction} · {l.currency} · {l.status}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ── Tab stepper ─────────────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            background: CARD_BG,
            border: `1px solid ${BORDER}`,
            borderRadius: 14,
            overflow: "hidden",
            marginBottom: 24,
          }}
        >
          {steps.map(({ n, label }) => {
            const isActive = activeStep === n;
            const isLocked = n === 3 && !hasAnyRun;
            return (
              <button
                key={n}
                type="button"
                onClick={() => {
                  if (!isLocked) setActiveStep(n);
                }}
                disabled={isLocked}
                style={{
                  flex: 1,
                  padding: "16px 20px",
                  background: isActive ? STEP_ACTIVE_BG : CARD_BG,
                  color: isActive ? "#fff" : isLocked ? MUTED : NAVY,
                  border: "none",
                  borderRight: n < 3 ? `1px solid ${BORDER}` : "none",
                  cursor: isLocked ? "not-allowed" : "pointer",
                  fontSize: 14,
                  fontWeight: isActive ? 700 : 500,
                  transition: "background 0.15s",
                  opacity: isLocked ? 0.5 : 1,
                }}
                title={isLocked ? "Complete at least one benchmark run to unlock" : undefined}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* ── Tab content ─────────────────────────────────────────────── */}
        {activeStep === 1 && (
          <Step1Internal
            listing={selectedListing}
            datasets={datasets}
            runs={runs}
            onRunBenchmark={handleRunInternal}
            running={runInternalMutation.isPending}
          />
        )}
        {activeStep === 2 && (
          <Step2External
            listing={selectedListing}
            datasets={datasets}
            runs={runs}
            onRunExternal={handleRunExternal}
            running={runExternalMutation.isPending}
            onClearExternalRuns={handleClearExternalRuns}
          />
        )}
        {activeStep === 3 && (
          <Step3Recommendation
            listing={selectedListing}
            internalRun={latestInternalRun}
            externalRun={latestExternalRun}
            onApply={handleApplyRecommendation}
            applying={applyMutation.isPending}
            appliedId={appliedRecommendationId}
          />
        )}
      </div>
    </>
  );
}
