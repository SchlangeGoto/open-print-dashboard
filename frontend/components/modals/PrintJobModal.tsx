"use client";

import { CheckCircle, Clock, Cpu, DollarSign, Layers, Play } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { CoverImage } from "@/components/ui/CoverImage";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  formatCurrency,
  formatDateTime,
  formatDuration,
  formatWeight,
  getStatusLabel,
  getStatusVariant,
} from "@/lib/utils";

interface Props {
  print: any;
  filament?: any | null;
  onClose: () => void;
}

export default function PrintJobModal({ print, filament, onClose }: Props) {
  const stats = [
    { icon: Layers, label: "Weight Used", value: formatWeight(print.weight) },
    { icon: Clock, label: "Duration", value: formatDuration(print.duration_seconds) },
    {
      icon: DollarSign,
      label: "Estimated Cost",
      value: formatCurrency(print.estimated_cost),
    },
    { icon: Play, label: "Started", value: formatDateTime(print.start_time) },
    { icon: CheckCircle, label: "Finished", value: formatDateTime(print.finished_at) },
    { icon: Cpu, label: "Printer", value: print.device_id || "—" },
  ];

  return (
    <Dialog
      open={!!print}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        {print.cover ? (
          <div className="aspect-video w-full overflow-hidden rounded-lg bg-muted">
            <CoverImage
              cover={print.cover}
              alt={print.title}
              fit="contain"
              className="h-full w-full"
            />
          </div>
        ) : null}

        <DialogHeader>
          <DialogTitle className="flex items-start justify-between gap-4 pr-10">
            <span className="truncate">{print.title}</span>
            <Badge variant={getStatusVariant(print.status)}>
              {getStatusLabel(print.status)}
            </Badge>
          </DialogTitle>
          {print.device_id ? (
            <DialogDescription className="font-mono text-xs">
              {print.device_id}
            </DialogDescription>
          ) : null}
        </DialogHeader>

        {filament ? (
          <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3">
            <span
              className="size-9 shrink-0 rounded-full ring-1 ring-foreground/10"
              style={{ backgroundColor: filament.color_hex ?? "#9ca3af" }}
            />
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Layers className="size-3" /> Filament
              </div>
              <p className="truncate text-sm font-medium">{filament.color_name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {[filament.brand, filament.material].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-lg border border-dashed bg-muted/20 p-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <Layers className="size-4" />
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Filament</p>
              <p className="text-sm text-muted-foreground">
                Not recorded for this print
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {stats.map(({ icon: Icon, label, value }) => (
            <div key={label} className="rounded-lg border bg-muted/40 p-3">
              <div className="mb-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Icon className="size-3" /> {label}
              </div>
              <p className="truncate text-sm font-medium">{value}</p>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
