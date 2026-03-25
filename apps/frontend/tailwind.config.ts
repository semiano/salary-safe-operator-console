import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#121826",
        paper: "#f5f2eb",
        accent: "#d96c2d",
        slate: "#2d3446",
      },
      fontFamily: {
        display: ["'Space Grotesk'", "ui-sans-serif", "system-ui", "sans-serif"],
        body: ["'IBM Plex Sans'", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
