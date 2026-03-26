"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Disc3, AlertCircle } from "lucide-react";

export default function Home() {
  const router = useRouter();
  const { username, isLoading, login } = useAuth();
  const [checking, setChecking] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);

  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isLoading) return;

    // If already logged in, go straight to dashboard
    if (username) {
      router.push("/dashboard");
      return;
    }

    // Check if setup is needed
    api.userExists()
      .then((data) => {
        if (!data.exists) {
          setNeedsSetup(true);
          router.push("/setup");
        }
        setChecking(false);
      })
      .catch(() => {
        setChecking(false);
      });
  }, [isLoading, username, router]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");

    try {
      const result = await api.loginUser(loginUsername, loginPassword);
      if (result.ok) {
        login(result.username);
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
      <main className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse flex items-center gap-3">
          <Disc3 className="animate-spin text-accent" size={24} />
          <span className="text-zinc-400">Loading...</span>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex rounded-2xl bg-accent/10 p-4 mb-4">
            <Disc3 size={32} className="text-accent" />
          </div>
          <h1 className="text-2xl font-bold">Welcome back</h1>
          <p className="text-sm text-muted mt-1">Sign in to your dashboard</p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <Input
            label="Username"
            placeholder="Enter your username"
            value={loginUsername}
            onChange={(e) => setLoginUsername(e.target.value)}
            required
            autoComplete="username"
          />
          <Input
            label="Password"
            type="password"
            placeholder="••••••••"
            value={loginPassword}
            onChange={(e) => setLoginPassword(e.target.value)}
            required
            autoComplete="current-password"
          />

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-red-800 bg-red-900/30 p-3 text-sm text-red-400">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <Button type="submit" loading={busy} className="w-full" size="lg">
            Sign in
          </Button>
        </form>
      </div>
    </main>
  );
}