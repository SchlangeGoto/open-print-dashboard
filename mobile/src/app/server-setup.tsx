import { Ionicons } from "@expo/vector-icons";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { BrandLockup } from "@/components/brand-lockup";
import { LoadingScreen } from "@/components/loading-screen";
import { AppButton } from "@/components/ui/app-button";
import { AppText } from "@/components/ui/app-text";
import { Card } from "@/components/ui/card";
import { TextField } from "@/components/ui/text-field";
import { testServerConnection } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatError } from "@/lib/format";
import { radius, spacing, useTheme } from "@/lib/theme";

export default function ServerSetupScreen() {
  const { status, serverUrl, setServerUrl } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ edit?: string }>();
  const isEdit = params.edit === "1";
  const theme = useTheme();
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Show the stored URL until the user starts editing. This avoids an effect
  // and still picks up the value when the context finishes loading.
  const url = draft ?? serverUrl ?? "";

  if (status === "loading") {
    return <LoadingScreen message="Checking your session…" />;
  }
  if (status === "authenticated" && !isEdit) {
    return <Redirect href="/" />;
  }

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }

  async function handleConnect() {
    setBusy(true);
    setError(null);
    try {
      const normalized = await testServerConnection(url);
      const changed = normalized !== serverUrl;
      await setServerUrl(normalized);
      if (changed || !isEdit) {
        router.replace("/login");
      } else {
        goBack();
      }
    } catch (err) {
      setError(formatError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.topBar}>
          {isEdit ? (
            <AppButton
              title="Cancel"
              variant="ghost"
              size="sm"
              onPress={goBack}
            />
          ) : null}
        </View>

        <BrandLockup size={64} />
        <View style={styles.heading}>
          <AppText variant="display" style={styles.center}>
            Connect your dashboard
          </AppText>
          <AppText muted style={styles.center}>
            Point the app at your Open Print Dashboard server. It works on your
            LAN or over the internet when the backend has a public HTTPS URL.
          </AppText>
        </View>

        <Card style={styles.card}>
          <TextField
            label="Server URL"
            value={url}
            onChangeText={setDraft}
            placeholder="https://print.example.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={handleConnect}
            hint="Include the port if needed. LAN example: http://192.168.1.50:8000"
          />

          {error ? (
            <View
              style={[
                styles.errorBox,
                {
                  backgroundColor: `${theme.colors.danger}18`,
                  borderColor: `${theme.colors.danger}55`,
                },
              ]}
            >
              <Ionicons
                name="alert-circle"
                size={18}
                color={theme.colors.danger}
              />
              <AppText
                variant="caption"
                color={theme.colors.danger}
                style={styles.errorText}
              >
                {error}
              </AppText>
            </View>
          ) : null}

          <AppButton
            title="Test connection & continue"
            icon={
              <Ionicons
                name="arrow-forward"
                size={18}
                color={theme.colors.onAccent}
              />
            }
            loading={busy}
            onPress={handleConnect}
          />
        </Card>

        <View style={styles.hintRow}>
          <Ionicons
            name="shield-checkmark-outline"
            size={16}
            color={theme.colors.muted}
          />
          <AppText variant="caption" muted style={styles.hintText}>
            On iOS and Android, tokens are stored in the device&apos;s secure
            storage. The app never sends your password anywhere except your own
            server.
          </AppText>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
    justifyContent: "center",
    gap: spacing.xl,
  },
  topBar: {
    position: "absolute",
    top: spacing.md,
    left: spacing.lg,
  },
  heading: {
    gap: spacing.sm,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  center: {
    textAlign: "center",
  },
  card: {
    gap: spacing.lg,
    padding: spacing.xl,
    borderRadius: radius.xl,
    borderCurve: "continuous",
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    borderCurve: "continuous",
    padding: spacing.md,
  },
  errorText: {
    flex: 1,
    lineHeight: 18,
  },
  hintRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  hintText: {
    flex: 1,
    lineHeight: 18,
  },
});
