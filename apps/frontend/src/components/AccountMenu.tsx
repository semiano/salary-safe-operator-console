import { useEffect, useRef, useState } from "react";
import { getTokenEmail, getTokenName, getTokenRole } from "../auth/token";
import type { StyleTheme } from "../hooks/useTheme";
import { StylePicker } from "./StylePicker";

interface AccountMenuProps {
  onLogout: () => void;
  style: StyleTheme;
  onSetStyle: (s: StyleTheme) => void;
}

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  admin: { bg: "rgba(217,108,45,0.15)", text: "#b45309" },
  operator: { bg: "rgba(59,130,246,0.12)", text: "#1d4ed8" },
  viewer: { bg: "rgba(100,116,139,0.12)", text: "#475569" },
};

export function AccountMenu({ onLogout, style, onSetStyle }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const name = getTokenName() || "Admin";
  const email = getTokenEmail();
  const role = getTokenRole() || "admin";
  const roleColor = ROLE_COLORS[role] ?? ROLE_COLORS.viewer;

  // Close on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    if (open) document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div ref={ref} style={{ position: "relative" }}>
      {/* Trigger */}
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: open ? "rgb(var(--ss-ink-rgb) / 0.07)" : "transparent",
          border: "1px solid rgb(var(--ss-ink-rgb) / 0.15)",
          borderRadius: 999,
          padding: "5px 12px 5px 6px",
          cursor: "pointer",
          fontSize: 14,
          fontWeight: 500,
          color: "inherit",
          transition: "background 0.15s",
        }}
      >
        {/* Avatar */}
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: "linear-gradient(135deg, #d96c2d 0%, #1B1035 100%)",
            color: "#fff",
            fontSize: 11,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
          aria-hidden="true"
        >
          {initials}
        </span>
        <span style={{ maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {name}
        </span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
          style={{ marginLeft: 2, opacity: 0.5, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
        >
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: 240,
            background: "var(--ss-surface, #fff)",
            border: "1px solid var(--ss-border, rgba(0,0,0,0.12))",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            zIndex: 200,
            overflow: "hidden",
          }}
        >
          {/* User info header */}
          <div
            style={{
              padding: "14px 16px 12px",
              borderBottom: "1px solid var(--ss-border, rgba(0,0,0,0.08))",
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #d96c2d 0%, #1B1035 100%)",
                color: "#fff",
                fontSize: 14,
                fontWeight: 700,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {initials}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: 14,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  color: "var(--ss-ink, #121826)",
                }}
              >
                {name}
              </div>
              {email && (
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--ss-muted, #71717a)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {email}
                </div>
              )}
              <span
                style={{
                  display: "inline-block",
                  marginTop: 4,
                  padding: "1px 7px",
                  borderRadius: 99,
                  fontSize: 11,
                  fontWeight: 600,
                  background: roleColor.bg,
                  color: roleColor.text,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {role}
              </span>
            </div>
          </div>

          {/* Style picker */}
          <div style={{ borderBottom: "1px solid var(--ss-border, rgba(0,0,0,0.08))" }}>
            <StylePicker current={style} onChange={onSetStyle} />
          </div>

          {/* Sign out */}
          <div style={{ padding: "4px 0" }}>
            <button
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); onLogout(); }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "9px 16px",
                background: "none",
                border: "none",
                width: "100%",
                cursor: "pointer",
                textAlign: "left",
                fontSize: 13,
                color: "#d32f2f",
                fontWeight: 500,
              }}
            >
              <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
                <path d="M9 2H12.5A1.5 1.5 0 0 1 14 3.5v8A1.5 1.5 0 0 1 12.5 13H9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                <path d="M6 10L3 7.5 6 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="3" y1="7.5" x2="11" y2="7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
