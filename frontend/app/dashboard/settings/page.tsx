"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Cloud,
  LogOut,
  Monitor,
  Moon,
  Palette,
  Sun,
  User,
} from "lucide-react";

import { ACCENTS, useAppearance, type AccentId } from "@/lib/appearance";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "@/lib/toast";
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
  const router = useRouter();
  const { logout, username } = useAuth();
  const { theme, setTheme } = useTheme();
  const { accent, setAccent } = useAppearance();

  const [mounted, setMounted] = useState(false);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [bambuBusy, setBambuBusy] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    api
      .getSettings()
      .catch(() => [])
      .then((data) => {
        const map: Record<string, string> = {};
        data.forEach((setting) => {
          map[setting.key] = setting.value;
        });
        setSettings(map);
      })
      .finally(() => setLoading(false));
  }, []);

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
  const themeValue = mounted && theme ? [theme] : [];

  async function handleBambuConnection() {
    if (!cloudConnected) {
      router.push("/setup");
      return;
    }
    setBambuBusy(true);
    try {
      await api.bambuLogout();
      setSettings((current) => {
        const next = { ...current };
        delete next.bambu_cloud_email;
        delete next.bambu_cloud_password;
        delete next.bambu_cloud_token;
        return next;
      });
      toast.success("Bambu Lab session cleared");
      // The setup wizard shows the Bambu step whenever no account is connected.
      router.push("/setup");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not sign out",
      );
    } finally {
      setBambuBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your appearance and account.
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

      <div className="grid items-start gap-6 md:grid-cols-2">
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
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {cloudConnected
                    ? "Signing out forgets the stored account and stops cloud printers."
                    : "Connect a Bambu Lab account to use cloud printers."}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBambuConnection}
                  disabled={cloudConnected && bambuBusy}
                >
                  <LogOut /> {cloudConnected ? "Sign out" : "Connect"}
                </Button>
              </div>
            </CardContent>
          </Card>
      </div>
    </div>
  );
}
