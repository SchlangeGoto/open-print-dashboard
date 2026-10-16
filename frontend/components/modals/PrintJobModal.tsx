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
  onClose: () => void;
}

export default function PrintJobModal({ print, onClose }: Props) {
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
          <DialogTitle className="flex items-start justify-between gap-4">
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
