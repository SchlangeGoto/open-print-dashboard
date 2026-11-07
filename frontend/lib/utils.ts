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

export function formatEstimatedEnd(minutes: number | null | undefined): string {
  if (!minutes) return "—";
  return new Date(Date.now() + minutes * 60 * 1000).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusDeviceId(status: any): string | null {
  return (
    status?.dev_id ??
    status?.device_id ??
    status?.serial ??
    status?.sn ??
    status?.id ??
    null
  );
}

function normalizePrinterStatus(status: any) {
  if (!status) return status;
  const printStatus = status.print_status;
  const gcodeState =
    status.gcode_state ??
    (typeof printStatus === "string"
      ? printStatus
      : (printStatus?.gcode_state ?? printStatus?.status));
  return { ...status, gcode_state: gcodeState };
}

/**
 * Build a `dev_id -> status` map from the cloud status list and the local
 * MQTT status. The local status is authoritative for the configured printer.
 */
export function buildPrinterStatusMap(
  cloudStatuses: any[] | null | undefined,
  localStatus: any | null | undefined,
  localSerial?: string | null,
): Record<string, any> {
  const map: Record<string, any> = {};

  for (const status of cloudStatuses ?? []) {
    const id = statusDeviceId(status);
    if (id) map[id] = normalizePrinterStatus(status);
  }

  if (localStatus && localSerial) {
    map[localSerial] = normalizePrinterStatus({
      ...(map[localSerial] ?? {}),
      ...localStatus,
    });
  }

  return map;
}

export function isPrintingStatus(status: any): boolean {
  const state = status?.gcode_state ?? status?.print_status;
  return typeof state === "string" && state.toUpperCase() === "RUNNING";
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

/**
 * Keep chart bars readable when the filament itself is very dark. Stock
 * status colors are left alone; only the actual filament color is lightened.
 */
export function chartColor(percent: number, color?: string | null): string {
  const base = stockColor(percent, color ?? undefined);
  if (!color || percent <= 30 || percent >= 70) return base;

  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return base;

  const value = Number.parseInt(match[1], 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  const luminance = (0.2126 * r + 0.587 * g + 0.114 * b) / 255;

  if (luminance >= 0.2) return base;

  const mix = 0.4;
  const lighten = (channel: number) =>
    Math.round(channel + (255 - channel) * mix)
      .toString(16)
      .padStart(2, "0");

  return `#${lighten(r)}${lighten(g)}${lighten(b)}`;
}
