"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Disc3 } from "lucide-react";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingButton } from "@/components/ui/loading-button";

export default function Home() {
  const router = useRouter();
  const { username, isLoading, login } = useAuth();
  const [checking, setChecking] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isLoading) return;

    if (username) {
      router.push("/dashboard");
      return;
    }

    api
      .getSetupStatus()
      .then((data) => {
        if (!data.user_created) {
          setNeedsSetup(true);
          router.push("/setup");
        }
        setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [isLoading, username, router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api.loginUser(email, password);
      if (result.ok) {
        login(result.username, result.token);
        router.push("/dashboard");
      }
    } catch (err: any) {
      setError(err.message || "Invalid credentials");
    } finally {
      setBusy(false);
    }
  }

  if (isLoading || checking || needsSetup) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-background">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Disc3 className="size-5 animate-spin text-primary" />
          <span className="text-sm">Loading...</span>
        </div>
      </main>
    );
  }

  return (
    <AuthLayout
      title="Welcome back"
      description="Sign in to your dashboard"
      footer={
        <Link href="/recover-password" className="text-primary hover:underline">
          Forgot your password?
        </Link>
      }
    >
      <form onSubmit={handleLogin} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <LoadingButton type="submit" loading={busy} className="w-full">
          Sign in
        </LoadingButton>
      </form>
    </AuthLayout>
  );
}
