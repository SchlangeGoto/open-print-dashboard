import type { SuggestedFilament } from "./types";

export function parseSuggestion(
  raw: string | undefined,
): SuggestedFilament | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SuggestedFilament | null;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}
