import { StyleSheet, View, type ViewProps } from "react-native";

import { AppText } from "./app-text";
import { radius, spacing, useTheme } from "@/lib/theme";

type BadgeVariant = "neutral" | "success" | "warning" | "danger" | "accent";

interface BadgeProps extends ViewProps {
  label: string;
  variant?: BadgeVariant;
}

export function Badge({ label, variant = "neutral", style, ...rest }: BadgeProps) {
  const theme = useTheme();
  const colors: Record<BadgeVariant, { fg: string; bg: string }> = {
    neutral: { fg: theme.colors.muted, bg: theme.colors.surfaceAlt },
    success: {
      fg: theme.colors.success,
      bg: `${theme.colors.success}1f`,
    },
    warning: {
      fg: theme.colors.warning,
      bg: `${theme.colors.warning}1f`,
    },
    danger: { fg: theme.colors.danger, bg: `${theme.colors.danger}1f` },
    accent: { fg: theme.colors.accent, bg: `${theme.colors.accent}1f` },
  };
  const { fg, bg } = colors[variant];

  return (
    <View
      {...rest}
      style={[styles.badge, { backgroundColor: bg }, style]}
    >
      <AppText variant="caption" color={fg} style={styles.text}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  text: {
    fontSize: 11,
    fontWeight: "700",
  },
});
