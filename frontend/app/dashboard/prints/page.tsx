"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "@/lib/toast";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  getPrintFilament,
  getStatusLabel,
  getStatusVariant,
} from "@/lib/utils";
import FilamentModal from "@/components/modals/FilamentModal";
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
  const [spools, setSpools] = useState<any[]>([]);
  const [filaments, setFilaments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("finished_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedPrint, setSelectedPrint] = useState<any>(null);
  const [selectedFilament, setSelectedFilament] = useState<any>(null);
  const [filamentFilter, setFilamentFilter] = useState<string>("all");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const loadSeq = useRef(0);
  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    try {
      const [jobs, spoolList, filamentList] = await Promise.all([
        api.getAllPrintJobs(),
        api.getSpools(),
        api.getFilaments(),
      ]);
      if (seq !== loadSeq.current) return;
      setPrints(jobs);
      setSpools(spoolList);
      setFilaments(filamentList);
      if (seq !== loadSeq.current) return;
      setLoadError(null);
    } catch (error) {
      if (seq !== loadSeq.current) return;
      setLoadError(
        error instanceof Error ? error.message : "Could not reach the server",
      );
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSelectedPrint((current: any) =>
      current ? prints.find((p) => p.id === current.id) ?? null : null,
    );
    setSelectedFilament((current: any) =>
      current ? filaments.find((f) => f.id === current.id) ?? null : null,
    );
  }, [prints, filaments]);

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

  const usedFilaments = useMemo(() => {
    const map = new Map<string, any>();
    for (const print of prints) {
      const filament = getPrintFilament(print, spools, filaments);
      if (filament) map.set(filament.id, filament);
    }
    return Array.from(map.values()).sort((a, b) =>
      String(a.color_name).localeCompare(String(b.color_name)),
    );
  }, [prints, spools, filaments]);

  const filamentOptions = useMemo(
    () => [
      { value: "all", label: "All filaments" },
      ...usedFilaments.map((filament) => ({
        value: String(filament.id),
        label: `${filament.color_name} · ${filament.material}`,
      })),
    ],
    [usedFilaments],
  );

  const filtered = useMemo(() => {
    let list = [...prints];
    if (filter !== "all") {
      const s = FILTERS.find((f) => f.key === filter)?.status;
      list = list.filter((p) => p.status === s);
    }
    if (filamentFilter !== "all") {
      list = list.filter(
        (p) => getPrintFilament(p, spools, filaments)?.id === filamentFilter,
      );
    }
    list.sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      return sortDir === "asc" ? (av > bv ? 1 : -1) : av < bv ? 1 : -1;
    });
    return list;
  }, [prints, filter, filamentFilter, spools, filaments, sortKey, sortDir]);

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

      <div className="flex flex-wrap items-center justify-between gap-3">
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

        <Select
          value={filamentFilter}
          onValueChange={(value) => setFilamentFilter(value ?? "all")}
          items={filamentOptions}
        >
          <SelectTrigger
            size="sm"
            className="min-w-[190px]"
            aria-label="Filter by filament"
          >
            <SelectValue placeholder="All filaments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All filaments</SelectItem>
            {usedFilaments.map((filament) => (
              <SelectItem key={filament.id} value={String(filament.id)}>
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: filament.color_hex ?? "#9ca3af" }}
                />
                {filament.color_name} · {filament.material}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loadError ? (
        <div
          role="alert"
          className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400"
        >
          Could not refresh: {loadError}. Showing the last known data.
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState
          icon={History}
          title={loadError ? "Could not load prints" : "No prints"}
          description={loadError ?? "No print jobs match this filter."}
          action={
            loadError ? (
              <Button variant="outline" onClick={() => void load()}>
                Try again
              </Button>
            ) : undefined
          }
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
                      <div className="min-w-0">
                        <span className="block max-w-[200px] truncate font-medium">{p.title}</span>
                        {(() => {
                          const filament = getPrintFilament(p, spools, filaments);
                          return filament ? (
                            <button
                              type="button"
                              className="mt-0.5 flex max-w-full cursor-pointer items-center gap-1.5 rounded-sm text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedFilament(filament);
                              }}
                            >
                              <span
                                className="size-2 shrink-0 rounded-full ring-1 ring-foreground/10"
                                style={{ backgroundColor: filament.color_hex ?? "#9ca3af" }}
                              />
                              <span className="truncate">
                                {filament.color_name} · {filament.material}
                              </span>
                            </button>
                          ) : (
                            <span className="mt-0.5 block text-[11px] text-muted-foreground">
                              Filament not recorded
                            </span>
                          );
                        })()}
                      </div>
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
        <PrintJobModal
          print={selectedPrint}
          filament={getPrintFilament(selectedPrint, spools, filaments)}
          onFilamentClick={(filament) => {
            setSelectedPrint(null);
            setSelectedFilament(filament);
          }}
          onClose={() => setSelectedPrint(null)}
        />
      ) : null}

      {selectedFilament ? (
        <FilamentModal
          filament={selectedFilament}
          spools={spools.filter(
            (spool) => spool.filament_id === selectedFilament.id,
          )}
          onClose={() => setSelectedFilament(null)}
        />
      ) : null}
    </div>
  );
}
