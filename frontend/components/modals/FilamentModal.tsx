"use client";

import { useState } from "react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SpoolIndicator } from "@/components/ui/SpoolIndicator";
import { formatWeight } from "@/lib/utils";
import SpoolModal from "./SpoolModal";

interface Props {
  filament: any;
  spools?: any[];
  onClose: () => void;
  onRefresh?: () => void;
}

export default function FilamentModal({
  filament,
  spools = [],
  onClose,
  onRefresh,
}: Props) {
  const [selectedSpool, setSelectedSpool] = useState<any>(null);
  const totalRemaining = spools.reduce((sum, s) => sum + s.remaining_g, 0);

  async function handleActivate(spoolId: string) {
    try {
      await api.activateSpool(spoolId);
      toast.success("Spool activated");
      onRefresh?.();
      setSelectedSpool(null);
    } catch {
      toast.error("Failed to activate spool");
    }
  }

  const stats = [
    { label: "In Stock", value: formatWeight(totalRemaining) },
    { label: "Spools", value: spools.length },
    { label: "Diameter", value: filament?.diameter ? `${filament.diameter}mm` : "1.75mm" },
    {
      label: "Nozzle Temp",
      value:
        filament?.nozzle_temp_min && filament?.nozzle_temp_max
          ? `${filament.nozzle_temp_min}–${filament.nozzle_temp_max}°C`
          : "—",
    },
    { label: "Bed Temp", value: filament?.bed_temp ? `${filament.bed_temp}°C` : "—" },
    { label: "Profile ID", value: filament?.bambu_info_idx ?? "—" },
  ];

  return (
    <>
      <Dialog
        open={!!filament}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <span
                className="size-10 shrink-0 rounded-xl border-2 border-border"
                style={{ backgroundColor: filament?.color_hex }}
              />
              <span className="flex items-center gap-2">
                {filament?.color_name}
                <Badge variant="secondary">{filament?.material}</Badge>
              </span>
            </DialogTitle>
            <DialogDescription>{filament?.brand}</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {stats.map(({ label, value }) => (
              <div key={label} className="rounded-lg border bg-muted/40 p-3">
                <p className="mb-0.5 text-[10px] text-muted-foreground">{label}</p>
                <p className="text-sm font-medium">{value}</p>
              </div>
            ))}
          </div>

          {spools.length > 0 ? (
            <div>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Spools ({spools.length})
              </p>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                {spools.map((spool) => {
                  const pct = Math.round(
                    (spool.remaining_g / spool.total_weight_g) * 100,
                  );
                  return (
                    <button
                      key={spool.id}
                      type="button"
                      className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border bg-muted/40 p-3 transition-colors hover:border-primary/40"
                      onClick={() => setSelectedSpool(spool)}
                    >
                      <SpoolIndicator
                        remaining={spool.remaining_g}
                        total={spool.total_weight_g}
                        color={filament?.color_hex ?? "#555"}
                        size={72}
                      />
                      <div className="text-center">
                        <p className="text-xs font-medium">
                          {formatWeight(spool.remaining_g)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{pct}%</p>
                        {spool.active ? (
                          <Badge variant="success" className="mt-1 text-[9px]">
                            Active
                          </Badge>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {selectedSpool ? (
        <SpoolModal
          spool={selectedSpool}
          filament={filament}
          onClose={() => setSelectedSpool(null)}
          onActivate={() => handleActivate(selectedSpool.id)}
        />
      ) : null}
    </>
  );
}
