import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { BenchmarkCompareModal } from "../components/BenchmarkCompareModal";
import { useCaseDetail } from "../hooks/useCaseEditor";
import { extractBulkDecisionJobListingPayload, extractCaseMeta } from "../utils/caseMeta";

const NAVY = "#1B1035";
const MUTED = "#71717a";
const BORDER = "#e4e4e7";
const R_LG = "14px";

const EXTERNAL_SOURCES = [
  {
    name: "US BLS OEWS",
    icon: "🇺🇸",
    tone: "#0f172a",
    detail: "Free, official US labor statistics with annual percentile wage data.",
  },
  {
    name: "UK ONS ASHE",
    icon: "🇬🇧",
    tone: "#1e293b",
    detail: "Official UK earnings survey via Nomis, with market coverage by geography.",
  },
  {
    name: "TalentUp",
    icon: "🌍",
    tone: "#17253a",
    detail: "Paid global provider used as a wider benchmark signal when enabled.",
  },
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

export function CompExternalPage() {
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
      <div
        style={{
          maxWidth: 1160,
          margin: "0 auto",
          display: "grid",
          gap: 18,
        }}
      >
        <section
          style={{
            borderRadius: 22,
            padding: 24,
            background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #17253a 100%)",
            color: "#f8fafc",
            boxShadow: "0 18px 48px rgba(15, 23, 42, 0.18)",
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div style={{ maxWidth: 720 }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#93c5fd" }}>
                Compensation Benchmarking / External
              </div>
              <h2 style={{ margin: "8px 0 10px", fontFamily: "var(--font-display, Georgia, serif)", fontSize: 32, lineHeight: 1.1, color: "#fff" }}>
                Review the external market evidence for this listing.
              </h2>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65, color: "#cbd5e1" }}>
                Compare the role against official and partner salary sources, inspect percentile spreads, and decide whether the current range is aligned to market.
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
                to={selectedListingId ? `/job-listings/${selectedListingId}/comp-internal` : "/compensation-benchmarking/internal"}
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
                Open Internal
              </Link>
            </div>
          </div>
        </section>

        <div style={{ display: "grid", gridTemplateColumns: "1.2fr .8fr", gap: 18 }}>
          <div style={{ display: "grid", gap: 18 }}>
            <section
              style={{
                background: "#fff",
                border: `1px solid ${BORDER}`,
                borderRadius: 18,
                padding: 18,
              }}
            >
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
                    {caseMeta?.jobTitle || "Select a listing or open this page from a job listing to benchmark a specific role."}
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
                <InfoCard title={caseMeta?.jobTitle || "Role not selected"} body={caseMeta?.jobDescription || "Choose a listing to see its role summary and responsibilities."} eyebrow="Role" />
                <InfoCard title={listingPayload?.location || "Any location"} body={listingPayload ? `Category: ${listingPayload.category || "Unclassified"}` : "Location will drive market routing and provider selection."} eyebrow="Location" />
                <InfoCard title={currency} body={listingPayload ? `Budget target: ${formatMoney(listingPayload.budget_target, currency)}` : "Currency controls how benchmark amounts are rendered."} eyebrow="Currency" />
                <InfoCard title={listingPayload ? formatMoney(listingPayload.budget_floor, currency) : "—"} body={listingPayload ? `Target ceiling: ${formatMoney(listingPayload.budget_ceiling, currency)}` : "Internal budget floor/ceiling help frame the market signal."} eyebrow="Budget" />
              </div>
            </section>

            <section
              style={{
                background: "#fff",
                border: `1px solid ${BORDER}`,
                borderRadius: 18,
                padding: 18,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#64748b" }}>
                    External sources
                  </div>
                  <h3 style={{ margin: "6px 0 0", fontSize: 20, color: NAVY }}>Signals used in this market scan</h3>
                </div>
                <span style={{ fontSize: 12, color: MUTED }}>Percentiles: P10, P25, P50, P75, P90</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
                {EXTERNAL_SOURCES.map((source) => (
                  <div
                    key={source.name}
                    style={{
                      borderRadius: 16,
                      padding: 16,
                      background: source.tone,
                      color: "#fff",
                      minHeight: 156,
                    }}
                  >
                    <div style={{ fontSize: 24 }}>{source.icon}</div>
                    <h4 style={{ margin: "12px 0 6px", fontSize: 16, color: "#fff" }}>{source.name}</h4>
                    <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "#cbd5e1" }}>{source.detail}</p>
                    <div style={{ marginTop: 14, display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {[10, 25, 50, 75, 90].map((percentile) => (
                        <span
                          key={percentile}
                          style={{
                            padding: "4px 8px",
                            borderRadius: 999,
                            background: "rgba(255,255,255,0.12)",
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          P{percentile}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <aside style={{ display: "grid", gap: 18 }}>
            <section
              style={{
                borderRadius: 18,
                border: `1px solid ${BORDER}`,
                background: "#fff",
                padding: 18,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#64748b" }}>
                What this page enables
              </div>
              <ul style={{ margin: "12px 0 0", paddingLeft: 18, color: MUTED, lineHeight: 1.7, fontSize: 13 }}>
                <li>See the current role and market location in one place.</li>
                <li>Understand which benchmark providers are in play.</li>
                <li>Open the internal benchmark view for the same listing.</li>
                <li>Launch the compare helper for quick side-by-side checking.</li>
              </ul>
            </section>

            <section
              style={{
                borderRadius: 18,
                border: `1px solid ${BORDER}`,
                background: "#fff",
                padding: 18,
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#64748b" }}>
                Next action
              </div>
              <p style={{ margin: "10px 0 0", fontSize: 14, color: MUTED, lineHeight: 1.6 }}>
                Use the compare helper for a quick scan, then move to the internal page if you want to align the market signal against your own pay structure.
              </p>
              <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Link
                  to={selectedListingId ? `/job-listings/${selectedListingId}/comp-internal` : "/compensation-benchmarking/internal"}
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
                  Open Internal View
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
