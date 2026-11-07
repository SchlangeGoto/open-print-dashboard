"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  Cloud,
  ExternalLink,
  LogOut,
  Monitor,
  Moon,
  Palette,
  Printer,
  RefreshCw,
  Save,
  Sun,
  User,
} from "lucide-react";

import { ACCENTS, useAppearance, type AccentId } from "@/lib/appearance";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { LoadingButton } from "@/components/ui/loading-button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

export default function SettingsPage() {
  const { logout, username } = useAuth();
  const { theme, setTheme } = useTheme();
  const { accent, setAccent } = useAppearance();

  const [mounted, setMounted] = useState(false);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [printerConfig, setPrinterConfig] = useState({
    ip: "",
    serial: "",
    access_code: "",
  });
  const [saving, setSaving] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    Promise.all([
      api.getSettings().catch(() => []),
      api.getPrinterConfig().catch(() => null),
    ])
      .then(([data, config]) => {
        const map: Record<string, string> = {};
        data.forEach((setting) => {
          map[setting.key] = setting.value;
        });
        setSettings(map);
        setPrinterConfig({
          ip: config?.ip ?? "",
          serial: config?.serial ?? "",
          access_code: config?.access_code ?? "",
        });
      })
      .finally(() => setLoading(false));
  }, []);

  async function savePrinterConfig(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      await api.savePrinterConfig(printerConfig);
      toast.success("Printer settings saved");
    } catch {
      toast.error("Failed to save printer settings");
    } finally {
      setSaving(false);
    }
  }

  async function reconnectPrinter() {
    setReconnecting(true);
    try {
      await api.reconnectPrinter();
      toast.success("Printer connection restarted");
    } catch {
      toast.error("Failed to reconnect to the printer");
    } finally {
      setReconnecting(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6 pb-8">
        <div>
          <Skeleton className="h-8 w-40" />
          <Skeleton className="mt-2 h-4 w-80" />
        </div>
        <Skeleton className="h-56 rounded-xl" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    );
  }

  const cloudConnected = Boolean(
    settings.bambu_cloud_email || settings.bambu_cloud_token,
  );
  const printerConfigured = Boolean(
    printerConfig.ip && printerConfig.serial && printerConfig.access_code,
  );
  const themeValue = mounted && theme ? [theme] : [];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your appearance, account, and printer connection.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary">
              <Palette className="size-5" />
            </div>
            <div className="space-y-1">
              <CardTitle>Appearance</CardTitle>
              <CardDescription>
                Choose a mode and accent color for the dashboard.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-5 md:grid-cols-[1fr_1.5fr]">
            <div className="space-y-2">
              <p className="text-sm font-medium">Mode</p>
              <ToggleGroup
                value={themeValue}
                onValueChange={(value) => {
                  if (value[0]) setTheme(value[0]);
                }}
                variant="outline"
                size="sm"
                spacing={0}
              >
                <ToggleGroupItem value="light" className="aria-pressed:bg-primary/10 aria-pressed:text-primary">
                  <Sun /> Light
                </ToggleGroupItem>
                <ToggleGroupItem value="dark" className="aria-pressed:bg-primary/10 aria-pressed:text-primary">
                  <Moon /> Dark
                </ToggleGroupItem>
                <ToggleGroupItem value="system" className="aria-pressed:bg-primary/10 aria-pressed:text-primary">
                  <Monitor /> System
                </ToggleGroupItem>
              </ToggleGroup>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Accent color</p>
              <ToggleGroup
                value={[accent]}
                onValueChange={(value) => {
                  if (value[0]) setAccent(value[0] as AccentId);
                }}
                variant="outline"
                size="sm"
                spacing={0}
                className="flex-wrap"
              >
                {ACCENTS.map((item) => (
                  <ToggleGroupItem
                    key={item.id}
                    value={item.id}
                    className="aria-pressed:bg-primary/10 aria-pressed:text-primary"
                  >
                    <span
                      className="size-3 rounded-full border border-foreground/10"
                      style={{ backgroundColor: item.color }}
                    />
                    {item.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </div>

          <div className="flex flex-col gap-4 rounded-lg border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">Accent preview</p>
              <p className="text-xs text-muted-foreground">
                Buttons, focus rings, navigation, and charts follow this color.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm">Primary action</Button>
              <Badge>Accent</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-blue-500/10 p-2 text-blue-500">
                  <User className="size-5" />
                </div>
                <div className="space-y-1">
                  <CardTitle>Account</CardTitle>
                  <CardDescription>Your dashboard identity.</CardDescription>
                </div>
              </div>
              <CardAction>
                <Button variant="outline" size="sm" onClick={logout}>
                  <LogOut /> Sign out
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
                <Avatar className="size-10 rounded-lg">
                  <AvatarFallback className="rounded-lg bg-primary/15 text-primary">
                    {initials(username)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{username}</p>
                  <p className="text-xs text-muted-foreground">
                    Dashboard administrator
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-500">
                  <Cloud className="size-5" />
                </div>
                <div className="space-y-1">
                  <CardTitle>Bambu Lab Cloud</CardTitle>
                  <CardDescription>
                    Cloud account used for printers and print history.
                  </CardDescription>
                </div>
              </div>
              <CardAction>
                <Badge variant={cloudConnected ? "success" : "secondary"}>
                  {cloudConnected ? "Connected" : "Not connected"}
                </Badge>
              </CardAction>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Account</p>
                <p className="mt-0.5 truncate text-sm font-medium">
                  {settings.bambu_cloud_email || "Not connected"}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-violet-500/10 p-2 text-violet-500">
                <Printer className="size-5" />
              </div>
              <div className="space-y-1">
                <CardTitle>Printer connection</CardTitle>
                <CardDescription>
                  Local network details. Saving reconnects automatically.
                </CardDescription>
              </div>
            </div>
            <CardAction>
              <Badge variant={printerConfigured ? "success" : "secondary"}>
                {printerConfigured ? "Configured" : "Incomplete"}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            <form onSubmit={savePrinterConfig} className="space-y-5">
              <FieldGroup className="gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="ip">Printer IP</FieldLabel>
                    <Input
                      id="ip"
                      placeholder="192.168.0.100"
                      value={printerConfig.ip}
                      onChange={(event) =>
                        setPrinterConfig({
                          ...printerConfig,
                          ip: event.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="serial">Serial number</FieldLabel>
                    <Input
                      id="serial"
                      placeholder="03919C462700XXX"
                      value={printerConfig.serial}
                      onChange={(event) =>
                        setPrinterConfig({
                          ...printerConfig,
                          serial: event.target.value,
                        })
                      }
                    />
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor="access-code">Access code</FieldLabel>
                  <Input
                    id="access-code"
                    placeholder="••••••••"
                    value={printerConfig.access_code}
                    onChange={(event) =>
                      setPrinterConfig({
                        ...printerConfig,
                        access_code: event.target.value,
                      })
                    }
                  />
                </Field>
              </FieldGroup>

              <div className="flex flex-wrap items-center gap-3">
                <LoadingButton type="submit" loading={saving}>
                  <Save /> Save connection
                </LoadingButton>
                <Button
                  type="button"
                  variant="outline"
                  onClick={reconnectPrinter}
                  disabled={reconnecting}
                >
                  <RefreshCw
                    className={reconnecting ? "animate-spin" : undefined}
                  />
                  Reconnect
                </Button>
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
      </div>
    </div>
  );
}
