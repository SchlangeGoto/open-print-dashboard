import { Ionicons } from "@expo/vector-icons";
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
  type BarcodeType,
} from "expo-camera";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";

import { AppButton } from "@/components/ui/app-button";
import { AppText } from "@/components/ui/app-text";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ColorDot } from "@/components/ui/color-dot";
import { PageHeader, Screen } from "@/components/ui/screen";
import { TextField } from "@/components/ui/text-field";
import { useAuth } from "@/lib/auth";
import { APP_BUILD_TAG } from "@/lib/build-info";
import { formatError, formatWeight } from "@/lib/format";
import { radius, spacing, useTheme } from "@/lib/theme";
import type { BarcodeScanResult } from "@/lib/types";

// Bambu Handy adds filament by scanning the QR on the box, not only the EAN.
// Keep the retail types too so either label works.
const BARCODE_TYPES: BarcodeType[] = [
  "ean13",
  "ean8",
  "upc_a",
  "upc_e",
  "qr",
  "code128",
  "code39",
  "itf14",
  "datamatrix",
  "aztec",
];

interface LastScan {
  type: string;
  raw: string;
  normalized: string;
}

/**
 * Bambu's QR can contain a GTIN, a SKU (A01-A2-1.75-1000-SPL), a variant
 * (A01-A2), a 5-digit filament code, or a URL around one of those. Extract the
 * useful identifier before sending it to the backend.
 */
function normalizeScannedData(raw: string): string {
  const value = raw.trim();
  if (!value) return "";

  if (/^\d{8,14}$/.test(value)) return value;

  const gtin = value.match(/(?:^|\D)(\d{12,14})(?:\D|$)/);
  if (gtin) return gtin[1];

  const sku = value.match(
    /\b([A-Z]\d{2}-[A-Z0-9]{1,4}(?:-\d+(?:\.\d+)?-\d+-[A-Z]+)?)\b/i,
  );
  if (sku) {
    const identifier = sku[1].toUpperCase();
    // A bare variant ID is enough for the backend once we add the standard
    // diameter/weight suffix.
    if (/^[A-Z]\d{2}-[A-Z0-9]{1,4}$/.test(identifier)) {
      return `${identifier}-1.75-1000-SPL`;
    }
    return identifier;
  }

  const filamentCode = value.match(/\b(\d{5})\b/);
  if (filamentCode) return filamentCode[1];

  return value;
}

export default function ScanScreen() {
  const { api } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const requested = useRef(false);
  const scanLock = useRef(false);
  const focusedRef = useRef(false);
  const resultRef = useRef<BarcodeScanResult | null>(null);
  const [focused, setFocused] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [torch, setTorch] = useState(false);
  const [manual, setManual] = useState("");
  const [result, setResult] = useState<BarcodeScanResult | null>(null);
  const [lastScan, setLastScan] = useState<LastScan | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (
      permission &&
      !permission.granted &&
      permission.canAskAgain &&
      !requested.current
    ) {
      requested.current = true;
      void requestPermission();
    }
  }, [permission, requestPermission]);

  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      setFocused(true);
      return () => {
        focusedRef.current = false;
        resultRef.current = null;
        setFocused(false);
        setPreviewReady(false);
        setTorch(false);
        setResult(null);
        setLastScan(null);
        setError(null);
        setManual("");
      };
    }, []),
  );

  async function handleCode(raw: string) {
    const code = normalizeScannedData(typeof raw === "string" ? raw : "");
    if (!code || scanLock.current) return;

    // State updates are async; the ref is the synchronous guard against
    // multiple decoded frames creating duplicate spools.
    scanLock.current = true;
    resultRef.current = null;
    setResult(null);
    setBusy(true);
    setError(null);

    try {
      const scan = await api.scanBarcode(code);
      if (!focusedRef.current) return;
      resultRef.current = scan;
      setResult(scan);
      void Haptics.notificationAsync(
        scan.found
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning,
      );
    } catch (err) {
      if (!focusedRef.current) return;
      setError(formatError(err));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      scanLock.current = false;
      setBusy(false);
    }
  }

  function handleBarcodeScanned(scan: BarcodeScanningResult) {
    if (!focusedRef.current || scanLock.current) return;
    const data = typeof scan.data === "string" ? scan.data : "";
    if (!data) return;

    const normalized = normalizeScannedData(data);
    if (!normalized) return;

    // Keep the camera live after a result: a different box scans immediately.
    // The same code is ignored until "Scan next" so one box cannot create
    // duplicate spools frame after frame.
    if (resultRef.current?.code === normalized) return;

    setLastScan({ type: scan.type, raw: data, normalized });
    void handleCode(normalized).catch((err) => {
      if (focusedRef.current) {
        setError(formatError(err));
      }
    });
  }

  function resetScan() {
    resultRef.current = null;
    setResult(null);
    setLastScan(null);
    setError(null);
    setManual("");
  }

  const cameraHeight = Math.min(Math.max(width * 0.78, 300), 420);
  const cameraActive = focused && Boolean(permission?.granted);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <PageHeader
          title="Scan"
          subtitle="Add a spool from its filament box"
          right={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Toggle torch"
              onPress={() => setTorch((value) => !value)}
              style={[
                styles.iconButton,
                {
                  backgroundColor: torch
                    ? `${theme.colors.accent}22`
                    : theme.colors.surfaceAlt,
                },
              ]}
            >
              <Ionicons
                name={torch ? "flash" : "flash-outline"}
                size={18}
                color={torch ? theme.colors.accent : theme.colors.muted}
              />
            </Pressable>
          }
        />

        <View
          style={[
            styles.cameraCard,
            { height: cameraHeight, backgroundColor: "#000" },
          ]}
        >
          {cameraActive ? (
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              enableTorch={torch}
              barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
              onBarcodeScanned={handleBarcodeScanned}
              onCameraReady={() => setPreviewReady(true)}
            />
          ) : (
            <View style={styles.cameraFallback}>
              <Ionicons
                name="camera-outline"
                size={34}
                color="rgba(255,255,255,0.7)"
              />
              <AppText color="rgba(255,255,255,0.8)" style={styles.center}>
                {permission?.granted
                  ? "Camera paused."
                  : permission
                    ? "Camera access is needed to scan barcodes."
                    : "Checking camera permission…"}
              </AppText>
              {permission && !permission.granted ? (
                <AppButton
                  title={
                    permission.canAskAgain
                      ? "Allow camera"
                      : "Open device settings"
                  }
                  size="sm"
                  onPress={() =>
                    permission.canAskAgain
                      ? requestPermission()
                      : Linking.openSettings()
                  }
                />
              ) : null}
            </View>
          )}

          {cameraActive && previewReady && !busy ? (
            <View style={styles.cameraHint}>
              {result ? (
                <Pressable
                  accessibilityRole="button"
                  style={styles.scanNextButton}
                  onPress={resetScan}
                >
                  <Ionicons name="scan" size={17} color="#fff" />
                  <AppText variant="label" color="#fff">
                    Scan next barcode
                  </AppText>
                </Pressable>
              ) : (
                <View style={styles.hintPill}>
                  <Ionicons name="scan-outline" size={14} color="#fff" />
                  <AppText
                    variant="caption"
                    color="rgba(255,255,255,0.92)"
                    style={styles.hintText}
                  >
                    Scanning automatically — hold the product barcode in view
                  </AppText>
                </View>
              )}
            </View>
          ) : null}

          {cameraActive && !previewReady ? (
            <View style={styles.startingOverlay}>
              <ActivityIndicator color="#fff" />
              <AppText color="#fff" variant="caption">
                Starting camera…
              </AppText>
            </View>
          ) : null}

          {busy ? (
            <View style={styles.busyOverlay}>
              <ActivityIndicator color="#fff" size="large" />
              <AppText color="#fff" variant="label">
                Checking the catalog…
              </AppText>
            </View>
          ) : null}
        </View>

        {error ? (
          <View
            style={[
              styles.banner,
              {
                backgroundColor: `${theme.colors.danger}18`,
                borderColor: `${theme.colors.danger}55`,
              },
            ]}
          >
            <Ionicons
              name="alert-circle"
              size={17}
              color={theme.colors.danger}
            />
            <AppText
              variant="caption"
              color={theme.colors.danger}
              style={styles.bannerText}
            >
              {error}
            </AppText>
          </View>
        ) : null}

        {result ? (
          <Card style={styles.resultCard}>
            {lastScan ? (
              <AppText variant="caption" faint numberOfLines={3}>
                Camera read {lastScan.type}: {lastScan.raw}
              </AppText>
            ) : null}
            {result.found && result.filament ? (
              <>
                <View style={styles.resultHeader}>
                  <View
                    style={[
                      styles.resultIcon,
                      { backgroundColor: `${theme.colors.success}1f` },
                    ]}
                  >
                    <Ionicons
                      name="checkmark"
                      size={22}
                      color={theme.colors.success}
                    />
                  </View>
                  <View style={styles.resultTitleWrap}>
                    <AppText variant="heading">Spool added</AppText>
                    <AppText variant="caption" faint>
                      {result.code}
                    </AppText>
                  </View>
                  <Badge label="New" variant="success" />
                </View>

                <View style={styles.filamentRow}>
                  <ColorDot color={result.filament.color_hex} size={40} />
                  <View style={styles.filamentText}>
                    <AppText variant="label" numberOfLines={1}>
                      {result.filament.color_name}
                    </AppText>
                    <AppText variant="caption" muted>
                      {result.filament.brand} · {result.filament.material}
                    </AppText>
                  </View>
                  {result.spool ? (
                    <AppText variant="label" color={theme.colors.success}>
                      {formatWeight(result.spool.total_weight_g)}
                    </AppText>
                  ) : null}
                </View>

                <View style={styles.resultActions}>
                  <AppButton
                    title="View spool"
                    onPress={() => {
                      if (result.spool) {
                        router.push({
                          pathname: "/spool/[id]",
                          params: { id: result.spool.id },
                        });
                      }
                    }}
                  />
                  <AppButton
                    title="Scan another"
                    variant="secondary"
                    onPress={resetScan}
                  />
                </View>
              </>
            ) : (
              <>
                <View style={styles.resultHeader}>
                  <View
                    style={[
                      styles.resultIcon,
                      { backgroundColor: `${theme.colors.warning}1f` },
                    ]}
                  >
                    <Ionicons
                      name="help"
                      size={22}
                      color={theme.colors.warning}
                    />
                  </View>
                  <View style={styles.resultTitleWrap}>
                    <AppText variant="heading">Barcode not in catalog</AppText>
                    <AppText variant="caption" faint>
                      {result.code}
                    </AppText>
                  </View>
                  <Badge label="Unknown" variant="warning" />
                </View>

                <AppText muted style={styles.resultDescription}>
                  Add the filament details once. This barcode will be remembered
                  for next time.
                </AppText>

                <View style={styles.resultActions}>
                  <AppButton
                    title="Create filament"
                    onPress={() =>
                      router.push({
                        pathname: "/scan-confirm",
                        params: {
                          code: result.code,
                          suggested: JSON.stringify(
                            result.suggested_filament ?? null,
                          ),
                        },
                      })
                    }
                  />
                  <AppButton
                    title="Scan another"
                    variant="secondary"
                    onPress={resetScan}
                  />
                </View>
              </>
            )}
          </Card>
        ) : null}

        <Card style={styles.manualCard}>
          <View style={styles.manualHeader}>
            <AppText variant="heading">Enter it manually</AppText>
            <AppText variant="caption" faint>
              Useful when the label is damaged.
            </AppText>
          </View>
          <TextField
            value={manual}
            onChangeText={setManual}
            placeholder="e.g. 6975337032380"
            returnKeyType="go"
            onSubmitEditing={() => handleCode(manual)}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <AppButton
            title="Look up barcode"
            variant="secondary"
            disabled={!manual.trim()}
            loading={busy}
            onPress={() => handleCode(manual)}
            icon={
              <Ionicons
                name="search-outline"
                size={17}
                color={theme.colors.text}
              />
            }
          />
        </Card>

        <AppText variant="caption" faint style={styles.tip}>
          Known Bambu boxes are created automatically. For other brands, the app
          asks for the colour and material once.
        </AppText>

        <AppText variant="caption" faint style={styles.buildTag}>
          Scanner: in-app camera · build {APP_BUILD_TAG}
        </AppText>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl,
    gap: spacing.lg,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  cameraCard: {
    borderRadius: radius.xl,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
  },
  cameraFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xl,
  },
  center: {
    textAlign: "center",
  },
  cameraHint: {
    position: "absolute",
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    alignItems: "center",
  },
  hintPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "rgba(0,0,0,0.62)",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxWidth: "100%",
  },
  hintText: {
    flexShrink: 1,
  },
  scanNextButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "rgba(45,212,191,0.92)",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  startingOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  busyOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(0,0,0,0.62)",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  bannerText: {
    flex: 1,
    lineHeight: 18,
  },
  resultCard: {
    gap: spacing.lg,
  },
  resultHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  resultIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  resultTitleWrap: {
    flex: 1,
    gap: 2,
  },
  resultDescription: {
    lineHeight: 21,
  },
  filamentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  filamentText: {
    flex: 1,
    gap: 2,
  },
  resultActions: {
    gap: spacing.sm,
  },
  manualCard: {
    gap: spacing.md,
  },
  manualHeader: {
    gap: 2,
  },
  tip: {
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: spacing.md,
  },
  buildTag: {
    textAlign: "center",
    fontFamily: "monospace",
    fontSize: 10,
  },
});
