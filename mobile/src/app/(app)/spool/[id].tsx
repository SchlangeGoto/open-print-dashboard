import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppButton } from "@/components/ui/app-button";
import { AppText } from "@/components/ui/app-text";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DetailRow } from "@/components/detail-row";
import { EmptyState } from "@/components/ui/empty-state";
import { MetaLine } from "@/components/ui/meta-line";
import { ProgressBar } from "@/components/ui/progress-bar";
import { PageHeader, Screen } from "@/components/ui/screen";
import { Skeleton } from "@/components/ui/skeleton";
import { StatGrid } from "@/components/ui/stat-readout";
import { useAsyncData } from "@/hooks/use-async-data";
import { useAuth } from "@/lib/auth";
import {
  formatDate,
  formatError,
  formatPrice,
  formatWeight,
  isLightColor,
  percent,
} from "@/lib/format";
import { radius, spacing, useTheme } from "@/lib/theme";
import type { Printer, SpoolDetailData } from "@/lib/types";

export default function SpoolDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [busyPrinter, setBusyPrinter] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loader = useCallback(async (): Promise<SpoolDetailData> => {
    if (!id) {
      throw new Error("Spool not found");
    }
    const spool = await api.getSpool(id);
    const [filament, printers] = await Promise.all([
      spool.filament_id ? api.getFilament(spool.filament_id) : null,
      api.getPrinters(),
    ]);
    return { spool, filament, printers };
  }, [api, id]);

  const { data, loading, refreshing, error, reload, refresh } =
    useAsyncData(loader);

  async function loadInto(printer: Printer) {
    if (!id || !printer.id) return;
    setBusyPrinter(printer.id);
    setActionError(null);
    try {
      await api.activateSpool(id, printer.id);
      try {
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );
      } catch {
        // Haptics are best-effort; the spool is already loaded.
      }
      await reload();
    } catch (err) {
      setActionError(formatError(err));
    } finally {
      setBusyPrinter(null);
    }
  }

  const header = (
    <PageHeader
      title="Spool"
      subtitle={data?.filament?.color_name ?? "Inventory details"}
      left={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={12}
          onPress={() =>
            router.canGoBack() ? router.back() : router.replace("/")
          }
        >
          <Ionicons
            name="chevron-back"
            size={26}
            color={theme.colors.text}
          />
        </Pressable>
      }
      right={
        data ? (
          <Badge
            label={data.spool.printer_id ? "Loaded" : "Unloaded"}
            variant={data.spool.printer_id ? "success" : "neutral"}
          />
        ) : undefined
      }
    />
  );

  if (loading && !data) {
    return (
      <Screen>
        <View style={styles.headerPadding}>{header}</View>
        <View style={styles.loadingSkeleton}>
          <Skeleton width="100%" height={190} rounded={radius.xl} />
          <Skeleton width="100%" height={54} rounded={radius.lg} />
          <Skeleton width="100%" height={132} rounded={radius.xl} />
        </View>
      </Screen>
    );
  }

  if (!data) {
    return (
      <Screen>
        <View style={styles.headerPadding}>{header}</View>
        <EmptyState
          icon="cloud-offline-outline"
          title="Couldn't load this spool"
          description={error ?? "The spool may have been deleted."}
          action={<AppButton title="Try again" onPress={reload} />}
        />
      </Screen>
    );
  }

  const { spool, filament, printers } = data;
  const unknown = Boolean(spool.remaining_unknown);
  const pct = unknown ? 0 : percent(spool.remaining_g, spool.total_weight_g);
  const color = filament?.color_hex ?? theme.colors.faint;
  const heroText = isLightColor(color)
    ? theme.colors.mediaInk
    : theme.colors.mediaPaper;
  const currentPrinter = printers.find(
    (printer) => printer.id && printer.id === spool.printer_id,
  );
  const otherPrinters = printers.filter(
    (printer) => printer.id !== null && printer.id !== spool.printer_id,
  );
  const sourceLabel =
    spool.source === "ams"
      ? "AMS"
      : spool.source === "barcode"
        ? "Barcode"
        : spool.source
          ? spool.source.charAt(0).toUpperCase() + spool.source.slice(1)
          : "Manual";

  return (
    <Screen>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + spacing.xxxl },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={theme.colors.accent}
            colors={[theme.colors.accent]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerPadding}>{header}</View>

        {error && data ? (
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
              name="warning-outline"
              size={16}
              color={theme.colors.danger}
            />
            <AppText variant="caption" color={theme.colors.danger}>
              {error} Showing the last known data.
            </AppText>
          </View>
        ) : null}

        <LinearGradient
          colors={[color, theme.colors.surface]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { borderColor: theme.colors.border }]}
        >
          <View style={styles.heroTop}>
            <MetaLine
              items={
                filament ? [filament.brand, filament.material] : ["Filament"]
              }
              color={heroText}
              ruleColor={`${heroText}55`}
            />
            <View
              style={[
                styles.heroBadge,
                { backgroundColor: theme.colors.scrim },
              ]}
            >
              <AppText variant="caption" color={heroText}>
                {unknown ? "Weight unknown" : `${pct}% left`}
              </AppText>
            </View>
          </View>
          <AppText variant="display" color={heroText} numberOfLines={2}>
            {filament?.color_name ?? "Unknown color"}
          </AppText>
          <AppText variant="caption" color={heroText} style={styles.heroWeight}>
            {unknown
              ? "Weight unknown · added from printer"
              : `${formatWeight(spool.remaining_g)} remaining of ${formatWeight(
                  spool.total_weight_g,
                )}`}
          </AppText>
          {unknown ? null : (
            <View style={styles.heroProgress}>
              <ProgressBar value={pct} color={heroText} height={6} />
            </View>
          )}
        </LinearGradient>

        {actionError ? (
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
              name="warning-outline"
              size={16}
              color={theme.colors.danger}
            />
            <AppText variant="caption" color={theme.colors.danger}>
              {actionError}
            </AppText>
          </View>
        ) : null}

        <StatGrid
          stats={[
            {
              value: unknown ? "Unknown" : formatWeight(spool.remaining_g),
              label: "Remaining",
            },
            { value: formatWeight(spool.total_weight_g), label: "Total" },
            { value: formatPrice(spool.price_per_kg), label: "Price" },
            { value: sourceLabel, label: "Source" },
          ]}
        />

        <Card style={styles.section}>
          <AppText variant="heading">Location</AppText>
          {currentPrinter ? (
            <View
              style={[
                styles.currentPrinter,
                { backgroundColor: `${theme.colors.accent}12` },
              ]}
            >
              <View
                style={[
                  styles.printerIcon,
                  { backgroundColor: `${theme.colors.accent}1f` },
                ]}
              >
                <Ionicons
                  name="print"
                  size={20}
                  color={theme.colors.accentText}
                />
              </View>
              <View style={styles.currentPrinterText}>
                <AppText variant="label">{currentPrinter.name}</AppText>
                <AppText variant="caption" muted>
                  {currentPrinter.model ?? "Printer"}
                </AppText>
              </View>
            </View>
          ) : (
            <AppText muted>This spool is not loaded in a printer.</AppText>
          )}

          {otherPrinters.length > 0 ? (
            <View style={styles.printerList}>
              {otherPrinters.map((printer) => (
                <View
                  key={printer.id ?? printer.serial}
                  style={[
                    styles.printerRow,
                    { borderColor: theme.colors.border },
                  ]}
                >
                  <View style={styles.printerRowText}>
                    <AppText variant="label" numberOfLines={1}>
                      {printer.name}
                    </AppText>
                    <MetaLine
                      items={[
                        printer.online ? "Online" : "Offline",
                        printer.configured ? null : "Cloud only",
                      ]}
                    />
                  </View>
                  {printer.id ? (
                    <AppButton
                      title="Load here"
                      size="sm"
                      variant="secondary"
                      loading={busyPrinter === printer.id}
                      onPress={() => loadInto(printer)}
                    />
                  ) : (
                    <Badge label="Cloud only" variant="warning" />
                  )}
                </View>
              ))}
            </View>
          ) : (
            <AppText variant="caption" muted>
              {printers.length === 0
                ? "No printers configured. Add one from the web dashboard."
                : currentPrinter
                  ? "No other printers to load into."
                  : "No other configured printers. Add the printer from the web dashboard first."}
            </AppText>
          )}
        </Card>

        <Card style={styles.section}>
          <AppText variant="heading">Details</AppText>
          <DetailRow label="Barcode" value={spool.barcode ?? "None"} mono />
          <DetailRow label="NFC / tag UID" value={spool.tag_uid ?? "None"} mono />
          <DetailRow label="Added" value={formatDate(spool.created_at)} />
          <DetailRow label="Last used" value={formatDate(spool.last_used_at)} />
          {filament ? (
            <DetailRow
              label="Bambu preset"
              value={filament.bambu_info_idx ?? "None"}
              mono
            />
          ) : null}
          {spool.notes ? (
            <DetailRow label="Notes" value={spool.notes} />
          ) : null}
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  headerPadding: {
    paddingTop: 0,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  loadingSkeleton: {
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  hero: {
    borderRadius: radius.xl,
    borderCurve: "continuous",
    borderWidth: 1,
    padding: spacing.xl,
    minHeight: 190,
    justifyContent: "flex-end",
    gap: spacing.xs,
    overflow: "hidden",
  },
  heroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "auto",
    gap: spacing.md,
  },
  heroBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  heroWeight: {
    opacity: 0.86,
  },
  heroProgress: {
    marginTop: spacing.sm,
  },
  section: {
    gap: spacing.md,
  },
  currentPrinter: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderCurve: "continuous",
  },
  printerIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  currentPrinterText: {
    flex: 1,
    gap: 2,
  },
  printerList: {
    gap: spacing.sm,
  },
  printerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.md,
  },
  printerRowText: {
    flex: 1,
    gap: 2,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    borderCurve: "continuous",
    padding: spacing.md,
  },
});
