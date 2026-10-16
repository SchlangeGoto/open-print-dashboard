"use client";

import { useRouter } from "next/navigation";
import { Settings, Zap } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SpoolIndicator } from "@/components/ui/SpoolIndicator";
import { formatWeight, stockColor } from "@/lib/utils";

interface Props {
  printer: any;
  status?: any;
  activeSpool?: any;
  filament?: any;
  firmware?: any;
  printerIp?: string;
  onClose: () => void;
  onSpoolClick?: () => void;
}

export default function PrinterModal({
  printer,
  status,
  activeSpool,
  filament,
  firmware,
  printerIp,
  onClose,
  onSpoolClick,
}: Props) {
  const router = useRouter();
  const isConnected = status && status.status !== "no_data";
  const printing = status?.gcode_state === "RUNNING";
  const pct = activeSpool
    ? Math.round((activeSpool.remaining_g / activeSpool.total_weight_g) * 100)
    : 0;

  const otaVersion =
    firmware?.firmware?.find((m: any) => m.name === "ota")?.version ??
    firmware?.firmware?.[0]?.version ??
    null;

  const energyW = status?.mc_print_energy ?? status?.power ?? null;

  return (
    <Dialog
      open={!!printer}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-start justify-between gap-4">
            <span className="truncate">{printer?.name}</span>
            <Badge variant={printer?.online ? "success" : "secondary"}>
              {printer?.online ? "Online" : "Offline"}
            </Badge>
          </DialogTitle>
          <DialogDescription className="flex flex-wrap gap-x-3 gap-y-0.5">
            <span>{printer?.dev_model_name ?? "Bambu Lab Printer"}</span>
            {printerIp ? <span className="font-mono">{printerIp}</span> : null}
            {otaVersion ? <span className="font-mono">fw {otaVersion}</span> : null}
            {printer?.dev_id ? (
              <span className="truncate font-mono">{printer.dev_id}</span>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        {isConnected ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="mb-1 text-[10px] text-muted-foreground">Nozzle</p>
              <p className="text-lg font-bold tabular-nums text-[#FF6D28]">
                {status?.nozzle_temper ?? "—"}°C
              </p>
              {status?.nozzle_target_temper ? (
                <p className="text-[10px] text-muted-foreground">
                  → {status.nozzle_target_temper}°C
                </p>
              ) : null}
            </div>
            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="mb-1 text-[10px] text-muted-foreground">Bed</p>
              <p className="text-lg font-bold tabular-nums text-[#00D0B0]">
                {status?.bed_temper ?? "—"}°C
              </p>
              {status?.bed_target_temper ? (
                <p className="text-[10px] text-muted-foreground">
                  → {status.bed_target_temper}°C
                </p>
              ) : null}
            </div>
            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="mb-1 text-[10px] text-muted-foreground">Speed Level</p>
              <p className="text-lg font-bold">{status?.spd_lvl ?? "—"}</p>
              {status?.spd_mag != null ? (
                <p className="text-[10px] text-muted-foreground">{status.spd_mag}%</p>
              ) : null}
            </div>
            <div className="rounded-lg border bg-muted/40 p-3">
              <p className="mb-1 text-[10px] text-muted-foreground">State</p>
              <p className="mt-0.5 text-sm font-bold">{status?.gcode_state ?? "—"}</p>
            </div>
          </div>
        ) : null}

        <div className="rounded-xl border bg-muted/30 p-4">
          <div className="mb-3 flex items-center gap-2">
            <Zap className="size-3.5 text-amber-400" />
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Energy
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-0.5 text-[10px] text-muted-foreground">Current Draw</p>
              <p className="text-sm font-medium">
                {energyW != null ? `${energyW} W` : "—"}
              </p>
            </div>
            <div>
              <p className="mb-0.5 text-[10px] text-muted-foreground">Fan Speed</p>
              <p className="text-sm font-medium">
                {status?.cooling_fan_speed != null
                  ? `${Math.round((status.cooling_fan_speed / 15) * 100)}%`
                  : "—"}
              </p>
            </div>
          </div>
        </div>

        {printing ? (
          <div className="rounded-xl border border-blue-800/40 bg-blue-950/20 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-400">
              Printing
            </p>
            <p className="font-medium">{status?.subtask_name ?? "Unknown"}</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-blue-500"
                style={{ width: `${status?.mc_percent ?? 0}%` }}
              />
            </div>
            <div className="mt-1 flex justify-between text-xs text-muted-foreground">
              <span className="tabular-nums">{status?.mc_percent ?? 0}%</span>
              <span>
                {status?.mc_remaining_time
                  ? `${status.mc_remaining_time} min left`
                  : ""}
              </span>
            </div>
          </div>
        ) : null}

        {activeSpool && filament ? (
          <button
            type="button"
            className="cursor-pointer rounded-xl border bg-muted/40 p-4 text-left transition-colors hover:border-primary/40"
            onClick={onSpoolClick}
          >
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Loaded Spool
            </p>
            <div className="flex items-center gap-4">
              <SpoolIndicator
                remaining={activeSpool.remaining_g}
                total={activeSpool.total_weight_g}
                color={filament.color_hex}
                size={72}
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{filament.color_name}</p>
                <p className="text-sm text-muted-foreground">
                  {filament.brand} · {filament.material}
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: stockColor(pct, filament.color_hex),
                    }}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatWeight(activeSpool.remaining_g)} remaining
                </p>
              </div>
            </div>
          </button>
        ) : (
          <div className="rounded-xl border border-dashed bg-muted/20 p-4 text-center">
            <p className="text-xs text-muted-foreground">No spool loaded</p>
          </div>
        )}

        <div className="flex items-center justify-between rounded-xl border bg-muted/30 p-4">
          <div>
            <p className="text-sm font-medium">Printer Settings</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              IP address, access code, serial number
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onClose();
              router.push("/dashboard/settings");
            }}
          >
            <Settings /> Configure
          </Button>
        </div>

        {firmware?.firmware && firmware.firmware.length > 0 ? (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Firmware Modules
            </p>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {(firmware.firmware as any[]).map((fw) => (
                <div key={`${fw.name}-${fw.version}`} className="rounded-lg border bg-muted/40 p-2.5">
                  <p className="text-[10px] text-muted-foreground">{fw.name}</p>
                  <p className="mt-0.5 font-mono text-xs">{fw.version}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
