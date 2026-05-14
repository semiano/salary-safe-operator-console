import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { getTokenRole } from "../auth/token";
import { WorkdayBenchmarkPanel } from "../components/WorkdayBenchmarkPanel";

import { useCases, useUpdateCaseGuidance } from "../hooks/useCases";
import {
  useBulkDecidePhase1Bids,
  usePhase1Bids,
  useSavePhase1BidResponseMessage,
  useSendPhase1BidResponse,
  useUpdatePhase1BidDecision,
} from "../hooks/usePhase1Bids";
import {
  extractBenefitConfig,
  extractBulkDecisionJobListingPayload,
  extractCaseMeta,
} from "../utils/caseMeta";

const AZURE_PRESALES_TITLE_FRAGMENT = "microsoft azure pre-sales";
const BULK_DECISION_SYSTEM_PROMPT =
  "You are evaluating phase 1 applicant bids for a hiring team. Return JSON only with key decisions. decisions must be an array of objects with keys: bid_id, decision_status, decision_reason, response_message. decision_status must be accepted or rejected. response_message must be professional and concise.";

function formatSalaryForGuidance(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "n/a";
  return `$${Math.round(value).toLocaleString()}`;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function deriveBudgetRange(caseLike: { parties?: Array<{ party_type: "candidate" | "company"; confidential_payload: Record<string, unknown> }> }): {
  floor: number | null;
  ceiling: number | null;
} {
  const companyConfidential = caseLike.parties?.find((party) => party.party_type === "company")?.confidential_payload ?? {};
  const floor = asNumber(companyConfidential.budget_floor);
  const ceiling = asNumber(companyConfidential.budget_ceiling);
  return { floor, ceiling };
}

function buildDefaultGuidance(
  budgetFloor: number | null,
  budgetCeiling: number | null,
  bidMin: number | null,
  bidMax: number | null,
): string {
  return [
    "Evaluate each Phase 1 bid against budget and role fit.",
    `Company budget range: ${formatSalaryForGuidance(budgetFloor)} to ${formatSalaryForGuidance(budgetCeiling)}.`,
    `Observed applicant salary range in this batch: ${formatSalaryForGuidance(bidMin)} to ${formatSalaryForGuidance(bidMax)}.`,
    "Prioritize bids within range, then weigh insurance/PTO/WFH ranking alignment; reject materially out-of-range bids unless rationale is compelling.",
  ].join(" ");
}

function statusPillClass(status: "pending" | "accepted" | "rejected"): string {
  if (status === "accepted") return "bg-green-100 text-green-800";
  if (status === "rejected") return "bg-red-100 text-red-800";
  return "bg-amber-100 text-amber-800";
}

function responsePillClass(submissionStatus: string): string {
  if (submissionStatus === "response_sent") return "bg-zinc-700 text-zinc-100";
  if (submissionStatus === "invitation_pending") return "bg-amber-100 text-amber-800";
  return "bg-zinc-200 text-zinc-800";
}

function formatReceivedDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function HeaderWithTooltip({ title, tooltip }: { title: string; tooltip: string }) {
  return (
    <div className="group relative inline-flex items-center gap-2">
      <span>{title}</span>
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-paper/50 text-[10px]">i</span>
      <div className="pointer-events-none invisible absolute left-0 top-6 z-40 w-80 rounded-lg border border-ink/10 bg-white p-2 text-xs font-normal text-ink shadow-lg group-hover:visible">
        {tooltip}
      </div>
    </div>
  );
}

function fmtMoney(value: number): string {
  return Number.isFinite(value) ? value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : "0";
}

const RANK_LABEL: Record<number, string> = { 1: "Low", 2: "Med", 3: "High" };
const RANK_COLOR: Record<number, string> = {
  1: "bg-zinc-100 text-zinc-600",
  2: "bg-amber-100 text-amber-700",
  3: "bg-green-100 text-green-700",
};

function RankChip({ label, rank }: { label: string; rank: number }) {
  if (!rank || !RANK_LABEL[rank]) return null;
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-14 shrink-0 text-xs text-slate">{label}</span>
      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RANK_COLOR[rank]}`}>
        {RANK_LABEL[rank]}
      </span>
    </div>
  );
}

function parseMoney(value: string): number | null {
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function formatStatMoney(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "n/a";
  return `$${Math.round(value).toLocaleString()}`;
}

function formatListingValue(value: unknown): string {
  if (value === null || value === undefined) return "Not provided";
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : "Not provided";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toLocaleString() : "Not provided";
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  return String(value);
}

type BidLike = {
  salary_min: number;
  salary_max: number;
};

function summarizeMidpointRange(items: BidLike[]): { count: number; min: number | null; max: number | null; avg: number | null } {
  if (items.length === 0) {
    return { count: 0, min: null, max: null, avg: null };
  }

  const midpoints = items.map((item) => (item.salary_min + item.salary_max) / 2);
  const sum = midpoints.reduce((total, value) => total + value, 0);
  return {
    count: items.length,
    min: Math.min(...midpoints),
    max: Math.max(...midpoints),
    avg: sum / items.length,
  };
}

function hasCandidateBidSubmission(bid: {
  submission_status: string;
  candidate_submitted_at: string | null;
  salary_min: number;
  salary_max: number;
}): boolean {
  if (bid.candidate_submitted_at) return true;
  const hasSalaryRange = Number.isFinite(bid.salary_min) && Number.isFinite(bid.salary_max) && bid.salary_min > 0 && bid.salary_max >= bid.salary_min;
  return hasSalaryRange && bid.submission_status !== "invitation_pending";
}

export function CandidateBidsPage() {
  const { data: cases, isLoading: casesLoading } = useCases();
  const [searchParams] = useSearchParams();
  const { listingId } = useParams<{ listingId?: string }>();
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(
    listingId ?? searchParams.get("case"),
  );
  const [operatorGuidance, setOperatorGuidance] = useState("");
  const [bulkResultText, setBulkResultText] = useState<string | null>(null);
  const [bulkGuidanceError, setBulkGuidanceError] = useState<string | null>(null);
  const [copyStatusText, setCopyStatusText] = useState<string | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  const [filterApplicant, setFilterApplicant] = useState("");
  const [filterDecisionPending, setFilterDecisionPending] = useState(true);
  const [filterDecisionAccepted, setFilterDecisionAccepted] = useState(true);
  const [filterDecisionRejected, setFilterDecisionRejected] = useState(true);
  const [filterLifecycleAwaiting, setFilterLifecycleAwaiting] = useState(true);
  const [filterLifecycleOpen, setFilterLifecycleOpen] = useState(true);
  const [filterLifecycleClosed, setFilterLifecycleClosed] = useState(true);

  const [filterInsuranceRank, setFilterInsuranceRank] = useState<"all" | "1" | "2" | "3">("all");
  const [filterPtoRank, setFilterPtoRank] = useState<"all" | "1" | "2" | "3">("all");
  const [filterWfhRank, setFilterWfhRank] = useState<"all" | "1" | "2" | "3">("all");



  const isAdmin = getTokenRole() === "admin";

  const [reasonEdits, setReasonEdits] = useState<Record<string, string>>({});
  const [responseEdits, setResponseEdits] = useState<Record<string, string>>({});

  const bulkDecide = useBulkDecidePhase1Bids();
  const updateDecision = useUpdatePhase1BidDecision();
  const saveResponse = useSavePhase1BidResponseMessage();
  const sendResponse = useSendPhase1BidResponse();
  const updateCaseGuidance = useUpdateCaseGuidance();
  const { data: bids, isLoading: bidsLoading } = usePhase1Bids(selectedCaseId);

  useEffect(() => {
    if (!selectedCaseId && cases && cases.length > 0) {
      setSelectedCaseId(cases[0].id);
    }
  }, [cases, selectedCaseId]);

  useEffect(() => {
    const found = (cases ?? []).find((c) => c.id === selectedCaseId);
    if (found) setOperatorGuidance(found.operator_guidance ?? "");
  }, [selectedCaseId, cases]);

  useEffect(() => {
    const nextReasons: Record<string, string> = {};
    const nextMessages: Record<string, string> = {};
    for (const bid of bids ?? []) {
      nextReasons[bid.id] = bid.decision_reason ?? "";
      nextMessages[bid.id] = bid.response_message ?? "";
    }
    setReasonEdits(nextReasons);
    setResponseEdits(nextMessages);
  }, [bids]);

  const selectedCase = useMemo(() => (cases ?? []).find((item) => item.id === selectedCaseId) ?? null, [cases, selectedCaseId]);
  const selectedCaseMeta = selectedCase ? extractCaseMeta(selectedCase) : null;
  const selectedCaseLlmPayload = selectedCase ? extractBulkDecisionJobListingPayload(selectedCase) : null;
  const benefitConfig = selectedCase ? extractBenefitConfig(selectedCase) : null;
  const budgetRange = useMemo(() => (selectedCase ? deriveBudgetRange(selectedCase) : { floor: null, ceiling: null }), [selectedCase]);
  const isAzurePresalesCase = useMemo(() => {
    const title = (selectedCase?.title ?? "").toLowerCase();
    const jobTitle = (selectedCaseMeta?.jobTitle ?? "").toLowerCase();
    return title.includes(AZURE_PRESALES_TITLE_FRAGMENT) || jobTitle.includes(AZURE_PRESALES_TITLE_FRAGMENT);
  }, [selectedCase, selectedCaseMeta]);

  const unsentCount = (bids ?? []).filter((bid) => bid.submission_status === "applicant_bid_submitted").length;
  const bidSalaryMin = useMemo(() => {
    if (!bids || bids.length === 0) return null;
    return Math.min(...bids.map((bid) => bid.salary_min));
  }, [bids]);
  const bidSalaryMax = useMemo(() => {
    if (!bids || bids.length === 0) return null;
    return Math.max(...bids.map((bid) => bid.salary_max));
  }, [bids]);

  const filteredBids = useMemo(() => {
    const source = bids ?? [];
    const applicantQuery = filterApplicant.trim().toLowerCase();

    return source.filter((bid) => {
      if (applicantQuery && !bid.applicant_identifier.toLowerCase().includes(applicantQuery)) {
        return false;
      }

      if (bid.decision_status === "pending" && !filterDecisionPending) return false;
      if (bid.decision_status === "accepted" && !filterDecisionAccepted) return false;
      if (bid.decision_status === "rejected" && !filterDecisionRejected) return false;

      if (bid.submission_status === "invitation_pending" && !filterLifecycleAwaiting) return false;
      if (bid.submission_status === "applicant_bid_submitted" && !filterLifecycleOpen) return false;
      if (bid.submission_status === "response_sent" && !filterLifecycleClosed) return false;

      if (filterInsuranceRank !== "all" && bid.insurance_importance_rank !== Number(filterInsuranceRank)) return false;
      if (filterPtoRank !== "all" && bid.pto_importance_rank !== Number(filterPtoRank)) return false;
      if (filterWfhRank !== "all" && bid.wfh_importance_rank !== Number(filterWfhRank)) return false;

      return true;
    });
  }, [
    bids,
    filterApplicant,
    filterDecisionPending,
    filterDecisionAccepted,
    filterDecisionRejected,
    filterLifecycleAwaiting,
    filterLifecycleOpen,
    filterLifecycleClosed,
    filterInsuranceRank,
    filterPtoRank,
    filterWfhRank,
  ]);

  const isFiltered =
    filterApplicant.trim().length > 0 ||
    !filterDecisionPending ||
    !filterDecisionAccepted ||
    !filterDecisionRejected ||
    !filterLifecycleAwaiting ||
    !filterLifecycleOpen ||
    !filterLifecycleClosed ||
    filterInsuranceRank !== "all" ||
    filterPtoRank !== "all" ||
    filterWfhRank !== "all";

  const allBids = bids ?? [];
  const totalBids = allBids.length;
  const decisionPendingCount = allBids.filter((bid) => bid.decision_status === "pending").length;
  const decisionAcceptedCount = allBids.filter((bid) => bid.decision_status === "accepted").length;
  const decisionRejectedCount = allBids.filter((bid) => bid.decision_status === "rejected").length;
  const openCount = allBids.filter((bid) => bid.submission_status === "applicant_bid_submitted").length;
  const closedCount = allBids.filter((bid) => bid.submission_status === "response_sent").length;

  const invitationPendingCount = allBids.filter((bid) => bid.submission_status === "invitation_pending").length;
  const submittedBids = allBids.filter((bid) => bid.submission_status !== "invitation_pending");
  const allMidpointStats = summarizeMidpointRange(submittedBids);
  const acceptedMidpointStats = summarizeMidpointRange(submittedBids.filter((bid) => bid.decision_status === "accepted"));
  const rejectedMidpointStats = summarizeMidpointRange(submittedBids.filter((bid) => bid.decision_status === "rejected"));

  function clearFilters() {
    setFilterApplicant("");
    setFilterDecisionPending(true);
    setFilterDecisionAccepted(true);
    setFilterDecisionRejected(true);
    setFilterLifecycleAwaiting(true);
    setFilterLifecycleOpen(true);
    setFilterLifecycleClosed(true);
    setFilterInsuranceRank("all");
    setFilterPtoRank("all");
    setFilterWfhRank("all");
  }

  useEffect(() => {
    const autoGuidance = buildDefaultGuidance(budgetRange.floor, budgetRange.ceiling, bidSalaryMin, bidSalaryMax);

    if (isAzurePresalesCase && !operatorGuidance.trim()) {
      setOperatorGuidance(autoGuidance);
      return;
    }

    if (!isAzurePresalesCase && operatorGuidance === autoGuidance) {
      setOperatorGuidance("");
    }
  }, [isAzurePresalesCase, operatorGuidance, budgetRange.floor, budgetRange.ceiling, bidSalaryMin, bidSalaryMax]);

  function normalizeResponseMessage(value: string | undefined): string {
    return (value ?? "").trim();
  }

  async function handleDecision(bidId: string, status: "accepted" | "rejected", currentStatus?: "pending" | "accepted" | "rejected") {
    const responseMessage = responseEdits[bidId] ?? "";
    const shouldClearResponseMessage = (currentStatus === "accepted" || currentStatus === "rejected") && currentStatus !== status;

    await updateDecision.mutateAsync({
      bidId,
      decision_status: status,
      decision_reason: reasonEdits[bidId] || undefined,
      response_message: shouldClearResponseMessage ? "" : responseMessage || undefined,
    });

    if (shouldClearResponseMessage) {
      setResponseEdits((prev) => ({ ...prev, [bidId]: "" }));
    }
  }

  async function handleSaveResponseMessage(bidId: string) {
    const responseMessage = (responseEdits[bidId] || "").trim();
    if (!responseMessage) {
      return;
    }
    await saveResponse.mutateAsync({ bidId, response_message: responseMessage });
  }

  async function handleSendResponse(bidId: string, hasPendingResponseEdit: boolean) {
    if (hasPendingResponseEdit) {
      const confirmed = window.confirm(
        "This response message has unsaved changes. Send response with the current draft anyway?",
      );
      if (!confirmed) {
        return;
      }
    }
    await sendResponse.mutateAsync(bidId);
  }

  async function handleBulkDecide() {
    if (!selectedCaseId) return;
    if (!operatorGuidance.trim()) {
      setBulkGuidanceError("Bulk Decision Guidance is required before running AI Calculate Matches.");
      return;
    }
    setBulkGuidanceError(null);
    const result = await bulkDecide.mutateAsync({ caseId: selectedCaseId, operatorGuidance });
    setBulkResultText(`Bulk complete. Updated: ${result.processed_count}. Skipped: ${result.skipped_count}.`);
  }

  async function handleCopyLlmContextJson() {
    if (!selectedCaseLlmPayload) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(selectedCaseLlmPayload, null, 2));
      setCopyStatusText("Copied");
      window.setTimeout(() => setCopyStatusText(null), 1800);
    } catch {
      setCopyStatusText("Copy failed");
      window.setTimeout(() => setCopyStatusText(null), 2400);
    }
  }

  return (
    <section className="relative left-1/2 w-screen max-w-[1480px] -translate-x-1/2 space-y-5 px-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link className="rounded-full border border-ink/20 px-3 py-1.5 text-xs hover:bg-ink hover:text-paper" to="/job-listings">
            ← Job Listings
          </Link>
          <h2 className="font-display text-xl">View Bids, Calculate Matches, Send Responses</h2>
        </div>
      </div>

      <section className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm space-y-3">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <div>
            <p className="mb-0.5 text-xs font-medium text-slate">Job</p>
            <p className="text-base font-semibold">
              {casesLoading ? "Loading..." : (selectedCase?.title ?? "—")}
            </p>
            {selectedCaseMeta?.jobTitle && selectedCaseMeta.jobTitle !== selectedCase?.title ? (
              <p className="text-xs text-slate">{selectedCaseMeta.jobTitle}</p>
            ) : null}
          </div>
          <div className="self-end inline-flex items-center gap-2">
            <button
              className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50 inline-flex items-center gap-2"
              type="button"
              onClick={handleBulkDecide}
              disabled={!selectedCaseId || bulkDecide.isPending || unsentCount === 0 || !operatorGuidance.trim()}
              title="Runs bulk LLM matching for currently unsent bids."
            >
              <span>✨</span>
              {bulkDecide.isPending ? "Calculating..." : `AI Calculate Matches (batch: ${unsentCount} unsent)`}
            </button>
            <div className="group relative">
              <button
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-ink/20 text-xs font-semibold text-slate"
                type="button"
                aria-label="View AI Calculate Matches system prompt"
              >
                i
              </button>
              <div className="pointer-events-none invisible absolute right-0 top-10 z-20 w-[34rem] rounded-xl border border-ink/10 bg-white p-3 text-xs text-ink shadow-lg group-hover:visible">
                <p className="mb-2 font-medium">AI Calculate Matches System Prompt</p>
                <p className="whitespace-pre-wrap text-slate">{BULK_DECISION_SYSTEM_PROMPT}</p>
              </div>
            </div>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium">Bulk Decision Guidance (required)</label>
          <textarea
            className="min-h-20 w-full rounded-lg border border-ink/20 px-3 py-2 text-sm"
            value={operatorGuidance}
            onChange={(event) => {
              setOperatorGuidance(event.target.value);
              if (bulkGuidanceError) setBulkGuidanceError(null);
            }}
            onBlur={() => {
              if (selectedCaseId) {
                updateCaseGuidance.mutate({ caseId: selectedCaseId, operatorGuidance });
              }
            }}
            placeholder="Include salary range criteria, trade-off preferences, and acceptance thresholds."
            required
          />
          {bulkGuidanceError ? <p className="mt-1 text-xs text-red-700">{bulkGuidanceError}</p> : null}
        </div>

        {bulkResultText ? <p className="rounded bg-green-50 px-3 py-2 text-sm text-green-700">{bulkResultText}</p> : null}

        {selectedCaseLlmPayload ? (
          <div className="rounded-xl border border-ink/10 bg-paper p-4 text-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">Job Listing Context</p>
              <div className="flex items-center gap-2">
                {copyStatusText ? <span className="text-xs text-slate">{copyStatusText}</span> : null}
                <button
                  className="rounded-full border border-ink/20 bg-white px-3 py-1 text-xs hover:bg-ink hover:text-paper"
                  type="button"
                  onClick={handleCopyLlmContextJson}
                >
                  Copy LLM Context JSON
                </button>
                <span className="rounded-full bg-ink/10 px-2 py-0.5 text-[11px] text-ink/80">Sent with each AI Calculate Matches run</span>
              </div>
            </div>

            <div className="mb-4 rounded-lg border border-slate-300/60 bg-slate-100/60 px-3 py-2">
              <WorkdayBenchmarkPanel />
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-lg border border-ink/10 bg-white px-3 py-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate">Job Title</p>
                <p className="mt-0.5">{formatListingValue(selectedCaseLlmPayload.job_title)}</p>
              </div>
              <div className="rounded-lg border border-ink/10 bg-white px-3 py-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate">Listing Status</p>
                <p className="mt-0.5">{formatListingValue(selectedCaseLlmPayload.status)}</p>
              </div>
              <div className="rounded-lg border border-ink/10 bg-white px-3 py-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate">Jurisdiction</p>
                <p className="mt-0.5">{formatListingValue(selectedCaseLlmPayload.jurisdiction)}</p>
              </div>
              <div className="rounded-lg border border-ink/10 bg-white px-3 py-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate">Currency</p>
                <p className="mt-0.5">{formatListingValue(selectedCaseLlmPayload.currency)}</p>
              </div>
              <div className="rounded-lg border border-ink/10 bg-white px-3 py-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate">Category</p>
                <p className="mt-0.5">{formatListingValue(selectedCaseLlmPayload.category)}</p>
              </div>
              <div className="rounded-lg border border-ink/10 bg-white px-3 py-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate">Work Arrangement</p>
                <p className="mt-0.5">{formatListingValue(selectedCaseLlmPayload.work_arrangement)}</p>
              </div>
              <div className="rounded-lg border border-ink/10 bg-white px-3 py-2 md:col-span-2 xl:col-span-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate">Location</p>
                <p className="mt-0.5">{formatListingValue(selectedCaseLlmPayload.location)}</p>
              </div>
              <div className="rounded-lg border border-ink/10 bg-white px-3 py-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate">Budget Floor</p>
                <p className="mt-0.5">{formatStatMoney(selectedCaseLlmPayload.budget_floor)}</p>
              </div>
              <div className="rounded-lg border border-ink/10 bg-white px-3 py-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate">Budget Target</p>
                <p className="mt-0.5">{formatStatMoney(selectedCaseLlmPayload.budget_target)}</p>
              </div>
              <div className="rounded-lg border border-ink/10 bg-white px-3 py-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate">Budget Ceiling</p>
                <p className="mt-0.5">{formatStatMoney(selectedCaseLlmPayload.budget_ceiling)}</p>
              </div>
              <div className="rounded-lg border border-ink/10 bg-white px-3 py-2 md:col-span-2 xl:col-span-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate">Job Description</p>
                <p className="mt-0.5 whitespace-pre-wrap">{formatListingValue(selectedCaseLlmPayload.job_description)}</p>
              </div>
              <div className="rounded-lg border border-ink/10 bg-white px-3 py-2 md:col-span-2 xl:col-span-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate">Responsibilities</p>
                {selectedCaseLlmPayload.responsibilities.length > 0 ? (
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
                    {selectedCaseLlmPayload.responsibilities.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-0.5">Not provided</p>
                )}
              </div>
              <div className="rounded-lg border border-ink/10 bg-white px-3 py-2 xl:col-span-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate">Benefits (Raw)</p>
                {Object.keys(selectedCaseLlmPayload.benefits).length > 0 ? (
                  <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-ink/5 p-2 text-[11px]">
                    {JSON.stringify(selectedCaseLlmPayload.benefits, null, 2)}
                  </pre>
                ) : (
                  <p className="mt-0.5">Not provided</p>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <section className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm">
        <div className="border-b border-ink/10 px-4 py-3">
          <h3 className="font-display text-lg">Candidate Bids</h3>
          <p className="text-xs text-slate">Shows all bids: invited (awaiting), submitted (open/closed), and their decision status.</p>
        </div>
        <div className="border-b border-ink/10 bg-paper/60 px-4 py-3">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium">Applicant</label>
              <input
                className="w-full rounded border border-ink/20 px-2 py-1.5 text-xs"
                placeholder="Search applicant"
                value={filterApplicant}
                onChange={(event) => setFilterApplicant(event.target.value)}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium">Decision Status</label>
              <div className="flex flex-wrap items-center gap-3 rounded border border-ink/20 bg-white px-2 py-1.5 text-xs">
                <label className="inline-flex items-center gap-1">
                  <input type="checkbox" checked={filterDecisionPending} onChange={(event) => setFilterDecisionPending(event.target.checked)} />
                  Pending
                </label>
                <label className="inline-flex items-center gap-1">
                  <input type="checkbox" checked={filterDecisionAccepted} onChange={(event) => setFilterDecisionAccepted(event.target.checked)} />
                  Accepted
                </label>
                <label className="inline-flex items-center gap-1">
                  <input type="checkbox" checked={filterDecisionRejected} onChange={(event) => setFilterDecisionRejected(event.target.checked)} />
                  Rejected
                </label>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium">Lifecycle Status</label>
              <div className="flex flex-wrap items-center gap-3 rounded border border-ink/20 bg-white px-2 py-1.5 text-xs">
                <label className="inline-flex items-center gap-1">
                  <input type="checkbox" checked={filterLifecycleAwaiting} onChange={(event) => setFilterLifecycleAwaiting(event.target.checked)} />
                  Awaiting
                </label>
                <label className="inline-flex items-center gap-1">
                  <input type="checkbox" checked={filterLifecycleOpen} onChange={(event) => setFilterLifecycleOpen(event.target.checked)} />
                  Open
                </label>
                <label className="inline-flex items-center gap-1">
                  <input type="checkbox" checked={filterLifecycleClosed} onChange={(event) => setFilterLifecycleClosed(event.target.checked)} />
                  Closed
                </label>
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              className="rounded-full border border-ink/20 px-3 py-1 text-xs"
              type="button"
              onClick={() => setShowAdvancedFilters((value) => !value)}
            >
              {showAdvancedFilters ? "Hide Advanced Filters" : "Show Advanced Filters"}
            </button>
            <button className="rounded-full border border-ink/20 px-3 py-1 text-xs" type="button" onClick={clearFilters}>
              Clear Filters
            </button>
            <span className="text-xs text-slate">
              {isFiltered ? `Filtered view: showing ${filteredBids.length} of ${allBids.length} bids` : `Showing all ${allBids.length} bids`}
            </span>
          </div>

          {showAdvancedFilters ? (
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium">Insurance Rank</label>
                <select className="w-full rounded border border-ink/20 px-2 py-1.5 text-xs" value={filterInsuranceRank} onChange={(event) => setFilterInsuranceRank(event.target.value as "all" | "1" | "2" | "3")}>
                  <option value="all">All</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">PTO Rank</label>
                <select className="w-full rounded border border-ink/20 px-2 py-1.5 text-xs" value={filterPtoRank} onChange={(event) => setFilterPtoRank(event.target.value as "all" | "1" | "2" | "3")}>
                  <option value="all">All</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">WFH Rank</label>
                <select className="w-full rounded border border-ink/20 px-2 py-1.5 text-xs" value={filterWfhRank} onChange={(event) => setFilterWfhRank(event.target.value as "all" | "1" | "2" | "3")}>
                  <option value="all">All</option>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                </select>
              </div>
            </div>
          ) : null}
        </div>
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full min-w-[1200px] text-left text-sm">
            <thead className="bg-ink text-paper">
            <tr>
              <th className="sticky left-0 top-0 z-30 min-w-44 bg-ink px-4 py-3 font-medium">
                <HeaderWithTooltip title="Status" tooltip="Two status tracks: decision status (pending/accepted/rejected) and lifecycle (awaiting/open/closed)." />
              </th>
              <th className="sticky top-0 z-20 bg-ink px-4 py-3 font-medium">
                <HeaderWithTooltip title="Candidate" tooltip="Candidate name and email. Date shown is when they submitted their bid (or when invited for pending)." />
              </th>
              <th className="sticky top-0 z-20 bg-ink px-4 py-3 font-medium">
                <HeaderWithTooltip title="Salary Range" tooltip="Candidate-provided salary interval (min to max). Shown dashes for invited bids not yet submitted." />
              </th>
              <th className="sticky top-0 z-20 bg-ink px-4 py-3 font-medium">
                <HeaderWithTooltip title="Priorities" tooltip={`Candidate benefit priorities (Low / Med / High) for benefits offered by this role: ${benefitConfig ? [benefitConfig.showInsuranceRank && benefitConfig.insuranceLabel, benefitConfig.showPtoRank && benefitConfig.ptoLabel, benefitConfig.showWfhRank && benefitConfig.wfhLabel].filter(Boolean).join(", ") : "Insurance, PTO, WFH"}.`} />
              </th>
              <th className="sticky top-0 z-20 bg-ink px-4 py-3 font-medium">
                <HeaderWithTooltip title="Decision Reason" tooltip="Operator or LLM rationale for accepted/rejected decision. Editable until the response is sent." />
              </th>
              <th className="sticky top-0 z-20 bg-ink px-4 py-3 font-medium">
                <HeaderWithTooltip title="Response Message" tooltip="Message intended to be sent to applicant. Can be edited and saved before terminal send." />
              </th>
              <th className="sticky top-0 z-20 bg-ink px-4 py-3 font-medium">
                <HeaderWithTooltip title="Actions" tooltip="Per-bid operations: accept, reject, save message, and send response. Closed bids are locked." />
              </th>
            </tr>
          </thead>
          <tbody>
            {bidsLoading ? (
              <tr>
                <td className="px-4 py-3 text-slate" colSpan={7}>Loading bids...</td>
              </tr>
            ) : filteredBids.length === 0 ? (
              <tr>
                <td className="px-4 py-3 text-slate" colSpan={7}>No bids match the current filters.</td>
              </tr>
            ) : (
              filteredBids.map((bid) => {
                const isAwaiting = bid.submission_status === "invitation_pending";
                const isSent = bid.submission_status === "response_sent";
                const hasCandidateSubmission = hasCandidateBidSubmission(bid);
                const responseDraft = responseEdits[bid.id] ?? "";
                const responseSaved = bid.response_message ?? "";
                const hasPendingResponseEdit = normalizeResponseMessage(responseDraft) !== normalizeResponseMessage(responseSaved);
                const responseMessage = normalizeResponseMessage(responseDraft);
                const canDecide = hasCandidateSubmission && !isSent;
                // UX rule: switching between accepted and rejected clears the draft response,
                // unsaved draft changes are highlighted, and Send Response requires non-empty text.
                const canSend = canDecide && bid.decision_status !== "pending" && responseMessage.length > 0;
                const actionBlockedReason = !hasCandidateSubmission
                  ? "Waiting for candidate bid submission"
                  : isSent
                  ? "Response already sent"
                  : "";
                const sendBlockedReason = !hasCandidateSubmission
                  ? "Waiting for candidate bid submission"
                  : isSent
                  ? "Response already sent"
                  : bid.decision_status === "pending"
                  ? "Set decision before sending response"
                  : responseMessage.length === 0
                  ? "Write a response message before sending"
                  : "";
                return (
                  <tr key={bid.id} className={`border-t border-ink/10 align-top ${isAwaiting ? "opacity-60" : ""} ${isSent ? "bg-zinc-50" : ""}`}>
                    <td className={`sticky left-0 z-10 px-4 py-3 ${isSent ? "bg-zinc-50" : isAwaiting ? "bg-amber-50/60" : "bg-white"}`}>
                      <div className="flex flex-col gap-2">
                        <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium ${statusPillClass(bid.decision_status)}`}>
                          <span className={`h-2 w-2 rounded-full ${bid.decision_status === "accepted" ? "bg-green-600" : bid.decision_status === "rejected" ? "bg-red-600" : "bg-amber-600"}`} />
                          {bid.decision_status}
                        </span>
                        <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium ${responsePillClass(bid.submission_status)}`}>
                          <span className={`h-2 w-2 rounded-full ${bid.submission_status === "response_sent" ? "bg-zinc-300" : bid.submission_status === "invitation_pending" ? "bg-amber-500" : "bg-zinc-600"}`} />
                          {bid.submission_status === "response_sent" ? "Bid Closed" : bid.submission_status === "invitation_pending" ? "Bid Invitation Sent" : "Bid Open"}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 min-w-44">
                      <div className="flex flex-col gap-0.5">
                        {bid.candidate_name ? (
                          <span className="font-medium text-sm">{bid.candidate_name}</span>
                        ) : null}
                        <span className="text-xs text-slate">{bid.candidate_email ?? bid.applicant_identifier}</span>
                        <span className="text-xs text-ink/40 mt-0.5">
                          {isAwaiting
                            ? `Invited ${formatReceivedDate(bid.received_at)}`
                            : bid.candidate_submitted_at
                            ? `Submitted ${formatReceivedDate(bid.candidate_submitted_at)}`
                            : `Received ${formatReceivedDate(bid.received_at)}`}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {isAwaiting ? (
                        <span className="text-sm text-slate">—</span>
                      ) : isAdmin ? (
                        <span>${fmtMoney(bid.salary_min)} – ${fmtMoney(bid.salary_max)}</span>
                      ) : (
                        <span
                          className="select-none rounded bg-ink/10 px-2 py-0.5 text-xs text-transparent"
                          style={{ filter: "blur(6px)", userSelect: "none" }}
                          title="Salary specifics are entrusted with SalarySafe"
                        >
                          ${fmtMoney(bid.salary_min)} – ${fmtMoney(bid.salary_max)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 min-w-36">
                      {isAwaiting ? (
                        <span className="text-sm text-slate">—</span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {(benefitConfig?.showInsuranceRank ?? true) && (
                            <RankChip label={benefitConfig?.insuranceLabel ?? "Insurance"} rank={bid.insurance_importance_rank} />
                          )}
                          {(benefitConfig?.showPtoRank ?? true) && (
                            <RankChip label={benefitConfig?.ptoLabel ?? "PTO"} rank={bid.pto_importance_rank} />
                          )}
                          {(benefitConfig?.showWfhRank ?? true) && (
                            <RankChip label={benefitConfig?.wfhLabel ?? "WFH"} rank={bid.wfh_importance_rank} />
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 min-w-64">
                      <textarea
                        className="min-h-16 w-full rounded border border-ink/20 px-2 py-1 text-xs"
                        value={reasonEdits[bid.id] ?? ""}
                        onChange={(event) => setReasonEdits((prev) => ({ ...prev, [bid.id]: event.target.value }))}
                        disabled={isSent}
                      />
                    </td>
                    <td className="px-4 py-3 min-w-80">
                      <div className="space-y-2">
                        <textarea
                          className={`min-h-20 w-full rounded px-2 py-1 text-xs transition-colors ${hasPendingResponseEdit ? "border-amber-500 bg-amber-50 text-amber-950" : "border-ink/20 bg-white text-ink"}`}
                          value={responseEdits[bid.id] ?? ""}
                          onChange={(event) => setResponseEdits((prev) => ({ ...prev, [bid.id]: event.target.value }))}
                          disabled={isSent}
                        />
                        <button
                          className="rounded-full border border-ink/20 px-3 py-1 text-xs disabled:opacity-50"
                          type="button"
                          disabled={isSent || saveResponse.isPending}
                          onClick={() => handleSaveResponseMessage(bid.id)}
                        >
                          Save Message
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-2">
                        <Link
                          className="rounded-full border border-ink/20 px-3 py-1 text-xs text-center hover:bg-ink hover:text-paper"
                          to={`/invitations/${bid.id}`}
                        >
                          View
                        </Link>
                        <button
                          className="rounded-full bg-green-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                          type="button"
                          disabled={!canDecide || updateDecision.isPending}
                          title={actionBlockedReason}
                          onClick={() => handleDecision(bid.id, "accepted", bid.decision_status)}
                        >
                          Accept
                        </button>
                        <button
                          className="rounded-full bg-red-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                          type="button"
                          disabled={!canDecide || updateDecision.isPending}
                          title={actionBlockedReason}
                          onClick={() => handleDecision(bid.id, "rejected", bid.decision_status)}
                        >
                          Reject
                        </button>
                        <button
                          className={`rounded-full px-3 py-1 text-xs font-medium text-paper disabled:opacity-50 ${hasPendingResponseEdit ? "bg-amber-600 ring-2 ring-amber-300" : "bg-ink"}`}
                          type="button"
                          disabled={!canSend || sendResponse.isPending}
                          title={!canSend ? sendBlockedReason : hasPendingResponseEdit ? "Unsaved response draft will prompt for confirmation" : ""}
                          onClick={() => handleSendResponse(bid.id, hasPendingResponseEdit)}
                        >
                          <span className="inline-flex items-center gap-2">
                            {hasPendingResponseEdit && !isSent ? <span aria-hidden="true" className="h-2 w-2 rounded-full bg-white/90" /> : null}
                            <span>{isSent ? "Response Sent" : hasPendingResponseEdit ? "Send Response*" : "Send Response"}</span>
                          </span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-lg">Bid Statistics Summary</h3>
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${isFiltered ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"}`}>
            {isFiltered ? "Table is currently filtered (stats below use full dataset)" : "Table unfiltered"}
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-7">
          <div className="rounded-lg border border-ink/10 p-3 text-sm">
            <p className="text-xs text-slate">Total Bids</p>
            <p className="text-lg font-semibold">{totalBids}</p>
          </div>
          <div className="rounded-lg border border-ink/10 p-3 text-sm">
            <p className="text-xs text-slate">Awaiting</p>
            <p className="text-lg font-semibold text-amber-600">{invitationPendingCount}</p>
          </div>
          <div className="rounded-lg border border-ink/10 p-3 text-sm">
            <p className="text-xs text-slate">Pending</p>
            <p className="text-lg font-semibold">{decisionPendingCount}</p>
          </div>
          <div className="rounded-lg border border-ink/10 p-3 text-sm">
            <p className="text-xs text-slate">Accepted</p>
            <p className="text-lg font-semibold text-green-700">{decisionAcceptedCount}</p>
          </div>
          <div className="rounded-lg border border-ink/10 p-3 text-sm">
            <p className="text-xs text-slate">Rejected</p>
            <p className="text-lg font-semibold text-red-700">{decisionRejectedCount}</p>
          </div>
          <div className="rounded-lg border border-ink/10 p-3 text-sm">
            <p className="text-xs text-slate">Open</p>
            <p className="text-lg font-semibold">{openCount}</p>
          </div>
          <div className="rounded-lg border border-ink/10 p-3 text-sm">
            <p className="text-xs text-slate">Closed</p>
            <p className="text-lg font-semibold">{closedCount}</p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-ink/10 p-3 text-sm">
            <p className="mb-2 text-sm font-medium">All Bids Midpoint Stats</p>
            <p className="text-xs text-slate">Count: {allMidpointStats.count}</p>
            <p className="text-xs text-slate">Min: {formatStatMoney(allMidpointStats.min)}</p>
            <p className="text-xs text-slate">Max: {formatStatMoney(allMidpointStats.max)}</p>
            <p className="text-xs text-slate">Avg: {formatStatMoney(allMidpointStats.avg)}</p>
          </div>
          <div className="rounded-lg border border-ink/10 p-3 text-sm">
            <p className="mb-2 text-sm font-medium text-green-700">Accepted Midpoint Stats</p>
            <p className="text-xs text-slate">Count: {acceptedMidpointStats.count}</p>
            <p className="text-xs text-slate">Min: {formatStatMoney(acceptedMidpointStats.min)}</p>
            <p className="text-xs text-slate">Max: {formatStatMoney(acceptedMidpointStats.max)}</p>
            <p className="text-xs text-slate">Avg: {formatStatMoney(acceptedMidpointStats.avg)}</p>
          </div>
          <div className="rounded-lg border border-ink/10 p-3 text-sm">
            <p className="mb-2 text-sm font-medium text-red-700">Rejected Midpoint Stats</p>
            <p className="text-xs text-slate">Count: {rejectedMidpointStats.count}</p>
            <p className="text-xs text-slate">Min: {formatStatMoney(rejectedMidpointStats.min)}</p>
            <p className="text-xs text-slate">Max: {formatStatMoney(rejectedMidpointStats.max)}</p>
            <p className="text-xs text-slate">Avg: {formatStatMoney(rejectedMidpointStats.avg)}</p>
          </div>
        </div>
      </section>
    </section>
  );
}
