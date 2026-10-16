import clsx, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function formatWeight(grams: number | null | undefined): string {
  if (grams == null) return "—";
  if (grams >= 1000) return `${(grams / 1000).toFixed(2)} kg`;
  return `${Math.round(grams)} g`;
}

export function formatDate(
  date: string | null | undefined,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...options,
  });
}

export function formatDateTime(date: string | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return "—";
  return `€${amount.toFixed(2)}`;
}

export function getStatusLabel(status: number | null | undefined): string {
  switch (status) {
    case 1: return "Unknown";
    case 2: return "Finished";
    case 3: return "Canceled";
    case 4: return "Running";
    default: return "Unknown";
  }
}

export function getStatusColor(status: number | null | undefined): string {
  switch (status) {
    case 2: return "text-green-400";
    case 3: return "text-red-400";
    case 4: return "text-blue-400";
    default: return "text-zinc-400";
  }
}

export function getStatusVariant(
  status: number | null | undefined,
): "default" | "success" | "warning" | "destructive" | "info" {
  switch (status) {
    case 2: return "success";
    case 3: return "destructive";
    case 4: return "info";
    default: return "default";
  }
}

export function stockColor(percent: number, fallback = "#3b82f6"): string {
  if (percent <= 10) return "#ef4444";
  if (percent <= 30) return "#f59e0b";
  if (percent >= 70) return "#22c55e";
  return fallback;
}
