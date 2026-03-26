"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatWeight, formatCurrency } from "@/lib/utils";
import { Palette, Plus, Pencil, Trash2, Package } from "lucide-react";
import toast from "react-hot-toast";

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
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyFilament });

  async function load() {
    try {
      setFilaments(await api.getFilaments());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setForm({ ...emptyFilament });
    setEditingId(null);
    setModalOpen(true);
  }

  function openEdit(f: any) {
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
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editingId) {
        await api.updateFilament(editingId, form);
        toast.success("Filament updated");
      } else {
        await api.createFilament(form);
        toast.success("Filament created");
      }
      setModalOpen(false);
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this filament and all associated spools?")) return;
    try {
      await api.deleteFilament(id);
      toast.success("Filament deleted");
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete");
    }
  }

  const materials = ["PLA", "PETG", "ABS", "ASA", "TPU", "Nylon", "PC", "PVA", "Other"];

  if (loading) {
    return <div className="animate-pulse text-zinc-500 p-8">Loading filaments...</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Filaments</h1>
          <p className="text-sm text-muted mt-1">Manage your filament library</p>
        </div>
        <Button onClick={openCreate}>
          <Plus size={16} /> Add Filament
        </Button>
      </div>

      {filaments.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filaments.map((f) => (
            <Card key={f.id}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-xl border-2 border-zinc-700"
                    style={{ backgroundColor: f.color_hex }}
                  />
                  <div>
                    <p className="font-semibold">{f.color_name}</p>
                    <p className="text-xs text-muted">
                      {f.brand} · {f.material}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(f)}>
                    <Pencil size={14} />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(f.id)}>
                    <Trash2 size={14} className="text-red-400" />
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted">Remaining</p>
                  <p className="font-medium">{formatWeight(f.total_remaining_g)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted">Avg Price</p>
                  <p className="font-medium">
                    {f.avg_price_per_kg ? `€${f.avg_price_per_kg}/kg` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted">Nozzle Temp</p>
                  <p className="font-medium">
                    {f.nozzle_temp_min && f.nozzle_temp_max
                      ? `${f.nozzle_temp_min}–${f.nozzle_temp_max}°C`
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted">Bed Temp</p>
                  <p className="font-medium">{f.bed_temp ? `${f.bed_temp}°C` : "—"}</p>
                </div>
              </div>

              {f.bambu_info_idx && (
                <Badge className="mt-3">{f.bambu_info_idx}</Badge>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Palette}
          title="No filaments"
          description="Add your first filament type to start tracking your inventory."
        />
      )}

      {/* Create/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? "Edit Filament" : "Add Filament"}
        className="max-w-xl"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Brand"
              placeholder="Bambu Lab"
              value={form.brand}
              onChange={(e) => setForm({ ...form, brand: e.target.value })}
              required
            />
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-zinc-300">Material</label>
              <select
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 outline-none"
                value={form.material}
                onChange={(e) => setForm({ ...form, material: e.target.value })}
              >
                {materials.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Color Name"
              placeholder="Matte Black"
              value={form.color_name}
              onChange={(e) => setForm({ ...form, color_name: e.target.value })}
              required
            />
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-zinc-300">Color</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={form.color_hex}
                  onChange={(e) => setForm({ ...form, color_hex: e.target.value })}
                  className="w-10 h-10 rounded-lg border border-zinc-700 bg-transparent cursor-pointer"
                />
                <Input
                  placeholder="#3b82f6"
                  value={form.color_hex}
                  onChange={(e) => setForm({ ...form, color_hex: e.target.value })}
                  className="flex-1"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Input
              label="Nozzle Min °C"
              type="number"
              value={form.nozzle_temp_min ?? ""}
              onChange={(e) => setForm({ ...form, nozzle_temp_min: Number(e.target.value) })}
            />
            <Input
              label="Nozzle Max °C"
              type="number"
              value={form.nozzle_temp_max ?? ""}
              onChange={(e) => setForm({ ...form, nozzle_temp_max: Number(e.target.value) })}
            />
            <Input
              label="Bed °C"
              type="number"
              value={form.bed_temp ?? ""}
              onChange={(e) => setForm({ ...form, bed_temp: Number(e.target.value) })}
            />
          </div>

          <Input
            label="Bambu Info Index (optional)"
            placeholder="GFL99"
            value={form.bambu_info_idx}
            onChange={(e) => setForm({ ...form, bambu_info_idx: e.target.value })}
          />

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-zinc-300">Notes</label>
            <textarea
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 outline-none resize-none h-20"
              placeholder="Any notes about this filament..."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">
              {editingId ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}