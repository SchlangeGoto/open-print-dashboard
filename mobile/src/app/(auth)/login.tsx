import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import { useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";

import { BrandMark } from "@/components/brand-mark";
import { AppButton } from "@/components/ui/app-button";
import { AppText } from "@/components/ui/app-text";
import { Card } from "@/components/ui/card";
import { TextField } from "@/components/ui/text-field";
import { useAuth } from "@/lib/auth";
import { formatError } from "@/lib/format";
import { radius, spacing, useTheme } from "@/lib/theme";

export default function LoginScreen() {
  const { status, serverUrl, login } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "needs-server") {
    return <Redirect href="/server-setup" />;
  }
  if (status === "unreachable") {
    return <Redirect href="/connection-error" />;
  }
  if (status === "authenticated") {
    return <Redirect href="/" />;
  }

  async function handleLogin() {
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    Keyboard.dismiss();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      router.replace("/");
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
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <BrandMark size={64} />
        <View style={styles.heading}>
          <AppText variant="display" style={styles.center}>
            Welcome back
          </AppText>
          <AppText muted style={styles.center}>
            Sign in to manage spools, printers, and filament.
          </AppText>
        </View>

        <Card style={styles.card}>
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
          />
          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={handleLogin}
            right={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  showPassword ? "Hide password" : "Show password"
                }
                onPress={() => setShowPassword((value) => !value)}
                hitSlop={10}
              >
                <Ionicons
                  name={showPassword ? "eye-off-outline" : "eye-outline"}
                  size={20}
                  color={theme.colors.faint}
                />
              </Pressable>
            }
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

          <AppButton title="Sign in" loading={busy} onPress={handleLogin} />
        </Card>

        <View style={styles.serverRow}>
          <AppText variant="caption" faint>
            {serverUrl ?? "No server configured"}
          </AppText>
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: "/server-setup",
                params: { edit: "1" },
              })
            }
          >
            <AppText variant="caption" color={theme.colors.accent}>
              Change server
            </AppText>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxxl,
    justifyContent: "center",
    gap: spacing.xl,
  },
  heading: {
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  center: {
    textAlign: "center",
  },
  card: {
    gap: spacing.lg,
    padding: spacing.xl,
    borderRadius: radius.xl,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  errorText: {
    flex: 1,
    lineHeight: 18,
  },
  serverRow: {
    alignItems: "center",
    gap: spacing.xs,
  },
});
