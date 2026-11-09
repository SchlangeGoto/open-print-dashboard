import { ActivityIndicator, StyleSheet, View } from "react-native";

import { BrandMark } from "./brand-mark";
import { AppText } from "./ui/app-text";
import { spacing, useTheme } from "@/lib/theme";

export function LoadingScreen({ message = "Loading your dashboard…" }: { message?: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.container, { backgroundColor: theme.colors.bg }]}>
      <BrandMark size={56} />
      <ActivityIndicator color={theme.colors.accent} />
      <AppText muted>{message}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.lg,
  },
});
