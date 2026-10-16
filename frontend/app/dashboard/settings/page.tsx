"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  Cloud,
  ExternalLink,
  LogOut,
  Printer,
  Save,
  User,
} from "lucide-react";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingButton } from "@/components/ui/loading-button";
import { Separator } from "@/components/ui/separator";

export default function SettingsPage() {
  const { logout, username } = useAuth();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [printerIp, setPrinterIp] = useState("");
  const [printerSerial, setPrinterSerial] = useState("");
  const [printerAccessCode, setPrinterAccessCode] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      api.getSettings().catch(() => []),
      api.getPrinterConfig().catch(() => null),
    ])
      .then(([data, config]) => {
        const map: Record<string, string> = {};
        data.forEach((s) => {
          map[s.key] = s.value;
        });
        setSettings(map);
        setPrinterIp(config?.ip ?? "");
        setPrinterSerial(config?.serial ?? "");
        setPrinterAccessCode(config?.access_code ?? "");
      })
      .finally(() => setLoading(false));
  }, []);

  async function savePrinterConfig(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.savePrinterConfig({
        ip: printerIp,
        serial: printerSerial,
        access_code: printerAccessCode,
      });
      toast.success("Settings saved. Printer connection restarted.");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-36 rounded-xl skeleton" />
        ))}
      </div>
    );
  }

  const maskedKeys = (key: string) =>
    key.includes("password") ||
    key.includes("token") ||
    key.includes("access_code") ||
    key.includes("key");

  return (
    <div className="max-w-2xl space-y-5 pb-8">
      <div>
        <h1 className="text-xl font-bold">Settings</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">Dashboard configuration</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <span className="rounded-xl bg-blue-950/50 p-2.5 text-blue-400">
              <User className="size-[18px]" />
            </span>
            Account
          </CardTitle>
          <CardDescription>
            Signed in as <span className="font-semibold text-foreground">{username}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" size="sm" onClick={logout}>
            <LogOut /> Sign Out
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <span className="rounded-xl bg-emerald-950/50 p-2.5 text-emerald-400">
              <Cloud className="size-[18px]" />
            </span>
            Bambu Lab Cloud
          </CardTitle>
          <CardDescription>
            {settings.bambu_cloud_token ? (
              <span className="flex items-center gap-1 text-emerald-400">
                <CheckCircle2 className="size-3" /> Connected
              </span>
            ) : (
              "Not connected — complete setup to connect"
            )}
          </CardDescription>
        </CardHeader>
        {settings.bambu_cloud_email ? (
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Account: {settings.bambu_cloud_email}
            </p>
          </CardContent>
        ) : null}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <span className="rounded-xl bg-purple-950/50 p-2.5 text-purple-400">
              <Printer className="size-[18px]" />
            </span>
            Printer Connection
          </CardTitle>
          <CardDescription>
            Local network settings. Saving reconnects to the printer.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={savePrinterConfig} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ip">Printer IP</Label>
              <Input
                id="ip"
                placeholder="192.168.0.100"
                value={printerIp}
                onChange={(e) => setPrinterIp(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="serial">Serial Number</Label>
              <Input
                id="serial"
                placeholder="03919C462700XXX"
                value={printerSerial}
                onChange={(e) => setPrinterSerial(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="access-code">Access Code</Label>
              <Input
                id="access-code"
                placeholder="••••••••"
                value={printerAccessCode}
                onChange={(e) => setPrinterAccessCode(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-4">
              <LoadingButton type="submit" loading={saving} size="sm">
                <Save /> Save
              </LoadingButton>
              <a
                href="https://wiki.bambulab.com/en/general/find-sn"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                How to find these values
                <ExternalLink className="size-3" />
              </a>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Settings</CardTitle>
          <CardDescription>Raw values stored in the database</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {Object.entries(settings).map(([key, value], i) => (
              <div key={key}>
                {i > 0 ? <Separator className="my-1" /> : null}
                <div className="flex items-center justify-between py-2 text-xs">
                  <span className="font-mono text-muted-foreground">{key}</span>
                  <span className="max-w-[200px] truncate text-right">
                    {maskedKeys(key) ? "••••••••" : value}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
