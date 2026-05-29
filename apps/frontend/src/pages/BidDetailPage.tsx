import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { getTokenRole } from "../auth/token";
import { useCases } from "../hooks/useCases";
import { useBidDetail, useResendInvitation, useRevokeBid } from "../hooks/usePhase1Bids";
import { copyToClipboard } from "../utils/clipboard";
import { extractBenefitConfig } from "../utils/caseMeta";

// ── Brand tokens ────────────────────────────────────────────────────────────────
const B = "#019529";
const BL = "#f0faf3";
const BT = "#0f6b20";
const NAVY = "#1B1035";
const BORDER = "#e4e4e7";
const MUTED = "#71717a";
const R_MD = "10px";
const R_LG = "14px";

// ── Helpers ─────────────────────────────────────────────────────────────────────
function fmtMoney(value: number): string {
  return value.toLocaleString("en-US");
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function rankLabel(rank: number): { text: string; color: string; bg: string } {
  if (rank === 3) return { text: "High", color: "#166534", bg: "#dcfce7" };
  if (rank === 2) return { text: "Med", color: "#92400e", bg: "#fef3c7" };
  return { text: "Low", color: "#991b1b", bg: "#fee2e2" };
}

function formatMatchScore(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Not scored yet";
  const clamped = Math.max(0, Math.min(100, value));
  const rounded = Math.round(clamped * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}

// ── Sub-components ───────────────────────────────────────────────────────────────
function RankBadge({ label, rank }: { label: string; rank: number }) {
  const { text, color, bg } = rankLabel(rank);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        marginBottom: 10,
      }}
    >
      <span style={{ fontSize: 14, color: "#111", fontWeight: 500 }}>{label}</span>
      <span
        style={{
          background: bg,
          color,
          borderRadius: 20,
          padding: "3px 12px",
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        {text}
      </span>
    </div>
  );
}

function DecisionPill({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string; bg: string; dot: string }> = {
    accepted: { label: "Accepted", color: "#166534", bg: "#dcfce7", dot: "#16a34a" },
    rejected: { label: "Rejected", color: "#991b1b", bg: "#fee2e2", dot: "#dc2626" },
    pending: { label: "Pending", color: "#92400e", bg: "#fef3c7", dot: "#d97706" },
  };
  const s = map[status] ?? map["pending"];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: s.bg,
        color: s.color,
        borderRadius: 20,
        padding: "4px 12px",
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.dot, display: "inline-block" }} />
      {s.label}
    </span>
  );
}

function LifecyclePill({ status }: { status: string }) {
  const label =
    status === "response_sent" ? "Bid Closed" :
    status === "invitation_pending" ? "Bid Invitation Sent" :
    "Bid Open";
  const color =
    status === "response_sent" ? "#52525b" :
    status === "invitation_pending" ? "#92400e" :
    "#1e3a5f";
  const bg =
    status === "response_sent" ? "#f4f4f5" :
    status === "invitation_pending" ? "#fef3c7" :
    "#eff6ff";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: bg,
        color,
        borderRadius: 20,
        padding: "4px 12px",
        fontSize: 13,
        fontWeight: 500,
      }}
    >
      {label}
    </span>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────────
export function BidDetailPage() {
  const { bidId, applicationId } = useParams<{ bidId?: string; applicationId?: string }>();
  const id = bidId ?? applicationId ?? "";
  const isAdmin = getTokenRole() === "admin";
  const navigate = useNavigate();

  const { data: bid, isLoading, isError } = useBidDetail(id || null);
  const { data: cases } = useCases();
  const resendInvitation = useResendInvitation();
  const revokeBid = useRevokeBid();

  const [revokeConfirm, setRevokeConfirm] = useState(false);
  const [copied, setCopied] = useState(false);

  const matchedCase = bid && cases ? cases.find((c) => c.id === bid.case_id) ?? null : null;
  const benefitConfig = matchedCase ? extractBenefitConfig(matchedCase) : null;

  // ── Page styles ----------------------------------------------------------------
  const pageWrap: React.CSSProperties = {
    minHeight: "100vh",
    background: "#f6f7f8",
    padding: "2rem 1rem",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
  };
  const card: React.CSSProperties = {
    background: "#fff",
    border: `1px solid ${BORDER}`,
    borderRadius: R_LG,
    padding: "2rem",
    width: "100%",
    maxWidth: 640,
    boxShadow: "0 2px 12px rgba(0,0,0,.07)",
  };
  const section: React.CSSProperties = {
    marginBottom: 28,
    paddingBottom: 24,
    borderBottom: `1px solid ${BORDER}`,
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: ".06em",
    color: MUTED,
    marginBottom: 4,
  };
  const valueStyle: React.CSSProperties = {
    fontSize: 15,
    color: "#111",
  };

  // ── Loading / error states -------------------------------------------------------
  if (isLoading) {
    return (
      <div style={pageWrap}>
        <div style={card}>
          <p style={{ textAlign: "center", color: MUTED, padding: "2rem 0" }}>Loading bid details…</p>
        </div>
      </div>
    );
  }

  if (isError || !bid) {
    return (
      <div style={pageWrap}>
        <div style={card}>
          <div style={{ textAlign: "center", padding: "2rem 1rem" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#111", marginBottom: 8 }}>Bid not found</h2>
            <p style={{ fontSize: 14, color: MUTED, marginBottom: 20 }}>
              This bid may have been removed or the link is invalid.
            </p>
            <Link
              to="/invitations"
              style={{ color: B, fontSize: 14, fontWeight: 600, textDecoration: "none" }}
            >
              ← Back to Invitations
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isAwaiting = bid.submission_status === "invitation_pending";
  const backHref = applicationId
    ? `/invitations`
    : `/corporate/bids?case=${bid.case_id}`;

  return (
    <div style={pageWrap}>
      <div style={{ width: "100%", maxWidth: 640, marginBottom: 12 }}>
        <Link
          to={backHref}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: MUTED,
            textDecoration: "none",
            border: `1px solid ${BORDER}`,
            borderRadius: 20,
            padding: "5px 14px",
            background: "#fff",
          }}
        >
          ← View Bids
        </Link>
      </div>

      <div style={card}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              background: BL,
              border: `1px solid #b3e0bb`,
              borderRadius: R_LG,
              padding: "1rem 1.25rem",
              marginBottom: 16,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: BT,
                textTransform: "uppercase",
                letterSpacing: ".05em",
                marginBottom: 4,
              }}
            >
              Bid Detail — Read Only
            </div>
            <h1
              style={{
                fontFamily: "var(--font-display, Georgia, serif)",
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: "-.02em",
                color: NAVY,
                margin: "0 0 6px",
              }}
            >
              {matchedCase?.title ?? "Job Listing"}
            </h1>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <DecisionPill status={bid.decision_status} />
              <LifecyclePill status={bid.submission_status} />
            </div>
          </div>
        </div>

        {/* Candidate */}
        <div style={section}>
          <div style={labelStyle}>Candidate</div>
          {bid.candidate_name ? (
            <p style={{ ...valueStyle, fontWeight: 600, marginBottom: 2 }}>{bid.candidate_name}</p>
          ) : null}
          <p style={{ fontSize: 14, color: MUTED, margin: 0 }}>
            {bid.candidate_email ?? bid.applicant_identifier}
          </p>
          {isAwaiting ? (
            <p style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>
              Invited {formatDate(bid.received_at)}
            </p>
          ) : bid.candidate_submitted_at ? (
            <p style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>
              Submitted {formatDate(bid.candidate_submitted_at)}
            </p>
          ) : (
            <p style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>
              Received {formatDate(bid.received_at)}
            </p>
          )}
          {isAdmin && bid.invitation_code && (
            <div
              style={{
                marginTop: 10,
                background: "#fffbeb",
                border: "1px solid #fde68a",
                borderRadius: R_MD,
                padding: "10px 12px",
                fontSize: 12,
                color: "#92400e",
              }}
            >
              <div style={{ marginBottom: 6 }}>
                <span style={{ fontWeight: 600 }}>Invitation code (admin only): </span>
                <code style={{ letterSpacing: "0.1em", fontFamily: "monospace", fontSize: 14 }}>
                  {bid.invitation_code}
                </code>
              </div>
              {/* Test URL for incognito testing */}
              <div
                style={{
                  background: "#fff",
                  border: "1px solid #fde68a",
                  borderRadius: 6,
                  padding: "7px 10px",
                  fontFamily: "monospace",
                  fontSize: 11,
                  color: "#444",
                  wordBreak: "break-all",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                }}
              >
                <span style={{ flex: 1 }}>
                  <span style={{ fontWeight: 600, fontFamily: "inherit", color: "#92400e" }}>Apply URL: </span>
                  {`${window.location.origin}/apply/${bid.token}`}
                </span>
                <button
                  type="button"
                  title="Copy apply URL"
                  onClick={() => {
                    void copyToClipboard(`${window.location.origin}/apply/${bid.token}`).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    });
                  }}
                  style={{
                    flexShrink: 0,
                    background: copied ? "#dcfce7" : "#f9fafb",
                    border: "1px solid #d1d5db",
                    borderRadius: 5,
                    padding: "3px 8px",
                    fontSize: 11,
                    fontFamily: "inherit",
                    cursor: "pointer",
                    color: copied ? "#166534" : "#374151",
                    whiteSpace: "nowrap",
                    fontWeight: 600,
                  }}
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <p style={{ marginTop: 5, marginBottom: 0, fontSize: 11, color: "#a16207" }}>
                Open in an incognito tab, then enter the code above to test the candidate auth flow.
              </p>

              {/* Resend / Revoke actions */}
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button
                  type="button"
                  disabled={resendInvitation.isPending}
                  onClick={() => resendInvitation.mutate(bid.id)}
                  style={{
                    background: resendInvitation.isSuccess ? "#dcfce7" : "#fffbeb",
                    color: resendInvitation.isSuccess ? "#166534" : "#92400e",
                    border: "1px solid #fcd34d",
                    borderRadius: 20,
                    padding: "5px 14px",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: resendInvitation.isPending ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                    whiteSpace: "nowrap",
                  }}
                >
                  {resendInvitation.isPending ? "Refreshing…" : resendInvitation.isSuccess ? "✓ Code refreshed" : "↻ Resend Invitation"}
                </button>

                {!revokeConfirm ? (
                  <button
                    type="button"
                    onClick={() => setRevokeConfirm(true)}
                    style={{
                      background: "#fff",
                      color: "#dc2626",
                      border: "1px solid #fca5a5",
                      borderRadius: 20,
                      padding: "5px 14px",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Revoke Invitation
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={revokeBid.isPending}
                      onClick={async () => {
                        await revokeBid.mutateAsync({ bidId: bid.id, caseId: bid.case_id });
                        navigate(`/job-listings/${bid.case_id}/view-bids`);
                      }}
                      style={{
                        background: "#dc2626",
                        color: "#fff",
                        border: "none",
                        borderRadius: 20,
                        padding: "5px 14px",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: revokeBid.isPending ? "not-allowed" : "pointer",
                        fontFamily: "inherit",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {revokeBid.isPending ? "Revoking…" : "Confirm Revoke"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRevokeConfirm(false)}
                      style={{
                        background: "#f4f4f5",
                        color: "#52525b",
                        border: "1px solid #e4e4e7",
                        borderRadius: 20,
                        padding: "5px 14px",
                        fontSize: 12,
                        fontWeight: 500,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Salary */}
        {!isAwaiting && (
          <div style={section}>
            <div style={labelStyle}>Salary Expectations</div>
            {isAdmin ? (
              <p style={{ ...valueStyle, fontWeight: 600 }}>
                ${fmtMoney(bid.salary_min)} – ${fmtMoney(bid.salary_max)}
              </p>
            ) : (
              <span
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  filter: "blur(6px)",
                  userSelect: "none",
                  display: "inline-block",
                }}
                title="Salary specifics are entrusted with SalarySafe"
              >
                ${fmtMoney(bid.salary_min)} – ${fmtMoney(bid.salary_max)}
              </span>
            )}
          </div>
        )}

        {/* Benefit priorities */}
        {!isAwaiting && (
          <div style={section}>
            <div style={labelStyle}>Benefit Priorities</div>
            {benefitConfig && benefitConfig.extraBenefitChips.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, margin: "8px 0 12px" }}>
                {benefitConfig.extraBenefitChips.map((chip) => (
                  <span
                    key={chip}
                    style={{
                      background: BL,
                      color: BT,
                      border: `1px solid #b3e0bb`,
                      borderRadius: 20,
                      padding: "2px 10px",
                      fontSize: 11,
                      fontWeight: 500,
                    }}
                  >
                    {chip}
                  </span>
                ))}
              </div>
            )}
            <div style={{ marginTop: 4 }}>
              {(benefitConfig?.showInsuranceRank ?? true) && (
                <RankBadge label={benefitConfig?.insuranceLabel ?? "Health Insurance"} rank={bid.insurance_importance_rank} />
              )}
              {(benefitConfig?.showPtoRank ?? true) && (
                <RankBadge label={benefitConfig?.ptoLabel ?? "Paid Time Off (PTO)"} rank={bid.pto_importance_rank} />
              )}
              {(benefitConfig?.showWfhRank ?? true) && (
                <RankBadge label={benefitConfig?.wfhLabel ?? "Remote / WFH"} rank={bid.wfh_importance_rank} />
              )}
            </div>
          </div>
        )}

        {/* Decision reason */}
        {(bid.decision_reason || bid.match_score !== null) && (
          <div style={section}>
            <div style={labelStyle}>Match Score</div>
            <p style={{ ...valueStyle, fontSize: 14, lineHeight: 1.4, marginBottom: 10 }}>{formatMatchScore(bid.match_score)}</p>

            {bid.decision_reason ? (
              <>
            <div style={labelStyle}>Decision Reason</div>
            <p style={{ ...valueStyle, fontSize: 14, lineHeight: 1.55 }}>{bid.decision_reason}</p>
              </>
            ) : null}
          </div>
        )}

        {/* Response message */}
        {bid.response_message && (
          <div style={{ ...section, borderBottom: "none", marginBottom: 0, paddingBottom: 0 }}>
            <div style={labelStyle}>Response Message</div>
            <p style={{ ...valueStyle, fontSize: 14, lineHeight: 1.55 }}>{bid.response_message}</p>
            {bid.sent_at && (
              <p style={{ fontSize: 12, color: MUTED, marginTop: 6 }}>Sent {formatDate(bid.sent_at)}</p>
            )}
          </div>
        )}

        {isAwaiting && (
          <div
            style={{
              background: "#fffbeb",
              border: "1px solid #fde68a",
              borderRadius: R_MD,
              padding: "10px 14px",
              fontSize: 13,
              color: "#92400e",
            }}
          >
            This candidate has been invited but has not yet submitted their bid.
          </div>
        )}
      </div>
    </div>
  );
}
