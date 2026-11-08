"use client";

import { Settings2, Thermometer } from "lucide-react";

import type { Printer } from "@/lib/api";
import { isPrintingStatus } from "@/lib/utils";
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

interface Props {
  printer: Printer;
  status?: any | null;
  activePrint?: any | null;
  firmware?: any;
  onClose: () => void;
  onSettings: () => void;
  onPrintClick?: (print: any) => void;
}

export default function PrinterModal({
  printer,
  status,
  activePrint,
  firmware,
  onClose,
  onSettings,
  onPrintClick,
}: Props) {
  const liveStatus = status ?? printer.status;
  const isConnected =
    printer.configured && liveStatus?.status !== "no_data";
  const isPrinting = isPrintingStatus(liveStatus) || Boolean(activePrint);
  const pct = liveStatus?.mc_percent ?? activePrint?.mc_percent ?? 0;
  const remaining =
    liveStatus?.mc_remaining_time ?? activePrint?.mc_remaining_time;
  const printTitle =
    liveStatus?.subtask_name ?? activePrint?.title ?? "Unknown print";

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
          <DialogDescription className="flex flex-wrap gap-x-3 gap-y-0.5">
            <span>{printer.model ?? "Bambu Lab printer"}</span>
            <span className="font-mono">{printer.serial}</span>
            {printer.ip ? <span className="font-mono">{printer.ip}</span> : null}
            {!printer.configured ? <span>Not configured</span> : null}
          </DialogDescription>
        </DialogHeader>

        {!printer.configured ? (
          <div className="rounded-xl border border-dashed bg-muted/30 p-4 text-center">
            <p className="text-sm font-medium">Connection not configured</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Add the local IP address and access code to start monitoring this
              printer.
            </p>
            <Button className="mt-4" size="sm" onClick={onSettings}>
              <Settings2 /> Configure printer
            </Button>
          </div>
        ) : (
          <>
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
              <div className="rounded-xl border border-primary/30 bg-primary/10 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-primary">
                  {activePrint ? "Current print" : "Currently printing"}
                </p>
                {activePrint && onPrintClick ? (
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() => onPrintClick(activePrint)}
                  >
                    <p className="truncate font-medium hover:underline">
                      {printTitle}
                    </p>
                  </button>
                ) : (
                  <p className="truncate font-medium">{printTitle}</p>
                )}
                <Progress
                  value={pct}
                  className="mt-3 [&_[data-slot=progress-track]]:h-1.5"
                />
                <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                  <span className="tabular-nums">{pct}%</span>
                  <span>
                    {remaining ? `${remaining} min left` : ""}
                  </span>
                </div>
              </div>
            ) : null}
          </>
        )}

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
