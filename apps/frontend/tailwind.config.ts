import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "rgb(var(--ss-ink-rgb) / <alpha-value>)",
        paper: "rgb(var(--ss-bg-rgb) / <alpha-value>)",
        accent: "rgb(var(--ss-accent-rgb) / <alpha-value>)",
        slate: "rgb(var(--ss-muted-rgb) / <alpha-value>)",
        surface: "rgb(var(--ss-surface-rgb) / <alpha-value>)",
      },
      fontFamily: {
        display: ["'Poppins'", "'Segoe UI'", "ui-sans-serif", "system-ui", "sans-serif"],
        body: ["'DejaVu Sans'", "'Segoe UI'", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
