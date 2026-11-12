import { Fragment } from "react";
import { StyleSheet, View } from "react-native";

import { AppText } from "./app-text";
import { spacing, useTheme } from "@/lib/theme";

interface MetaLineProps {
  items: (string | null | undefined)[];
  color?: string;
  ruleColor?: string;
}

export function MetaLine({ items, color, ruleColor }: MetaLineProps) {
  const theme = useTheme();
  const visible = items.filter((item): item is string => Boolean(item));

  return (
    <View style={styles.row}>
      {visible.map((item, index) => (
        <Fragment key={`${item}-${index}`}>
          {index > 0 ? (
            <View
              style={[
                styles.rule,
                {
                  backgroundColor: ruleColor ?? theme.colors.border,
                },
              ]}
            />
          ) : null}
          <AppText
            variant="caption"
            color={color ?? theme.colors.muted}
            numberOfLines={1}
            style={styles.item}
          >
            {item}
          </AppText>
        </Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minWidth: 0,
  },
  rule: {
    width: 1,
    height: 10,
    flexShrink: 0,
  },
  item: {
    flexShrink: 1,
  },
});
