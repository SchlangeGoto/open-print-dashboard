import { Image, StyleSheet, View } from "react-native";

import { useTheme } from "@/lib/theme";

interface BrandMarkProps {
  size?: number;
}

export function BrandMark({ size = 72 }: BrandMarkProps) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.wrap,
        {
          width: size + 14,
          height: size + 14,
          borderRadius: (size + 14) * 0.28,
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <Image
        source={require("../../assets/images/icon.png")}
        style={{ width: size, height: size, borderRadius: size * 0.24 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: "center",
  },
});
