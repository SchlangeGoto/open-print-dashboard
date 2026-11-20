import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
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
import { Card } from "@/components/ui/card";
import { ColorDot } from "@/components/ui/color-dot";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, Screen } from "@/components/ui/screen";
import { StatGrid, StatReadout } from "@/components/ui/stat-readout";
import { useAsyncData } from "@/hooks/use-async-data";
import { useAuth } from "@/lib/auth";
import { formatWeight } from "@/lib/format";
import { TAB_BAR_HEIGHT } from "@/lib/layout";
import { radius, spacing, useTheme } from "@/lib/theme";
import type { Filament, PrintJob } from "@/lib/types";

interface AnalyticsData {
  jobs: PrintJob[];
  filaments: Filament[];
}

function duration(totalSeconds: number): string {
  if (!totalSeconds) return "0m";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function money(value: number): string {
  return `€${value.toFixed(2)}`;
}

export default function AnalyticsScreen() {
  const { api } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const loader = useCallback(async (): Promise<AnalyticsData> => {
    const [jobs, filaments] = await Promise.all([
      api.getPrintJobs(200),
      api.getFilaments(),
    ]);
    return { jobs, filaments };
  }, [api]);

  const { data, loading, refreshing, error, reload, refresh } =
    useAsyncData(loader);

  const stats = useMemo(() => {
    const jobs = data?.jobs ?? [];
    const finished = jobs.filter((job) => job.status === 2);
    const failed = jobs.filter((job) => job.status === 3);
    const decided = finished.length + failed.length;
    const seconds = finished.reduce(
      (sum, job) => sum + (job.duration_seconds ?? 0),
      0,
    );
    const weight = finished.reduce((sum, job) => sum + (job.weight ?? 0), 0);
    const cost = jobs.reduce(
      (sum, job) => sum + (job.estimated_cost ?? 0),
      0,
    );
    return {
      total: jobs.length,
      finished: finished.length,
      failed: failed.length,
      success: decided ? Math.round((finished.length / decided) * 100) : 0,
      seconds,
      weight,
      cost,
      averageSeconds: finished.length ? seconds / finished.length : 0,
      averageCost: jobs.length ? cost / jobs.length : 0,
    };
  }, [data]);

  const days = useMemo(() => {
    const counts: { label: string; value: number }[] = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - offset);
      const next = new Date(day);
      next.setDate(next.getDate() + 1);
      const value = (data?.jobs ?? []).filter((job) => {
        const raw = job.finished_at ?? job.created_at;
        if (!raw) return false;
        const time = new Date(raw).getTime();
        return time >= day.getTime() && time < next.getTime();
      }).length;
      counts.push({
        label: day.toLocaleDateString(undefined, { weekday: "narrow" }),
        value,
      });
    }
    return counts;
  }, [data]);

  const topFilaments = useMemo(() => {
    const counts = new Map<string, number>();
    for (const job of data?.jobs ?? []) {
      if (!job.filament_id) continue;
      counts.set(job.filament_id, (counts.get(job.filament_id) ?? 0) + 1);
    }
    const byId = new Map((data?.filaments ?? []).map((item) => [item.id, item]));
    return [...counts.entries()]
      .map(([id, count]) => ({ filament: byId.get(id), count }))
      .filter(
        (item): item is { filament: Filament; count: number } =>
          Boolean(item.filament),
      )
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
  }, [data]);

  const maxDay = Math.max(1, ...days.map((day) => day.value));

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
          title="Analytics"
          subtitle="Print history and material use"
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

        {error ? (
          <Card style={styles.errorCard}>
            <AppText variant="body">Couldn&apos;t load analytics.</AppText>
            <AppText variant="caption" muted>
              {error}
            </AppText>
            <AppButton title="Try again" size="sm" onPress={reload} />
          </Card>
        ) : null}

        <StatReadout
          stats={[
            { value: data ? String(stats.total) : "...", label: "Jobs" },
            { value: data ? `${stats.success}%` : "...", label: "Success" },
            {
              value: data ? formatWeight(stats.weight) : "...",
              label: "Filament",
            },
            { value: data ? money(stats.cost) : "...", label: "Cost" },
          ]}
          size="sm"
        />

        <Card style={styles.section}>
          <AppText variant="heading">Last seven days</AppText>
          <View style={styles.bars}>
            {days.map((day, index) => (
              <View key={index} style={styles.barColumn}>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.bar,
                      {
                        height: `${Math.max(
                          4,
                          (day.value / maxDay) * 100,
                        )}%`,
                        backgroundColor:
                          day.value > 0
                            ? theme.colors.accent
                            : theme.colors.surfaceAlt,
                      },
                    ]}
                  />
                </View>
                <AppText variant="micro" muted>
                  {day.label}
                </AppText>
                <AppText variant="micro">{day.value}</AppText>
              </View>
            ))}
          </View>
        </Card>

        <Card style={styles.section}>
          <AppText variant="heading">Totals</AppText>
          <StatGrid
            stats={[
              { value: String(stats.finished), label: "Finished" },
              { value: String(stats.failed), label: "Failed" },
              { value: duration(stats.seconds), label: "Print time" },
              { value: duration(stats.averageSeconds), label: "Avg. print" },
              { value: money(stats.averageCost), label: "Avg. cost" },
              { value: formatWeight(stats.weight), label: "Material" },
            ]}
          />
        </Card>

        <Card style={styles.section}>
          <AppText variant="heading">Top filaments</AppText>
          {topFilaments.length ? (
            topFilaments.map((item) => (
              <View key={item.filament.id} style={styles.filamentRow}>
                <ColorDot color={item.filament.color_hex} size={11} />
                <View style={styles.filamentText}>
                  <AppText variant="body" numberOfLines={1}>
                    {item.filament.color_name}
                  </AppText>
                  <AppText variant="micro" muted>
                    {item.filament.brand} · {item.filament.material}
                  </AppText>
                </View>
                <AppText variant="caption" muted>
                  {item.count} {item.count === 1 ? "job" : "jobs"}
                </AppText>
              </View>
            ))
          ) : (
            <AppText variant="caption" muted>
              No attributed prints yet.
            </AppText>
          )}
        </Card>

        {loading && !data ? (
          <EmptyState
            icon="analytics-outline"
            title="Loading analytics"
            description="Reading the print history."
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
  section: {
    gap: spacing.md,
  },
  bars: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    height: 170,
  },
  barColumn: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  barTrack: {
    flex: 1,
    width: "100%",
    justifyContent: "flex-end",
  },
  bar: {
    width: "100%",
    minHeight: 4,
    borderRadius: radius.sm,
  },
  filamentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  filamentText: {
    flex: 1,
    gap: 2,
  },
});
