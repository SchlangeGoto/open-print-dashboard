import { StyleSheet, View } from "react-native";

import { Skeleton } from "./ui/skeleton";
import { radius, spacing } from "@/lib/theme";

/** Loading row that preserves the shelf row's height and rhythm. */
export function SpoolSkeleton() {
  return (
    <View style={styles.row}>
      <Skeleton width={4} height={58} rounded={radius.xs} />
      <View style={styles.text}>
        <Skeleton width="58%" height={15} />
        <Skeleton width="38%" height={11} />
        <Skeleton width="72%" height={3} rounded={radius.xs} />
      </View>
      <Skeleton width={36} height={11} />
    </View>
  );
}

export function SpoolSkeletonList() {
  return (
    <View style={styles.list}>
      {[0, 1, 2, 3].map((index) => (
        <SpoolSkeleton key={index} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: spacing.xl,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.lg,
  },
  text: {
    flex: 1,
    gap: spacing.sm,
  },
});
