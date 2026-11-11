"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Cloud,
  Eye,
  Plus,
  Printer as PrinterIcon,
  RefreshCw,
  Settings2,
  Thermometer,
} from "lucide-react";

import { api, type CloudStatus, type Printer } from "@/lib/api";
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

function emptyPrinterMessage(status: CloudStatus | null): string {
  if (status && !status.logged_in) {
    return "Bambu Cloud is not connected. Sign in under Settings.";
  }
  if (status?.error === "cloudflare") {
    return "Bambu Cloud is blocking requests right now. Try again shortly.";
  }
  if (status?.error === "unreachable") {
    return "Could not reach Bambu Cloud. Check the network and try again.";
  }
  return "No printers on your Bambu account. Bind the printer in Bambu Handy, then refresh.";
}

export default function PrintersPage() {
  const router = useRouter();
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [cloudStatus, setCloudStatus] = useState<CloudStatus | null>(null);
  const [prints, setPrints] = useState<any[]>([]);
  const [spools, setSpools] = useState<any[]>([]);
  const [filaments, setFilaments] = useState<any[]>([]);
  const [firmware, setFirmware] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestSeq = useRef(0);
  const inFlight = useRef(false);
  const [selectedPrinter, setSelectedPrinter] = useState<Printer | null>(null);
  const [selectedPrint, setSelectedPrint] = useState<any | null>(null);
  const [selectedSpool, setSelectedSpool] = useState<any | null>(null);
  const [selectedFilament, setSelectedFilament] = useState<any | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPrinter, setSettingsPrinter] = useState<Printer | null>(null);

  const load = useCallback(async (force = false) => {
    if (inFlight.current && !force) return;
    inFlight.current = true;
    const seq = ++requestSeq.current;
    try {
      const [devices, jobs, spoolList, filamentList] = await Promise.all([
        api.getPrinters(),
        api.getPrintJobs(),
        api.getSpools(),
        api.getFilaments(),
      ]);
      if (seq !== requestSeq.current) return;
      setPrinters(devices);
      setPrints(jobs);
      setSpools(spoolList);
      setFilaments(filamentList);

      const entries = await Promise.all(
        devices
          .filter((printer) => printer.configured)
          .map(async (printer) => {
            try {
              const info = await api.getFirmware(printer.serial);
              return info ? ([printer.serial, info] as const) : null;
            } catch {
              // Firmware is optional and must not fail the whole refresh.
              return null;
            }
          }),
      );
      if (seq !== requestSeq.current) return;
      setFirmware(Object.fromEntries(entries.filter((entry) => entry !== null)));
      setLoadError(null);
    } catch (error) {
      if (seq === requestSeq.current) {
        setLoadError(
          error instanceof Error ? error.message : "Could not reach the server",
        );
      }
    } finally {
      if (seq === requestSeq.current) {
        inFlight.current = false;
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 10000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    if (printers.length > 0) {
      setCloudStatus(null);
      return;
    }
    let active = true;
    api
      .getCloudAccount()
      .then((status) => {
        if (active) setCloudStatus(status);
      })
      .catch(() => {
        if (active) setCloudStatus({ logged_in: true, error: "unreachable" });
      });
    return () => {
      active = false;
    };
  }, [printers.length]);

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

  const currentSelectedPrinter = selectedPrinter
    ? (printers.find((item) => item.serial === selectedPrinter.serial) ?? null)
    : null;
  const selectedLoadedSpool = currentSelectedPrinter?.id
    ? spools.find((spool) => spool.printer_id === currentSelectedPrinter.id)
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
          <Button variant="outline" size="sm" onClick={() => void load(true)}>
            <RefreshCw /> Refresh
          </Button>
        </div>
      </div>

      {loadError ? (
        <div
          role="alert"
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400"
        >
          Could not refresh: {loadError}. Showing the last known data.
        </div>
      ) : null}

      {printers.length === 0 ? (
        <EmptyState
          icon={PrinterIcon}
          title={loadError ? "Could not load printers" : "No printers"}
          description={loadError ?? emptyPrinterMessage(cloudStatus)}
          action={
            loadError ? (
              <Button variant="outline" onClick={() => void load(true)}>
                Try again
              </Button>
            ) : cloudStatus && !cloudStatus.logged_in ? (
              <Button onClick={() => router.push("/dashboard/settings")}>
                Open settings
              </Button>
            ) : undefined
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
            const loadedSpool = printer.id
              ? spools.find((spool) => spool.printer_id === printer.id)
              : null;
            const loadedFilament = loadedSpool
              ? filaments.find(
                  (filament) => filament.id === loadedSpool.filament_id,
                )
              : null;
            const loadedUnknown = Boolean(loadedSpool?.remaining_unknown);
            const loadedPct =
              loadedSpool && !loadedUnknown && loadedSpool.total_weight_g > 0
                ? Math.round(
                    (loadedSpool.remaining_g / loadedSpool.total_weight_g) * 100,
                  )
                : 0;

            return (
              <Card
                key={printer.serial}
                onClick={() => {
                  if (printer.configured) setSelectedPrinter(printer);
                }}
                className={
                  printer.configured
                    ? "cursor-pointer transition-colors hover:ring-primary/40"
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
                      {status?.reauth_required ? (
                        <Badge variant="destructive">Sign-in expired</Badge>
                      ) : null}
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
                        aria-label={`Print progress for ${printer.name}`}
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
                          unknown={loadedUnknown}
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
                            {loadedUnknown
                              ? "Unknown"
                              : formatWeight(loadedSpool.remaining_g)}
                          </p>
                          {loadedUnknown ? (
                            <p className="mt-1 text-[10px] text-muted-foreground">
                              Weight unknown · added from printer
                            </p>
                          ) : (
                            <Progress
                              aria-label={`Loaded spool remaining for ${printer.name}`}
                              value={loadedPct}
                              className="mt-1.5 [&_[data-slot=progress-track]]:h-1.5 [&_[data-slot=progress-indicator]]:bg-[var(--spool-color)]"
                              style={
                                {
                                  "--spool-color":
                                    loadedFilament.color_hex ?? "#9ca3af",
                                } as React.CSSProperties
                              }
                            />
                          )}
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

      {currentSelectedPrinter ? (
        <PrinterModal
          printer={currentSelectedPrinter}
          status={currentSelectedPrinter.status}
          activePrint={activePrintFor(currentSelectedPrinter.serial)}
          loadedSpool={selectedLoadedSpool}
          loadedFilament={selectedLoadedFilament}
          firmware={firmware[currentSelectedPrinter.serial]}
          onClose={() => setSelectedPrinter(null)}
          onSettings={() => openSettings(currentSelectedPrinter)}
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
          onSaved={() => void load(true)}
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
