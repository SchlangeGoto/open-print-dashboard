"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import {
  Camera,
  CameraOff,
  CheckCircle2,
  ImageUp,
  ScanLine,
} from "lucide-react";
import { toast } from "@/lib/toast";

import { api, type BarcodeScanResult } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ColorPicker } from "@/components/ui/color-picker";
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
import { SpoolIndicator } from "@/components/ui/SpoolIndicator";
import { formatWeight } from "@/lib/utils";

export default function ScanPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const handledRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [result, setResult] = useState<BarcodeScanResult | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [unknownCode, setUnknownCode] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    brand: "Bambu Lab",
    material: "PLA",
    color_name: "",
    color_hex: "#F99963",
    spool_weight_g: 1000,
    nozzle_temp_min: 190,
    nozzle_temp_max: 230,
    bed_temp: 45,
  });

  useEffect(() => {
    return () => {
      controlsRef.current?.stop();
    };
  }, []);

  function stopCamera() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setCameraOn(false);
  }

  async function lookup(code: string) {
    const cleaned = code.trim();
    if (!cleaned) return;
    setScanning(true);
    setResult(null);
    try {
      const response = await api.scanBarcode(cleaned);
      if (response.found) {
        setResult(response);
        toast.success("Spool added to the library");
      } else {
        setUnknownCode(cleaned);
        setCreateOpen(true);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not look up barcode",
      );
    } finally {
      setScanning(false);
    }
  }

  async function startCamera() {
    if (!videoRef.current) return;
    setCameraError(null);
    handledRef.current = false;
    try {
      const reader = new BrowserMultiFormatReader();
      controlsRef.current = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current,
        (scanResult, _error, controls) => {
          if (!scanResult || handledRef.current) return;
          handledRef.current = true;
          controls.stop();
          setCameraOn(false);
          void lookup(scanResult.getText());
        },
      );
      setCameraOn(true);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Camera could not be started";
      setCameraError(
        window.isSecureContext
          ? message
          : "Camera access needs HTTPS or localhost. Use manual entry or a photo instead.",
      );
    }
  }

  async function handlePhoto(file: File) {
    const reader = new BrowserMultiFormatReader();
    const url = URL.createObjectURL(file);
    try {
      const response = await reader.decodeFromImageUrl(url);
      await lookup(response.getText());
    } catch {
      toast.error("No barcode found in that photo");
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function handleCreate() {
    if (!unknownCode) return;
    setSaving(true);
    try {
      const response = await api.confirmBarcode(
        unknownCode,
        {
          ...form,
          spool_weight_g: Number(form.spool_weight_g),
        },
        Number(form.spool_weight_g),
      );
      setResult(response);
      setCreateOpen(false);
      setUnknownCode(null);
      toast.success("Filament and spool created");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not create filament",
      );
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setResult(null);
    setUnknownCode(null);
    setManualCode("");
    handledRef.current = false;
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 pb-8">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold">
          <ScanLine className="size-5 text-primary" />
          Scan filament
        </h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Scan the Bambu package barcode or enter the number manually.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Camera className="size-4" /> Camera
            </CardTitle>
            <CardDescription>
              Point the camera at the EAN barcode on the box.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative aspect-video overflow-hidden rounded-lg bg-muted">
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                muted
                playsInline
              />
              {!cameraOn ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                  <CameraOff className="size-6" />
                  <span className="text-xs">Camera is off</span>
                </div>
              ) : null}
            </div>
            {cameraError ? (
              <p className="text-xs text-destructive">{cameraError}</p>
            ) : null}
            <div className="flex gap-2">
              {cameraOn ? (
                <Button variant="outline" className="flex-1" onClick={stopCamera}>
                  <CameraOff /> Stop camera
                </Button>
              ) : (
                <Button
                  className="flex-1"
                  onClick={startCamera}
                  disabled={scanning}
                >
                  <Camera /> Start camera
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImageUp /> Photo
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handlePhoto(file);
                  event.target.value = "";
                }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Manual entry</CardTitle>
            <CardDescription>
              Use this if the camera is blocked or the barcode is hard to read.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void lookup(manualCode);
              }}
            >
              <Input
                value={manualCode}
                onChange={(event) => setManualCode(event.target.value)}
                placeholder="6975337032380"
                inputMode="numeric"
                aria-label="Barcode number"
              />
              <LoadingButton type="submit" loading={scanning}>
                Look up
              </LoadingButton>
            </form>
          </CardContent>
        </Card>
      </div>

      {result?.found && result.filament && result.spool ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-emerald-500" />
              Spool added
            </CardTitle>
            <CardDescription>
              {result.code} is linked to this filament.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4 rounded-xl border bg-muted/30 p-4">
              <SpoolIndicator
                remaining={result.spool.remaining_g}
                total={result.spool.total_weight_g}
                color={result.filament.color_hex}
                size={64}
              />
              <div className="min-w-0">
                <p className="font-medium">{result.filament.color_name}</p>
                <p className="text-xs text-muted-foreground">
                  {result.filament.brand} · {result.filament.material} ·{" "}
                  {formatWeight(result.spool.total_weight_g)}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button nativeButton={false} render={<Link href="/dashboard/spools" />}>
                Open spools
              </Button>
              <Button variant="outline" onClick={reset}>
                Scan another
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false);
            setUnknownCode(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create filament?</DialogTitle>
            <DialogDescription>
              Barcode {unknownCode} is not in the library yet. Save the
              filament once and future scans will add a spool automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="scan-brand">Brand</FieldLabel>
              <Input
                id="scan-brand"
                value={form.brand}
                onChange={(event) =>
                  setForm({ ...form, brand: event.target.value })
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="scan-material">Material</FieldLabel>
              <Input
                id="scan-material"
                value={form.material}
                onChange={(event) =>
                  setForm({ ...form, material: event.target.value })
                }
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="scan-color-name">Color name</FieldLabel>
              <Input
                id="scan-color-name"
                value={form.color_name}
                onChange={(event) =>
                  setForm({ ...form, color_name: event.target.value })
                }
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="scan-color">Color</FieldLabel>
              <ColorPicker
                id="scan-color"
                value={form.color_hex}
                onChange={(color_hex) => setForm({ ...form, color_hex })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="scan-weight">Spool weight (g)</FieldLabel>
              <Input
                id="scan-weight"
                type="number"
                value={form.spool_weight_g}
                onChange={(event) =>
                  setForm({
                    ...form,
                    spool_weight_g: Number(event.target.value),
                  })
                }
              />
            </Field>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateOpen(false);
                setUnknownCode(null);
              }}
            >
              Cancel
            </Button>
            <LoadingButton
              loading={saving}
              disabled={!form.color_name.trim()}
              onClick={handleCreate}
            >
              Create filament & spool
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
