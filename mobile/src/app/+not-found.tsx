import { Link, Stack } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Not found" }} />
      <View style={styles.container}>
        <Text style={styles.title}>This screen does not exist</Text>
        <Text style={styles.description}>
          The link may be old, or the spool may have been deleted.
        </Text>
        <Link href="/" style={styles.link}>
          Go to the dashboard
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#0a0a0a",
  },
  title: { color: "#f5f5f5", fontSize: 20, fontWeight: "600" },
  description: {
    color: "#a3a3a3",
    marginTop: 8,
    textAlign: "center",
    maxWidth: 320,
  },
  link: { color: "#34d399", marginTop: 20, fontWeight: "600" },
});
