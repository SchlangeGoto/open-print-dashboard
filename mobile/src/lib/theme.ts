/*
 * Open Print mobile theme.
 * The single source of truth for colour, spacing, type, and radius. Values
 * mirror the web dashboard so both clients feel like one product.
 */
import { useColorScheme } from "react-native";

export interface ThemeColors {
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  inputBorder: string;
  text: string;
  muted: string;
  faint: string;
  accent: string;
  accentText: string;
  onAccent: string;
  success: string;
  warning: string;
  danger: string;
  info: string;
  input: string;
  camera: string;
  onCamera: string;
  onCameraMuted: string;
  overlay: string;
  overlayStrong: string;
  scrim: string;
  mediaInk: string;
  mediaPaper: string;
  skeleton: string;
}

export interface Theme {
  dark: boolean;
  colors: ThemeColors;
}

/*
 * Mirrors the dashboard's shadcn tokens: zinc neutrals, emerald accent,
 * foreground/10 rings. accentText is the readable variant for links, icons
 * and labels on surfaces; accent stays the filled-control colour.
 */
const darkColors: ThemeColors = {
  bg: "#0a0a0a",
  surface: "#171717",
  surfaceAlt: "#262626",
  border: "rgba(255,255,255,0.10)",
  inputBorder: "rgba(255,255,255,0.15)",
  text: "#fafafa",
  muted: "#a3a3a3",
  faint: "#737373",
  accent: "#059669",
  accentText: "#34d399",
  onAccent: "#0a0a0a",
  success: "#34d399",
  warning: "#fbbf24",
  danger: "#f87171",
  info: "#60a5fa",
  input: "rgba(255,255,255,0.045)",
  camera: "#000000",
  onCamera: "#ffffff",
  onCameraMuted: "rgba(255,255,255,0.92)",
  overlay: "rgba(0,0,0,0.62)",
  overlayStrong: "rgba(0,0,0,0.72)",
  scrim: "rgba(0,0,0,0.22)",
  mediaInk: "#0a0a0a",
  mediaPaper: "#fafafa",
  skeleton: "rgba(255,255,255,0.06)",
};

const lightColors: ThemeColors = {
  bg: "#ffffff",
  surface: "#ffffff",
  surfaceAlt: "#f5f5f5",
  border: "#e5e5e5",
  inputBorder: "#e5e5e5",
  text: "#0a0a0a",
  muted: "#737373",
  faint: "#a3a3a3",
  accent: "#059669",
  accentText: "#047857",
  onAccent: "#0a0a0a",
  success: "#047857",
  warning: "#b45309",
  danger: "#dc2626",
  info: "#2563eb",
  input: "rgba(0,0,0,0.03)",
  camera: "#000000",
  onCamera: "#ffffff",
  onCameraMuted: "rgba(255,255,255,0.92)",
  overlay: "rgba(0,0,0,0.62)",
  overlayStrong: "rgba(0,0,0,0.72)",
  scrim: "rgba(0,0,0,0.22)",
  mediaInk: "#0a0a0a",
  mediaPaper: "#fafafa",
  skeleton: "rgba(0,0,0,0.06)",
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
  xs: 2,
  sm: 6,
  md: 8,
  lg: 10,
  xl: 14,
  xxl: 18,
  pill: 999,
} as const;

export const typography = {
  display: {
    fontFamily: "Geist_700Bold",
    fontSize: 28,
    letterSpacing: -0.5,
  },
  title: {
    fontFamily: "Geist_700Bold",
    fontSize: 24,
    letterSpacing: -0.4,
  },
  readout: {
    fontFamily: "Geist_700Bold",
    fontSize: 22,
    letterSpacing: -0.3,
  },
  readoutSmall: {
    fontFamily: "Geist_700Bold",
    fontSize: 17,
    letterSpacing: -0.2,
  },
  heading: {
    fontFamily: "Geist_500Medium",
    fontSize: 16,
    letterSpacing: -0.2,
  },
  body: {
    fontFamily: "Geist_400Regular",
    fontSize: 15,
  },
  bodySmall: {
    fontFamily: "Geist_400Regular",
    fontSize: 14,
  },
  button: {
    fontFamily: "Geist_500Medium",
    fontSize: 14,
  },
  subhead: {
    fontFamily: "Geist_400Regular",
    fontSize: 13,
  },
  label: {
    fontFamily: "Geist_500Medium",
    fontSize: 13,
  },
  caption: {
    fontFamily: "Geist_500Medium",
    fontSize: 12,
  },
  micro: {
    fontFamily: "Geist_500Medium",
    fontSize: 11,
  },
  mono: {
    fontFamily: "GeistMono_400Regular",
    fontSize: 12,
  },
  monoSmall: {
    fontFamily: "GeistMono_400Regular",
    fontSize: 11,
  },
  monoMicro: {
    fontFamily: "GeistMono_400Regular",
    fontSize: 10,
  },
};
