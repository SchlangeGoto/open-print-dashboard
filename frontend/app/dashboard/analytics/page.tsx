"use client";

import { useEffect, useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
} from "recharts";
import { format, subDays, subMonths, eachDayOfInterval, startOfDay } from "date-fns";
import {
  CalendarDays,
  CheckCircle,
  CircleDollarSign,
  Clock,
  Layers,
  Weight,
} from "lucide-react";

import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/ui/StatCard";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatCurrency, formatDuration, formatWeight } from "@/lib/utils";

type Period = "weekly" | "monthly" | "yearly";

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
  count: { label: "Prints", color: "var(--chart-1)" },
} satisfies ChartConfig;

const materialChartConfig = {
  value: { label: "Used", color: "var(--chart-1)" },
} satisfies ChartConfig;

export default function AnalyticsPage() {
  const [prints, setPrints] = useState<any[]>([]);
  const [filaments, setFilaments] = useState<any[]>([]);
  const [spools, setSpools] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>("weekly");
  const [avgPrintsPerDay, setAvgPrintsPerDay] = useState("0");

  useEffect(() => {
    async function load() {
      try {
        const [pr, fil, sp] = await Promise.all([
          api.getPrintJobs().catch(() => []),
          api.getFilaments().catch(() => []),
          api.getSpools().catch(() => []),
        ]);
        setPrints(pr);
        setFilaments(fil);
        setSpools(sp);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (prints.length === 0) {
      setAvgPrintsPerDay("0");
      return;
    }
    const timestamps = prints
      .map((p) => new Date(p.start_time || p.finished_at || 0).getTime())
      .filter((t) => t > 0);
    if (timestamps.length === 0) {
      setAvgPrintsPerDay("0");
      return;
    }
    const firstDate = Math.min(...timestamps);
    const days = Math.max(
      1,
      Math.ceil((Date.now() - firstDate) / (1000 * 60 * 60 * 24)),
    );
    setAvgPrintsPerDay((prints.length / days).toFixed(1));
  }, [prints]);

  const totalPrints = prints.length;
  const completedPrints = prints.filter((p) => p.status === 2).length;
  const canceledPrints = prints.filter((p) => p.status === 3).length;
  const successRate =
    completedPrints + canceledPrints > 0
      ? Math.round((completedPrints / (completedPrints + canceledPrints)) * 100)
      : 0;
  const totalTime = prints.reduce((s, p) => s + (p.duration_seconds || 0), 0);
  const totalWeight = prints.reduce((s, p) => s + (p.weight || 0), 0);
  const totalCost = prints.reduce((s, p) => s + (p.estimated_cost || 0), 0);

  const activityData = useMemo(() => {
    const now = new Date();
    let intervals: Date[];
    let labelFormat: string;

    if (period === "weekly") {
      intervals = eachDayOfInterval({ start: subDays(now, 6), end: now });
      labelFormat = "EEE";
    } else if (period === "monthly") {
      intervals = eachDayOfInterval({ start: subDays(now, 29), end: now });
      labelFormat = "d";
    } else {
      intervals = Array.from({ length: 12 }, (_, i) => subMonths(now, 11 - i));
      labelFormat = "MMM";
    }

    return intervals.map((date) => {
      const start = startOfDay(date);
      const end =
        period === "yearly"
          ? new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59)
          : new Date(start.getTime() + 86400000 - 1);
      const count = prints.filter((p) => {
        const d = new Date(p.start_time || p.finished_at || 0);
        return d >= start && d <= end;
      }).length;
      return { label: format(date, labelFormat), count };
    });
  }, [prints, period]);

  const materialData = useMemo(() => {
    const map: Record<string, number> = {};
    prints.forEach((p) => {
      if (!p.weight || !p.spool_id) return;
      const spool = spools.find((s) => s.id === p.spool_id);
      if (!spool) return;
      const fil = filaments.find((f) => f.id === spool.filament_id);
      const material = fil?.material ?? "Other";
      map[material] = (map[material] || 0) + p.weight;
    });
    return Object.entries(map).map(([name, value]) => ({
      name,
      value: Math.round(value),
      color: MATERIAL_COLORS[name] ?? "#6b7280",
    }));
  }, [prints, spools, filaments]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-32" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-xl font-bold">Analytics</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          All-time statistics and trends
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard title="Total Jobs" value={totalPrints} icon={Layers} iconColor="text-blue-500" iconBg="bg-blue-500/10" />
        <StatCard title="Success Rate" value={`${successRate}%`} icon={CheckCircle} iconColor="text-emerald-500" iconBg="bg-emerald-500/10" />
        <StatCard title="Print Time" value={formatDuration(totalTime)} icon={Clock} iconColor="text-violet-500" iconBg="bg-violet-500/10" />
        <StatCard title="Filament Used" value={formatWeight(totalWeight)} icon={Weight} iconColor="text-amber-500" iconBg="bg-amber-500/10" />
        <StatCard title="Money Spent" value={formatCurrency(totalCost)} icon={CircleDollarSign} iconColor="text-rose-500" iconBg="bg-rose-500/10" />
        <StatCard title="Prints per Day" value={avgPrintsPerDay} icon={CalendarDays} iconColor="text-sky-500" iconBg="bg-sky-500/10" />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Print Activity</CardTitle>
          <ToggleGroup
            value={[period]}
            onValueChange={(value) => {
              if (value[0]) setPeriod(value[0] as Period);
            }}
            variant="outline"
            size="sm"
            spacing={0}
          >
            {(["weekly", "monthly", "yearly"] as Period[]).map((p) => (
              <ToggleGroupItem key={p} value={p}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </CardHeader>
        <CardContent>
          <ChartContainer config={activityChartConfig} className="h-[200px] w-full">
            <BarChart
              accessibilityLayer
              data={activityData}
              barSize={period === "monthly" ? 8 : 24}
              margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
            >
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                interval={period === "monthly" ? 4 : 0}
              />
              <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
              <CartesianGrid vertical={false} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
              <Bar
                dataKey="count"
                fill="var(--color-count)"
                radius={[3, 3, 0, 0]}
                name="Prints"
              />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {materialData.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Filament Usage by Material</CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={materialChartConfig} className="h-[200px] w-full">
              <BarChart
                accessibilityLayer
                data={materialData}
                barSize={36}
                margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
              >
                <XAxis dataKey="name" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `${value}g`}
                />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent />}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]} name="Used (g)">
                  {materialData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
