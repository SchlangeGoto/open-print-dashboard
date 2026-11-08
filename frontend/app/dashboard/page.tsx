"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart, Bar, XAxis, YAxis, Cell } from "recharts";
import { Printer as PrinterIcon, Thermometer } from "lucide-react";

import { api, type Printer } from "@/lib/api";
import {
  chartColor,
  formatEstimatedEnd,
  formatWeight,
  isPrintingStatus,
} from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { CoverImage } from "@/components/ui/CoverImage";
import { EmptyState } from "@/components/ui/EmptyState";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { SpoolIndicator } from "@/components/ui/SpoolIndicator";
import PrintJobModal from "@/components/modals/PrintJobModal";
import PrinterModal from "@/components/modals/PrinterModal";
import SpoolModal from "@/components/modals/SpoolModal";

const filamentChartConfig = {
  remaining: { label: "Remaining", color: "var(--chart-1)" },
} satisfies ChartConfig;

export default function DashboardPage() {
  const router = useRouter();
  const [prints, setPrints] = useState<any[]>([]);
  const [filaments, setFilaments] = useState<any[]>([]);
  const [spools, setSpools] = useState<any[]>([]);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [firmware, setFirmware] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [selectedPrint, setSelectedPrint] = useState<any>(null);
  const [selectedSpool, setSelectedSpool] = useState<any>(null);
  const [selectedPrinter, setSelectedPrinter] = useState<Printer | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [devs, pr, fil, sp] = await Promise.all([
          api.getPrinters().catch(() => []),
          api.getPrintJobs().catch(() => []),
          api.getFilaments().catch(() => []),
          api.getSpools().catch(() => []),
        ]);
        setPrinters(devs);
        setPrints(pr);
        setFilaments(fil);
        setSpools(sp);

        const fwMap: Record<string, any> = {};
        await Promise.all(
          devs
            .filter((printer) => printer.configured)
            .map(async (printer) => {
              const fw = await api.getFirmware(printer.serial).catch(() => null);
              if (fw) fwMap[printer.serial] = fw;
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
  const statusByDev = Object.fromEntries(
    printers.map((printer) => [printer.serial, printer.status]),
  );
  const selectedLoadedSpool = selectedPrinter?.id
    ? spools.find((spool) => spool.printer_id === selectedPrinter.id)
    : null;
  const selectedLoadedFilament = selectedLoadedSpool
    ? filaments.find(
        (filament) => filament.id === selectedLoadedSpool.filament_id,
      )
    : null;

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
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-56 rounded-xl" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
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
            <ChartContainer
              config={filamentChartConfig}
              className="h-[200px] w-full"
            >
              <BarChart
                accessibilityLayer
                data={filamentChartData}
                barSize={36}
                margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
              >
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `${value}g`}
                />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      formatter={(value, _name, item) => {
                        const pct = (item.payload as { pct?: number } | undefined)
                          ?.pct;
                        return `${value}g${pct != null ? ` (${pct}%)` : ""}`;
                      }}
                    />
                  }
                />
                <Bar
                  dataKey="remaining"
                  name="Remaining"
                  radius={[4, 4, 0, 0]}
                  isAnimationActive={false}
                >
                  {filamentChartData.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={chartColor(entry.color)}
                      stroke="var(--border)"
                      strokeWidth={1}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>

            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
              {filamentChartData.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs">
                  <div
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: chartColor(f.color) }}
                  />
                  <span className="text-muted-foreground">{f.name}</span>
                  <span className="text-muted-foreground/50">·</span>
                  <span className="tabular-nums text-muted-foreground">{f.pct}%</span>
                  {f.pct <= 10 ? (
                    <span className="ml-0.5 font-semibold text-red-600 dark:text-red-400">
                      ⚠ Buy now
                    </span>
                  ) : null}
                  {f.pct > 10 && f.pct <= 30 ? (
                    <span className="ml-0.5 font-medium text-amber-600 dark:text-amber-500">
                      Low
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {activePrints.length > 0 ? (
        <div>
          <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <span className="h-3 w-0.5 rounded-full bg-primary" />
            Current Prints
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {activePrints.map((p) => {
              const printer = printers.find((d) => d.serial === p.device_id);
              const deviceStatus = statusByDev[p.device_id] ?? null;
              const pct = deviceStatus?.mc_percent ?? p.mc_percent ?? 0;
              const remaining =
                deviceStatus?.mc_remaining_time ?? p.mc_remaining_time;
              return (
                <Card
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedPrint(p)}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedPrint(p);
                    }
                  }}
                  className="cursor-pointer transition-colors hover:ring-primary/40 focus-visible:ring-2 focus-visible:ring-ring/50"
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
                          Ends at{" "}
                          <span className="text-foreground">
                            {formatEstimatedEnd(remaining)}
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Progress</span>
                        <span className="tabular-nums">{pct}%</span>
                      </div>
                      <Progress
                        value={pct}
                        className="[&_[data-slot=progress-track]]:h-2"
                      />
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
        <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <span className="h-3 w-0.5 rounded-full bg-primary" />
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
            {printers.map((dev) => {
              const deviceStatus = statusByDev[dev.serial] ?? null;
              const printing = isPrintingStatus(deviceStatus);
              const printerPrint =
                activePrints.find((p) => p.device_id === dev.serial) ?? null;
              const remaining =
                deviceStatus?.mc_remaining_time ?? printerPrint?.mc_remaining_time;
              const loadedSpool = dev.id
                ? spools.find((spool) => spool.printer_id === dev.id)
                : null;
              const loadedFilament = loadedSpool
                ? filaments.find(
                    (filament) => filament.id === loadedSpool.filament_id,
                  )
                : null;
              const loadedPct =
                loadedSpool && loadedSpool.total_weight_g > 0
                  ? Math.round(
                      (loadedSpool.remaining_g / loadedSpool.total_weight_g) *
                        100,
                    )
                  : 0;

              return (
                <Card
                  key={dev.serial}
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
                        <div className="shrink-0 rounded-xl bg-primary/10 p-2.5">
                          <PrinterIcon className="size-[18px] text-primary" />
                        </div>
                        <div>
                          <p className="font-semibold">{dev.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {dev.model ?? dev.serial}
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
                          <div className="mb-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Thermometer className="size-2.5" /> Nozzle
                          </div>
                          <p className="text-lg font-bold tabular-nums ">
                            {deviceStatus.nozzle_temper ?? "—"}°C
                          </p>
                          {deviceStatus.nozzle_target_temper ? (
                            <p className="text-[10px] text-muted-foreground">
                              Target: {deviceStatus.nozzle_target_temper}°C
                            </p>
                          ) : null}
                        </div>
                        <div className="rounded-lg border bg-muted/40 p-3">
                          <div className="mb-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Thermometer className="size-2.5" /> Bed
                          </div>
                          <p className="text-lg font-bold tabular-nums ">
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

                    {printing || printerPrint ? (
                      <button
                        type="button"
                        className="w-full cursor-pointer rounded-xl border border-primary/30 bg-primary/10 p-3 text-left transition-colors hover:border-primary/50"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (printerPrint) {
                            setSelectedPrint(printerPrint);
                          } else {
                            setSelectedPrinter(dev);
                          }
                        }}
                      >
                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                          Currently Printing
                        </p>
                        <p className="truncate text-sm font-medium">
                          {deviceStatus?.subtask_name ?? printerPrint?.title ?? "Unknown"}
                        </p>
                        <Progress
                          value={
                            deviceStatus?.mc_percent ??
                            printerPrint?.mc_percent ??
                            0
                          }
                          className="mt-2 [&_[data-slot=progress-track]]:h-1.5"
                        />
                        <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                          <span className="tabular-nums">
                            {deviceStatus?.mc_percent ?? printerPrint?.mc_percent ?? 0}%
                          </span>
                          <span>
                            {remaining ? `${remaining} min left` : ""}
                          </span>
                        </div>
                      </button>
                    ) : null}

                    {loadedSpool && loadedFilament ? (
                      <button
                        type="button"
                        className="w-full cursor-pointer rounded-xl border bg-muted/30 p-3 text-left transition-colors hover:border-primary/40"
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
                              {loadedFilament.brand} ·{" "}
                              {loadedFilament.material} ·{" "}
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

                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {selectedPrint ? (
        <PrintJobModal print={selectedPrint} onClose={() => setSelectedPrint(null)} />
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
      {selectedPrinter ? (
        <PrinterModal
          printer={selectedPrinter}
          status={statusByDev[selectedPrinter.serial]}
          activePrint={
            activePrints.find((p) => p.device_id === selectedPrinter.serial) ??
            null
          }
          loadedSpool={selectedLoadedSpool}
          loadedFilament={selectedLoadedFilament}
          firmware={firmware[selectedPrinter.serial]}
          onClose={() => setSelectedPrinter(null)}
          onSettings={() => router.push("/dashboard/printers")}
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
    </div>
  );
}
