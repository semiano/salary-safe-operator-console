import { useCallback, useEffect, useState } from "react";

export type ThemeMode = "light" | "dark";

const MODE_KEY = "salarysafe_mode";

function applyMode(mode: ThemeMode) {
  document.documentElement.setAttribute("data-mode", mode);
}

export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem(MODE_KEY);
    if (stored === "light" || stored === "dark") {
      return stored;
    }

    if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }

    return "light";
  });

  useEffect(() => {
    applyMode(mode);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    localStorage.setItem(MODE_KEY, next);
    applyMode(next);
  }, []);

  const toggleMode = useCallback(() => {
    const next = mode === "light" ? "dark" : "light";
    setMode(next);
  }, [mode, setMode]);

  return { mode, setMode, toggleMode };
}
