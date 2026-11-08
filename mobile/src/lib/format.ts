export function formatWeight(grams: number | null | undefined): string {
  if (grams == null || Number.isNaN(grams)) return "—";
  if (grams >= 1000) {
    const kg = grams / 1000;
    return `${kg % 1 === 0 ? kg.toFixed(0) : kg.toFixed(1)} kg`;
  }
  return `${Math.round(grams)} g`;
}

export function percent(
  remaining: number,
  total: number | null | undefined,
): number {
  if (!total || total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((remaining / total) * 100)));
}

export function formatPrice(value: number | null | undefined): string {
  if (value == null) return "—";
  const rounded = value % 1 === 0 ? value.toFixed(0) : value.toFixed(2);
  return `€${rounded}/kg`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function getInitials(name: string | null | undefined, email = ""): string {
  const source = (name || email).trim();
  if (!source) return "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function normalizeHex(value: string): string | null {
  const raw = value.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${raw
      .split("")
      .map((char) => char + char)
      .join("")
      .toUpperCase()}`;
  }
  if (/^[0-9a-fA-F]{6}$/.test(raw)) {
    return `#${raw.toUpperCase()}`;
  }
  return null;
}

export function isLightColor(hex: string): boolean {
  const normalized = normalizeHex(hex);
  if (!normalized) return false;
  const value = normalized.slice(1);
  const [r, g, b] = [0, 2, 4].map((offset) =>
    parseInt(value.slice(offset, offset + 2), 16),
  );
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62;
}

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    if (
      error.message === "Network request failed" ||
      error.message === "Failed to fetch"
    ) {
      return "Can't reach the server. Check the URL and your connection.";
    }
    return error.message;
  }
  return "Something went wrong. Try again.";
}
