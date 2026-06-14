import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { getTokenRole } from "../auth/token";
import { useAiAutoRespond, useAllApplications, useNudgeAwaitingApplications } from "../hooks/useApplications";
import { useBidHistory, useClosePhase1Bid, useSendPhase1BidMessage } from "../hooks/usePhase1Bids";
import type { Phase1Bid } from "../types/api";

// ── Brand tokens ──────────────────────────────────────────────────────────────
const B = "#019529";
const BL = "#f0faf3";
const BT = "#0f6b20";
const NAVY = "#1B1035";
const BORDER = "#e4e4e7";
const MUTED = "#71717a";
const FAINT = "#c4c4c8";
const R_MD = "10px";
const R_LG = "14px";

// ── Status lifecycle definitions ──────────────────────────────────────────────

const LIFECYCLE_LEGEND = [
  {
    key: "invitation_pending",
    label: "Awaiting",
    bg: "#fff7ed",
    color: "#92400e",
    desc: "Invitation sent but the candidate hasn't submitted a bid yet.",
  },
  {
    key: "applicant_bid_submitted",
    label: "Submitted",
    bg: "#eff6ff",
    color: "#1e3a5f",
    desc: "Candidate submitted their bid. Awaiting your review and hiring decision.",
  },
  {
    key: "response_sent",
    label: "Closed",
    bg: "#f4f4f5",
    color: "#71717a",
    desc: "A response has been sent to the candidate. No further action required.",
  },
] as const;

const DECISION_LEGEND = [
  {
    key: "pending",
    label: "Pending",
    bg: "#fef3c7",
    color: "#92400e",
    desc: "No hiring decision has been made yet.",
  },
  {
    key: "accepted",
    label: "Accepted",
    bg: "#dcfce7",
    color: "#166534",
    desc: "Candidate has been accepted for the role.",
  },
  {
    key: "rejected",
    label: "Rejected",
    bg: "#fee2e2",
    color: "#991b1b",
    desc: "Candidate has not been selected to move forward.",
  },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function daysSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleString();
}

function formatMatchScore(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  const clamped = Math.max(0, Math.min(100, value));
  const rounded = Math.round(clamped * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}

function buildDefaultMessageSubject(roleTitle: string | null, mode: "message" | "close"): string {
  const role = roleTitle?.trim() || "this role";
  return mode === "close" ? `Final update on your bid for ${role}` : `Update regarding your invitation for ${role}`;
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

function DecisionBadge({ status }: { status: string }) {
  const s = DECISION_LEGEND.find((d) => d.key === status) ?? DECISION_LEGEND[0];
  return (
    <span title={s.desc} style={{ background: s.bg, color: s.color, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", cursor: "default" }}>
      {s.label}
    </span>
  );
}

function LifecycleBadge({ status }: { status: string }) {
  const s = LIFECYCLE_LEGEND.find((l) => l.key === status) ?? LIFECYCLE_LEGEND[0];
  return (
    <span title={s.desc} style={{ background: s.bg, color: s.color, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 500, whiteSpace: "nowrap", cursor: "default" }}>
      {s.label}
    </span>
  );
}

// ── Legend popover ────────────────────────────────────────────────────────────

function LegendPopover({ title, items }: { title: string; items: readonly { key: string; label: string; bg: string; color: string; desc: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", marginLeft: 5 }} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 14, height: 14, borderRadius: "50%", background: "#e4e4e7", color: "#555", fontSize: 9, fontWeight: 700, cursor: "default", userSelect: "none", lineHeight: 1 }}>
        i
      </span>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)", zIndex: 60, background: "#fff", border: "1px solid #e4e4e7", borderRadius: 10, boxShadow: "0 4px 18px rgba(0,0,0,.13)", padding: "10px 12px", minWidth: 270, pointerEvents: "none" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: ".05em", textTransform: "uppercase", marginBottom: 8 }}>{title}</div>
          {items.map((s) => (
            <div key={s.key} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 7 }}>
              <span style={{ background: s.bg, color: s.color, borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }}>{s.label}</span>
              <span style={{ fontSize: 11, color: MUTED, lineHeight: 1.4 }}>{s.desc}</span>
            </div>
          ))}
        </div>
      )}
    </span>
  );
}

// ── Action Queue ──────────────────────────────────────────────────────────────

// ── Sort key ──────────────────────────────────────────────────────────────────

type SortKey = "newest" | "oldest" | "submitted" | "name_az" | "name_za" | "job_az" | "job_za" | "recently_posted";

// ── Page ──────────────────────────────────────────────────────────────────────

export function AllApplicationsPage() {
  const { data: applications, isLoading } = useAllApplications();
  const nudgeAwaiting = useNudgeAwaitingApplications();
  const sendMessage = useSendPhase1BidMessage();
  const closeBid = useClosePhase1Bid();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isAdmin = getTokenRole() === "admin";
  const listingIdFilter = searchParams.get("listingId")?.trim() || null;

  // Filter / sort state
  const [searchQuery, setSearchQuery] = useState("");
  const [decisionFilter, setDecisionFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [jobFilter, setJobFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [activeStatFilter, setActiveStatFilter] = useState("all");
  const [historyBidId, setHistoryBidId] = useState<string | null>(null);
  const [messageBidId, setMessageBidId] = useState<string | null>(null);
  const [messageMode, setMessageMode] = useState<"message" | "close">("message");
  const [messageSubject, setMessageSubject] = useState("");
  const [messageBody, setMessageBody] = useState("");
  const [messageError, setMessageError] = useState<string | null>(null);
  const { data: historyEvents, isLoading: historyLoading } = useBidHistory(historyBidId);

  const bids = applications ?? [];
  const total = bids.length;
  const submitted = bids.filter((b) => b.submission_status === "applicant_bid_submitted").length;
  const awaiting  = bids.filter((b) => b.submission_status === "invitation_pending").length;
  const accepted  = bids.filter((b) => b.decision_status === "accepted").length;
  const rejected  = bids.filter((b) => b.decision_status === "rejected").length;
  const closed    = bids.filter((b) => b.submission_status === "response_sent").length;

  const statCards = [
    { key: "all",       label: "Total",     value: total,     desc: "all applications"    },
    { key: "submitted", label: "Submitted",  value: submitted, desc: "awaiting decision"   },
    { key: "awaiting",  label: "Awaiting",   value: awaiting,  desc: "not yet responded"   },
    { key: "accepted",  label: "Accepted",   value: accepted,  desc: "offers extended"     },
    { key: "rejected",  label: "Rejected",   value: rejected,  desc: "not moving forward"  },
    { key: "closed",    label: "Closed",     value: closed,    desc: "responses sent"      },
  ];

  // Unique sorted job titles for filter dropdown
  const jobOptions = Array.from(
    new Map(bids.map((b) => [b.job_title ?? "__na__", b.job_title])).entries()
  ).sort(([a], [b]) => {
    if (a === "__na__") return 1;
    if (b === "__na__") return -1;
    return a.localeCompare(b);
  });

  const visibleBids = bids
    .filter((b) => {
      if (listingIdFilter && b.case_id !== listingIdFilter) return false;
      if (activeStatFilter === "submitted" && b.submission_status !== "applicant_bid_submitted") return false;
      if (activeStatFilter === "awaiting"  && b.submission_status !== "invitation_pending")       return false;
      if (activeStatFilter === "accepted"  && b.decision_status !== "accepted")                  return false;
      if (activeStatFilter === "rejected"  && b.decision_status !== "rejected")                  return false;
      if (activeStatFilter === "closed"    && b.submission_status !== "response_sent")            return false;
      if (decisionFilter !== "all" && b.decision_status !== decisionFilter)    return false;
      if (stageFilter    !== "all" && b.submission_status !== stageFilter)     return false;
      if (jobFilter === "__na__" && b.job_title != null) return false;
      if (jobFilter !== "all" && jobFilter !== "__na__" && b.job_title !== jobFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay = ((b.candidate_name ?? "") + " " + (b.candidate_email ?? "") + " " + b.applicant_identifier).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortKey === "newest")    return new Date(b.received_at).getTime() - new Date(a.received_at).getTime();
      if (sortKey === "oldest")    return new Date(a.received_at).getTime() - new Date(b.received_at).getTime();
      if (sortKey === "submitted") {
        const ts = (x: Phase1Bid) => x.candidate_submitted_at ? new Date(x.candidate_submitted_at).getTime() : 0;
        return ts(b) - ts(a);
      }
      if (sortKey === "recently_posted") {
        const tp = (x: Phase1Bid) => x.job_posted_at ? new Date(x.job_posted_at).getTime() : 0;
        return tp(b) - tp(a);
      }
      const na = (a.candidate_name ?? a.candidate_email ?? a.applicant_identifier).toLowerCase();
      const nb = (b.candidate_name ?? b.candidate_email ?? b.applicant_identifier).toLowerCase();
      if (sortKey === "name_az") return na.localeCompare(nb);
      if (sortKey === "name_za") return nb.localeCompare(na);
      const ja = (a.job_title ?? "").toLowerCase();
      const jb = (b.job_title ?? "").toLowerCase();
      if (sortKey === "job_az") return ja.localeCompare(jb);
      if (sortKey === "job_za") return jb.localeCompare(ja);
      return 0;
    });

  const hasFilter = listingIdFilter !== null || searchQuery.trim() !== "" || decisionFilter !== "all" || stageFilter !== "all" || jobFilter !== "all" || activeStatFilter !== "all";
  const historyBid = bids.find((b) => b.id === historyBidId) ?? null;
  const messageBid = bids.find((b) => b.id === messageBidId) ?? null;
  const visibleAwaitingBids = visibleBids.filter((bid) => bid.submission_status === "invitation_pending");

  function openMessageDialog(bid: Phase1Bid, mode: "message" | "close") {
    if (mode === "close" && bid.decision_status === "pending") {
      window.alert("Cannot close while decision status is pending.");
      return;
    }
    setMessageBidId(bid.id);
    setMessageMode(mode);
    setMessageSubject(buildDefaultMessageSubject(bid.job_title, mode));
    setMessageBody(
      mode === "close"
        ? (bid.response_message || buildDefaultCloseMessage(bid.candidate_name, bid.decision_status)).trim()
        : `Hi ${bid.candidate_name || "there"},\n\nWe wanted to share an update on your invitation.\n\nBest regards,\nSalarySafe Hiring Team`,
    );
    setMessageError(null);
  }

  async function handleSubmitMessageDialog() {
    if (!messageBid) return;
    const subject = messageSubject.trim();
    const body = messageBody.trim();
    if (!subject || !body) {
      setMessageError("Subject and message are required.");
      return;
    }
    if (messageMode === "close" && messageBid.decision_status === "pending") {
      setMessageError("Cannot close while decision status is pending.");
      return;
    }

    setMessageError(null);
    if (messageMode === "message") {
      await sendMessage.mutateAsync({ bidId: messageBid.id, subject, message: body });
    } else {
      await closeBid.mutateAsync({ bidId: messageBid.id, response_message: body });
    }
    setMessageBidId(null);
  }

  async function handleNudgeAwaiting() {
    if (visibleAwaitingBids.length === 0) {
      return;
    }
    const confirmed = window.confirm(
      `This will send reminder emails to ${visibleAwaitingBids.length} awaiting candidate${visibleAwaitingBids.length === 1 ? "" : "s"}. This may trigger outbound email immediately. Continue?`,
    );
    if (!confirmed) {
      return;
    }
    const result = await nudgeAwaiting.mutateAsync(visibleAwaitingBids.map((bid) => bid.id));
    window.alert(`Nudge complete: ${result.nudged_count} sent${result.skipped_count > 0 ? `, ${result.skipped_count} skipped/failed` : ""}.`);
  }

  function clearFilters() {
    setSearchQuery("");
    setDecisionFilter("all");
    setStageFilter("all");
    setJobFilter("all");
    setActiveStatFilter("all");
    if (listingIdFilter) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("listingId");
        return next;
      });
    }
  }

  return (
    <div style={{ fontFamily: "inherit" }}>
      {/* ── Page header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "2rem", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: BL, border: "1px solid #b3e0bb", borderRadius: 20, padding: "3px 12px", marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: BT, letterSpacing: ".04em", textTransform: "uppercase" }}>All Invitations</span>
          </div>
          <h2 style={{ fontFamily: "var(--font-display, Georgia, serif)", fontSize: 26, fontWeight: 700, letterSpacing: "-.03em", color: NAVY, margin: 0, lineHeight: 1.2 }}>
            Candidate Bid Invitations
          </h2>
          <p style={{ fontSize: 14, color: MUTED, marginTop: 6, marginBottom: 0 }}>
            All candidate bid invitations across every job listing.
          </p>
        </div>
      </div>

      {/* ── Stat cards (clickable filters) ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, marginBottom: "1.75rem" }}>
        {statCards.map((stat) => {
          const sel = activeStatFilter === stat.key;
          return (
            <div
              key={stat.key}
              onClick={() => setActiveStatFilter(sel && stat.key !== "all" ? "all" : stat.key)}
              style={{
                background: "#fff",
                border: `1px solid ${sel ? B : BORDER}`,
                borderBottom: sel ? `3px solid ${B}` : `1px solid ${BORDER}`,
                borderRadius: R_LG,
                padding: "0.875rem 1rem",
                cursor: "pointer",
                transition: "border-color .15s",
                userSelect: "none",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = sel ? B : "#b3b3b8"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = sel ? B : BORDER; }}
            >
              <div style={{ fontSize: 24, fontWeight: 700, color: sel ? B : NAVY, lineHeight: 1 }}>{stat.value}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: sel ? BT : "#555", marginTop: 3 }}>{stat.label}</div>
              <div style={{ fontSize: 10, color: FAINT, marginTop: 1 }}>{stat.desc}</div>
            </div>
          );
        })}
      </div>

      {/* ── Filter / search toolbar ── */}
      <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: R_LG, padding: "0.75rem 1rem", marginBottom: "1rem", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {/* Search */}
        <div style={{ position: "relative", flex: "1 1 180px" }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: MUTED, pointerEvents: "none" }}>
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M9.5 9.5l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            placeholder="Search candidates…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: "100%", paddingLeft: 30, paddingRight: 10, paddingTop: 7, paddingBottom: 7, fontSize: 13, border: `1px solid ${BORDER}`, borderRadius: R_MD, outline: "none", fontFamily: "inherit", color: "#111", boxSizing: "border-box" }}
          />
        </div>

        {/* Decision filter */}
        <select
          value={decisionFilter}
          onChange={(e) => setDecisionFilter(e.target.value)}
          style={{ padding: "7px 10px", fontSize: 13, border: `1px solid ${BORDER}`, borderRadius: R_MD, fontFamily: "inherit", color: "#111", background: "#fff", cursor: "pointer" }}
        >
          <option value="all">All Decisions</option>
          <option value="pending">Pending</option>
          <option value="accepted">Accepted</option>
          <option value="rejected">Rejected</option>
        </select>

        {/* Stage filter */}
        <select
          value={stageFilter}
          onChange={(e) => setStageFilter(e.target.value)}
          style={{ padding: "7px 10px", fontSize: 13, border: `1px solid ${BORDER}`, borderRadius: R_MD, fontFamily: "inherit", color: "#111", background: "#fff", cursor: "pointer" }}
        >
          <option value="all">All Stages</option>
          <option value="invitation_pending">Awaiting</option>
          <option value="applicant_bid_submitted">Submitted</option>
          <option value="response_sent">Closed</option>
        </select>

        {/* Job filter */}
        <select
          value={jobFilter}
          onChange={(e) => setJobFilter(e.target.value)}
          style={{ padding: "7px 10px", fontSize: 13, border: `1px solid ${BORDER}`, borderRadius: R_MD, fontFamily: "inherit", color: "#111", background: "#fff", cursor: "pointer" }}
        >
          <option value="all">All Jobs</option>
          <option value="__na__">N/A (no job)</option>
          {jobOptions.filter(([key]) => key !== "__na__").map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>

        {/* Sort */}
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          style={{ padding: "7px 10px", fontSize: 13, border: `1px solid ${BORDER}`, borderRadius: R_MD, fontFamily: "inherit", color: "#111", background: "#fff", cursor: "pointer" }}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="submitted">Recently submitted</option>
          <option value="recently_posted">Recently posted</option>
          <option value="job_az">Job A → Z</option>
          <option value="job_za">Job Z → A</option>
          <option value="name_az">Name A → Z</option>
          <option value="name_za">Name Z → A</option>
        </select>

        {/* Clear filters */}
        {hasFilter && (
          <button
            type="button"
            onClick={clearFilters}
            style={{ padding: "6px 12px", fontSize: 12, fontWeight: 500, border: `1px solid ${BORDER}`, borderRadius: 20, background: "#f4f4f5", color: MUTED, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
          >
            × Clear filters
          </button>
        )}

        <button
          type="button"
          disabled={visibleAwaitingBids.length === 0 || nudgeAwaiting.isPending}
          onClick={handleNudgeAwaiting}
          title={visibleAwaitingBids.length === 0 ? "No awaiting invitations in the current table view" : "Send reminder notifications to all awaiting candidates in the current table view"}
          style={{ padding: "6px 12px", fontSize: 12, fontWeight: 600, border: `1px solid ${visibleAwaitingBids.length === 0 ? BORDER : "#f59e0b"}`, borderRadius: 20, background: visibleAwaitingBids.length === 0 ? "#f4f4f5" : "#fff7ed", color: visibleAwaitingBids.length === 0 ? MUTED : "#92400e", cursor: visibleAwaitingBids.length === 0 || nudgeAwaiting.isPending ? "not-allowed" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap", opacity: visibleAwaitingBids.length === 0 || nudgeAwaiting.isPending ? 0.7 : 1 }}
        >
          {nudgeAwaiting.isPending ? "Nudging..." : `Nudge non-responders (${visibleAwaitingBids.length})`}
        </button>

        <span style={{ fontSize: 12, color: MUTED, marginLeft: "auto", whiteSpace: "nowrap" }}>
          {visibleBids.length} of {total} application{total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Table ── */}
      <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: R_LG, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${BORDER}`, background: "#fafafa" }}>
              <th style={{ padding: "0.6rem 1.25rem", textAlign: "left", fontSize: 11, fontWeight: 600, color: MUTED, letterSpacing: ".05em", textTransform: "uppercase", whiteSpace: "nowrap" }}>Candidate</th>
              <th style={{ padding: "0.6rem 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: MUTED, letterSpacing: ".05em", textTransform: "uppercase", whiteSpace: "nowrap", width: "99%" }}>Job Applied</th>
              <th style={{ padding: "0.6rem 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: MUTED, letterSpacing: ".05em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                Stage <LegendPopover title="Application Stage" items={LIFECYCLE_LEGEND} />
              </th>
              <th style={{ padding: "0.6rem 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: MUTED, letterSpacing: ".05em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                Decision
                <LegendPopover title="Hiring Decision" items={DECISION_LEGEND} />
              </th>
              <th style={{ padding: "0.6rem 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: MUTED, letterSpacing: ".05em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                Match Score
              </th>
              <th style={{ padding: "0.6rem 1.25rem", textAlign: "right", fontSize: 11, fontWeight: 600, color: MUTED, letterSpacing: ".05em", textTransform: "uppercase", whiteSpace: "nowrap" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} style={{ padding: "3rem", textAlign: "center", color: MUTED, fontSize: 14 }}>Loading applications…</td>
              </tr>
            )}

            {!isLoading && total === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: "3rem", textAlign: "center" }}>
                  <div style={{ width: 48, height: 48, borderRadius: "50%", background: BL, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1rem" }}>
                    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                      <rect x="3" y="5" width="16" height="13" rx="2" stroke={BT} strokeWidth="1.5" />
                      <circle cx="11" cy="9" r="2.5" stroke={BT} strokeWidth="1.5" />
                      <path d="M6 18c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke={BT} strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#111", marginBottom: 6 }}>No applications yet</div>
                  <div style={{ fontSize: 13, color: MUTED }}>Invite candidates from a job listing to get started.</div>
                </td>
              </tr>
            )}

            {!isLoading && total > 0 && visibleBids.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: "2.5rem", textAlign: "center", color: MUTED, fontSize: 14 }}>
                  No applications match the current filters.{" "}
                  <button type="button" onClick={clearFilters} style={{ color: BT, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 500 }}>
                    Clear filters
                  </button>
                </td>
              </tr>
            )}

            {!isLoading && visibleBids.map((bid) => {
              const displayName = bid.candidate_name ?? bid.candidate_email ?? bid.applicant_identifier;
              const dateLabel = bid.last_status_change_at
                ? `Last status change ${formatDate(bid.last_status_change_at)}`
                : bid.candidate_submitted_at
                ? `Submitted ${formatDate(bid.candidate_submitted_at)}`
                : bid.received_at
                ? `Invited ${formatDate(bid.received_at)}`
                : "";
              return (
                <ApplicationRow
                  key={bid.id}
                  bid={bid}
                  displayName={displayName}
                  dateLabel={dateLabel}
                  isAdmin={isAdmin}
                  navigate={navigate}
                  onOpenHistory={() => setHistoryBidId(bid.id)}
                  onOpenMessage={(mode) => openMessageDialog(bid, mode)}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      {historyBid && (
        <div style={{ position: "fixed", inset: 0, zIndex: 90 }} onClick={() => setHistoryBidId(null)}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.35)" }} />
          <aside
            style={{ position: "absolute", right: 0, top: 0, height: "100%", width: "min(560px, 100%)", background: "#fff", borderLeft: `1px solid ${BORDER}`, boxShadow: "0 10px 30px rgba(0,0,0,.25)", overflowY: "auto", padding: "1rem" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, color: NAVY }}>Invitation History</h3>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: MUTED }}>{historyBid.candidate_name ?? historyBid.applicant_identifier}</p>
              </div>
              <button type="button" onClick={() => setHistoryBidId(null)} style={{ border: `1px solid ${BORDER}`, borderRadius: 999, background: "#fff", padding: "4px 10px", fontSize: 12, cursor: "pointer" }}>Close</button>
            </div>

            {historyLoading ? (
              <p style={{ fontSize: 13, color: MUTED }}>Loading history...</p>
            ) : (historyEvents ?? []).length === 0 ? (
              <p style={{ fontSize: 13, color: MUTED }}>No history found for this invitation yet.</p>
            ) : (
              <ol style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
                {(historyEvents ?? []).map((event) => (
                  <li key={event.id} style={{ border: `1px solid ${BORDER}`, borderRadius: 10, padding: "10px 12px", background: "#fff" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ background: event.category === "message" ? "#dbeafe" : "#f4f4f5", color: event.category === "message" ? "#1d4ed8" : "#52525b", borderRadius: 999, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", padding: "2px 8px" }}>
                        {event.category}
                      </span>
                      <span style={{ fontSize: 11, color: FAINT }}>{formatDateTime(event.created_at)}</span>
                    </div>
                    <div style={{ marginTop: 6, fontSize: 13, fontWeight: 600, color: "#111" }}>{event.title}</div>
                    {event.detail ? <div style={{ marginTop: 4, fontSize: 12, color: MUTED }}>{event.detail}</div> : null}
                  </li>
                ))}
              </ol>
            )}
          </aside>
        </div>
      )}

      {messageBid && (
        <div style={{ position: "fixed", inset: 0, zIndex: 95, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setMessageBidId(null)}>
          <div style={{ width: "min(760px, 100%)", background: "#fff", borderRadius: 14, boxShadow: "0 12px 30px rgba(0,0,0,.28)", padding: "1rem" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12, marginBottom: 10 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, color: NAVY }}>{messageMode === "close" ? "Close Invitation" : "Send Message"}</h3>
                <p style={{ margin: "4px 0 0", fontSize: 12, color: MUTED }}>{messageBid.candidate_name ?? messageBid.applicant_identifier}</p>
              </div>
              <button type="button" onClick={() => setMessageBidId(null)} style={{ border: `1px solid ${BORDER}`, borderRadius: 999, background: "#fff", padding: "4px 10px", fontSize: 12, cursor: "pointer" }}>Cancel</button>
            </div>

            <label style={{ display: "block", marginBottom: 4, fontSize: 12, fontWeight: 600, color: MUTED }}>Subject</label>
            <input value={messageSubject} onChange={(e) => setMessageSubject(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", border: `1px solid ${BORDER}`, borderRadius: R_MD, marginBottom: 10 }} />

            <label style={{ display: "block", marginBottom: 4, fontSize: 12, fontWeight: 600, color: MUTED }}>Message</label>
            <textarea value={messageBody} onChange={(e) => setMessageBody(e.target.value)} style={{ width: "100%", minHeight: 170, boxSizing: "border-box", padding: "8px 10px", border: `1px solid ${BORDER}`, borderRadius: R_MD, resize: "vertical" }} />

            {messageError ? <p style={{ margin: "8px 0 0", fontSize: 12, color: "#b91c1c" }}>{messageError}</p> : null}

            <div style={{ marginTop: 12, display: "flex", justifyContent: "end", gap: 8 }}>
              <button type="button" onClick={() => setMessageBidId(null)} style={{ border: `1px solid ${BORDER}`, borderRadius: 999, background: "#fff", padding: "7px 14px", fontSize: 13, cursor: "pointer" }}>Cancel</button>
              <button
                type="button"
                disabled={sendMessage.isPending || closeBid.isPending}
                onClick={handleSubmitMessageDialog}
                style={{ border: "none", borderRadius: 999, background: B, color: "#fff", padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: sendMessage.isPending || closeBid.isPending ? "not-allowed" : "pointer", opacity: sendMessage.isPending || closeBid.isPending ? 0.7 : 1 }}
              >
                {sendMessage.isPending || closeBid.isPending ? "Sending..." : messageMode === "close" ? "Close and Send" : "Send Message"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Row component ─────────────────────────────────────────────────────────────

function ApplicationRow({
  bid,
  displayName,
  dateLabel,
  isAdmin,
  navigate,
  onOpenHistory,
  onOpenMessage,
}: {
  bid: Phase1Bid;
  displayName: string;
  dateLabel: string;
  isAdmin: boolean;
  navigate: ReturnType<typeof useNavigate>;
  onOpenHistory: () => void;
  onOpenMessage: (mode: "message" | "close") => void;
}) {
  const [hovered, setHovered] = useState(false);
  const aiAutoRespond = useAiAutoRespond();
  const hasScore = typeof bid.match_score === "number" && Number.isFinite(bid.match_score);
  const isAwaiting = bid.submission_status === "invitation_pending";

  return (
    <tr
      style={{ borderBottom: `1px solid ${BORDER}`, background: hovered ? "#fafaf9" : "#fff", cursor: "pointer", transition: "background .12s" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => navigate(`/invitations/${bid.id}`)}
    >
      {/* Candidate */}
      <td style={{ padding: "0.9rem 1.25rem", whiteSpace: "nowrap" }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName}</div>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{dateLabel}</div>
      </td>

      {/* Job Applied */}
      <td style={{ padding: "0.9rem 12px", maxWidth: 0 }}>
        {bid.job_title ? (
          <>
            <div style={{ fontSize: 13, fontWeight: 500, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{bid.job_title}</div>
            {bid.job_posted_at && (
              <div style={{ fontSize: 11, color: FAINT, marginTop: 2 }}>Posted {formatDate(bid.job_posted_at)}</div>
            )}
          </>
        ) : (
          <span style={{ fontSize: 12, color: FAINT }}>—</span>
        )}
      </td>

      {/* Stage */}
      <td style={{ padding: "0 12px", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
        <LifecycleBadge status={bid.submission_status} />
      </td>

      {/* Decision */}
      <td style={{ padding: "0 12px", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
        <DecisionBadge status={bid.decision_status} />
      </td>

      {/* Match score */}
      <td style={{ padding: "0 12px", whiteSpace: "nowrap" }}>
        {isAwaiting || !hasScore ? (
          <span
            style={{
              display: "flex",
              width: 48,
              height: 48,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "50%",
              border: "1px dashed rgba(11,15,25,0.2)",
              fontSize: 12,
              color: MUTED,
            }}
          >
            —
          </span>
        ) : (
          <span
            style={{
              display: "flex",
              width: 48,
              height: 48,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "50%",
              background: "#ecfdf5",
              color: "#047857",
              fontSize: 14,
              fontWeight: 600,
              boxShadow: "inset 0 0 0 1px #d1fae5",
            }}
          >
            {formatMatchScore(bid.match_score)}
          </span>
        )}
      </td>

      {/* Actions */}
      <td style={{ padding: "0 1.25rem", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
          {isAdmin && bid.submission_status === "invitation_pending" && (
            <button
              type="button"
              disabled={aiAutoRespond.isPending}
              title="AI simulates candidate response and auto-matches (Admin only)"
              aria-label="AI auto-respond"
              onClick={(e) => {
                e.stopPropagation();
                aiAutoRespond.mutate(bid.id);
              }}
              style={{
                background: aiAutoRespond.isPending ? "#fed7aa" : "#f97316",
                color: "#fff",
                border: "none",
                borderRadius: R_MD,
                padding: "5px 12px",
                fontSize: 12,
                fontWeight: 600,
                cursor: aiAutoRespond.isPending ? "not-allowed" : "pointer",
                whiteSpace: "nowrap",
                opacity: aiAutoRespond.isPending ? 0.7 : 1,
              }}
            >
              {aiAutoRespond.isPending ? "⏳" : "🤖"}
            </button>
          )}
          <button
            type="button"
            title="History"
            onClick={(e) => {
              e.stopPropagation();
              onOpenHistory();
            }}
            style={{ background: "#fff", color: "#111", border: `1px solid ${BORDER}`, borderRadius: R_MD, padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
          >
            History
          </button>
          <button
            type="button"
            title="Send message"
            onClick={(e) => {
              e.stopPropagation();
              onOpenMessage("message");
            }}
            style={{ background: "#fff", color: NAVY, border: `1px solid ${BORDER}`, borderRadius: R_MD, padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
          >
            Message
          </button>
          <button
            type="button"
            title={bid.submission_status === "response_sent" ? "Already closed" : bid.decision_status === "pending" ? "Decision must be accepted or rejected" : "Close and send final response"}
            disabled={bid.submission_status === "response_sent" || bid.decision_status === "pending"}
            onClick={(e) => {
              e.stopPropagation();
              onOpenMessage("close");
            }}
            style={{ background: bid.submission_status === "response_sent" || bid.decision_status === "pending" ? "#e4e4e7" : "#1d4ed8", color: "#fff", border: "none", borderRadius: R_MD, padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: bid.submission_status === "response_sent" || bid.decision_status === "pending" ? "not-allowed" : "pointer", whiteSpace: "nowrap", opacity: bid.submission_status === "response_sent" || bid.decision_status === "pending" ? 0.7 : 1 }}
          >
            Close
          </button>
          <Link
            to={`/invitations/${bid.id}`}
            style={{ background: "#fff", color: "#111", border: `1px solid ${BORDER}`, borderRadius: R_MD, padding: "5px 12px", fontSize: 12, fontWeight: 500, textDecoration: "none", whiteSpace: "nowrap" }}
            onClick={(e) => e.stopPropagation()}
          >
            View
          </Link>
        </div>
      </td>
    </tr>
  );
}
