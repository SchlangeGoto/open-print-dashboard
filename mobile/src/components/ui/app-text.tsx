import { Text, type TextProps, type TextStyle } from "react-native";

import { typography, useTheme } from "@/lib/theme";

type Variant = keyof typeof typography;

interface AppTextProps extends TextProps {
  variant?: Variant;
  muted?: boolean;
  faint?: boolean;
  color?: string;
}

export function AppText({
  variant = "body",
  muted = false,
  faint = false,
  color,
  style,
  ...rest
}: AppTextProps) {
  const theme = useTheme();
  const textColor = faint
    ? theme.colors.faint
    : muted
      ? theme.colors.muted
      : theme.colors.text;

  return (
    <Text
      {...rest}
      style={[
        typography[variant] as TextStyle,
        { color: color ?? textColor },
        style,
      ]}
    />
  );
}
