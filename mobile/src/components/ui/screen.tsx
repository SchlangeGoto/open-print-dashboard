import { Ionicons } from "@expo/vector-icons";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppText } from "./app-text";
import { spacing, useTheme } from "@/lib/theme";

export function Screen({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <SafeAreaView
      edges={["top"]}
      style={[styles.screen, { backgroundColor: theme.colors.bg }]}
    >
      {children}
    </SafeAreaView>
  );
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
  brand?: boolean;
}

export function PageHeader({
  title,
  subtitle,
  left,
  right,
  brand = false,
}: PageHeaderProps) {
  const theme = useTheme();

  return (
    <View style={styles.header}>
      {left ? <View style={styles.left}>{left}</View> : null}
      <View style={styles.titleWrap}>
        {brand ? (
          <View style={styles.brandRow}>
            <Ionicons name="disc" size={13} color={theme.colors.accentText} />
            <AppText variant="caption" muted>
              Open Print
            </AppText>
          </View>
        ) : null}
        <AppText variant="title" numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="subhead" muted>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  left: {
    marginLeft: -spacing.xs,
  },
  titleWrap: {
    flex: 1,
    gap: 2,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    // Optical gap between the brand line and the screen title.
    marginBottom: 2,
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
});
