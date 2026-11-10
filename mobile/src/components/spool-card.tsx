import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "./ui/app-text";
import { MetaLine } from "./ui/meta-line";
import { ProgressBar } from "./ui/progress-bar";
import { formatWeight, percent } from "@/lib/format";
import { radius, spacing, useTheme } from "@/lib/theme";
import type { Filament, Spool } from "@/lib/types";

interface SpoolCardProps {
  spool: Spool;
  filament?: Filament;
  printerName?: string | null;
  onPress: () => void;
}

/**
 * One shelf row: a colour spine for the filament, the specification line
 * underneath, and the loaded spool pulled forward with the emerald tint.
 */
export function SpoolCard({
  spool,
  filament,
  printerName,
  onPress,
}: SpoolCardProps) {
  const theme = useTheme();
  const unknown = Boolean(spool.remaining_unknown);
  const pct = unknown ? 0 : percent(spool.remaining_g, spool.total_weight_g);
  const color = filament?.color_hex ?? theme.colors.faint;
  const low = !unknown && pct <= 15;
  const loaded = Boolean(printerName);
  const sourceLabel =
    spool.source === "ams"
      ? "AMS"
      : spool.source === "barcode"
        ? "Barcode"
        : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${filament?.color_name ?? "Spool"}, ${
        unknown
          ? "weight unknown"
          : `${pct} percent, ${formatWeight(spool.remaining_g)} remaining`
      }, ${printerName ?? "not loaded"}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        loaded && { backgroundColor: `${theme.colors.accent}0D` },
        pressed && { backgroundColor: theme.colors.input },
      ]}
    >
      <View
        style={[
          styles.spine,
          {
            backgroundColor: color,
            borderColor: theme.colors.border,
          },
        ]}
      />

      <View style={styles.content}>
        <View style={styles.topLine}>
          <AppText variant="heading" numberOfLines={1} style={styles.title}>
            {filament?.color_name ?? "Unknown filament"}
          </AppText>
          <AppText
            variant="monoSmall"
            color={low ? theme.colors.danger : theme.colors.muted}
            style={styles.readout}
          >
            {unknown ? "—" : `${pct}%`}
          </AppText>
        </View>

        <MetaLine
          items={
            filament
              ? [filament.brand, filament.material, sourceLabel]
              : ["No filament details"]
          }
        />

        <View style={styles.barRow}>
          <View style={styles.barTrack}>
            <ProgressBar
              value={pct}
              color={unknown ? theme.colors.faint : low ? theme.colors.danger : color}
              height={3}
            />
          </View>
          <AppText variant="monoSmall" muted style={styles.readout}>
            {unknown ? "Weight unknown" : `${formatWeight(spool.remaining_g)} left`}
          </AppText>
        </View>

        <View style={styles.locationRow}>
          {loaded ? (
            <Ionicons
              name="print-outline"
              size={13}
              color={theme.colors.accentText}
            />
          ) : null}
          <AppText
            variant="caption"
            color={loaded ? theme.colors.accentText : theme.colors.muted}
            numberOfLines={1}
            style={styles.location}
          >
            {printerName ?? "Not loaded"}
          </AppText>
        </View>
      </View>

      <Ionicons
        name="chevron-forward"
        size={15}
        color={theme.colors.faint}
        style={styles.chevron}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  spine: {
    width: 4,
    minHeight: 52,
    borderRadius: radius.xs,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
  },
  content: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  topLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  title: {
    flex: 1,
  },
  readout: {
    fontVariant: ["tabular-nums"],
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
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  location: {
    flexShrink: 1,
  },
  chevron: {
    marginLeft: -2,
  },
});
