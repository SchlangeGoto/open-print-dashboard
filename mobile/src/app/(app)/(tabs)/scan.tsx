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
  Platform,
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

const BARCODE_TYPES: BarcodeType[] = ["ean13", "ean8", "upc_a", "upc_e"];

/**
 * Retail barcodes carry a check digit. Rejecting invalid checksums filters out
 * most blurred or partially-read frames before they create a bogus filament.
 */
function hasValidRetailChecksum(value: string): boolean {
  if (!/^\d+$/.test(value)) return false;
  const digits = value.split("").map(Number);
  const check = digits.pop();
  if (check === undefined) return false;

  let sum = 0;
  for (let index = digits.length - 1, weight = 3; index >= 0; index -= 1) {
    sum += digits[index] * weight;
    weight = weight === 3 ? 1 : 3;
  }
  return (10 - (sum % 10)) % 10 === check;
}

function isValidBarcode(value: string, type?: string): boolean {
  const normalizedType = (type ?? "").toLowerCase();
  // UPC-E's check digit is calculated over the expanded UPC-A, so only
  // validate its length here. Bambu boxes use EAN-13.
  if (normalizedType.includes("upc_e") || normalizedType.includes("upce")) {
    return /^\d{8}$/.test(value);
  }
  if (value.length === 13 || value.length === 12 || value.length === 8) {
    return hasValidRetailChecksum(value);
  }
  return false;
}

export default function ScanScreen() {
  const { api } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const modernScannerAvailable =
    Platform.OS !== "web" && CameraView.isModernBarcodeScannerAvailable;
  const [modernFailed, setModernFailed] = useState(false);
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
        setError(null);
        setManual("");
      };
    }, []),
  );

  const handleCode = useCallback(
    async (raw: string, source: "camera" | "manual" = "manual") => {
      const code = typeof raw === "string" ? raw.trim() : "";
      if (!code || scanLock.current) return;

      if (source === "camera" && !isValidBarcode(code)) {
        setError(
          "That barcode didn't read cleanly. Hold it flat and try again, or enter it manually.",
        );
        return;
      }

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
    },
    [api],
  );

  useEffect(() => {
    if (!modernScannerAvailable || modernFailed) return;

    const subscription = CameraView.onModernBarcodeScanned((event) => {
      const data = typeof event.data === "string" ? event.data : "";
      void CameraView.dismissScanner().catch(() => {});
      if (!data) {
        setError(
          "That barcode didn't read cleanly. Try again or enter it manually.",
        );
        return;
      }
      void handleCode(data, "camera");
    });

    return () => subscription.remove();
  }, [modernScannerAvailable, modernFailed, handleCode]);

  async function openSystemScanner() {
    if (!modernScannerAvailable || modernFailed) return;
    setError(null);

    if (!permission?.granted) {
      const next = await requestPermission();
      if (!next.granted) {
        setError("Camera access is needed to scan barcodes.");
        return;
      }
    }

    try {
      await CameraView.launchScanner({
        barcodeTypes: BARCODE_TYPES,
        isGuidanceEnabled: true,
        isHighlightingEnabled: true,
      });
    } catch {
      setModernFailed(true);
      setError(
        "The system scanner couldn't start. Using the in-app camera instead.",
      );
    }
  }

  function handleBarcodeScanned(scan: BarcodeScanningResult) {
    if (!focusedRef.current || scanLock.current) return;
    const data = typeof scan.data === "string" ? scan.data : "";
    if (!data) {
      setError(
        "That barcode didn't read cleanly. Try again or enter it manually.",
      );
      return;
    }
    // Keep the camera live after a result: a different box scans immediately.
    // The same code is ignored until "Scan next" so one box cannot create
    // duplicate spools frame after frame.
    if (resultRef.current?.code === data) return;
    void handleCode(data, "camera");
  }

  function resetScan() {
    resultRef.current = null;
    setResult(null);
    setError(null);
    setManual("");
  }

  const useEmbeddedScanner = !modernScannerAvailable || modernFailed;

  function startNextScan() {
    if (useEmbeddedScanner) {
      resetScan();
    } else {
      void openSystemScanner();
    }
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
            useEmbeddedScanner ? (
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
            ) : undefined
          }
        />

        {useEmbeddedScanner ? (
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
        ) : (
          <Card style={styles.systemScannerCard}>
            <View
              style={[
                styles.systemScannerIcon,
                { backgroundColor: `${theme.colors.accent}18` },
              ]}
            >
              <Ionicons name="scan" size={42} color={theme.colors.accent} />
            </View>
            <AppText variant="heading" style={styles.center}>
              Scan a filament box
            </AppText>
            <AppText muted style={[styles.center, styles.systemScannerText]}>
              Uses your phone&apos;s fast system scanner. It opens full-screen
              and closes automatically after one barcode.
            </AppText>
            <AppButton
              title={result ? "Scan another barcode" : "Open scanner"}
              onPress={openSystemScanner}
              icon={
                <Ionicons
                  name="scan-outline"
                  size={19}
                  color={theme.colors.onAccent}
                />
              }
            />
            {permission && !permission.granted ? (
              <AppButton
                title={
                  permission.canAskAgain
                    ? "Allow camera"
                    : "Open device settings"
                }
                variant="secondary"
                size="sm"
                onPress={() =>
                  permission.canAskAgain
                    ? requestPermission()
                    : Linking.openSettings()
                }
              />
            ) : null}
            <AppText variant="caption" faint style={styles.center}>
              The system scanner has its own torch and zoom controls.
            </AppText>
          </Card>
        )}

        {!useEmbeddedScanner && busy ? (
          <Card style={styles.lookupCard}>
            <ActivityIndicator color={theme.colors.accent} />
            <AppText muted>Checking the catalog…</AppText>
          </Card>
        ) : null}

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
                    onPress={startNextScan}
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
                    onPress={startNextScan}
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
          Scanner: {useEmbeddedScanner ? "in-app camera" : "native system"} ·
          build {APP_BUILD_TAG}
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
  systemScannerCard: {
    minHeight: 300,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: radius.xl,
  },
  systemScannerIcon: {
    width: 86,
    height: 86,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  systemScannerText: {
    lineHeight: 21,
    marginBottom: spacing.xs,
  },
  lookupCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
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
