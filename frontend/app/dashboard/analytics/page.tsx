"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  XAxis,
  YAxis,
} from "recharts";
import {
  differenceInCalendarDays,
  differenceInMonths,
  eachDayOfInterval,
  eachMonthOfInterval,
  eachYearOfInterval,
  endOfDay,
  endOfMonth,
  endOfYear,
  format,
  startOfDay,
  startOfMonth,
  startOfYear,
  subDays,
  subMonths,
} from "date-fns";
import {
  CalendarDays,
  CheckCircle,
  CircleDollarSign,
  Clock,
  Coins,
  Layers,
  Timer,
  Weight,
} from "lucide-react";

import { api, type Printer } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/StatCard";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  chartColor,
  formatCurrency,
  formatDuration,
  formatWeight,
} from "@/lib/utils";

type Range = "7d" | "30d" | "12m" | "all";
type Metric = "count" | "weight" | "cost";

const RANGE_LABELS: Record<Range, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "12m": "Last 12 months",
  all: "All time",
};

const RANGE_OPTIONS: { value: Range; label: string }[] = [
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "12m", label: "12M" },
  { value: "all", label: "All" },
];

const METRIC_LABELS: Record<Metric, string> = {
  count: "Jobs",
  weight: "Filament",
  cost: "Cost",
};

const MATERIAL_COLORS: Record<string, string> = {
  PLA: "#3b82f6",
  PETG: "#10b981",
  ABS: "#f59e0b",
  ASA: "#8b5cf6",
  TPU: "#ec4899",
  Nylon: "#f97316",
  PC: "#14b8a6",
  Other: "#6b7280",
};

const activityChartConfig = {
  count: { label: "Jobs", color: "var(--chart-1)" },
  weight: { label: "Filament", color: "var(--chart-1)" },
  cost: { label: "Cost", color: "var(--chart-1)" },
} satisfies ChartConfig;

interface Stats {
  total: number;
  completed: number;
  canceled: number;
  running: number;
  successRate: number | null;
  totalTime: number;
  totalWeight: number;
  totalCost: number;
  avgTime: number | null;
  avgCost: number | null;
}

function printDate(print: any): Date | null {
  const raw = print.start_time || print.finished_at;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getRangeStart(range: Range, now: Date): Date | null {
  if (range === "7d") return startOfDay(subDays(now, 6));
  if (range === "30d") return startOfDay(subDays(now, 29));
  // “Last 12 months” is the trailing 365 days (D-01), not calendar months.
  if (range === "12m") return startOfDay(subDays(now, 365));
  return null;
}

function getPreviousBounds(
  range: Range,
  start: Date | null,
  now: Date,
): { start: Date; end: Date } | null {
  if (!start || range === "all") return null;
  // Compare equal-length windows: the previous one ends exactly one window
  // before now, so both cover the same amount of time.
  const windowMs = now.getTime() - start.getTime();
  const end = new Date(now.getTime() - windowMs);
  return { start: new Date(end.getTime() - windowMs), end };
}

function filterPrints(prints: any[], start: Date | null, end: Date) {
  return prints.filter((print) => {
    const date = printDate(print);
    return date !== null && date <= end && (!start || date >= start);
  });
}

function computeStats(prints: any[]): Stats {
  let completed = 0;
  let canceled = 0;
  let running = 0;
  let totalTime = 0;
  let totalWeight = 0;
  let totalCost = 0;
  let timedJobs = 0;
  let costedJobs = 0;

  for (const print of prints) {
    if (print.status === 2) completed += 1;
    else if (print.status === 3) canceled += 1;
    else if (print.status === 4) running += 1;

    if (print.duration_seconds > 0) {
      totalTime += print.duration_seconds;
      timedJobs += 1;
    }
    if (print.weight > 0) {
      totalWeight += print.weight;
    }
    if (typeof print.estimated_cost === "number") {
      totalCost += print.estimated_cost;
      costedJobs += 1;
    }
  }

  const finished = completed + canceled;

  return {
    total: prints.length,
    completed,
    canceled,
    running,
    successRate: finished ? Math.round((completed / finished) * 100) : null,
    totalTime,
    totalWeight,
    totalCost,
    avgTime: timedJobs ? totalTime / timedJobs : null,
    avgCost: costedJobs ? totalCost / costedJobs : null,
  };
}

function trendFor(
  current: number | null | undefined,
  previous: number | null | undefined,
  enabled: boolean,
) {
  if (!enabled || current == null || previous == null || previous <= 0) {
    return undefined;
  }
  const change = Math.round(((current - previous) / previous) * 100);
  if (!Number.isFinite(change)) return undefined;
  return {
    value: `${Math.abs(change)}%`,
    positive: change >= 0,
  };
}

function aggregate(prints: any[], start: Date, end: Date) {
  let count = 0;
  let weight = 0;
  let cost = 0;
  for (const print of prints) {
    const date = printDate(print);
    if (!date || date < start || date > end) continue;
    count += 1;
    weight += print.weight || 0;
    cost += print.estimated_cost || 0;
  }
  return { count, weight, cost };
}

function buildActivityData(range: Range, prints: any[], now: Date) {
  if (range === "7d" || range === "30d") {
    const start = getRangeStart(range, now);
    if (!start) return [];
    return eachDayOfInterval({ start, end: now }).map((date) => ({
      label: format(date, range === "7d" ? "EEE" : "d"),
      ...aggregate(prints, date, endOfDay(date)),
    }));
  }

  if (range === "12m") {
    const start = startOfMonth(subMonths(now, 11));
    return eachMonthOfInterval({ start, end: now }).map((date, index) => ({
      label: format(
        date,
        index === 0 || date.getMonth() === 0 ? "MMM ''yy" : "MMM",
      ),
      ...aggregate(prints, startOfMonth(date), endOfMonth(date)),
    }));
  }

  const dates = prints
    .map(printDate)
    .filter((date): date is Date => date !== null);
  if (dates.length === 0) return [];

  const first = new Date(Math.min(...dates.map((date) => date.getTime())));
  const monthSpan = differenceInMonths(now, first) + 1;

  if (monthSpan <= 24) {
    return eachMonthOfInterval({
      start: startOfMonth(first),
      end: now,
    }).map((date) => ({
      label: format(date, "MMM ''yy"),
      ...aggregate(prints, startOfMonth(date), endOfMonth(date)),
    }));
  }

  return eachYearOfInterval({
    start: startOfYear(first),
    end: now,
  }).map((date) => ({
    label: format(date, "yyyy"),
    ...aggregate(prints, startOfYear(date), endOfYear(date)),
  }));
}

function formatMetricValue(value: number, metric: Metric, axis = false) {
  if (metric === "count") return String(Math.round(value));
  if (metric === "weight") {
    return axis ? `${Math.round(value)}g` : formatWeight(value);
  }
  return axis ? `€${Math.round(value)}` : formatCurrency(value);
}

interface UsageDatum {
  id: string;
  name: string;
  value: number;
  pct: number;
  pctLabel: string;
  color: string;
  cost: number;
}

function UsageBarChart({ data, label }: { data: UsageDatum[]; label: string }) {
  const config = {
    value: { label, color: "var(--chart-1)" },
  } satisfies ChartConfig;

  return (
    <ChartContainer config={config}>
      <BarChart
        accessibilityLayer
        layout="vertical"
        data={data}
        margin={{ left: 0 }}
      >
        <XAxis type="number" dataKey="value" hide />
        <YAxis
          type="category"
          dataKey="name"
          width={112}
          tickLine={false}
          tickMargin={10}
          axisLine={false}
          tickFormatter={(value: string) =>
            value.length > 14 ? `${value.slice(0, 14)}…` : value
          }
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              hideLabel
              formatter={(value) => formatWeight(Number(value))}
            />
          }
        />
        <Bar dataKey="value" fill="var(--color-value)" radius={5}>
          {data.map((entry) => (
            <Cell key={entry.id} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

export default function AnalyticsPage() {
  const [prints, setPrints] = useState<any[]>([]);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [filaments, setFilaments] = useState<any[]>([]);
  const [spools, setSpools] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>("all");
  const [metric, setMetric] = useState<Metric>("count");
  const [printerFilter, setPrinterFilter] = useState("all");
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    try {
      const [jobs, devices, filamentList, spoolList] = await Promise.all([
        api.getAllPrintJobs().catch(() => []),
        api.getPrinters().catch(() => []),
        api.getFilaments().catch(() => []),
        api.getSpools().catch(() => []),
      ]);
      setPrints(jobs);
      setPrinters(devices);
      setFilaments(filamentList);
      setSpools(spoolList);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    function refresh() {
      if (document.visibilityState !== "visible") return;
      setNow(new Date());
      void load();
    }
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  const scopedPrints = useMemo(
    () =>
      printerFilter === "all"
        ? prints
        : prints.filter((print) => print.device_id === printerFilter),
    [prints, printerFilter],
  );

  const printerOptions = useMemo(
    () => [
      { value: "all", label: "All printers" },
      ...printers.map((printer) => ({
        value: printer.serial,
        label: printer.name || printer.serial,
      })),
    ],
    [printers],
  );
  const selectedPrinterLabel =
    printerFilter === "all"
      ? "All printers"
      : (printers.find((printer) => printer.serial === printerFilter)?.name ??
        "Printer");

  const rangeStart = useMemo(() => getRangeStart(range, now), [range, now]);
  const rangePrints = useMemo(
    () => filterPrints(scopedPrints, rangeStart, now),
    [scopedPrints, rangeStart, now],
  );
  const previousBounds = useMemo(
    () => getPreviousBounds(range, rangeStart, now),
    [range, rangeStart, now],
  );
  const previousPrints = useMemo(
    () =>
      previousBounds
        ? filterPrints(scopedPrints, previousBounds.start, previousBounds.end)
        : [],
    [scopedPrints, previousBounds],
  );

  const stats = useMemo(() => computeStats(rangePrints), [rangePrints]);
  const previousStats = useMemo(
    () => (previousBounds ? computeStats(previousPrints) : null),
    [previousBounds, previousPrints],
  );

  const rangeDays = useMemo(() => {
    if (rangeStart) {
      return Math.max(
        1,
        Math.ceil((now.getTime() - rangeStart.getTime()) / 86400000),
      );
    }
    const dates = scopedPrints
      .map(printDate)
      .filter((date): date is Date => date !== null);
    if (dates.length === 0) return 0;
    const first = Math.min(...dates.map((date) => date.getTime()));
    return Math.max(1, Math.ceil((now.getTime() - first) / 86400000));
  }, [now, scopedPrints, rangeStart]);

  const previousDays = previousBounds
    ? Math.max(
        1,
        differenceInCalendarDays(previousBounds.end, previousBounds.start) + 1,
      )
    : 0;

  const printsPerDay = rangeDays ? stats.total / rangeDays : 0;
  const previousPrintsPerDay =
    previousDays && previousStats ? previousStats.total / previousDays : 0;
  const showTrend = range !== "all" && previousStats !== null;

  const activityData = useMemo(
    () => buildActivityData(range, rangePrints, now),
    [range, rangePrints, now],
  );

  const spoolById = useMemo(
    () => new Map(spools.map((spool) => [String(spool.id), spool])),
    [spools],
  );
  const filamentById = useMemo(
    () => new Map(filaments.map((filament) => [String(filament.id), filament])),
    [filaments],
  );

  const materialData = useMemo(() => {
    const usage = new Map<string, { weight: number; cost: number }>();

    for (const print of rangePrints) {
      if (!print.weight) continue;
      const spool = print.spool_id
        ? spoolById.get(String(print.spool_id))
        : null;
      const filament = spool
        ? filamentById.get(String(spool.filament_id))
        : null;
      const material = filament?.material ?? "Unassigned";
      const entry = usage.get(material) ?? { weight: 0, cost: 0 };
      entry.weight += print.weight;
      entry.cost += print.estimated_cost || 0;
      usage.set(material, entry);
    }

    const total = Array.from(usage.values()).reduce(
      (sum, entry) => sum + entry.weight,
      0,
    );

    return Array.from(usage.entries())
      .map(([name, entry]) => {
        const pct = total ? Math.round((entry.weight / total) * 100) : 0;
        return {
          id: name,
          name,
          value: Math.round(entry.weight),
          cost: entry.cost,
          color: MATERIAL_COLORS[name] ?? MATERIAL_COLORS.Other,
          pct,
          pctLabel: pct === 0 && entry.weight > 0 ? "<1%" : `${pct}%`,
        };
      })
      .sort((a, b) => b.value - a.value);
  }, [rangePrints, spoolById, filamentById]);

  const filamentData = useMemo(() => {
    const usage = new Map<
      string,
      { id: string; name: string; color: string; weight: number; cost: number }
    >();

    for (const print of rangePrints) {
      if (!print.weight) continue;
      const spool = print.spool_id
        ? spoolById.get(String(print.spool_id))
        : null;
      const filament = spool
        ? filamentById.get(String(spool.filament_id))
        : null;
      const key = filament ? String(filament.id) : "unassigned";
      const entry = usage.get(key) ?? {
        id: key,
        name: filament
          ? `${filament.brand} · ${filament.color_name}`
          : "Unassigned",
        color: filament?.color_hex
          ? chartColor(filament.color_hex)
          : MATERIAL_COLORS.Other,
        weight: 0,
        cost: 0,
      };
      entry.weight += print.weight;
      entry.cost += print.estimated_cost || 0;
      usage.set(key, entry);
    }

    const sorted = Array.from(usage.values()).sort(
      (a, b) => b.weight - a.weight,
    );
    const total = sorted.reduce((sum, entry) => sum + entry.weight, 0);
    const visible = sorted.slice(0, 8);

    if (sorted.length > 8) {
      const rest = sorted.slice(8);
      visible.push({
        id: "other",
        name: "Other",
        color: MATERIAL_COLORS.Other,
        weight: rest.reduce((sum, entry) => sum + entry.weight, 0),
        cost: rest.reduce((sum, entry) => sum + entry.cost, 0),
      });
    }

    return visible.map((entry) => {
      const pct = total ? Math.round((entry.weight / total) * 100) : 0;
      return {
        ...entry,
        value: Math.round(entry.weight),
        pct,
        pctLabel: pct === 0 && entry.weight > 0 ? "<1%" : `${pct}%`,
      };
    });
  }, [rangePrints, spoolById, filamentById]);

  const activityTotal = activityData.reduce(
    (sum, entry) => sum + entry[metric],
    0,
  );
  const materialWeight = materialData.reduce(
    (sum, entry) => sum + entry.value,
    0,
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-32" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-[320px] rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-bold">Analytics</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {RANGE_LABELS[range]} · {selectedPrinterLabel} · {stats.total} jobs
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={printerFilter}
            onValueChange={(value) => setPrinterFilter(value ?? "all")}
            items={printerOptions}
          >
            <SelectTrigger
              size="sm"
              className="min-w-[180px]"
              aria-label="Filter by printer"
            >
              <SelectValue placeholder="All printers" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">All printers</SelectItem>
                {printers.map((printer) => (
                  <SelectItem key={printer.serial} value={printer.serial}>
                    {printer.name || printer.serial}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <ToggleGroup
            value={[range]}
            onValueChange={(value) => {
              if (value[0]) setRange(value[0] as Range);
            }}
            variant="outline"
            size="sm"
            spacing={0}
            aria-label="Analytics range"
          >
            {RANGE_OPTIONS.map((option) => (
              <ToggleGroupItem key={option.value} value={option.value}>
                {option.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          title="Total Jobs"
          value={stats.total}
          icon={Layers}
          iconColor="text-blue-500"
          iconBg="bg-blue-500/10"
          subtitle={`${stats.completed} completed · ${stats.canceled} canceled`}
          trend={trendFor(stats.total, previousStats?.total, showTrend)}
        />
        <StatCard
          title="Success Rate"
          value={stats.successRate == null ? "—" : `${stats.successRate}%`}
          icon={CheckCircle}
          iconColor="text-emerald-500"
          iconBg="bg-emerald-500/10"
          subtitle={`${stats.completed + stats.canceled} finished jobs`}
          trend={trendFor(
            stats.successRate,
            previousStats?.successRate,
            showTrend,
          )}
        />
        <StatCard
          title="Print Time"
          value={formatDuration(stats.totalTime)}
          icon={Clock}
          iconColor="text-violet-500"
          iconBg="bg-violet-500/10"
          subtitle={`Across ${stats.total} jobs`}
          trend={trendFor(stats.totalTime, previousStats?.totalTime, showTrend)}
        />
        <StatCard
          title="Filament Used"
          value={formatWeight(stats.totalWeight)}
          icon={Weight}
          iconColor="text-amber-500"
          iconBg="bg-amber-500/10"
          subtitle={`${materialData.length} materials`}
          trend={trendFor(
            stats.totalWeight,
            previousStats?.totalWeight,
            showTrend,
          )}
        />
        <StatCard
          title="Money Spent"
          value={formatCurrency(stats.totalCost)}
          icon={CircleDollarSign}
          iconColor="text-rose-500"
          iconBg="bg-rose-500/10"
          subtitle={`Across ${stats.total} jobs`}
        />
        <StatCard
          title="Prints per Day"
          value={printsPerDay.toFixed(1)}
          icon={CalendarDays}
          iconColor="text-sky-500"
          iconBg="bg-sky-500/10"
          subtitle={`${rangeDays} days`}
          trend={trendFor(printsPerDay, previousPrintsPerDay, showTrend)}
        />
        <StatCard
          title="Avg Print Time"
          value={formatDuration(stats.avgTime)}
          icon={Timer}
          iconColor="text-cyan-500"
          iconBg="bg-cyan-500/10"
          subtitle="Per timed job"
        />
        <StatCard
          title="Avg Cost"
          value={formatCurrency(stats.avgCost)}
          icon={Coins}
          iconColor="text-orange-500"
          iconBg="bg-orange-500/10"
          subtitle="Per print job"
        />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Print Activity</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {RANGE_LABELS[range]} · {formatMetricValue(activityTotal, metric)}
            </p>
          </div>
          <ToggleGroup
            value={[metric]}
            onValueChange={(value) => {
              if (value[0]) setMetric(value[0] as Metric);
            }}
            variant="outline"
            size="sm"
            spacing={0}
            aria-label="Activity metric"
          >
            {(["count", "weight", "cost"] as Metric[]).map((value) => (
              <ToggleGroupItem key={value} value={value}>
                {METRIC_LABELS[value]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </CardHeader>
        <CardContent>
          {rangePrints.length === 0 ? (
            <p className="py-14 text-center text-sm text-muted-foreground">
              No print jobs in this range.
            </p>
          ) : (
            <ChartContainer
              config={activityChartConfig}
              className="h-[220px] w-full"
            >
              <AreaChart
                accessibilityLayer
                data={activityData}
                margin={{ top: 8, right: 20, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient
                    id={`activity-fill-${metric}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor={`var(--color-${metric})`}
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="95%"
                      stopColor={`var(--color-${metric})`}
                      stopOpacity={0.1}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  interval={
                    range === "30d"
                      ? 4
                      : activityData.length > 8
                        ? 2
                        : 0
                  }
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={metric !== "count"}
                  tickFormatter={(value) =>
                    formatMetricValue(Number(value), metric, true)
                  }
                />
                <ChartTooltip
                  cursor={false}
                  content={
                    <ChartTooltipContent
                      indicator="line"
                      formatter={(value) =>
                        formatMetricValue(Number(value), metric)
                      }
                    />
                  }
                />
                <Area
                  dataKey={metric}
                  name={METRIC_LABELS[metric]}
                  type="natural"
                  stroke={`var(--color-${metric})`}
                  strokeWidth={2}
                  fill={`url(#activity-fill-${metric})`}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Filament Usage by Material</CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatWeight(materialWeight)} across {materialData.length}{" "}
                materials
              </p>
            </div>
          </CardHeader>
          <CardContent>
            {materialData.length === 0 ? (
              <p className="py-14 text-center text-sm text-muted-foreground">
                No spool-linked print data in this range.
              </p>
            ) : (
              <UsageBarChart data={materialData} label="Used" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Top Filaments</CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                By filament used in this range
              </p>
            </div>
          </CardHeader>
          <CardContent>
            {filamentData.length === 0 ? (
              <p className="py-14 text-center text-sm text-muted-foreground">
                No spool-linked print data in this range.
              </p>
            ) : (
              <UsageBarChart data={filamentData} label="Used" />
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
