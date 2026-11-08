import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
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
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress-bar";
import { PageHeader, Screen } from "@/components/ui/screen";
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
import type { Filament, Printer, Spool } from "@/lib/types";

interface DetailData {
  spool: Spool;
  filament: Filament | null;
  printers: Printer[];
}

export default function SpoolDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [busyPrinter, setBusyPrinter] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loader = useCallback(async (): Promise<DetailData> => {
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
    if (!printer.id) return;
    setBusyPrinter(printer.id);
    setActionError(null);
    try {
      await api.activateSpool(id, printer.id);
      await Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      );
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
          onPress={() => router.back()}
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
        <View style={styles.loading}>
          <ActivityIndicator color={theme.colors.accent} />
          <AppText muted>Loading spool…</AppText>
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
  const pct = percent(spool.remaining_g, spool.total_weight_g);
  const color = filament?.color_hex ?? theme.colors.faint;
  const heroText = isLightColor(color) ? "#18181b" : "#ffffff";
  const currentPrinter = printers.find(
    (printer) => printer.id && printer.id === spool.printer_id,
  );
  const sourceLabel =
    spool.source === "ams"
      ? "AMS"
      : spool.source === "barcode"
        ? "Barcode"
        : spool.source
          ? spool.source
          : "Manual";

  return (
    <Screen>
      <ScrollView
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

        <LinearGradient
          colors={[color, theme.colors.surface]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { borderColor: theme.colors.border }]}
        >
          <View style={styles.heroTop}>
            <AppText variant="caption" color={heroText} style={styles.heroMeta}>
              {filament
                ? `${filament.brand.toUpperCase()} · ${filament.material}`
                : "FILAMENT"}
            </AppText>
            <View style={styles.heroBadge}>
              <AppText variant="caption" color={heroText}>
                {pct}% left
              </AppText>
            </View>
          </View>
          <AppText variant="display" color={heroText} numberOfLines={2}>
            {filament?.color_name ?? "Unknown color"}
          </AppText>
          <AppText variant="caption" color={heroText} style={styles.heroWeight}>
            {formatWeight(spool.remaining_g)} remaining of{" "}
            {formatWeight(spool.total_weight_g)}
          </AppText>
          <View style={styles.heroProgress}>
            <ProgressBar
              value={pct}
              color={heroText}
              height={6}
            />
          </View>
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

        <Card style={styles.statsCard}>
          <Stat label="Remaining" value={formatWeight(spool.remaining_g)} />
          <Stat label="Total" value={formatWeight(spool.total_weight_g)} />
          <Stat label="Price" value={formatPrice(spool.price_per_kg)} />
          <Stat label="Source" value={sourceLabel} />
        </Card>

        <Card style={styles.section}>
          <View style={styles.sectionTitleRow}>
            <AppText variant="heading">Location</AppText>
            {currentPrinter ? (
              <Badge label="Loaded" variant="success" />
            ) : null}
          </View>
          {currentPrinter ? (
            <View style={styles.currentPrinter}>
              <View
                style={[
                  styles.printerIcon,
                  { backgroundColor: `${theme.colors.accent}1f` },
                ]}
              >
                <Ionicons
                  name="print"
                  size={20}
                  color={theme.colors.accent}
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

          {printers.length > 0 ? (
            <View style={styles.printerList}>
              {printers.map((printer) => {
                if (!printer.id) return null;
                const isCurrent = printer.id === spool.printer_id;
                return (
                  <View
                    key={printer.id}
                    style={[
                      styles.printerRow,
                      { borderColor: theme.colors.border },
                    ]}
                  >
                    <View style={styles.printerRowText}>
                      <AppText variant="label" numberOfLines={1}>
                        {printer.name}
                      </AppText>
                      <AppText variant="caption" faint>
                        {printer.online ? "Online" : "Offline"}
                      </AppText>
                    </View>
                    <AppButton
                      title={isCurrent ? "Loaded" : "Load here"}
                      size="sm"
                      variant={isCurrent ? "ghost" : "secondary"}
                      disabled={isCurrent}
                      loading={busyPrinter === printer.id}
                      onPress={() => loadInto(printer)}
                    />
                  </View>
                );
              })}
            </View>
          ) : (
            <AppText variant="caption" faint>
              No printers configured. Add one from the web dashboard.
            </AppText>
          )}
        </Card>

        <Card style={styles.section}>
          <AppText variant="heading">Details</AppText>
          <DetailRow label="Barcode" value={spool.barcode ?? "—"} mono />
          <DetailRow label="NFC / tag UID" value={spool.tag_uid ?? "—"} mono />
          <DetailRow label="Added" value={formatDate(spool.created_at)} />
          <DetailRow label="Last used" value={formatDate(spool.last_used_at)} />
          {filament ? (
            <DetailRow
              label="Bambu preset"
              value={filament.bambu_info_idx ?? "—"}
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <AppText variant="caption" faint>
        {label}
      </AppText>
      <AppText variant="label" numberOfLines={1}>
        {value}
      </AppText>
    </View>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <View style={styles.detailRow}>
      <AppText variant="caption" muted>
        {label}
      </AppText>
      <AppText
        variant={mono ? "mono" : "body"}
        numberOfLines={2}
        style={styles.detailValue}
      >
        {value}
      </AppText>
    </View>
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
  hero: {
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
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
  },
  heroMeta: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.1,
  },
  heroBadge: {
    backgroundColor: "rgba(0,0,0,0.22)",
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
  statsCard: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: spacing.lg,
  },
  stat: {
    width: "50%",
    gap: 2,
  },
  section: {
    gap: spacing.md,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  currentPrinter: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: "rgba(45,212,191,0.07)",
  },
  printerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
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
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.lg,
    alignItems: "flex-start",
  },
  detailValue: {
    flex: 1,
    textAlign: "right",
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
});
