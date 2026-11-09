import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "./ui/app-text";
import { Badge } from "./ui/badge";
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

export function SpoolCard({
  spool,
  filament,
  printerName,
  onPress,
}: SpoolCardProps) {
  const theme = useTheme();
  const pct = percent(spool.remaining_g, spool.total_weight_g);
  const color = filament?.color_hex ?? theme.colors.faint;
  const low = pct <= 15;
  const sourceLabel =
    spool.source === "ams"
      ? "AMS"
      : spool.source === "barcode"
        ? "Barcode"
        : null;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.topRow}>
        <View
          style={[
            styles.colorBlock,
            {
              backgroundColor: color,
              borderColor: theme.colors.border,
            },
          ]}
        />
        <View style={styles.titleWrap}>
          <View style={styles.titleRow}>
            <AppText variant="heading" numberOfLines={1} style={styles.title}>
              {filament?.color_name ?? "Unknown filament"}
            </AppText>
            <Badge
              label={`${pct}%`}
              variant={low ? "danger" : pct <= 35 ? "warning" : "neutral"}
            />
          </View>
          <View style={styles.subtitleRow}>
            <AppText variant="caption" muted numberOfLines={1}>
              {filament
                ? `${filament.brand} · ${filament.material}`
                : "No filament details"}
            </AppText>
            {sourceLabel ? (
              <AppText variant="caption" faint>
                {sourceLabel}
              </AppText>
            ) : null}
          </View>
        </View>
      </View>

      <ProgressBar
        value={pct}
        color={low ? theme.colors.danger : color}
        height={5}
      />

      <View style={styles.footer}>
        <AppText variant="caption" muted>
          {formatWeight(spool.remaining_g)} of{" "}
          {formatWeight(spool.total_weight_g)}
        </AppText>
        <View style={styles.location}>
          <Ionicons
            name={printerName ? "print" : "ellipse-outline"}
            size={13}
            color={printerName ? theme.colors.accent : theme.colors.faint}
          />
          <AppText
            variant="caption"
            color={printerName ? theme.colors.text : theme.colors.faint}
            numberOfLines={1}
            style={styles.locationText}
          >
            {printerName ?? "Not loaded"}
          </AppText>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.995 }],
  },
  topRow: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "center",
  },
  colorBlock: {
    width: 46,
    height: 46,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  titleWrap: {
    flex: 1,
    gap: 3,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    fontSize: 16,
  },
  subtitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  location: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    maxWidth: "55%",
  },
  locationText: {
    flexShrink: 1,
  },
});
