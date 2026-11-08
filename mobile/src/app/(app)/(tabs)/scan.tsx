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
import { formatError, formatWeight } from "@/lib/format";
import { radius, spacing, useTheme } from "@/lib/theme";
import type { BarcodeScanResult } from "@/lib/types";

const BARCODE_TYPES: BarcodeType[] = ["ean13", "ean8", "upc_a", "upc_e"];

export default function ScanScreen() {
  const { api } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const requested = useRef(false);
  const scanLock = useRef(false);
  const focusedRef = useRef(false);
  const [focused, setFocused] = useState(false);
  const [scanning, setScanning] = useState(true);
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
        setFocused(false);
        setTorch(false);
        setScanning(true);
        setResult(null);
        setError(null);
        setManual("");
      };
    }, []),
  );

  async function handleCode(raw: string) {
    const code = raw.trim();
    if (!code || busy || scanLock.current) return;

    // State updates are async; the ref is the synchronous guard against
    // multiple decoded frames creating duplicate spools.
    scanLock.current = true;
    setBusy(true);
    setError(null);
    setScanning(false);

    try {
      const scan = await api.scanBarcode(code);
      if (!focusedRef.current) return;
      setResult(scan);
      void Haptics.notificationAsync(
        scan.found
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning,
      );
    } catch (err) {
      if (!focusedRef.current) return;
      setError(formatError(err));
      setScanning(true);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      scanLock.current = false;
      setBusy(false);
    }
  }

  function handleBarcodeScanned(scan: BarcodeScanningResult) {
    if (!scanning || busy || result || scanLock.current) return;
    void handleCode(scan.data);
  }

  function resetScan() {
    setResult(null);
    setError(null);
    setManual("");
    setScanning(true);
  }

  const cameraHeight = Math.min(Math.max(width * 0.62, 250), 360);
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
              onBarcodeScanned={
                scanning && !result && !busy ? handleBarcodeScanned : undefined
              }
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

          {cameraActive ? (
            <>
              <View style={styles.scanFrame}>
                <View style={[styles.corner, styles.cornerTopLeft]} />
                <View style={[styles.corner, styles.cornerTopRight]} />
                <View style={[styles.corner, styles.cornerBottomLeft]} />
                <View style={[styles.corner, styles.cornerBottomRight]} />
              </View>
              <View style={styles.cameraHint}>
                <AppText variant="caption" color="rgba(255,255,255,0.9)">
                  {busy
                    ? "Looking up barcode…"
                    : "Point the camera at an EAN barcode"}
                </AppText>
              </View>
            </>
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
  scanFrame: {
    position: "absolute",
    left: "12%",
    right: "12%",
    top: "22%",
    bottom: "22%",
  },
  corner: {
    position: "absolute",
    width: 28,
    height: 28,
    borderColor: "rgba(255,255,255,0.9)",
  },
  cornerTopLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 10,
  },
  cornerTopRight: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 10,
  },
  cornerBottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 10,
  },
  cornerBottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 10,
  },
  cameraHint: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: spacing.md,
    alignItems: "center",
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
});
