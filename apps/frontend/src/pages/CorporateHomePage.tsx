import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useCases } from "../hooks/useCases";
import { useBidStats, useGenerateRandomInvitation } from "../hooks/usePhase1Bids";
import type { BidStats, CaseSummary } from "../types/api";

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

// ── Status lifecycle definitions ────────────────────────────────────────────────

const STATUS_LEGEND = [
  {
    key: "draft",
    label: "Draft",
    bg: "#fff7ed",
    color: "#92400e",
    desc: "Created via AI or autofill but not yet published. Invisible to candidates.",
  },
  {
    key: "pending",
    label: "Pending",
    bg: "#fff7ed",
    color: "#92400e",
    desc: "Saved and waiting for operator activation. Candidates cannot apply yet.",
  },
  {
    key: "ready",
    label: "Ready",
    bg: "#fff7ed",
    color: "#92400e",
    desc: "Configuration is complete and the role is ready to go live. Activate to start receiving bids.",
  },
  {
    key: "active",
    label: "Active",
    bg: "#f0faf3",
    color: "#0f6b20",
    desc: "Live and open. Candidates are receiving invitations and submitting bids.",
  },
  {
    key: "closed",
    label: "Closed",
    bg: "#f4f4f5",
    color: "#71717a",
    desc: "No longer accepting new applications. Existing bids can still be reviewed and decided.",
  },
  {
    key: "cancelled",
    label: "Cancelled",
    bg: "#f4f4f5",
    color: "#71717a",
    desc: "Role was terminated before completion. No further action is expected.",
  },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function getCompanyPublicField(cs: CaseSummary, field: string): string | null {
  const pub = cs.parties?.find((p) => p.party_type === "company")?.public_payload ?? {};
  const val = pub[field];
  return typeof val === "string" && val.trim().length > 0 ? val.trim() : null;
}

function getBudgetRange(cs: CaseSummary): string {
  const conf = cs.parties?.find((p) => p.party_type === "company")?.confidential_payload ?? {};
  const floor = conf["budget_floor"];
  const ceiling = conf["budget_ceiling"];
  if (typeof floor === "number" && typeof ceiling === "number") {
    const sym = cs.currency === "USD" ? "$" : cs.currency === "GBP" ? "£" : cs.currency === "EUR" ? "€" : cs.currency + " ";
    return `${sym}${Math.round(floor).toLocaleString()} – ${sym}${Math.round(ceiling).toLocaleString()}`;
  }
  return "Confidential";
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

function StatusBadge({ status }: { status: string }) {
  const lower = status.toLowerCase();
  let bg = "#fff7ed";
  let color = "#92400e";
  if (lower === "active") { bg = BL; color = BT; }
  else if (lower === "closed" || lower === "cancelled") { bg = "#f4f4f5"; color = MUTED; }
  const legend = STATUS_LEGEND.find((s) => s.key === lower);
  return (
    <span
      title={legend ? legend.desc : undefined}
      style={{ background: bg, color, borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", textTransform: "capitalize", cursor: "default" }}
    >
      {status}
    </span>
  );
}

// ── Status legend popover ─────────────────────────────────────────────────────

function StatusLegendPopover() {
  const [open, setOpen] = useState(false);
  return (
    <span
      style={{ position: "relative", display: "inline-flex", alignItems: "center", marginLeft: 5 }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: "#e4e4e7",
          color: "#555",
          fontSize: 9,
          fontWeight: 700,
          cursor: "default",
          userSelect: "none",
          lineHeight: 1,
        }}
      >
        i
      </span>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 60,
            background: "#fff",
            border: "1px solid #e4e4e7",
            borderRadius: 10,
            boxShadow: "0 4px 18px rgba(0,0,0,.13)",
            padding: "10px 12px",
            minWidth: 260,
            pointerEvents: "none",
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: ".05em", textTransform: "uppercase", marginBottom: 8 }}>Status Lifecycle</div>
          {STATUS_LEGEND.map((s) => (
            <div key={s.key} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 7 }}>
              <span style={{ background: s.bg, color: s.color, borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0, textTransform: "capitalize" }}>
                {s.label}
              </span>
              <span style={{ fontSize: 11, color: MUTED, lineHeight: 1.4 }}>{s.desc}</span>
            </div>
          ))}
        </div>
      )}
    </span>
  );
}

// ── Per-row bid stats cell ────────────────────────────────────────────────────

function BidStatsCell({ caseId }: { caseId: string }) {
  const { data } = useBidStats(caseId);
  if (!data) {
    return (
      <td style={{ padding: "0 12px", whiteSpace: "nowrap", color: FAINT, fontSize: 13 }}>—</td>
    );
  }
  return (
    <td style={{ padding: "0 12px", whiteSpace: "nowrap", fontSize: 13, color: MUTED }}>
      <span style={{ fontWeight: 600, color: "#111" }}>{data.invitations_sent}</span>
      <span style={{ color: FAINT }}> / </span>
      <span style={{ fontWeight: 600, color: data.bids_received > 0 ? BT : "#111" }}>{data.bids_received}</span>
    </td>
  );
}

// ── Action Queue helpers ──────────────────────────────────────────────────────

type ActionItem = {
  id: string;
  urgency: "high" | "medium" | "low";
  label: string;
  sublabel: string;
  href: string;
};

function buildActionQueue(cases: CaseSummary[], statsMap: Record<string, BidStats>): ActionItem[] {
  const items: ActionItem[] = [];
  for (const cs of cases) {
    const stats = statsMap[cs.id];
    const jobTitle =
      getCompanyPublicField(cs, "job_title") ??
      getCompanyPublicField(cs, "role_title") ??
      cs.title;
    const age = daysSince(cs.created_at);

    if (cs.status.toLowerCase() === "active") {
      if (stats && stats.bids_received > 0) {
        items.push({
          id: `bids-${cs.id}`,
          urgency: "high",
          label: `${stats.bids_received} bid${stats.bids_received !== 1 ? "s" : ""} awaiting review`,
          sublabel: jobTitle,
          href: `/job-listings/${cs.id}/view-bids`,
        });
      }
      if (stats && stats.invitations_sent === 0 && age >= 1) {
        items.push({
          id: `noinvite-${cs.id}`,
          urgency: "medium",
          label: "No invitations sent yet",
          sublabel: `${jobTitle} · posted ${age}d ago`,
          href: `/job-listings/${cs.id}/view-bids`,
        });
      }
    }
    if (cs.status.toLowerCase() === "pending" && age >= 3) {
      items.push({
        id: `pending-${cs.id}`,
        urgency: "low",
        label: "Role still in Pending — activate or close",
        sublabel: `${jobTitle} · ${age}d old`,
        href: `/job-listings/new?edit=${cs.id}`,
      });
    }
  }
  return items.sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return order[a.urgency] - order[b.urgency];
  });
}

const URGENCY_DOT: Record<string, string> = { high: "#ef4444", medium: "#f59e0b", low: MUTED };

// ── Action Queue sidebar ──────────────────────────────────────────────────────

function ActionQueueSidebar({
  items,
  onClose,
}: {
  items: ActionItem[];
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    function onClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClickOutside);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClickOutside);
    };
  }, [onClose]);

  return (
    <>
      {/* Backdrop */}
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.18)", zIndex: 40 }} />
      {/* Panel */}
      <div
        ref={panelRef}
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 360,
          background: "#fff",
          boxShadow: "-4px 0 24px rgba(0,0,0,.12)",
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{ padding: "1.25rem 1.25rem 1rem", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#111" }}>Action Queue</div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
              {items.length === 0 ? "All caught up" : `${items.length} item${items.length !== 1 ? "s" : ""} need attention`}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", color: MUTED, padding: 4, borderRadius: 6, lineHeight: 1 }}
            aria-label="Close action queue"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Items */}
        <div style={{ flex: 1, overflowY: "auto", padding: "0.75rem 1rem" }}>
          {items.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem 1rem", color: MUTED, fontSize: 13 }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>✓</div>
              No action items right now. All roles are up to date.
            </div>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => { navigate(item.href); onClose(); }}
                style={{
                  width: "100%",
                  textAlign: "left",
                  background: "#fff",
                  border: `1px solid ${BORDER}`,
                  borderRadius: R_LG,
                  padding: "0.875rem 1rem",
                  marginBottom: 8,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  display: "flex",
                  gap: 10,
                  alignItems: "flex-start",
                  transition: "background .12s",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#fafafa"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#fff"; }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: URGENCY_DOT[item.urgency],
                    flexShrink: 0,
                    marginTop: 5,
                  }}
                />
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

// ── Page ──────────────────────────────────────────────────────────────────────

type SortKey = "newest" | "oldest" | "most_bids" | "most_invites";

export function CorporateHomePage() {
  const { data: cases, isLoading } = useCases();
  const navigate = useNavigate();
  const generateInvitation = useGenerateRandomInvitation();
  const [invitingCaseId, setInvitingCaseId] = useState<string | null>(null);

  // Filter / sort state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [activeStatFilter, setActiveStatFilter] = useState<string>("all");

  // Action Queue
  const [queueOpen, setQueueOpen] = useState(false);
  // Collect bid stats for action queue (keyed by caseId)
  const [statsMap, setStatsMap] = useState<Record<string, BidStats>>({});

  const total = cases?.length ?? 0;
  const active = cases?.filter((c) => c.status.toLowerCase() === "active").length ?? 0;
  const pending = cases?.filter((c) => c.status.toLowerCase() === "pending").length ?? 0;
  const closed = cases?.filter((c) => ["closed", "cancelled"].includes(c.status.toLowerCase())).length ?? 0;
  const totalInvites = Object.values(statsMap).reduce((s, v) => s + v.invitations_sent, 0);
  const totalBids = Object.values(statsMap).reduce((s, v) => s + v.bids_received, 0);

  const actionItems = buildActionQueue(cases ?? [], statsMap);
  const queueCount = actionItems.length;

  // Stat cards definition — each maps to a statusFilter value (or special)
  const statCards = [
    { key: "all", label: "Total Listings", value: total, desc: "all roles" },
    { key: "active", label: "Active", value: active, desc: "taking bids" },
    { key: "pending", label: "Pending", value: pending, desc: "not yet live" },
    { key: "closed", label: "Closed", value: closed, desc: "no longer active" },
    { key: "__invites__", label: "Invitations Sent", value: totalInvites, desc: "across all roles", noFilter: true },
    { key: "__bids__", label: "Bids Received", value: totalBids, desc: "total submissions", noFilter: true },
  ];

  // Filtered + sorted rows
  const visibleCases = (cases ?? [])
    .filter((cs) => {
      if (activeStatFilter !== "all" && !["__invites__", "__bids__"].includes(activeStatFilter)) {
        if (cs.status.toLowerCase() !== activeStatFilter) return false;
      }
      if (statusFilter !== "all" && cs.status.toLowerCase() !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const title = (
          (getCompanyPublicField(cs, "job_title") ?? getCompanyPublicField(cs, "role_title") ?? cs.title) + " " +
          (getCompanyPublicField(cs, "category") ?? "") + " " +
          (getCompanyPublicField(cs, "location") ?? cs.jurisdiction ?? "")
        ).toLowerCase();
        if (!title.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sortKey === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortKey === "oldest") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortKey === "most_bids") return (statsMap[b.id]?.bids_received ?? 0) - (statsMap[a.id]?.bids_received ?? 0);
      if (sortKey === "most_invites") return (statsMap[b.id]?.invitations_sent ?? 0) - (statsMap[a.id]?.invitations_sent ?? 0);
      return 0;
    });

  const hasFilter = searchQuery.trim() !== "" || statusFilter !== "all" || activeStatFilter !== "all";

  return (
    <div style={{ fontFamily: "inherit" }}>
      {/* ── Page header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "2rem", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: BL, border: `1px solid #b3e0bb`, borderRadius: 20, padding: "3px 12px", marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: BT, letterSpacing: ".04em", textTransform: "uppercase" }}>Job Listings</span>
          </div>
          <h2 style={{ fontFamily: "var(--font-display, Georgia, serif)", fontSize: 26, fontWeight: 700, letterSpacing: "-.03em", color: "#111", margin: 0, lineHeight: 1.2 }}>
            Job Listings
          </h2>
          <p style={{ fontSize: 14, color: MUTED, marginTop: 6, marginBottom: 0 }}>Manage your open roles and review candidate bids.</p>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0, alignSelf: "center" }}>
          {/* Action queue bell */}
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
              <span style={{
                position: "absolute",
                top: -3,
                right: -3,
                background: "#ef4444",
                color: "#fff",
                borderRadius: "50%",
                width: 17,
                height: 17,
                fontSize: 10,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: "2px solid #fff",
              }}>
                {queueCount > 9 ? "9+" : queueCount}
              </span>
            )}
          </button>

          <Link
            to="/job-listings/new"
            style={{ background: B, color: "#fff", borderRadius: R_MD, padding: "10px 22px", fontSize: 14, fontWeight: 500, textDecoration: "none", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 7 }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <line x1="7" y1="1" x2="7" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <line x1="1" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Post a New Job Listing
          </Link>
        </div>
      </div>

      {/* ── Stats cards (clickable filters) ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, marginBottom: "1.75rem" }}>
        {statCards.map((stat) => {
          const isSelected = activeStatFilter === stat.key && !stat.noFilter;
          return (
            <div
              key={stat.key}
              onClick={() => {
                if (!stat.noFilter) setActiveStatFilter(isSelected ? "all" : stat.key);
              }}
              style={{
                background: "#fff",
                border: `1px solid ${isSelected ? B : BORDER}`,
                borderBottom: isSelected ? `3px solid ${B}` : `1px solid ${BORDER}`,
                borderRadius: R_LG,
                padding: "0.875rem 1rem",
                cursor: stat.noFilter ? "default" : "pointer",
                transition: "border-color .15s",
                userSelect: "none",
              }}
              onMouseEnter={(e) => { if (!stat.noFilter) (e.currentTarget as HTMLDivElement).style.borderColor = isSelected ? B : "#b3b3b8"; }}
              onMouseLeave={(e) => { if (!stat.noFilter) (e.currentTarget as HTMLDivElement).style.borderColor = isSelected ? B : BORDER; }}
            >
              <div style={{ fontSize: 24, fontWeight: 700, color: isSelected ? B : NAVY, lineHeight: 1 }}>{stat.value}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: isSelected ? BT : "#555", marginTop: 3 }}>{stat.label}</div>
              <div style={{ fontSize: 10, color: FAINT, marginTop: 1 }}>{stat.desc}</div>
            </div>
          );
        })}
      </div>

      {/* ── Filter / search toolbar ── */}
      <div
        style={{
          background: "#fff",
          border: `1px solid ${BORDER}`,
          borderRadius: R_LG,
          padding: "0.75rem 1rem",
          marginBottom: "1rem",
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        {/* Search */}
        <div style={{ position: "relative", flex: "1 1 180px" }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: MUTED, pointerEvents: "none" }}>
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M9.5 9.5l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            placeholder="Search roles…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              paddingLeft: 30,
              paddingRight: 10,
              paddingTop: 7,
              paddingBottom: 7,
              fontSize: 13,
              border: `1px solid ${BORDER}`,
              borderRadius: R_MD,
              outline: "none",
              fontFamily: "inherit",
              color: "#111",
              boxSizing: "border-box",
            }}
          />
        </div>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: "7px 10px", fontSize: 13, border: `1px solid ${BORDER}`, borderRadius: R_MD, fontFamily: "inherit", color: "#111", background: "#fff", cursor: "pointer" }}
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="pending">Pending</option>
          <option value="closed">Closed</option>
          <option value="cancelled">Cancelled</option>
        </select>

        {/* Sort */}
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          style={{ padding: "7px 10px", fontSize: 13, border: `1px solid ${BORDER}`, borderRadius: R_MD, fontFamily: "inherit", color: "#111", background: "#fff", cursor: "pointer" }}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="most_bids">Most bids</option>
          <option value="most_invites">Most invitations</option>
        </select>

        {/* Clear filters */}
        {hasFilter && (
          <button
            type="button"
            onClick={() => { setSearchQuery(""); setStatusFilter("all"); setActiveStatFilter("all"); }}
            style={{ padding: "6px 12px", fontSize: 12, fontWeight: 500, border: `1px solid ${BORDER}`, borderRadius: 20, background: "#f4f4f5", color: MUTED, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
          >
            × Clear filters
          </button>
        )}

        <span style={{ fontSize: 12, color: MUTED, marginLeft: "auto", whiteSpace: "nowrap" }}>
          {visibleCases.length} of {total} role{total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Listings table ── */}
      <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: R_LG, overflow: "hidden" }}>
        {/* Column headers */}
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${BORDER}`, background: "#fafafa" }}>
              <th style={{ padding: "0.6rem 1.25rem", textAlign: "left", fontSize: 11, fontWeight: 600, color: MUTED, letterSpacing: ".05em", textTransform: "uppercase", width: "99%" }}>Role</th>
              <th style={{ padding: "0.6rem 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: MUTED, letterSpacing: ".05em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
                Status
                <StatusLegendPopover />
              </th>
              <th style={{ padding: "0.6rem 12px", textAlign: "left", fontSize: 11, fontWeight: 600, color: MUTED, letterSpacing: ".05em", textTransform: "uppercase", whiteSpace: "nowrap" }} title="Invitations sent / Bids received">Inv / Bids</th>
              <th style={{ padding: "0.6rem 12px", textAlign: "right", fontSize: 11, fontWeight: 600, color: MUTED, letterSpacing: ".05em", textTransform: "uppercase", whiteSpace: "nowrap" }}>Posted</th>
              <th style={{ padding: "0.6rem 1.25rem", textAlign: "right", fontSize: 11, fontWeight: 600, color: MUTED, letterSpacing: ".05em", textTransform: "uppercase", whiteSpace: "nowrap" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {/* Loading */}
            {isLoading && (
              <tr>
                <td colSpan={5} style={{ padding: "3rem", textAlign: "center", color: MUTED, fontSize: 14 }}>Loading listings…</td>
              </tr>
            )}

            {/* Empty state */}
            {!isLoading && total === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: "3rem", textAlign: "center" }}>
                  <div style={{ width: 48, height: 48, borderRadius: "50%", background: BL, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 1rem" }}>
                    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                      <rect x="3" y="5" width="16" height="13" rx="2" stroke={BT} strokeWidth="1.5" />
                      <path d="M7 5V4a4 4 0 0 1 8 0v1" stroke={BT} strokeWidth="1.5" strokeLinecap="round" />
                      <path d="M8 11h6M8 14h4" stroke={BT} strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: "#111", marginBottom: 6 }}>No roles posted yet</div>
                  <div style={{ fontSize: 13, color: MUTED, marginBottom: 20 }}>Create your first job listing to start receiving candidate bids.</div>
                  <Link to="/job-listings/new" style={{ background: B, color: "#fff", borderRadius: R_MD, padding: "9px 20px", fontSize: 13, fontWeight: 500, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <line x1="6" y1="1" x2="6" y2="11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                      <line x1="1" y1="6" x2="11" y2="6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                    Post a New Job Listing
                  </Link>
                </td>
              </tr>
            )}

            {/* No results for current filter */}
            {!isLoading && total > 0 && visibleCases.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: "2.5rem", textAlign: "center", color: MUTED, fontSize: 14 }}>
                  No listings match the current filters.{" "}
                  <button type="button" onClick={() => { setSearchQuery(""); setStatusFilter("all"); setActiveStatFilter("all"); }} style={{ color: BT, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 14, fontWeight: 500 }}>
                    Clear filters
                  </button>
                </td>
              </tr>
            )}

            {/* Data rows */}
            {!isLoading &&
              visibleCases.map((cs) => {
                const jobTitle =
                  getCompanyPublicField(cs, "job_title") ??
                  getCompanyPublicField(cs, "role_title") ??
                  cs.title;
                const category = getCompanyPublicField(cs, "category") ?? "—";
                const location = getCompanyPublicField(cs, "location") ?? cs.jurisdiction ?? "—";
                const budgetRange = getBudgetRange(cs);

                return (
                  <RowWithStats
                    key={cs.id}
                    cs={cs}
                    jobTitle={jobTitle}
                    category={category}
                    location={location}
                    budgetRange={budgetRange}
                    invitingCaseId={invitingCaseId}
                    setInvitingCaseId={setInvitingCaseId}
                    generateInvitation={generateInvitation}
                    navigate={navigate}
                    onStatsReady={(caseId, stats) =>
                      setStatsMap((prev) => (prev[caseId]?.bids_received === stats.bids_received && prev[caseId]?.invitations_sent === stats.invitations_sent ? prev : { ...prev, [caseId]: stats }))
                    }
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

// ── Row component (fetches its own bid stats and reports up) ──────────────────

function RowWithStats({
  cs,
  jobTitle,
  category,
  location,
  budgetRange,
  invitingCaseId,
  setInvitingCaseId,
  generateInvitation,
  navigate,
  onStatsReady,
}: {
  cs: CaseSummary;
  jobTitle: string;
  category: string;
  location: string;
  budgetRange: string;
  invitingCaseId: string | null;
  setInvitingCaseId: (id: string | null) => void;
  generateInvitation: ReturnType<typeof useGenerateRandomInvitation>;
  navigate: ReturnType<typeof useNavigate>;
  onStatsReady: (caseId: string, stats: BidStats) => void;
}) {
  const { data: stats } = useBidStats(cs.id);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (stats) onStatsReady(cs.id, stats);
  }, [stats, cs.id, onStatsReady]);

  return (
    <tr
      style={{ borderBottom: `1px solid ${BORDER}`, background: hovered ? "#fafaf9" : "#fff", cursor: "pointer", transition: "background .12s" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => navigate(`/job-listings/${cs.id}/view-bids`)}
    >
      {/* Role */}
      <td style={{ padding: "0.9rem 1.25rem", maxWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: "#111", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{jobTitle}</div>
        <div style={{ fontSize: 12, color: MUTED, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {category}
          {location !== "—" ? ` · ${location}` : ""}
          {" · "}
          <span style={{ color: FAINT }}>{budgetRange}</span>
        </div>
      </td>

      {/* Status */}
      <td style={{ padding: "0 12px", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
        <StatusBadge status={cs.status} />
      </td>

      {/* Inv / Bids */}
      <BidStatsCell caseId={cs.id} />

      {/* Date */}
      <td style={{ padding: "0 12px", fontSize: 12, color: FAINT, whiteSpace: "nowrap", textAlign: "right" }}>
        {formatDate(cs.created_at)}
      </td>

      {/* Actions */}
      <td style={{ padding: "0 1.25rem", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
          {/* Invite button */}
          <button
            type="button"
            title="Generate invitation link"
            disabled={invitingCaseId === cs.id}
            onClick={async () => {
              setInvitingCaseId(cs.id);
              try { await generateInvitation.mutateAsync(cs.id); } finally { setInvitingCaseId(null); }
            }}
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: invitingCaseId === cs.id ? "#fed7aa" : "#fff7ed",
              border: "1.5px solid #fb923c",
              color: "#ea580c",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: invitingCaseId === cs.id ? "not-allowed" : "pointer",
              flexShrink: 0,
              transition: "background .15s",
            }}
          >
            {invitingCaseId === cs.id ? (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ animation: "spin 1s linear infinite" }}>
                <circle cx="8" cy="8" r="6" stroke="#ea580c" strokeWidth="2" strokeDasharray="28" strokeDashoffset="10" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h9A1.5 1.5 0 0 1 14 4.5v.72L8 9 2 5.22V4.5Z" fill="currentColor" opacity=".9" />
                <path d="M2 6.5 7.45 9.93a1 1 0 0 0 1.1 0L14 6.5V11.5A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5V6.5Z" fill="currentColor" opacity=".6" />
                <circle cx="13" cy="3.5" r="2.5" fill="#ea580c" />
                <path d="M13 2.5v2M12 3.5h2" stroke="#fff" strokeWidth="1" strokeLinecap="round" />
              </svg>
            )}
          </button>

          {/* Edit */}
          <button
            type="button"
            onClick={() => navigate(`/job-listings/new?edit=${cs.id}`)}
            style={{ background: "#fff", color: "#374151", border: `1px solid ${BORDER}`, borderRadius: R_MD, padding: "6px 13px", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}
          >
            Edit
          </button>

          {/* View Bids — neutral secondary style */}
          <button
            type="button"
            onClick={() => navigate(`/job-listings/${cs.id}/view-bids`)}
            style={{
              background: "#fff",
              color: "#111",
              border: `1px solid #d1d5db`,
              borderRadius: R_MD,
              padding: "6px 13px",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "inherit",
              whiteSpace: "nowrap",
            }}
            onMouseEnter={(e) => {
              const btn = e.currentTarget as HTMLButtonElement;
              btn.style.background = "#f9fafb";
              btn.style.borderColor = "#9ca3af";
            }}
            onMouseLeave={(e) => {
              const btn = e.currentTarget as HTMLButtonElement;
              btn.style.background = "#fff";
              btn.style.borderColor = "#d1d5db";
            }}
          >
            Bids {stats ? `(${stats.bids_received})` : ""}
          </button>
        </div>
      </td>
    </tr>
  );
}
