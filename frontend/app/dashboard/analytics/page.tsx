"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  XAxis,
  YAxis,
} from "recharts";
import {
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
  Printer as PrinterIcon,
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
import { Progress } from "@/components/ui/progress";
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
  if (range === "12m") return startOfMonth(subMonths(now, 11));
  return null;
}

function getPreviousBounds(
  range: Range,
  start: Date | null,
): { start: Date; end: Date } | null {
  if (!start || range === "all") return null;
  const end = endOfDay(subDays(start, 1));
  if (range === "12m") {
    return { start: startOfMonth(subMonths(start, 12)), end };
  }
  const days = range === "7d" ? 7 : 30;
  return { start: startOfDay(subDays(start, days)), end };
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
    <ChartContainer
      config={config}
      className="w-full"
      style={{ height: Math.max(180, data.length * 42) }}
    >
      <BarChart
        accessibilityLayer
        layout="vertical"
        data={data}
        margin={{ top: 4, right: 48, left: 0, bottom: 0 }}
      >
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="name"
          width={112}
          tickLine={false}
          axisLine={false}
          tickMargin={4}
          tickFormatter={(value: string) =>
            value.length > 15 ? `${value.slice(0, 14)}…` : value
          }
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const item = payload?.[0]?.payload as
                  | { name?: string }
                  | undefined;
                return item?.name ?? "";
              }}
              formatter={(value, _name, item) => {
                const payload = item.payload as
                  | { pct?: number; cost?: number }
                  | undefined;
                const parts = [formatWeight(Number(value))];
                if (payload?.pct != null) parts.push(`${payload.pct}%`);
                if (payload?.cost) parts.push(formatCurrency(payload.cost));
                return parts.join(" · ");
              }}
            />
          }
        />
        <Bar dataKey="value" name={label} radius={5}>
          {data.map((entry) => (
            <Cell
              key={entry.name}
              fill={entry.color}
              stroke="var(--border)"
              strokeWidth={1}
            />
          ))}
          <LabelList
            dataKey="pctLabel"
            position="right"
            className="fill-muted-foreground"
            fontSize={11}
          />
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
  const [now] = useState(() => new Date());

  useEffect(() => {
    async function load() {
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
    }
    load();
  }, []);

  const rangeStart = useMemo(() => getRangeStart(range, now), [range, now]);
  const rangePrints = useMemo(
    () => filterPrints(prints, rangeStart, now),
    [prints, rangeStart, now],
  );
  const previousBounds = useMemo(
    () => getPreviousBounds(range, rangeStart),
    [range, rangeStart],
  );
  const previousPrints = useMemo(
    () =>
      previousBounds
        ? filterPrints(prints, previousBounds.start, previousBounds.end)
        : [],
    [prints, previousBounds],
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
    const dates = prints
      .map(printDate)
      .filter((date): date is Date => date !== null);
    if (dates.length === 0) return 0;
    const first = Math.min(...dates.map((date) => date.getTime()));
    return Math.max(1, Math.ceil((now.getTime() - first) / 86400000));
  }, [now, prints, rangeStart]);

  const previousDays = previousBounds
    ? Math.max(
        1,
        Math.ceil(
          (previousBounds.end.getTime() - previousBounds.start.getTime()) /
            86400000,
        ),
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
      if (!print.weight || !print.spool_id) continue;
      const spool = spoolById.get(String(print.spool_id));
      const filament = spool
        ? filamentById.get(String(spool.filament_id))
        : null;
      const material = filament?.material ?? "Other";
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
      { name: string; color: string; weight: number; cost: number }
    >();

    for (const print of rangePrints) {
      if (!print.weight || !print.spool_id) continue;
      const spool = spoolById.get(String(print.spool_id));
      const filament = spool
        ? filamentById.get(String(spool.filament_id))
        : null;
      const key = filament ? String(filament.id) : "unknown";
      const entry = usage.get(key) ?? {
        name: filament?.color_name ?? "Unknown filament",
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

  const printerData = useMemo(() => {
    const printerBySerial = new Map(
      printers.map((printer) => [printer.serial, printer]),
    );
    const usage = new Map<
      string,
      {
        serial: string;
        name: string;
        count: number;
        weight: number;
        cost: number;
        time: number;
        completed: number;
        canceled: number;
      }
    >();

    for (const print of rangePrints) {
      const serial = print.device_id || "unknown";
      const printer = printerBySerial.get(serial);
      const entry = usage.get(serial) ?? {
        serial,
        name:
          printer?.name ??
          (serial === "unknown" ? "Unknown printer" : serial),
        count: 0,
        weight: 0,
        cost: 0,
        time: 0,
        completed: 0,
        canceled: 0,
      };
      entry.count += 1;
      entry.weight += print.weight || 0;
      entry.cost += print.estimated_cost || 0;
      entry.time += print.duration_seconds || 0;
      if (print.status === 2) entry.completed += 1;
      if (print.status === 3) entry.canceled += 1;
      usage.set(serial, entry);
    }

    return Array.from(usage.values())
      .map((entry) => {
        const finished = entry.completed + entry.canceled;
        return {
          ...entry,
          successRate: finished
            ? Math.round((entry.completed / finished) * 100)
            : null,
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [rangePrints, printers]);

  const maxPrinterJobs = Math.max(
    1,
    ...printerData.map((printer) => printer.count),
  );

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
            {RANGE_LABELS[range]} · {stats.total} jobs
          </p>
        </div>
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

      <Card>
        <CardHeader>
          <CardTitle>Printer Breakdown</CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {printerData.length} printers · {RANGE_LABELS[range]}
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {printerData.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No printer data in this range.
            </p>
          ) : (
            printerData.map((printer) => (
              <div key={printer.serial} className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <PrinterIcon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm font-medium">
                      {printer.name}
                    </span>
                  </div>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {printer.count} jobs
                  </span>
                </div>
                <Progress
                  value={(printer.count / maxPrinterJobs) * 100}
                  className="[&_[data-slot=progress-track]]:h-1.5"
                />
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{formatWeight(printer.weight)}</span>
                  <span>{formatDuration(printer.time)}</span>
                  <span>{formatCurrency(printer.cost)}</span>
                  <span>
                    {printer.successRate == null
                      ? "No finished jobs"
                      : `${printer.successRate}% success`}
                  </span>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
