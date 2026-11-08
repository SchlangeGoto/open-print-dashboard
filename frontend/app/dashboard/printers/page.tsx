"use client";

import { useEffect, useState } from "react";
import {
  Eye,
  Plus,
  Printer as PrinterIcon,
  RefreshCw,
  Settings2,
  Thermometer,
} from "lucide-react";

import { api, type Printer } from "@/lib/api";
import { isPrintingStatus } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import PrinterModal from "@/components/modals/PrinterModal";
import PrinterSettingsModal from "@/components/modals/PrinterSettingsModal";
import PrintJobModal from "@/components/modals/PrintJobModal";

export default function PrintersPage() {
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [prints, setPrints] = useState<any[]>([]);
  const [firmware, setFirmware] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [selectedPrinter, setSelectedPrinter] = useState<Printer | null>(null);
  const [selectedPrint, setSelectedPrint] = useState<any | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPrinter, setSettingsPrinter] = useState<Printer | null>(null);

  async function load() {
    try {
      const [devices, jobs] = await Promise.all([
        api.getPrinters().catch(() => []),
        api.getPrintJobs().catch(() => []),
      ]);
      setPrinters(devices);
      setPrints(jobs);

      const firmwareMap: Record<string, any> = {};
      await Promise.all(
        devices
          .filter((printer) => printer.configured)
          .map(async (printer) => {
            const info = await api.getFirmware(printer.serial).catch(() => null);
            if (info) firmwareMap[printer.serial] = info;
          }),
      );
      setFirmware(firmwareMap);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  function openSettings(printer: Printer | null) {
    setSelectedPrinter(null);
    setSettingsPrinter(printer);
    setSettingsOpen(true);
  }

  function activePrintFor(serial: string) {
    return prints.find(
      (print) => print.status === 4 && print.device_id === serial,
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-32" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[0, 1].map((index) => (
            <Skeleton key={index} className="h-64 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Printers</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {printers.filter((printer) => printer.configured).length} configured
            · {printers.filter((printer) => printer.online).length} online
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw /> Refresh
          </Button>
          <Button size="sm" onClick={() => openSettings(null)}>
            <Plus /> Add printer
          </Button>
        </div>
      </div>

      {printers.length === 0 ? (
        <EmptyState
          icon={PrinterIcon}
          title="No printers"
          description="Add a printer with its local IP address and access code."
          action={
            <Button onClick={() => openSettings(null)}>
              <Plus /> Add printer
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
          {printers.map((printer) => {
            const status = printer.status;
            const activePrint = activePrintFor(printer.serial);
            const printing = isPrintingStatus(status) || Boolean(activePrint);
            const pct = status?.mc_percent ?? activePrint?.mc_percent ?? 0;
            const remaining =
              status?.mc_remaining_time ?? activePrint?.mc_remaining_time;

            return (
              <Card key={printer.serial}>
                <CardContent className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
                        <PrinterIcon className="size-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{printer.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {printer.model ?? "Bambu Lab printer"}
                        </p>
                        <p className="truncate font-mono text-[10px] text-muted-foreground">
                          {printer.serial}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge
                        variant={
                          printer.online || status?.connected
                            ? "success"
                            : "secondary"
                        }
                      >
                        {printer.online || status?.connected
                          ? "Online"
                          : "Offline"}
                      </Badge>
                      {!printer.configured ? (
                        <Badge variant="secondary">Not configured</Badge>
                      ) : null}
                    </div>
                  </div>

                  {printer.configured && status && status.status !== "no_data" ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg border bg-muted/40 p-3">
                        <div className="mb-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <Thermometer className="size-2.5" /> Nozzle
                        </div>
                        <p className="text-base font-bold tabular-nums">
                          {status.nozzle_temper ?? "—"}°C
                        </p>
                        {status.nozzle_target_temper ? (
                          <p className="text-[10px] text-muted-foreground">
                            Target: {status.nozzle_target_temper}°C
                          </p>
                        ) : null}
                      </div>
                      <div className="rounded-lg border bg-muted/40 p-3">
                        <div className="mb-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <Thermometer className="size-2.5" /> Bed
                        </div>
                        <p className="text-base font-bold tabular-nums">
                          {status.bed_temper ?? "—"}°C
                        </p>
                        {status.bed_target_temper ? (
                          <p className="text-[10px] text-muted-foreground">
                            Target: {status.bed_target_temper}°C
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {printing ? (
                    <button
                      type="button"
                      className="w-full rounded-lg border border-primary/30 bg-primary/10 p-3 text-left transition-colors hover:border-primary/50"
                      onClick={() => {
                        if (activePrint) {
                          setSelectedPrint(activePrint);
                        } else {
                          setSelectedPrinter(printer);
                        }
                      }}
                    >
                      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                        Currently printing
                      </p>
                      <p className="truncate text-sm font-medium">
                        {activePrint?.title ?? status?.subtask_name ?? "Unknown"}
                      </p>
                      <Progress
                        value={pct}
                        className="mt-2 [&_[data-slot=progress-track]]:h-1.5"
                      />
                      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                        <span className="tabular-nums">{pct}%</span>
                        <span>{remaining ? `${remaining} min left` : ""}</span>
                      </div>
                    </button>
                  ) : null}

                  {!printer.configured ? (
                    <div className="rounded-lg border border-dashed bg-muted/20 p-3 text-xs text-muted-foreground">
                      Add the local network details to start monitoring this
                      printer.
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedPrinter(printer)}
                    >
                      <Eye /> Details
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openSettings(printer)}
                    >
                      <Settings2 /> Settings
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {selectedPrinter ? (
        <PrinterModal
          printer={selectedPrinter}
          status={selectedPrinter.status}
          activePrint={activePrintFor(selectedPrinter.serial)}
          firmware={firmware[selectedPrinter.serial]}
          onClose={() => setSelectedPrinter(null)}
          onSettings={() => openSettings(selectedPrinter)}
          onPrintClick={(print) => {
            setSelectedPrinter(null);
            setSelectedPrint(print);
          }}
        />
      ) : null}

      {settingsOpen ? (
        <PrinterSettingsModal
          printer={settingsPrinter}
          onClose={() => setSettingsOpen(false)}
          onSaved={load}
        />
      ) : null}

      {selectedPrint ? (
        <PrintJobModal
          print={selectedPrint}
          onClose={() => setSelectedPrint(null)}
        />
      ) : null}
    </div>
  );
}
