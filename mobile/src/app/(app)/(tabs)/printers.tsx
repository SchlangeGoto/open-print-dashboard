import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrinterRackRow, type PrinterRow } from "@/components/printer-rack-row";
import { PrinterSkeletonList } from "@/components/printer-skeleton";
import { AppButton } from "@/components/ui/app-button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, Screen } from "@/components/ui/screen";
import { ShelfRule } from "@/components/ui/shelf-rule";
import { StatReadout } from "@/components/ui/stat-readout";
import { useAsyncData } from "@/hooks/use-async-data";
import { useAuth } from "@/lib/auth";
import { TAB_BAR_HEIGHT } from "@/lib/layout";
import { radius, spacing, useTheme } from "@/lib/theme";
import type { PrintersLoadResult } from "@/lib/types";

export default function PrintersScreen() {
  const { api } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const loader = useCallback(async (): Promise<PrintersLoadResult> => {
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
            hitSlop={6}
            onPress={refresh}
            style={[
              styles.iconButton,
              { backgroundColor: theme.colors.surfaceAlt },
            ]}
          >
            <Ionicons name="refresh" size={18} color={theme.colors.muted} />
          </Pressable>
        }
      />

      <StatReadout
        stats={[
          { value: data ? String(rows.length) : "...", label: "Printers" },
          { value: data ? String(onlineCount) : "...", label: "Online" },
          { value: data ? String(loadedCount) : "...", label: "Loaded" },
        ]}
      />
    </View>
  );

  return (
    <Screen>
      <FlatList
        data={rows}
        contentInsetAdjustmentBehavior="automatic"
        keyExtractor={(row) =>
          row.printer.id ?? row.printer.serial ?? row.printer.name
        }
        renderItem={({ item }) => (
          <PrinterRackRow
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
        ItemSeparatorComponent={ShelfRule}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            {loading && !data ? (
              <PrinterSkeletonList />
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
            )}
          </View>
        }
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + TAB_BAR_HEIGHT + spacing.xxxl },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={theme.colors.accentText}
            colors={[theme.colors.accentText]}
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
  },
  headerBlock: {
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: radius.lg,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyWrap: {
    paddingTop: spacing.lg,
  },
});
