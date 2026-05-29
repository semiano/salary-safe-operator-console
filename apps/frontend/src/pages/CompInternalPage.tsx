import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { BenchmarkCompareModal } from "../components/BenchmarkCompareModal";
import { useCaseDetail } from "../hooks/useCaseEditor";
import { extractBulkDecisionJobListingPayload, extractCaseMeta } from "../utils/caseMeta";

const NAVY = "#1B1035";
const MUTED = "#71717a";
const BORDER = "#e4e4e7";
const R_LG = "14px";

const INTERNAL_CHECKS = [
  { label: "Cohort size", value: "Minimum 5 before exact figures are surfaced" },
  { label: "Band position", value: "Check whether the role sits above, below, or within current bands" },
  { label: "Suppression", value: "Hide sensitive values when the internal sample is too small" },
  { label: "Review path", value: "Use the compare helper if you want side-by-side source inspection" },
];

function formatMoney(amount: number | null | undefined, currency: string): string {
  if (typeof amount !== "number" || Number.isNaN(amount)) {
    return "—";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function InfoCard({ title, body, eyebrow }: { title: string; body: string; eyebrow: string }) {
  return (
    <div
      style={{
        border: `1px solid ${BORDER}`,
        borderRadius: 16,
        background: "#fff",
        padding: 16,
        boxShadow: "0 8px 24px rgba(15, 23, 42, 0.04)",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#64748b" }}>{eyebrow}</div>
      <div style={{ marginTop: 6, fontSize: 15, fontWeight: 700, color: NAVY }}>{title}</div>
      <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.6, color: MUTED }}>{body}</div>
    </div>
  );
}

export function CompInternalPage() {
  const { listingId } = useParams<{ listingId: string }>();
  const [searchParams] = useSearchParams();
  const selectedListingId = listingId || searchParams.get("listing") || searchParams.get("case") || "";
  const { data: caseDetail, isLoading } = useCaseDetail(selectedListingId);
  const [showCompare, setShowCompare] = useState(false);

  const listingPayload = useMemo(() => {
    if (!caseDetail) return null;
    return extractBulkDecisionJobListingPayload(caseDetail);
  }, [caseDetail]);

  const caseMeta = useMemo(() => {
    if (!caseDetail) return null;
    return extractCaseMeta(caseDetail);
  }, [caseDetail]);

  const currency = caseDetail?.currency || listingPayload?.currency || "USD";

  return (
    <div style={{ fontFamily: "inherit" }}>
      <div style={{ maxWidth: 1160, margin: "0 auto", display: "grid", gap: 18 }}>
        <section
          style={{
            borderRadius: 22,
            padding: 24,
            background: "linear-gradient(135deg, #111d2f 0%, #17253a 55%, #1f2937 100%)",
            color: "#f8fafc",
            boxShadow: "0 18px 48px rgba(15, 23, 42, 0.18)",
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div style={{ maxWidth: 720 }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#c4b5fd" }}>
                Compensation Benchmarking / Internal
              </div>
              <h2 style={{ margin: "8px 0 10px", fontFamily: "var(--font-display, Georgia, serif)", fontSize: 32, lineHeight: 1.1, color: "#fff" }}>
                Inspect internal pay structure and guard against oversharing.
              </h2>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65, color: "#cbd5e1" }}>
                Review the listing against internal pay bands, determine whether a cohort is large enough to disclose exact values, and keep the benchmark conversation confidential.
              </p>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setShowCompare(true)}
                style={{
                  borderRadius: 999,
                  border: "1px solid rgba(148, 163, 184, 0.3)",
                  background: "rgba(15, 23, 42, 0.7)",
                  color: "#fff",
                  padding: "10px 15px",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                📊 Compare Benchmarks
              </button>
              <Link
                to={selectedListingId ? `/job-listings/${selectedListingId}/comp-external` : "/compensation-benchmarking/external"}
                style={{
                  borderRadius: 999,
                  border: "1px solid rgba(148, 163, 184, 0.3)",
                  background: "rgba(255, 255, 255, 0.08)",
                  color: "#fff",
                  padding: "10px 15px",
                  fontSize: 13,
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                Open External
              </Link>
            </div>
          </div>
        </section>

        <div style={{ display: "grid", gridTemplateColumns: "1.2fr .8fr", gap: 18 }}>
          <div style={{ display: "grid", gap: 18 }}>
            <section style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 18, padding: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#64748b" }}>
                    Listing context
                  </div>
                  <h3 style={{ margin: "6px 0 4px", fontSize: 22, color: NAVY }}>
                    {selectedListingId
                      ? caseDetail?.title || (isLoading ? "Loading listing context..." : "Listing context not yet available")
                      : "No listing selected"}
                  </h3>
                  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: MUTED }}>
                    {caseMeta?.jobTitle || "Open the page from a listing to benchmark the internal structure for that role."}
                  </p>
                </div>
                {selectedListingId ? (
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#64748b" }}>Listing ID</div>
                    <div style={{ marginTop: 6, fontSize: 13, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: NAVY }}>{selectedListingId}</div>
                  </div>
                ) : null}
              </div>

              <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
                <InfoCard title={caseMeta?.jobTitle || "Role not selected"} body={caseMeta?.jobDescription || "Choose a listing to see its role summary and internal positioning."} eyebrow="Role" />
                <InfoCard title={listingPayload?.location || "Any location"} body={listingPayload ? `Category: ${listingPayload.category || "Unclassified"}` : "Location helps align the internal banding view with the selected market."} eyebrow="Location" />
                <InfoCard title={currency} body={listingPayload ? `Budget target: ${formatMoney(listingPayload.budget_target, currency)}` : "Currency keeps the internal figures comparable to the listing."} eyebrow="Currency" />
                <InfoCard title={listingPayload ? formatMoney(listingPayload.budget_floor, currency) : "—"} body={listingPayload ? `Target ceiling: ${formatMoney(listingPayload.budget_ceiling, currency)}` : "Budget boundaries frame the internal compensation discussion."} eyebrow="Budget" />
              </div>
            </section>

            <section style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 18, padding: 18 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#64748b" }}>
                    Internal governance
                  </div>
                  <h3 style={{ margin: "6px 0 0", fontSize: 20, color: NAVY }}>How internal benchmark handling works</h3>
                </div>
                <span style={{ fontSize: 12, color: MUTED }}>Confidentiality-first</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
                {INTERNAL_CHECKS.map((item) => (
                  <div key={item.label} style={{ borderRadius: 16, border: `1px solid ${BORDER}`, background: "#f8fafc", padding: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#64748b" }}>{item.label}</div>
                    <div style={{ marginTop: 6, fontSize: 14, lineHeight: 1.6, color: NAVY }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside style={{ display: "grid", gap: 18 }}>
            <section style={{ borderRadius: 18, border: `1px solid ${BORDER}`, background: "#fff", padding: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#64748b" }}>
                What this page enables
              </div>
              <ul style={{ margin: "12px 0 0", paddingLeft: 18, color: MUTED, lineHeight: 1.7, fontSize: 13 }}>
                <li>Review internal pay structure for the selected role.</li>
                <li>Hide exact values when the cohort is too small.</li>
                <li>Jump back to external evidence for the same listing.</li>
                <li>Use the compare helper while you are still tuning ranges.</li>
              </ul>
            </section>

            <section style={{ borderRadius: 18, border: `1px solid ${BORDER}`, background: "#fff", padding: 18 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#64748b" }}>
                Next action
              </div>
              <p style={{ margin: "10px 0 0", fontSize: 14, color: MUTED, lineHeight: 1.6 }}>
                Check the internal view first, then compare it to the external market view if you need to decide whether the listing range should move.
              </p>
              <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Link
                  to={selectedListingId ? `/job-listings/${selectedListingId}/comp-external` : "/compensation-benchmarking/external"}
                  style={{
                    borderRadius: 999,
                    border: "1px solid #1f2937",
                    background: NAVY,
                    color: "#fff",
                    padding: "9px 14px",
                    fontSize: 13,
                    fontWeight: 700,
                    textDecoration: "none",
                  }}
                >
                  Open External View
                </Link>
                <button
                  type="button"
                  onClick={() => setShowCompare(true)}
                  style={{
                    borderRadius: 999,
                    border: `1px solid ${BORDER}`,
                    background: "#fff",
                    color: NAVY,
                    padding: "9px 14px",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Open Compare Helper
                </button>
              </div>
            </section>
          </aside>
        </div>
      </div>

      {showCompare ? <BenchmarkCompareModal onClose={() => setShowCompare(false)} /> : null}
    </div>
  );
}
