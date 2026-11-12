import { useState, type ReactNode } from "react";
import {
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";

import { AppText } from "./app-text";
import { radius, spacing, typography, useTheme } from "@/lib/theme";

interface TextFieldProps extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string;
  left?: ReactNode;
  right?: ReactNode;
  compact?: boolean;
}

export function TextField({
  label,
  hint,
  error,
  left,
  right,
  compact = false,
  style,
  ...rest
}: TextFieldProps) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrapper}>
      {label ? (
        <AppText variant="label" style={styles.label}>
          {label}
        </AppText>
      ) : null}
      <View
        style={[
          styles.inputRow,
          compact && styles.inputRowCompact,
          {
            backgroundColor: theme.colors.input,
            borderColor: error
              ? theme.colors.danger
              : focused
                ? theme.colors.accent
                : theme.colors.inputBorder,
          },
        ]}
      >
        {left}
        <TextInput
          {...rest}
          accessibilityLabel={rest.accessibilityLabel ?? label}
          onFocus={(event) => {
            setFocused(true);
            rest.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            rest.onBlur?.(event);
          }}
          placeholderTextColor={theme.colors.muted}
          style={[
            styles.input,
            typography.body,
            compact && [styles.inputCompact, typography.bodySmall],
            { color: theme.colors.text },
            rest.multiline && styles.multiline,
            style,
          ]}
        />
        {right}
      </View>
      {error ? (
        <AppText variant="caption" color={theme.colors.danger}>
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" muted>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.sm,
  },
  label: {
    marginLeft: 2,
  },
  inputRow: {
    borderWidth: 1,
    borderRadius: radius.lg,
    borderCurve: "continuous",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  inputRowCompact: {
    paddingHorizontal: spacing.sm,
  },
  input: {
    flex: 1,
    minHeight: 50,
    paddingVertical: spacing.md,
  },
  inputCompact: {
    minHeight: 40,
    paddingVertical: spacing.sm,
  },
  multiline: {
    minHeight: 92,
    textAlignVertical: "top",
  },
});
