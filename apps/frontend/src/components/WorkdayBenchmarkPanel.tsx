import { useEffect, useState } from "react";

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

export function WorkdayBenchmarkPanel({ className }: { className?: string }) {
  const [activePanel, setActivePanel] = useState<BenchmarkKind | null>(null);

  useEffect(() => {
    if (!activePanel) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActivePanel(null);
    };

    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("keydown", onEsc);
      document.body.style.overflow = previousOverflow;
    };
  }, [activePanel]);

  const currentTheme = activePanel ? panelTheme[activePanel] : null;
  const panelTitle = activePanel === "internal" ? "Benchmark Listing Internal (Workday)" : "Benchmark Listing External (Workday)";

  return (
    <>
      <div className={className} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => setActivePanel("internal")}
          style={{
            borderRadius: 999,
            border: "1px solid #334155",
            background: "#0f172a",
            color: "#e2e8f0",
            padding: "7px 12px",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Benchmark Listing Internal (Workday)
        </button>
        <button
          type="button"
          onClick={() => setActivePanel("external")}
          style={{
            borderRadius: 999,
            border: "1px solid #334155",
            background: "#1e293b",
            color: "#e2e8f0",
            padding: "7px 12px",
            fontSize: 12,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Benchmark Listing External (Workday)
        </button>
      </div>

      {activePanel && currentTheme ? (
        <>
          <button
            type="button"
            aria-label="Close benchmark overlay"
            onClick={() => setActivePanel(null)}
            style={{
              position: "fixed",
              inset: 0,
              border: "none",
              background: "rgba(2, 6, 23, 0.84)",
              zIndex: 60,
              cursor: "pointer",
            }}
          />

          <aside
            role="dialog"
            aria-modal="true"
            aria-label={panelTitle}
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              height: "100vh",
              width: "min(980px, 90vw)",
              background: currentTheme.panelBg,
              borderLeft: "1px solid rgba(148, 163, 184, 0.4)",
              boxShadow: "-16px 0 36px rgba(0,0,0,.45)",
              zIndex: 61,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                padding: "22px 28px 18px",
                borderBottom: "1px solid rgba(148, 163, 184, 0.35)",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 14,
              }}
            >
              <div>
                <div
                  style={{
                    display: "inline-block",
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: ".08em",
                    textTransform: "uppercase",
                    borderRadius: 999,
                    padding: "5px 9px",
                    background: currentTheme.badgeBg,
                    color: currentTheme.badgeText,
                    marginBottom: 10,
                  }}
                >
                  Workday Benchmark
                </div>
                <h3 style={{ margin: 0, fontSize: 24, color: "#f8fafc", letterSpacing: "-.02em" }}>{panelTitle}</h3>
                <p style={{ margin: "8px 0 0", color: "#cbd5e1", fontSize: 14 }}>
                  Placeholder content for benchmark data integration.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setActivePanel(null)}
                style={{
                  borderRadius: 10,
                  border: "1px solid rgba(148, 163, 184, 0.45)",
                  background: "rgba(15, 23, 42, 0.45)",
                  color: "#e2e8f0",
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "8px 12px",
                  cursor: "pointer",
                }}
              >
                Close
              </button>
            </div>

            <div style={{ padding: "24px 28px", color: "#e2e8f0", overflowY: "auto", lineHeight: 1.65 }}>
              <div
                style={{
                  borderRadius: 14,
                  border: "1px solid rgba(148, 163, 184, 0.35)",
                  background: "rgba(15, 23, 42, 0.32)",
                  padding: "16px 18px",
                }}
              >
                <p style={{ marginTop: 0, marginBottom: 8, fontWeight: 600 }}>Coming soon</p>
                <p style={{ margin: 0, fontSize: 14, color: "#cbd5e1" }}>
                  This panel is reserved for Workday benchmark listing workflows. Connectors, mapping, and benchmark insights will render here in a later phase.
                </p>
              </div>
            </div>
          </aside>
        </>
      ) : null}
    </>
  );
}