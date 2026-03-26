"use client";

import { useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type LoginStage = "credentials" | "code" | "done";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<LoginStage>("credentials");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleStartLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch(`${API_BASE}/auth/login/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (data.requireCode) {
        setStage("code");
        setMessage(data.message ?? "Verification code required");
        return;
      }

      if (response.ok) {
        setStage("done");
        setMessage(data.message ?? "Login successful");
        return;
      }

      setMessage(data.detail ?? data.message ?? "Login failed");
    } catch {
      setMessage("Could not reach the API");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch(`${API_BASE}/auth/login/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      const data = await response.json();

      if (data.codeExpired) {
        await fetch(`${API_BASE}/auth/login/start`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        setMessage("Code expired — a new one has been sent to your email");
        setCode("");
        return;
      }

      if (response.ok) {
        setStage("done");
        setMessage(data.message ?? "Login successful");
        return;
      }

      setMessage(data.detail ?? data.message ?? "Verification failed");
    } catch {
      setMessage("Could not reach the API");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
        <h1 className="text-2xl font-semibold">Bambu Lab Login</h1>
        <p className="mt-2 text-sm text-slate-400">
          Sign in with your Bambu Lab account to continue.
        </p>

        {stage === "credentials" && (
          <form onSubmit={handleStartLogin} className="mt-6 space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium">Email</label>
              <input
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">Password</label>
              <input
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-500 disabled:opacity-60"
            >
              {busy ? "Signing in..." : "Continue"}
            </button>
          </form>
        )}

        {stage === "code" && (
          <form onSubmit={handleVerifyCode} className="mt-6 space-y-4">
            <div className="rounded-lg border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-200">
              We sent a verification code to your email. Enter it below.
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium">
                Verification code
              </label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 outline-none focus:border-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-lg bg-green-600 px-4 py-3 font-medium text-white hover:bg-green-500 disabled:opacity-60"
            >
              {busy ? "Verifying..." : "Verify code"}
            </button>
          </form>
        )}

        {stage === "done" && (
          <div className="mt-6 rounded-lg border border-emerald-700 bg-emerald-950/40 p-4 text-emerald-200">
            {message}
          </div>
        )}

        {message && stage !== "done" && (
          <p className="mt-4 text-sm text-slate-300">{message}</p>
        )}
      </div>
    </main>
  );
}