import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

type TutorialOverlayProps = {
  open: boolean;
  onClose: () => void;
  onDismissPermanently: () => void;
};

const TOPIC_CARDS = [
  {
    title: "Job Listings",
    body: "The role record. Use this area to define the opening, shape the compensation frame, and keep the posting details aligned with the work you are hiring for.",
  },
  {
    title: "Benchmarking",
    body: "The comparison step. Benchmarking helps you test the role against market signals and internal pay structure so the target range is intentional, not guessed.",
  },
  {
    title: "Invitations & Bids",
    body: "The outreach and submission loop. Invitations start the process, bids come back from candidates, and each bid tracks where that person is in the workflow.",
  },
  {
    title: "Matching & Responses",
    body: "The decision layer. Matching helps you identify fit, while responses capture the next move so candidates and operators stay synchronized.",
  },
];

export function TutorialOverlay({ open, onClose, onDismissPermanently }: TutorialOverlayProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || typeof document === "undefined") {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    function onPointerDown(event: PointerEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      aria-modal="true"
      role="dialog"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(circle at top, rgba(255,255,255,0.55), rgba(15,23,42,0.55))",
          backdropFilter: "blur(6px)",
        }}
      />
      <div
        ref={panelRef}
        style={{
          position: "relative",
          width: "min(920px, 100%)",
          maxHeight: "min(88vh, 920px)",
          overflow: "auto",
          borderRadius: 24,
          border: "1px solid rgba(15,23,42,0.12)",
          background: "linear-gradient(180deg, #ffffff 0%, #fffaf3 100%)",
          boxShadow: "0 32px 80px rgba(15,23,42,0.28)",
          color: "var(--ss-ink)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            padding: "24px 24px 16px",
            borderBottom: "1px solid rgba(15,23,42,0.08)",
            background: "linear-gradient(135deg, rgba(248,250,252,0.95), rgba(255,247,237,0.9))",
          }}
        >
          <div style={{ maxWidth: 640 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#c2410c" }}>
              Quick tour
            </div>
            <h2 style={{ margin: "8px 0 10px", fontSize: 30, lineHeight: 1.1, fontWeight: 800, letterSpacing: "-0.03em" }}>
              Start here: the four concepts that drive the flow
            </h2>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: "#475569" }}>
              SalarySafe is organized around a simple lifecycle. This overview gives you the terms we use so the first page you land on feels less like a maze and more like a map.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Dismiss tutorial"
            style={{
              width: 40,
              height: 40,
              borderRadius: 999,
              border: "1px solid rgba(15,23,42,0.14)",
              background: "rgba(255,255,255,0.92)",
              color: "#334155",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div style={{ padding: 24 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: 14,
            }}
          >
            {TOPIC_CARDS.map((card, index) => (
              <section
                key={card.title}
                style={{
                  borderRadius: 18,
                  border: "1px solid rgba(15,23,42,0.10)",
                  background: index % 2 === 0 ? "rgba(255,255,255,0.88)" : "rgba(255,250,240,0.98)",
                  padding: 18,
                  boxShadow: "0 10px 24px rgba(15,23,42,0.06)",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: "#b45309", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Concept {index + 1}
                </div>
                <h3 style={{ margin: "10px 0 8px", fontSize: 18, lineHeight: 1.2, fontWeight: 750 }}>
                  {card.title}
                </h3>
                <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "#475569" }}>
                  {card.body}
                </p>
              </section>
            ))}
          </div>

          <div
            style={{
              marginTop: 18,
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              alignItems: "center",
              justifyContent: "space-between",
              borderRadius: 18,
              border: "1px solid rgba(15,23,42,0.08)",
              background: "rgba(248,250,252,0.95)",
              padding: "16px 18px",
            }}
          >
            <div style={{ fontSize: 14, lineHeight: 1.6, color: "#475569", maxWidth: 640 }}>
              Use the <strong>Help</strong> button in the top bar to reopen this at any time.
            </div>

            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <button
                type="button"
                onClick={onDismissPermanently}
                style={{
                  borderRadius: 999,
                  border: "1px solid rgba(15,23,42,0.18)",
                  background: "transparent",
                  color: "#475569",
                  padding: "10px 16px",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Don't show again
              </button>
              <button
                type="button"
                onClick={onClose}
                style={{
                  borderRadius: 999,
                  border: "none",
                  background: "#0f172a",
                  color: "#fff",
                  padding: "10px 16px",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: "pointer",
                  boxShadow: "0 10px 20px rgba(15,23,42,0.20)",
                }}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}