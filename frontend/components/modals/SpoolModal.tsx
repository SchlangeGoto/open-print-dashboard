"use client";

import { Check, Pencil, Zap } from "lucide-react";
import { toast } from "@/lib/toast";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { SpoolIndicator } from "@/components/ui/SpoolIndicator";
import { formatCurrency, formatDate, formatWeight } from "@/lib/utils";

interface Props {
  spool: any;
  filament?: any;
  onClose: () => void;
  onActivate?: () => Promise<void>;
  onRequestLoad?: (spool: any) => void;
  onEdit?: (spool: any) => void;
}

export default function SpoolModal({
  spool,
  filament,
  onClose,
  onActivate,
  onRequestLoad,
  onEdit,
}: Props) {
  const unknown = Boolean(spool?.remaining_unknown);
  const pct =
    spool && !unknown
      ? Math.round((spool.remaining_g / spool.total_weight_g) * 100)
      : 0;

  async function handleActivate() {
    if (!onActivate) return;
    try {
      await onActivate();
      toast.success("Spool activated");
    } catch {
      toast.error("Failed to activate spool");
    }
  }

  const details = [
    { label: "Status", value: spool?.active ? "Active" : "Stored" },
    { label: "Material", value: filament?.material ?? "—" },
    { label: "Total Weight", value: formatWeight(spool?.total_weight_g) },
    {
      label: "Remaining",
      value: unknown ? "Unknown" : formatWeight(spool?.remaining_g),
    },
    {
      label: "Price / kg",
      value: spool?.price_per_kg ? formatCurrency(spool.price_per_kg) : "—",
    },
    { label: "Last Used", value: formatDate(spool?.last_used_at) },
    { label: "Purchased", value: formatDate(spool?.purchased_at) },
    { label: "Added", value: formatDate(spool?.created_at) },
  ];

  return (
    <Dialog
      open={!!spool}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Spool details</DialogTitle>
          <DialogDescription>
            {filament?.brand ? `${filament.brand} · ` : ""}
            {filament?.material ?? "Filament spool"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3 rounded-xl border bg-muted/40 py-6">
          <SpoolIndicator
            remaining={spool?.remaining_g ?? 0}
            total={spool?.total_weight_g ?? 1000}
            color={filament?.color_hex ?? "#555"}
            size={140}
            unknown={unknown}
          />
          <div className="text-center">
            <p className="text-lg font-bold">
              {filament?.color_name ?? "Unknown Filament"}
            </p>
            <p className="text-sm text-muted-foreground">
              {filament?.brand} · {filament?.material}
            </p>
          </div>
          {unknown ? (
            <p className="text-center text-xs text-muted-foreground">
              Weight unknown · added from printer
            </p>
          ) : (
            <div className="w-40">
              <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                <span>{Math.round(spool?.remaining_g ?? 0)}g</span>
                <span>{pct}%</span>
              </div>
              <Progress
                value={pct}
                className="[&_[data-slot=progress-track]]:h-2 [&_[data-slot=progress-indicator]]:bg-[var(--spool-color)]"
                style={
                  {
                    "--spool-color": filament?.color_hex ?? "#9ca3af",
                  } as React.CSSProperties
                }
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {details.map(({ label, value }) => (
            <div key={label} className="rounded-lg border bg-muted/40 p-3">
              <p className="mb-0.5 text-[10px] text-muted-foreground">{label}</p>
              <p className="text-sm font-medium">{value}</p>
            </div>
          ))}
        </div>

        {spool?.notes ? (
          <div className="rounded-lg border bg-muted/40 p-3">
            <p className="mb-0.5 text-[10px] text-muted-foreground">Notes</p>
            <p className="whitespace-pre-wrap text-sm">{spool.notes}</p>
          </div>
        ) : null}

        <DialogFooter className="gap-2 sm:justify-between">
          {!spool?.active && (onRequestLoad || onActivate) ? (
            <Button
              className="flex-1"
              onClick={() =>
                onRequestLoad ? onRequestLoad(spool) : handleActivate()
              }
            >
              <Zap /> Load Spool
            </Button>
          ) : null}
          {spool?.active ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
              <Check className="size-4" /> Currently loaded
            </div>
          ) : null}
          {onEdit ? (
            <Button variant="outline" onClick={() => onEdit(spool)}>
              <Pencil /> Edit
            </Button>
          ) : null}
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
