"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export const ACCENTS = [
  {
    id: "emerald",
    label: "Emerald",
    color: "oklch(0.596 0.145 163.225)",
    foreground: "oklch(0.145 0 0)",
  },
  {
    id: "blue",
    label: "Blue",
    color: "oklch(0.62 0.19 259.8)",
    foreground: "oklch(0.985 0 0)",
  },
  {
    id: "violet",
    label: "Violet",
    color: "oklch(0.606 0.25 292.717)",
    foreground: "oklch(0.985 0 0)",
  },
  {
    id: "rose",
    label: "Rose",
    color: "oklch(0.645 0.246 16.439)",
    foreground: "oklch(0.985 0 0)",
  },
  {
    id: "amber",
    label: "Amber",
    color: "oklch(0.769 0.188 70.08)",
    foreground: "oklch(0.205 0 0)",
  },
  {
    id: "teal",
    label: "Teal",
    color: "oklch(0.6 0.118 184.704)",
    foreground: "oklch(0.985 0 0)",
  },
] as const;

export type Accent = (typeof ACCENTS)[number];
export type AccentId = Accent["id"];

const STORAGE_KEY = "accent-color";

interface AppearanceContextValue {
  accent: AccentId;
  setAccent: (accent: AccentId) => void;
}

const AppearanceContext = createContext<AppearanceContextValue>({
  accent: ACCENTS[0].id,
  setAccent: () => {},
});

function applyAccent(accent: Accent) {
  const root = document.documentElement;
  root.style.setProperty("--brand", accent.color);
  root.style.setProperty("--brand-foreground", accent.foreground);
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [accent, setAccentState] = useState<AccentId>(ACCENTS[0].id);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const next = ACCENTS.find((item) => item.id === stored) ?? ACCENTS[0];
    setAccentState(next.id);
    applyAccent(next);

    function onStorage(event: StorageEvent) {
      if (event.key !== STORAGE_KEY) return;
      const synced = ACCENTS.find((item) => item.id === event.newValue);
      if (!synced) return;
      setAccentState(synced.id);
      applyAccent(synced);
    }

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function setAccent(nextId: AccentId) {
    const next = ACCENTS.find((item) => item.id === nextId);
    if (!next) return;
    setAccentState(next.id);
    applyAccent(next);
    localStorage.setItem(STORAGE_KEY, next.id);
  }

  return (
    <AppearanceContext.Provider value={{ accent, setAccent }}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  return useContext(AppearanceContext);
}
