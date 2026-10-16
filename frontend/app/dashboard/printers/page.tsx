"use client";

import { useEffect, useState } from "react";
import { Printer as PrinterIcon, RefreshCw, Thermometer } from "lucide-react";

import { api } from "@/lib/api";
import { stockColor } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SpoolIndicator } from "@/components/ui/SpoolIndicator";
import PrinterModal from "@/components/modals/PrinterModal";
import SpoolModal from "@/components/modals/SpoolModal";

export default function PrintersPage() {
  const [printers, setPrinters] = useState<any[]>([]);
  const [status, setStatus] = useState<any>(null);
  const [activeSpool, setActiveSpool] = useState<any>(null);
  const [filaments, setFilaments] = useState<any[]>([]);
  const [firmware, setFirmware] = useState<Record<string, any>>({});
  const [printerIp, setPrinterIp] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [selectedPrinter, setSelectedPrinter] = useState<any>(null);
  const [selectedSpool, setSelectedSpool] = useState<any>(null);

  async function load() {
    try {
      const [devs, st, sp, fil, ipConfig] = await Promise.all([
        api.getPrinters().catch(() => []),
        api.getPrinterStatus().catch(() => null),
        api.getActiveSpool().catch(() => null),
        api.getFilaments().catch(() => []),
        api.getPrinterConfig().catch(() => null),
      ]);
      setPrinters(devs);
      setStatus(st);
      setActiveSpool(sp);
      setFilaments(fil);
      if (ipConfig?.ip) setPrinterIp(ipConfig.ip);

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
  const printing = status?.gcode_state === "RUNNING";
  const pct = activeSpool
    ? Math.round((activeSpool.remaining_g / activeSpool.total_weight_g) * 100)
    : 0;

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-7 w-32 rounded skeleton" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-64 rounded-xl skeleton" />
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
          {printers.map((dev) => (
            <Card
              key={dev.dev_id}
              onClick={() => setSelectedPrinter(dev)}
              className="cursor-pointer gap-4 transition-colors hover:border-primary/40"
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

                {status ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border bg-muted/40 p-3">
                      <div className="mb-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <Thermometer className="size-2.5" /> Nozzle
                      </div>
                      <p className="text-base font-bold tabular-nums text-[#FF6D28]">
                        {status?.nozzle_temper ?? "—"}°C
                      </p>
                      {status?.nozzle_target_temper ? (
                        <p className="text-[10px] text-muted-foreground">
                          Target: {status.nozzle_target_temper}°C
                        </p>
                      ) : null}
                    </div>
                    <div className="rounded-lg border bg-muted/40 p-3">
                      <div className="mb-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <Thermometer className="size-2.5" /> Bed
                      </div>
                      <p className="text-base font-bold tabular-nums text-[#00D0B0]">
                        {status?.bed_temper ?? "—"}°C
                      </p>
                      {status?.bed_target_temper ? (
                        <p className="text-[10px] text-muted-foreground">
                          Target: {status.bed_target_temper}°C
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {printing ? (
                  <div
                    className="rounded-xl border border-blue-800/40 bg-blue-950/20 p-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <p className="mb-2 text-xs font-semibold text-blue-400">
                      Currently Printing
                    </p>
                    <p className="truncate text-sm font-medium">
                      {status?.subtask_name ?? "Unknown"}
                    </p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-blue-500" style={{ width: `${status?.mc_percent ?? 0}%` }} />
                    </div>
                    <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                      <span className="tabular-nums">{status?.mc_percent ?? 0}%</span>
                      <span>
                        {status?.mc_remaining_time ? `${status.mc_remaining_time} min left` : ""}
                      </span>
                    </div>
                  </div>
                ) : null}

                {activeSpool && activeFilament ? (
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
                        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: stockColor(pct, activeFilament.color_hex),
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </button>
                ) : (
                  <div className="rounded-xl border border-dashed bg-muted/20 p-3 text-center">
                    <p className="text-xs text-muted-foreground">No spool loaded</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {selectedPrinter ? (
        <PrinterModal
          printer={selectedPrinter}
          status={status}
          activeSpool={activeSpool}
          filament={activeFilament}
          firmware={firmware[selectedPrinter.dev_id]}
          printerIp={printerIp}
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
