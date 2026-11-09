import { StyleSheet, View } from "react-native";

import { AppText } from "./ui/app-text";
import { spacing } from "@/lib/theme";

interface DiagnosticRowProps {
  label: string;
  value: string;
  valueColor?: string;
}

export function DiagnosticRow({
  label,
  value,
  valueColor,
}: DiagnosticRowProps) {
  return (
    <View style={styles.row}>
      <AppText variant="caption" muted>
        {label}
      </AppText>
      <AppText
        variant="monoSmall"
        color={valueColor}
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
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  value: {
    flexShrink: 1,
    textAlign: "right",
  },
});
