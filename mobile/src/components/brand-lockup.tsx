import { StyleSheet, View } from "react-native";

import { BrandMark } from "./brand-mark";
import { AppText } from "./ui/app-text";
import { spacing } from "@/lib/theme";

export function BrandLockup({ size = 64 }: { size?: number }) {
  return (
    <View style={styles.wrap}>
      <BrandMark size={size} />
      <AppText variant="micro" muted>
        Open Print
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    gap: spacing.sm,
  },
});
