import { StyleSheet, View } from "react-native";

import { AppText } from "./ui/app-text";
import { spacing } from "@/lib/theme";

interface DetailRowProps {
  label: string;
  value: string;
  mono?: boolean;
}

export function DetailRow({ label, value, mono = false }: DetailRowProps) {
  return (
    <View style={styles.row}>
      <AppText variant="caption" muted>
        {label}
      </AppText>
      <AppText
        variant={mono ? "mono" : "body"}
        numberOfLines={2}
        style={styles.value}
        selectable
      >
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.lg,
    alignItems: "flex-start",
  },
  value: {
    flex: 1,
    textAlign: "right",
  },
});
