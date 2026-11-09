import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { AppText } from "./app-text";
import { radius, spacing, useTheme } from "@/lib/theme";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface AppButtonProps {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function AppButton({
  title,
  onPress,
  variant = "primary",
  size = "md",
  icon,
  loading = false,
  disabled = false,
  style,
}: AppButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;

  const backgrounds: Record<Variant, string> = {
    primary: theme.colors.accent,
    secondary: theme.colors.surfaceAlt,
    ghost: "transparent",
    danger: `${theme.colors.danger}22`,
  };

  const textColors: Record<Variant, string> = {
    primary: theme.colors.onAccent,
    secondary: theme.colors.text,
    ghost: theme.colors.text,
    danger: theme.colors.danger,
  };

  const sizes: Record<Size, ViewStyle> = {
    sm: { minHeight: 38, paddingHorizontal: spacing.md },
    md: { minHeight: 48, paddingHorizontal: spacing.lg },
    lg: { minHeight: 54, paddingHorizontal: spacing.xl },
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        sizes[size],
        {
          backgroundColor: backgrounds[variant],
          borderColor: "transparent",
        },
        pressed && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColors[variant]} />
      ) : (
        <>
          {icon}
          <AppText
            variant="label"
            color={textColors[variant]}
            style={styles.label}
          >
            {title}
          </AppText>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.sm,
  },
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.985 }],
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontSize: 14,
  },
});
