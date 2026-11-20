"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  ExternalLink,
  Plus,
  Power,
  Trash2,
} from "lucide-react";

import { api, type TenantPublic } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "@/lib/toast";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { LoadingButton } from "@/components/ui/loading-button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

export default function TenantsPage() {
  const { user, switchTenant, refreshTenants } = useAuth();
  const [tenants, setTenants] = useState<TenantPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [createBusy, setCreateBusy] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<TenantPublic | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setTenants(await api.getTenants());
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Could not load tenants",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user?.is_superuser) void load();
    else setLoading(false);
  }, [load, user?.is_superuser]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setCreateBusy(true);
    try {
      const tenant = await api.createTenant(name.trim(), slug.trim());
      setTenants((current) => [...current, tenant]);
      setName("");
      setSlug("");
      setCreateOpen(false);
      await refreshTenants();
      toast.success("Tenant created");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not create the tenant",
      );
    } finally {
      setCreateBusy(false);
    }
  }

  async function toggleActive(tenant: TenantPublic) {
    setBusyId(tenant.id);
    try {
      const updated = await api.updateTenant(tenant.id, {
        is_active: !tenant.is_active,
      });
      setTenants((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      await refreshTenants();
      toast.success(updated.is_active ? "Tenant activated" : "Tenant deactivated");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update the tenant",
      );
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await api.deleteTenant(deleteTarget.id, deleteConfirm.trim());
      setTenants((current) =>
        current.filter((item) => item.id !== deleteTarget.id),
      );
      await refreshTenants();
      toast.success("Tenant deleted");
      setDeleteTarget(null);
      setDeleteConfirm("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not delete the tenant",
      );
    } finally {
      setDeleteBusy(false);
    }
  }

  if (!user?.is_superuser) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle>Tenants</CardTitle>
            <CardDescription>
              Only platform administrators can manage tenants.
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
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tenants</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every workspace hosted on this deployment.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus /> Create tenant
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
            <Building2 className="size-4" /> Workspaces
          </CardTitle>
          <CardDescription>
            Deactivate a tenant to cut off access without deleting its data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.map((tenant) => (
                <TableRow key={tenant.id}>
                  <TableCell>
                    <p className="font-medium">{tenant.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {tenant.slug}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={tenant.is_active ? "success" : "secondary"}>
                      {tenant.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(tenant.created_at)}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={!tenant.is_active}
                        onClick={() => switchTenant(tenant.id)}
                      >
                        <ExternalLink /> Open
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busyId === tenant.id || tenant.slug === "default"}
                        onClick={() => void toggleActive(tenant)}
                      >
                        <Power />
                        {tenant.is_active ? "Deactivate" : "Activate"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${tenant.name}`}
                        disabled={tenant.slug === "default"}
                        onClick={() => {
                          setDeleteTarget(tenant);
                          setDeleteConfirm("");
                        }}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a tenant</DialogTitle>
            <DialogDescription>
              The workspace starts empty. Invite its owner from the Members page.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleCreate}>
            <Field>
              <FieldLabel htmlFor="tenant-name">Name</FieldLabel>
              <Input
                id="tenant-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="tenant-slug">Slug</FieldLabel>
              <Input
                id="tenant-slug"
                value={slug}
                onChange={(event) => setSlug(event.target.value.toLowerCase())}
                pattern="[a-z0-9-]+"
                placeholder="customer-a"
                required
              />
            </Field>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <LoadingButton type="submit" loading={createBusy}>
                Create tenant
              </LoadingButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteConfirm("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes every printer, spool, print job, member and setting.
              Type <strong>{deleteTarget?.slug}</strong> to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={deleteConfirm}
            onChange={(event) => setDeleteConfirm(event.target.value)}
            placeholder={deleteTarget?.slug}
            aria-label="Tenant slug confirmation"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteBusy || deleteConfirm !== deleteTarget?.slug}
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
            >
              Delete tenant
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
