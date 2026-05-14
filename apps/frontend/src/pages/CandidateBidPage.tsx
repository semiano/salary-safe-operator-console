import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";

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

// ── Rank selector ─────────────────────────────────────────────────────────────
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

// ── Currency symbol ───────────────────────────────────────────────────────────
function currencySymbol(currency: string): string {
  if (currency === "USD") return "$";
  if (currency === "GBP") return "£";
  if (currency === "EUR") return "€";
  return currency + " ";
}

// ── Page ──────────────────────────────────────────────────────────────────────
export function CandidateBidPage() {
  const { token } = useParams<{ token: string }>();

  const { data: bid, isLoading, isError } = useQuery({
    queryKey: ["public-bid", token],
    queryFn: () => apiGetPublic<PublicBidLookup>(`/bid/${token}`),
    enabled: Boolean(token),
    retry: false,
  });

  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [insuranceRank, setInsuranceRank] = useState<1 | 2 | 3 | null>(null);
  const [ptoRank, setPtoRank] = useState<1 | 2 | 3 | null>(null);
  const [wfhRank, setWfhRank] = useState<1 | 2 | 3 | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const submitMutation = useMutation({
    mutationFn: (payload: {
      salary_min: number;
      salary_max: number;
      insurance_importance_rank: 1 | 2 | 3;
      pto_importance_rank: 1 | 2 | 3;
      wfh_importance_rank: 1 | 2 | 3;
    }) => apiPostPublic<{ ok: boolean; message: string }>(`/bid/${token}/submit`, payload),
    onSuccess: () => setSubmitted(true),
  });

  // ── Loading ──────────────────────────────────────────────────────────────────
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

  // ── Error / not found ────────────────────────────────────────────────────────
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

  // ── Already submitted ────────────────────────────────────────────────────────
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
                border: `2px solid #b3e0bb`,
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
              Bid submitted!
            </h2>
            <p style={{ fontSize: 14, color: MUTED }}>
              Your bid for <strong>{bid.job_title}</strong> has been submitted confidentially.
              The hiring team will review it and be in touch.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Form ─────────────────────────────────────────────────────────────────────
  const sym = currencySymbol(bid.currency);

  function handleSubmit() {
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
    submitMutation.mutate({
      salary_min: min,
      salary_max: max,
      insurance_importance_rank: insuranceRank,
      pto_importance_rank: ptoRank,
      wfh_importance_rank: wfhRank,
    });
  }

  return (
    <div style={pageWrap}>
      <div style={card}>
        <BrandMark />

        {/* Job info header */}
        <div
          style={{
            background: BL,
            border: `1px solid #b3e0bb`,
            borderRadius: R_LG,
            padding: "1.25rem",
            marginBottom: "1.75rem",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 600, color: BT, textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 6 }}>
            Bid Invitation
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
                    border: `1px solid #b3e0bb`,
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
          <RankSelector
            label="Health Insurance"
            hint="Medical, dental, and vision coverage"
            value={insuranceRank}
            onChange={setInsuranceRank}
          />
          <RankSelector
            label="Paid Time Off (PTO)"
            hint="Vacation days, sick leave, and personal days"
            value={ptoRank}
            onChange={setPtoRank}
          />
          <RankSelector
            label="Remote / WFH Flexibility"
            hint="Ability to work from home or remotely"
            value={wfhRank}
            onChange={setWfhRank}
          />
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
          {submitMutation.isPending ? "Submitting…" : "Submit My Bid"}
        </button>

        <p style={{ fontSize: 12, color: MUTED, textAlign: "center", marginTop: 12, lineHeight: 1.5 }}>
          Your submission is confidential and will only be seen by the hiring team.
        </p>
      </div>
    </div>
  );
}

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
      <span style={{ fontSize: 15, fontWeight: 700, color: NAVY, letterSpacing: "-.02em" }}>
        SalarySafe
      </span>
    </div>
  );
}
