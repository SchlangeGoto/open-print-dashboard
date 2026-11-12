import { Fragment } from "react";
import { StyleSheet, View } from "react-native";

import { AppText } from "./app-text";
import { spacing, useTheme } from "@/lib/theme";

interface Stat {
  value: string;
  label: string;
}

type StatSize = "md" | "sm";

function StatCell({ stat, size }: { stat: Stat; size: StatSize }) {
  return (
    <View style={styles.stat}>
      <AppText
        variant={size === "sm" ? "readoutSmall" : "readout"}
        style={styles.value}
      >
        {stat.value}
      </AppText>
      <AppText variant="caption" muted>
        {stat.label}
      </AppText>
    </View>
  );
}

/**
 * A hairline readout instead of a card: the dashboard's stat row without
 * the container. Values sit on the shelf line, labels below.
 */
export function StatReadout({
  stats,
  size = "md",
}: {
  stats: Stat[];
  size?: StatSize;
}) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.frame,
        {
          borderTopColor: theme.colors.border,
          borderBottomColor: theme.colors.border,
        },
      ]}
    >
      <View style={styles.row}>
        {stats.map((stat, index) => (
          <Fragment key={stat.label}>
            {index > 0 ? (
              <View
                style={[styles.rule, { backgroundColor: theme.colors.border }]}
              />
            ) : null}
            <StatCell stat={stat} size={size} />
          </Fragment>
        ))}
      </View>
    </View>
  );
}

/** Two-column readout for detail screens with four short values. */
export function StatGrid({
  stats,
  size = "sm",
}: {
  stats: Stat[];
  size?: StatSize;
}) {
  const theme = useTheme();
  const rows: Stat[][] = [];
  for (let index = 0; index < stats.length; index += 2) {
    rows.push(stats.slice(index, index + 2));
  }

  return (
    <View
      style={[
        styles.frame,
        {
          borderTopColor: theme.colors.border,
          borderBottomColor: theme.colors.border,
        },
      ]}
    >
      {rows.map((row, rowIndex) => (
        <Fragment key={row.map((stat) => stat.label).join("-")}>
          {rowIndex > 0 ? (
            <View
              style={[
                styles.horizontalRule,
                { backgroundColor: theme.colors.border },
              ]}
            />
          ) : null}
          <View style={styles.row}>
            {row.map((stat, index) => (
              <Fragment key={stat.label}>
                {index > 0 ? (
                  <View
                    style={[
                      styles.rule,
                      { backgroundColor: theme.colors.border },
                    ]}
                  />
                ) : null}
                <StatCell stat={stat} size={size} />
              </Fragment>
            ))}
          </View>
        </Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  stat: {
    flex: 1,
    alignItems: "center",
    gap: 1,
    minWidth: 0,
  },
  value: {
    fontVariant: ["tabular-nums"],
  },
  rule: {
    width: 1,
    height: 30,
  },
  horizontalRule: {
    height: StyleSheet.hairlineWidth,
  },
});
