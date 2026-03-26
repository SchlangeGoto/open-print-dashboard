"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatDuration, formatWeight, formatCurrency, getStatusLabel, getStatusColor } from "@/lib/utils";
import { StatCard } from "@/components/ui/StatCard";
import { Card, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import {
  Printer,
  Clock,
  Weight,
  Package,
  CircleDollarSign,
  Activity,
  Layers,
  Thermometer,
  Wifi,
  WifiOff,
} from "lucide-react";

export default function DashboardPage() {
  const [status, setStatus] = useState<any>(null);
  const [prints, setPrints] = useState<any[]>([]);
  const [filaments, setFilaments] = useState<any[]>([]);
  const [spools, setSpools] = useState<any[]>([]);
  const [activeSpool, setActiveSpool] = useState<any>(null);
  const [printers, setPrinters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
        setPrints(pr);
        setFilaments(fil);
        setSpools(sp);
        setActiveSpool(act);
        setPrinters(devs);
      } finally {
        setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, []);

  // Derived stats
  const totalPrints = prints.length;
  const totalWeightUsed = prints.reduce((sum, p) => sum + (p.weight || 0), 0);
  const totalPrintTime = prints.reduce((sum, p) => sum + (p.duration_seconds || 0), 0);
  const totalCost = prints.reduce((sum, p) => sum + (p.estimated_cost || 0), 0);
  const totalSpoolsCount = spools.length;
  const activeSpoolsCount = spools.filter((s) => s.active).length;
  const totalRemainingG = spools.reduce((sum, s) => sum + (s.remaining_g || 0), 0);

  const currentPrint = status?.gcode_state === "RUNNING" ? status : null;
  const isConnected = status && status.status !== "no_data";

  const recentPrints = prints.slice(0, 5);

  // Active filament info
  const activeFilament = activeSpool
    ? filaments.find((f) => f.id === activeSpool.filament_id)
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-zinc-500">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted mt-1">Overview of your 3D printing activity</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Prints"
          value={totalPrints}
          icon={Layers}
          iconColor="text-blue-400"
        />
        <StatCard
          title="Filament Used"
          value={formatWeight(totalWeightUsed)}
          subtitle={`${totalSpoolsCount} spools in inventory`}
          icon={Weight}
          iconColor="text-green-400"
        />
        <StatCard
          title="Print Time"
          value={formatDuration(totalPrintTime)}
          icon={Clock}
          iconColor="text-purple-400"
        />
        <StatCard
          title="Est. Total Cost"
          value={formatCurrency(totalCost)}
          icon={CircleDollarSign}
          iconColor="text-yellow-400"
        />
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Printer Status */}
        <Card className="lg:col-span-2">
          <CardTitle>Printer Status</CardTitle>

          {isConnected ? (
            <div className="mt-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wifi size={16} className="text-green-400" />
                  <span className="text-sm text-green-400">Connected</span>
                </div>
                <Badge
                  variant={
                    status.gcode_state === "RUNNING"
                      ? "info"
                      : status.gcode_state === "IDLE"
                        ? "default"
                        : status.gcode_state === "FINISH"
                          ? "success"
                          : "warning"
                  }
                >
                  {status.gcode_state || "Unknown"}
                </Badge>
              </div>

              {/* Current Print Info */}
              {currentPrint && (
                <div className="rounded-lg border border-blue-800 bg-blue-900/20 p-4">
                  <p className="text-sm font-medium mb-2">
                    ️ {status.subtask_name || "Printing..."}
                  </p>
                  <div className="w-full bg-zinc-800 rounded-full h-3 mb-2">
                    <div
                      className="bg-accent h-3 rounded-full transition-all duration-500"
                      style={{ width: `${status.mc_percent || 0}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted">
                    <span>{status.mc_percent || 0}% complete</span>
                    <span>{status.mc_remaining_time ? `${status.mc_remaining_time}min left` : ""}</span>
                  </div>
                </div>
              )}

              {/* Temps */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-zinc-800/50 p-3">
                  <div className="flex items-center gap-2 text-xs text-muted mb-1">
                    <Thermometer size={12} /> Nozzle
                  </div>
                  <p className="text-lg font-semibold">
                    {status.nozzle_temper != null ? `${status.nozzle_temper}°C` : "—"}
                    {status.nozzle_target_temper ? (
                      <span className="text-xs text-muted ml-1">/ {status.nozzle_target_temper}°C</span>
                    ) : null}
                  </p>
                </div>
                <div className="rounded-lg bg-zinc-800/50 p-3">
                  <div className="flex items-center gap-2 text-xs text-muted mb-1">
                    <Thermometer size={12} /> Bed
                  </div>
                  <p className="text-lg font-semibold">
                    {status.bed_temper != null ? `${status.bed_temper}°C` : "—"}
                    {status.bed_target_temper ? (
                      <span className="text-xs text-muted ml-1">/ {status.bed_target_temper}°C</span>
                    ) : null}
                  </p>
                </div>
              </div>

              {/* Fan & Speed */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-lg bg-zinc-800/50 p-3">
                  <p className="text-xs text-muted">Speed</p>
                  <p className="text-sm font-semibold mt-1">
                    {status.spd_lvl != null ? `Lvl ${status.spd_lvl}` : "—"}
                  </p>
                </div>
                <div className="rounded-lg bg-zinc-800/50 p-3">
                  <p className="text-xs text-muted">Layer</p>
                  <p className="text-sm font-semibold mt-1">
                    {status.layer_num ?? "—"} / {status.total_layer_num ?? "—"}
                  </p>
                </div>
                <div className="rounded-lg bg-zinc-800/50 p-3">
                  <p className="text-xs text-muted">Fan</p>
                  <p className="text-sm font-semibold mt-1">
                    {status.cooling_fan_speed != null
                      ? `${Math.round((status.cooling_fan_speed / 15) * 100)}%`
                      : "—"}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4 flex items-center gap-3 text-zinc-500">
              <WifiOff size={20} />
              <span>Printer not connected or no data received yet</span>
            </div>
          )}
        </Card>

        {/* Active Filament + Quick Info */}
        <div className="space-y-4">
          <Card>
            <CardTitle>Loaded Filament</CardTitle>
            {activeSpool && activeFilament ? (
              <div className="mt-3 space-y-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-full border-2 border-zinc-600"
                    style={{ backgroundColor: activeFilament.color_hex }}
                  />
                  <div>
                    <p className="font-medium">{activeFilament.color_name}</p>
                    <p className="text-xs text-muted">
                      {activeFilament.brand} — {activeFilament.material}
                    </p>
                  </div>
                </div>
                <div className="w-full bg-zinc-800 rounded-full h-2">
                  <div
                    className="h-2 rounded-full transition-all"
                    style={{
                      width: `${Math.round(
                        (activeSpool.remaining_g / activeSpool.total_weight_g) * 100,
                      )}%`,
                      backgroundColor: activeFilament.color_hex,
                    }}
                  />
                </div>
                <p className="text-xs text-muted">
                  {Math.round(activeSpool.remaining_g)}g / {activeSpool.total_weight_g}g remaining
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted">No active spool set</p>
            )}
          </Card>

          <Card>
            <CardTitle>Inventory</CardTitle>
            <div className="mt-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted">Filament types</span>
                <span className="font-medium">{filaments.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Total spools</span>
                <span className="font-medium">{totalSpoolsCount}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Remaining filament</span>
                <span className="font-medium">{formatWeight(totalRemainingG)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Printers</span>
                <span className="font-medium">{printers.length}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Recent Prints */}
      <Card>
        <CardTitle>Recent Prints</CardTitle>
        {recentPrints.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs text-muted">
                  <th className="pb-3 pr-4">Title</th>
                  <th className="pb-3 pr-4">Status</th>
                  <th className="pb-3 pr-4">Weight</th>
                  <th className="pb-3 pr-4">Duration</th>
                  <th className="pb-3 pr-4">Cost</th>
                  <th className="pb-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {recentPrints.map((p) => (
                  <tr key={p.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                    <td className="py-3 pr-4 font-medium">{p.title}</td>
                    <td className="py-3 pr-4">
                      <span className={getStatusColor(p.status)}>
                        {getStatusLabel(p.status)}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-muted">{formatWeight(p.weight)}</td>
                    <td className="py-3 pr-4 text-muted">{formatDuration(p.duration_seconds)}</td>
                    <td className="py-3 pr-4 text-muted">{formatCurrency(p.estimated_cost)}</td>
                    <td className="py-3 text-muted">
                      {p.finished_at
                        ? new Date(p.finished_at).toLocaleDateString()
                        : p.start_time
                          ? new Date(p.start_time).toLocaleDateString()
                          : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted">No prints recorded yet</p>
        )}
      </Card>
    </div>
  );
}