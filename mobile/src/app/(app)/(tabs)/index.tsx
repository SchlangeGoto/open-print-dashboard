import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  Alert,
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
import { ColorDot } from "@/components/ui/color-dot";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress-bar";
import { PageHeader, Screen } from "@/components/ui/screen";
import { ShelfRule } from "@/components/ui/shelf-rule";
import { StatReadout } from "@/components/ui/stat-readout";
import { useAsyncData } from "@/hooks/use-async-data";
import { useAuth } from "@/lib/auth";
import { formatDate, formatError, formatWeight } from "@/lib/format";
import { TAB_BAR_HEIGHT } from "@/lib/layout";
import { radius, spacing, useTheme } from "@/lib/theme";
import type {
  Filament,
  PrintJob,
  Printer,
  Spool,
} from "@/lib/types";

interface DashboardData {
  spools: Spool[];
  filaments: Filament[];
  printers: Printer[];
  active: PrintJob[];
  recent: PrintJob[];
}

const QUICK_ACTIONS = [
  { label: "Scan spool", icon: "scan-outline", href: "/scan" },
  { label: "Print jobs", icon: "time-outline", href: "/prints" },
  { label: "Filaments", icon: "color-palette-outline", href: "/filaments" },
  { label: "Printers", icon: "print-outline", href: "/printers" },
] as const;

function jobStatus(job: PrintJob): {
  label: string;
  variant: "success" | "warning" | "danger" | "neutral";
} {
  if (job.status === 4) return { label: "Printing", variant: "warning" };
  if (job.status === 3) return { label: "Failed", variant: "danger" };
  if (job.status === 2) return { label: "Completed", variant: "success" };
  return { label: "Unknown", variant: "neutral" };
}

function jobProgress(job: PrintJob, printers: Printer[]): number {
  const printer = printers.find((item) => item.serial === job.device_id);
  const value = Number(printer?.status?.mc_percent ?? 0);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
}

export default function DashboardScreen() {
  const { api, tenants, activeTenantId } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const tenant = tenants.find((item) => item.id === activeTenantId);

  const loader = useCallback(async (): Promise<DashboardData> => {
    const [spools, filaments, printers, active, recent] = await Promise.all([
      api.getSpools(),
      api.getFilaments(),
      api.getPrinters(),
      api.getActivePrints(),
      api.getPrintJobs(12),
    ]);
    return { spools, filaments, printers, active, recent };
  }, [api]);

  const { data, loading, refreshing, error, reload, refresh } =
    useAsyncData(loader);
  const [pendingControls, setPendingControls] = useState<Set<string>>(
    () => new Set(),
  );
  const [controlError, setControlError] = useState<string | null>(null);

  function markPending(key: string, pending: boolean) {
    setPendingControls((current) => {
      const next = new Set(current);
      if (pending) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }

  async function runControl(
    job: PrintJob,
    action: "pause" | "resume" | "stop",
  ) {
    const printer = data?.printers.find(
      (item) => item.serial === job.device_id,
    );
    if (!printer?.id) {
      setControlError("Add this printer to the dashboard before controlling it.");
      return;
    }
    if (!job.bambu_task_id) {
      setControlError("This job has no cloud task id to confirm against.");
      return;
    }
    const key = `${job.id}:${action}`;
    markPending(key, true);
    setControlError(null);
    try {
      await api.controlPrint(printer.id, action, job.bambu_task_id);
      await reload();
    } catch (err) {
      setControlError(formatError(err));
    } finally {
      markPending(key, false);
    }
  }

  function confirmControl(job: PrintJob, action: "pause" | "resume" | "stop") {
    if (!job.bambu_task_id) {
      setControlError("This job has no cloud task id to confirm against.");
      return;
    }
    const isStop = action === "stop";
    const isPause = action === "pause";
    Alert.alert(
      isStop ? "Cancel this print?" : isPause ? "Pause this print?" : "Resume print?",
      isStop
        ? "The printer stops immediately and the print cannot be resumed from here."
        : isPause
          ? "The nozzle stays hot and the print can be resumed."
          : "The printer continues from where it paused.",
      [
        { text: "Keep printing", style: "cancel" },
        {
          text: isStop ? "Cancel print" : isPause ? "Pause" : "Resume",
          style: isStop ? "destructive" : "default",
          onPress: () => void runControl(job, action),
        },
      ],
    );
  }

  const summary = useMemo(() => {
    const spools = data?.spools ?? [];
    const printers = data?.printers ?? [];
    return {
      spools: spools.length,
      remaining: spools.reduce(
        (sum, spool) =>
          spool.remaining_unknown ? sum : sum + spool.remaining_g,
        0,
      ),
      loaded: spools.filter((spool) => Boolean(spool.printer_id)).length,
      online: printers.filter((printer) => printer.online).length,
    };
  }, [data]);

  const lowStock = useMemo(() => {
    if (!data) return [];
    const totals = new Map<string, number>();
    const incomplete = new Set<string>();
    for (const spool of data.spools) {
      if (!spool.filament_id) continue;
      if (spool.remaining_unknown) {
        incomplete.add(spool.filament_id);
        continue;
      }
      totals.set(
        spool.filament_id,
        (totals.get(spool.filament_id) ?? 0) + spool.remaining_g,
      );
    }
    return data.filaments
      .map((filament) => ({
        filament,
        remaining: totals.get(filament.id),
      }))
      .filter(
        (item): item is { filament: Filament; remaining: number } =>
          item.remaining != null &&
          !incomplete.has(item.filament.id) &&
          item.remaining < 250,
      )
      .sort((a, b) => a.remaining - b.remaining)
      .slice(0, 3);
  }, [data]);

  const finished = useMemo(
    () => (data?.recent ?? []).filter((job) => job.status !== 4).slice(0, 5),
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
          brand
          title="Dashboard"
          subtitle={tenant?.name ?? "Your print floor"}
          right={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Refresh dashboard"
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
            {
              value: data ? String(summary.online) : "...",
              label: "Online",
            },
            {
              value: data ? String(summary.loaded) : "...",
              label: "Loaded",
            },
            {
              value: data ? formatWeight(summary.remaining) : "...",
              label: "Filament",
            },
            {
              value: data ? String(data.active.length) : "...",
              label: "Printing",
            },
          ]}
        />

        {error ? (
          <Card
            style={[
              styles.errorCard,
              { borderColor: `${theme.colors.danger}55` },
            ]}
          >
            <Ionicons
              name="cloud-offline-outline"
              size={20}
              color={theme.colors.danger}
            />
            <View style={styles.errorText}>
              <AppText variant="heading">Couldn&apos;t refresh</AppText>
              <AppText variant="caption" muted>
                {error}
              </AppText>
            </View>
            <AppButton title="Retry" size="sm" onPress={reload} />
          </Card>
        ) : null}

        <View style={styles.section}>
          <AppText variant="label" muted>
            Quick actions
          </AppText>
          <View style={styles.actions}>
            {QUICK_ACTIONS.map((action) => (
              <Pressable
                key={action.label}
                accessibilityRole="button"
                onPress={() => router.push(action.href)}
                style={[
                  styles.action,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                  },
                ]}
              >
                <View
                  style={[
                    styles.actionIcon,
                    { backgroundColor: `${theme.colors.accent}18` },
                  ]}
                >
                  <Ionicons
                    name={action.icon}
                    size={19}
                    color={theme.colors.accentText}
                  />
                </View>
                <AppText variant="caption">{action.label}</AppText>
              </Pressable>
            ))}
          </View>
        </View>

        <Card style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitle}>
              <Ionicons
                name="print-outline"
                size={18}
                color={theme.colors.accentText}
              />
              <AppText variant="heading">Now printing</AppText>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/prints")}
            >
              <AppText variant="caption" color={theme.colors.accentText}>
                All jobs
              </AppText>
            </Pressable>
          </View>

          {!data && loading ? (
            <AppText variant="caption" muted>
              Loading…
            </AppText>
          ) : data?.active.length ? (
            <View style={styles.jobList}>
              {data.active.map((job) => {
                const progress = jobProgress(job, data.printers);
                const printer = data.printers.find(
                  (item) => item.serial === job.device_id,
                );
                const paused = printer?.status?.gcode_state === "PAUSE";
                const busy = Array.from(pendingControls).some((key) =>
                  key.startsWith(`${job.id}:`),
                );
                const canControl = Boolean(printer?.online && job.bambu_task_id);
                return (
                  <View key={job.id} style={styles.job}>
                    <View style={styles.jobTop}>
                      <AppText
                        variant="body"
                        numberOfLines={1}
                        style={styles.jobTitle}
                      >
                        {job.title}
                      </AppText>
                      <Badge label={`${progress}%`} variant="warning" />
                    </View>
                    <ProgressBar value={progress} />
                    <View style={styles.jobMeta}>
                      <AppText variant="micro" muted>
                        {printer?.name ?? job.device_id ?? "Printer"}
                      </AppText>
                      <AppText variant="micro" muted>
                        {formatWeight(job.weight)}
                      </AppText>
                    </View>
                    <View style={styles.jobActions}>
                      <AppButton
                        title={paused ? "Resume" : "Pause"}
                        variant="secondary"
                        size="sm"
                        disabled={busy || !canControl}
                        loading={pendingControls.has(
                          `${job.id}:${paused ? "resume" : "pause"}`,
                        )}
                        onPress={() =>
                          confirmControl(job, paused ? "resume" : "pause")
                        }
                        style={styles.jobAction}
                      />
                      <AppButton
                        title="Cancel"
                        variant="danger"
                        size="sm"
                        disabled={busy || !canControl}
                        loading={pendingControls.has(`${job.id}:stop`)}
                        onPress={() => confirmControl(job, "stop")}
                        style={styles.jobAction}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            <AppText variant="caption" muted>
              Nothing is printing right now.
            </AppText>
          )}
          {controlError ? (
            <AppText variant="caption" color={theme.colors.danger}>
              {controlError}
            </AppText>
          ) : null}
        </Card>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <AppText variant="label" muted>
              Recently finished
            </AppText>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/prints")}
            >
              <AppText variant="caption" color={theme.colors.accentText}>
                View history
              </AppText>
            </Pressable>
          </View>
          {finished.length ? (
            <Card style={styles.listCard}>
              {finished.map((job, index) => {
                const status = jobStatus(job);
                return (
                  <View key={job.id}>
                    {index > 0 ? <ShelfRule /> : null}
                    <View style={styles.historyRow}>
                      <View style={styles.historyText}>
                        <AppText variant="body" numberOfLines={1}>
                          {job.title}
                        </AppText>
                        <AppText variant="micro" muted>
                          {formatDate(job.finished_at ?? job.created_at)} ·{" "}
                          {formatWeight(job.weight)}
                        </AppText>
                      </View>
                      <Badge label={status.label} variant={status.variant} />
                    </View>
                  </View>
                );
              })}
            </Card>
          ) : (
            <Card>
              <AppText variant="caption" muted>
                No finished prints yet.
              </AppText>
            </Card>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <AppText variant="label" muted>
              Low filament
            </AppText>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push("/filaments")}
            >
              <AppText variant="caption" color={theme.colors.accentText}>
                All filaments
              </AppText>
            </Pressable>
          </View>
          {lowStock.length ? (
            <Card style={styles.listCard}>
              {lowStock.map((item, index) => (
                <View key={item.filament.id}>
                  {index > 0 ? <ShelfRule /> : null}
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => router.push("/filaments")}
                    style={styles.filamentRow}
                  >
                    <ColorDot color={item.filament.color_hex} size={12} />
                    <View style={styles.filamentText}>
                      <AppText variant="body" numberOfLines={1}>
                        {item.filament.color_name}
                      </AppText>
                      <AppText variant="micro" muted>
                        {item.filament.brand} · {item.filament.material}
                      </AppText>
                    </View>
                    <AppText variant="caption" color={theme.colors.warning}>
                      {formatWeight(item.remaining)}
                    </AppText>
                  </Pressable>
                </View>
              ))}
            </Card>
          ) : (
            <Card>
              <AppText variant="caption" muted>
                Every tracked filament has at least 250 g left.
              </AppText>
            </Card>
          )}
        </View>

        {!data && loading ? (
          <EmptyState
            icon="sync-outline"
            title="Loading your dashboard"
            description="Fetching printers, spools and print history."
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.xl,
    gap: spacing.xl,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: radius.lg,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  errorText: {
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
    gap: spacing.md,
  },
  sectionTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
  },
  action: {
    flexBasis: "47%",
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.xl,
    borderCurve: "continuous",
    padding: spacing.md,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.lg,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  jobList: {
    gap: spacing.lg,
  },
  job: {
    gap: spacing.sm,
  },
  jobTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  jobTitle: {
    flex: 1,
  },
  jobMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  jobActions: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  jobAction: {
    flex: 1,
  },
  listCard: {
    paddingVertical: spacing.xs,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  historyText: {
    flex: 1,
    gap: 2,
  },
  filamentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  filamentText: {
    flex: 1,
    gap: 2,
  },
});
