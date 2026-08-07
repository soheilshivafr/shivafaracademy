import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

export type ThemeMode = "dark" | "light" | "auto";

// ── Time-based auto theme: light 07:00–19:00, dark 19:00–07:00 ──
function getAutoTheme(): "dark" | "light" {
  if (typeof window === "undefined") return "dark";
  const hour = new Date().getHours();
  // Light from 07:00 (inclusive) until 19:00 (exclusive)
  return hour >= 7 && hour < 19 ? "light" : "dark";
}

function applyResolved(r: "dark" | "light") {
  const root = document.documentElement;
  root.classList.toggle("dark",  r === "dark");
  root.classList.toggle("light", r === "light");
  root.style.colorScheme = r;
}

interface ThemeCtx {
  mode: ThemeMode;
  resolved: "dark" | "light";
  setMode: (m: ThemeMode) => void;
}

const Ctx = createContext<ThemeCtx>({ mode: "auto", resolved: "dark", setMode: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(() =>
    (localStorage.getItem("shivafer_theme") as ThemeMode | null) ?? "auto"
  );

  const [resolved, setResolved] = useState<"dark" | "light">(() => {
    const m = (localStorage.getItem("shivafer_theme") as ThemeMode | null) ?? "auto";
    return m === "auto" ? getAutoTheme() : m;
  });

  function setMode(m: ThemeMode) {
    setModeState(m);
    localStorage.setItem("shivafer_theme", m);
  }

  useEffect(() => {
    const r = mode === "auto" ? getAutoTheme() : mode;
    setResolved(r);
    applyResolved(r);

    if (mode !== "auto") return;

    // Check every 60 seconds to handle transition at 07:00 / 19:00
    const interval = setInterval(() => {
      const next = getAutoTheme();
      setResolved(prev => {
        if (prev !== next) {
          applyResolved(next);
          return next;
        }
        return prev;
      });
    }, 60_000);
    return () => clearInterval(interval);
  }, [mode]);

  return <Ctx.Provider value={{ mode, resolved, setMode }}>{children}</Ctx.Provider>;
}

export function useTheme() { return useContext(Ctx); }
