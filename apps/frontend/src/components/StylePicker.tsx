import type { StyleTheme } from "../hooks/useTheme";

const STYLES: { key: StyleTheme; label: string; swatch: string }[] = [
  { key: "default", label: "Default", swatch: "#d96c2d" },
  { key: "midnight", label: "Midnight", swatch: "#818cf8" },
  { key: "enterprise", label: "Enterprise", swatch: "#0f4c91" },
  { key: "warm", label: "Warm", swatch: "#c2410c" },
  { key: "vivid", label: "Vivid", swatch: "#16a34a" },
];

interface StylePickerProps {
  current: StyleTheme;
  onChange: (s: StyleTheme) => void;
}

export function StylePicker({ current, onChange }: StylePickerProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "4px 0" }}>
      <div
        style={{
          padding: "4px 16px 2px",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "#94a3b8",
        }}
      >
        Theme
      </div>
      {STYLES.map(({ key, label, swatch }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "7px 16px",
            background: current === key ? "rgba(217,108,45,0.08)" : "none",
            border: "none",
            width: "100%",
            cursor: "pointer",
            textAlign: "left",
            fontSize: 13,
            fontWeight: current === key ? 600 : 400,
            color: "inherit",
          }}
        >
          <span
            style={{
              width: 13,
              height: 13,
              borderRadius: "50%",
              background: swatch,
              flexShrink: 0,
              outline: current === key ? `2px solid ${swatch}` : "none",
              outlineOffset: 2,
            }}
          />
          {label}
          {current === key && (
            <span style={{ marginLeft: "auto", fontSize: 11 }}>✓</span>
          )}
        </button>
      ))}
    </div>
  );
}
