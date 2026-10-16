"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Archive, Check, Package, Pencil, Plus, Trash2, Zap } from "lucide-react";

import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingButton } from "@/components/ui/loading-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SpoolIndicator } from "@/components/ui/SpoolIndicator";
import { formatDate, formatWeight, stockColor } from "@/lib/utils";
import SpoolModal from "@/components/modals/SpoolModal";

export default function SpoolsPage() {
  const [spools, setSpools] = useState<any[]>([]);
  const [filaments, setFilaments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selectedSpool, setSelectedSpool] = useState<any>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const [form, setForm] = useState({
    filament_id: "",
    total_weight_g: 1000,
    remaining_g: 1000,
    price_per_kg: "",
    purchased_at: "",
    nfc_uid: "",
    notes: "",
  });

  async function load() {
    try {
      const [sp, fil] = await Promise.all([api.getSpools(), api.getFilaments()]);
      setSpools(sp);
      setFilaments(fil);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

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
      nfc_uid: "",
      notes: "",
    });
    setEditingId(null);
    setFormOpen(true);
  }

  function openEdit(s: any, e: React.MouseEvent) {
    e.stopPropagation();
    setForm({
      filament_id: String(s.filament_id ?? ""),
      total_weight_g: s.total_weight_g,
      remaining_g: s.remaining_g,
      price_per_kg: s.price_per_kg ?? "",
      purchased_at: s.purchased_at ? s.purchased_at.split("T")[0] : "",
      nfc_uid: s.nfc_uid ?? "",
      notes: s.notes ?? "",
    });
    setEditingId(s.id);
    setFormOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      filament_id: form.filament_id || null,
      total_weight_g: Number(form.total_weight_g),
      remaining_g: Number(form.remaining_g),
      price_per_kg: form.price_per_kg ? Number(form.price_per_kg) : null,
      purchased_at: form.purchased_at ? new Date(form.purchased_at).toISOString() : null,
      nfc_uid: form.nfc_uid || null,
      notes: form.notes || null,
    };
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

  async function handleActivate(id: string) {
    try {
      await api.activateSpool(id);
      toast.success("Spool loaded");
      load();
    } catch (err: any) {
      toast.error(err.message);
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
        <div className="h-7 w-24 rounded skeleton" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-56 rounded-xl skeleton" />
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
        <Button size="sm" onClick={openCreate} disabled={filaments.length === 0}>
          <Plus /> Add Spool
        </Button>
      </div>

      {filaments.length === 0 ? (
        <div className="rounded-lg border border-amber-800/50 bg-amber-950/30 p-3 text-sm text-amber-300">
          Create a filament type first before adding spools.
        </div>
      ) : null}

      {spools.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No spools"
          description="Add spools to track your filament usage per roll."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {spools.map((s) => {
            const fil = getFilament(s.filament_id);
            const pct =
              s.total_weight_g > 0
                ? Math.round((s.remaining_g / s.total_weight_g) * 100)
                : 0;
            return (
              <Card
                key={s.id}
                onClick={() => setSelectedSpool(s)}
                className="group relative cursor-pointer gap-4 transition-colors hover:border-primary/40"
              >
                <CardContent className="flex flex-col gap-3">
                  <div className="absolute left-3 top-3 z-10">
                    {s.active ? (
                      <Badge variant="success">
                        <Check className="size-2.5" /> Active
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        <Archive className="size-2.5" /> Stored
                      </Badge>
                    )}
                  </div>

                  <div className="absolute right-3 top-3 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button variant="secondary" size="icon-sm" onClick={(e) => openEdit(s, e)}>
                      <Pencil />
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon-sm"
                      className="hover:text-red-400"
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
                    />
                  </div>

                  <div className="text-center">
                    <p className="text-sm font-semibold">
                      {fil?.color_name ?? "Unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {fil ? `${fil.brand} · ${fil.material}` : "No filament"}
                    </p>
                  </div>

                  <div>
                    <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                      <span>{formatWeight(s.remaining_g)}</span>
                      <span className="tabular-nums">{pct}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: stockColor(pct, fil?.color_hex),
                        }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 text-[10px] text-muted-foreground">
                    <span>{s.price_per_kg ? `€${s.price_per_kg}/kg` : "No price"}</span>
                    <span className="text-right">
                      {s.last_used_at ? formatDate(s.last_used_at) : "Never used"}
                    </span>
                  </div>

                  {!s.active ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleActivate(s.id);
                      }}
                    >
                      <Zap /> Load Spool
                    </Button>
                  ) : null}
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
            <div className="space-y-2">
              <Label>Filament</Label>
              <Select
                value={form.filament_id}
                onValueChange={(v) => setForm({ ...form, filament_id: v })}
              >
                <SelectTrigger className="w-full">
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
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="total-weight">Total Weight (g)</Label>
                <Input
                  id="total-weight"
                  type="number"
                  value={form.total_weight_g}
                  onChange={(e) => setForm({ ...form, total_weight_g: Number(e.target.value) })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="remaining">Remaining (g)</Label>
                <Input
                  id="remaining"
                  type="number"
                  value={form.remaining_g}
                  onChange={(e) => setForm({ ...form, remaining_g: Number(e.target.value) })}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="price">Price / kg (€)</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  placeholder="24.99"
                  value={form.price_per_kg}
                  onChange={(e) => setForm({ ...form, price_per_kg: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="purchased">Purchased</Label>
                <Input
                  id="purchased"
                  type="date"
                  value={form.purchased_at}
                  onChange={(e) => setForm({ ...form, purchased_at: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="nfc">NFC UID (optional)</Label>
              <Input
                id="nfc"
                placeholder="04:A2:3F:…"
                value={form.nfc_uid}
                onChange={(e) => setForm({ ...form, nfc_uid: e.target.value })}
              />
            </div>

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

      <Dialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Spool?</DialogTitle>
            <DialogDescription>
              This will permanently delete this spool and its history.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => confirmDelete !== null && handleDelete(confirmDelete)}
            >
              <Trash2 /> Delete
            </Button>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selectedSpool ? (
        <SpoolModal
          spool={selectedSpool}
          filament={getFilament(selectedSpool.filament_id)}
          onClose={() => setSelectedSpool(null)}
          onActivate={async () => {
            await api.activateSpool(selectedSpool.id);
            setSelectedSpool(null);
            load();
          }}
        />
      ) : null}
    </div>
  );
}
