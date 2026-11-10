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
