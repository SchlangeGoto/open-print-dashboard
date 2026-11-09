import { View, type ViewProps } from "react-native";

import { radius, spacing, useTheme } from "@/lib/theme";

export function Card({ style, ...rest }: ViewProps) {
  const theme = useTheme();
  return (
    <View
      {...rest}
      style={[
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderWidth: 1,
          borderRadius: radius.xl,
          padding: spacing.lg,
        },
        style,
      ]}
    />
  );
}
