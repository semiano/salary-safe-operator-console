import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { getTokenRole } from "../auth/token";

import { useCases, useUpdateCaseGuidance, useUpdateCaseStatus } from "../hooks/useCases";
import {
  useAiAutoRespondPhase1Bid,
  useBidHistory,
  useClosePhase1Bid,
  useBulkDecidePhase1Bids,
  usePhase1Bids,
  useSendPhase1BidMessage,
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
  "You are evaluating phase 1 applicant bids for a hiring team. Return JSON only with key decisions. decisions must be an array of objects with keys: bid_id, match_score, decision_status, decision_reason, response_message. match_score must be a number from 0 to 100 where higher means stronger fit. Do not reject candidates simply for having a target salary or for being below target. Use affordability logic to filter out candidates who are too high on total compensation and benefits. decision_status must be accepted or rejected. response_message must be professional and concise.";

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

function buildDefaultCloseMessage(candidateName: string | null, decisionStatus: "pending" | "accepted" | "rejected"): string {
  const greeting = `Hi ${candidateName || "there"},`;
  if (decisionStatus === "accepted") {
    return `${greeting}\n\nThank you for your submission. We are pleased to let you know your bid has been accepted.\n\nBest regards,\nSalarySafe Hiring Team`;
  }
  if (decisionStatus === "rejected") {
    return `${greeting}\n\nThank you for your submission and interest. After review, we will not be moving forward with your bid at this time.\n\nBest regards,\nSalarySafe Hiring Team`;
  }
  return `${greeting}\n\nThank you for your submission. We are sharing an update on your bid.\n\nBest regards,\nSalarySafe Hiring Team`;
}

function buildDefaultMessageSubject(roleTitle: string | null, mode: "message" | "close"): string {
  const role = roleTitle?.trim() || "this role";
  return mode === "close" ? `Final update on your bid for ${role}` : `Update regarding your invitation for ${role}`;
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

function formatMatchScore(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const clamped = Math.max(0, Math.min(100, value));
  const rounded = Math.round(clamped * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
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

function truncateText(value: string, maxLength: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, Math.max(0, maxLength - 1)).trimEnd()}\u2026`;
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

function summarizeMatchScoreRange(items: Array<{ match_score: number | null }>): { count: number; avg: number | null } {
  const numericScores = items
    .map((item) => item.match_score)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (numericScores.length === 0) {
    return { count: 0, avg: null };
  }
  const sum = numericScores.reduce((total, value) => total + value, 0);
  return { count: numericScores.length, avg: sum / numericScores.length };
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
  const { data: cases } = useCases();
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
  const [showCloseBiddingConfirm, setShowCloseBiddingConfirm] = useState(false);
  const [closeBiddingResult, setCloseBiddingResult] = useState<{ sent: number; failed: number } | null>(null);
  const [isSendingAll, setIsSendingAll] = useState(false);

  const [tableDensityCompact, setTableDensityCompact] = useState(false);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [page, setPage] = useState(1);
  const [reviewBidId, setReviewBidId] = useState<string | null>(null);
  const [openActionMenuId, setOpenActionMenuId] = useState<string | null>(null);
  const [actionMenuPos, setActionMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [historyBidId, setHistoryBidId] = useState<string | null>(null);
  const [messageBidId, setMessageBidId] = useState<string | null>(null);
  const [messageMode, setMessageMode] = useState<"message" | "close">("message");
  const [messageSubject, setMessageSubject] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [messageError, setMessageError] = useState<string | null>(null);

  const isAdmin = getTokenRole() === "admin";

  const [reasonEdits, setReasonEdits] = useState<Record<string, string>>({});
  const [responseEdits, setResponseEdits] = useState<Record<string, string>>({});

  const bulkDecide = useBulkDecidePhase1Bids();
  const aiAutoRespond = useAiAutoRespondPhase1Bid();
  const updateDecision = useUpdatePhase1BidDecision();
  const saveResponse = useSavePhase1BidResponseMessage();
  const sendResponse = useSendPhase1BidResponse();
  const sendMessage = useSendPhase1BidMessage();
  const closeBid = useClosePhase1Bid();
  const updateCaseGuidance = useUpdateCaseGuidance();
  const updateCaseStatus = useUpdateCaseStatus();
  const { data: bids, isLoading: bidsLoading } = usePhase1Bids(selectedCaseId);
  const { data: historyEvents, isLoading: historyLoading } = useBidHistory(historyBidId);

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
  const sendableBids = (bids ?? []).filter((bid) => {
    if (!hasCandidateBidSubmission(bid)) return false;
    if (bid.submission_status === "response_sent") return false;
    if (bid.decision_status === "pending") return false;
    const responseMsg = normalizeResponseMessage(responseEdits[bid.id] ?? bid.response_message ?? "");
    return responseMsg.length > 0;
  });

  const invitationPendingCount = allBids.filter((bid) => bid.submission_status === "invitation_pending").length;
  const submittedBids = allBids.filter((bid) => bid.submission_status !== "invitation_pending");
  const allMidpointStats = summarizeMidpointRange(submittedBids);
  const acceptedMidpointStats = summarizeMidpointRange(submittedBids.filter((bid) => bid.decision_status === "accepted"));
  const rejectedMidpointStats = summarizeMidpointRange(submittedBids.filter((bid) => bid.decision_status === "rejected"));
  const overallMatchScoreStats = summarizeMatchScoreRange(submittedBids);
  const acceptedMatchScoreStats = summarizeMatchScoreRange(submittedBids.filter((bid) => bid.decision_status === "accepted"));
  const rejectedMatchScoreStats = summarizeMatchScoreRange(submittedBids.filter((bid) => bid.decision_status === "rejected"));

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

  // ── Filter dropdown <-> boolean mapping ──────────────────────────────────────
  const decisionFilterValue =
    filterDecisionPending && filterDecisionAccepted && filterDecisionRejected ? "all"
    : filterDecisionPending && !filterDecisionAccepted && !filterDecisionRejected ? "pending"
    : !filterDecisionPending && filterDecisionAccepted && !filterDecisionRejected ? "accepted"
    : !filterDecisionPending && !filterDecisionAccepted && filterDecisionRejected ? "rejected"
    : "all";
  function applyDecisionFilter(value: string) {
    setFilterDecisionPending(value === "all" || value === "pending");
    setFilterDecisionAccepted(value === "all" || value === "accepted");
    setFilterDecisionRejected(value === "all" || value === "rejected");
  }
  const lifecycleFilterValue =
    filterLifecycleAwaiting && filterLifecycleOpen && filterLifecycleClosed ? "all"
    : filterLifecycleAwaiting && !filterLifecycleOpen && !filterLifecycleClosed ? "awaiting"
    : !filterLifecycleAwaiting && filterLifecycleOpen && !filterLifecycleClosed ? "open"
    : !filterLifecycleAwaiting && !filterLifecycleOpen && filterLifecycleClosed ? "closed"
    : "all";
  function applyLifecycleFilter(value: string) {
    setFilterLifecycleAwaiting(value === "all" || value === "awaiting");
    setFilterLifecycleOpen(value === "all" || value === "open");
    setFilterLifecycleClosed(value === "all" || value === "closed");
  }
  const advancedFilterActive = filterInsuranceRank !== "all" || filterPtoRank !== "all" || filterWfhRank !== "all";

  // ── Pagination ───────────────────────────────────────────────────────────────
  const totalFiltered = filteredBids.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / rowsPerPage));
  const currentPage = Math.min(page, totalPages);
  const pageStartIndex = (currentPage - 1) * rowsPerPage;
  const pagedBids = filteredBids.slice(pageStartIndex, pageStartIndex + rowsPerPage);
  const showingStart = totalFiltered === 0 ? 0 : pageStartIndex + 1;
  const showingEnd = Math.min(pageStartIndex + rowsPerPage, totalFiltered);

  const reviewBid = (bids ?? []).find((bid) => bid.id === reviewBidId) ?? null;
  const actionMenuBid = (bids ?? []).find((bid) => bid.id === openActionMenuId) ?? null;
  const historyBid = (bids ?? []).find((bid) => bid.id === historyBidId) ?? null;
  const messageBid = (bids ?? []).find((bid) => bid.id === messageBidId) ?? null;
  const rowPad = tableDensityCompact ? "py-2" : "py-3";

  useEffect(() => {
    setPage(1);
  }, [
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
    rowsPerPage,
    selectedCaseId,
  ]);

  useEffect(() => {
    if (!openActionMenuId) return;
    const onClick = () => setOpenActionMenuId(null);
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpenActionMenuId(null); };
    const onScrollOrResize = () => setOpenActionMenuId(null);
    window.addEventListener("click", onClick);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      window.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [openActionMenuId]);

  useEffect(() => {
    if (!reviewBidId) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setReviewBidId(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reviewBidId]);

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

  function openMessageDialog(bidId: string, mode: "message" | "close") {
    const bid = (bids ?? []).find((entry) => entry.id === bidId);
    if (!bid) return;

    if (mode === "close" && bid.decision_status === "pending") {
      window.alert("Cannot close while decision status is pending.");
      return;
    }

    const roleTitle = selectedCaseMeta?.jobTitle ?? selectedCase?.title ?? bid.job_title;
    setMessageBidId(bidId);
    setMessageMode(mode);
    setMessageSubject(buildDefaultMessageSubject(roleTitle, mode));
    if (mode === "close") {
      setMessageBody((responseEdits[bid.id] || bid.response_message || buildDefaultCloseMessage(bid.candidate_name, bid.decision_status)).trim());
    } else {
      setMessageBody(`Hi ${bid.candidate_name || "there"},\n\nWe wanted to share an update on your invitation.\n\nBest regards,\nSalarySafe Hiring Team`);
    }
    setMessageError(null);
  }

  async function handleSubmitMessageDialog() {
    if (!messageBid) return;
    const trimmedSubject = messageSubject.trim();
    const trimmedBody = messageBody.trim();
    if (!trimmedSubject || !trimmedBody) {
      setMessageError("Subject and message are required.");
      return;
    }
    if (messageMode === "close" && messageBid.decision_status === "pending") {
      setMessageError("Cannot close while decision status is pending.");
      return;
    }

    setMessageError(null);
    if (messageMode === "message") {
      await sendMessage.mutateAsync({ bidId: messageBid.id, subject: trimmedSubject, message: trimmedBody });
    } else {
      await closeBid.mutateAsync({ bidId: messageBid.id, response_message: trimmedBody });
    }
    setMessageBidId(null);
  }

  async function handleCloseBiddingAndSendAll() {
    setShowCloseBiddingConfirm(false);
    setCloseBiddingResult(null);
    setIsSendingAll(true);
    let sent = 0;
    let failed = 0;
    for (const bid of sendableBids) {
      try {
        await sendResponse.mutateAsync(bid.id);
        sent++;
      } catch {
        failed++;
      }
    }
    if (selectedCaseId) {
      try {
        await updateCaseStatus.mutateAsync({ caseId: selectedCaseId, status: "closed" });
      } catch {
        // status update failure is non-critical
      }
    }
    setIsSendingAll(false);
    setCloseBiddingResult({ sent, failed });
  }

  async function handleBulkDecide() {
    if (!selectedCaseId) return;
    if (!operatorGuidance.trim()) {
      setBulkGuidanceError("Match Decision guidance is required before running AI Calculate Matches.");
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
    <>
    <section className="relative left-1/2 w-screen max-w-[1480px] -translate-x-1/2 space-y-5 px-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link className="rounded-full border border-ink/20 px-3 py-1.5 text-xs hover:bg-ink hover:text-paper" to="/job-listings">
            ← Job Listings
          </Link>
          <h2 className="font-display text-xl">View Bids, Calculate Matches, Send Responses</h2>
        </div>
      </div>

      {selectedCaseLlmPayload ? (
        <section className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm">
          <details className="px-4 py-3">
            <summary className="cursor-pointer list-none">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-lg">Job Details</h3>
                  <p className="text-xs text-slate">
                    {formatListingValue(selectedCaseLlmPayload.job_title)} · {selectedCase?.created_at ? new Date(selectedCase.created_at).toLocaleString() : "Unknown date"}
                  </p>
                  <p className="mt-2 max-w-4xl text-sm text-ink/80">
                    {truncateText(formatListingValue(selectedCaseLlmPayload.job_description), 220)}
                  </p>
                </div>
                <div className="rounded-full border border-ink/20 bg-white px-3 py-1 text-xs text-slate">
                  Expand for full details
                </div>
              </div>
            </summary>

            <div className="mt-4 rounded-xl border border-ink/10 bg-white p-4 text-sm">
              <div className="mb-3 flex flex-wrap items-center gap-2">
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
          </details>
        </section>
      ) : null}

      <section className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-4">
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

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-ink/10 p-3 text-sm">
            <p className="mb-2 flex items-center gap-2 text-sm font-medium">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">%</span>
              Overall Match Score
            </p>
            <p className="text-xs text-slate">Scored bids: {overallMatchScoreStats.count}</p>
            <p className="text-xs text-slate">Avg: {formatMatchScore(overallMatchScoreStats.avg)}</p>
          </div>
          <div className="rounded-lg border border-ink/10 p-3 text-sm">
            <p className="mb-2 flex items-center gap-2 text-sm font-medium text-green-700">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-[11px] font-bold text-green-700">✓</span>
              Accepted Match Score
            </p>
            <p className="text-xs text-slate">Scored bids: {acceptedMatchScoreStats.count}</p>
            <p className="text-xs text-slate">Avg: {formatMatchScore(acceptedMatchScoreStats.avg)}</p>
          </div>
          <div className="rounded-lg border border-ink/10 p-3 text-sm">
            <p className="mb-2 flex items-center gap-2 text-sm font-medium text-red-700">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-100 text-[11px] font-bold text-red-700">✕</span>
              Rejected Match Score
            </p>
            <p className="text-xs text-slate">Scored bids: {rejectedMatchScoreStats.count}</p>
            <p className="text-xs text-slate">Avg: {formatMatchScore(rejectedMatchScoreStats.avg)}</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm space-y-3">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <div>
            <p className="mb-0.5 text-xs font-medium text-slate">Match Criteria</p>
            <p className="text-sm text-slate">Use the guidance below to shape batch matching decisions for the selected listing.</p>
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
          <label className="mb-1 block text-xs font-medium">Match Decision guidance (required)</label>
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
      </section>

      <section className="overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-sm">
        <div className="border-b border-ink/10 px-4 py-3">
          <h3 className="font-display text-lg">Candidate Bid and Invitations</h3>
          <p className="text-xs text-slate">Shows all bids: invited (awaiting), submitted (open/closed), and their decision status.</p>
        </div>
        <div className="border-b border-ink/10 bg-paper/60 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-52 flex-1">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="9" cy="9" r="6" />
                  <path d="m14 14 4 4" strokeLinecap="round" />
                </svg>
              </span>
              <input
                className="w-full rounded-lg border border-ink/20 bg-white py-1.5 pl-8 pr-2 text-xs"
                placeholder="Search candidates..."
                value={filterApplicant}
                onChange={(event) => setFilterApplicant(event.target.value)}
              />
            </div>

            <select
              className="rounded-lg border border-ink/20 bg-white px-2.5 py-1.5 text-xs"
              value={decisionFilterValue}
              onChange={(event) => applyDecisionFilter(event.target.value)}
              aria-label="Decision status filter"
            >
              <option value="all">All Decision Status</option>
              <option value="pending">Pending</option>
              <option value="accepted">Accepted</option>
              <option value="rejected">Rejected</option>
            </select>

            <select
              className="rounded-lg border border-ink/20 bg-white px-2.5 py-1.5 text-xs"
              value={lifecycleFilterValue}
              onChange={(event) => applyLifecycleFilter(event.target.value)}
              aria-label="Lifecycle status filter"
            >
              <option value="all">All Lifecycle Status</option>
              <option value="awaiting">Awaiting</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </select>

            <div className="relative" onClick={(event) => event.stopPropagation()}>
              <button
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${advancedFilterActive ? "border-accent bg-accent/10 text-accent" : "border-ink/20 bg-white text-ink"}`}
                type="button"
                onClick={() => setShowAdvancedFilters((value) => !value)}
              >
                <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M3 5h14M6 10h8M9 15h2" strokeLinecap="round" />
                </svg>
                Advanced Filters
                {advancedFilterActive ? <span className="h-1.5 w-1.5 rounded-full bg-accent" /> : null}
              </button>
              {showAdvancedFilters ? (
                <div className="absolute left-0 top-full z-30 mt-2 w-72 rounded-xl border border-ink/10 bg-white p-3 shadow-lg">
                  <div className="grid gap-3">
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
                </div>
              ) : null}
            </div>

            <button className="rounded-lg border border-ink/20 bg-white px-2.5 py-1.5 text-xs" type="button" onClick={clearFilters}>
              Clear
            </button>

            <span className="ml-auto text-xs text-slate">
              Showing {showingStart}{showingEnd > showingStart ? `-${showingEnd}` : ""} of {totalFiltered}
            </span>

            <button
              className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border text-slate ${tableDensityCompact ? "border-accent bg-accent/10 text-accent" : "border-ink/20 bg-white"}`}
              type="button"
              title={tableDensityCompact ? "Switch to comfortable rows" : "Switch to compact rows"}
              aria-label="Toggle row density"
              onClick={() => setTableDensityCompact((value) => !value)}
            >
              <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <circle cx="10" cy="10" r="2.5" />
                <path d="M10 1.5v2M10 16.5v2M1.5 10h2M16.5 10h2M4 4l1.4 1.4M14.6 14.6 16 16M16 4l-1.4 1.4M5.4 14.6 4 16" strokeLinecap="round" />
              </svg>
            </button>
          </div>
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
                <HeaderWithTooltip title="Match Score" tooltip="AI-generated fit score from 0-100 based on affordability and role preference alignment." />
              </th>
              <th className="sticky top-0 z-20 bg-ink px-4 py-3 font-medium">
                <HeaderWithTooltip title="Decision Reason" tooltip="Operator or LLM rationale for accepted/rejected decision. Editable until the response is sent." />
              </th>
              <th className="sticky top-0 z-20 bg-ink px-4 py-3 font-medium">
                <HeaderWithTooltip title="Response Message" tooltip="Message intended to be sent to applicant. Can be edited and saved before terminal send." />
              </th>
              <th className="sticky top-0 z-20 bg-ink px-4 py-3 font-medium">
                <HeaderWithTooltip title="Actions" tooltip="Per-bid operations: accept, reject, and save message. Use the Close Bidding button below to send all responses at once." />
              </th>
            </tr>
          </thead>
          <tbody>
            {bidsLoading ? (
              <tr>
                <td className="px-4 py-3 text-slate" colSpan={8}>Loading bids...</td>
              </tr>
            ) : filteredBids.length === 0 ? (
              <tr>
                <td className="px-4 py-3 text-slate" colSpan={8}>No bids match the current filters.</td>
              </tr>
            ) : (
              pagedBids.map((bid) => {
                const isAwaiting = bid.submission_status === "invitation_pending";
                const isSent = bid.submission_status === "response_sent";
                const hasCandidateSubmission = hasCandidateBidSubmission(bid);
                const responseDraft = responseEdits[bid.id] ?? "";
                const responseSaved = bid.response_message ?? "";
                const hasPendingResponseEdit = normalizeResponseMessage(responseDraft) !== normalizeResponseMessage(responseSaved);
                const reasonText = (reasonEdits[bid.id] ?? "").trim();
                const responseText = normalizeResponseMessage(responseDraft);
                const hasScore = typeof bid.match_score === "number" && Number.isFinite(bid.match_score);
                const canDecide = hasCandidateSubmission && !isSent;
                const actionBlockedReason = !hasCandidateSubmission
                  ? "Waiting for candidate bid submission"
                  : isSent
                  ? "Response already sent"
                  : "";
                return (
                  <tr key={bid.id} className={`border-t border-ink/10 align-top ${isAwaiting ? "opacity-60" : ""} ${isSent ? "bg-zinc-50" : ""}`}>
                    <td className={`sticky left-0 z-10 px-4 ${rowPad} ${isSent ? "bg-zinc-50" : isAwaiting ? "bg-amber-50/60" : "bg-white"}`}>
                      <div className="flex flex-col gap-2">
                        <span className={`inline-flex w-fit items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium capitalize ${statusPillClass(bid.decision_status)}`}>
                          <span className={`h-2 w-2 rounded-full ${bid.decision_status === "accepted" ? "bg-green-600" : bid.decision_status === "rejected" ? "bg-red-600" : "bg-amber-600"}`} />
                          {bid.decision_status}
                        </span>
                        <span className={`inline-flex w-fit items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium ${responsePillClass(bid.submission_status)}`}>
                          <span className={`h-2 w-2 rounded-full ${bid.submission_status === "response_sent" ? "bg-zinc-300" : bid.submission_status === "invitation_pending" ? "bg-amber-500" : "bg-zinc-600"}`} />
                          {bid.submission_status === "response_sent" ? "Bid Closed" : bid.submission_status === "invitation_pending" ? "Bid Invitation Sent" : "Bid Open"}
                        </span>
                      </div>
                    </td>
                    <td className={`px-4 ${rowPad} min-w-44`}>
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
                    <td className={`px-4 ${rowPad}`}>
                      {isAwaiting ? (
                        <span className="text-sm text-slate">—</span>
                      ) : isAdmin ? (
                        <span className="text-sm">${fmtMoney(bid.salary_min)} – ${fmtMoney(bid.salary_max)}</span>
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
                    <td className={`px-4 ${rowPad} min-w-36`}>
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
                    <td className={`px-4 ${rowPad} min-w-24`}>
                      {isAwaiting || !hasScore ? (
                        <span className="flex h-12 w-12 items-center justify-center rounded-full border border-dashed border-ink/20 text-xs text-slate">—</span>
                      ) : (
                        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-100">
                          {formatMatchScore(bid.match_score)}
                        </span>
                      )}
                    </td>
                    <td className={`px-4 ${rowPad} min-w-56 max-w-72`}>
                      {isAwaiting ? (
                        <span className="text-xs italic text-slate">Not yet available</span>
                      ) : (
                        <div className="space-y-1">
                          {reasonText ? (
                            <p className="text-xs leading-snug text-ink/80">{truncateText(reasonText, 130)}</p>
                          ) : (
                            <p className="text-xs italic text-slate">No reason recorded</p>
                          )}
                          {!isSent ? (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                              onClick={() => setReviewBidId(bid.id)}
                            >
                              Review <span aria-hidden="true">↗</span>
                            </button>
                          ) : null}
                        </div>
                      )}
                    </td>
                    <td className={`px-4 ${rowPad} min-w-72 max-w-80`}>
                      {isAwaiting ? (
                        <span className="text-xs italic text-slate">Invitation sent. Awaiting candidate response.</span>
                      ) : (
                        <div className="space-y-1">
                          {responseText ? (
                            <p className="text-xs leading-snug text-ink/80">{truncateText(responseText, 150)}</p>
                          ) : (
                            <p className="text-xs italic text-slate">No message drafted</p>
                          )}
                          <div className="flex items-center gap-2">
                            {!isSent ? (
                              <button
                                type="button"
                                className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                                onClick={() => setReviewBidId(bid.id)}
                              >
                                Review <span aria-hidden="true">↗</span>
                              </button>
                            ) : null}
                            {hasPendingResponseEdit ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">Unsaved</span>
                            ) : null}
                          </div>
                        </div>
                      )}
                    </td>
                    <td className={`px-4 ${rowPad}`}>
                      <div className="flex justify-end" onClick={(event) => event.stopPropagation()}>
                        <button
                          type="button"
                          className="mr-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-ink/15 text-ink hover:bg-ink/5"
                          aria-label="History"
                          title="History"
                          onClick={() => setHistoryBidId(bid.id)}
                        >
                          <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                            <path d="M10 4v6l4 2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M3 10a7 7 0 1 0 2-4.9" strokeLinecap="round" />
                            <path d="M3 4v3h3" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-ink/15 text-ink hover:bg-ink/5"
                          aria-label="Actions"
                          title="Actions"
                          onClick={(event) => {
                            event.stopPropagation();
                            const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
                            setActionMenuPos({ top: rect.bottom + 6, left: rect.right - 192 });
                            setOpenActionMenuId((current) => (current === bid.id ? null : bid.id));
                          }}
                        >
                          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <circle cx="10" cy="4" r="1.6" />
                            <circle cx="10" cy="10" r="1.6" />
                            <circle cx="10" cy="16" r="1.6" />
                          </svg>
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
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink/10 px-4 py-3 text-xs text-slate">
          <div className="flex items-center gap-2">
            <span>Rows per page</span>
            <select
              className="rounded border border-ink/20 bg-white px-2 py-1 text-xs"
              value={rowsPerPage}
              onChange={(event) => setRowsPerPage(Number(event.target.value))}
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <span>
              {showingStart}{showingEnd > showingStart ? `-${showingEnd}` : ""} of {totalFiltered}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded border border-ink/20 bg-white disabled:opacity-40"
                aria-label="Previous page"
                disabled={currentPage <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                ‹
              </button>
              <span className="inline-flex h-7 min-w-7 items-center justify-center rounded border border-ink/20 bg-white px-2 font-medium text-ink">
                {currentPage}
              </span>
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded border border-ink/20 bg-white disabled:opacity-40"
                aria-label="Next page"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
              >
                ›
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-red-200 bg-red-50 p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="font-display text-lg text-red-900">Close Bidding &amp; Send Responses</h3>
            <p className="mt-1 text-sm text-red-700">
              Sends responses to all <strong>{sendableBids.length}</strong> ready bid{sendableBids.length !== 1 ? "s" : ""} and permanently closes bidding for each. This cannot be undone.
            </p>
          </div>
          <button
            className="rounded-full bg-red-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
            type="button"
            disabled={sendableBids.length === 0 || isSendingAll}
            onClick={() => { setCloseBiddingResult(null); setShowCloseBiddingConfirm(true); }}
          >
            {isSendingAll ? "Sending..." : `Close Bidding & Send ${sendableBids.length} Response${sendableBids.length !== 1 ? "s" : ""}`}
          </button>
        </div>
        {closeBiddingResult && (
          <p className={`mt-3 rounded px-3 py-2 text-sm border ${ closeBiddingResult.failed > 0 ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-green-50 border-green-200 text-green-700"}`}>
            Done: {closeBiddingResult.sent} sent{closeBiddingResult.failed > 0 ? `, ${closeBiddingResult.failed} failed` : "."}
          </p>
        )}
      </section>

    </section>

    {actionMenuBid && actionMenuPos ? (() => {
      const bid = actionMenuBid;
      const isAwaiting = bid.submission_status === "invitation_pending";
      const isSent = bid.submission_status === "response_sent";
      const canDecide = hasCandidateBidSubmission(bid) && !isSent;
      return (
        <div
          className="fixed z-[60] w-48 overflow-hidden rounded-xl border border-ink/10 bg-white py-1 shadow-xl"
          style={{ top: actionMenuPos.top, left: Math.max(8, actionMenuPos.left) }}
          onClick={(event) => event.stopPropagation()}
        >
          <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate">Actions</p>
          <Link
            to={`/invitations/${bid.id}`}
            className="block px-3 py-2 text-sm hover:bg-ink/5"
            onClick={() => setOpenActionMenuId(null)}
          >
            View
          </Link>
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm hover:bg-ink/5"
            onClick={() => {
              setOpenActionMenuId(null);
              openMessageDialog(bid.id, "message");
            }}
          >
            Send Message
          </button>
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm hover:bg-ink/5"
            onClick={() => {
              setOpenActionMenuId(null);
              setHistoryBidId(bid.id);
            }}
          >
            View History
          </button>
          {!isAwaiting && !isSent ? (
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-ink/5"
              onClick={() => { setOpenActionMenuId(null); setReviewBidId(bid.id); }}
            >
              Review / Edit
            </button>
          ) : null}
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm text-green-700 hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!canDecide || updateDecision.isPending}
            title={canDecide ? "" : "Waiting for candidate bid submission"}
            onClick={() => { setOpenActionMenuId(null); handleDecision(bid.id, "accepted", bid.decision_status); }}
          >
            Accept
          </button>
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!canDecide || updateDecision.isPending}
            title={canDecide ? "" : "Waiting for candidate bid submission"}
            onClick={() => { setOpenActionMenuId(null); handleDecision(bid.id, "rejected", bid.decision_status); }}
          >
            Reject
          </button>
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm text-indigo-700 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={isSent || bid.decision_status === "pending" || closeBid.isPending}
            title={isSent ? "Already closed" : bid.decision_status === "pending" ? "Decision must be accepted or rejected" : ""}
            onClick={() => {
              setOpenActionMenuId(null);
              openMessageDialog(bid.id, "close");
            }}
          >
            Close
          </button>
          {isAdmin && isAwaiting ? (
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-sm text-orange-600 hover:bg-orange-50 disabled:opacity-40"
              disabled={aiAutoRespond.isPending}
              aria-label="AI auto-respond"
              title="AI auto-respond"
              onClick={() => { setOpenActionMenuId(null); aiAutoRespond.mutate(bid.id); }}
            >
              🤖
            </button>
          ) : null}
        </div>
      );
    })() : null}

    {reviewBid ? (() => {
      const bid = reviewBid;
      const isSent = bid.submission_status === "response_sent";
      const canDecide = hasCandidateBidSubmission(bid) && !isSent;
      const responseDraft = responseEdits[bid.id] ?? "";
      const responseSaved = bid.response_message ?? "";
      const hasPendingResponseEdit = normalizeResponseMessage(responseDraft) !== normalizeResponseMessage(responseSaved);
      return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => setReviewBidId(null)}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-lg">Review Bid</h3>
                <p className="text-sm text-slate">
                  {bid.candidate_name ?? bid.applicant_identifier}{bid.candidate_email ? ` · ${bid.candidate_email}` : ""}
                </p>
              </div>
              <button type="button" className="rounded-full border border-ink/20 px-3 py-1 text-xs hover:bg-ink hover:text-paper" onClick={() => setReviewBidId(null)}>
                Close
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-medium capitalize ${statusPillClass(bid.decision_status)}`}>
                {bid.decision_status}
              </span>
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                Match {formatMatchScore(bid.match_score)}
              </span>
              <Link to={`/invitations/${bid.id}`} className="ml-auto text-xs font-medium text-accent hover:underline">
                Open full detail ↗
              </Link>
            </div>

            <div className="mt-4">
              <label className="mb-1 block text-xs font-medium">Decision Reason</label>
              <textarea
                className="min-h-24 w-full rounded-lg border border-ink/20 px-3 py-2 text-sm"
                value={reasonEdits[bid.id] ?? ""}
                onChange={(event) => setReasonEdits((prev) => ({ ...prev, [bid.id]: event.target.value }))}
                disabled={isSent}
              />
            </div>

            <div className="mt-4">
              <label className="mb-1 block text-xs font-medium">Response Message</label>
              <textarea
                className={`min-h-32 w-full rounded-lg px-3 py-2 text-sm transition-colors ${hasPendingResponseEdit ? "border border-amber-500 bg-amber-50 text-amber-950" : "border border-ink/20 bg-white text-ink"}`}
                value={responseEdits[bid.id] ?? ""}
                onChange={(event) => setResponseEdits((prev) => ({ ...prev, [bid.id]: event.target.value }))}
                disabled={isSent}
              />
              {hasPendingResponseEdit ? <p className="mt-1 text-xs text-amber-700">Unsaved changes</p> : null}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-full bg-green-600 px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
                  disabled={!canDecide || updateDecision.isPending}
                  onClick={() => handleDecision(bid.id, "accepted", bid.decision_status)}
                >
                  Accept
                </button>
                <button
                  type="button"
                  className="rounded-full bg-red-600 px-4 py-2 text-xs font-medium text-white disabled:opacity-50"
                  disabled={!canDecide || updateDecision.isPending}
                  onClick={() => handleDecision(bid.id, "rejected", bid.decision_status)}
                >
                  Reject
                </button>
              </div>
              <button
                type="button"
                className="rounded-full border border-ink/20 px-4 py-2 text-xs disabled:opacity-50"
                disabled={isSent || saveResponse.isPending}
                onClick={() => handleSaveResponseMessage(bid.id)}
              >
                {saveResponse.isPending ? "Saving…" : "Save Message"}
              </button>
            </div>
          </div>
        </div>
      );
    })() : null}

    {historyBid ? (
      <div className="fixed inset-0 z-[70]" onClick={() => setHistoryBidId(null)}>
        <div className="absolute inset-0 bg-black/30" />
        <aside
          className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto border-l border-ink/10 bg-white p-5 shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-lg">Invitation History</h3>
              <p className="text-xs text-slate">{historyBid.candidate_name ?? historyBid.applicant_identifier}</p>
            </div>
            <button type="button" className="rounded-full border border-ink/20 px-3 py-1 text-xs hover:bg-ink hover:text-paper" onClick={() => setHistoryBidId(null)}>
              Close
            </button>
          </div>
          {historyLoading ? (
            <p className="text-sm text-slate">Loading history...</p>
          ) : (historyEvents ?? []).length === 0 ? (
            <p className="text-sm text-slate">No history found for this invitation yet.</p>
          ) : (
            <ol className="space-y-3">
              {(historyEvents ?? []).map((event) => (
                <li key={event.id} className="rounded-xl border border-ink/10 bg-white p-3">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${event.category === "message" ? "bg-blue-100 text-blue-700" : "bg-zinc-100 text-zinc-700"}`}>
                      {event.category}
                    </span>
                    <span className="text-xs text-slate">{new Date(event.created_at).toLocaleString()}</span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-ink">{event.title}</p>
                  {event.detail ? <p className="mt-1 text-xs text-slate">{event.detail}</p> : null}
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>
    ) : null}

    {messageBid ? (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={() => setMessageBidId(null)}>
        <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-lg">{messageMode === "close" ? "Close Invitation" : "Send Message"}</h3>
              <p className="text-xs text-slate">{messageBid.candidate_name ?? messageBid.applicant_identifier}</p>
            </div>
            <button type="button" className="rounded-full border border-ink/20 px-3 py-1 text-xs hover:bg-ink hover:text-paper" onClick={() => setMessageBidId(null)}>
              Cancel
            </button>
          </div>

          <label className="mb-1 block text-xs font-medium">Subject</label>
          <input
            className="mb-3 w-full rounded-lg border border-ink/20 px-3 py-2 text-sm"
            value={messageSubject}
            onChange={(event) => setMessageSubject(event.target.value)}
          />

          <label className="mb-1 block text-xs font-medium">Message</label>
          <textarea
            className="min-h-40 w-full rounded-lg border border-ink/20 px-3 py-2 text-sm"
            value={messageBody}
            onChange={(event) => setMessageBody(event.target.value)}
          />

          {messageError ? <p className="mt-2 text-xs text-red-700">{messageError}</p> : null}

          <div className="mt-4 flex justify-end gap-2">
            <button type="button" className="rounded-full border border-ink/20 px-4 py-2 text-sm" onClick={() => setMessageBidId(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              disabled={sendMessage.isPending || closeBid.isPending}
              onClick={handleSubmitMessageDialog}
            >
              {sendMessage.isPending || closeBid.isPending ? "Sending..." : messageMode === "close" ? "Close and Send" : "Send Message"}
            </button>
          </div>
        </div>
      </div>
    ) : null}

    {showCloseBiddingConfirm && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
          <h3 className="text-lg font-semibold text-ink">Close Bidding &amp; Send All Responses?</h3>
          <p className="mt-2 text-sm text-slate">
            This will send responses to <strong>{sendableBids.length} bid{sendableBids.length !== 1 ? "s" : ""}</strong> and permanently close bidding for each. Candidates will receive their response emails.
          </p>
          <p className="mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            ⚠ This action cannot be undone.
          </p>
          <div className="mt-5 flex justify-end gap-3">
            <button
              className="rounded-full border border-ink/20 px-4 py-2 text-sm hover:bg-ink hover:text-paper"
              type="button"
              onClick={() => setShowCloseBiddingConfirm(false)}
            >
              Cancel
            </button>
            <button
              className="rounded-full bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800"
              type="button"
              onClick={handleCloseBiddingAndSendAll}
            >
              Yes, Close Bidding &amp; Send All
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
