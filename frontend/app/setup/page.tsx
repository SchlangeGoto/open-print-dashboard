"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Check,
  ChevronRight,
  Cloud,
  Disc3,
  ExternalLink,
  Info,
  Printer,
  User,
} from "lucide-react";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  const [email, setEmail] = useState("");
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

  useEffect(() => {
    api
      .getSetupStatus()
      .then((status) => {
        if (status.setup_complete) {
          router.push("/");
        } else if (status.user_created && !status.bambu_logged_in) {
          setStep("bambu");
        } else if (
          status.user_created &&
          status.bambu_logged_in &&
          !status.printer_configured
        ) {
          setStep("printer");
        }
      })
      .catch(() => {});
  }, [router]);

  const currentStepIndex = steps.findIndex(
    (s) => s.key === step || (step === "bambu-code" && s.key === "bambu"),
  );

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setBusy(true);
    try {
      await api.register(email, password);
      const auth = await api.loginUser(email, password);
      login(auth.username, auth.token);
      setStep("bambu");
    } catch (err: any) {
      setError(err.message || "Failed to create account");
    } finally {
      setBusy(false);
    }
  }

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

  async function handlePrinterSetup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.savePrinterConfig({
        ip: printerIp,
        serial: printerSerial,
        access_code: printerAccessCode,
      });
      setStep("done");
    } catch (err: any) {
      setError(err.message || "Failed to save printer settings");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex rounded-2xl bg-primary/10 p-4 ring-1 ring-primary/20">
            <Disc3 className="size-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold">Setup Open Print Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Let&apos;s get everything configured
          </p>
        </div>

        {step !== "done" ? (
          <div className="mb-8 flex items-center justify-center gap-2">
            {steps.map((s, i) => (
              <div key={s.key} className="flex items-center gap-2">
                <div
                  className={`flex size-8 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                    i < currentStepIndex
                      ? "bg-emerald-600 text-white"
                      : i === currentStepIndex
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {i < currentStepIndex ? <Check className="size-4" /> : i + 1}
                </div>
                {i < steps.length - 1 ? (
                  <div
                    className={`h-px w-8 ${
                      i < currentStepIndex ? "bg-emerald-600" : "bg-border"
                    }`}
                  />
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {step === "account" ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <span className="rounded-lg bg-blue-500/10 p-2 text-blue-400">
                  <User className="size-5" />
                </span>
                Create your account
              </CardTitle>
              <CardDescription>
                This will be the only account with access to this dashboard.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreateAccount} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
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
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm">Confirm Password</Label>
                  <Input
                    id="confirm"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>

                {error ? (
                  <Alert variant="destructive">
                    <AlertCircle />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                ) : null}

                <LoadingButton type="submit" loading={busy} className="w-full">
                  Continue <ChevronRight />
                </LoadingButton>
              </form>
            </CardContent>
          </Card>
        ) : null}

        {step === "bambu" ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <span className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400">
                  <Cloud className="size-5" />
                </span>
                Connect Bambu Lab account
              </CardTitle>
              <CardDescription>
                Required to access your printer and print history via the cloud.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleBambuLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="bambu-email">Bambu Lab Email</Label>
                  <Input
                    id="bambu-email"
                    type="email"
                    placeholder="you@example.com"
                    value={bambuEmail}
                    onChange={(e) => setBambuEmail(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bambu-password">Bambu Lab Password</Label>
                  <Input
                    id="bambu-password"
                    type="password"
                    placeholder="••••••••"
                    value={bambuPassword}
                    onChange={(e) => setBambuPassword(e.target.value)}
                    required
                  />
                </div>

                {error ? (
                  <Alert variant="destructive">
                    <AlertCircle />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                ) : null}

                <LoadingButton type="submit" loading={busy} className="w-full">
                  Continue <ChevronRight />
                </LoadingButton>
              </form>
            </CardContent>
          </Card>
        ) : null}

        {step === "bambu-code" ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <span className="rounded-lg bg-amber-500/10 p-2 text-amber-400">
                  <Cloud className="size-5" />
                </span>
                Verification code
              </CardTitle>
              <CardDescription>
                A verification code was sent to your email.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <Info />
                <AlertDescription>
                  Check your email for the 6-digit verification code from Bambu Lab.
                </AlertDescription>
              </Alert>

              <form onSubmit={handleBambuVerify} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="code">Verification Code</Label>
                  <Input
                    id="code"
                    inputMode="numeric"
                    placeholder="123456"
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value)}
                    required
                  />
                </div>

                {error ? (
                  <Alert variant="destructive">
                    <AlertCircle />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                ) : null}

                <LoadingButton type="submit" loading={busy} className="w-full">
                  Verify <ChevronRight />
                </LoadingButton>
              </form>
            </CardContent>
          </Card>
        ) : null}

        {step === "printer" ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <span className="rounded-lg bg-purple-500/10 p-2 text-purple-400">
                  <Printer className="size-5" />
                </span>
                Printer configuration
              </CardTitle>
              <CardDescription>
                Connect to your printer via your local network.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                onClick={() => setShowPrinterHelp((v) => !v)}
              >
                <Info />
                Where do I find these values? Click to expand.
              </Button>

              {showPrinterHelp ? (
                <div className="space-y-2 rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
                  <p>
                    <strong className="text-foreground">Printer IP:</strong> Found in
                    your printer&apos;s network settings or your router&apos;s DHCP
                    client list.
                  </p>
                  <p>
                    <strong className="text-foreground">Serial Number:</strong> On the
                    printer → Settings → Device → Serial Number, or on the sticker on
                    the back.
                  </p>
                  <p>
                    <strong className="text-foreground">Access Code:</strong> On the
                    printer → Settings → Network → Access Code (LAN mode must be
                    enabled).
                  </p>
                  <a
                    href="https://wiki.bambulab.com/en/general/find-sn"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    Bambu Lab Wiki — Finding serial number
                    <ExternalLink className="size-3" />
                  </a>
                </div>
              ) : null}

              <form onSubmit={handlePrinterSetup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="ip">Printer IP Address</Label>
                  <Input
                    id="ip"
                    placeholder="192.168.0.100"
                    value={printerIp}
                    onChange={(e) => setPrinterIp(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="serial">Printer Serial Number</Label>
                  <Input
                    id="serial"
                    placeholder="03919C462700XXX"
                    value={printerSerial}
                    onChange={(e) => setPrinterSerial(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="access-code">Access Code</Label>
                  <Input
                    id="access-code"
                    placeholder="12345678"
                    value={printerAccessCode}
                    onChange={(e) => setPrinterAccessCode(e.target.value)}
                    required
                  />
                </div>

                {error ? (
                  <Alert variant="destructive">
                    <AlertCircle />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                ) : null}

                <LoadingButton type="submit" loading={busy} className="w-full">
                  Finish Setup <Check />
                </LoadingButton>
              </form>
            </CardContent>
          </Card>
        ) : null}

        {step === "done" ? (
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="mb-4 inline-flex rounded-full bg-emerald-500/10 p-4">
                <Check className="size-8 text-emerald-400" />
              </div>
              <h2 className="mb-2 text-xl font-bold">You&apos;re all set!</h2>
              <p className="mb-6 text-sm text-muted-foreground">
                Your dashboard is ready to go.
              </p>
              <Button size="lg" asChild>
                <Link href="/dashboard">
                  Go to Dashboard <ChevronRight />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </main>
  );
}
