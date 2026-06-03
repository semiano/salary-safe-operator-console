import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";

import { useAllApplications } from "../hooks/useApplications";
import type { Phase1Bid } from "../types/api";

// ── Shared constants ──────────────────────────────────────────────────────────
const MUTED = "#71717a";
const BORDER = "#e4e4e7";
const FAINT = "#c4c4c8";
const R_LG = "14px";

// ── Helpers ───────────────────────────────────────────────────────────────────
function daysSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

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

// ── Sidebar drawer ────────────────────────────────────────────────────────────
function ActionQueueSidebar({ items, onClose }: { items: ActionItem[]; onClose: () => void }) {
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    function onOutside(e: MouseEvent) { if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose(); }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onOutside);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onOutside); };
  }, [onClose]);

  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.18)", zIndex: 40 }} />
      <div
        ref={panelRef}
        style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 360, background: "#fff", boxShadow: "-4px 0 24px rgba(0,0,0,.12)", zIndex: 50, display: "flex", flexDirection: "column" }}
      >
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

// ── Bell button + sidebar ─────────────────────────────────────────────────────
export function ActionQueueBell() {
  const { data: applications } = useAllApplications();
  const [open, setOpen] = useState(false);

  const actionItems = buildActionQueue(applications ?? []);
  const count = actionItems.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Action Queue"
        aria-label={`Action Queue${count > 0 ? ` (${count} items)` : ""}`}
        style={{
          position: "relative",
          width: 38,
          height: 38,
          borderRadius: "50%",
          background: count > 0 ? "#fff7ed" : "#f4f4f5",
          border: `1.5px solid ${count > 0 ? "#fb923c" : BORDER}`,
          color: count > 0 ? "#ea580c" : MUTED,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          flexShrink: 0,
          transition: "background .15s",
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = count > 0 ? "#fed7aa" : "#e4e4e7"; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = count > 0 ? "#fff7ed" : "#f4f4f5"; }}
      >
        <svg width="17" height="17" viewBox="0 0 18 18" fill="none">
          <path d="M9 2a5 5 0 0 0-5 5v2.5L2.5 12h13L14 9.5V7a5 5 0 0 0-5-5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M7 12.5a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {count > 0 && (
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
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && createPortal(
        <ActionQueueSidebar items={actionItems} onClose={() => setOpen(false)} />,
        document.body,
      )}
    </>
  );
}
