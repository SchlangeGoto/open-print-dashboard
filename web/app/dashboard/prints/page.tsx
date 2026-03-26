"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import {
  formatDuration,
  formatWeight,
  formatCurrency,
  formatDate,
  getStatusLabel,
  getStatusColor,
} from "@/lib/utils";
import { History, Trash2, Eye } from "lucide-react";
import toast from "react-hot-toast";

export default function PrintsPage() {
  const [prints, setPrints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPrint, setSelectedPrint] = useState<any>(null);

  async function load() {
    try {
      const data = await api.getPrintJobs();
      setPrints(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleDelete(id: number) {
    if (!confirm("Delete this print record?")) return;
    try {
      await api.deletePrint(id);
      toast.success("Print record deleted");
      load();
    } catch {
      toast.error("Failed to delete");
    }
  }

  // Stats
  const totalPrints = prints.length;
  const finishedPrints = prints.filter((p) => p.status === 2).length;
  const canceledPrints = prints.filter((p) => p.status === 3).length;
  const successRate =
    totalPrints > 0
      ? Math.round((finishedPrints / (finishedPrints + canceledPrints || 1)) * 100)
      : 0;

  if (loading) {
    return <div className="animate-pulse text-zinc-500 p-8">Loading print history...</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Print History</h1>
        <p className="text-sm text-muted mt-1">All your past and active prints</p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <p className="text-xs text-muted">Total Prints</p>
          <p className="text-xl font-bold mt-1">{totalPrints}</p>
        </Card>
        <Card>
          <p className="text-xs text-muted">Completed</p>
          <p className="text-xl font-bold mt-1 text-green-400">{finishedPrints}</p>
        </Card>
        <Card>
          <p className="text-xs text-muted">Canceled / Failed</p>
          <p className="text-xl font-bold mt-1 text-red-400">{canceledPrints}</p>
        </Card>
        <Card>
          <p className="text-xs text-muted">Success Rate</p>
          <p className="text-xl font-bold mt-1">{successRate}%</p>
        </Card>
      </div>

      {/* Table */}
      {prints.length > 0 ? (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left text-xs text-muted">
                  <th className="pb-3 pr-4">Title</th>
                  <th className="pb-3 pr-4">Status</th>
                  <th className="pb-3 pr-4">Weight</th>
                  <th className="pb-3 pr-4">Duration</th>
                  <th className="pb-3 pr-4">Cost</th>
                  <th className="pb-3 pr-4">Date</th>
                  <th className="pb-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {prints.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
                  >
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-3">
                        {p.cover && (
                          <img
                            src={p.cover}
                            alt=""
                            className="w-10 h-10 rounded-lg object-cover bg-zinc-800"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        )}
                        <span className="font-medium">{p.title}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <Badge
                        variant={
                          p.status === 2 ? "success" : p.status === 3 ? "danger" : p.status === 4 ? "info" : "default"
                        }
                      >
                        {getStatusLabel(p.status)}
                      </Badge>
                    </td>
                    <td className="py-3 pr-4 text-muted">{formatWeight(p.weight)}</td>
                    <td className="py-3 pr-4 text-muted">{formatDuration(p.duration_seconds)}</td>
                    <td className="py-3 pr-4 text-muted">{formatCurrency(p.estimated_cost)}</td>
                    <td className="py-3 pr-4 text-muted">{formatDate(p.finished_at || p.start_time)}</td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedPrint(p)}
                        >
                          <Eye size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(p.id)}
                        >
                          <Trash2 size={14} className="text-red-400" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <EmptyState
          icon={History}
          title="No prints yet"
          description="Print history will appear here once your printer completes a job."
        />
      )}

      {/* Detail Modal */}
      <Modal
        open={!!selectedPrint}
        onClose={() => setSelectedPrint(null)}
        title="Print Details"
      >
        {selectedPrint && (
          <div className="space-y-3">
            {selectedPrint.cover && (
              <img
                src={selectedPrint.cover}
                alt=""
                className="w-full rounded-lg object-cover max-h-48 bg-zinc-800"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            )}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-muted">Title</p>
                <p className="font-medium">{selectedPrint.title}</p>
              </div>
              <div>
                <p className="text-muted">Status</p>
                <p className={getStatusColor(selectedPrint.status)}>
                  {getStatusLabel(selectedPrint.status)}
                </p>
              </div>
              <div>
                <p className="text-muted">Weight Used</p>
                <p>{formatWeight(selectedPrint.weight)}</p>
              </div>
              <div>
                <p className="text-muted">Duration</p>
                <p>{formatDuration(selectedPrint.duration_seconds)}</p>
              </div>
              <div>
                <p className="text-muted">Estimated Cost</p>
                <p>{formatCurrency(selectedPrint.estimated_cost)}</p>
              </div>
              <div>
                <p className="text-muted">Device</p>
                <p className="font-mono text-xs">{selectedPrint.device_id}</p>
              </div>
              <div>
                <p className="text-muted">Started</p>
                <p>{formatDate(selectedPrint.start_time, { hour: "2-digit", minute: "2-digit" })}</p>
              </div>
              <div>
                <p className="text-muted">Finished</p>
                <p>{formatDate(selectedPrint.finished_at, { hour: "2-digit", minute: "2-digit" })}</p>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}