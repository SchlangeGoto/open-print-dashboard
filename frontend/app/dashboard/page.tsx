"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Printer as PrinterIcon, Thermometer } from "lucide-react";

import { api } from "@/lib/api";
import { stockColor } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CoverImage } from "@/components/ui/CoverImage";
import { EmptyState } from "@/components/ui/EmptyState";
import { SpoolIndicator } from "@/components/ui/SpoolIndicator";
import PrintJobModal from "@/components/modals/PrintJobModal";
import PrinterModal from "@/components/modals/PrinterModal";
import SpoolModal from "@/components/modals/SpoolModal";

export default function DashboardPage() {
  const [status, setStatus] = useState<any>(null);
  const [prints, setPrints] = useState<any[]>([]);
  const [filaments, setFilaments] = useState<any[]>([]);
  const [spools, setSpools] = useState<any[]>([]);
  const [activeSpool, setActiveSpool] = useState<any>(null);
  const [printers, setPrinters] = useState<any[]>([]);
  const [firmware, setFirmware] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [selectedPrint, setSelectedPrint] = useState<any>(null);
  const [selectedSpool, setSelectedSpool] = useState<any>(null);
  const [selectedPrinter, setSelectedPrinter] = useState<any>(null);
  const [estimatedEnd, setEstimatedEnd] = useState("—");

  useEffect(() => {
    async function load() {
      try {
        const [st, pr, fil, sp, act, devs] = await Promise.all([
          api.getPrinterStatus().catch(() => null),
          api.getPrintJobs().catch(() => []),
          api.getFilaments().catch(() => []),
          api.getSpools().catch(() => []),
          api.getActiveSpool().catch(() => null),
          api.getPrinters().catch(() => []),
        ]);
        setStatus(st);
        const mins = st?.mc_remaining_time;
        setEstimatedEnd(
          mins
            ? new Date(Date.now() + mins * 60 * 1000).toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "—",
        );
        setPrints(pr);
        setFilaments(fil);
        setSpools(sp);
        setActiveSpool(act);
        setPrinters(devs);

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
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  const activePrints = prints.filter((p) => p.status === 4);
  const activeFilament = activeSpool
    ? filaments.find((f) => f.id === activeSpool.filament_id)
    : null;
  const spoolPct = activeSpool
    ? Math.round((activeSpool.remaining_g / activeSpool.total_weight_g) * 100)
    : 0;
  const printing = status?.gcode_state === "RUNNING";

  const filamentChartData = filaments
    .filter((f) => f.total_remaining_g > 0)
    .map((f) => {
      const totalSpoolG = spools
        .filter((s) => s.filament_id === f.id)
        .reduce((sum, s) => sum + s.total_weight_g, 0);
      const pct = totalSpoolG > 0 ? (f.total_remaining_g / totalSpoolG) * 100 : 0;
      return {
        name: f.color_name,
        remaining: Math.round(f.total_remaining_g),
        pct: Math.round(pct),
        color: f.color_hex,
      };
    });

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 rounded skeleton" />
        <div className="h-56 rounded-xl skeleton" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[0, 1].map((i) => (
            <div key={i} className="h-64 rounded-xl skeleton" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-8">
      <div>
        <h1 className="text-xl font-bold">Dashboard</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Overview of your 3D printing activity
        </p>
      </div>

      {filamentChartData.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Filaments in Stock</CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={filamentChartData}
                  barSize={36}
                  margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                >
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}g`} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    labelStyle={{ color: "var(--popover-foreground)" }}
                    itemStyle={{ color: "var(--popover-foreground)" }}
                    formatter={(val: any, _name: any, props: any) => [
                      `${val}g (${props.payload.pct}%)`,
                      "Remaining",
                    ]}
                  />
                  <Bar dataKey="remaining" radius={[4, 4, 0, 0]}>
                    {filamentChartData.map((entry, i) => (
                      <Cell key={i} fill={stockColor(entry.pct, entry.color)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
              {filamentChartData.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs">
                  <div
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: stockColor(f.pct, f.color) }}
                  />
                  <span className="text-muted-foreground">{f.name}</span>
                  <span className="text-muted-foreground/50">·</span>
                  <span className="tabular-nums text-muted-foreground">{f.pct}%</span>
                  {f.pct <= 10 ? (
                    <span className="ml-0.5 font-semibold text-red-400">⚠ Buy now</span>
                  ) : null}
                  {f.pct > 10 && f.pct <= 30 ? (
                    <span className="ml-0.5 font-medium text-amber-400">Low</span>
                  ) : null}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {activePrints.length > 0 ? (
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Current Prints
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {activePrints.map((p) => {
              const printer = printers.find((d) => d.dev_id === p.device_id);
              const pct = status?.mc_percent ?? p.mc_percent ?? 0;
              const remaining = status?.mc_remaining_time;
              return (
                <Card
                  key={p.id}
                  onClick={() => setSelectedPrint(p)}
                  className="cursor-pointer transition-colors hover:border-primary/40"
                >
                  <CardContent className="space-y-4">
                    <div className="flex gap-3">
                      <CoverImage cover={p.cover} alt={p.title} className="size-16 shrink-0 rounded-lg" />
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p className="truncate text-sm font-semibold leading-tight">{p.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {printer?.name ?? p.device_id ?? "Unknown printer"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Ends at <span className="text-foreground">{estimatedEnd}</span>
                        </p>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Progress</span>
                        <span className="tabular-nums">{pct}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {remaining ? `${remaining} min remaining` : "—"}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ) : null}

      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Printers
        </p>
        {printers.length === 0 ? (
          <EmptyState
            icon={PrinterIcon}
            title="No printers found"
            description="Connect a Bambu Lab account to see your printers here."
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
                      <div className="shrink-0 rounded-xl bg-primary/10 p-2.5">
                        <PrinterIcon className="size-[18px] text-primary" />
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
                        <div className="mb-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Thermometer className="size-2.5" /> Nozzle
                        </div>
                        <p className="text-lg font-bold tabular-nums text-[#FF6D28]">
                          {status.nozzle_temper ?? "—"}°C
                        </p>
                        {status.nozzle_target_temper ? (
                          <p className="text-[10px] text-muted-foreground">
                            Target: {status.nozzle_target_temper}°C
                          </p>
                        ) : null}
                      </div>
                      <div className="rounded-lg border bg-muted/40 p-3">
                        <div className="mb-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Thermometer className="size-2.5" /> Bed
                        </div>
                        <p className="text-lg font-bold tabular-nums text-[#00D0B0]">
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
                      className="w-full cursor-pointer rounded-xl border border-blue-800/40 bg-blue-950/20 p-3 text-left transition-colors hover:border-blue-700/50"
                      onClick={(e) => {
                        e.stopPropagation();
                        const currentPrint =
                          activePrints.find((p) => p.device_id === dev.dev_id) ?? activePrints[0];
                        if (currentPrint) setSelectedPrint(currentPrint);
                      }}
                    >
                      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-blue-400">
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
                    </button>
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
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Loaded Spool
                      </p>
                      <div className="flex items-center gap-3">
                        <SpoolIndicator
                          remaining={activeSpool.remaining_g}
                          total={activeSpool.total_weight_g}
                          color={activeFilament.color_hex}
                          size={52}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{activeFilament.color_name}</p>
                          <p className="text-xs text-muted-foreground">{activeFilament.material}</p>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${spoolPct}%`,
                                backgroundColor: stockColor(spoolPct, activeFilament.color_hex),
                              }}
                            />
                          </div>
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            {Math.round(activeSpool.remaining_g)}g remaining
                          </p>
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
      </div>

      {selectedPrint ? (
        <PrintJobModal print={selectedPrint} onClose={() => setSelectedPrint(null)} />
      ) : null}
      {selectedSpool ? (
        <SpoolModal
          spool={selectedSpool}
          filament={activeFilament}
          onClose={() => setSelectedSpool(null)}
          onActivate={async () => {
            await api.activateSpool(selectedSpool.id);
            setSelectedSpool(null);
          }}
        />
      ) : null}
      {selectedPrinter ? (
        <PrinterModal
          printer={selectedPrinter}
          status={status}
          activeSpool={activeSpool}
          filament={activeFilament}
          firmware={firmware[selectedPrinter.dev_id]}
          onClose={() => setSelectedPrinter(null)}
          onSpoolClick={() => setSelectedSpool(activeSpool)}
        />
      ) : null}
    </div>
  );
}
