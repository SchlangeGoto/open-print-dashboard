import { StyleSheet, View } from "react-native";

import { normalizeHex } from "@/lib/format";
import { radius, useTheme } from "@/lib/theme";

interface ColorDotProps {
  color: string | null | undefined;
  size?: number;
  rounded?: boolean;
}

export function ColorDot({ color, size = 18, rounded = true }: ColorDotProps) {
  const theme = useTheme();
  const hex = normalizeHex(color ?? "") ?? theme.colors.faint;

  return (
    <View
      style={[
        styles.dot,
        {
          width: size,
          height: size,
          borderRadius: rounded ? radius.pill : radius.sm,
          backgroundColor: hex,
          borderColor: theme.colors.border,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  dot: {
    borderWidth: StyleSheet.hairlineWidth,
  },
});
