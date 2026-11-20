"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, MailPlus, Trash2, Users } from "lucide-react";

import {
  api,
  type TenantInvite,
  type TenantInviteCreated,
  type TenantMember,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "@/lib/toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const ROLE_OPTIONS = ["admin", "operator", "viewer"] as const;

function roleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

export default function MembersPage() {
  const { tenants, activeTenantId } = useAuth();
  const activeTenant = tenants.find((tenant) => tenant.id === activeTenantId);
  const canManage =
    activeTenant?.role === "owner" || activeTenant?.role === "admin";

  const [members, setMembers] = useState<TenantMember[]>([]);
  const [invites, setInvites] = useState<TenantInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<TenantMember | null>(
    null,
  );

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("viewer");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [createdInvite, setCreatedInvite] =
    useState<TenantInviteCreated | null>(null);

  const [tenantName, setTenantName] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [tenantBusy, setTenantBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [memberList, inviteList] = await Promise.all([
        api.getTenantMembers(),
        api.getTenantInvites(),
      ]);
      setMembers(memberList);
      setInvites(inviteList);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Could not load members",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    void load();
  }, [canManage, load]);

  useEffect(() => {
    if (activeTenant) {
      setTenantName(activeTenant.name);
      setTenantSlug(activeTenant.slug);
    }
  }, [activeTenant]);

  async function handleRoleChange(member: TenantMember, role: string) {
    setBusyUserId(member.user_id);
    try {
      const updated = await api.updateTenantMember(member.user_id, role);
      setMembers((current) =>
        current.map((item) =>
          item.user_id === updated.user_id ? updated : item,
        ),
      );
      toast.success(`${updated.full_name || updated.email} is now ${role}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not change the role",
      );
    } finally {
      setBusyUserId(null);
    }
  }

  async function handleRemove() {
    if (!memberToRemove) return;
    const target = memberToRemove;
    setMemberToRemove(null);
    try {
      await api.removeTenantMember(target.user_id);
      setMembers((current) =>
        current.filter((member) => member.user_id !== target.user_id),
      );
      toast.success("Member removed");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not remove the member",
      );
    }
  }

  async function handleInvite(event: React.FormEvent) {
    event.preventDefault();
    setInviteBusy(true);
    try {
      const created = await api.createTenantInvite(
        inviteEmail.trim(),
        inviteRole,
      );
      setCreatedInvite(created);
      setInvites((current) => [created, ...current]);
      setInviteEmail("");
      setInviteRole("viewer");
      toast.success("Invitation created");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not create the invite",
      );
    } finally {
      setInviteBusy(false);
    }
  }

  async function handleRevoke(invite: TenantInvite) {
    try {
      await api.revokeTenantInvite(invite.id);
      setInvites((current) => current.filter((item) => item.id !== invite.id));
      toast.success("Invitation revoked");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not revoke the invite",
      );
    }
  }

  async function handleTenantSave(event: React.FormEvent) {
    event.preventDefault();
    setTenantBusy(true);
    try {
      await api.updateCurrentTenant({
        name: tenantName.trim(),
        slug: tenantSlug.trim(),
      });
      toast.success("Tenant updated");
      // The sidebar and permission checks use the auth-context copy.
      window.location.reload();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update the tenant",
      );
    } finally {
      setTenantBusy(false);
    }
  }

  if (!canManage) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
            <CardDescription>
              Only tenant owners and admins can manage users.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 pb-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Members</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            People with access to {activeTenant?.name ?? "this tenant"}.
          </p>
        </div>
        <Button onClick={() => setInviteOpen(true)}>
          <MailPlus /> Invite member
        </Button>
      </div>

      {loadError ? (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-4" /> Members
          </CardTitle>
          <CardDescription>
            Roles decide what each person can read and change.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.user_id}>
                  <TableCell>
                    <p className="font-medium">
                      {member.full_name || member.email}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {member.email}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={member.is_active ? "success" : "secondary"}>
                      {member.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={member.role}
                      onValueChange={(value) =>
                        value && void handleRoleChange(member, value)
                      }
                      disabled={busyUserId === member.user_id}
                    >
                      <SelectTrigger size="sm" className="min-w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="owner">Owner</SelectItem>
                        {ROLE_OPTIONS.map((role) => (
                          <SelectItem key={role} value={role}>
                            {roleLabel(role)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove ${member.email}`}
                      disabled={busyUserId === member.user_id}
                      onClick={() => setMemberToRemove(member)}
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pending invitations</CardTitle>
          <CardDescription>
            Invitations expire after seven days.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {invites.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No pending invitations.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invites.map((invite) => (
                  <TableRow key={invite.id}>
                    <TableCell>{invite.email}</TableCell>
                    <TableCell>{roleLabel(invite.role)}</TableCell>
                    <TableCell>{formatDate(invite.expires_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleRevoke(invite)}
                      >
                        Revoke
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tenant settings</CardTitle>
          <CardDescription>
            The slug is used in links and API headers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
            onSubmit={handleTenantSave}
          >
            <Field>
              <FieldLabel htmlFor="tenant-name">Name</FieldLabel>
              <Input
                id="tenant-name"
                value={tenantName}
                onChange={(event) => setTenantName(event.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="tenant-slug">Slug</FieldLabel>
              <Input
                id="tenant-slug"
                value={tenantSlug}
                onChange={(event) => setTenantSlug(event.target.value)}
                pattern="[a-z0-9-]+"
                required
              />
            </Field>
            <Button type="submit" disabled={tenantBusy}>
              {tenantBusy ? "Saving…" : "Save"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Dialog
        open={inviteOpen}
        onOpenChange={(open) => {
          setInviteOpen(open);
          if (!open) setCreatedInvite(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite a member</DialogTitle>
            <DialogDescription>
              They keep their existing account and gain access to this tenant.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleInvite}>
            <Field>
              <FieldLabel htmlFor="invite-email">Email</FieldLabel>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="invite-role">Role</FieldLabel>
              <Select
                value={inviteRole}
                onValueChange={(value) => value && setInviteRole(value)}
              >
                <SelectTrigger id="invite-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((role) => (
                    <SelectItem key={role} value={role}>
                      {roleLabel(role)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {createdInvite?.accept_url ? (
              <Alert>
                <AlertDescription className="space-y-2">
                  <p>
                    Email delivery is off. Share this one-time link with the
                    invited person:
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 text-xs">
                      {createdInvite.accept_url}
                    </code>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="outline"
                      aria-label="Copy invitation link"
                      onClick={() => {
                        void navigator.clipboard?.writeText(
                          createdInvite.accept_url!,
                        );
                        toast.success("Link copied");
                      }}
                    >
                      <Copy />
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            ) : createdInvite ? (
              <Alert>
                <AlertDescription>
                  Invitation created. The link was sent by email.
                </AlertDescription>
              </Alert>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setInviteOpen(false)}
              >
                Close
              </Button>
              <Button type="submit" disabled={inviteBusy}>
                {inviteBusy ? "Creating…" : "Create invitation"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(memberToRemove)}
        onOpenChange={(open) => !open && setMemberToRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member?</AlertDialogTitle>
            <AlertDialogDescription>
              {memberToRemove?.email} loses access to this tenant. Their account
              and other tenants are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleRemove()}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
