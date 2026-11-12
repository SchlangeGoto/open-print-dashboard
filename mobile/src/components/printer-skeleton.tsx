import { StyleSheet, View } from "react-native";

import { Skeleton } from "./ui/skeleton";
import { radius, spacing } from "@/lib/theme";

/** Loading rack row with the same icon, title, and well geometry. */
export function PrinterSkeleton() {
  return (
    <View style={styles.row}>
      <View style={styles.top}>
        <Skeleton width={36} height={36} rounded={radius.lg} />
        <View style={styles.text}>
          <Skeleton width="46%" height={15} />
          <Skeleton width="64%" height={11} />
        </View>
        <Skeleton width={46} height={11} />
      </View>
      <Skeleton width="100%" height={52} rounded={radius.lg} />
    </View>
  );
}

export function PrinterSkeletonList() {
  return (
    <View style={styles.list}>
      {[0, 1, 2].map((index) => (
        <PrinterSkeleton key={index} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: spacing.xl,
  },
  row: {
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  text: {
    flex: 1,
    gap: spacing.sm,
  },
});
