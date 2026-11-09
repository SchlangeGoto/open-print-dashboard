import { StyleSheet, View } from "react-native";

import { useTheme } from "@/lib/theme";

/** Full-bleed hairline between shelf rows. */
export function ShelfRule() {
  const theme = useTheme();
  return (
    <View style={[styles.rule, { backgroundColor: theme.colors.border }]} />
  );
}

const styles = StyleSheet.create({
  rule: {
    height: StyleSheet.hairlineWidth,
  },
});
