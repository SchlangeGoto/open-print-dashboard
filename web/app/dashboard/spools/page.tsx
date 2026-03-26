"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatWeight, formatDate } from "@/lib/utils";
import { Package, Plus, Pencil, Trash2, Zap, Check } from "lucide-react";
import toast from "react-hot-toast";

export default function SpoolsPage() {
  const [spools, setSpools] = useState<any[]>([]);
  const [filaments, setFilaments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [form, setForm] = useState({
    filament_id: "",
    total_weight_g: 1000,
    remaining_g: 1000,
    price_per_kg: "",
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

  useEffect(() => { load(); }, []);

  function getFilament(id: number | null) {
    return filaments.find((f) => f.id === id);
  }

  function openCreate() {
    setForm({
      filament_id: filaments.length > 0 ? String(filaments[0].id) : "",
      total_weight_g: 1000,
      remaining_g: 1000,
      price_per_kg: "",
      nfc_uid: "",
      notes: "",
    });
    setEditingId(null);
    setModalOpen(true);
  }

  function openEdit(s: any) {
    setForm({
      filament_id: String(s.filament_id ?? ""),
      total_weight_g: s.total_weight_g,
      remaining_g: s.remaining_g,
      price_per_kg: s.price_per_kg ?? "",
      nfc_uid: s.nfc_uid ?? "",
      notes: s.notes ?? "",
    });
    setEditingId(s.id);
    setModalOpen(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      ...form,
      filament_id: form.filament_id ? Number(form.filament_id) : null,
      price_per_kg: form.price_per_kg ? Number(form.price_per_kg) : null,
      nfc_uid: form.nfc_uid || null,
      notes: form.notes || null,
    };
    try {
      if (editingId) {
        await api.updateSpool(editingId, payload);
        toast.success("Spool updated");
      } else {
        await api.createSpool(payload);
        toast.success("Spool created");
      }
      setModalOpen(false);
      load();
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    }
  }

  async function handleActivate(id: number) {
    try {
      await api.activateSpool(id);
      toast.success("Spool activated — now loaded in printer");
      load();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this spool?")) return;
    try {
      await api.deleteSpool(id);
      toast.success("Spool deleted");
      load();
    } catch {
      toast.error("Failed to delete");
    }
  }

  if (loading) {
    return <div className="animate-pulse text-zinc-500 p-8">Loading spools...</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Spools</h1>
          <p className="text-sm text-muted mt-1">Track your spool inventory and usage</p>
        </div>
        <Button onClick={openCreate} disabled={filaments.length === 0}>
          <Plus size={16} /> Add Spool
        </Button>
      </div>

      {filaments.length === 0 && (
        <div className="rounded-lg border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-200">
          Create a filament type first before adding spools.
        </div>
      )}

      {spools.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {spools.map((s) => {
            const fil = getFilament(s.filament_id);
            const pct = s.total_weight_g > 0 ? Math.round((s.remaining_g / s.total_weight_g) * 100) : 0;

            return (
              <Card key={s.id} className="relative">
                {s.active && (
                  <div className="absolute top-3 right-3">
                    <Badge variant="success">
                      <Check size={10} /> Active
                    </Badge>
                  </div>
                )}

                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-10 h-10 rounded-full border-2 border-zinc-700"
                    style={{ backgroundColor: fil?.color_hex ?? "#555" }}
                  />
                  <div>
                    <p className="font-semibold">
                      {fil?.color_name ?? "Unknown"}{" "}
                      <span className="text-xs text-muted font-normal">#{s.id}</span>
                    </p>
                    <p className="text-xs text-muted">
                      {fil ? `${fil.brand} · ${fil.material}` : "No filament linked"}
                    </p>
                  </div>
                </div>

                {/* Usage bar */}
                <div className="mb-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted">{formatWeight(s.remaining_g)} remaining</span>
                    <span className="text-muted">{pct}%</span>
                  </div>
                  <div className="w-full bg-zinc-800 rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        backgroundColor:
                          pct > 30 ? (fil?.color_hex ?? "#3b82f6") : pct > 10 ? "#f59e0b" : "#ef4444",
                      }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-muted mb-4">
                  <span>Total: {formatWeight(s.total_weight_g)}</span>
                  <span>
                    Price: {s.price_per_kg ? `€${s.price_per_kg}/kg` : "—"}
                  </span>
                  {s.nfc_uid && <span>NFC: {s.nfc_uid.slice(0, 8)}…</span>}
                  {s.last_used_at && <span>Used: {formatDate(s.last_used_at)}</span>}
                </div>

                <div className="flex gap-2">
                  {!s.active && (
                    <Button variant="secondary" size="sm" className="flex-1" onClick={() => handleActivate(s.id)}>
                      <Zap size={12} /> Activate
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => openEdit(s)}>
                    <Pencil size={12} />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(s.id)}>
                    <Trash2 size={12} className="text-red-400" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={Package}
          title="No spools"
          description="Add spools to track your filament usage per roll."
        />
      )}

      {/* Create/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? "Edit Spool" : "Add Spool"}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-zinc-300">Filament</label>
            <select
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 outline-none"
              value={form.filament_id}
              onChange={(e) => setForm({ ...form, filament_id: e.target.value })}
              required
            >
              <option value="">Select filament…</option>
              {filaments.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.brand} — {f.color_name} ({f.material})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Total Weight (g)"
              type="number"
              value={form.total_weight_g}
              onChange={(e) => setForm({ ...form, total_weight_g: Number(e.target.value) })}
              required
            />
            <Input
              label="Remaining (g)"
              type="number"
              value={form.remaining_g}
              onChange={(e) => setForm({ ...form, remaining_g: Number(e.target.value) })}
              required
            />
          </div>

          <Input
            label="Price per kg (€)"
            type="number"
            step="0.01"
            placeholder="24.99"
            value={form.price_per_kg}
            onChange={(e) => setForm({ ...form, price_per_kg: e.target.value })}
          />

          <Input
            label="NFC UID (optional)"
            placeholder="04:A2:3F:..."
            value={form.nfc_uid}
            onChange={(e) => setForm({ ...form, nfc_uid: e.target.value })}
          />

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-zinc-300">Notes</label>
            <textarea
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm text-zinc-100 outline-none resize-none h-20"
              placeholder="Optional notes..."
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