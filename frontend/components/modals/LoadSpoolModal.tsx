"use client";

import { useState } from "react";
import { toast } from "sonner";

import { api, type Printer } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { LoadingButton } from "@/components/ui/loading-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SpoolIndicator } from "@/components/ui/SpoolIndicator";
import { formatWeight } from "@/lib/utils";

interface Props {
  spool: any;
  filament?: any;
  printers: Printer[];
  onClose: () => void;
  onLoaded: () => void | Promise<void>;
}

export default function LoadSpoolModal({
  spool,
  filament,
  printers,
  onClose,
  onLoaded,
}: Props) {
  const configured = printers.filter(
    (printer) => printer.configured && printer.id,
  );
  const [printerId, setPrinterId] = useState<string>(
    spool?.printer_id ?? configured[0]?.id ?? "",
  );
  const [loading, setLoading] = useState(false);

  async function handleLoad() {
    if (!printerId) {
      toast.error("Choose a printer first");
      return;
    }
    setLoading(true);
    try {
      await api.activateSpool(spool.id, printerId);
      toast.success("Spool loaded");
      await onLoaded();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load spool");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Load spool</DialogTitle>
          <DialogDescription>
            Choose the printer this spool is loaded into.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
          <SpoolIndicator
            remaining={spool?.remaining_g ?? 0}
            total={spool?.total_weight_g ?? 1000}
            color={filament?.color_hex ?? "#9ca3af"}
            size={52}
          />
          <div className="min-w-0">
            <p className="truncate font-medium">
              {filament?.color_name ?? "Spool"}
            </p>
            <p className="text-xs text-muted-foreground">
              {filament?.brand ? `${filament.brand} · ` : ""}
              {filament?.material ?? "Filament"} ·{" "}
              {formatWeight(spool?.remaining_g)} remaining
            </p>
          </div>
        </div>

        {configured.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-muted/20 p-3 text-sm text-muted-foreground">
            Configure a printer first on the printers page.
          </p>
        ) : (
          <Field>
            <FieldLabel htmlFor="load-printer">Printer</FieldLabel>
            <Select
              value={printerId}
              onValueChange={(value) => setPrinterId(value ?? "")}
              items={configured.map((printer) => ({
                value: printer.id as string,
                label: printer.name,
              }))}
            >
              <SelectTrigger id="load-printer" className="w-full">
                <SelectValue placeholder="Select a printer" />
              </SelectTrigger>
              <SelectContent>
                {configured.map((printer) => (
                  <SelectItem key={printer.id} value={printer.id as string}>
                    {printer.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <LoadingButton
            loading={loading}
            disabled={!printerId || configured.length === 0}
            onClick={handleLoad}
          >
            {spool?.printer_id ? "Move spool" : "Load spool"}
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
