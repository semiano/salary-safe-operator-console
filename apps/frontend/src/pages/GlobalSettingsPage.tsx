import { useEffect, useMemo, useState } from "react";

import { getTokenRole } from "../auth/token";
import { useGlobalSettings, useUpdateGlobalSettings } from "../hooks/useGlobalSettings";

const BORDER = "#e4e4e7";
const MUTED = "#71717a";
const NAVY = "#1B1035";
const GREEN = "#019529";

function clampThreshold(value: number): number {
  if (!Number.isFinite(value)) return 87;
  return Math.max(0, Math.min(100, value));
}

export function GlobalSettingsPage() {
  const isAdmin = getTokenRole() === "admin";
  const { data, isLoading, isError } = useGlobalSettings();
  const updateSettings = useUpdateGlobalSettings();
  const [thresholdInput, setThresholdInput] = useState("87");
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setThresholdInput(String(data.auto_accept_match_threshold));
  }, [data]);

  const parsedThreshold = useMemo(() => {
    const raw = Number(thresholdInput);
    if (!Number.isFinite(raw)) return null;
    return clampThreshold(raw);
  }, [thresholdInput]);

  const hasChanges = data ? parsedThreshold !== null && parsedThreshold !== data.auto_accept_match_threshold : false;

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!isAdmin || parsedThreshold === null) {
      return;
    }
    setFeedback(null);
    try {
      const updated = await updateSettings.mutateAsync({
        auto_accept_match_threshold: parsedThreshold,
      });
      setThresholdInput(String(updated.auto_accept_match_threshold));
      setFeedback("Global settings saved.");
    } catch {
      setFeedback("Unable to save settings. Please try again.");
    }
  }

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: 0, color: NAVY, fontSize: 28, letterSpacing: "-0.02em" }}>Global Settings</h2>
        <p style={{ marginTop: 8, marginBottom: 0, color: MUTED, fontSize: 14 }}>
          Control automation behavior for candidate invitation decisions.
        </p>
      </div>

      <section
        style={{
          background: "#fff",
          border: `1px solid ${BORDER}`,
          borderRadius: 14,
          padding: 20,
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: 8, color: NAVY, fontSize: 18 }}>
          Auto-close accepted invitations
        </h3>
        <p style={{ marginTop: 0, marginBottom: 18, color: MUTED, fontSize: 13, lineHeight: 1.5 }}>
          When AI sets a decision to accepted and match score is at or above this threshold, SalarySafe automatically sends the final accepted response and closes the invitation. Scores below this threshold remain manual close operations.
        </p>

        {isLoading ? <p style={{ color: MUTED, marginTop: 0 }}>Loading settings...</p> : null}
        {isError ? <p style={{ color: "#b91c1c", marginTop: 0 }}>Failed to load settings.</p> : null}

        <form onSubmit={onSave}>
          <label htmlFor="auto-accept-threshold" style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#111", marginBottom: 6 }}>
            Match score threshold (%)
          </label>
          <input
            id="auto-accept-threshold"
            type="number"
            min={0}
            max={100}
            step="any"
            value={thresholdInput}
            onChange={(e) => setThresholdInput(e.target.value)}
            disabled={isLoading || !isAdmin || updateSettings.isPending}
            style={{
              width: 180,
              border: `1px solid ${BORDER}`,
              borderRadius: 10,
              padding: "8px 10px",
              fontSize: 14,
              color: "#111",
              background: isAdmin ? "#fff" : "#f5f5f5",
            }}
          />

          <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button
              type="submit"
              disabled={!isAdmin || parsedThreshold === null || !hasChanges || updateSettings.isPending}
              style={{
                border: "none",
                borderRadius: 999,
                background: GREEN,
                color: "#fff",
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: 600,
                cursor: !isAdmin || parsedThreshold === null || !hasChanges || updateSettings.isPending ? "not-allowed" : "pointer",
                opacity: !isAdmin || parsedThreshold === null || !hasChanges || updateSettings.isPending ? 0.65 : 1,
              }}
            >
              {updateSettings.isPending ? "Saving..." : "Save Settings"}
            </button>
            {!isAdmin ? (
              <span style={{ color: MUTED, fontSize: 12 }}>Admin role required to edit global settings.</span>
            ) : null}
            {parsedThreshold === null ? (
              <span style={{ color: "#b91c1c", fontSize: 12 }}>Enter a valid number between 0 and 100.</span>
            ) : null}
            {feedback ? (
              <span style={{ color: feedback.startsWith("Unable") ? "#b91c1c" : "#166534", fontSize: 12 }}>{feedback}</span>
            ) : null}
          </div>
        </form>
      </section>
    </div>
  );
}
