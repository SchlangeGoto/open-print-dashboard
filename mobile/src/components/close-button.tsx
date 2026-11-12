import { Ionicons } from "@expo/vector-icons";
import { Pressable } from "react-native";

import { useTheme } from "@/lib/theme";

export function CloseButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Close"
      hitSlop={12}
      onPress={onPress}
    >
      <Ionicons name="close" size={25} color={theme.colors.text} />
    </Pressable>
  );
}
