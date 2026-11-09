import { useState, type ReactNode } from "react";
import {
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";

import { AppText } from "./app-text";
import { radius, spacing, useTheme } from "@/lib/theme";

interface TextFieldProps extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string;
  right?: ReactNode;
}

export function TextField({
  label,
  hint,
  error,
  right,
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
        <TextInput
          {...rest}
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
            { color: theme.colors.text, fontFamily: "Geist_400Regular" },
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
        <AppText variant="caption" faint>
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
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
  },
  input: {
    flex: 1,
    minHeight: 50,
    fontSize: 15,
    paddingVertical: spacing.md,
  },
  multiline: {
    minHeight: 92,
    textAlignVertical: "top",
  },
});
