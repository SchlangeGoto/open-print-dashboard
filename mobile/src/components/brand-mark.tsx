import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, View } from "react-native";

import { useTheme } from "@/lib/theme";

interface BrandMarkProps {
  size?: number;
}

/** Matches the disc mark used in the dashboard sidebar and auth screens. */
export function BrandMark({ size = 56 }: BrandMarkProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: size * 0.32,
          borderCurve: "continuous",
          backgroundColor: `${theme.colors.accent}18`,
          borderColor: `${theme.colors.accent}33`,
        },
      ]}
    >
      <Ionicons name="disc" size={size * 0.5} color={theme.colors.accentText} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    alignSelf: "center",
  },
});
