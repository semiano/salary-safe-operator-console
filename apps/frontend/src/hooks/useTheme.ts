import { useCallback, useEffect, useState } from "react";

export type StyleTheme = "default" | "midnight" | "enterprise" | "warm" | "vivid";

const STYLE_KEY = "salarysafe_style";

function applyStyle(style: StyleTheme) {
  if (style === "default") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", style);
  }
}

export function useTheme() {
  const [style, setStyleState] = useState<StyleTheme>(() => {
    const stored = localStorage.getItem(STYLE_KEY);
    if (stored && ["default", "midnight", "enterprise", "warm", "vivid"].includes(stored)) {
      return stored as StyleTheme;
    }
    return "default";
  });

  useEffect(() => {
    applyStyle(style);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setStyle = useCallback((next: StyleTheme) => {
    setStyleState(next);
    localStorage.setItem(STYLE_KEY, next);
    applyStyle(next);
  }, []);

  return { style, setStyle };
}
