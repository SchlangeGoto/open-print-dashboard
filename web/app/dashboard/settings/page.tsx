"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card, CardTitle, CardDescription } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
  Settings,
  Printer,
  Cloud,
  LogOut,
  Save,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import toast from "react-hot-toast";

export default function SettingsPage() {
  const { logout, username } = useAuth();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const [printerIp, setPrinterIp] = useState("");
  const [printerSerial, setPrinterSerial] = useState("");
  const [printerAccessCode, setPrinterAccessCode] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getSettings().then((data) => {
      const map: Record<string, string> = {};
      data.forEach((s) => { map[s.key] = s.value; });
      setSettings(map);
      setPrinterIp(map.printer_ip ?? "");
      setPrinterSerial(map.printer_serial ?? "");
      setPrinterAccessCode(map.printer_access_code ?? "");
      setLoading(false);
    });
  }, []);

  async function savePrinterConfig(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.saveSetting("printer_ip", printerIp);
      await api.saveSetting("printer_serial", printerSerial);
      await api.saveSetting("printer_access_code", printerAccessCode);
      toast.success("Printer settings saved. Restart backend to apply.");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="animate-pulse text-zinc-500 p-8">Loading settings...</div>;
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted mt-1">Manage your dashboard configuration</p>
      </div>

      {/* Account */}
      <Card>
        <div className="flex items-center gap-3 mb-4">
          <div className="rounded-lg bg-blue-500/10 p-2 text-blue-400">
            <Settings size={20} />
          </div>
          <div>
            <CardTitle>Account</CardTitle>
            <CardDescription>Logged in as <strong>{username}</strong></CardDescription>
          </div>
        </div>
        <Button variant="danger" size="sm" onClick={logout}>
          <LogOut size={14} /> Sign out
        </Button>
      </Card>

      {/* Bambu Cloud */}
      <Card>
        <div className="flex items-center gap-3 mb-4">
          <div className="rounded-lg bg-green-500/10 p-2 text-green-400">
            <Cloud size={20} />
          </div>
          <div>
            <CardTitle>Bambu Lab Cloud</CardTitle>
            <CardDescription>
              {settings.bambu_cloud_token ? (
                <span className="flex items-center gap-1 text-green-400">
                  <CheckCircle2 size={14} /> Connected
                </span>
              ) : (
                "Not connected"
              )}
            </CardDescription>
          </div>
        </div>
        {settings.bambu_cloud_email && (
          <p className="text-sm text-muted">
            Account: {settings.bambu_cloud_email}
          </p>
        )}
      </Card>

      {/* Printer Config */}
      <Card>
        <div className="flex items-center gap-3 mb-4">
          <div className="rounded-lg bg-purple-500/10 p-2 text-purple-400">
            <Printer size={20} />
          </div>
          <div>
            <CardTitle>Printer Configuration</CardTitle>
            <CardDescription>
              Update your printer connection settings. Restart backend after changes.
            </CardDescription>
          </div>
        </div>

        <form onSubmit={savePrinterConfig} className="space-y-4">
          <Input
            label="Printer IP"
            placeholder="192.168.0.100"
            value={printerIp}
            onChange={(e) => setPrinterIp(e.target.value)}
          />
          <Input
            label="Serial Number"
            placeholder="03919C462700XXX"
            value={printerSerial}
            onChange={(e) => setPrinterSerial(e.target.value)}
          />
          <Input
            label="Access Code"
            placeholder="12345678"
            value={printerAccessCode}
            onChange={(e) => setPrinterAccessCode(e.target.value)}
          />
          <div className="flex items-center gap-4">
            <Button type="submit" loading={saving}>
              <Save size={14} /> Save
            </Button>
            <a
              href="https://wiki.bambulab.com/en/general/find-sn"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-accent hover:underline"
            >
              How to find these values <ExternalLink size={12} />
            </a>
          </div>
        </form>
      </Card>

      {/* All Settings (debug) */}
      <Card>
        <CardTitle>All Settings</CardTitle>
        <CardDescription>Raw settings from database</CardDescription>
        <div className="mt-4 space-y-2">
          {Object.entries(settings).map(([key, value]) => (
            <div key={key} className="flex justify-between text-sm border-b border-zinc-800/50 pb-2">
              <span className="font-mono text-muted">{key}</span>
              <span className="text-right truncate max-w-[200px]">
                {key.includes("password") || key.includes("token") || key.includes("access_code")
                  ? "••••••••"
                  : value}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}