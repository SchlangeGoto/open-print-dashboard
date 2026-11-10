"use client";

import { useState } from "react";
import { Cloud, Network, RefreshCw, Save, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";

import { api, type Printer } from "@/lib/api";
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
import { Input } from "@/components/ui/input";
import { LoadingButton } from "@/components/ui/loading-button";
import { Spinner } from "@/components/ui/spinner";

interface Props {
  printer?: Printer | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

export default function PrinterSettingsModal({
  printer,
  onClose,
  onSaved,
}: Props) {
  const isEdit = Boolean(printer?.id);
  const isCloud = isEdit && printer?.connection_mode === "cloud";
  const [form, setForm] = useState({
    name: printer?.name ?? "",
    serial: printer?.serial ?? "",
    ip: printer?.ip ?? "",
    // The API never returns the stored code; an empty value keeps it.
    access_code: "",
  });
  const [saving, setSaving] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      if (isEdit && printer?.id) {
        await api.updatePrinter(
          printer.id,
          isCloud
            ? { name: form.name }
            : {
                name: form.name,
                ip: form.ip,
                access_code: form.access_code,
              },
        );
        toast.success("Printer settings saved");
      } else {
        await api.createPrinter({
          ...form,
          connection_mode: "lan",
        });
        toast.success("Printer added");
      }
      await onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save printer");
    } finally {
      setSaving(false);
    }
  }

  async function handleReconnect() {
    if (!printer?.id) return;
    setReconnecting(true);
    try {
      await api.reconnectPrinter(printer.id);
      toast.success("Printer connection restarted");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to reconnect",
      );
    } finally {
      setReconnecting(false);
    }
  }

  async function handleDelete() {
    if (!printer?.id) return;
    try {
      await api.deletePrinter(printer.id);
      toast.success("Printer removed");
      await onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to remove printer");
    }
  }

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Printer settings" : "Add LAN printer"}</DialogTitle>
            <DialogDescription>
              {isCloud
                ? "This printer is monitored through Bambu Cloud. No local IP or access code is needed."
                : isEdit
                  ? "Update the local connection details for this printer."
                  : "Printers on your Bambu account appear in the list automatically. Use this form for a printer on your local network."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="printer-name">Name</FieldLabel>
                <Input
                  id="printer-name"
                  placeholder="X1 Carbon"
                  value={form.name}
                  onChange={(event) =>
                    setForm({ ...form, name: event.target.value })
                  }
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="printer-serial">Serial number</FieldLabel>
                <Input
                  id="printer-serial"
                  placeholder="03919C462700XXX"
                  value={form.serial}
                  onChange={(event) =>
                    setForm({ ...form, serial: event.target.value })
                  }
                  disabled={Boolean(printer)}
                  required
                />
              </Field>
            </div>

            <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
              {isCloud ? (
                <>
                  <Cloud className="size-4 shrink-0" />
                  Bambu Cloud connection
                </>
              ) : (
                <>
                  <Network className="size-4 shrink-0" />
                  LAN connection · the printer must be reachable from this server
                </>
              )}
            </div>

            {!isCloud ? (
              <>
                <Field>
                  <FieldLabel htmlFor="printer-ip">Printer IP</FieldLabel>
                  <Input
                    id="printer-ip"
                    placeholder="192.168.0.100"
                    value={form.ip}
                    onChange={(event) =>
                      setForm({ ...form, ip: event.target.value })
                    }
                    required
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="printer-access-code">
                    Access code
                  </FieldLabel>
                  <Input
                    id="printer-access-code"
                    placeholder={
                      isEdit ? "Leave blank to keep the current code" : "12345678"
                    }
                    value={form.access_code}
                    onChange={(event) =>
                      setForm({ ...form, access_code: event.target.value })
                    }
                    required={!isEdit}
                  />
                </Field>
              </>
            ) : null}

            <DialogFooter className="gap-2 sm:justify-between">
              {isEdit ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 /> Remove
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <LoadingButton type="submit" loading={saving}>
                  <Save /> {isEdit ? "Save" : "Add LAN printer"}
                </LoadingButton>
              </div>
            </DialogFooter>
          </form>

          {isEdit ? (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleReconnect}
              disabled={reconnecting}
            >
              {reconnecting ? <Spinner /> : <RefreshCw />}
              Reconnect printer
            </Button>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogMedia className="bg-destructive/10 text-destructive">
              <Trash2 />
            </AlertDialogMedia>
            <AlertDialogTitle>Remove printer?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the connection settings for {printer?.name}. Print
              history is kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete}>
              <Trash2 /> Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
