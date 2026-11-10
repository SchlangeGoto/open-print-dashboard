import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "./ui/app-text";
import { ColorDot } from "./ui/color-dot";
import { MetaLine } from "./ui/meta-line";
import { ProgressBar } from "./ui/progress-bar";
import { formatWeight, percent } from "@/lib/format";
import { radius, spacing, useTheme } from "@/lib/theme";
import type { Filament, Printer, Spool } from "@/lib/types";

export interface PrinterRow {
  printer: Printer;
  loadedSpool?: Spool;
  filament?: Filament;
}

interface PrinterRackRowProps {
  row: PrinterRow;
  onOpenSpool?: () => void;
}

/** One printer on the rack, with its loaded spool pulled forward. */
export function PrinterRackRow({ row, onOpenSpool }: PrinterRackRowProps) {
  const theme = useTheme();
  const { printer, loadedSpool, filament } = row;
  const unknown = Boolean(loadedSpool?.remaining_unknown);
  const pct =
    loadedSpool && !unknown
      ? percent(loadedSpool.remaining_g, loadedSpool.total_weight_g)
      : 0;
  const statusColor = printer.online ? theme.colors.success : theme.colors.muted;

  return (
    <View style={styles.row}>
      <View style={styles.topLine}>
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
            size={19}
            color={printer.online ? theme.colors.success : theme.colors.muted}
          />
        </View>
        <View style={styles.titleBlock}>
          <AppText variant="heading" numberOfLines={1}>
            {printer.name}
          </AppText>
          <MetaLine
            items={[
              printer.model ?? "Bambu Lab printer",
              printer.configured ? "Bambu Cloud" : "Not added",
            ]}
          />
        </View>
        <View style={styles.status}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <AppText variant="caption" color={statusColor}>
            {printer.online ? "Online" : "Offline"}
          </AppText>
        </View>
      </View>

      {loadedSpool ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${filament?.color_name ?? "Loaded spool"}, ${
            unknown ? "weight unknown" : `${pct}% remaining`
          }`}
          onPress={onOpenSpool}
          style={({ pressed }) => [
            styles.loadedSpool,
            {
              backgroundColor: theme.colors.input,
              borderColor: theme.colors.border,
            },
            pressed && styles.pressed,
          ]}
        >
          <ColorDot color={filament?.color_hex} size={30} />
          <View style={styles.loadedText}>
            <View style={styles.loadedTop}>
              <AppText variant="label" numberOfLines={1} style={styles.flex}>
                {filament?.color_name ?? "Loaded spool"}
              </AppText>
              <AppText
                variant="monoSmall"
                color={
                  unknown
                    ? theme.colors.muted
                    : pct <= 15
                      ? theme.colors.danger
                      : theme.colors.muted
                }
                style={styles.readout}
              >
                {unknown
                  ? "Weight unknown"
                  : `${formatWeight(loadedSpool.remaining_g)} left`}
              </AppText>
            </View>
            <View style={styles.barRow}>
              <View style={styles.barTrack}>
                <ProgressBar
                  value={pct}
                  color={
                    unknown
                      ? theme.colors.faint
                      : pct <= 15
                        ? theme.colors.danger
                        : (filament?.color_hex ?? theme.colors.accent)
                  }
                  height={3}
                />
              </View>
              <AppText variant="monoSmall" muted style={styles.readout}>
                {unknown ? "—" : `${pct}%`}
              </AppText>
            </View>
          </View>
          <Ionicons
            name="chevron-forward"
            size={15}
            color={theme.colors.faint}
          />
        </Pressable>
      ) : (
        <View
          style={[
            styles.emptySlot,
            {
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.input,
            },
          ]}
        >
          <Ionicons
            name="ellipse-outline"
            size={15}
            color={theme.colors.muted}
          />
          <AppText variant="caption" muted>
            No spool loaded
          </AppText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  topLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  printerIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.lg,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  titleBlock: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  status: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: radius.pill,
  },
  loadedSpool: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    padding: spacing.md,
  },
  pressed: {
    opacity: 0.82,
  },
  loadedText: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  loadedTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  barRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  barTrack: {
    flex: 1,
    minWidth: 0,
  },
  readout: {
    fontVariant: ["tabular-nums"],
  },
  emptySlot: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
});
