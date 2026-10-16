"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2 } from "lucide-react";

import { api } from "@/lib/api";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingButton } from "@/components/ui/loading-button";

export default function RecoverPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.recoverPassword(email);
      setSent(true);
    } catch (err: any) {
      setError(err.message || "Request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Password recovery"
      description="We'll email you a link to reset your password"
      footer={
        <Link href="/" className="text-primary hover:underline">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <Alert>
          <CheckCircle2 />
          <AlertDescription>
            If that email is registered, we sent a password recovery link.
          </AlertDescription>
        </Alert>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
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

          {error ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <LoadingButton type="submit" loading={busy} className="w-full">
            Send recovery link
          </LoadingButton>
        </form>
      )}
    </AuthLayout>
  );
}
