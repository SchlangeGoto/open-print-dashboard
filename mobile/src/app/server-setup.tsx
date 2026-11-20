import { Ionicons } from "@expo/vector-icons";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useRef, useState } from "react";
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
import { HOSTED_SERVER_URL, isHostedServer } from "@/lib/config";
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
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(
    isEdit || (Boolean(serverUrl) && !isHostedServer(serverUrl)),
  );

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
    if (busyRef.current) return;
    busyRef.current = true;
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
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function handleHosted() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await testServerConnection(HOSTED_SERVER_URL);
      await setServerUrl(HOSTED_SERVER_URL);
      router.replace("/login");
    } catch (err) {
      setError(formatError(err));
    } finally {
      busyRef.current = false;
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
            {manualOpen ? "Connect your dashboard" : "How do you use it?"}
          </AppText>
          <AppText muted style={styles.center}>
            {manualOpen
              ? "Point the app at your Open Print Dashboard server. It works on your LAN or over the internet when the backend has a public HTTPS URL."
              : "Use the hosted service or connect your own self-hosted server. The same app supports both."}
          </AppText>
        </View>

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

        {!manualOpen ? (
          <View style={styles.choices}>
            <Card style={styles.choiceCard}>
              <View
                style={[
                  styles.choiceIcon,
                  { backgroundColor: `${theme.colors.accent}18` },
                ]}
              >
                <Ionicons
                  name="cloud-outline"
                  size={22}
                  color={theme.colors.accentText}
                />
              </View>
              <AppText variant="heading">OpenPrintDash Cloud</AppText>
              <AppText muted style={styles.choiceText}>
                Sign in with the email and password from your subscription. We
                run the server, updates and backups.
              </AppText>
              <AppButton
                title="Continue with Cloud"
                loading={busy}
                onPress={handleHosted}
              />
            </Card>

            <Card style={styles.choiceCard}>
              <View
                style={[
                  styles.choiceIcon,
                  { backgroundColor: theme.colors.surfaceAlt },
                ]}
              >
                <Ionicons
                  name="server-outline"
                  size={22}
                  color={theme.colors.text}
                />
              </View>
              <AppText variant="heading">My own server</AppText>
              <AppText muted style={styles.choiceText}>
                Already self-hosting? Enter your server URL and sign in with
                the account on that server.
              </AppText>
              <AppButton
                title="Use my own server"
                variant="secondary"
                onPress={() => setManualOpen(true)}
              />
            </Card>
          </View>
        ) : (
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

            {!isEdit ? (
              <AppButton
                title="Use OpenPrintDash Cloud instead"
                variant="ghost"
                size="sm"
                onPress={() => {
                  setError(null);
                  setManualOpen(false);
                }}
              />
            ) : null}
          </Card>
        )}

        <View style={styles.hintRow}>
          <Ionicons
            name="shield-checkmark-outline"
            size={16}
            color={theme.colors.muted}
          />
          <AppText variant="caption" muted style={styles.hintText}>
            On iOS and Android, tokens are stored in the device&apos;s secure
            storage. The app never sends your password anywhere except the
            server you choose.
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
  choices: {
    gap: spacing.md,
  },
  choiceCard: {
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: radius.xl,
    borderCurve: "continuous",
  },
  choiceIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.lg,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  choiceText: {
    lineHeight: 20,
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
