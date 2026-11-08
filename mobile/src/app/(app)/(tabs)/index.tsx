import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";

import { SpoolCard } from "@/components/spool-card";
import { AppButton } from "@/components/ui/app-button";
import { AppText } from "@/components/ui/app-text";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Screen, PageHeader } from "@/components/ui/screen";
import { TextField } from "@/components/ui/text-field";
import { useAsyncData } from "@/hooks/use-async-data";
import { useAuth } from "@/lib/auth";
import { formatWeight } from "@/lib/format";
import { radius, spacing, useTheme } from "@/lib/theme";
import type { Filament, Printer, Spool } from "@/lib/types";

interface LoadResult {
  spools: Spool[];
  filaments: Filament[];
  printers: Printer[];
}

export default function SpoolsScreen() {
  const { api } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const [query, setQuery] = useState("");

  const loader = useCallback(async (): Promise<LoadResult> => {
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

      <Card style={styles.summary}>
        <View style={styles.summaryItem}>
          <AppText variant="title">{summary.count}</AppText>
          <AppText variant="caption" faint>
            Spools
          </AppText>
        </View>
        <View
          style={[styles.divider, { backgroundColor: theme.colors.border }]}
        />
        <View style={styles.summaryItem}>
          <AppText variant="title">{formatWeight(summary.remaining)}</AppText>
          <AppText variant="caption" faint>
            Remaining
          </AppText>
        </View>
        <View
          style={[styles.divider, { backgroundColor: theme.colors.border }]}
        />
        <View style={styles.summaryItem}>
          <AppText variant="title">{summary.loaded}</AppText>
          <AppText variant="caption" faint>
            Loaded
          </AppText>
        </View>
      </Card>

      <TextField
        value={query}
        onChangeText={setQuery}
        placeholder="Search color, brand, material…"
        autoCapitalize="none"
        autoCorrect={false}
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
                size={18}
                color={theme.colors.faint}
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
        ListHeaderComponent={header}
        ListEmptyComponent={
          loading && !data ? (
            <View style={styles.loading}>
              <ActivityIndicator color={theme.colors.accent} />
              <AppText muted>Loading spools…</AppText>
            </View>
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
              icon="layers-outline"
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
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      />
    </Screen>
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
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
});
