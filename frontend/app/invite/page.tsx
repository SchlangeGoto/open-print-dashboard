"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Mail } from "lucide-react";

import {
  api,
  clearTokens,
  hasStoredSession,
  type TenantInviteInfo,
  type UserPublic,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { AuthLayout } from "@/components/layout/AuthLayout";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { LoadingButton } from "@/components/ui/loading-button";
import { Spinner } from "@/components/ui/spinner";

export default function InvitePage() {
  const router = useRouter();
  const { login } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [info, setInfo] = useState<TenantInviteInfo | null>(null);
  const [me, setMe] = useState<UserPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const value = search.get("token");
    setToken(value);
    if (!value) {
      setLoading(false);
      return;
    }
    async function load() {
      try {
        const invite = await api.getInvite(value!);
        setInfo(invite);
        if (hasStoredSession()) {
          try {
            setMe(await api.getMe());
          } catch {
            setMe(null);
          }
        }
      } catch (err: any) {
        setError(err.message || "Invitation is no longer valid");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  async function accept() {
    if (!token) return;
    setBusy(true);
    setError("");
    try {
      await api.acceptInvite(token);
      toast.success("Invitation accepted");
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Could not accept the invitation");
    } finally {
      setBusy(false);
    }
  }

  async function register(event: React.FormEvent) {
    event.preventDefault();
    if (!token || !info) return;
    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.registerFromInvite(token, password, fullName || undefined);
      await api.loginUser(info.email, password);
      login(info.email);
      toast.success(`Welcome to ${info.tenant_name}`);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.message || "Could not create the account");
    } finally {
      setBusy(false);
    }
  }

  function signOutAndRetry() {
    void api.logout().finally(() => {
      clearTokens();
      window.location.reload();
    });
  }

  if (loading) {
    return (
      <main className="flex min-h-svh items-center justify-center bg-background">
        <Spinner className="size-5 text-primary" />
      </main>
    );
  }

  if (!token || !info) {
    return (
      <AuthLayout
        title="Invitation"
        footer={
          <Link href="/" className="text-primary hover:underline">
            Back to sign in
          </Link>
        }
      >
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>
            {error || "This invitation link is invalid or has expired."}
          </AlertDescription>
        </Alert>
      </AuthLayout>
    );
  }

  const matchingUser =
    me && me.email.toLowerCase() === info.email.toLowerCase();

  if (me && !matchingUser) {
    return (
      <AuthLayout
        title={`Join ${info.tenant_name}`}
        description={`This invitation was sent to ${info.email}`}
      >
        <div className="space-y-4">
          <Alert>
            <AlertCircle />
            <AlertDescription>
              You are signed in as {me.email}. Sign out and open the link again
              with the invited address.
            </AlertDescription>
          </Alert>
          <Button className="w-full" variant="outline" onClick={signOutAndRetry}>
            Sign out
          </Button>
        </div>
      </AuthLayout>
    );
  }

  if (matchingUser) {
    return (
      <AuthLayout
        title={`Join ${info.tenant_name}`}
        description={`You were invited as ${info.role}`}
        footer={
          <Link href="/dashboard" className="text-primary hover:underline">
            Back to dashboard
          </Link>
        }
      >
        <div className="space-y-4">
          <Alert>
            <CheckCircle2 />
            <AlertDescription>
              Signed in as {me.email}. Continue to add this tenant to your
              account.
            </AlertDescription>
          </Alert>
          {error ? (
            <Alert variant="destructive">
              <AlertCircle />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <LoadingButton
            className="w-full"
            loading={busy}
            onClick={() => void accept()}
          >
            Accept invitation
          </LoadingButton>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={`Join ${info.tenant_name}`}
      description={`You were invited as ${info.role} to ${info.email}`}
      footer={
        <Link href="/" className="text-primary hover:underline">
          Already have an account? Sign in
        </Link>
      }
    >
      <form className="space-y-4" onSubmit={register}>
        <Alert>
          <Mail />
          <AlertDescription>
            Set a password to create your account. The invitation expires on{" "}
            {new Date(info.expires_at).toLocaleDateString()}.
          </AlertDescription>
        </Alert>
        <Field>
          <FieldLabel htmlFor="invite-name">Full name</FieldLabel>
          <Input
            id="invite-name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            autoComplete="name"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="invite-email">Email</FieldLabel>
          <Input id="invite-email" value={info.email} readOnly disabled />
        </Field>
        <Field>
          <FieldLabel htmlFor="invite-password">Password</FieldLabel>
          <Input
            id="invite-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            required
            autoComplete="new-password"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="invite-confirm">Confirm password</FieldLabel>
          <Input
            id="invite-confirm"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            minLength={8}
            required
            autoComplete="new-password"
          />
        </Field>
        {error ? (
          <Alert variant="destructive">
            <AlertCircle />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <LoadingButton type="submit" className="w-full" loading={busy}>
          Create account and join
        </LoadingButton>
      </form>
    </AuthLayout>
  );
}
