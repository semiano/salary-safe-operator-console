import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { getTokenRole } from "../auth/token";
import { useAllApplications } from "../hooks/useApplications";
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

type ActionItem = {
  id: string;
  urgency: "high" | "medium" | "low";
  label: string;
  sublabel: string;
  href: string;
};

function buildActionQueue(bids: Phase1Bid[]): ActionItem[] {
  const items: ActionItem[] = [];
  for (const bid of bids) {
    const name = bid.candidate_name ?? bid.candidate_email ?? bid.applicant_identifier;
    const age = daysSince(bid.received_at);
    if (bid.submission_status === "applicant_bid_submitted" && bid.decision_status === "pending") {
      items.push({ id: `review-${bid.id}`, urgency: "high", label: "Bid awaiting review", sublabel: name, href: `/invitations/${bid.id}` });
    }
    if (bid.submission_status === "invitation_pending" && age >= 3) {
      items.push({ id: `awaiting-${bid.id}`, urgency: "medium", label: "Invitation not yet accepted", sublabel: `${name} · invited ${age}d ago`, href: `/invitations/${bid.id}` });
    }
  }
  const order = { high: 0, medium: 1, low: 2 } as const;
  return items.sort((a, b) => order[a.urgency] - order[b.urgency]);
}

const URGENCY_DOT: Record<string, string> = { high: "#ef4444", medium: "#f59e0b", low: MUTED };

function ActionQueueSidebar({ items, onClose }: { items: ActionItem[]; onClose: () => void }) {
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    function onClickOutside(e: MouseEvent) { if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose(); }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClickOutside);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClickOutside); };
  }, [onClose]);

  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.18)", zIndex: 40 }} />
      <div ref={panelRef} style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 360, background: "#fff", boxShadow: "-4px 0 24px rgba(0,0,0,.12)", zIndex: 50, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "1.25rem 1.25rem 1rem", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#111" }}>Action Queue</div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
              {items.length === 0 ? "All caught up" : `${items.length} item${items.length !== 1 ? "s" : ""} need attention`}
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: MUTED, padding: 4, borderRadius: 6, lineHeight: 1 }} aria-label="Close action queue">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "0.75rem 1rem" }}>
          {items.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem 1rem", color: MUTED, fontSize: 13 }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>✓</div>
              No action items right now. All applications are up to date.
            </div>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => { navigate(item.href); onClose(); }}
                style={{ width: "100%", textAlign: "left", background: "#fff", border: `1px solid ${BORDER}`, borderRadius: R_LG, padding: "0.875rem 1rem", marginBottom: 8, cursor: "pointer", fontFamily: "inherit", display: "flex", gap: 10, alignItems: "flex-start", transition: "background .12s" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#fafafa"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#fff"; }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: URGENCY_DOT[item.urgency], flexShrink: 0, marginTop: 5 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#111", lineHeight: 1.4 }}>{item.label}</div>
                  <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{item.sublabel}</div>
                </div>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ marginLeft: "auto", flexShrink: 0, marginTop: 3, color: FAINT }}>
                  <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ))
          )}
        </div>
      </div>
    </>
  );
}

// ── Sort key ──────────────────────────────────────────────────────────────────

type SortKey = "newest" | "oldest" | "submitted" | "name_az" | "name_za";

// ── Page ──────────────────────────────────────────────────────────────────────

export function AllApplicationsPage() {
  const { data: applications, isLoading } = useAllApplications();
  const navigate = useNavigate();
  const isAdmin = getTokenRole() === "admin";

  // Filter / sort state
  const [searchQuery, setSearchQuery] = useState("");
  const [decisionFilter, setDecisionFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [activeStatFilter, setActiveStatFilter] = useState("all");

  // Action Queue
  const [queueOpen, setQueueOpen] = useState(false);

  const bids = applications ?? [];
  const total = bids.length;
  const submitted = bids.filter((b) => b.submission_status === "applicant_bid_submitted").length;
  const awaiting  = bids.filter((b) => b.submission_status === "invitation_pending").length;
  const accepted  = bids.filter((b) => b.decision_status === "accepted").length;
  const rejected  = bids.filter((b) => b.decision_status === "rejected").length;
  const closed    = bids.filter((b) => b.submission_status === "response_sent").length;

  const actionItems = buildActionQueue(bids);
  const queueCount = actionItems.length;

  const statCards = [
    { key: "all",       label: "Total",     value: total,     desc: "all applications"    },
    { key: "submitted", label: "Submitted",  value: submitted, desc: "awaiting decision"   },
    { key: "awaiting",  label: "Awaiting",   value: awaiting,  desc: "not yet responded"   },
    { key: "accepted",  label: "Accepted",   value: accepted,  desc: "offers extended"     },
    { key: "rejected",  label: "Rejected",   value: rejected,  desc: "not moving forward"  },
    { key: "closed",    label: "Closed",     value: closed,    desc: "responses sent"      },
  ];

  const visibleBids = bids
    .filter((b) => {
      if (activeStatFilter === "submitted" && b.submission_status !== "applicant_bid_submitted") return false;
      if (activeStatFilter === "awaiting"  && b.submission_status !== "invitation_pending")       return false;
      if (activeStatFilter === "accepted"  && b.decision_status !== "accepted")                  return false;
      if (activeStatFilter === "rejected"  && b.decision_status !== "rejected")                  return false;
      if (activeStatFilter === "closed"    && b.submission_status !== "response_sent")            return false;
      if (decisionFilter !== "all" && b.decision_status !== decisionFilter)    return false;
      if (stageFilter    !== "all" && b.submission_status !== stageFilter)     return false;
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
      const na = (a.candidate_name ?? a.candidate_email ?? a.applicant_identifier).toLowerCase();
      const nb = (b.candidate_name ?? b.candidate_email ?? b.applicant_identifier).toLowerCase();
      if (sortKey === "name_az") return na.localeCompare(nb);
      if (sortKey === "name_za") return nb.localeCompare(na);
      return 0;
    });

  const hasFilter = searchQuery.trim() !== "" || decisionFilter !== "all" || stageFilter !== "all" || activeStatFilter !== "all";

  function clearFilters() {
    setSearchQuery("");
    setDecisionFilter("all");
    setStageFilter("all");
    setActiveStatFilter("all");
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

        {/* Action queue bell */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0, alignSelf: "center" }}>
          <button
            type="button"
            onClick={() => setQueueOpen(true)}
            title="Action Queue"
            style={{
              position: "relative",
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: queueCount > 0 ? "#fff7ed" : "#f4f4f5",
              border: `1.5px solid ${queueCount > 0 ? "#fb923c" : BORDER}`,
              color: queueCount > 0 ? "#ea580c" : MUTED,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "background .15s",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = queueCount > 0 ? "#fed7aa" : "#e4e4e7"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = queueCount > 0 ? "#fff7ed" : "#f4f4f5"; }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M9 2a5 5 0 0 0-5 5v2.5L2.5 12h13L14 9.5V7a5 5 0 0 0-5-5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M7 12.5a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            {queueCount > 0 && (
              <span style={{ position: "absolute", top: -3, right: -3, background: "#ef4444", color: "#fff", borderRadius: "50%", width: 17, height: 17, fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" }}>
                {queueCount > 9 ? "9+" : queueCount}
              </span>
            )}
          </button>
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

        {/* Sort */}
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          style={{ padding: "7px 10px", fontSize: 13, border: `1px solid ${BORDER}`, borderRadius: R_MD, fontFamily: "inherit", color: "#111", background: "#fff", cursor: "pointer" }}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="submitted">Recently submitted</option>
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

        <span style={{ fontSize: 12, color: MUTED, marginLeft: "auto", whiteSpace: "nowrap" }}>
          {visibleBids.length} of {total} application{total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Table ── */}
      <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: R_LG, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${BORDER}`, background: "#fafafa" }}>
              <th style={{ padding: "0.6rem 1.25rem", textAlign: "left", fontSize: 11, fontWeight: 600, color: MUTED, letterSpacing: ".05em", textTransform: "uppercase", width: "99%" }}>Candidate</th>
              <th style={{ padding: "0.6rem 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: MUTED, letterSpacing: ".05em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                Stage
                <LegendPopover title="Application Stage" items={LIFECYCLE_LEGEND} />
              </th>
              <th style={{ padding: "0.6rem 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: MUTED, letterSpacing: ".05em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                Decision
                <LegendPopover title="Hiring Decision" items={DECISION_LEGEND} />
              </th>
              <th style={{ padding: "0.6rem 12px", textAlign: "right", fontSize: 11, fontWeight: 600, color: MUTED, letterSpacing: ".05em", textTransform: "uppercase", whiteSpace: "nowrap" }}>Received</th>
              <th style={{ padding: "0.6rem 1.25rem", textAlign: "right", fontSize: 11, fontWeight: 600, color: MUTED, letterSpacing: ".05em", textTransform: "uppercase", whiteSpace: "nowrap" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} style={{ padding: "3rem", textAlign: "center", color: MUTED, fontSize: 14 }}>Loading applications…</td>
              </tr>
            )}

            {!isLoading && total === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: "3rem", textAlign: "center" }}>
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
                <td colSpan={5} style={{ padding: "2.5rem", textAlign: "center", color: MUTED, fontSize: 14 }}>
                  No applications match the current filters.{" "}
                  <button type="button" onClick={clearFilters} style={{ color: BT, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 500 }}>
                    Clear filters
                  </button>
                </td>
              </tr>
            )}

            {!isLoading && visibleBids.map((bid) => {
              const displayName = bid.candidate_name ?? bid.candidate_email ?? bid.applicant_identifier;
              const dateLabel = bid.candidate_submitted_at
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
                />
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Action Queue sidebar ── */}
      {queueOpen && <ActionQueueSidebar items={actionItems} onClose={() => setQueueOpen(false)} />}
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
}: {
  bid: Phase1Bid;
  displayName: string;
  dateLabel: string;
  isAdmin: boolean;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <tr
      style={{ borderBottom: `1px solid ${BORDER}`, background: hovered ? "#fafaf9" : "#fff", cursor: "pointer", transition: "background .12s" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => navigate(`/invitations/${bid.id}`)}
    >
      {/* Candidate */}
      <td style={{ padding: "0.9rem 1.25rem", maxWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{displayName}</div>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>{dateLabel}</div>
      </td>

      {/* Stage */}
      <td style={{ padding: "0 12px", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
        <LifecycleBadge status={bid.submission_status} />
      </td>

      {/* Decision */}
      <td style={{ padding: "0 12px", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
        <DecisionBadge status={bid.decision_status} />
      </td>

      {/* Date received */}
      <td style={{ padding: "0 12px", fontSize: 12, color: FAINT, whiteSpace: "nowrap", textAlign: "right" }}>
        {formatDate(bid.received_at)}
      </td>

      {/* Actions */}
      <td style={{ padding: "0 1.25rem", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
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
