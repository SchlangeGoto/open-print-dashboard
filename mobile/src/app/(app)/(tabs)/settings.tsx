import { Ionicons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  DevSettings,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppButton } from "@/components/ui/app-button";
import { AppText } from "@/components/ui/app-text";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DiagnosticRow } from "@/components/diagnostic-row";
import { PageHeader, Screen } from "@/components/ui/screen";
import { testServerConnection } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { getBuildInfo } from "@/lib/build-info";
import { formatError, getInitials } from "@/lib/format";
import { TAB_BAR_HEIGHT } from "@/lib/layout";
import { radius, spacing, useTheme } from "@/lib/theme";

export default function SettingsScreen() {
  const { user, serverUrl, logout } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<
    { ok: boolean; message: string } | null
  >(null);

  const version = Constants.expoConfig?.version ?? "0.1.0";
  const build = getBuildInfo();
  const diagnostics = [
    `Open Print Dashboard ${version}`,
    `Build: ${build.buildTag}`,
    `Runtime: ${build.runtime}`,
    `Execution environment: ${build.executionEnvironment}`,
    `Platform: ${build.platform} ${build.osVersion}`,
    `Expo Go: ${build.expoGoVersion ?? "Not available"}`,
    `Expo SDK: ${build.sdkVersion ?? "Not available"}`,
    `Metro host: ${build.metroHost ?? "Not available"}`,
  ].join("\n");

  async function handleTestConnection() {
    if (!serverUrl) return;
    setTesting(true);
    setTestResult(null);
    try {
      await testServerConnection(serverUrl);
      setTestResult({ ok: true, message: "Server is reachable." });
    } catch (err) {
      setTestResult({ ok: false, message: formatError(err) });
    } finally {
      setTesting(false);
    }
  }

  function handleShareDiagnostics() {
    void Share.share({ message: diagnostics });
  }

  function handleLogout() {
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm("Sign out?")) {
        void logout();
      }
      return;
    }
    Alert.alert(
      "Sign out?",
      "You will need your password the next time you sign in.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: () => {
            void logout();
          },
        },
      ],
    );
  }

  return (
    <Screen>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.content,
          {
            paddingBottom: insets.bottom + TAB_BAR_HEIGHT + spacing.xxxl,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <PageHeader brand title="Settings" subtitle="Account and connection" />

        <Card style={styles.accountCard}>
          <View
            style={[
              styles.avatar,
              { backgroundColor: `${theme.colors.accent}18` },
            ]}
          >
            <AppText variant="heading" color={theme.colors.accentText}>
              {getInitials(user?.full_name, user?.email)}
            </AppText>
          </View>
          <View style={styles.accountText}>
            <AppText variant="heading" numberOfLines={1}>
              {user?.full_name || "Dashboard user"}
            </AppText>
            <AppText variant="caption" muted numberOfLines={1}>
              {user?.email}
            </AppText>
          </View>
          {user?.is_superuser ? (
            <Badge label="Admin" variant="accent" />
          ) : null}
        </Card>

        <Card style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitle}>
              <View
                style={[
                  styles.iconWrap,
                  { backgroundColor: `${theme.colors.info}18` },
                ]}
              >
                <Ionicons
                  name="server-outline"
                  size={18}
                  color={theme.colors.info}
                />
              </View>
              <AppText variant="heading">Server</AppText>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: "/server-setup",
                  params: { edit: "1" },
                })
              }
            >
              <AppText variant="caption" color={theme.colors.accentText}>
                Change
              </AppText>
            </Pressable>
          </View>

          <AppText variant="mono" muted numberOfLines={2} selectable>
            {serverUrl}
          </AppText>

          <AppButton
            title="Test connection"
            variant="secondary"
            size="sm"
            loading={testing}
            onPress={handleTestConnection}
            icon={
              <Ionicons
                name="pulse-outline"
                size={16}
                color={theme.colors.text}
              />
            }
          />

          {testResult ? (
            <View style={styles.testRow}>
              <Ionicons
                name={
                  testResult.ok
                    ? "checkmark-circle"
                    : "alert-circle-outline"
                }
                size={16}
                color={
                  testResult.ok
                    ? theme.colors.success
                    : theme.colors.danger
                }
              />
              <AppText
                variant="caption"
                color={
                  testResult.ok
                    ? theme.colors.success
                    : theme.colors.danger
                }
                style={styles.testText}
              >
                {testResult.message}
              </AppText>
            </View>
          ) : null}
        </Card>

        <Card style={styles.section}>
          <View style={styles.sectionTitle}>
            <View
              style={[
                styles.iconWrap,
                { backgroundColor: `${theme.colors.success}18` },
              ]}
            >
              <Ionicons
                name="shield-checkmark-outline"
                size={18}
                color={theme.colors.success}
              />
            </View>
            <AppText variant="heading">Session</AppText>
          </View>
          <AppText muted style={styles.bodyText}>
            Access tokens are short-lived and refresh automatically. You stay
            signed in across app restarts until you sign out or the refresh
            token expires.
          </AppText>
        </Card>

        <Card style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitle}>
              <View
                style={[
                  styles.iconWrap,
                  { backgroundColor: `${theme.colors.accent}18` },
                ]}
              >
                <Ionicons
                  name="construct-outline"
                  size={18}
                  color={theme.colors.accentText}
                />
              </View>
              <AppText variant="heading">App & build</AppText>
            </View>
            <AppText variant="mono" color={theme.colors.accentText} selectable>
              {build.buildTag}
            </AppText>
          </View>

          <AppText variant="caption" muted style={styles.bodyText}>
            If this tag is not the latest one, the phone is still running an old
            JS bundle. Share the diagnostics if you need a second pair of eyes.
          </AppText>

          <View style={styles.diagnostics}>
            <DiagnosticRow label="Version" value={`v${version}`} />
            <DiagnosticRow
              label="Platform"
              value={`${build.platform} ${build.osVersion}`}
            />
            <DiagnosticRow label="Runtime" value={build.runtime} />
            <DiagnosticRow
              label="Metro host"
              value={build.metroHost ?? "Not connected"}
            />
            <DiagnosticRow
              label="SDK"
              value={build.sdkVersion ?? "Not available"}
            />
          </View>

          <AppButton
            title="Share diagnostics"
            variant="secondary"
            size="sm"
            onPress={handleShareDiagnostics}
          />
          {__DEV__ ? (
            <AppButton
              title="Reload JS"
              variant="ghost"
              size="sm"
              onPress={() => DevSettings.reload()}
            />
          ) : null}
        </Card>

        <Card style={styles.section}>
          <View style={styles.sectionTitle}>
            <View
              style={[
                styles.iconWrap,
                { backgroundColor: `${theme.colors.warning}18` },
              ]}
            >
              <Ionicons
                name="information-circle-outline"
                size={18}
                color={theme.colors.warning}
              />
            </View>
            <AppText variant="heading">About</AppText>
          </View>
          <View style={styles.aboutRow}>
            <AppText variant="body" muted>
              Open Print Dashboard
            </AppText>
            <AppText variant="caption" muted>
              v{version}
            </AppText>
          </View>
          <AppText variant="caption" muted style={styles.bodyText}>
            Native client for your self-hosted Bambu Lab dashboard.
          </AppText>
        </Card>

        <AppButton
          title="Sign out"
          variant="danger"
          onPress={handleLogout}
          icon={
            <Ionicons
              name="log-out-outline"
              size={18}
              color={theme.colors.danger}
            />
          }
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  accountCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: radius.xl,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  accountText: {
    flex: 1,
    gap: 2,
  },
  section: {
    gap: spacing.md,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: radius.lg,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  diagnostics: {
    gap: spacing.sm,
  },
  testRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  testText: {
    flex: 1,
    lineHeight: 18,
  },
  bodyText: {
    lineHeight: 21,
  },
  aboutRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});
