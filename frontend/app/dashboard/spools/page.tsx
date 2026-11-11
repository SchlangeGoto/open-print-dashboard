"use client";

import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { toast } from "@/lib/toast";
import {
  Archive,
  Check,
  Eye,
  Package,
  Pencil,
  Plus,
  Trash2,
  Zap,
} from "lucide-react";

import { api, type Printer } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LoadingButton } from "@/components/ui/loading-button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SpoolIndicator } from "@/components/ui/SpoolIndicator";
import { formatDate, formatWeight } from "@/lib/utils";
import LoadSpoolModal from "@/components/modals/LoadSpoolModal";
import SpoolModal from "@/components/modals/SpoolModal";

export default function SpoolsPage() {
  const [spools, setSpools] = useState<any[]>([]);
  const [filaments, setFilaments] = useState<any[]>([]);
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedSpool, setSelectedSpool] = useState<any>(null);
  const [loadingSpool, setLoadingSpool] = useState<any>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const [form, setForm] = useState<{
    filament_id: string;
    total_weight_g: number;
    remaining_g: number | "";
    price_per_kg: string;
    purchased_at: string;
    notes: string;
  }>({
    filament_id: "",
    total_weight_g: 1000,
    remaining_g: 1000,
    price_per_kg: "",
    purchased_at: "",
    notes: "",
  });

  const editingUnknown = Boolean(
    editingId
      ? spools.find((s) => s.id === editingId)?.remaining_unknown
      : false,
  );

  const load = useCallback(async () => {
    try {
      const [sp, fil, devices] = await Promise.all([
        api.getSpools(),
        api.getFilaments(),
        api.getPrinters(),
      ]);
      setSpools(sp);
      setFilaments(fil);
      setPrinters(devices);
      setLoadError(null);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Could not reach the server",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function getFilament(id: string | null) {
    return filaments.find((f) => f.id === id);
  }

  function openCreate() {
    setForm({
      filament_id: filaments.length > 0 ? String(filaments[0].id) : "",
      total_weight_g: 1000,
      remaining_g: 1000,
      price_per_kg: "",
      purchased_at: "",
      notes: "",
    });
    setEditingId(null);
    setFormOpen(true);
  }

  function beginEdit(s: any) {
    setForm({
      filament_id: String(s.filament_id ?? ""),
      total_weight_g: s.total_weight_g,
      // Leave the field empty: the stored value is only the nominal capacity,
      // not a measurement. Omitting it from the PUT keeps the unknown state.
      remaining_g: s.remaining_unknown ? "" : s.remaining_g,
      price_per_kg: s.price_per_kg ?? "",
      purchased_at: s.purchased_at
        ? format(new Date(s.purchased_at), "yyyy-MM-dd")
        : "",
      notes: s.notes ?? "",
    });
    setEditingId(s.id);
    setSelectedSpool(null);
    setFormOpen(true);
  }

  function openEdit(s: any, e: React.MouseEvent) {
    e.stopPropagation();
    beginEdit(s);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const payload: Record<string, unknown> = {
      filament_id: form.filament_id || null,
      total_weight_g: Number(form.total_weight_g),
      price_per_kg: form.price_per_kg ? Number(form.price_per_kg) : null,
      purchased_at: form.purchased_at
        ? new Date(`${form.purchased_at}T00:00:00`).toISOString()
        : null,
      notes: form.notes || null,
    };
    // Only send the weight when the user actually entered one. A blank field
    // on an unknown spool must not confirm the nominal placeholder.
    if (form.remaining_g !== "") {
      payload.remaining_g = Number(form.remaining_g);
    }
    setSaving(true);
    try {
      if (editingId) {
        await api.updateSpool(editingId, payload);
        toast.success("Spool updated");
      } else {
        await api.createSpool(payload);
        toast.success("Spool created");
      }
      setFormOpen(false);
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.deleteSpool(id);
      toast.success("Spool deleted");
      setConfirmDelete(null);
      load();
    } catch {
      toast.error("Failed to delete");
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-24" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Spools</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {spools.length} spools tracked
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={openCreate} disabled={filaments.length === 0}>
            <Plus /> Add Spool
          </Button>
        </div>
      </div>

      {filaments.length === 0 ? (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-700 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-300">
          Create a filament type first before adding spools.
        </div>
      ) : null}

      {loadError ? (
        <div
          role="alert"
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400"
        >
          Could not refresh: {loadError}. Showing the last known data.
        </div>
      ) : null}

      {spools.length === 0 ? (
        <EmptyState
          icon={Package}
          title={loadError ? "Could not load spools" : "No spools"}
          description={
            loadError ??
            "Add spools to track your filament usage per roll."
          }
          action={
            loadError ? (
              <Button variant="outline" onClick={() => void load()}>
                Try again
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {spools.map((s, spoolIndex) => {
            const fil = getFilament(s.filament_id);
            const unknown = Boolean(s.remaining_unknown);
            const pct =
              !unknown && s.total_weight_g > 0
                ? Math.round((s.remaining_g / s.total_weight_g) * 100)
                : 0;
            return (
              <Card
                key={s.id}
                onClick={() => setSelectedSpool(s)}
                className="group relative cursor-pointer gap-4 transition-colors hover:ring-primary/40"
              >
                <CardContent className="flex flex-col gap-3">
                  <div className="absolute left-3 top-3 z-10 flex flex-col items-start gap-1">
                    {s.active ? (
                      <Badge variant="success">
                        <Check className="size-2.5" /> Active
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        <Archive className="size-2.5" /> Stored
                      </Badge>
                    )}
                    {unknown ? (
                      <Badge variant="warning">Weight unknown</Badge>
                    ) : null}
                  </div>

                  <div className="absolute right-3 top-3 z-10 flex gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                    <Button
                      variant="secondary"
                      size="icon-sm"
                      aria-label={`View ${fil?.color_name ?? "spool"}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedSpool(s);
                      }}
                    >
                      <Eye />
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon-sm"
                      aria-label={`Edit ${fil?.color_name ?? "spool"}`}
                      onClick={(e) => openEdit(s, e)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon-sm"
                      aria-label={`Delete ${fil?.color_name ?? "spool"}`}
                      className="hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDelete(s.id);
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>

                  <div className="flex justify-center pt-6">
                    <SpoolIndicator
                      remaining={s.remaining_g}
                      total={s.total_weight_g}
                      color={fil?.color_hex ?? "#555"}
                      size={100}
                      unknown={unknown}
                    />
                  </div>

                  <div className="text-center">
                    <p className="text-sm font-semibold">
                      {fil?.color_name ?? "Unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {fil ? `${fil.brand} · ${fil.material}` : "No filament"}
                    </p>
                    {s.printer_id ? (
                      <p className="mt-1 text-[10px] text-primary">
                        Loaded on{" "}
                        {printers.find((printer) => printer.id === s.printer_id)
                          ?.name ?? "printer"}
                      </p>
                    ) : null}
                  </div>

                  <div>
                    {unknown ? (
                      <p className="text-xs text-muted-foreground">
                        Added from printer · set the remaining weight
                      </p>
                    ) : (
                      <>
                        <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                          <span>{formatWeight(s.remaining_g)}</span>
                          <span className="tabular-nums">{pct}%</span>
                        </div>
                        <Progress
                          aria-label={`Spool remaining for ${fil?.color_name ?? "spool"}, item ${spoolIndex + 1} of ${spools.length}`}
                          value={pct}
                          className="[&_[data-slot=progress-track]]:h-1.5 [&_[data-slot=progress-indicator]]:bg-[var(--spool-color)]"
                          style={
                            {
                              "--spool-color": fil?.color_hex ?? "#9ca3af",
                            } as React.CSSProperties
                          }
                        />
                      </>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 text-[10px] text-muted-foreground">
                    <span>{s.price_per_kg ? `€${s.price_per_kg}/kg` : "No price"}</span>
                    <span className="text-right">
                      {s.last_used_at ? formatDate(s.last_used_at) : "Never used"}
                    </span>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLoadingSpool(s);
                    }}
                  >
                    <Zap /> {s.active ? "Move Spool" : "Load Spool"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Spool" : "Add Spool"}</DialogTitle>
            <DialogDescription>Track a filament spool.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <Field>
              <FieldLabel htmlFor="filament">Filament</FieldLabel>
              <Select
                value={form.filament_id}
                onValueChange={(v) => setForm({ ...form, filament_id: v ?? "" })}
                items={filaments.map((filament) => ({
                  value: String(filament.id),
                  label: `${filament.brand} — ${filament.color_name} (${filament.material})`,
                }))}
              >
                <SelectTrigger id="filament" className="w-full">
                  <SelectValue placeholder="Select filament…" />
                </SelectTrigger>
                <SelectContent>
                  {filaments.map((f) => (
                    <SelectItem key={f.id} value={String(f.id)}>
                      {f.brand} — {f.color_name} ({f.material})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="total-weight">Total Weight (g)</FieldLabel>
                <Input
                  id="total-weight"
                  type="number"
                  value={form.total_weight_g}
                  onChange={(e) => setForm({ ...form, total_weight_g: Number(e.target.value) })}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="remaining">Remaining (g)</FieldLabel>
                <Input
                  id="remaining"
                  type="number"
                  value={form.remaining_g}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      remaining_g:
                        e.target.value === "" ? "" : Number(e.target.value),
                    })
                  }
                  required={!editingUnknown}
                />
                {editingUnknown ? (
                  <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                    The printer could not read the weight of this spool. Enter
                    the remaining grams.
                  </p>
                ) : null}
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field>
                <FieldLabel htmlFor="price">Price / kg (€)</FieldLabel>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  placeholder="24.99"
                  value={form.price_per_kg}
                  onChange={(e) => setForm({ ...form, price_per_kg: e.target.value })}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="purchased">Purchased</FieldLabel>
                <DatePicker
                  id="purchased"
                  value={form.purchased_at}
                  onChange={(purchased_at) =>
                    setForm({ ...form, purchased_at })
                  }
                />
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor="spool-notes">Notes</FieldLabel>
              <Textarea
                id="spool-notes"
                placeholder="Optional notes…"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </Field>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <LoadingButton type="submit" loading={saving}>
                {editingId ? "Update" : "Create"}
              </LoadingButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive">
              <Trash2 />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete Spool?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this spool and its history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => confirmDelete !== null && handleDelete(confirmDelete)}
            >
              <Trash2 /> Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {selectedSpool ? (
        <SpoolModal
          spool={selectedSpool}
          filament={getFilament(selectedSpool.filament_id)}
          onClose={() => setSelectedSpool(null)}
          onRequestLoad={(spool) => {
            setSelectedSpool(null);
            setLoadingSpool(spool);
          }}
          onEdit={beginEdit}
        />
      ) : null}

      {loadingSpool ? (
        <LoadSpoolModal
          spool={loadingSpool}
          filament={getFilament(loadingSpool.filament_id)}
          printers={printers}
          onClose={() => setLoadingSpool(null)}
          onLoaded={load}
        />
      ) : null}
    </div>
  );
}
