import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { BenchmarkCompareModal } from "./BenchmarkCompareModal";

type BenchmarkKind = "internal" | "external";

const panelTheme: Record<BenchmarkKind, { panelBg: string; badgeBg: string; badgeText: string }> = {
  internal: {
    panelBg: "#111d2f",
    badgeBg: "rgba(129, 140, 248, 0.22)",
    badgeText: "#dbeafe",
  },
  external: {
    panelBg: "#17253a",
    badgeBg: "rgba(59, 130, 246, 0.22)",
    badgeText: "#e0f2fe",
  },
};

interface WorkdayBenchmarkPanelProps {
  className?: string;
  listingId?: string;
}

export function WorkdayBenchmarkPanel({ className, listingId }: WorkdayBenchmarkPanelProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen && !compareOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setCompareOpen(false);
      }
    };

    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("keydown", onEsc);
      document.body.style.overflow = previousOverflow;
    };
  }, [menuOpen, compareOpen]);

  const listingQuery = listingId ? `?listing=${encodeURIComponent(listingId)}` : "";
  const workspaceStep1Path = `/compensation-benchmarking/workspace${listingQuery ? `${listingQuery}&step=1` : "?step=1"}`;
  const workspaceStep2Path = `/compensation-benchmarking/workspace${listingQuery ? `${listingQuery}&step=2` : "?step=2"}`;
  const workspaceStep3Path = `/compensation-benchmarking/workspace${listingQuery ? `${listingQuery}&step=3` : "?step=3"}`;

  return (
    <>
      <div className={className} style={{ position: "relative", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
          style={{
            borderRadius: 999,
            border: "1px solid #334155",
            background: "#0f172a",
            color: "#e2e8f0",
            padding: "7px 14px",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span aria-hidden="true">📊</span>
          Benchmark Listing
        </button>
        {menuOpen && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              left: 0,
              minWidth: 280,
              background: "#0f172a",
              color: "#e2e8f0",
              border: "1px solid rgba(148, 163, 184, 0.35)",
              borderRadius: 14,
              boxShadow: "0 16px 32px rgba(15, 23, 42, 0.35)",
              padding: 12,
              zIndex: 30,
            }}
          >
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "#94a3b8" }}>
                Compensation Benchmarking
              </div>
              <div style={{ marginTop: 4, fontSize: 13, lineHeight: 1.5, color: "#cbd5e1" }}>
                Open the unified benchmark workspace flow or use the bridge compare helper.
              </div>
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              <Link
                to={workspaceStep1Path}
                onClick={() => setMenuOpen(false)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "10px 12px",
                  borderRadius: 12,
                  background: "rgba(30, 41, 59, 0.9)",
                  color: "inherit",
                  textDecoration: "none",
                }}
              >
                <span>
                  <strong style={{ display: "block", fontSize: 13 }}>Start benchmark workflow (Step 1)</strong>
                  <span style={{ fontSize: 12, color: "#94a3b8" }}>Internal dataset setup, mapping, and AI similarity run</span>
                </span>
                <span aria-hidden="true">↗</span>
              </Link>
              <Link
                to={workspaceStep2Path}
                onClick={() => setMenuOpen(false)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "10px 12px",
                  borderRadius: 12,
                  background: "rgba(15, 23, 42, 0.8)",
                  color: "inherit",
                  textDecoration: "none",
                }}
              >
                <span>
                  <strong style={{ display: "block", fontSize: 13 }}>Open external evidence (Step 2)</strong>
                  <span style={{ fontSize: 12, color: "#94a3b8" }}>Provider cards, uploads, and market signal validation</span>
                </span>
                <span aria-hidden="true">↗</span>
              </Link>
              <Link
                to={workspaceStep3Path}
                onClick={() => setMenuOpen(false)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "10px 12px",
                  borderRadius: 12,
                  background: "rgba(2, 6, 23, 0.72)",
                  color: "inherit",
                  textDecoration: "none",
                  border: "1px solid rgba(148, 163, 184, 0.28)",
                }}
              >
                <span>
                  <strong style={{ display: "block", fontSize: 13 }}>Open recommendation review (Step 3)</strong>
                  <span style={{ fontSize: 12, color: "#94a3b8" }}>Synthesis, confidence, and apply-to-listing decision</span>
                </span>
                <span aria-hidden="true">↗</span>
              </Link>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setCompareOpen(true);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(148, 163, 184, 0.28)",
                  background: "rgba(2, 6, 23, 0.55)",
                  color: "inherit",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span>
                  <strong style={{ display: "block", fontSize: 13 }}>Compare benchmarks</strong>
                  <span style={{ fontSize: 12, color: "#94a3b8" }}>Keep the helper sheet for quick side-by-side checks</span>
                </span>
                <span aria-hidden="true">↗</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {compareOpen ? <BenchmarkCompareModal onClose={() => setCompareOpen(false)} /> : null}
    </>
  );
}