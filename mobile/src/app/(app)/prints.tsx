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
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, Screen } from "@/components/ui/screen";
import { ShelfRule } from "@/components/ui/shelf-rule";
import { StatReadout } from "@/components/ui/stat-readout";
import { useAsyncData } from "@/hooks/use-async-data";
import { useAuth } from "@/lib/auth";
import { formatDate, formatWeight } from "@/lib/format";
import { TAB_BAR_HEIGHT } from "@/lib/layout";
import { radius, spacing, useTheme } from "@/lib/theme";
import type { PrintJob, PrintJobStatus } from "@/lib/types";

type Filter = "all" | "printing" | "finished" | "failed";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "printing", label: "Printing" },
  { id: "finished", label: "Finished" },
  { id: "failed", label: "Failed" },
];

function statusOf(job: PrintJob): PrintJobStatus {
  if (job.status === 4) return "printing";
  if (job.status === 3) return "failed";
  if (job.status === 2) return "finished";
  return "unknown";
}

function statusMeta(job: PrintJob): {
  label: string;
  variant: "success" | "warning" | "danger" | "neutral";
} {
  switch (statusOf(job)) {
    case "printing":
      return { label: "Printing", variant: "warning" };
    case "finished":
      return { label: "Finished", variant: "success" };
    case "failed":
      return { label: "Failed", variant: "danger" };
    default:
      return { label: "Unknown", variant: "neutral" };
  }
}

export default function PrintsScreen() {
  const { api } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<Filter>("all");

  const loader = useCallback(async (): Promise<PrintJob[]> => {
    return api.getPrintJobs(100);
  }, [api]);

  const { data, loading, refreshing, error, reload, refresh } =
    useAsyncData(loader);

  const jobs = useMemo(() => data ?? [], [data]);
  const counts = useMemo(
    () => ({
      printing: jobs.filter((job) => statusOf(job) === "printing").length,
      finished: jobs.filter((job) => statusOf(job) === "finished").length,
      failed: jobs.filter((job) => statusOf(job) === "failed").length,
    }),
    [jobs],
  );

  const visible = useMemo(() => {
    if (filter === "all") return jobs;
    return jobs.filter((job) => statusOf(job) === filter);
  }, [filter, jobs]);

  return (
    <Screen>
      <FlatList
        data={visible}
        contentInsetAdjustmentBehavior="automatic"
        keyExtractor={(job) => job.id}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <PageHeader
              title="Print jobs"
              subtitle="Running and finished prints"
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
                { value: String(jobs.length), label: "Jobs" },
                { value: String(counts.printing), label: "Printing" },
                { value: String(counts.finished), label: "Finished" },
                { value: String(counts.failed), label: "Failed" },
              ]}
              size="sm"
            />

            <View style={styles.filters}>
              {FILTERS.map((item) => {
                const selected = filter === item.id;
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setFilter(item.id)}
                    style={[
                      styles.filter,
                      {
                        borderColor: selected
                          ? theme.colors.accent
                          : theme.colors.border,
                        backgroundColor: selected
                          ? `${theme.colors.accent}18`
                          : theme.colors.surface,
                      },
                    ]}
                  >
                    <AppText
                      variant="caption"
                      color={
                        selected
                          ? theme.colors.accentText
                          : theme.colors.muted
                      }
                    >
                      {item.label}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const status = statusMeta(item);
          return (
            <Card style={styles.card}>
              <View style={styles.top}>
                <AppText
                  variant="body"
                  numberOfLines={2}
                  style={styles.title}
                >
                  {item.title}
                </AppText>
                <Badge label={status.label} variant={status.variant} />
              </View>
              <View style={styles.metaRow}>
                <AppText variant="caption" muted numberOfLines={1}>
                  {item.device_id ?? "Printer"}
                </AppText>
                <AppText variant="caption" muted>
                  {formatDate(item.finished_at ?? item.start_time ?? item.created_at)}
                </AppText>
              </View>
              <ShelfRule />
              <View style={styles.metaRow}>
                <AppText variant="caption" muted>
                  {formatWeight(item.weight)}
                </AppText>
                <AppText variant="caption" muted>
                  {item.estimated_cost != null
                    ? `€${item.estimated_cost.toFixed(2)}`
                    : "—"}
                </AppText>
              </View>
            </Card>
          );
        }}
        ItemSeparatorComponent={() => <View style={styles.gap} />}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            {loading && !data ? (
              <AppText variant="caption" muted>
                Loading print jobs…
              </AppText>
            ) : error ? (
              <EmptyState
                icon="cloud-offline-outline"
                title="Couldn't load print jobs"
                description={error}
                action={<AppButton title="Try again" onPress={reload} />}
              />
            ) : (
              <EmptyState
                icon="time-outline"
                title="No print jobs"
                description="Finished prints from Bambu Cloud will show up here."
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
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  filter: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  card: {
    gap: spacing.sm,
  },
  top: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  title: {
    flex: 1,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  gap: {
    height: spacing.md,
  },
  emptyWrap: {
    paddingTop: spacing.lg,
  },
});
