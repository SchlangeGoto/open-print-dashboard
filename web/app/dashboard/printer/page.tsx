"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardTitle, CardDescription } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import {
  Printer,
  Wifi,
  WifiOff,
  Thermometer,
  Fan,
  Gauge,
  Layers,
  HardDrive,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function PrinterPage() {
  const [status, setStatus] = useState<any>(null);
  const [devices, setDevices] = useState<any[]>([]);
  const [firmware, setFirmware] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const [st, devs] = await Promise.all([
        api.getPrinterStatus().catch(() => null),
        api.getPrinters().catch(() => []),
      ]);
      setStatus(st);
      setDevices(devs);

      if (devs.length > 0) {
        const fw = await api.getFirmware(devs[0].dev_id).catch(() => null);
        setFirmware(fw);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  const isConnected = status && status.status !== "no_data";
  const printing = status?.gcode_state === "RUNNING";

  if (loading) {
    return <div className="animate-pulse text-zinc-500 p-8">Loading printer info...</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Printer</h1>
          <p className="text-sm text-muted mt-1">Monitor and manage your 3D printer</p>
        </div>
        <Button variant="secondary" onClick={load} size="sm">
          <RefreshCw size={14} /> Refresh
        </Button>
      </div>

      {/* Devices */}
      {devices.map((dev) => (
        <Card key={dev.dev_id}>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="rounded-xl bg-zinc-800 p-3">
                <Printer size={28} className="text-accent" />
              </div>
              <div>
                <h2 className="text-lg font-bold">{dev.name}</h2>
                <p className="text-sm text-muted">{dev.dev_model_name || dev.dev_id}</p>
                <p className="text-xs text-zinc-600 font-mono mt-1">{dev.dev_id}</p>
              </div>
            </div>
            <Badge variant={dev.online ? "success" : "danger"}>
              {dev.online ? "Online" : "Offline"}
            </Badge>
          </div>
        </Card>
      ))}

      {/* Live Status */}
      {isConnected && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <div className="flex items-center gap-2 text-xs text-muted mb-2">
                <Thermometer size={14} /> Nozzle Temperature
              </div>
              <p className="text-2xl font-bold">
                {status.nozzle_temper ?? "—"}°C
              </p>
              {status.nozzle_target_temper ? (
                <p className="text-xs text-muted mt-1">Target: {status.nozzle_target_temper}°C</p>
              ) : null}
            </Card>
            <Card>
              <div className="flex items-center gap-2 text-xs text-muted mb-2">
                <Thermometer size={14} /> Bed Temperature
              </div>
              <p className="text-2xl font-bold">
                {status.bed_temper ?? "—"}°C
              </p>
              {status.bed_target_temper ? (
                <p className="text-xs text-muted mt-1">Target: {status.bed_target_temper}°C</p>
              ) : null}
            </Card>
            <Card>
              <div className="flex items-center gap-2 text-xs text-muted mb-2">
                <Fan size={14} /> Cooling Fan
              </div>
              <p className="text-2xl font-bold">
                {status.cooling_fan_speed != null
                  ? `${Math.round((status.cooling_fan_speed / 15) * 100)}%`
                  : "—"}
              </p>
            </Card>
            <Card>
              <div className="flex items-center gap-2 text-xs text-muted mb-2">
                <Gauge size={14} /> Speed Level
              </div>
              <p className="text-2xl font-bold">
                {status.spd_lvl ?? "—"}
              </p>
              {status.spd_mag != null && (
                <p className="text-xs text-muted mt-1">{status.spd_mag}%</p>
              )}
            </Card>
          </div>

          {/* Current Print */}
          {printing && (
            <Card>
              <CardTitle>Current Print</CardTitle>
              <div className="mt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-lg">{status.subtask_name || "Printing..."}</p>
                  <Badge variant="info">Printing</Badge>
                </div>
                <div className="w-full bg-zinc-800 rounded-full h-4">
                  <div
                    className="bg-accent h-4 rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                    style={{ width: `${Math.max(status.mc_percent || 0, 5)}%` }}
                  >
                    <span className="text-[10px] font-bold">{status.mc_percent}%</span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-xs text-muted">Layer</p>
                    <p className="font-semibold">
                      {status.layer_num ?? "—"} / {status.total_layer_num ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Time Remaining</p>
                    <p className="font-semibold">
                      {status.mc_remaining_time ? `${status.mc_remaining_time} min` : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">State</p>
                    <p className="font-semibold">{status.gcode_state}</p>
                  </div>
                </div>
              </div>
            </Card>
          )}
        </>
      )}

      {!isConnected && (
        <Card>
          <div className="flex items-center gap-3 text-zinc-500 py-4">
            <WifiOff size={24} />
            <div>
              <p className="font-medium">No live data</p>
              <p className="text-sm">
                The MQTT connection to your printer hasn&apos;t sent any data yet, or the printer is
                off.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Firmware */}
      {firmware && firmware.firmware && (
        <Card>
          <CardTitle>Firmware</CardTitle>
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-4">
            {(firmware.firmware || []).map((fw: any) => (
              <div key={`${fw.name}-${fw.version}`} className="rounded-lg bg-zinc-800/50 p-3">
                <p className="text-xs text-muted">{fw.name}</p>
                <p className="text-sm font-mono mt-1">{fw.version}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}