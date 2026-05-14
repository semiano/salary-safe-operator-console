/**
 * CandidateApplyPage — new-taxonomy public apply form at /apply/:token
 * Adds an invitation-code gate before the form is shown.
 */
import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";

import { apiGetPublic, apiPostPublic } from "../api/client";
import type { PublicBidLookup } from "../types/api";

// ── Brand tokens ──────────────────────────────────────────────────────────────
const B = "#019529";
const BL = "#f0faf3";
const BT = "#0f6b20";
const NAVY = "#1B1035";
const BORDER = "#e4e4e7";
const MUTED = "#71717a";
const R_MD = "10px";
const R_LG = "14px";

// ── Shared styles ─────────────────────────────────────────────────────────────
const pageWrap: React.CSSProperties = {
  minHeight: "100vh",
  background: "#f8fafc",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  padding: "3rem 1rem",
  fontFamily: "inherit",
};
const card: React.CSSProperties = {
  background: "#fff",
  border: `1px solid ${BORDER}`,
  borderRadius: R_LG,
  padding: "2rem",
  width: "100%",
  maxWidth: 540,
};
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  border: `1px solid ${BORDER}`,
  borderRadius: R_MD,
  fontSize: 14,
  fontFamily: "inherit",
  color: "#111",
  outline: "none",
  boxSizing: "border-box",
};

// ── Sub-components ─────────────────────────────────────────────────────────────
function BrandMark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: "1.5rem" }}>
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 8,
          background: B,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 1l1.5 4h4l-3.2 2.3 1.2 4L7 9l-3.5 2.3 1.2-4L1.5 5h4L7 1z" fill="#fff" />
        </svg>
      </div>
      <span style={{ fontSize: 15, fontWeight: 700, color: NAVY, letterSpacing: "-.02em" }}>SalarySafe</span>
    </div>
  );
}

function currencySymbol(currency: string): string {
  if (currency === "USD") return "$";
  if (currency === "GBP") return "£";
  if (currency === "EUR") return "€";
  return currency + " ";
}

function RankSelector({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: 1 | 2 | 3 | null;
  onChange: (v: 1 | 2 | 3) => void;
}) {
  const options: { v: 1 | 2 | 3; label: string }[] = [
    { v: 1, label: "Low priority" },
    { v: 2, label: "Medium" },
    { v: 3, label: "Top priority" },
  ];
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: "block", fontWeight: 600, fontSize: 14, color: "#111", marginBottom: 4 }}>
        {label}
      </label>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>{hint}</div>
      <div style={{ display: "flex", gap: 8 }}>
        {options.map((opt) => (
          <button
            key={opt.v}
            type="button"
            onClick={() => onChange(opt.v)}
            style={{
              flex: 1,
              padding: "8px 4px",
              borderRadius: R_MD,
              border: `2px solid ${value === opt.v ? B : BORDER}`,
              background: value === opt.v ? BL : "#fff",
              color: value === opt.v ? BT : MUTED,
              fontSize: 13,
              fontWeight: value === opt.v ? 600 : 400,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all 0.15s",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function AlignmentBar({ pct, label }: { pct: number; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(255,255,255,.15)", overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: 3, background: B, width: `${pct}%` }} />
      </div>
      <span style={{ fontSize: 11, color: "rgba(255,255,255,.55)" }}>{label}</span>
    </div>
  );
}

function LeftSidebarCards() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          background: "#fff",
          border: `1px solid ${BORDER}`,
          borderRadius: R_LG,
          padding: "1.25rem",
          boxShadow: "0 1px 6px rgba(0,0,0,.05)",
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: BT,
            textTransform: "uppercase",
            letterSpacing: ".06em",
            marginBottom: 10,
          }}
        >
          Your task
        </div>
        <p style={{ fontSize: 13, color: "#222", lineHeight: 1.65, margin: "0 0 10px" }}>
          Complete your compensation target and benefit priorities, then submit your application.
        </p>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#444", lineHeight: 1.8 }}>
          <li>Set your minimum and target salary range.</li>
          <li>Rank each benefit area by importance to you.</li>
          <li>Review the role details before submitting.</li>
        </ul>
        <div
          style={{
            marginTop: 14,
            background: BL,
            border: "1px solid #b3e0bb",
            borderRadius: R_MD,
            padding: "9px 12px",
            fontSize: 12,
            color: BT,
            lineHeight: 1.55,
          }}
        >
          <strong>Privacy:</strong> Your details are handled confidentially and only shared with the hiring team.
        </div>
      </div>

      <div
        style={{
          background: NAVY,
          borderRadius: R_LG,
          padding: "1.25rem",
        }}
      >
        <p
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: ".1em",
            color: "#5ab870",
            margin: "0 0 .75rem",
          }}
        >
          How matching works
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {[
            { num: "1", label: "Role listed confidentially", note: "Employer budget is never exposed to candidates" },
            { num: "2", label: "You submit privately", note: "Only your application details are reviewed" },
            { num: "3", label: "SalarySafe checks fit", note: "Matching logic compares alignment signals" },
            { num: "4", label: "Hiring team follows up", note: "Next steps proceed once there is alignment" },
          ].map((step) => (
            <div key={step.num} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  background: step.num === "3" ? B : "#2a1d4f",
                  border: "1px solid rgba(255,255,255,.15)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#fff",
                  flexShrink: 0,
                }}
              >
                {step.num}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: "#fff", lineHeight: 1.3 }}>{step.label}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,.45)", marginTop: 2 }}>{step.note}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: "1rem", borderTop: "0.5px solid rgba(255,255,255,.1)", paddingTop: ".875rem" }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,.35)", marginBottom: 8 }}>Alignment signal examples</div>
          <AlignmentBar pct={90} label="Strong" />
          <div style={{ marginTop: 8 }}>
            <AlignmentBar pct={55} label="Partial" />
          </div>
          <div style={{ marginTop: 8 }}>
            <AlignmentBar pct={22} label="No match" />
          </div>
        </div>
      </div>
    </div>
  );
}

function JobDescriptionSlideout({
  open,
  title,
  description,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  onClose: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close job description"
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(17,24,39,.35)",
          border: "none",
          zIndex: 30,
          cursor: "pointer",
        }}
      />
      <aside
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100vh",
          width: "min(560px, 92vw)",
          background: "#fff",
          borderLeft: `1px solid ${BORDER}`,
          boxShadow: "-8px 0 24px rgba(0,0,0,.12)",
          zIndex: 31,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ padding: "1rem 1.25rem", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 600 }}>Full job description</div>
            <h3 style={{ margin: "4px 0 0", fontSize: 16, color: NAVY }}>{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: `1px solid ${BORDER}`,
              borderRadius: R_MD,
              padding: "7px 10px",
              fontSize: 12,
              color: MUTED,
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
        <div style={{ padding: "1.25rem", overflowY: "auto", lineHeight: 1.7, fontSize: 14, color: "#27272a", whiteSpace: "pre-wrap" }}>
          {description}
        </div>
      </aside>
    </>
  );
}

// ── Code gate screen ──────────────────────────────────────────────────────────
function CodeGate({
  token,
  jobTitle,
  candidateName,
  onVerified,
}: {
  token: string;
  jobTitle: string;
  candidateName: string | null;
  onVerified: (code: string) => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const verifyMutation = useMutation({
    mutationFn: (payload: { code: string }) =>
      apiPostPublic<{ valid: boolean }>(`/apply/${token}/verify-code`, payload),
    onSuccess: () => {
      setError(null);
      onVerified(code.trim().toUpperCase());
    },
    onError: () => {
      setError("Invalid invitation code. Please check your email and try again.");
    },
  });

  return (
    <div style={pageWrap}>
      <div style={card}>
        <BrandMark />
        <div
          style={{
            background: BL,
            border: "1px solid #b3e0bb",
            borderRadius: R_LG,
            padding: "1.25rem",
            marginBottom: "1.75rem",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: BT, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>
            Application Invitation
          </div>
          <h1
            style={{
              fontFamily: "var(--font-display, Georgia, serif)",
              fontSize: 22,
              fontWeight: 700,
              color: NAVY,
              margin: "0 0 4px",
              letterSpacing: "-.02em",
            }}
          >
            {jobTitle}
          </h1>
          {candidateName && (
            <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>
              Hi <strong style={{ color: "#111" }}>{candidateName}</strong> — access is protected.
            </p>
          )}
        </div>

        <p style={{ fontSize: 14, color: "#444", marginBottom: 20, lineHeight: 1.55 }}>
          This application form is protected. Please enter the invitation code from the email you received.
        </p>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#111", marginBottom: 6 }}>
            Invitation Code
          </label>
          <input
            type="text"
            placeholder="e.g. AB1C2D"
            value={code}
            maxLength={10}
            autoFocus
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && code.trim().length >= 4) {
                verifyMutation.mutate({ code: code.trim() });
              }
            }}
            style={{ ...inputStyle, letterSpacing: "0.12em", textTransform: "uppercase", fontSize: 16 }}
          />
        </div>

        {error && (
          <div
            style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: R_MD,
              padding: "10px 14px",
              fontSize: 13,
              color: "#b91c1c",
              marginBottom: 16,
            }}
          >
            {error}
          </div>
        )}

        <button
          type="button"
          disabled={verifyMutation.isPending || code.trim().length < 4}
          onClick={() => verifyMutation.mutate({ code: code.trim() })}
          style={{
            width: "100%",
            background: verifyMutation.isPending || code.trim().length < 4 ? "#a3d9b0" : B,
            color: "#fff",
            border: "none",
            borderRadius: R_MD,
            padding: "12px",
            fontSize: 15,
            fontWeight: 600,
            cursor: verifyMutation.isPending || code.trim().length < 4 ? "not-allowed" : "pointer",
            fontFamily: "inherit",
          }}
        >
          {verifyMutation.isPending ? "Verifying…" : "Continue →"}
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function CandidateApplyPage() {
  const { token } = useParams<{ token: string }>();

  const { data: bid, isLoading, isError } = useQuery({
    queryKey: ["apply-bid", token],
    queryFn: () => apiGetPublic<PublicBidLookup>(`/apply/${token}`),
    enabled: Boolean(token),
    retry: false,
  });

  const [codeVerified, setCodeVerified] = useState(false);
  const [verifiedInvitationCode, setVerifiedInvitationCode] = useState<string | null>(null);
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [insuranceRank, setInsuranceRank] = useState<1 | 2 | 3 | null>(null);
  const [ptoRank, setPtoRank] = useState<1 | 2 | 3 | null>(null);
  const [wfhRank, setWfhRank] = useState<1 | 2 | 3 | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [jobDescriptionOpen, setJobDescriptionOpen] = useState(false);

  const submitMutation = useMutation({
    mutationFn: (payload: {
      salary_min: number;
      salary_max: number;
      insurance_importance_rank: 1 | 2 | 3;
      pto_importance_rank: 1 | 2 | 3;
      wfh_importance_rank: 1 | 2 | 3;
      invitation_code?: string;
    }) => apiPostPublic<{ ok: boolean; message: string }>(`/apply/${token}/submit`, payload),
    onSuccess: () => setSubmitted(true),
  });

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div style={pageWrap}>
        <div style={card}>
          <div style={{ textAlign: "center", padding: "3rem", color: MUTED, fontSize: 14 }}>
            Loading invitation…
          </div>
        </div>
      </div>
    );
  }

  if (isError || !bid) {
    return (
      <div style={pageWrap}>
        <div style={card}>
          <BrandMark />
          <div style={{ textAlign: "center", padding: "2rem 1rem" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#111", marginBottom: 8 }}>
              Invitation not found
            </h2>
            <p style={{ fontSize: 14, color: MUTED }}>
              This link may be invalid or has expired. Please contact the hiring team.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Already submitted ──────────────────────────────────────────────────────
  if (bid.already_submitted || submitted) {
    return (
      <div style={pageWrap}>
        <div style={card}>
          <BrandMark />
          <div style={{ textAlign: "center", padding: "1.5rem 1rem 2rem" }}>
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: BL,
                border: "2px solid #b3e0bb",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 1rem",
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <path d="M5 13l4 4L19 7" stroke={BT} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#111", marginBottom: 8 }}>
              Application submitted!
            </h2>
            <p style={{ fontSize: 14, color: MUTED }}>
              Your application for <strong>{bid.job_title}</strong> has been submitted confidentially.
              The hiring team will review it and be in touch.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Code gate ──────────────────────────────────────────────────────────────
  if (bid.requires_code && !codeVerified) {
    return (
      <CodeGate
        token={token!}
        jobTitle={bid.job_title}
        candidateName={bid.candidate_name}
        onVerified={(code) => {
          setVerifiedInvitationCode(code);
          setCodeVerified(true);
        }}
      />
    );
  }

  // ── Application form ───────────────────────────────────────────────────────
  const sym = currencySymbol(bid.currency);

  function handleSubmit() {
    if (!bid) {
      return;
    }

    setValidationError(null);
    const min = parseFloat(salaryMin.replace(/,/g, ""));
    const max = parseFloat(salaryMax.replace(/,/g, ""));
    if (!salaryMin || isNaN(min) || min <= 0) {
      setValidationError("Please enter your minimum salary expectation.");
      return;
    }
    if (!salaryMax || isNaN(max) || max <= 0) {
      setValidationError("Please enter your target salary expectation.");
      return;
    }
    if (max < min) {
      setValidationError("Target salary must be at or above the minimum.");
      return;
    }
    if (!insuranceRank || !ptoRank || !wfhRank) {
      setValidationError("Please set your priority level for all three benefit categories.");
      return;
    }
    if (bid.requires_code && !verifiedInvitationCode) {
      setValidationError("Please verify your invitation code before submitting.");
      return;
    }
    submitMutation.mutate({
      salary_min: min,
      salary_max: max,
      insurance_importance_rank: insuranceRank,
      pto_importance_rank: ptoRank,
      wfh_importance_rank: wfhRank,
      invitation_code: bid.requires_code ? verifiedInvitationCode ?? undefined : undefined,
    });
  }

  return (
    <div style={pageWrap}>
      <div
        style={{
          width: "100%",
          maxWidth: 1180,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 20,
          alignItems: "start",
        }}
      >
        <aside style={{ minWidth: 0 }}>
          <LeftSidebarCards />
        </aside>

        <div style={{ ...card, maxWidth: "none" }}>
        <BrandMark />

        {/* Job info header */}
        <div
          style={{
            background: BL,
            border: "1px solid #b3e0bb",
            borderRadius: R_LG,
            padding: "1.25rem",
            marginBottom: "1.75rem",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: BT, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>
            Application Invitation
          </div>
          <h1
            style={{
              fontFamily: "var(--font-display, Georgia, serif)",
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: "-.02em",
              color: NAVY,
              margin: "0 0 8px",
            }}
          >
            {bid.job_title}
          </h1>
          {bid.company_description && (
            <button
              type="button"
              onClick={() => setJobDescriptionOpen(true)}
              style={{
                background: "#fff",
                border: "1px solid #b3e0bb",
                borderRadius: 999,
                color: BT,
                fontSize: 12,
                fontWeight: 600,
                padding: "6px 10px",
                marginBottom: 10,
                cursor: "pointer",
              }}
            >
              View full job description
            </button>
          )}
          {(bid.work_arrangement || bid.location) && (
            <div style={{ fontSize: 13, color: MUTED, marginBottom: 8 }}>
              {[bid.work_arrangement, bid.location].filter(Boolean).join(" · ")}
            </div>
          )}
          {bid.company_description && (
            <div style={{ fontSize: 13, color: "#444", lineHeight: 1.55, marginBottom: 8 }}>
              {bid.company_description.length > 300
                ? bid.company_description.slice(0, 300) + "…"
                : bid.company_description}
            </div>
          )}
          {bid.benefits.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {bid.benefits.map((b) => (
                <span
                  key={b}
                  style={{
                    background: "#fff",
                    border: "1px solid #b3e0bb",
                    borderRadius: 20,
                    padding: "3px 10px",
                    fontSize: 12,
                    color: BT,
                    fontWeight: 500,
                  }}
                >
                  {b}
                </span>
              ))}
            </div>
          )}
        </div>

        {bid.candidate_name && (
          <p style={{ fontSize: 14, color: MUTED, marginBottom: "1.25rem" }}>
            Hi <strong style={{ color: "#111" }}>{bid.candidate_name}</strong>, please fill in your salary
            expectations and benefit priorities below.
          </p>
        )}

        {/* Salary section */}
        <div style={{ marginBottom: 28 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "#111", marginBottom: 4 }}>
            Total Annual Compensation Target ({bid.currency})
          </h3>
          <div style={{ fontSize: 13, color: MUTED, marginBottom: 14 }}>
            Enter the annual salary range you would consider for this role.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#111", marginBottom: 6 }}>
                Minimum ({sym})
              </label>
              <input
                type="number"
                min={0}
                step={1000}
                placeholder="e.g. 80000"
                value={salaryMin}
                onChange={(e) => setSalaryMin(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#111", marginBottom: 6 }}>
                Target ({sym})
              </label>
              <input
                type="number"
                min={0}
                step={1000}
                placeholder="e.g. 100000"
                value={salaryMax}
                onChange={(e) => setSalaryMax(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>
        </div>

        {/* Benefit priorities */}
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "#111", marginBottom: 4 }}>
            Benefit Priorities
          </h3>
          <div style={{ fontSize: 13, color: MUTED, marginBottom: 16 }}>
            How important is each benefit to you? This helps us match you with the right offer.
          </div>
          <RankSelector label="Health Insurance" hint="Medical, dental, and vision coverage" value={insuranceRank} onChange={setInsuranceRank} />
          <RankSelector label="Paid Time Off (PTO)" hint="Vacation days, sick leave, and personal days" value={ptoRank} onChange={setPtoRank} />
          <RankSelector label="Remote / WFH Flexibility" hint="Ability to work from home or remotely" value={wfhRank} onChange={setWfhRank} />
        </div>

        {validationError && (
          <div
            style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: R_MD,
              padding: "10px 14px",
              fontSize: 13,
              color: "#b91c1c",
              marginBottom: 16,
            }}
          >
            {validationError}
          </div>
        )}

        {submitMutation.isError && (
          <div
            style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: R_MD,
              padding: "10px 14px",
              fontSize: 13,
              color: "#b91c1c",
              marginBottom: 16,
            }}
          >
            Submission failed. Please try again or contact the hiring team.
          </div>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitMutation.isPending}
          style={{
            width: "100%",
            background: submitMutation.isPending ? "#a3d9b0" : B,
            color: "#fff",
            border: "none",
            borderRadius: R_MD,
            padding: "12px",
            fontSize: 15,
            fontWeight: 600,
            cursor: submitMutation.isPending ? "not-allowed" : "pointer",
            fontFamily: "inherit",
          }}
        >
          {submitMutation.isPending ? "Submitting…" : "Submit My Application"}
        </button>

        <p style={{ fontSize: 12, color: MUTED, textAlign: "center", marginTop: 12, lineHeight: 1.5 }}>
          Your submission is confidential and will only be seen by the hiring team.
        </p>
        </div>
      </div>

      <JobDescriptionSlideout
        open={jobDescriptionOpen}
        title={bid.job_title}
        description={bid.company_description ?? "No job description available."}
        onClose={() => setJobDescriptionOpen(false)}
      />
    </div>
  );
}
