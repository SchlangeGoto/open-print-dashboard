"use client";

import { useEffect, useState } from "react";
import {
  Cloud,
  Eye,
  Plus,
  Printer as PrinterIcon,
  RefreshCw,
  Settings2,
  Thermometer,
} from "lucide-react";

import { api, type Printer } from "@/lib/api";
import { toast } from "@/lib/toast";
import { formatWeight, getPrintFilament, isPrintingStatus } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { SpoolIndicator } from "@/components/ui/SpoolIndicator";
import PrinterModal from "@/components/modals/PrinterModal";
import PrinterSettingsModal from "@/components/modals/PrinterSettingsModal";
import FilamentModal from "@/components/modals/FilamentModal";
import PrintJobModal from "@/components/modals/PrintJobModal";
import SpoolModal from "@/components/modals/SpoolModal";

export default function PrintersPage() {
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [prints, setPrints] = useState<any[]>([]);
  const [spools, setSpools] = useState<any[]>([]);
  const [filaments, setFilaments] = useState<any[]>([]);
  const [firmware, setFirmware] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [selectedPrinter, setSelectedPrinter] = useState<Printer | null>(null);
  const [selectedPrint, setSelectedPrint] = useState<any | null>(null);
  const [selectedSpool, setSelectedSpool] = useState<any | null>(null);
  const [selectedFilament, setSelectedFilament] = useState<any | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPrinter, setSettingsPrinter] = useState<Printer | null>(null);

  async function load() {
    try {
      const [devices, jobs, spoolList, filamentList] = await Promise.all([
        api.getPrinters().catch(() => []),
        api.getPrintJobs().catch(() => []),
        api.getSpools().catch(() => []),
        api.getFilaments().catch(() => []),
      ]);
      setPrinters(devices);
      setPrints(jobs);
      setSpools(spoolList);
      setFilaments(filamentList);

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

  async function addCloudPrinter(printer: Printer) {
    try {
      await api.createPrinter({
        name: printer.name,
        serial: printer.serial,
      });
      toast.success("Printer added");
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to add printer",
      );
    }
  }

  function activePrintFor(serial: string) {
    return prints.find(
      (print) => print.status === 4 && print.device_id === serial,
    );
  }

  const selectedLoadedSpool = selectedPrinter?.id
    ? spools.find((spool) => spool.printer_id === selectedPrinter.id)
    : null;
  const selectedLoadedFilament = selectedLoadedSpool
    ? filaments.find(
        (filament) => filament.id === selectedLoadedSpool.filament_id,
      )
    : null;

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
        </div>
      </div>

      {printers.length === 0 ? (
        <EmptyState
          icon={PrinterIcon}
          title="No printers"
          description="Printers on your Bambu Lab account appear here. Bind the printer in Bambu Handy, then refresh."
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
            const loadedSpool = printer.id
              ? spools.find((spool) => spool.printer_id === printer.id)
              : null;
            const loadedFilament = loadedSpool
              ? filaments.find(
                  (filament) => filament.id === loadedSpool.filament_id,
                )
              : null;
            const loadedPct =
              loadedSpool && loadedSpool.total_weight_g > 0
                ? Math.round(
                    (loadedSpool.remaining_g / loadedSpool.total_weight_g) * 100,
                  )
                : 0;

            return (
              <Card
                key={printer.serial}
                role={printer.configured ? "button" : undefined}
                tabIndex={printer.configured ? 0 : undefined}
                onClick={() => {
                  if (printer.configured) setSelectedPrinter(printer);
                }}
                onKeyDown={(event) => {
                  if (!printer.configured) return;
                  if (event.target !== event.currentTarget) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedPrinter(printer);
                  }
                }}
                className={
                  printer.configured
                    ? "cursor-pointer transition-colors hover:ring-primary/40 focus-visible:ring-2 focus-visible:ring-ring/50"
                    : undefined
                }
              >
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
                      onClick={(event) => {
                        event.stopPropagation();
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

                  {loadedSpool && loadedFilament ? (
                    <button
                      type="button"
                      className="w-full cursor-pointer rounded-lg border bg-muted/30 p-3 text-left transition-colors hover:border-primary/40"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedSpool(loadedSpool);
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <SpoolIndicator
                          remaining={loadedSpool.remaining_g}
                          total={loadedSpool.total_weight_g}
                          color={loadedFilament.color_hex}
                          size={48}
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
                            {formatWeight(loadedSpool.remaining_g)}
                          </p>
                          <Progress
                            value={loadedPct}
                            className="mt-1.5 [&_[data-slot=progress-track]]:h-1.5 [&_[data-slot=progress-indicator]]:bg-[var(--spool-color)]"
                            style={
                              {
                                "--spool-color":
                                  loadedFilament.color_hex ?? "#9ca3af",
                              } as React.CSSProperties
                            }
                          />
                        </div>
                      </div>
                    </button>
                  ) : null}

                  {!printer.configured ? (
                    <div className="rounded-lg border border-dashed bg-muted/20 p-3 text-xs text-muted-foreground">
                      <span className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
                        <Cloud className="size-3.5" /> Available on your Bambu
                        account
                      </span>
                      Add it to the dashboard to start monitoring.
                    </div>
                  ) : null}

                  <Separator />

                  <div className="flex flex-wrap items-center gap-2">
                    {printer.configured ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedPrinter(printer);
                          }}
                        >
                          <Eye /> Details
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            openSettings(printer);
                          }}
                        >
                          <Settings2 /> Settings
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          addCloudPrinter(printer);
                        }}
                      >
                        <Plus /> Add to dashboard
                      </Button>
                    )}
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
          loadedSpool={selectedLoadedSpool}
          loadedFilament={selectedLoadedFilament}
          firmware={firmware[selectedPrinter.serial]}
          onClose={() => setSelectedPrinter(null)}
          onSettings={() => openSettings(selectedPrinter)}
          onPrintClick={(print) => {
            setSelectedPrinter(null);
            setSelectedPrint(print);
          }}
          onSpoolClick={(spool) => {
            setSelectedPrinter(null);
            setSelectedSpool(spool);
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
          filament={getPrintFilament(selectedPrint, spools, filaments)}
          onFilamentClick={(filament) => {
            setSelectedPrint(null);
            setSelectedFilament(filament);
          }}
          onClose={() => setSelectedPrint(null)}
        />
      ) : null}

      {selectedSpool ? (
        <SpoolModal
          spool={selectedSpool}
          filament={filaments.find(
            (filament) => filament.id === selectedSpool.filament_id,
          )}
          onClose={() => setSelectedSpool(null)}
        />
      ) : null}

      {selectedFilament ? (
        <FilamentModal
          filament={selectedFilament}
          spools={spools.filter(
            (spool) => spool.filament_id === selectedFilament.id,
          )}
          onClose={() => setSelectedFilament(null)}
        />
      ) : null}
    </div>
  );
}
