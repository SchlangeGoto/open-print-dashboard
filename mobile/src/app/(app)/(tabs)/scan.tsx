import { Ionicons } from "@expo/vector-icons";
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from "expo-camera";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppButton } from "@/components/ui/app-button";
import { AppText } from "@/components/ui/app-text";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ColorDot } from "@/components/ui/color-dot";
import { MetaLine } from "@/components/ui/meta-line";
import { PageHeader, Screen } from "@/components/ui/screen";
import { TextField } from "@/components/ui/text-field";
import { useAuth } from "@/lib/auth";
import { LINEAR_BARCODE_TYPES, normalizeBarcode } from "@/lib/barcode";
import { APP_BUILD_TAG } from "@/lib/build-info";
import { formatError, formatWeight } from "@/lib/format";
import { TAB_BAR_HEIGHT } from "@/lib/layout";
import { radius, spacing, useTheme } from "@/lib/theme";
import type { BarcodeScanResult } from "@/lib/types";

export default function ScanScreen() {
  const { api } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const requested = useRef(false);
  const scanLock = useRef(false);
  const focusedRef = useRef(false);
  const resultRef = useRef<BarcodeScanResult | null>(null);
  const lastAttemptRef = useRef<{
    code: string;
    at: number;
    attempts: number;
  } | null>(null);
  const typeRef = useRef<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [torch, setTorch] = useState(false);
  const [manual, setManual] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [result, setResult] = useState<BarcodeScanResult | null>(null);
  const [scanType, setScanType] = useState<string | null>(null);
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
        lastAttemptRef.current = null;
        typeRef.current = null;
        setFocused(false);
        setPreviewReady(false);
        setTorch(false);
        setResult(null);
        setScanType(null);
        setError(null);
        setManual("");
        setManualOpen(false);
      };
    }, []),
  );

  async function handleCode(raw: string, type?: string) {
    const code = normalizeBarcode(typeof raw === "string" ? raw : "", type);
    if (!code || scanLock.current) return;

    // State updates are async; the ref is the synchronous guard against
    // multiple decoded frames creating duplicate spools.
    scanLock.current = true;
    resultRef.current = null;
    typeRef.current = type ?? null;
    setScanType(type ?? null);
    setResult(null);
    setBusy(true);
    setError(null);
    setManualOpen(false);

    try {
      // Look first so an existing physical spool is never duplicated just
      // because its barcode was scanned again.
      const lookup = await api.scanBarcode(code, false, type);
      if (!focusedRef.current) return;

      // Compatibility with a backend that predates create=false: it creates
      // the spool during the lookup and returns no `created` field.
      if (lookup.created === undefined && lookup.spool) {
        const normalized: BarcodeScanResult = {
          ...lookup,
          created: true,
          existing_spools: [],
        };
        resultRef.current = normalized;
        setResult(normalized);
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );
        return;
      }

      const existing = lookup.existing_spools ?? [];
      if (!lookup.found || existing.length > 0) {
        const normalized: BarcodeScanResult = {
          ...lookup,
          created: lookup.created ?? false,
          existing_spools: existing,
        };
        resultRef.current = normalized;
        setResult(normalized);
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Warning,
        );
        return;
      }

      const created = await api.scanBarcode(
        code,
        true,
        typeRef.current ?? undefined,
      );
      if (!focusedRef.current) return;
      const normalized: BarcodeScanResult = {
        ...created,
        created: created.created ?? true,
        existing_spools: created.existing_spools ?? [],
      };
      resultRef.current = normalized;
      setResult(normalized);
      void Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
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

  async function addAnotherSpool(code: string) {
    if (scanLock.current) return;

    scanLock.current = true;
    setBusy(true);
    setError(null);
    try {
      const created = await api.scanBarcode(
        code,
        true,
        typeRef.current ?? undefined,
      );
      if (!focusedRef.current) return;
      const normalized: BarcodeScanResult = {
        ...created,
        created: created.created ?? true,
        existing_spools: created.existing_spools ?? [],
      };
      resultRef.current = normalized;
      setResult(normalized);
      void Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
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
    const normalized = normalizeBarcode(data, scan.type);
    // Keep the camera live after a result: a different box scans immediately.
    // The same code is ignored until "Scan next" so one box cannot create
    // duplicate spools frame after frame.
    if (resultRef.current?.code === normalized) return;

    // A failed lookup does not set resultRef, so the camera would retry the
    // same frame forever. Ignore the same code for a short window instead.
    const now = Date.now();
    const last = lastAttemptRef.current;
    const attempts = last?.code === normalized ? last.attempts + 1 : 1;
    if (last?.code === normalized) {
      const delay = Math.min(15_000, 1500 * 2 ** Math.min(attempts - 1, 4));
      if (now - last.at < delay) return;
    }
    lastAttemptRef.current = { code: normalized, at: now, attempts };

    void handleCode(data, scan.type).catch((err) => {
      if (focusedRef.current) {
        setError(formatError(err));
      }
    });
  }

  function resetScan() {
    resultRef.current = null;
    lastAttemptRef.current = null;
    typeRef.current = null;
    setResult(null);
    setScanType(null);
    setError(null);
    setManual("");
  }

  const cameraHeight = result
    ? 170
    : Math.min(Math.max(width * 0.78, 300), 420);
  const cameraActive = focused && Boolean(permission?.granted);

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + TAB_BAR_HEIGHT + spacing.xxxl },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
        <PageHeader
          brand
          title="Scan"
          subtitle="Add a spool from its filament box"
          right={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Toggle torch"
              hitSlop={6}
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
                color={torch ? theme.colors.accentText : theme.colors.muted}
              />
            </Pressable>
          }
        />

        <View
          style={[
            styles.cameraCard,
            {
              height: cameraHeight,
              backgroundColor: theme.colors.camera,
              borderColor: theme.colors.border,
            },
          ]}
        >
          {cameraActive ? (
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              enableTorch={torch}
              barcodeScannerSettings={{
                barcodeTypes: LINEAR_BARCODE_TYPES,
              }}
              onBarcodeScanned={handleBarcodeScanned}
              onCameraReady={() => setPreviewReady(true)}
            />
          ) : (
            <View style={styles.cameraFallback}>
              <Ionicons
                name="camera-outline"
                size={34}
                color={theme.colors.onCameraMuted}
              />
              <AppText color={theme.colors.onCameraMuted} style={styles.center}>
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

          {cameraActive ? (
            <View pointerEvents="none" style={styles.scanFrame}>
              <View
                style={[
                  styles.corner,
                  styles.cornerTopLeft,
                  { borderColor: theme.colors.onCameraMuted },
                ]}
              />
              <View
                style={[
                  styles.corner,
                  styles.cornerTopRight,
                  { borderColor: theme.colors.onCameraMuted },
                ]}
              />
              <View
                style={[
                  styles.corner,
                  styles.cornerBottomLeft,
                  { borderColor: theme.colors.onCameraMuted },
                ]}
              />
              <View
                style={[
                  styles.corner,
                  styles.cornerBottomRight,
                  { borderColor: theme.colors.onCameraMuted },
                ]}
              />
            </View>
          ) : null}

          {cameraActive && previewReady && !busy ? (
            <View style={styles.cameraHint}>
              {result ? (
                <Pressable
                  accessibilityRole="button"
                  style={[
                    styles.scanNextButton,
                    { backgroundColor: theme.colors.accent },
                  ]}
                  onPress={resetScan}
                >
                  <Ionicons
                    name="scan"
                    size={17}
                    color={theme.colors.onAccent}
                  />
                  <AppText variant="label" color={theme.colors.onAccent}>
                    Scan next barcode
                  </AppText>
                </Pressable>
              ) : (
                <View
                  style={[
                    styles.hintPill,
                    { backgroundColor: theme.colors.overlay },
                  ]}
                >
                  <Ionicons
                    name="scan-outline"
                    size={14}
                    color={theme.colors.onCamera}
                  />
                  <AppText
                    variant="caption"
                    color={theme.colors.onCameraMuted}
                    style={styles.hintText}
                  >
                    Scanning automatically. Hold the product barcode in view.
                  </AppText>
                </View>
              )}
            </View>
          ) : null}

          {cameraActive && !previewReady ? (
            <View
              style={[
                styles.startingOverlay,
                { backgroundColor: theme.colors.overlay },
              ]}
            >
              <ActivityIndicator color={theme.colors.onCamera} />
              <AppText color={theme.colors.onCamera} variant="caption">
                Starting camera…
              </AppText>
            </View>
          ) : null}

          {busy ? (
            <View
              style={[
                styles.busyOverlay,
                { backgroundColor: theme.colors.overlayStrong },
              ]}
            >
              <ActivityIndicator color={theme.colors.onCamera} size="large" />
              <AppText color={theme.colors.onCamera} variant="label">
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
            {result.created && result.found && result.filament ? (
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
                    <AppText variant="mono" muted selectable>
                      {result.code}
                    </AppText>
                  </View>
                  <Badge label="New" variant="success" />
                </View>

                <View
                  style={[
                    styles.filamentRow,
                    {
                      backgroundColor: theme.colors.input,
                    },
                  ]}
                >
                  <ColorDot color={result.filament.color_hex} size={40} />
                  <View style={styles.filamentText}>
                    <AppText variant="label" numberOfLines={1}>
                      {result.filament.color_name}
                    </AppText>
                    <MetaLine
                      items={[result.filament.brand, result.filament.material]}
                    />
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
            ) : result.found && result.filament ? (
              <>
                <View style={styles.resultHeader}>
                  <View
                    style={[
                      styles.resultIcon,
                      { backgroundColor: `${theme.colors.info}1f` },
                    ]}
                  >
                    <Ionicons
                      name="information-circle"
                      size={22}
                      color={theme.colors.info}
                    />
                  </View>
                  <View style={styles.resultTitleWrap}>
                    <AppText variant="heading">Already in inventory</AppText>
                    <AppText variant="mono" muted selectable>
                      {result.code}
                    </AppText>
                  </View>
                  <Badge
                    label={`${result.existing_spools.length} ${
                      result.existing_spools.length === 1 ? "spool" : "spools"
                    }`}
                    variant="warning"
                  />
                </View>

                <View
                  style={[
                    styles.filamentRow,
                    {
                      backgroundColor: theme.colors.input,
                    },
                  ]}
                >
                  <ColorDot color={result.filament.color_hex} size={40} />
                  <View style={styles.filamentText}>
                    <AppText variant="label" numberOfLines={1}>
                      {result.filament.color_name}
                    </AppText>
                    <MetaLine
                      items={[result.filament.brand, result.filament.material]}
                    />
                  </View>
                  {result.spool ? (
                    <AppText variant="label" color={theme.colors.info}>
                      {result.spool.remaining_unknown
                        ? "Weight unknown"
                        : `${formatWeight(result.spool.remaining_g)} left`}
                    </AppText>
                  ) : null}
                </View>

                <AppText muted style={styles.resultDescription}>
                  This barcode is already linked to{" "}
                  {result.existing_spools.length}{" "}
                  {result.existing_spools.length === 1 ? "spool" : "spools"}.
                  Open the latest one, or add another physical box.
                </AppText>

                <View style={styles.resultActions}>
                  {result.spool ? (
                    <AppButton
                      title="Open latest spool"
                      onPress={() =>
                        router.push({
                          pathname: "/spool/[id]",
                          params: { id: result.spool!.id },
                        })
                      }
                    />
                  ) : null}
                  <AppButton
                    title="Add another spool"
                    variant="secondary"
                    loading={busy}
                    onPress={() => addAnotherSpool(result.code)}
                  />
                  <AppButton
                    title="Scan next barcode"
                    variant="ghost"
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
                    <AppText variant="mono" muted selectable>
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
                          type: scanType ?? undefined,
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

        <View
          style={[
            styles.manualSection,
            {
              borderTopColor: theme.colors.border,
              borderBottomColor: theme.colors.border,
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: manualOpen }}
            onPress={() => setManualOpen((value) => !value)}
            style={styles.manualToggle}
          >
            <Ionicons
              name="keypad-outline"
              size={17}
              color={theme.colors.muted}
            />
            <AppText variant="label" style={styles.manualLabel}>
              Enter barcode manually
            </AppText>
            <Ionicons
              name={manualOpen ? "chevron-up" : "chevron-down"}
              size={16}
              color={theme.colors.faint}
            />
          </Pressable>

          {manualOpen ? (
            <View style={styles.manualBody}>
              <TextField
                value={manual}
                onChangeText={setManual}
                placeholder="e.g. 6975337032380"
                returnKeyType="go"
                onSubmitEditing={() => handleCode(manual)}
                autoCapitalize="none"
                autoCorrect={false}
                compact
              />
              <AppButton
                title="Look up barcode"
                size="sm"
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
            </View>
          ) : null}
        </View>

        <AppText variant="caption" muted style={styles.tip}>
          Scan the striped barcode on the box. The square Bambu QR is just a
          short link and is ignored. Known boxes are created automatically.
          Other brands ask for colour and material once.
        </AppText>

        <AppText variant="monoMicro" muted style={styles.buildTag} selectable>
          Scanner: in-app barcode. Build {APP_BUILD_TAG}
        </AppText>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: radius.lg,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  cameraCard: {
    borderRadius: radius.xl,
    borderCurve: "continuous",
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
  },
  cameraFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xl,
  },
  scanFrame: {
    position: "absolute",
    alignSelf: "center",
    top: "50%",
    // Half of the frame height, so the frame is optically centred.
    marginTop: -70,
    width: 236,
    height: 140,
  },
  corner: {
    position: "absolute",
    width: 24,
    height: 24,
  },
  cornerTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderTopLeftRadius: radius.sm,
  },
  cornerTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderTopRightRadius: radius.sm,
  },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderBottomLeftRadius: radius.sm,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderBottomRightRadius: radius.sm,
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
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    borderCurve: "continuous",
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
    borderRadius: radius.xl,
    borderCurve: "continuous",
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
    borderRadius: radius.lg,
    borderCurve: "continuous",
  },
  filamentText: {
    flex: 1,
    gap: 2,
  },
  resultActions: {
    gap: spacing.sm,
  },
  manualSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  manualToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  manualLabel: {
    flex: 1,
  },
  manualBody: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  tip: {
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: spacing.md,
  },
  buildTag: {
    textAlign: "center",
  },
});
