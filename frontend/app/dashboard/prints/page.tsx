"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, ChevronsUpDown, History, Trash2 } from "lucide-react";

import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CoverImage } from "@/components/ui/CoverImage";
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
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatCurrency,
  formatDateTime,
  formatDuration,
  formatWeight,
  getStatusLabel,
  getStatusVariant,
} from "@/lib/utils";
import PrintJobModal from "@/components/modals/PrintJobModal";

type Filter = "all" | "printing" | "completed" | "failed";
type SortKey =
  | "title"
  | "status"
  | "weight"
  | "duration_seconds"
  | "estimated_cost"
  | "start_time"
  | "finished_at";
type SortDir = "asc" | "desc";

const FILTERS: { key: Filter; label: string; status?: number }[] = [
  { key: "all", label: "All" },
  { key: "printing", label: "Printing", status: 4 },
  { key: "completed", label: "Completed", status: 2 },
  { key: "failed", label: "Failed", status: 3 },
];

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "title", label: "Title" },
  { key: "status", label: "Status" },
  { key: "weight", label: "Weight" },
  { key: "duration_seconds", label: "Duration" },
  { key: "estimated_cost", label: "Cost" },
  { key: "start_time", label: "Start" },
  { key: "finished_at", label: "Finish" },
];

export default function PrintsPage() {
  const [prints, setPrints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("finished_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedPrint, setSelectedPrint] = useState<any>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  async function load() {
    try {
      setPrints(await api.getPrintJobs());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const counts: Record<Filter, number> = useMemo(
    () => ({
      all: prints.length,
      printing: prints.filter((p) => p.status === 4).length,
      completed: prints.filter((p) => p.status === 2).length,
      failed: prints.filter((p) => p.status === 3).length,
    }),
    [prints],
  );

  const filtered = useMemo(() => {
    let list = [...prints];
    if (filter !== "all") {
      const s = FILTERS.find((f) => f.key === filter)?.status;
      list = list.filter((p) => p.status === s);
    }
    list.sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      return sortDir === "asc" ? (av > bv ? 1 : -1) : av < bv ? 1 : -1;
    });
    return list;
  }, [prints, filter, sortKey, sortDir]);

  async function handleDelete(id: string) {
    try {
      await api.deletePrint(id);
      toast.success("Print deleted");
      setConfirmDelete(null);
      load();
    } catch {
      toast.error("Failed to delete");
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ChevronsUpDown className="size-3 text-muted-foreground" />;
    return sortDir === "asc" ? (
      <ChevronUp className="size-3 text-primary" />
    ) : (
      <ChevronDown className="size-3 text-primary" />
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-8">
      <div>
        <h1 className="text-xl font-bold">Print Jobs</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">{prints.length} total jobs</p>
      </div>

      <ToggleGroup
        value={[filter]}
        onValueChange={(value) => {
          if (value[0]) setFilter(value[0] as Filter);
        }}
        variant="outline"
        size="sm"
        spacing={0}
        className="flex-wrap"
      >
        {FILTERS.map((f) => (
          <ToggleGroupItem key={f.key} value={f.key}>
            {f.label}
            <span className="rounded-full bg-muted px-1.5 text-xs text-muted-foreground">
              {counts[f.key]}
            </span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {filtered.length === 0 ? (
        <EmptyState
          icon={History}
          title="No prints"
          description="No print jobs match this filter."
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                {COLUMNS.map((col) => (
                  <TableHead key={col.key}>
                    <button
                      type="button"
                      className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground"
                      onClick={() => toggleSort(col.key)}
                    >
                      {col.label} <SortIcon col={col.key} />
                    </button>
                  </TableHead>
                ))}
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow
                  key={p.id}
                  tabIndex={0}
                  className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring/50"
                  onClick={() => setSelectedPrint(p)}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedPrint(p);
                    }
                  }}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <CoverImage cover={p.cover} alt={p.title} className="size-9 shrink-0 rounded-lg" />
                      <span className="max-w-[200px] truncate font-medium">{p.title}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getStatusVariant(p.status)}>{getStatusLabel(p.status)}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatWeight(p.weight)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDuration(p.duration_seconds)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatCurrency(p.estimated_cost)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDateTime(p.start_time)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {p.finished_at ? formatDateTime(p.finished_at) : p.status === 4 ? "In progress" : "—"}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${p.title}`}
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => setConfirmDelete(p.id)}
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

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
            <AlertDialogTitle>Delete Print Record?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this print record.
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

      {selectedPrint ? (
        <PrintJobModal print={selectedPrint} onClose={() => setSelectedPrint(null)} />
      ) : null}
    </div>
  );
}
