import { StyleSheet, View } from "react-native";

import { radius, useTheme } from "@/lib/theme";

interface ProgressBarProps {
  value: number;
  color?: string;
  height?: number;
}

export function ProgressBar({ value, color, height = 6 }: ProgressBarProps) {
  const theme = useTheme();
  const clamped = Math.max(0, Math.min(100, value));

  return (
    <View
      style={[
        styles.track,
        { backgroundColor: theme.colors.surfaceAlt, height },
      ]}
    >
      <View
        style={[
          styles.fill,
          {
            backgroundColor: color ?? theme.colors.accent,
            width: `${clamped}%`,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: "100%",
    borderRadius: radius.pill,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: radius.pill,
  },
});
