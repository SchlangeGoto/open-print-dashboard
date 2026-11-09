import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";

import { AppButton } from "@/components/ui/app-button";
import { AppText } from "@/components/ui/app-text";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ColorDot } from "@/components/ui/color-dot";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress-bar";
import { PageHeader, Screen } from "@/components/ui/screen";
import { useAsyncData } from "@/hooks/use-async-data";
import { useAuth } from "@/lib/auth";
import { formatWeight, percent } from "@/lib/format";
import { radius, spacing, useTheme } from "@/lib/theme";
import type { Filament, Printer, Spool } from "@/lib/types";

interface PrinterRow {
  printer: Printer;
  loadedSpool?: Spool;
  filament?: Filament;
}

interface LoadResult {
  printers: Printer[];
  spools: Spool[];
  filaments: Filament[];
}

export default function PrintersScreen() {
  const { api } = useAuth();
  const router = useRouter();
  const theme = useTheme();

  const loader = useCallback(async (): Promise<LoadResult> => {
    const [printers, spools, filaments] = await Promise.all([
      api.getPrinters(),
      api.getSpools(),
      api.getFilaments(),
    ]);
    return { printers, spools, filaments };
  }, [api]);

  const { data, loading, refreshing, error, reload, refresh } =
    useAsyncData(loader);

  const rows = useMemo<PrinterRow[]>(() => {
    if (!data) return [];
    const filamentById = new Map(data.filaments.map((f) => [f.id, f]));
    return data.printers.map((printer) => {
      const loadedSpool = data.spools.find(
        (spool) => spool.printer_id && spool.printer_id === printer.id,
      );
      return {
        printer,
        loadedSpool,
        filament: loadedSpool?.filament_id
          ? filamentById.get(loadedSpool.filament_id)
          : undefined,
      };
    });
  }, [data]);

  const onlineCount = rows.filter((row) => row.printer.online).length;
  const loadedCount = rows.filter((row) => row.loadedSpool).length;

  const header = (
    <View style={styles.headerBlock}>
      <PageHeader
        brand
        title="Printers"
        subtitle="Configured printers and loaded spools"
        right={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Refresh printers"
            onPress={refresh}
            style={[
              styles.iconButton,
              { backgroundColor: theme.colors.surfaceAlt },
            ]}
          >
            <Ionicons
              name="refresh"
              size={18}
              color={theme.colors.muted}
            />
          </Pressable>
        }
      />

      <Card style={styles.summary}>
        <View style={styles.summaryItem}>
          <AppText variant="title">{rows.length}</AppText>
          <AppText variant="caption" faint>
            Printers
          </AppText>
        </View>
        <View
          style={[styles.divider, { backgroundColor: theme.colors.border }]}
        />
        <View style={styles.summaryItem}>
          <AppText variant="title">{onlineCount}</AppText>
          <AppText variant="caption" faint>
            Online
          </AppText>
        </View>
        <View
          style={[styles.divider, { backgroundColor: theme.colors.border }]}
        />
        <View style={styles.summaryItem}>
          <AppText variant="title">{loadedCount}</AppText>
          <AppText variant="caption" faint>
            Loaded
          </AppText>
        </View>
      </Card>
    </View>
  );

  return (
    <Screen>
      <FlatList
        data={rows}
        keyExtractor={(row) =>
          row.printer.id ?? row.printer.serial ?? row.printer.name
        }
        renderItem={({ item }) => (
          <PrinterCard
            row={item}
            onOpenSpool={
              item.loadedSpool
                ? () =>
                    router.push({
                      pathname: "/spool/[id]",
                      params: { id: item.loadedSpool!.id },
                    })
                : undefined
            }
          />
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={
          loading && !data ? (
            <View style={styles.loading}>
              <ActivityIndicator color={theme.colors.accent} />
              <AppText muted>Loading printers…</AppText>
            </View>
          ) : error ? (
            <EmptyState
              icon="cloud-offline-outline"
              title="Couldn't load printers"
              description={error}
              action={<AppButton title="Try again" onPress={reload} />}
            />
          ) : (
            <EmptyState
              icon="print-outline"
              title="No printers yet"
              description="Configure a printer in the web dashboard and it will appear here."
            />
          )
        }
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={theme.colors.accent}
            colors={[theme.colors.accent]}
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}

function PrinterCard({
  row,
  onOpenSpool,
}: {
  row: PrinterRow;
  onOpenSpool?: () => void;
}) {
  const theme = useTheme();
  const { printer, loadedSpool, filament } = row;
  const pct = loadedSpool
    ? percent(loadedSpool.remaining_g, loadedSpool.total_weight_g)
    : 0;

  return (
    <View
      style={[
        styles.printerCard,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <View style={styles.printerHeader}>
        <View
          style={[
            styles.printerIcon,
            {
              backgroundColor: printer.online
                ? `${theme.colors.success}18`
                : theme.colors.surfaceAlt,
            },
          ]}
        >
          <Ionicons
            name="print"
            size={21}
            color={
              printer.online ? theme.colors.success : theme.colors.faint
            }
          />
        </View>
        <View style={styles.printerTitle}>
          <AppText variant="heading" numberOfLines={1}>
            {printer.name}
          </AppText>
          <AppText variant="caption" muted numberOfLines={1}>
            {printer.model ?? "Bambu Lab printer"}
          </AppText>
        </View>
        <Badge
          label={printer.online ? "Online" : "Offline"}
          variant={printer.online ? "success" : "neutral"}
        />
      </View>

      {printer.ip || !printer.configured ? (
        <View style={styles.ipRow}>
          {printer.ip ? (
            <>
              <Ionicons
                name="wifi-outline"
                size={13}
                color={theme.colors.faint}
              />
              <AppText variant="caption" faint>
                {printer.ip}
              </AppText>
            </>
          ) : null}
          {!printer.configured ? (
            <Badge label="Cloud only" variant="warning" />
          ) : null}
        </View>
      ) : null}

      {loadedSpool ? (
        <Pressable
          accessibilityRole="button"
          onPress={onOpenSpool}
          style={({ pressed }) => [
            styles.loadedSpool,
            {
              backgroundColor: theme.colors.surfaceAlt,
              borderColor: theme.colors.border,
            },
            pressed && { opacity: 0.82 },
          ]}
        >
          <ColorDot color={filament?.color_hex} size={34} />
          <View style={styles.loadedSpoolText}>
            <AppText variant="label" numberOfLines={1}>
              {filament?.color_name ?? "Loaded spool"}
            </AppText>
            <AppText variant="caption" muted>
              {formatWeight(loadedSpool.remaining_g)} remaining
            </AppText>
            <ProgressBar
              value={pct}
              color={filament?.color_hex ?? theme.colors.accent}
              height={4}
            />
          </View>
          <View style={styles.loadedSpoolRight}>
            <AppText variant="caption" color={theme.colors.accent}>
              {pct}%
            </AppText>
            <Ionicons
              name="chevron-forward"
              size={16}
              color={theme.colors.faint}
            />
          </View>
        </Pressable>
      ) : (
        <View
          style={[
            styles.noSpool,
            {
              backgroundColor: theme.colors.surfaceAlt,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Ionicons
            name="ellipse-outline"
            size={17}
            color={theme.colors.faint}
          />
          <AppText variant="caption" faint>
            No spool loaded
          </AppText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxl,
    gap: spacing.md,
    flexGrow: 1,
  },
  headerBlock: {
    gap: spacing.md,
    paddingBottom: spacing.xs,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.lg,
  },
  summaryItem: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: 34,
  },
  loading: {
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.xxxl,
  },
  printerCard: {
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  printerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  printerIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  printerTitle: {
    flex: 1,
    gap: 2,
  },
  ipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  loadedSpool: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
  loadedSpoolText: {
    flex: 1,
    gap: 3,
  },
  loadedSpoolRight: {
    alignItems: "flex-end",
    gap: 2,
  },
  noSpool: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
  },
});
