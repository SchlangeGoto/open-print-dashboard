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

import { AppButton } from "@/components/ui/app-button";
import { AppText } from "@/components/ui/app-text";
import { Card } from "@/components/ui/card";
import { ColorDot } from "@/components/ui/color-dot";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, Screen } from "@/components/ui/screen";
import { StatReadout } from "@/components/ui/stat-readout";
import { TextField } from "@/components/ui/text-field";
import { useAsyncData } from "@/hooks/use-async-data";
import { useAuth } from "@/lib/auth";
import { formatWeight } from "@/lib/format";
import { TAB_BAR_HEIGHT } from "@/lib/layout";
import { radius, spacing, useTheme } from "@/lib/theme";
import type { Filament, Spool } from "@/lib/types";

interface FilamentsData {
  filaments: Filament[];
  spools: Spool[];
}

export default function FilamentsScreen() {
  const { api } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");

  const loader = useCallback(async (): Promise<FilamentsData> => {
    const [filaments, spools] = await Promise.all([
      api.getFilaments(),
      api.getSpools(),
    ]);
    return { filaments, spools };
  }, [api]);

  const { data, loading, refreshing, error, reload, refresh } =
    useAsyncData(loader);

  const rows = useMemo(() => {
    if (!data) return [];
    const remaining = new Map<string, number>();
    const spoolCount = new Map<string, number>();
    for (const spool of data.spools) {
      if (!spool.filament_id) continue;
      spoolCount.set(
        spool.filament_id,
        (spoolCount.get(spool.filament_id) ?? 0) + 1,
      );
      if (!spool.remaining_unknown) {
        remaining.set(
          spool.filament_id,
          (remaining.get(spool.filament_id) ?? 0) + spool.remaining_g,
        );
      }
    }
    const needle = query.trim().toLowerCase();
    return data.filaments
      .map((filament) => ({
        filament,
        remaining: remaining.get(filament.id) ?? 0,
        spools: spoolCount.get(filament.id) ?? 0,
      }))
      .filter((row) => {
        if (!needle) return true;
        return [
          row.filament.brand,
          row.filament.material,
          row.filament.series,
          row.filament.color_name,
        ]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(needle));
      })
      .sort((a, b) => a.remaining - b.remaining);
  }, [data, query]);

  const summary = useMemo(
    () => ({
      count: data?.filaments.length ?? 0,
      remaining: rows.reduce((sum, row) => sum + row.remaining, 0),
      low: rows.filter((row) => row.remaining > 0 && row.remaining < 250)
        .length,
    }),
    [data, rows],
  );

  return (
    <Screen>
      <FlatList
        data={rows}
        contentInsetAdjustmentBehavior="automatic"
        keyExtractor={(row) => row.filament.id}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <PageHeader
              title="Filaments"
              subtitle="Materials and remaining stock"
              left={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Back"
                  hitSlop={8}
                  onPress={() => router.back()}
                  style={[
                    styles.backButton,
                    { backgroundColor: theme.colors.surfaceAlt },
                  ]}
                >
                  <Ionicons
                    name="chevron-back"
                    size={20}
                    color={theme.colors.text}
                  />
                </Pressable>
              }
            />
            <StatReadout
              stats={[
                { value: String(summary.count), label: "Filaments" },
                {
                  value: data ? formatWeight(summary.remaining) : "...",
                  label: "Remaining",
                },
                { value: String(summary.low), label: "Low" },
              ]}
            />
            <TextField
              value={query}
              onChangeText={setQuery}
              placeholder="Search brand, material, color"
              autoCapitalize="none"
              autoCorrect={false}
              compact
              left={
                <Ionicons
                  name="search-outline"
                  size={17}
                  color={theme.colors.muted}
                />
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
          </View>
        }
        renderItem={({ item }) => (
          <Card style={styles.card}>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: "/filament/[id]",
                  params: { id: item.filament.id },
                })
              }
              style={styles.row}
            >
              <ColorDot color={item.filament.color_hex} size={14} />
              <View style={styles.text}>
                <AppText variant="body" numberOfLines={1}>
                  {item.filament.color_name}
                </AppText>
                <AppText variant="caption" muted numberOfLines={1}>
                  {item.filament.brand} · {item.filament.material}
                  {item.filament.series ? ` · ${item.filament.series}` : ""}
                </AppText>
                <AppText variant="micro" muted>
                  {item.spools} {item.spools === 1 ? "spool" : "spools"}
                </AppText>
              </View>
              <View style={styles.value}>
                <AppText variant="heading">
                  {formatWeight(item.remaining)}
                </AppText>
                <AppText variant="micro" muted>
                  left
                </AppText>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={theme.colors.faint}
              />
            </Pressable>
          </Card>
        )}
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            {loading && !data ? (
              <AppText variant="caption" muted>
                Loading filaments…
              </AppText>
            ) : error ? (
              <EmptyState
                icon="cloud-offline-outline"
                title="Couldn't load filaments"
                description={error}
                action={<AppButton title="Try again" onPress={reload} />}
              />
            ) : query ? (
              <EmptyState
                icon="search-outline"
                title="No matches"
                description="Try a different brand, material or color."
              />
            ) : (
              <EmptyState
                icon="color-palette-outline"
                title="No filaments yet"
                description="Scan a filament box to add the first material."
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
    paddingHorizontal: spacing.xl,
  },
  headerBlock: {
    gap: spacing.md,
    paddingBottom: spacing.lg,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: radius.lg,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    padding: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  value: {
    alignItems: "flex-end",
    gap: 2,
  },
  gap: {
    height: spacing.sm,
  },
  emptyWrap: {
    paddingTop: spacing.lg,
  },
});
