import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { useCaseDetail } from "../hooks/useCaseEditor";
import {
  useApplyRecommendation,
  useBenchmarkChat,
  useBenchmarkDatasets,
  useBenchmarkRuns,
  useRunExternalBenchmark,
  useRunInternalBenchmark,
} from "../hooks/useBenchmark";
import type {
  BenchmarkRecommendation,
  BenchmarkRun,
  ChatMessage,
} from "../types/benchmark";

// ── Design tokens ─────────────────────────────────────────────────────────────
const NAVY = "#0f172a";
const CARD_BG = "#ffffff";
const BORDER = "#e2e8f0";
const MUTED = "#64748b";
const SUCCESS_GREEN = "#16a34a";
const WARNING_ORANGE = "#d97706";
const ERROR_RED = "#dc2626";

function fmtMoney(amount: number | null | undefined, currency = "USD"): string {
  if (typeof amount !== "number" || Number.isNaN(amount)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

function confidenceBadge(score: number | null): { label: string; color: string } {
  if (score === null || score === undefined) return { label: "Unknown", color: MUTED };
  if (score >= 0.8) return { label: "Strong", color: SUCCESS_GREEN };
  if (score >= 0.5) return { label: "Moderate", color: WARNING_ORANGE };
  return { label: "Weak", color: ERROR_RED };
}

function Spinner({ color = "#fff" }: { color?: string } = {}) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 14,
        height: 14,
        borderRadius: "50%",
        border: `2px solid ${color}40`,
        borderTopColor: color,
        animation: "ss-spin 0.7s linear infinite",
        flexShrink: 0,
      }}
    />
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{ fontSize: 12, fontWeight: 600, color, background: `${color}18`, borderRadius: 99, padding: "2px 10px" }}>
      {label}
    </span>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: MUTED, marginBottom: 6 }}>
      {children}
    </div>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: CARD_BG,
        border: `1px solid ${BORDER}`,
        borderRadius: 16,
        padding: 16,
        boxShadow: "0 2px 8px rgba(15,23,42,0.04)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── Compact chip toggle ───────────────────────────────────────────────────────
function ChipToggle({
  label,
  sublabel,
  checked,
  disabled,
  onToggle,
}: {
  label: string;
  sublabel?: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  const active = checked && !disabled;
  return (
    <button
      type="button"
      onClick={() => !disabled && onToggle()}
      title={sublabel}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 11px",
        borderRadius: 99,
        border: `1.5px solid ${active ? "#4f46e5" : BORDER}`,
        background: active ? "#4f46e510" : "#f8fafc",
        color: active ? "#4f46e5" : disabled ? "#94a3b8" : MUTED,
        fontSize: 12,
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        whiteSpace: "nowrap",
        userSelect: "none",
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: active ? "#4f46e5" : "#cbd5e1",
          flexShrink: 0,
        }}
      />
      {label}
    </button>
  );
}

// ── Step progress row ─────────────────────────────────────────────────────────
type StepState = "pending" | "running" | "done" | "skipped";

function StepRow({ steps }: { steps: { label: string; state: StepState }[] }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
      {steps.map((step, i) => {
        const isDone = step.state === "done";
        const isRunning = step.state === "running";
        const isSkipped = step.state === "skipped";
        const color = isDone ? SUCCESS_GREEN : isRunning ? "#2563eb" : isSkipped ? "#94a3b8" : MUTED;
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "3px 10px",
                borderRadius: 99,
                background: isDone ? "#f0fdf4" : isRunning ? "#eff6ff" : "#f8fafc",
                border: `1px solid ${isDone ? "#bbf7d0" : isRunning ? "#bfdbfe" : BORDER}`,
              }}
            >
              {isRunning ? (
                <Spinner color="#2563eb" />
              ) : (
                <span style={{ fontSize: 11, color, fontWeight: 700 }}>
                  {isDone ? "✓" : isSkipped ? "—" : "○"}
                </span>
              )}
              <span style={{ fontSize: 12, fontWeight: 600, color }}>{step.label}</span>
            </div>
            {i < steps.length - 1 && <span style={{ fontSize: 11, color: "#cbd5e1" }}>→</span>}
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
type OneClickPhase = "idle" | "internal" | "external" | "rec" | "done";

interface GuidedBenchmarkProps {
  listingId: string;
}

export function GuidedBenchmark({ listingId }: GuidedBenchmarkProps) {
  const { data: listing } = useCaseDetail(listingId);
  const { data: datasets = [] } = useBenchmarkDatasets();
  const { data: runs = [], refetch: refetchRuns } = useBenchmarkRuns(listingId || null);

  const runInternal = useRunInternalBenchmark();
  const runExternal = useRunExternalBenchmark();
  const chat = useBenchmarkChat();
  const apply = useApplyRecommendation();

  const currency = listing?.currency ?? "USD";

  const internalDatasets = datasets.filter(
    (d) => (d.source_type === "internal_hibob" || d.source_type === "internal_other_hris") && d.is_active
  );
  const externalDatasets = datasets.filter(
    (d) =>
      (d.source_type === "talentup" || d.source_type === "external_upload" || d.source_type === "other") &&
      d.is_active &&
      d.status === "mapped"
  );

  const latestInternalRun =
    runs
      .filter((r) => r.run_type === "internal" && r.status === "completed")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null;
  const latestExternalRun =
    runs
      .filter((r) => r.run_type === "external" && r.status === "completed")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null;

  const hasAnyRun = Boolean(latestInternalRun || latestExternalRun);

  // ── Source toggles (shared between quick panel and advanced view) ──
  const [includeInternal, setIncludeInternal] = useState(true);
  const [includeWebSearch, setIncludeWebSearch] = useState(true);
  const [includeTalentup, setIncludeTalentup] = useState(true);
  const [includeOther, setIncludeOther] = useState(true);

  const talentupIds = externalDatasets.filter((d) => d.source_type === "talentup").map((d) => d.id);
  const otherIds = externalDatasets
    .filter((d) => d.source_type === "external_upload" || d.source_type === "other")
    .map((d) => d.id);
  const selectedExternalDatasetIds = [
    ...(includeTalentup ? talentupIds : []),
    ...(includeOther ? otherIds : []),
  ];
  const canRunExternal = includeWebSearch || selectedExternalDatasetIds.length > 0;
  const willRunInternal = includeInternal && internalDatasets.length > 0;
  const willRunExternal = canRunExternal;
  const canOneClick = willRunInternal || willRunExternal;

  // ── One-click state ──
  const [oneClickPhase, setOneClickPhase] = useState<OneClickPhase>("idle");
  const [oneClickError, setOneClickError] = useState<string | null>(null);
  const [quickRec, setQuickRec] = useState<BenchmarkRecommendation | null>(null);
  const [quickConfirm, setQuickConfirm] = useState(false);
  const [quickShowModal, setQuickShowModal] = useState(false);
  const [quickApplied, setQuickApplied] = useState(false);

  // ── Advanced view toggle ──
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const isRunning = oneClickPhase !== "idle" && oneClickPhase !== "done";

  async function handleOneClick() {
    if (!listingId || isRunning) return;
    setOneClickError(null);
    setQuickRec(null);
    setQuickConfirm(false);
    setQuickApplied(false);

    let internalRunId: string | null = null;
    let externalRunId: string | null = null;

    try {
      if (willRunInternal) {
        setOneClickPhase("internal");
        const result = await runInternal.mutateAsync({
          job_listing_id: listingId,
          dataset_ids: internalDatasets.map((d) => d.id),
          minimum_cohort: 5,
        });
        internalRunId = result.id;
        refetchRuns();
      }

      if (willRunExternal) {
        setOneClickPhase("external");
        const sources: string[] = [];
        if (includeWebSearch) sources.push("web_search");
        if (selectedExternalDatasetIds.length > 0) sources.push("external_csv");
        const result = await runExternal.mutateAsync({
          job_listing_id: listingId,
          sources,
          dataset_ids: selectedExternalDatasetIds,
        });
        externalRunId = result.id;
        refetchRuns();
      }

      const runIds = [internalRunId, externalRunId].filter(Boolean) as string[];
      if (runIds.length > 0) {
        setOneClickPhase("rec");
        const chatResult = await chat.mutateAsync({
          job_listing_id: listingId,
          run_ids: runIds,
          messages: [{ role: "user" as const, content: "Make Recommendation" }],
        });
        if (chatResult.recommendation) setQuickRec(chatResult.recommendation);
      }

      setOneClickPhase("done");
    } catch {
      setOneClickError("Something went wrong — try again or use the advanced view.");
      setOneClickPhase("idle");
    }
  }

  const stepStates: { label: string; state: StepState }[] = [
    {
      label: "Internal HRIS",
      state:
        oneClickPhase === "internal"
          ? "running"
          : oneClickPhase === "external" || oneClickPhase === "rec" || oneClickPhase === "done"
          ? "done"
          : !willRunInternal
          ? "skipped"
          : "pending",
    },
    {
      label: "External market",
      state:
        oneClickPhase === "external"
          ? "running"
          : oneClickPhase === "rec" || oneClickPhase === "done"
          ? "done"
          : !willRunExternal
          ? "skipped"
          : "pending",
    },
    {
      label: "Recommendation",
      state: oneClickPhase === "rec" ? "running" : oneClickPhase === "done" ? "done" : "pending",
    },
  ];

  const listingConfidential = (listing?.parties?.find((p) => p.party_type === "company")
    ?.confidential_payload ?? null) as Record<string, unknown> | null;
  const currentRange = (() => {
    if (listingConfidential?.budget_floor && listingConfidential?.budget_ceiling) {
      return `${fmtMoney(Number(listingConfidential.budget_floor), currency)}–${fmtMoney(
        Number(listingConfidential.budget_ceiling),
        currency
      )}`;
    }
    return null;
  })();

  const internalSummary = latestInternalRun?.result_summary_json as Record<string, unknown> | null;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <style>{`@keyframes ss-spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── Quick / one-click panel ── */}
      <Card>
        {/* Header */}
        <div style={{ marginBottom: 10 }}>
          <Label>Benchmark</Label>
          <div style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 2 }}>
            Does the band fit the evidence?
          </div>
          <div style={{ fontSize: 12, color: MUTED }}>
            Run both benchmarks and get an AI recommendation — one click.
          </div>
        </div>

        {/* Source chips */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          <ChipToggle
            label="Internal HRIS"
            sublabel={
              internalDatasets.length > 0
                ? `${internalDatasets.reduce((s, d) => s + d.row_count, 0).toLocaleString()} rows`
                : "No datasets"
            }
            checked={includeInternal}
            disabled={internalDatasets.length === 0}
            onToggle={() => setIncludeInternal((v) => !v)}
          />
          <ChipToggle
            label="Web Search"
            checked={includeWebSearch}
            onToggle={() => setIncludeWebSearch((v) => !v)}
          />
          <ChipToggle
            label="TalentUp"
            sublabel={talentupIds.length === 0 ? "No dataset" : "P10–P90"}
            checked={includeTalentup}
            disabled={talentupIds.length === 0}
            onToggle={() => setIncludeTalentup((v) => !v)}
          />
          <ChipToggle
            label="Other files"
            sublabel={
              otherIds.length === 0
                ? "None uploaded"
                : `${otherIds.length} file${otherIds.length === 1 ? "" : "s"}`
            }
            checked={includeOther}
            disabled={otherIds.length === 0}
            onToggle={() => setIncludeOther((v) => !v)}
          />
        </div>

        {/* Run button */}
        <button
          type="button"
          onClick={handleOneClick}
          disabled={isRunning || !canOneClick}
          style={{
            width: "100%",
            background: !canOneClick ? "#cbd5e1" : isRunning ? "#6366f1" : "#4f46e5",
            color: "#fff",
            border: "none",
            borderRadius: 10,
            padding: "12px 20px",
            fontSize: 14,
            fontWeight: 700,
            cursor: isRunning || !canOneClick ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}
        >
          {isRunning && <Spinner />}
          {isRunning
            ? oneClickPhase === "internal"
              ? "Running internal benchmark…"
              : oneClickPhase === "external"
              ? "Running external benchmark…"
              : "Generating recommendation…"
            : "Run Benchmark & Get Recommendation"}
        </button>

        {/* Step progress */}
        {(isRunning || oneClickPhase === "done") && (
          <div style={{ marginTop: 10 }}>
            <StepRow steps={stepStates} />
          </div>
        )}

        {/* Error */}
        {oneClickError && (
          <div
            style={{
              marginTop: 10,
              fontSize: 12,
              color: ERROR_RED,
              background: "#fef2f2",
              borderRadius: 8,
              padding: "8px 12px",
            }}
          >
            {oneClickError}
          </div>
        )}

        {/* Recommendation result */}
        {quickRec && (
          <div
            style={{
              marginTop: 14,
              background: "#f0fdf4",
              border: "1px solid #bbf7d0",
              borderRadius: 12,
              padding: 14,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: SUCCESS_GREEN,
                letterSpacing: ".07em",
                textTransform: "uppercase",
                marginBottom: 6,
              }}
            >
              Recommended target
            </div>

            {quickRec.recommended_base_min != null && quickRec.recommended_base_max != null && (
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 8,
                  flexWrap: "wrap",
                  marginBottom: 4,
                }}
              >
                <span style={{ fontSize: 26, fontWeight: 800, color: NAVY }}>
                  {fmtMoney(
                    Math.round((quickRec.recommended_base_min + quickRec.recommended_base_max) / 2),
                    currency
                  )}
                </span>
                <span style={{ fontSize: 13, color: MUTED }}>
                  · range {fmtMoney(quickRec.recommended_base_min, currency)}–
                  {fmtMoney(quickRec.recommended_base_max, currency)}
                </span>
                {currentRange && (
                  <span style={{ fontSize: 12, color: SUCCESS_GREEN, fontWeight: 600 }}>
                    · Band: {currentRange}
                  </span>
                )}
              </div>
            )}

            {quickRec.bonus_target != null && (
              <div style={{ fontSize: 12, color: MUTED, marginBottom: 4 }}>
                Target bonus: <strong style={{ color: NAVY }}>{quickRec.bonus_target}%</strong>
              </div>
            )}

            {quickRec.rationale && (
              <p style={{ fontSize: 12, color: MUTED, lineHeight: 1.5, margin: "6px 0 10px" }}>
                {quickRec.rationale}
              </p>
            )}

            {quickRec.applied_to_listing || quickApplied ? (
              <div style={{ fontSize: 13, color: SUCCESS_GREEN, fontWeight: 600 }}>✓ Applied to listing</div>
            ) : (
              <div>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 12,
                    cursor: "pointer",
                    marginBottom: 8,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={quickConfirm}
                    onChange={(e) => setQuickConfirm(e.target.checked)}
                  />
                  I understand this will update this listing's salary band.
                </label>
                <button
                  type="button"
                  onClick={() => setQuickShowModal(true)}
                  disabled={!quickConfirm || apply.isPending}
                  style={{
                    background: !quickConfirm ? "#cbd5e1" : SUCCESS_GREEN,
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    padding: "8px 18px",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: !quickConfirm || apply.isPending ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 7,
                  }}
                >
                  {apply.isPending && <Spinner />}
                  Apply to listing
                </button>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            marginTop: 14,
            paddingTop: 12,
            borderTop: `1px solid ${BORDER}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              fontSize: 12,
              fontWeight: 600,
              color: MUTED,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <span
              style={{
                display: "inline-block",
                transition: "transform 0.2s",
                transform: advancedOpen ? "rotate(180deg)" : "none",
              }}
            >
              ▾
            </span>
            {advancedOpen ? "Hide advanced" : "Show advanced"}
          </button>
          {hasAnyRun && (
            <Link
              to={`/compensation-benchmarking/workspace?listing_id=${listingId}`}
              style={{ fontSize: 12, fontWeight: 700, color: "#2563eb", textDecoration: "none" }}
            >
              See full details in Compensation Benchmarking →
            </Link>
          )}
        </div>
      </Card>

      {/* ── Advanced section (collapsed by default) ── */}
      {advancedOpen && (
        <div style={{ display: "grid", gap: 12 }}>

          {/* Internal benchmark */}
          <Card>
            <Label>Internal benchmark</Label>
            <div style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 4 }}>Run internal HRIS benchmark</div>
            <p style={{ fontSize: 12, color: MUTED, lineHeight: 1.5, margin: "0 0 10px" }}>
              Match against similar internal employees. Datasets are managed centrally —{" "}
              <Link to="/compensation-benchmarking/workspace?step=1" style={{ color: "#2563eb" }}>
                upload or map HRIS files in the full workspace
              </Link>
              .
            </p>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
                padding: "8px 12px",
                background: "#f8fafc",
                border: `1px solid ${BORDER}`,
                borderRadius: 8,
                marginBottom: 10,
              }}
            >
              <span style={{ fontSize: 13, color: NAVY }}>
                {internalDatasets.length > 0
                  ? `${internalDatasets.length} active internal dataset${internalDatasets.length === 1 ? "" : "s"}`
                  : "No active internal datasets found"}
              </span>
              <span style={{ fontSize: 12, color: MUTED }}>
                {internalDatasets.reduce((sum, d) => sum + d.row_count, 0).toLocaleString()} rows
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                if (!listingId) return;
                runInternal.mutate(
                  { job_listing_id: listingId, dataset_ids: internalDatasets.map((d) => d.id), minimum_cohort: 5 },
                  { onSuccess: () => refetchRuns() }
                );
              }}
              disabled={runInternal.isPending || internalDatasets.length === 0}
              style={{
                width: "100%",
                background: internalDatasets.length === 0 ? "#cbd5e1" : "#4f46e5",
                color: "#fff",
                border: "none",
                borderRadius: 10,
                padding: "10px 16px",
                fontSize: 14,
                fontWeight: 700,
                cursor: runInternal.isPending || internalDatasets.length === 0 ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {runInternal.isPending && <Spinner />}
              {runInternal.isPending ? "Running…" : "Run internal benchmark"}
            </button>
            {latestInternalRun && (
              <div style={{ marginTop: 10, padding: 12, background: "#f8fafc", border: `1px solid ${BORDER}`, borderRadius: 12 }}>
                <Label>Latest internal result</Label>
                {internalSummary?.suppressed ? (
                  <div style={{ fontSize: 13, color: WARNING_ORANGE }}>
                    {String(internalSummary.guidance || "Cohort too small — exact values suppressed.")}
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {internalSummary?.cohort_size != null && (
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 13, color: MUTED }}>Matched cohort</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>
                          {Number(internalSummary.cohort_size)} employees
                        </span>
                      </div>
                    )}
                    {internalSummary?.median_base != null && (
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 13, color: MUTED }}>Median base</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>
                          {fmtMoney(Number(internalSummary.median_base), currency)}
                        </span>
                      </div>
                    )}
                    {internalSummary?.median_total_comp != null && (
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 13, color: MUTED }}>Median total comp</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: WARNING_ORANGE }}>
                          {fmtMoney(Number(internalSummary.median_total_comp), currency)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* External benchmark */}
          <Card>
            <Label>External benchmark</Label>
            <div style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 4 }}>Run external market benchmark</div>
            <p style={{ fontSize: 12, color: MUTED, lineHeight: 1.5, margin: "0 0 10px" }}>
              Choose sources to include for market evidence.
            </p>
            <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
              <SourceToggle
                title="Web Search"
                description="Search public salary pages, job boards, and compensation articles."
                checked={includeWebSearch}
                onToggle={() => setIncludeWebSearch((v) => !v)}
              />
              <SourceToggle
                title="TalentUp"
                description={`Market dataset extraction (P10–P90).${talentupIds.length === 0 ? " No active TalentUp dataset uploaded." : ""}`}
                checked={includeTalentup}
                disabled={talentupIds.length === 0}
                onToggle={() => setIncludeTalentup((v) => !v)}
              />
              <SourceToggle
                title="Other evidence files"
                description={`Uploaded PDFs, spreadsheets, or studies.${otherIds.length === 0 ? " No active evidence files uploaded." : ""}`}
                checked={includeOther}
                disabled={otherIds.length === 0}
                onToggle={() => setIncludeOther((v) => !v)}
              />
            </div>
            <p style={{ fontSize: 12, color: MUTED, margin: "0 0 10px" }}>
              Need to add datasets?{" "}
              <Link to="/compensation-benchmarking/workspace?step=2" style={{ color: "#2563eb" }}>
                Open the full external workspace
              </Link>
              .
            </p>
            <button
              type="button"
              onClick={() => {
                if (!listingId || !canRunExternal) return;
                const sources: string[] = [];
                if (includeWebSearch) sources.push("web_search");
                if (selectedExternalDatasetIds.length > 0) sources.push("external_csv");
                runExternal.mutate(
                  { job_listing_id: listingId, sources, dataset_ids: selectedExternalDatasetIds },
                  { onSuccess: () => refetchRuns() }
                );
              }}
              disabled={runExternal.isPending || !canRunExternal}
              style={{
                width: "100%",
                background: canRunExternal ? "#1d4ed8" : "#cbd5e1",
                color: "#fff",
                border: "none",
                borderRadius: 10,
                padding: "10px 16px",
                fontSize: 14,
                fontWeight: 700,
                cursor: runExternal.isPending || !canRunExternal ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {runExternal.isPending && <Spinner />}
              {runExternal.isPending ? "Running…" : "Run external benchmark"}
            </button>
            {latestExternalRun && latestExternalRun.matches.length > 0 && (
              <div style={{ marginTop: 10, overflowX: "auto" }}>
                <Label>Latest external evidence</Label>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${BORDER}`, textAlign: "left" }}>
                      <th style={{ padding: "8px 10px", color: MUTED, fontWeight: 600 }}>Closest match</th>
                      <th style={{ padding: "8px 10px", color: MUTED, fontWeight: 600 }}>P50 Base</th>
                      <th style={{ padding: "8px 10px", color: MUTED, fontWeight: 600 }}>Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latestExternalRun.matches.map((m) => {
                      const conf = confidenceBadge(m.confidence_score);
                      return (
                        <tr key={m.id} style={{ borderBottom: `1px solid ${BORDER}` }}>
                          <td style={{ padding: "8px 10px" }}>
                            <div style={{ fontWeight: 600, color: NAVY }}>{m.matched_title || "—"}</div>
                            <div style={{ fontSize: 12, color: MUTED }}>{m.matched_location || ""}</div>
                          </td>
                          <td style={{ padding: "8px 10px", fontWeight: 700, color: NAVY }}>
                            {fmtMoney(m.base_salary, m.currency ?? currency)}
                          </td>
                          <td style={{ padding: "8px 10px" }}>
                            <Badge label={conf.label} color={conf.color} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {latestExternalRun && latestExternalRun.matches.length === 0 && (
              <div style={{ marginTop: 10, fontSize: 13, color: MUTED }}>
                No external matches returned. Try enabling more sources.
              </div>
            )}
          </Card>

          {/* AI recommendation with full chat */}
          <RecommendationStep
            listingId={listingId}
            currency={currency}
            listingConfidential={listingConfidential}
            internalRun={latestInternalRun}
            externalRun={latestExternalRun}
            fullDetailsLink={`/compensation-benchmarking/workspace?listing_id=${listingId}`}
          />
        </div>
      )}

      {/* Apply modal for quick recommendation */}
      {quickShowModal && quickRec && (
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
          onClick={() => setQuickShowModal(false)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: 28,
              maxWidth: 420,
              width: "90%",
              boxShadow: "0 24px 64px rgba(0,0,0,0.18)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 18, fontWeight: 800, color: NAVY, marginBottom: 10 }}>Apply recommendation?</div>
            <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.7, marginBottom: 20 }}>
              This will update the compensation values on this job listing. You can review and edit them in the role
              details. This action cannot be automatically undone.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={() => setQuickShowModal(false)}
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
                  setQuickShowModal(false);
                  apply.mutate(quickRec.id, { onSuccess: () => setQuickApplied(true) });
                }}
                disabled={apply.isPending}
                style={{
                  flex: 1,
                  background: SUCCESS_GREEN,
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "10px 0",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: apply.isPending ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                {apply.isPending && <Spinner />}
                Confirm & apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Source toggle row ─────────────────────────────────────────────────────────
function SourceToggle({
  title,
  description,
  checked,
  disabled,
  onToggle,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  const active = checked && !disabled;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "12px 14px",
        border: `1px solid ${BORDER}`,
        borderRadius: 12,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>{title}</div>
        <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.5, marginTop: 2 }}>{description}</div>
      </div>
      <div
        onClick={() => !disabled && onToggle()}
        style={{
          width: 40,
          height: 22,
          borderRadius: 11,
          background: active ? "#1d4ed8" : "#cbd5e1",
          position: "relative",
          cursor: disabled ? "not-allowed" : "pointer",
          transition: "background 0.2s",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 3,
            left: active ? 21 : 3,
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: "#fff",
            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
            transition: "left 0.2s",
          }}
        />
      </div>
    </div>
  );
}

// ── Step 3 content (chat + apply) ─────────────────────────────────────────────
function RecommendationStep({
  listingId,
  currency,
  listingConfidential,
  internalRun,
  externalRun,
  fullDetailsLink,
}: {
  listingId: string;
  currency: string;
  listingConfidential: Record<string, unknown> | null;
  internalRun: BenchmarkRun | null;
  externalRun: BenchmarkRun | null;
  fullDetailsLink: string;
}) {
  const chat = useBenchmarkChat();
  const apply = useApplyRecommendation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [recommendation, setRecommendation] = useState<BenchmarkRecommendation | null>(null);
  const [confirmApply, setConfirmApply] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applied, setApplied] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const runIds = useMemo(
    () => [internalRun?.id, externalRun?.id].filter(Boolean) as string[],
    [internalRun?.id, externalRun?.id]
  );
  const hasRuns = runIds.length > 0;

  const internalSummary = internalRun?.result_summary_json as Record<string, unknown> | null;
  const externalSummary = externalRun?.result_summary_json as Record<string, unknown> | null;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || !listingId) return;
    const updated = [...messages, { role: "user", content: trimmed } as ChatMessage];
    setMessages(updated);
    chat.mutate(
      { job_listing_id: listingId, run_ids: runIds, messages: updated },
      {
        onSuccess: (resp) => {
          setMessages((prev) => [...prev, { role: "assistant", content: resp.message }]);
          if (resp.recommendation) setRecommendation(resp.recommendation);
        },
      }
    );
  }

  function handleSend() {
    if (!input.trim()) return;
    const msg = input;
    setInput("");
    sendMessage(msg);
  }

  const currentRange = (() => {
    if (listingConfidential?.budget_floor && listingConfidential?.budget_ceiling) {
      return `${fmtMoney(Number(listingConfidential.budget_floor), currency)}–${fmtMoney(Number(listingConfidential.budget_ceiling), currency)}`;
    }
    return null;
  })();

  const evidenceItems = [
    {
      label: "Internal median base",
      value:
        internalSummary && !internalSummary.suppressed && internalSummary.median_base != null
          ? fmtMoney(Number(internalSummary.median_base), currency)
          : null,
      color: SUCCESS_GREEN,
    },
    {
      label: "External market P50",
      value: externalSummary?.market_p50_base != null ? fmtMoney(Number(externalSummary.market_p50_base), currency) : null,
      color: "#2563eb",
    },
    { label: "Current listing range", value: currentRange, color: WARNING_ORANGE },
  ];

  return (
    <Card style={{ display: "grid", gap: 16 }}>
      <div>
        <Label>AI recommendation</Label>
        <div style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 4 }}>Synthesise & apply</div>
        <p style={{ fontSize: 12, color: MUTED, lineHeight: 1.5, margin: 0 }}>
          The assistant combines this listing with your completed internal and external benchmark runs. Generate a
          recommendation, refine it through chat, then apply it to the listing compensation with confirmation.
        </p>
      </div>

      {/* Evidence chips */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {evidenceItems.map((item) => (
          <div key={item.label} style={{ borderLeft: `3px solid ${item.color}`, paddingLeft: 12, minWidth: 150 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: ".06em" }}>
              {item.label}
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: NAVY, marginTop: 2 }}>{item.value ?? "—"}</div>
          </div>
        ))}
      </div>

      {/* Messages */}
      <div
        style={{
          minHeight: 130,
          maxHeight: 240,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          padding: 14,
          background: "#f8fafc",
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
        }}
      >
        {messages.length === 0 && !recommendation && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 150, gap: 12, textAlign: "center" }}>
            <div style={{ fontSize: 13, color: MUTED }}>
              Generate a compensation recommendation grounded in your benchmark data.
            </div>
            <button
              type="button"
              onClick={() => sendMessage("Make Recommendation")}
              disabled={!hasRuns || chat.isPending}
              style={{
                background: NAVY,
                color: "#fff",
                border: "none",
                borderRadius: 10,
                padding: "10px 18px",
                fontSize: 13,
                fontWeight: 700,
                cursor: !hasRuns || chat.isPending ? "not-allowed" : "pointer",
                opacity: !hasRuns || chat.isPending ? 0.5 : 1,
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
              background: msg.role === "user" ? NAVY : "#fff",
              color: msg.role === "user" ? "#fff" : NAVY,
              border: msg.role === "user" ? "none" : `1px solid ${BORDER}`,
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
        {chat.isPending && (
          <div style={{ alignSelf: "flex-start", background: "#fff", border: `1px solid ${BORDER}`, borderRadius: "14px 14px 14px 4px", padding: "10px 14px" }}>
            <span style={{ fontSize: 13, color: MUTED }}>Thinking…</span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Final recommendation card */}
      {recommendation && (
        <div style={{ background: "#f0fdf4", border: `1px solid ${SUCCESS_GREEN}`, borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: SUCCESS_GREEN, marginBottom: 8 }}>Final recommendation ready</div>
          <div style={{ fontSize: 13, color: NAVY, lineHeight: 1.8 }}>
            {recommendation.recommended_base_min != null && recommendation.recommended_base_max != null && (
              <span>
                Base range:{" "}
                <strong>
                  {fmtMoney(recommendation.recommended_base_min, currency)}–{fmtMoney(recommendation.recommended_base_max, currency)}
                </strong>
              </span>
            )}
            {recommendation.bonus_target != null && <span> · Target bonus: <strong>{recommendation.bonus_target}%</strong></span>}
            {recommendation.recommended_total_comp_min != null && recommendation.recommended_total_comp_max != null && (
              <span>
                {" "}· Total comp:{" "}
                <strong>
                  {fmtMoney(recommendation.recommended_total_comp_min, currency)}–{fmtMoney(recommendation.recommended_total_comp_max, currency)}
                </strong>
              </span>
            )}
          </div>
          {recommendation.rationale && (
            <p style={{ fontSize: 12, color: MUTED, margin: "8px 0 0", lineHeight: 1.5 }}>{recommendation.rationale}</p>
          )}

          <div style={{ marginTop: 8 }}>
            <Link to={fullDetailsLink} style={{ fontSize: 12, color: "#2563eb", fontWeight: 700, textDecoration: "none" }}>
              See full details in Compensation Benchmarking →
            </Link>
          </div>

          {recommendation.applied_to_listing || applied ? (
            <div style={{ marginTop: 10, fontSize: 13, color: SUCCESS_GREEN, fontWeight: 600 }}>✓ Applied to listing</div>
          ) : (
            <div style={{ marginTop: 14 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer", marginBottom: 10 }}>
                <input type="checkbox" checked={confirmApply} onChange={(e) => setConfirmApply(e.target.checked)} />
                I understand this will update this listing's salary band and benefits.
              </label>
              <button
                type="button"
                onClick={() => setShowApplyModal(true)}
                disabled={!confirmApply || apply.isPending}
                style={{
                  background: ERROR_RED,
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "9px 20px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: !confirmApply || apply.isPending ? "not-allowed" : "pointer",
                  opacity: !confirmApply ? 0.5 : 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                {apply.isPending && <Spinner />}
                Apply recommendation
              </button>
            </div>
          )}
        </div>
      )}

      {/* Chat input */}
      {(messages.length > 0 || recommendation) && (
        <div style={{ display: "flex", gap: 10 }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask about options, risks, or tradeoffs…"
            disabled={!hasRuns || chat.isPending}
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
              opacity: !hasRuns ? 0.5 : 1,
            }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!input.trim() || !hasRuns || chat.isPending}
            style={{
              background: NAVY,
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "10px 18px",
              fontSize: 13,
              fontWeight: 700,
              cursor: !input.trim() || !hasRuns || chat.isPending ? "not-allowed" : "pointer",
              opacity: !input.trim() || !hasRuns ? 0.5 : 1,
              alignSelf: "flex-end",
            }}
          >
            Send
          </button>
        </div>
      )}

      {!hasRuns && (
        <div style={{ fontSize: 13, color: WARNING_ORANGE, background: "#fffbeb", borderRadius: 8, padding: 10 }}>
          Run at least one internal or external benchmark to unlock the recommendation.
        </div>
      )}

      {/* Apply confirmation modal */}
      {showApplyModal && recommendation && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
          onClick={() => setShowApplyModal(false)}
        >
          <div
            style={{ background: "#fff", borderRadius: 16, padding: 32, maxWidth: 440, width: "90%", boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 20, fontWeight: 800, color: NAVY, marginBottom: 12 }}>Apply recommendation?</div>
            <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.7, marginBottom: 20 }}>
              This will update the compensation values on this job listing. You can review and further edit them in the
              role details above. This action cannot be automatically undone.
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                type="button"
                onClick={() => setShowApplyModal(false)}
                style={{ flex: 1, background: "#f1f5f9", color: NAVY, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "10px 0", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowApplyModal(false);
                  apply.mutate(recommendation.id, { onSuccess: () => setApplied(true) });
                }}
                disabled={apply.isPending}
                style={{
                  flex: 1,
                  background: ERROR_RED,
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "10px 0",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: apply.isPending ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                {apply.isPending && <Spinner />}
                Confirm & apply
              </button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
