/**
 * Development-only demo mode.
 *
 * Demo mode is enabled automatically when running `next dev` and is never
 * available in a production build. Set `NEXT_PUBLIC_DEMO_MODE=false` (for
 * example in `frontend/.env.local`) to work against the real backend without
 * the demo data, or use the exit button in the dashboard header.
 */
export const DEMO_AVAILABLE =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_DEMO_MODE !== "false";

const DEMO_OPT_OUT_KEY = "opd_demo_opt_out";
const DEMO_STORAGE_PREFIX = "opd_demo_";

export const DEMO_USER = {
  id: "00000000-0000-4000-8000-000000000000",
  email: "demo@openprint.local",
  full_name: "Demo User",
  is_active: true,
  is_superuser: true,
  created_at: "2026-01-01T00:00:00.000Z",
};

export function isDemoActive(): boolean {
  if (!DEMO_AVAILABLE || typeof window === "undefined") return false;
  return localStorage.getItem(DEMO_OPT_OUT_KEY) !== "1";
}

export function enableDemo(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(DEMO_OPT_OUT_KEY);
}

export function disableDemo(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(DEMO_OPT_OUT_KEY, "1");
}

/** Remove all demo edits and restore the bundled mock data. */
export function resetDemoData(): void {
  if (typeof window === "undefined") return;
  const keys = Object.keys(localStorage).filter(
    (key) =>
      key.startsWith(DEMO_STORAGE_PREFIX) && key !== DEMO_OPT_OUT_KEY,
  );
  keys.forEach((key) => localStorage.removeItem(key));
}

export function demoStorageKey(name: string): string {
  return `${DEMO_STORAGE_PREFIX}${name}`;
}
