"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import {
  Disc3,
  User,
  Cloud,
  Printer,
  Check,
  ChevronRight,
  AlertCircle,
  Info,
  ExternalLink,
} from "lucide-react";

type SetupStep = "account" | "bambu" | "bambu-code" | "printer" | "done";

const steps = [
  { key: "account", label: "Create Account" },
  { key: "bambu", label: "Bambu Lab Login" },
  { key: "printer", label: "Printer Setup" },
];

export default function SetupPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [step, setStep] = useState<SetupStep>("account");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Account fields
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Bambu fields
  const [bambuEmail, setBambuEmail] = useState("");
  const [bambuPassword, setBambuPassword] = useState("");
  const [verifyCode, setVerifyCode] = useState("");

  // Printer fields
  const [printerIp, setPrinterIp] = useState("");
  const [printerSerial, setPrinterSerial] = useState("");
  const [printerAccessCode, setPrinterAccessCode] = useState("");
  const [showPrinterHelp, setShowPrinterHelp] = useState(false);

  // Redirect if already set up
  useEffect(() => {
    api.getSetupStatus().then((status) => {
      if (status.setup_complete) {
        router.push("/");
      } else if (status.user_created && !status.bambu_logged_in) {
        setStep("bambu");
      } else if (status.user_created && status.bambu_logged_in && !status.printer_configured) {
        setStep("printer");
      }
    }).catch(() => {});
  }, [router]);

  const currentStepIndex = steps.findIndex(
    (s) => s.key === step || (step === "bambu-code" && s.key === "bambu"),
  );

  // ─── Account creation ───────────────────────────
  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setBusy(true);
    try {
      const res = await api.register(username, password);
      if (res.ok) {
        login(res.username);
        setStep("bambu");
      }
    } catch (err: any) {
      setError(err.message || "Failed to create account");
    } finally {
      setBusy(false);
    }
  }

  // ─── Bambu Lab login ────────────────────────────
  async function handleBambuLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);

    try {
      const res = await api.bambuLoginStart(bambuEmail, bambuPassword);
      if (res.requireCode) {
        setStep("bambu-code");
      } else {
        setStep("printer");
      }
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleBambuVerify(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);

    try {
      const res = await api.bambuLoginVerify(verifyCode);
      if (res.codeExpired) {
        // Re-send code
        await api.bambuLoginStart(bambuEmail, bambuPassword);
        setError("Code expired — a new one has been sent");
        setVerifyCode("");
      } else {
        setStep("printer");
      }
    } catch (err: any) {
      setError(err.message || "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  // ─── Printer setup ─────────────────────────────
  async function handlePrinterSetup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);

    try {
      await api.saveSetting("printer_ip", printerIp);
      await api.saveSetting("printer_serial", printerSerial);
      await api.saveSetting("printer_access_code", printerAccessCode);
      setStep("done");
    } catch (err: any) {
      setError(err.message || "Failed to save printer settings");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex rounded-2xl bg-accent/10 p-4 mb-4">
            <Disc3 size={32} className="text-accent" />
          </div>
          <h1 className="text-2xl font-bold">Setup Open Print Dashboard</h1>
          <p className="text-sm text-muted mt-1">
            Let&apos;s get everything configured
          </p>
        </div>

        {/* Progress */}
        {step !== "done" && (
          <div className="flex items-center justify-center gap-2 mb-8">
            {steps.map((s, i) => (
              <div key={s.key} className="flex items-center gap-2">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                    i < currentStepIndex
                      ? "bg-green-600 text-white"
                      : i === currentStepIndex
                        ? "bg-accent text-white"
                        : "bg-zinc-800 text-zinc-500"
                  }`}
                >
                  {i < currentStepIndex ? <Check size={14} /> : i + 1}
                </div>
                {i < steps.length - 1 && (
                  <div
                    className={`h-px w-8 ${
                      i < currentStepIndex ? "bg-green-600" : "bg-zinc-700"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Step: Create Account */}
        {step === "account" && (
          <div className="rounded-2xl border border-card-border bg-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="rounded-lg bg-blue-500/10 p-2 text-blue-400">
                <User size={20} />
              </div>
              <div>
                <h2 className="font-semibold">Create your account</h2>
                <p className="text-xs text-muted">
                  This will be the only account with access to this dashboard.
                </p>
              </div>
            </div>

            <form onSubmit={handleCreateAccount} className="space-y-4">
              <Input
                label="Username"
                placeholder="admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
              <Input
                label="Password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <Input
                label="Confirm Password"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />

              {error && (
                <div className="flex items-center gap-2 rounded-lg border border-red-800 bg-red-900/30 p-3 text-sm text-red-400">
                  <AlertCircle size={16} /> {error}
                </div>
              )}

              <Button type="submit" loading={busy} className="w-full" size="lg">
                Continue <ChevronRight size={16} />
              </Button>
            </form>
          </div>
        )}

        {/* Step: Bambu Lab Login */}
        {step === "bambu" && (
          <div className="rounded-2xl border border-card-border bg-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="rounded-lg bg-green-500/10 p-2 text-green-400">
                <Cloud size={20} />
              </div>
              <div>
                <h2 className="font-semibold">Connect Bambu Lab account</h2>
                <p className="text-xs text-muted">
                  Required to access your printer and print history via the cloud.
                </p>
              </div>
            </div>

            <form onSubmit={handleBambuLogin} className="space-y-4">
              <Input
                label="Bambu Lab Email"
                type="email"
                placeholder="you@example.com"
                value={bambuEmail}
                onChange={(e) => setBambuEmail(e.target.value)}
                required
              />
              <Input
                label="Bambu Lab Password"
                type="password"
                placeholder="••••••••"
                value={bambuPassword}
                onChange={(e) => setBambuPassword(e.target.value)}
                required
              />

              {error && (
                <div className="flex items-center gap-2 rounded-lg border border-red-800 bg-red-900/30 p-3 text-sm text-red-400">
                  <AlertCircle size={16} /> {error}
                </div>
              )}

              <Button type="submit" loading={busy} className="w-full" size="lg">
                Continue <ChevronRight size={16} />
              </Button>
            </form>
          </div>
        )}

        {/* Step: Bambu Verification Code */}
        {step === "bambu-code" && (
          <div className="rounded-2xl border border-card-border bg-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="rounded-lg bg-yellow-500/10 p-2 text-yellow-400">
                <Cloud size={20} />
              </div>
              <div>
                <h2 className="font-semibold">Verification code</h2>
                <p className="text-xs text-muted">
                  A verification code was sent to your email.
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-200 mb-4">
              Check your email for the 6-digit verification code from Bambu Lab.
            </div>

            <form onSubmit={handleBambuVerify} className="space-y-4">
              <Input
                label="Verification Code"
                inputMode="numeric"
                placeholder="123456"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value)}
                required
              />

              {error && (
                <div className="flex items-center gap-2 rounded-lg border border-red-800 bg-red-900/30 p-3 text-sm text-red-400">
                  <AlertCircle size={16} /> {error}
                </div>
              )}

              <Button type="submit" loading={busy} className="w-full" size="lg">
                Verify <ChevronRight size={16} />
              </Button>
            </form>
          </div>
        )}

        {/* Step: Printer Setup */}
        {step === "printer" && (
          <div className="rounded-2xl border border-card-border bg-card p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="rounded-lg bg-purple-500/10 p-2 text-purple-400">
                <Printer size={20} />
              </div>
              <div>
                <h2 className="font-semibold">Printer configuration</h2>
                <p className="text-xs text-muted">
                  Connect to your printer via local network.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowPrinterHelp(!showPrinterHelp)}
              className="flex items-center gap-2 w-full rounded-lg border border-blue-800 bg-blue-900/20 p-3 text-sm text-blue-300 mb-4 hover:bg-blue-900/30 transition-colors text-left"
            >
              <Info size={16} className="shrink-0" />
              <span>Where do I find these values? Click to expand.</span>
            </button>

            {showPrinterHelp && (
              <div className="rounded-lg border border-zinc-700 bg-zinc-800/50 p-4 text-sm text-zinc-300 mb-4 space-y-2">
                <p>
                  <strong>Printer IP:</strong> Found in your printer&apos;s network
                  settings or your router&apos;s DHCP client list.
                </p>
                <p>
                  <strong>Serial Number:</strong> On the printer → Settings → Device
                  → Serial Number. Or check the sticker on the back of the machine.
                </p>
                <p>
                  <strong>Access Code:</strong> On the printer → Settings → Network →
                  Access Code (LAN mode must be enabled).
                </p>
                <a
                  href="https://wiki.bambulab.com/en/general/find-sn"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-accent hover:underline mt-1"
                >
                  Bambu Lab Wiki — Finding serial number
                  <ExternalLink size={12} />
                </a>
              </div>
            )}

            <form onSubmit={handlePrinterSetup} className="space-y-4">
              <Input
                label="Printer IP Address"
                placeholder="192.168.0.100"
                value={printerIp}
                onChange={(e) => setPrinterIp(e.target.value)}
                required
              />
              <Input
                label="Printer Serial Number"
                placeholder="03919C462700XXX"
                value={printerSerial}
                onChange={(e) => setPrinterSerial(e.target.value)}
                required
              />
              <Input
                label="Access Code"
                placeholder="12345678"
                value={printerAccessCode}
                onChange={(e) => setPrinterAccessCode(e.target.value)}
                required
              />

              {error && (
                <div className="flex items-center gap-2 rounded-lg border border-red-800 bg-red-900/30 p-3 text-sm text-red-400">
                  <AlertCircle size={16} /> {error}
                </div>
              )}

              <Button type="submit" loading={busy} className="w-full" size="lg">
                Finish Setup <Check size={16} />
              </Button>
            </form>
          </div>
        )}

        {/* Step: Done */}
        {step === "done" && (
          <div className="rounded-2xl border border-card-border bg-card p-8 text-center">
            <div className="inline-flex rounded-full bg-green-500/10 p-4 mb-4">
              <Check size={32} className="text-green-400" />
            </div>
            <h2 className="text-xl font-bold mb-2">You&apos;re all set!</h2>
            <p className="text-sm text-muted mb-6">
              Your dashboard is ready to go. Note: You may need to restart the
              backend service for the printer connection to use the new settings.
            </p>
            <Button size="lg" onClick={() => router.push("/dashboard")}>
              Go to Dashboard <ChevronRight size={16} />
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}