import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SpoolCard } from "@/components/spool-card";
import { SpoolSkeletonList } from "@/components/spool-skeleton";
import { AppButton } from "@/components/ui/app-button";
import { AppText } from "@/components/ui/app-text";
import { EmptyState } from "@/components/ui/empty-state";
import { Screen, PageHeader } from "@/components/ui/screen";
import { ShelfRule } from "@/components/ui/shelf-rule";
import { StatReadout } from "@/components/ui/stat-readout";
import { TextField } from "@/components/ui/text-field";
import { useAsyncData } from "@/hooks/use-async-data";
import { useAuth } from "@/lib/auth";
import { formatWeight } from "@/lib/format";
import { TAB_BAR_HEIGHT } from "@/lib/layout";
import { radius, spacing, useTheme } from "@/lib/theme";
import type { Printer, SpoolsLoadResult } from "@/lib/types";

export default function SpoolsScreen() {
  const { api } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");

  const loader = useCallback(async (): Promise<SpoolsLoadResult> => {
    const [spools, filaments, printers] = await Promise.all([
      api.getSpools(),
      api.getFilaments(),
      api.getPrinters(),
    ]);
    return { spools, filaments, printers };
  }, [api]);

  const { data, loading, refreshing, error, reload, refresh } =
    useAsyncData(loader);

  const rows = useMemo(() => {
    if (!data) return [];
    const filamentById = new Map(data.filaments.map((f) => [f.id, f]));
    const printerById = new Map(
      data.printers
        .filter((p): p is Printer & { id: string } => Boolean(p.id))
        .map((p) => [p.id, p]),
    );
    const needle = query.trim().toLowerCase();

    return data.spools
      .map((spool) => ({
        spool,
        filament: spool.filament_id
          ? filamentById.get(spool.filament_id)
          : undefined,
        printerName: spool.printer_id
          ? printerById.get(spool.printer_id)?.name
          : undefined,
      }))
      .filter((row) => {
        if (!needle) return true;
        return [
          row.filament?.color_name,
          row.filament?.brand,
          row.filament?.material,
          row.spool.barcode,
          row.printerName,
        ]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(needle));
      });
  }, [data, query]);

  const summary = useMemo(() => {
    const spools = data?.spools ?? [];
    return {
      count: spools.length,
      remaining: spools.reduce((sum, spool) => sum + spool.remaining_g, 0),
      loaded: spools.filter((spool) => Boolean(spool.printer_id)).length,
    };
  }, [data]);

  const header = (
    <View style={styles.headerBlock}>
      <PageHeader
        brand
        title="Spools"
        subtitle="Your filament inventory"
        right={
          <AppButton
            title="Scan"
            size="sm"
            variant="secondary"
            onPress={() => router.push("/scan")}
            icon={
              <Ionicons name="scan-outline" size={16} color={theme.colors.text} />
            }
          />
        }
      />

      <StatReadout
        stats={[
          { value: data ? String(summary.count) : "...", label: "Spools" },
          {
            value: data ? formatWeight(summary.remaining) : "...",
            label: "Remaining",
          },
          { value: data ? String(summary.loaded) : "...", label: "Loaded" },
        ]}
      />

      <TextField
        value={query}
        onChangeText={setQuery}
        placeholder="Search color, brand, material"
        autoCapitalize="none"
        autoCorrect={false}
        compact
        left={
          <Ionicons name="search-outline" size={17} color={theme.colors.muted} />
        }
        right={
          query ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              onPress={() => setQuery("")}
              hitSlop={10}
            >
              <Ionicons
                name="close-circle"
                size={17}
                color={theme.colors.muted}
              />
            </Pressable>
          ) : undefined
        }
      />

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
            {error}
          </AppText>
        </View>
      ) : null}
    </View>
  );

  return (
    <Screen>
      <FlatList
        data={rows}
        contentInsetAdjustmentBehavior="automatic"
        keyExtractor={(row) => row.spool.id}
        renderItem={({ item }) => (
          <SpoolCard
            spool={item.spool}
            filament={item.filament}
            printerName={item.printerName}
            onPress={() =>
              router.push({
                pathname: "/spool/[id]",
                params: { id: item.spool.id },
              })
            }
          />
        )}
        ItemSeparatorComponent={ShelfRule}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            {loading && !data ? (
              <SpoolSkeletonList />
            ) : error ? (
              <EmptyState
                icon="cloud-offline-outline"
                title="Couldn't load spools"
                description={error}
                action={<AppButton title="Try again" onPress={reload} />}
              />
            ) : query ? (
              <EmptyState
                icon="search-outline"
                title="No matches"
                description="Try a different color, brand, or material."
              />
            ) : (
              <EmptyState
                icon="cube-outline"
                title="No spools yet"
                description="Scan a filament box to add your first spool."
                action={
                  <AppButton
                    title="Scan a barcode"
                    onPress={() => router.push("/scan")}
                    icon={
                      <Ionicons
                        name="scan-outline"
                        size={18}
                        color={theme.colors.onAccent}
                      />
                    }
                  />
                }
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
        keyboardShouldPersistTaps="handled"
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
  emptyWrap: {
    paddingTop: spacing.lg,
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
