import { useEffect, useRef, useState } from "react";

const NAVY = "#1B1035";
const B = "#019529";

function AlignmentStrengthBar({ pct, label }: { pct: number; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: "rgba(255,255,255,.16)", overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: 3, background: B, width: `${pct}%` }} />
      </div>
      <span style={{ fontSize: 11, color: "rgba(255,255,255,.7)", minWidth: 64, textAlign: "right" }}>{label}</span>
    </div>
  );
}

const STEPS = [
  {
    num: "1",
    label: "Post this listing",
    note: "Your confidential salary range, benefits, and role details are stored privately — never shown to candidates.",
  },
  {
    num: "2",
    label: "Benchmark the role",
    note: "Compare against internal HRIS cohorts and external market evidence, then apply an AI-grounded compensation recommendation.",
  },
  {
    num: "3",
    label: "Invite candidates",
    note: "Each invitee receives a secure, personalised link to submit their salary expectations privately.",
  },
  {
    num: "4",
    label: "They submit privately",
    note: "Candidate expectations and benefit priorities are captured — never revealed back to you as raw figures.",
  },
  {
    num: "5",
    label: "SalarySafe matches",
    note: "We compare both sides on salary (70%) and benefits (30%) and show only a directional alignment label.",
  },
];

/**
 * "How matching works" popover — replaces the prior benchmark launcher popover.
 * Renders the matching explainer graphic (numbered steps + alignment strength bars).
 */
export function MatchingInfoPopover({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div ref={ref} className={className} style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
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
        <span aria-hidden="true">💡</span>
        How matching works
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            width: 360,
            maxWidth: "90vw",
            background: NAVY,
            color: "#fff",
            border: "1px solid rgba(148, 163, 184, 0.35)",
            borderRadius: 16,
            boxShadow: "0 18px 40px rgba(15, 23, 42, 0.4)",
            padding: 20,
            zIndex: 40,
          }}
        >
          <p
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: ".1em",
              color: "#5ab870",
              marginBottom: 14,
            }}
          >
            How matching works
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {STEPS.map((step) => (
              <div key={step.num} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <div
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    background: step.num === "5" ? B : "#7F7589",
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
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", lineHeight: 1.3 }}>{step.label}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,.5)", marginTop: 2, lineHeight: 1.5 }}>{step.note}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 18, borderTop: "0.5px solid rgba(255,255,255,.1)", paddingTop: 14 }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.4)", marginBottom: 10 }}>
              Employer sees — salary alignment strength only
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <AlignmentStrengthBar pct={92} label="Strong" />
              <AlignmentStrengthBar pct={55} label="Partial" />
              <AlignmentStrengthBar pct={20} label="No match" />
            </div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,.4)", marginTop: 12, lineHeight: 1.6 }}>
              Exact salary figures are never shared with either party. Both sides only ever see a directional
              alignment label — keeping negotiations fair and confidential.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
