import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SpoolCard } from "@/components/spool-card";
import { AppButton } from "@/components/ui/app-button";
import { AppText } from "@/components/ui/app-text";
import { Card } from "@/components/ui/card";
import { ColorDot } from "@/components/ui/color-dot";
import { DetailRow } from "@/components/detail-row";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, Screen } from "@/components/ui/screen";
import { ShelfRule } from "@/components/ui/shelf-rule";
import { StatReadout } from "@/components/ui/stat-readout";
import { useAsyncData } from "@/hooks/use-async-data";
import { useAuth } from "@/lib/auth";
import { formatWeight } from "@/lib/format";
import { TAB_BAR_HEIGHT } from "@/lib/layout";
import { radius, spacing, useTheme } from "@/lib/theme";
import type { Filament, Printer, Spool } from "@/lib/types";

interface FilamentDetailData {
  filament: Filament;
  spools: Spool[];
  printers: Printer[];
}

export default function FilamentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const loader = useCallback(async (): Promise<FilamentDetailData> => {
    const [filament, spools, printers] = await Promise.all([
      api.getFilament(id),
      api.getFilamentSpools(id),
      api.getPrinters(),
    ]);
    return { filament, spools, printers };
  }, [api, id]);

  const { data, loading, refreshing, error, reload, refresh } =
    useAsyncData(loader);

  const summary = useMemo(() => {
    if (!data) return null;
    const known = data.spools.filter((spool) => !spool.remaining_unknown);
    return {
      remaining: known.reduce((sum, spool) => sum + spool.remaining_g, 0),
      total: known.reduce((sum, spool) => sum + spool.total_weight_g, 0),
      known: known.length,
      loaded: data.spools.filter((spool) => Boolean(spool.printer_id)).length,
    };
  }, [data]);

  const printerName = useCallback(
    (printerId: string | null) =>
      printerId
        ? data?.printers.find((printer) => printer.id === printerId)?.name
        : undefined,
    [data],
  );

  return (
    <Screen>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
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
      >
        <PageHeader
          title={data?.filament.color_name ?? "Filament"}
          subtitle={
            data
              ? `${data.filament.brand} · ${data.filament.material}`
              : "Loading material"
          }
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
          right={
            data ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Edit filament"
                hitSlop={8}
                onPress={() =>
                  router.push({
                    pathname: "/filament/edit",
                    params: { id: data.filament.id },
                  })
                }
                style={[
                  styles.backButton,
                  { backgroundColor: theme.colors.surfaceAlt },
                ]}
              >
                <Ionicons
                  name="create-outline"
                  size={20}
                  color={theme.colors.text}
                />
              </Pressable>
            ) : undefined
          }
        />

        {error ? (
          <Card style={styles.errorCard}>
            <AppText variant="body">Couldn&apos;t load this filament.</AppText>
            <AppText variant="caption" muted>
              {error}
            </AppText>
            <AppButton title="Try again" size="sm" onPress={reload} />
          </Card>
        ) : null}

        {data && summary ? (
          <>
            <Card style={styles.hero}>
              <View style={styles.heroTop}>
                <ColorDot color={data.filament.color_hex} size={22} />
                <View style={styles.heroText}>
                  <AppText variant="heading">
                    {data.filament.color_name}
                  </AppText>
                  <AppText variant="caption" muted>
                    {data.filament.color_hex}
                  </AppText>
                </View>
              </View>
              <StatReadout
                size="sm"
                stats={[
                  { value: formatWeight(summary.remaining), label: "Left" },
                  { value: formatWeight(summary.total), label: "Total" },
                  { value: String(data.spools.length), label: "Spools" },
                  { value: String(summary.loaded), label: "Loaded" },
                ]}
              />
            </Card>

            <Card style={styles.section}>
              <AppText variant="heading">Specification</AppText>
              <DetailRow
                label="Series"
                value={data.filament.series ?? "—"}
              />
              <DetailRow
                label="Package"
                value={formatWeight(data.filament.spool_weight_g)}
              />
              <DetailRow
                label="Nozzle"
                value={
                  data.filament.nozzle_temp_min ||
                  data.filament.nozzle_temp_max
                    ? `${data.filament.nozzle_temp_min ?? "?"}–${
                        data.filament.nozzle_temp_max ?? "?"
                      } °C`
                    : "—"
                }
              />
              <DetailRow
                label="Bed"
                value={
                  data.filament.bed_temp
                    ? `${data.filament.bed_temp} °C`
                    : "—"
                }
              />
              <DetailRow
                label="Preset"
                value={data.filament.bambu_info_idx ?? "—"}
              />
              {data.filament.notes ? (
                <DetailRow label="Notes" value={data.filament.notes} />
              ) : null}
            </Card>

            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <AppText variant="label" muted>
                  Spools
                </AppText>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push("/spools")}
                >
                  <AppText variant="caption" color={theme.colors.accentText}>
                    All spools
                  </AppText>
                </Pressable>
              </View>
              {data.spools.length ? (
                <View>
                  {data.spools.map((spool, index) => (
                    <View key={spool.id}>
                      {index > 0 ? <ShelfRule /> : null}
                      <SpoolCard
                        spool={spool}
                        filament={data.filament}
                        printerName={printerName(spool.printer_id)}
                        onPress={() =>
                          router.push({
                            pathname: "/spool/[id]",
                            params: { id: spool.id },
                          })
                        }
                      />
                    </View>
                  ))}
                </View>
              ) : (
                <Card>
                  <AppText variant="caption" muted>
                    No spools of this filament yet.
                  </AppText>
                </Card>
              )}
            </View>
          </>
        ) : loading ? (
          <Card>
            <AppText variant="caption" muted>
              Loading filament…
            </AppText>
          </Card>
        ) : !error ? (
          <EmptyState
            icon="color-palette-outline"
            title="Filament not found"
            description="It may have been deleted."
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    gap: spacing.xl,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: radius.lg,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  errorCard: {
    gap: spacing.sm,
  },
  hero: {
    gap: spacing.md,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  heroText: {
    flex: 1,
    gap: 2,
  },
  section: {
    gap: spacing.md,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});
