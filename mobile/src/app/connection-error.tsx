import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { LoadingScreen } from "@/components/loading-screen";
import { AppButton } from "@/components/ui/app-button";
import { AppText } from "@/components/ui/app-text";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { spacing, useTheme } from "@/lib/theme";

export default function ConnectionErrorScreen() {
  const { status, serverUrl, retry } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const [busy, setBusy] = useState(false);

  if (status === "authenticated") {
    return <Redirect href="/" />;
  }
  if (status === "needs-server") {
    return <Redirect href="/server-setup" />;
  }
  if (status === "logged-out") {
    return <Redirect href="/login" />;
  }
  if (status === "loading") {
    return <LoadingScreen message="Reconnecting…" />;
  }

  async function handleRetry() {
    setBusy(true);
    try {
      await retry();
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.bg }]}>
      <View
        style={[
          styles.iconWrap,
          { backgroundColor: `${theme.colors.warning}18` },
        ]}
      >
        <Ionicons
          name="cloud-offline-outline"
          size={36}
          color={theme.colors.warning}
        />
      </View>

      <View style={styles.heading}>
        <AppText variant="title" style={styles.center}>
          Can&apos;t reach your server
        </AppText>
        <AppText muted style={styles.center}>
          The app kept your session, but the dashboard did not answer. Check
          that the backend is running and reachable from this device.
        </AppText>
      </View>

      <Card style={styles.card}>
        <AppText variant="label">Configured server</AppText>
        <AppText variant="mono" muted>
          {serverUrl ?? "Not configured"}
        </AppText>
      </Card>

      <View style={styles.actions}>
        <AppButton
          title="Try again"
          loading={busy}
          onPress={handleRetry}
          icon={
            <Ionicons
              name="refresh"
              size={18}
              color={theme.colors.onAccent}
            />
          }
        />
        <AppButton
          title="Change server"
          variant="secondary"
          onPress={() => router.replace("/server-setup?edit=1")}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    gap: spacing.xl,
  },
  iconWrap: {
    width: 82,
    height: 82,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
  },
  heading: {
    gap: spacing.sm,
  },
  center: {
    textAlign: "center",
  },
  card: {
    gap: spacing.sm,
  },
  actions: {
    gap: spacing.md,
  },
});
