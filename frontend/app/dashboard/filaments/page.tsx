"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Palette, Pencil, Plus, Thermometer, Trash2 } from "lucide-react";

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
import { formatWeight } from "@/lib/utils";
import FilamentModal from "@/components/modals/FilamentModal";

const MATERIALS = ["PLA", "PETG", "ABS", "ASA", "TPU", "Nylon", "PC", "PVA", "Other"];

const emptyFilament = {
  brand: "",
  material: "PLA",
  color_name: "",
  color_hex: "#3b82f6",
  nozzle_temp_min: 190,
  nozzle_temp_max: 220,
  bed_temp: 60,
  bambu_info_idx: "",
  notes: "",
};

export default function FilamentsPage() {
  const [filaments, setFilaments] = useState<any[]>([]);
  const [spoolsByFilament, setSpoolsByFilament] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyFilament });
  const [saving, setSaving] = useState(false);
  const [selectedFilament, setSelectedFilament] = useState<any>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  async function load() {
    try {
      const fils = await api.getFilaments();
      setFilaments(fils);
      const spoolMap: Record<string, any[]> = {};
      await Promise.all(
        fils.map(async (f: any) => {
          spoolMap[f.id] = await api.getFilamentSpools(f.id).catch(() => []);
        }),
      );
      setSpoolsByFilament(spoolMap);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openCreate() {
    setForm({ ...emptyFilament });
    setEditingId(null);
    setFormOpen(true);
  }

  function openEdit(f: any, e: React.MouseEvent) {
    e.stopPropagation();
    setForm({
      brand: f.brand,
      material: f.material,
      color_name: f.color_name,
      color_hex: f.color_hex,
      nozzle_temp_min: f.nozzle_temp_min ?? 190,
      nozzle_temp_max: f.nozzle_temp_max ?? 220,
      bed_temp: f.bed_temp ?? 60,
      bambu_info_idx: f.bambu_info_idx ?? "",
      notes: f.notes ?? "",
    });
    setEditingId(f.id);
    setFormOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingId) {
        await api.updateFilament(editingId, form);
        toast.success("Filament updated");
      } else {
        await api.createFilament(form);
        toast.success("Filament created");
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
      await api.deleteFilament(id);
      toast.success("Filament deleted");
      setConfirmDelete(null);
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete");
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-7 w-32 rounded skeleton" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-44 rounded-xl skeleton" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Filaments</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {filaments.length} types in library
          </p>
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus /> Add Filament
        </Button>
      </div>

      {filaments.length === 0 ? (
        <EmptyState
          icon={Palette}
          title="No filaments"
          description="Add your first filament type to start tracking inventory."
          action={
            <Button onClick={openCreate}>
              <Plus /> Add Filament
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filaments.map((f) => {
            const spools = spoolsByFilament[f.id] ?? [];
            const remaining = spools.reduce((s, sp) => s + sp.remaining_g, 0);
            return (
              <Card
                key={f.id}
                onClick={() => setSelectedFilament(f)}
                className="group relative cursor-pointer transition-colors hover:border-primary/40"
              >
                <CardContent className="space-y-4">
                  <div className="absolute right-3 top-3 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button variant="secondary" size="icon-sm" onClick={(e) => openEdit(f, e)}>
                      <Pencil />
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon-sm"
                      className="hover:text-red-400"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDelete(f.id);
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>

                  <div className="flex items-center gap-3">
                    <div
                      className="size-12 shrink-0 rounded-xl border shadow-inner"
                      style={{ backgroundColor: f.color_hex }}
                    />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{f.color_name}</p>
                      <p className="text-xs text-muted-foreground">{f.brand}</p>
                    </div>
                    <Badge variant="secondary" className="ml-auto">
                      {f.material}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg border bg-muted/40 p-2.5">
                      <p className="text-muted-foreground">In Stock</p>
                      <p className="mt-0.5 font-medium">{formatWeight(remaining)}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/40 p-2.5">
                      <p className="text-muted-foreground">Spools</p>
                      <p className="mt-0.5 font-medium">{spools.length}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/40 p-2.5">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Thermometer className="size-2.5" /> Nozzle
                      </div>
                      <p className="mt-0.5 font-medium">
                        {f.nozzle_temp_min && f.nozzle_temp_max
                          ? `${f.nozzle_temp_min}–${f.nozzle_temp_max}°C`
                          : "—"}
                      </p>
                    </div>
                    <div className="rounded-lg border bg-muted/40 p-2.5">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Thermometer className="size-2.5" /> Bed
                      </div>
                      <p className="mt-0.5 font-medium">
                        {f.bed_temp ? `${f.bed_temp}°C` : "—"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Filament" : "Add Filament"}</DialogTitle>
            <DialogDescription>
              Fill in the details of the filament type.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="brand">Brand</Label>
                <Input
                  id="brand"
                  placeholder="Bambu Lab"
                  value={form.brand}
                  onChange={(e) => setForm({ ...form, brand: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Material</Label>
                <Select
                  value={form.material}
                  onValueChange={(v) => setForm({ ...form, material: v })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select material" />
                  </SelectTrigger>
                  <SelectContent>
                    {MATERIALS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="color-name">Color Name</Label>
                <Input
                  id="color-name"
                  placeholder="Matte Black"
                  value={form.color_name}
                  onChange={(e) => setForm({ ...form, color_name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="color-hex">Color</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form.color_hex}
                    onChange={(e) => setForm({ ...form, color_hex: e.target.value })}
                    className="size-9 cursor-pointer rounded-lg border bg-transparent"
                  />
                  <Input
                    id="color-hex"
                    value={form.color_hex}
                    onChange={(e) => setForm({ ...form, color_hex: e.target.value })}
                    className="flex-1"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="nozzle-min">Nozzle Min °C</Label>
                <Input
                  id="nozzle-min"
                  type="number"
                  value={form.nozzle_temp_min ?? ""}
                  onChange={(e) => setForm({ ...form, nozzle_temp_min: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nozzle-max">Nozzle Max °C</Label>
                <Input
                  id="nozzle-max"
                  type="number"
                  value={form.nozzle_temp_max ?? ""}
                  onChange={(e) => setForm({ ...form, nozzle_temp_max: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bed">Bed °C</Label>
                <Input
                  id="bed"
                  type="number"
                  value={form.bed_temp ?? ""}
                  onChange={(e) => setForm({ ...form, bed_temp: Number(e.target.value) })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="bambu-idx">Bambu Info Index</Label>
              <Input
                id="bambu-idx"
                placeholder="GFL99"
                value={form.bambu_info_idx}
                onChange={(e) => setForm({ ...form, bambu_info_idx: e.target.value })}
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
            <DialogTitle>Delete Filament?</DialogTitle>
            <DialogDescription>
              This will permanently delete the filament and all associated spools.
              This cannot be undone.
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

      {selectedFilament ? (
        <FilamentModal
          filament={selectedFilament}
          spools={spoolsByFilament[selectedFilament.id] ?? []}
          onClose={() => setSelectedFilament(null)}
          onRefresh={load}
        />
      ) : null}
    </div>
  );
}
