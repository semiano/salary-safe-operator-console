import { useState } from "react";

interface BenchmarkRow {
  level: string;
  p25: number;
  p50: number;
  p75: number;
  applied: boolean;
}

const SAMPLE_INTERNAL: BenchmarkRow[] = [
  { level: "IC3 / Mid-level", p25: 110_000, p50: 128_000, p75: 145_000, applied: false },
  { level: "IC4 / Senior",    p25: 140_000, p50: 162_000, p75: 185_000, applied: false },
  { level: "IC5 / Staff",     p25: 175_000, p50: 200_000, p75: 228_000, applied: false },
];

const SAMPLE_EXTERNAL: BenchmarkRow[] = [
  { level: "P3 · FAANG market", p25: 120_000, p50: 145_000, p75: 170_000, applied: false },
  { level: "P4 · FAANG market", p25: 155_000, p50: 178_000, p75: 205_000, applied: false },
  { level: "P5 · FAANG market", p25: 185_000, p50: 215_000, p75: 250_000, applied: false },
];

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);

interface BenchmarkCompareModalProps {
  onClose: () => void;
  onApply?: (adjustments: { level: string; target: number }[]) => void;
}

export function BenchmarkCompareModal({ onClose, onApply }: BenchmarkCompareModalProps) {
  type Tab = "internal" | "external";
  const [tab, setTab] = useState<Tab>("internal");
  const [rows, setRows] = useState({
    internal: SAMPLE_INTERNAL.map((r) => ({ ...r })),
    external: SAMPLE_EXTERNAL.map((r) => ({ ...r })),
  });

  const currentRows = rows[tab];

  function toggleRow(idx: number) {
    setRows((prev) => ({
      ...prev,
      [tab]: prev[tab].map((r, i) => (i === idx ? { ...r, applied: !r.applied } : r)),
    }));
  }

  function handleApply() {
    const all = [...rows.internal, ...rows.external]
      .filter((r) => r.applied)
      .map((r) => ({ level: r.level, target: r.p50 }));
    onApply?.(all);
    onClose();
  }

  const selectedCount = [...rows.internal, ...rows.external].filter((r) => r.applied).length;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 500,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 14,
          boxShadow: "0 16px 48px rgba(0,0,0,0.22)",
          width: "100%",
          maxWidth: 680,
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Benchmark Compare"
      >
        {/* Header */}
        <div
          style={{
            padding: "18px 24px 0",
            borderBottom: "1px solid #e4e4e7",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h2 style={{ fontFamily: "var(--font-display, Georgia, serif)", fontSize: 20, fontWeight: 700, color: "#1B1035", margin: 0 }}>
              📊 Benchmark Comparison
            </h2>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              style={{
                width: 30,
                height: 30,
                borderRadius: 999,
                border: "none",
                background: "#f1f5f9",
                cursor: "pointer",
                fontSize: 16,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ×
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 4 }}>
            {(["internal", "external"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                style={{
                  padding: "7px 16px",
                  borderRadius: "8px 8px 0 0",
                  border: "none",
                  background: tab === t ? "#fff" : "transparent",
                  borderBottom: tab === t ? "2px solid #d96c2d" : "2px solid transparent",
                  fontWeight: tab === t ? 600 : 400,
                  color: tab === t ? "#d96c2d" : "#71717a",
                  cursor: "pointer",
                  fontSize: 13,
                  textTransform: "capitalize",
                }}
              >
                {t === "internal" ? "🏢 Internal Bands" : "🌍 External Market"}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflow: "auto", padding: "0 24px" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e4e4e7" }}>
                <th style={{ padding: "10px 8px", textAlign: "left", fontWeight: 600, color: "#71717a", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Level
                </th>
                <th style={{ padding: "10px 8px", textAlign: "right", fontWeight: 600, color: "#71717a", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  P25
                </th>
                <th style={{ padding: "10px 8px", textAlign: "right", fontWeight: 600, color: "#71717a", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  P50 (Median)
                </th>
                <th style={{ padding: "10px 8px", textAlign: "right", fontWeight: 600, color: "#71717a", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  P75
                </th>
                <th style={{ padding: "10px 8px", textAlign: "center", fontWeight: 600, color: "#71717a", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Apply
                </th>
              </tr>
            </thead>
            <tbody>
              {currentRows.map((row, idx) => (
                <tr
                  key={row.level}
                  style={{
                    borderBottom: "1px solid #f1f5f9",
                    background: row.applied ? "rgba(217,108,45,0.05)" : "transparent",
                  }}
                >
                  <td style={{ padding: "11px 8px", fontWeight: 500, color: "#121826" }}>{row.level}</td>
                  <td style={{ padding: "11px 8px", textAlign: "right", color: "#64748b" }}>{fmt(row.p25)}</td>
                  <td style={{ padding: "11px 8px", textAlign: "right", fontWeight: 600, color: "#121826" }}>{fmt(row.p50)}</td>
                  <td style={{ padding: "11px 8px", textAlign: "right", color: "#64748b" }}>{fmt(row.p75)}</td>
                  <td style={{ padding: "11px 8px", textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={row.applied}
                      onChange={() => toggleRow(idx)}
                      title={`Select ${row.level} to apply`}
                      style={{ cursor: "pointer", width: 16, height: 16, accentColor: "#d96c2d" }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p style={{ fontSize: 11, color: "#94a3b8", padding: "12px 8px 0", margin: 0 }}>
            Sample data — connect your HRIS/Radford/Levels.fyi feed to see live benchmarks.
          </p>
        </div>

        {/* Footer actions */}
        <div
          style={{
            padding: "14px 24px",
            borderTop: "1px solid #e4e4e7",
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 20px",
              borderRadius: 6,
              border: "1px solid #e4e4e7",
              background: "transparent",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={selectedCount === 0}
            style={{
              padding: "8px 20px",
              borderRadius: 6,
              border: "none",
              background: selectedCount > 0 ? "#d96c2d" : "#e4e4e7",
              color: selectedCount > 0 ? "#fff" : "#94a3b8",
              cursor: selectedCount > 0 ? "pointer" : "default",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Apply Selected{selectedCount > 0 ? ` (${selectedCount})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
