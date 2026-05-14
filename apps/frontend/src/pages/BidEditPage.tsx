import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useCases } from "../hooks/useCases";
import { useBidDetail, useUpdatePhase1BidFields } from "../hooks/usePhase1Bids";
import { extractBenefitConfig, extractCaseMeta } from "../utils/caseMeta";

// â”€â”€ Brand tokens â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const B = "#019529";
const BL = "#f0faf3";
const BT = "#0f6b20";
const NAVY = "#1B1035";
const BORDER = "#e4e4e7";
const MUTED = "#71717a";
const R_MD = "10px";
const R_LG = "14px";

// â”€â”€ Rank selector â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  const options: { v: 1 | 2 | 3; label: string; color: string }[] = [
    { v: 1, label: "Low priority", color: "#991b1b" },
    { v: 2, label: "Medium", color: "#92400e" },
    { v: 3, label: "Top priority", color: "#166534" },
  ];
  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ display: "block", fontWeight: 600, fontSize: 14, color: "#111", marginBottom: 4 }}>
        {label}
      </label>
      <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>{hint}</div>
      <div style={{ display: "flex", gap: 8 }}>
        {options.map((opt) => {
          const active = value === opt.v;
          return (
            <button
              key={opt.v}
              type="button"
              onClick={() => onChange(opt.v)}
              style={{
                flex: 1,
                padding: "8px 4px",
                borderRadius: R_MD,
                border: active ? `2px solid ${B}` : `1.5px solid ${BORDER}`,
                background: active ? BL : "#fff",
                color: active ? opt.color : MUTED,
                fontSize: 13,
                fontWeight: active ? 700 : 400,
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "all .15s",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// â”€â”€ Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

export function BidEditPage() {
  const { bidId, applicationId } = useParams<{ bidId?: string; applicationId?: string }>();
  const id = bidId ?? applicationId ?? "";
  const navigate = useNavigate();

  const { data: bid, isLoading, isError } = useBidDetail(id || null);
  const { data: cases } = useCases();
  const updateBid = useUpdatePhase1BidFields();

  const matchedCase = bid && cases ? cases.find((c) => c.id === bid.case_id) ?? null : null;
  const benefitConfig = matchedCase ? extractBenefitConfig(matchedCase) : null;
  const caseMeta = matchedCase ? extractCaseMeta(matchedCase) : null;

  // â”€â”€ Form state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [candidateName, setCandidateName] = useState("");
  const [candidateEmail, setCandidateEmail] = useState("");
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [insuranceRank, setInsuranceRank] = useState<1 | 2 | 3 | null>(null);
  const [ptoRank, setPtoRank] = useState<1 | 2 | 3 | null>(null);
  const [wfhRank, setWfhRank] = useState<1 | 2 | 3 | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // â”€â”€ Pre-fill from loaded bid â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (!bid) return;
    setCandidateName(bid.candidate_name ?? "");
    setCandidateEmail(bid.candidate_email ?? "");
    setSalaryMin(bid.salary_min > 0 ? String(bid.salary_min) : "");
    setSalaryMax(bid.salary_max > 0 ? String(bid.salary_max) : "");
    setInsuranceRank(bid.insurance_importance_rank as 1 | 2 | 3);
    setPtoRank(bid.pto_importance_rank as 1 | 2 | 3);
    setWfhRank(bid.wfh_importance_rank as 1 | 2 | 3);
  }, [bid]);

  // â”€â”€ Styles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "9px 12px",
    fontSize: 14,
    border: `1px solid #ddd`,
    borderRadius: R_MD,
    background: "#fff",
    color: "#111",
    outline: "none",
    fontFamily: "inherit",
    boxSizing: "border-box",
  };

  // â”€â”€ Submit â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    setValidationError(null);

    const min = parseFloat(salaryMin.replace(/,/g, ""));
    const max = parseFloat(salaryMax.replace(/,/g, ""));

    if (!salaryMin || isNaN(min) || min <= 0) {
      setValidationError("Please enter a valid minimum salary.");
      return;
    }
    if (!salaryMax || isNaN(max) || max <= 0) {
      setValidationError("Please enter a valid maximum salary.");
      return;
    }
    if (max < min) {
      setValidationError("Maximum salary must be at or above the minimum.");
      return;
    }
    if (
      (benefitConfig?.showInsuranceRank ?? true) && !insuranceRank ||
      (benefitConfig?.showPtoRank ?? true) && !ptoRank ||
      (benefitConfig?.showWfhRank ?? true) && !wfhRank
    ) {
      setValidationError("Please set all benefit priority levels.");
      return;
    }

    await updateBid.mutateAsync({
      bidId: bid!.id,
      caseId: bid!.case_id,
      candidate_name: candidateName.trim() || null,
      candidate_email: candidateEmail.trim() || null,
      salary_min: min,
      salary_max: max,
      insurance_importance_rank: (insuranceRank ?? 2) as 1 | 2 | 3,
      pto_importance_rank: (ptoRank ?? 2) as 1 | 2 | 3,
      wfh_importance_rank: (wfhRank ?? 2) as 1 | 2 | 3,
    });

    setSaved(true);
  }

  // â”€â”€ Loading / error â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (isLoading) {
    return (
      <div style={pageWrap}>
        <div style={card}>
          <p style={{ textAlign: "center", color: MUTED, padding: "2rem 0" }}>Loading bidâ€¦</p>
        </div>
      </div>
    );
  }

  if (isError || !bid) {
    return (
      <div style={pageWrap}>
        <div style={card}>
        <div style={{ textAlign: "center", padding: "2rem" }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "#111", marginBottom: 8 }}>Bid not found</h2>
            <Link to="/applications" style={{ color: B, fontSize: 14 }}>← Back to Applications</Link>
          </div>
        </div>
      </div>
    );
  }

  const backHref = applicationId ? `/applications/${id}` : `/corporate/bids/${id}`;
  const isInvitation = bid.submission_status === "invitation_pending";

  return (
    <div style={pageWrap}>
      {/* Top bar */}
      <div style={{ width: "100%", maxWidth: 1100, marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
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
          â† Bid Detail
        </Link>
        <span
          style={{
            fontSize: 11,
            background: "#fff3cd",
            color: "#856404",
            border: "1px solid #ffc107",
            borderRadius: 20,
            padding: "3px 10px",
            fontWeight: 600,
          }}
        >
          Admin Edit Mode
        </span>
      </div>

      {/* Three-column layout */}
      <div
        style={{
          width: "100%",
          maxWidth: 1200,
          display: "flex",
          gap: 20,
          alignItems: "flex-start",
        }}
      >
        {/* â”€â”€ LEFT SIDEBAR â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div style={{ width: 320, flexShrink: 0, display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Instructions */}
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
              You are editing this bid on behalf of the candidate. Enter their salary expectations and benefit priorities as they described them, then click{" "}<strong>Save Bid</strong>.
            </p>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#444", lineHeight: 1.8 }}>
              <li>Confirm the candidate's name and email.</li>
              <li>Enter the salary target they're aiming for.</li>
              <li>Set each benefit priority from their perspective.</li>
            </ul>
            {isInvitation && (
              <div
                style={{
                  marginTop: 14,
                  background: "#fffbeb",
                  border: "1px solid #fde68a",
                  borderRadius: R_MD,
                  padding: "9px 12px",
                  fontSize: 12,
                  color: "#92400e",
                  lineHeight: 1.55,
                }}
              >
                <strong>Note:</strong> Your bid is currently pending submission. Saving will mark it as submitted.
              </div>
            )}
            <div
              style={{
                marginTop: 14,
                background: BL,
                border: `1px solid #b3e0bb`,
                borderRadius: R_MD,
                padding: "9px 12px",
                fontSize: 12,
                color: BT,
                lineHeight: 1.55,
              }}
            >
              <strong>Privacy:</strong> Your salary details are confidential and protected by SalarySafe — they are never shown directly to the hiring team without your consent.
            </div>
          </div>

          {/* Job posting details */}
          {caseMeta && (
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
                  color: NAVY,
                  textTransform: "uppercase",
                  letterSpacing: ".06em",
                  marginBottom: 10,
                }}
              >
                Job Posting
              </div>
              <h2
                style={{
                  fontFamily: "var(--font-display, Georgia, serif)",
                  fontSize: 17,
                  fontWeight: 700,
                  color: NAVY,
                  margin: "0 0 10px",
                  lineHeight: 1.3,
                  letterSpacing: "-.01em",
                }}
              >
                {caseMeta.jobTitle}
              </h2>

              {caseMeta.jobDescription && caseMeta.jobDescription !== "Not provided" && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 5 }}>
                    About the Role
                  </div>
                  <p style={{ fontSize: 13, color: "#444", lineHeight: 1.65, margin: 0 }}>
                    {caseMeta.jobDescription}
                  </p>
                </div>
              )}

              {caseMeta.responsibilities.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: MUTED, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>
                    Key Responsibilities
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#444", lineHeight: 1.8 }}>
                    {caseMeta.responsibilities.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* â”€â”€ FORM CARD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div style={{ ...card, flex: 1, minWidth: 0 }}>
          {/* Header stripe */}
          <div
            style={{
              background: BL,
              border: `1px solid #b3e0bb`,
              borderRadius: R_LG,
              padding: "1rem 1.25rem",
              marginBottom: "1.75rem",
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
              Editing Bid
            </div>
            <h1
              style={{
                fontFamily: "var(--font-display, Georgia, serif)",
                fontSize: 20,
                fontWeight: 700,
                letterSpacing: "-.02em",
                color: NAVY,
                margin: "0 0 4px",
              }}
            >
              {matchedCase?.title ?? "Job Listing"}
            </h1>
            <p style={{ fontSize: 13, color: MUTED, margin: 0 }}>
              {bid.candidate_name ?? bid.candidate_email ?? bid.applicant_identifier}
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Candidate info */}
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "#111", marginBottom: 12 }}>Candidate</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#111", marginBottom: 6 }}>
                    Full Name
                  </label>
                  <input
                    style={inputStyle}
                    value={candidateName}
                    onChange={(e) => setCandidateName(e.target.value)}
                    placeholder="Morgan Evans"
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#111", marginBottom: 6 }}>
                    Email
                  </label>
                  <input
                    style={inputStyle}
                    type="email"
                    value={candidateEmail}
                    onChange={(e) => setCandidateEmail(e.target.value)}
                    placeholder="candidate@example.com"
                  />
                </div>
              </div>
            </div>

            {/* Salary */}
            <div style={{ marginBottom: 28 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "#111", marginBottom: 4 }}>
                Salary Target
              </h3>
              <div style={{ fontSize: 13, color: MUTED, marginBottom: 14 }}>
                The annual salary range you're targeting for this role.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#111", marginBottom: 6 }}>
                    Floor
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    placeholder="e.g. 120000"
                    value={salaryMin}
                    onChange={(e) => setSalaryMin(e.target.value)}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: "#111", marginBottom: 6 }}>
                    Ideal
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    placeholder="e.g. 150000"
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
                How important is each benefit to the candidate?
              </div>
              {(benefitConfig?.showInsuranceRank ?? true) && (
                <RankSelector
                  label={benefitConfig?.insuranceLabel ?? "Health Insurance"}
                  hint="Medical, dental, and vision coverage"
                  value={insuranceRank}
                  onChange={setInsuranceRank}
                />
              )}
              {(benefitConfig?.showPtoRank ?? true) && (
                <RankSelector
                  label={benefitConfig?.ptoLabel ?? "Paid Time Off (PTO)"}
                  hint="Vacation days, sick leave, and personal days"
                  value={ptoRank}
                  onChange={setPtoRank}
                />
              )}
              {(benefitConfig?.showWfhRank ?? true) && (
                <RankSelector
                  label={benefitConfig?.wfhLabel ?? "Remote / WFH Flexibility"}
                  hint="Ability to work from home or remotely"
                  value={wfhRank}
                  onChange={setWfhRank}
                />
              )}
            </div>

            {/* Validation error */}
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

            {updateBid.isError && (
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
                Save failed. Please try again.
              </div>
            )}

            {saved && (
              <div
                style={{
                  background: BL,
                  border: `1px solid #b3e0bb`,
                  borderRadius: R_MD,
                  padding: "10px 14px",
                  fontSize: 13,
                  color: BT,
                  marginBottom: 16,
                }}
              >
                âœ“ Bid updated successfully.
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="submit"
                disabled={updateBid.isPending}
                style={{
                  flex: 1,
                  background: updateBid.isPending ? "#a3d9b0" : B,
                  color: "#fff",
                  border: "none",
                  borderRadius: R_MD,
                  padding: "12px",
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: updateBid.isPending ? "not-allowed" : "pointer",
                  fontFamily: "inherit",
                }}
              >
                {updateBid.isPending ? "Savingâ€¦" : "Save Bid"}
              </button>
              <button
                type="button"
                onClick={() => navigate(backHref)}
                style={{
                  padding: "12px 20px",
                  background: "transparent",
                  border: `1px solid ${BORDER}`,
                  borderRadius: R_MD,
                  fontSize: 14,
                  color: MUTED,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>

        {/* ── RIGHT SIDEBAR ─────────────────────────────────────────────────── */}
        <div style={{ width: 280, flexShrink: 0, position: "sticky", top: 20 }}>
          <div
            style={{
              background: NAVY,
              borderRadius: R_LG,
              padding: "1.5rem",
            }}
          >
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: ".1em",
                color: "#5ab870",
                marginBottom: ".625rem",
              }}
            >
              How matching works
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {[
                { num: "1", label: "Role listed confidentially", note: "The employer's budget is never shared with you" },
                { num: "2", label: "You were invited", note: "A secure, personalised link sent just to you" },
                { num: "3", label: "You submit privately", note: "Your expectations are never shown to the employer" },
                { num: "4", label: "SalarySafe checks alignment", note: "No figures exchanged — just a match signal" },
              ].map((step) => (
                <div key={step.num} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                  <div
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      background: step.num === "1" || step.num === "2" ? NAVY : step.num === "3" ? B : "#7F7589",
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
            <div style={{ marginTop: "1.25rem", borderTop: "0.5px solid rgba(255,255,255,.1)", paddingTop: "1rem" }}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,.35)", marginBottom: 8 }}>
                You receive — a salary alignment signal
              </div>
              <AlignmentBar pct={92} label="Strong" />
              <div style={{ marginTop: 8 }}>
                <AlignmentBar pct={55} label="Partial" />
              </div>
              <div style={{ marginTop: 8 }}>
                <AlignmentBar pct={20} label="No match" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
