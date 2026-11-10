"use client";

import { Cloud, Settings2, Thermometer } from "lucide-react";

import type { Printer } from "@/lib/api";
import { formatWeight, isPrintingStatus } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { SpoolIndicator } from "@/components/ui/SpoolIndicator";

interface Props {
  printer: Printer;
  status?: any | null;
  activePrint?: any | null;
  loadedSpool?: any | null;
  loadedFilament?: any | null;
  firmware?: any;
  onClose: () => void;
  onSettings: () => void;
  onPrintClick?: (print: any) => void;
  onSpoolClick?: (spool: any) => void;
}

export default function PrinterModal({
  printer,
  status,
  activePrint,
  loadedSpool,
  loadedFilament,
  firmware,
  onClose,
  onSettings,
  onPrintClick,
  onSpoolClick,
}: Props) {
  const liveStatus = status ?? printer.status;
  const isConnected = Boolean(
    printer.configured && liveStatus && liveStatus.status !== "no_data",
  );
  const isPrinting = isPrintingStatus(liveStatus) || Boolean(activePrint);
  const pct = liveStatus?.mc_percent ?? activePrint?.mc_percent ?? 0;
  const remaining =
    liveStatus?.mc_remaining_time ?? activePrint?.mc_remaining_time;
  const printTitle =
    liveStatus?.subtask_name ?? activePrint?.title ?? "Unknown print";

  const spoolUnknown = Boolean(loadedSpool?.remaining_unknown);
  const spoolPct =
    loadedSpool && !spoolUnknown && loadedSpool.total_weight_g > 0
      ? Math.round((loadedSpool.remaining_g / loadedSpool.total_weight_g) * 100)
      : 0;

  const loadedSpoolContent = loadedSpool && loadedFilament ? (
    <>
      <div className="flex items-center gap-3">
        <SpoolIndicator
          remaining={loadedSpool.remaining_g}
          total={loadedSpool.total_weight_g}
          color={loadedFilament.color_hex}
          size={52}
          unknown={spoolUnknown}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Loaded spool
          </p>
          <p className="truncate text-sm font-medium">
            {loadedFilament.color_name}
          </p>
          <p className="text-xs text-muted-foreground">
            {loadedFilament.brand} · {loadedFilament.material} ·{" "}
            {spoolUnknown ? "Unknown" : formatWeight(loadedSpool.remaining_g)}
          </p>
          {spoolUnknown ? (
            <p className="mt-1 text-[10px] text-muted-foreground">
              Weight unknown · added from printer
            </p>
          ) : (
            <Progress
              value={spoolPct}
              className="mt-1.5 [&_[data-slot=progress-track]]:h-1.5 [&_[data-slot=progress-indicator]]:bg-[var(--spool-color)]"
              style={
                {
                  "--spool-color": loadedFilament.color_hex ?? "#9ca3af",
                } as React.CSSProperties
              }
            />
          )}
        </div>
      </div>
    </>
  ) : null;

  const currentPrintContent = (
    <>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">
        {activePrint ? "Current print" : "Currently printing"}
      </p>
      <p className="truncate font-medium">{printTitle}</p>
      <Progress
        value={pct}
        className="mt-3 [&_[data-slot=progress-track]]:h-1.5"
      />
      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span className="tabular-nums">{pct}%</span>
        <span>{remaining ? `${remaining} min left` : ""}</span>
      </div>
    </>
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-start justify-between gap-4 pr-10">
            <span className="truncate">{printer.name}</span>
            <Badge
              variant={
                printer.online || liveStatus?.connected ? "success" : "secondary"
              }
            >
              {printer.online || liveStatus?.connected ? "Online" : "Offline"}
            </Badge>
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <span>{printer.model ?? "Bambu Lab printer"}</span>
            <span className="font-mono">{printer.serial}</span>
            <span className="inline-flex items-center gap-1">
              <Cloud className="size-3" /> Bambu Cloud
            </span>
            {!printer.configured ? <span>Not configured</span> : null}
          </DialogDescription>
        </DialogHeader>

        {!printer.configured ? (
          <div className="rounded-xl border border-dashed bg-muted/30 p-4 text-center">
            <p className="text-sm font-medium">Connection not configured</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Add this printer to the dashboard to start monitoring it through
              your Bambu Cloud account.
            </p>
            <Button className="mt-4" size="sm" onClick={onSettings}>
              <Settings2 /> Configure printer
            </Button>
          </div>
        ) : (
          <>
            {liveStatus?.reauth_required ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-sm font-medium text-destructive">
                  Bambu Cloud sign-in expired
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Sign in again under Settings to bring this printer back
                  online.
                </p>
              </div>
            ) : null}
            {isConnected ? (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded-lg border bg-muted/40 p-3">
                  <div className="mb-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Thermometer className="size-2.5" /> Nozzle
                  </div>
                  <p className="text-lg font-bold tabular-nums">
                    {liveStatus?.nozzle_temper ?? "—"}°C
                  </p>
                  {liveStatus?.nozzle_target_temper ? (
                    <p className="text-[10px] text-muted-foreground">
                      Target: {liveStatus.nozzle_target_temper}°C
                    </p>
                  ) : null}
                </div>
                <div className="rounded-lg border bg-muted/40 p-3">
                  <div className="mb-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Thermometer className="size-2.5" /> Bed
                  </div>
                  <p className="text-lg font-bold tabular-nums">
                    {liveStatus?.bed_temper ?? "—"}°C
                  </p>
                  {liveStatus?.bed_target_temper ? (
                    <p className="text-[10px] text-muted-foreground">
                      Target: {liveStatus.bed_target_temper}°C
                    </p>
                  ) : null}
                </div>
                <div className="rounded-lg border bg-muted/40 p-3">
                  <p className="mb-1 text-[10px] text-muted-foreground">
                    Speed level
                  </p>
                  <p className="text-lg font-bold">
                    {liveStatus?.spd_lvl ?? "—"}
                  </p>
                  {liveStatus?.spd_mag != null ? (
                    <p className="text-[10px] text-muted-foreground">
                      {liveStatus.spd_mag}%
                    </p>
                  ) : null}
                </div>
                <div className="rounded-lg border bg-muted/40 p-3">
                  <p className="mb-1 text-[10px] text-muted-foreground">State</p>
                  <p className="mt-0.5 text-sm font-bold">
                    {liveStatus?.gcode_state ?? "—"}
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed bg-muted/30 p-4 text-center">
                <p className="text-sm font-medium">Waiting for printer data</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  The printer is configured but has not reported a status yet.
                </p>
              </div>
            )}

            {isPrinting ? (
              activePrint && onPrintClick ? (
                <button
                  type="button"
                  className="w-full cursor-pointer rounded-xl border border-primary/30 bg-primary/10 p-4 text-left transition-colors hover:border-primary/50"
                  onClick={() => onPrintClick(activePrint)}
                >
                  {currentPrintContent}
                </button>
              ) : (
                <div className="rounded-xl border border-primary/30 bg-primary/10 p-4">
                  {currentPrintContent}
                </div>
              )
            ) : null}
          </>
        )}

        {loadedSpoolContent ? (
          onSpoolClick ? (
            <button
              type="button"
              className="w-full cursor-pointer rounded-xl border bg-muted/30 p-3 text-left transition-colors hover:border-primary/40"
              onClick={() => onSpoolClick(loadedSpool)}
            >
              {loadedSpoolContent}
            </button>
          ) : (
            <div className="rounded-xl border bg-muted/30 p-3">
              {loadedSpoolContent}
            </div>
          )
        ) : printer.configured ? (
          <div className="rounded-xl border border-dashed bg-muted/20 p-3 text-center">
            <p className="text-xs text-muted-foreground">No spool loaded</p>
          </div>
        ) : null}

        {firmware?.firmware?.length ? (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Firmware modules
            </p>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
              {(firmware.firmware as any[]).map((module) => (
                <div
                  key={`${module.name}-${module.version}`}
                  className="rounded-lg border bg-muted/40 p-2.5"
                >
                  <p className="text-[10px] text-muted-foreground">
                    {module.name}
                  </p>
                  <p className="mt-0.5 font-mono text-xs">{module.version}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={onSettings}>
            <Settings2 /> Printer settings
          </Button>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
