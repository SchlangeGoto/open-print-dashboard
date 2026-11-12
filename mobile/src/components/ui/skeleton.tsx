import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { radius, useTheme } from "@/lib/theme";

interface SkeletonProps {
  width?: ViewStyle["width"];
  height: number;
  rounded?: number;
  style?: StyleProp<ViewStyle>;
}

export function Skeleton({
  width = "100%",
  height,
  rounded = radius.sm,
  style,
}: SkeletonProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.base,
        {
          width,
          height,
          borderRadius: rounded,
          backgroundColor: theme.colors.skeleton,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: "hidden",
  },
});
