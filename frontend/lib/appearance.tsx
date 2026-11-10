"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { ACCENTS, type Accent, type AccentId } from "./accent";

export { ACCENTS };
export type { Accent, AccentId };

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
