"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Check,
  ChevronRight,
  Cloud,
  FlaskConical,
  Info,
  Printer,
  User,
} from "lucide-react";

import { api, type Printer as PrinterDevice } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { isDemoActive } from "@/lib/demo";
import { SpoolMark } from "@/components/brand/SpoolMark";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { LoadingButton } from "@/components/ui/loading-button";
import { Spinner } from "@/components/ui/spinner";

type SetupStep = "account" | "bambu" | "bambu-code" | "printer" | "done";

const steps = [
  { key: "account", label: "Create Account" },
  { key: "bambu", label: "Bambu Lab Login" },
  { key: "printer", label: "Choose Printer" },
];

function ForceParam({ onChange }: { onChange: (value: boolean) => void }) {
  const searchParams = useSearchParams();
  useEffect(() => {
    onChange(searchParams.get("force") === "1");
  }, [onChange, searchParams]);
  return null;
}

export default function SetupPage() {
  const router = useRouter();
  // Read the query string after hydration instead of with useSearchParams:
  // that keeps the static page from needing a Suspense fallback that replaces
  // the whole wizard with "Loading setup…".
  const [forceSetup, setForceSetup] = useState<boolean | null>(null);
  const { login, demoAvailable, enterDemo } = useAuth();
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
  const [cloudPrinters, setCloudPrinters] = useState<PrinterDevice[]>([]);
  const [selectedSerial, setSelectedSerial] = useState("");
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const [printerLoadError, setPrinterLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (forceSetup === null) return;
    api
      .getSetupStatus()
      .then(async (status) => {
        if (isDemoActive()) {
          router.push("/dashboard");
          return;
        }
        if (status.setup_complete && !forceSetup) {
          router.push("/");
          return;
        }
        if (!status.user_created) {
          // Fresh instance: the account step is already showing.
          return;
        }
        try {
          const progress = await api.getSetupProgress();
          setStep(
            !progress.bambu_logged_in
              ? "bambu"
              : progress.printer_configured
                ? "done"
                : "printer",
          );
        } catch {
          // The account exists but this browser has no session. Signing in
          // is the only way forward; creating the account would fail.
          router.replace("/");
        }
      })
      .catch(() => {});
  }, [router, forceSetup]);

  const loadCloudPrinters = useCallback(async () => {
    setLoadingPrinters(true);
    setPrinterLoadError(null);
    try {
      const printers = await api.getPrinters();
      const available = printers.filter(
        (printer) => !printer.configured && !printer.id,
      );
      setCloudPrinters(available);
      setSelectedSerial(available[0]?.serial ?? "");
    } catch (err) {
      setCloudPrinters([]);
      setPrinterLoadError(
        err instanceof Error
          ? err.message
          : "Could not load printers from Bambu Cloud",
      );
    } finally {
      setLoadingPrinters(false);
    }
  }, []);

  useEffect(() => {
    if (step === "printer") void loadCloudPrinters();
  }, [step, loadCloudPrinters]);

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
      login(auth.username);
      setStep("bambu");
    } catch (err: any) {
      setError(err.message || "Failed to create account");
    } finally {
      setBusy(false);
    }
  }

  async function afterBambuLogin() {
    const progress = await api.getSetupProgress();
    setStep(progress.printer_configured ? "done" : "printer");
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
        await afterBambuLogin();
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
        await afterBambuLogin();
      }
    } catch (err: any) {
      setError(err.message || "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleCloudPrinterSetup() {
    const device = cloudPrinters.find(
      (printer) => printer.serial === selectedSerial,
    );
    if (!device) {
      setError("Choose a printer first");
      return;
    }
    setError("");
    setBusy(true);
    try {
      await api.createPrinter({
        name: device.name,
        serial: device.serial,
      });
      setStep("done");
    } catch (err: any) {
      setError(err.message || "Failed to add printer");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Suspense fallback={null}>
        <ForceParam onChange={setForceSetup} />
      </Suspense>
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex rounded-2xl bg-primary/10 p-4 ring-1 ring-primary/20">
            <SpoolMark className="size-9 text-primary" />
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
                <Field>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input
                    id="email"
                    type="email"
                    placeholder="admin@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="confirm">Confirm Password</FieldLabel>
                  <Input
                    id="confirm"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </Field>

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
                <span className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
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
                <Field>
                  <FieldLabel htmlFor="bambu-email">Bambu Lab Email</FieldLabel>
                  <Input
                    id="bambu-email"
                    type="email"
                    placeholder="you@example.com"
                    value={bambuEmail}
                    onChange={(e) => setBambuEmail(e.target.value)}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="bambu-password">Bambu Lab Password</FieldLabel>
                  <Input
                    id="bambu-password"
                    type="password"
                    placeholder="••••••••"
                    value={bambuPassword}
                    onChange={(e) => setBambuPassword(e.target.value)}
                    required
                  />
                </Field>

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
                <span className="rounded-lg bg-amber-500/10 p-2 text-amber-500">
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
                <Field>
                  <FieldLabel htmlFor="code">Verification Code</FieldLabel>
                  <Input
                    id="code"
                    inputMode="numeric"
                    placeholder="123456"
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value)}
                    required
                  />
                </Field>

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
                Choose a printer
              </CardTitle>
              <CardDescription>
                Printers on your Bambu Lab account appear here automatically. No
                IP address or access code needed.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loadingPrinters ? (
                <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                  <Spinner /> Looking for printers on your Bambu account…
                </div>
              ) : cloudPrinters.length > 0 ? (
                <>
                  <div className="space-y-2">
                    {cloudPrinters.map((device) => {
                      const selected = device.serial === selectedSerial;
                      return (
                        <button
                          key={device.serial}
                          type="button"
                          onClick={() => setSelectedSerial(device.serial)}
                          className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                            selected
                              ? "border-primary bg-primary/10"
                              : "bg-muted/20 hover:border-primary/40"
                          }`}
                        >
                          <span
                            className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${
                              selected
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-muted-foreground/40"
                            }`}
                          >
                            {selected ? <Check className="size-3" /> : null}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {device.name}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {device.model ?? "Bambu Lab printer"} ·{" "}
                              {device.serial}
                            </span>
                          </span>
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            Cloud
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <LoadingButton
                    type="button"
                    loading={busy}
                    className="w-full"
                    onClick={handleCloudPrinterSetup}
                  >
                    Add selected printer <Check />
                  </LoadingButton>
                </>
              ) : (
                <>
                  <Alert variant={printerLoadError ? "destructive" : undefined}>
                    <Info />
                    <AlertDescription>
                      {printerLoadError ??
                        "No printers were found on your Bambu Lab account. Bind the printer to your account in Bambu Handy, then refresh, or continue and add it later."}
                    </AlertDescription>
                  </Alert>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={loadCloudPrinters}
                  >
                    Refresh
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full"
                    onClick={async () => {
                      await api.skipSetup().catch(() => null);
                      router.push("/dashboard");
                    }}
                  >
                    Continue without a printer
                  </Button>
                </>
              )}

              {error ? (
                <Alert variant="destructive">
                  <AlertCircle />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {step === "done" ? (
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="mb-4 inline-flex rounded-full bg-emerald-500/10 p-4">
                <Check className="size-8 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h2 className="mb-2 text-xl font-bold">You&apos;re all set!</h2>
              <p className="mb-6 text-sm text-muted-foreground">
                Your dashboard is ready to go.
              </p>
              <Button
                size="lg"
                nativeButton={false}
                render={<Link href="/dashboard" />}
              >
                Go to Dashboard <ChevronRight />
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {demoAvailable ? (
          <div className="mt-6 text-center">
            <Button variant="ghost" size="sm" onClick={enterDemo}>
              <FlaskConical /> Skip setup and open demo dashboard
            </Button>
            <p className="mt-1 text-xs text-muted-foreground">
              Development only — mock data, no backend required.
            </p>
          </div>
        ) : null}
      </div>
    </main>
  );
}
