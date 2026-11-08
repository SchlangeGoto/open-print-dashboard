import { useColorScheme } from "react-native";

export interface ThemeColors {
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  muted: string;
  faint: string;
  accent: string;
  accentStrong: string;
  onAccent: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  input: string;
}

export interface Theme {
  dark: boolean;
  colors: ThemeColors;
}

const darkColors: ThemeColors = {
  bg: "#09090b",
  surface: "#131316",
  surfaceAlt: "#1b1b20",
  border: "#27272a",
  text: "#f4f4f5",
  muted: "#a1a1aa",
  faint: "#71717a",
  accent: "#2dd4bf",
  accentStrong: "#14b8a6",
  onAccent: "#04211c",
  success: "#34d399",
  warning: "#fbbf24",
  danger: "#f87171",
  info: "#60a5fa",
  input: "#0f0f12",
};

const lightColors: ThemeColors = {
  bg: "#f6f6f7",
  surface: "#ffffff",
  surfaceAlt: "#efeff1",
  border: "#e4e4e7",
  text: "#18181b",
  muted: "#52525b",
  faint: "#71717a",
  accent: "#0f9f8f",
  accentStrong: "#0d9488",
  onAccent: "#ffffff",
  success: "#059669",
  warning: "#d97706",
  danger: "#dc2626",
  info: "#2563eb",
  input: "#ffffff",
};

export function useTheme(): Theme {
  const scheme = useColorScheme();
  return scheme === "light"
    ? { dark: false, colors: lightColors }
    : { dark: true, colors: darkColors };
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 36,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 26,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 32, fontWeight: "700" as const, letterSpacing: -0.6 },
  title: { fontSize: 26, fontWeight: "700" as const, letterSpacing: -0.4 },
  heading: { fontSize: 19, fontWeight: "700" as const, letterSpacing: -0.2 },
  body: { fontSize: 15, fontWeight: "400" as const },
  label: { fontSize: 13, fontWeight: "600" as const },
  caption: { fontSize: 12, fontWeight: "500" as const },
  mono: {
    fontSize: 12,
    fontFamily: "monospace" as const,
  },
};
