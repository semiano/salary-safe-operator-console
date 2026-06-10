import { useEffect, useMemo, useState } from "react";

import { clearDebugLogs, subscribeDebugLogs, type DebugLogEntry } from "../utils/debugLog";

function levelColor(level: DebugLogEntry["level"]): string {
  if (level === "error") return "#ef4444";
  if (level === "warn") return "#f59e0b";
  if (level === "info") return "#3b82f6";
  return "#64748b";
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString();
}

function dataToText(data: unknown): string {
  if (data === undefined) return "";
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}

export function DebugLogDock() {
  const [logs, setLogs] = useState<DebugLogEntry[]>([]);
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    return subscribeDebugLogs((items) => setLogs(items));
  }, []);

  const latest = useMemo(() => logs.slice(-120).reverse(), [logs]);

  return (
    <section
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 999,
        borderTop: "1px solid rgba(148,163,184,0.5)",
        background: "rgba(2,6,23,0.96)",
        color: "#e2e8f0",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      }}
      aria-label="Admin debug log"
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 10px",
          borderBottom: collapsed ? "none" : "1px solid rgba(148,163,184,0.25)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <strong style={{ fontSize: 12, letterSpacing: ".03em" }}>GLOBAL ADMIN DEBUG LOG</strong>
          <span style={{ fontSize: 11, color: "#94a3b8" }}>{logs.length} entries</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={() => clearDebugLogs()}
            style={{
              border: "1px solid rgba(148,163,184,0.35)",
              borderRadius: 6,
              background: "transparent",
              color: "#cbd5e1",
              fontSize: 11,
              padding: "3px 8px",
              cursor: "pointer",
            }}
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            style={{
              border: "1px solid rgba(148,163,184,0.35)",
              borderRadius: 6,
              background: "transparent",
              color: "#cbd5e1",
              fontSize: 11,
              padding: "3px 8px",
              cursor: "pointer",
            }}
          >
            {collapsed ? "Expand" : "Collapse"}
          </button>
        </div>
      </div>

      {!collapsed ? (
        <div style={{ maxHeight: 220, overflow: "auto", padding: "8px 10px" }}>
          {latest.length === 0 ? (
            <div style={{ fontSize: 11, color: "#94a3b8" }}>No debug events yet.</div>
          ) : (
            latest.map((entry) => (
              <div key={entry.id} style={{ marginBottom: 8, borderBottom: "1px dashed rgba(148,163,184,0.2)", paddingBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                  <span style={{ color: "#94a3b8" }}>[{fmtTime(entry.timestamp)}]</span>
                  <span style={{ color: levelColor(entry.level), fontWeight: 700 }}>{entry.level.toUpperCase()}</span>
                  <span style={{ color: "#7dd3fc" }}>{entry.scope}</span>
                  <span>{entry.message}</span>
                </div>
                {entry.data !== undefined ? (
                  <pre
                    style={{
                      margin: "5px 0 0",
                      fontSize: 11,
                      whiteSpace: "pre-wrap",
                      color: "#cbd5e1",
                    }}
                  >
                    {dataToText(entry.data)}
                  </pre>
                ) : null}
              </div>
            ))
          )}
        </div>
      ) : null}
    </section>
  );
}
