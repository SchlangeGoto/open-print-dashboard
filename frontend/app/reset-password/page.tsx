"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertCircle } from "lucide-react";

import { api } from "@/lib/api";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingButton } from "@/components/ui/loading-button";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token"));
    setChecked(true);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    if (!token) {
      setError("Missing or invalid reset token");
      return;
    }

    setBusy(true);
    try {
      await api.resetPassword(token, password);
      toast.success("Password updated. Please sign in.");
      router.push("/");
    } catch (err: any) {
      setError(err.message || "Failed to reset password");
    } finally {
      setBusy(false);
    }
  }

  if (checked && !token) {
    return (
      <AuthLayout
        title="Reset password"
        footer={
          <Link href="/" className="text-primary hover:underline">
            Back to sign in
          </Link>
        }
      >
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>Missing or invalid reset token.</AlertDescription>
        </Alert>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Reset password" description="Choose a new password">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">New Password</Label>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm-password">Confirm Password</Label>
          <Input
            id="confirm-password"
            type="password"
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            autoComplete="new-password"
          />
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <LoadingButton type="submit" loading={busy} className="w-full">
          Reset password
        </LoadingButton>
      </form>
    </AuthLayout>
  );
}
