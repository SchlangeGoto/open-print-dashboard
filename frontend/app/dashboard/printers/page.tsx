"use client";

import { useEffect, useState } from "react";
import { Printer as PrinterIcon, RefreshCw, Thermometer } from "lucide-react";

import { api } from "@/lib/api";
import {
  buildPrinterStatusMap,
  isPrintingStatus,
  stockColor,
} from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { SpoolIndicator } from "@/components/ui/SpoolIndicator";
import PrinterModal from "@/components/modals/PrinterModal";
import SpoolModal from "@/components/modals/SpoolModal";

export default function PrintersPage() {
  const [printers, setPrinters] = useState<any[]>([]);
  const [statusByDev, setStatusByDev] = useState<Record<string, any>>({});
  const [printerConfig, setPrinterConfig] = useState<any>(null);
  const [activeSpool, setActiveSpool] = useState<any>(null);
  const [filaments, setFilaments] = useState<any[]>([]);
  const [firmware, setFirmware] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [selectedPrinter, setSelectedPrinter] = useState<any>(null);
  const [selectedSpool, setSelectedSpool] = useState<any>(null);

  async function load() {
    try {
      const [devs, st, cloud, sp, fil, config] = await Promise.all([
        api.getPrinters().catch(() => []),
        api.getPrinterStatus().catch(() => null),
        api.getCloudStatus().catch(() => []),
        api.getActiveSpool().catch(() => null),
        api.getFilaments().catch(() => []),
        api.getPrinterConfig().catch(() => null),
      ]);
      setPrinters(devs);
      setStatusByDev(buildPrinterStatusMap(cloud, st, config?.serial));
      setPrinterConfig(config);
      setActiveSpool(sp);
      setFilaments(fil);

      const fwMap: Record<string, any> = {};
      await Promise.all(
        devs.map(async (d: any) => {
          const fw = await api.getFirmware(d.dev_id).catch(() => null);
          if (fw) fwMap[d.dev_id] = fw;
        }),
      );
      setFirmware(fwMap);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const i = setInterval(load, 10000);
    return () => clearInterval(i);
  }, []);

  const activeFilament = activeSpool
    ? filaments.find((f) => f.id === activeSpool.filament_id)
    : null;
  const pct = activeSpool
    ? Math.round((activeSpool.remaining_g / activeSpool.total_weight_g) * 100)
    : 0;

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-32" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Printers</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">Monitor your printers</p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw /> Refresh
        </Button>
      </div>

      {printers.length === 0 ? (
        <EmptyState
          icon={PrinterIcon}
          title="No printers found"
          description="Connect a Bambu Lab account to see your printers."
        />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {printers.map((dev) => {
            const deviceStatus = statusByDev[dev.dev_id] ?? null;
            const printing = isPrintingStatus(deviceStatus);
            const isLocalPrinter =
              !printerConfig?.serial || printerConfig.serial === dev.dev_id;
            const showSpool = isLocalPrinter && activeSpool && activeFilament;

            return (
              <Card
                key={dev.dev_id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedPrinter(dev)}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedPrinter(dev);
                  }
                }}
                className="cursor-pointer gap-4 transition-colors hover:ring-primary/40 focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <CardContent className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="rounded-xl bg-primary/10 p-3">
                        <PrinterIcon className="size-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold">{dev.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {dev.dev_model_name ?? dev.dev_id}
                        </p>
                      </div>
                    </div>
                    <Badge variant={dev.online ? "success" : "secondary"}>
                      {dev.online ? "Online" : "Offline"}
                    </Badge>
                  </div>

                  {deviceStatus ? (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg border bg-muted/40 p-3">
                        <div className="mb-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <Thermometer className="size-2.5" /> Nozzle
                        </div>
                        <p className="text-base font-bold tabular-nums text-orange-500">
                          {deviceStatus.nozzle_temper ?? "—"}°C
                        </p>
                        {deviceStatus.nozzle_target_temper ? (
                          <p className="text-[10px] text-muted-foreground">
                            Target: {deviceStatus.nozzle_target_temper}°C
                          </p>
                        ) : null}
                      </div>
                      <div className="rounded-lg border bg-muted/40 p-3">
                        <div className="mb-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <Thermometer className="size-2.5" /> Bed
                        </div>
                        <p className="text-base font-bold tabular-nums text-teal-600 dark:text-teal-400">
                          {deviceStatus.bed_temper ?? "—"}°C
                        </p>
                        {deviceStatus.bed_target_temper ? (
                          <p className="text-[10px] text-muted-foreground">
                            Target: {deviceStatus.bed_target_temper}°C
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {printing ? (
                    <div
                      className="rounded-xl border border-primary/30 bg-primary/10 p-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <p className="mb-2 text-xs font-semibold text-primary">
                        Currently Printing
                      </p>
                      <p className="truncate text-sm font-medium">
                        {deviceStatus?.subtask_name ?? "Unknown"}
                      </p>
                      <Progress
                        value={deviceStatus?.mc_percent ?? 0}
                        className="mt-2 [&_[data-slot=progress-track]]:h-1.5"
                      />
                      <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                        <span className="tabular-nums">
                          {deviceStatus?.mc_percent ?? 0}%
                        </span>
                        <span>
                          {deviceStatus?.mc_remaining_time
                            ? `${deviceStatus.mc_remaining_time} min left`
                            : ""}
                        </span>
                      </div>
                    </div>
                  ) : null}

                  {showSpool ? (
                    <button
                      type="button"
                      className="w-full cursor-pointer rounded-xl border bg-muted/40 p-3 text-left transition-colors hover:border-primary/40"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedSpool(activeSpool);
                      }}
                    >
                      <p className="mb-2 text-xs font-semibold text-muted-foreground">
                        Loaded Spool
                      </p>
                      <div className="flex items-center gap-3">
                        <SpoolIndicator
                          remaining={activeSpool.remaining_g}
                          total={activeSpool.total_weight_g}
                          color={activeFilament.color_hex}
                          size={56}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{activeFilament.color_name}</p>
                          <p className="text-xs text-muted-foreground">{activeFilament.material}</p>
                          <Progress
                            value={pct}
                            className="mt-1.5 [&_[data-slot=progress-track]]:h-1 [&_[data-slot=progress-indicator]]:bg-[var(--spool-color)]"
                            style={
                              {
                                "--spool-color": stockColor(
                                  pct,
                                  activeFilament.color_hex,
                                ),
                              } as React.CSSProperties
                            }
                          />
                        </div>
                      </div>
                    </button>
                  ) : isLocalPrinter ? (
                    <div className="rounded-xl border border-dashed bg-muted/20 p-3 text-center">
                      <p className="text-xs text-muted-foreground">No spool loaded</p>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {selectedPrinter ? (
        <PrinterModal
          printer={selectedPrinter}
          status={statusByDev[selectedPrinter.dev_id]}
          activeSpool={
            !printerConfig?.serial || printerConfig.serial === selectedPrinter.dev_id
              ? activeSpool
              : null
          }
          filament={
            !printerConfig?.serial || printerConfig.serial === selectedPrinter.dev_id
              ? activeFilament
              : null
          }
          firmware={firmware[selectedPrinter.dev_id]}
          printerIp={
            printerConfig?.serial === selectedPrinter.dev_id
              ? (printerConfig?.ip ?? undefined)
              : undefined
          }
          onClose={() => setSelectedPrinter(null)}
          onSpoolClick={() => setSelectedSpool(activeSpool)}
        />
      ) : null}

      {selectedSpool ? (
        <SpoolModal
          spool={selectedSpool}
          filament={activeFilament}
          onClose={() => setSelectedSpool(null)}
          onActivate={async () => {
            await api.activateSpool(selectedSpool.id);
            load();
          }}
        />
      ) : null}
    </div>
  );
}
