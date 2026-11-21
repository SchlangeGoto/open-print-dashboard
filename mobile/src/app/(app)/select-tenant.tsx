import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppButton } from "@/components/ui/app-button";
import { AppText } from "@/components/ui/app-text";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, Screen } from "@/components/ui/screen";
import { useAuth } from "@/lib/auth";
import { radius, spacing, useTheme } from "@/lib/theme";

export default function SelectTenantScreen() {
  const {
    tenants,
    activeTenantId,
    switchTenant,
    refreshTenants,
    logout,
  } = useAuth();
  const activeTenants = tenants.filter((tenant) => tenant.is_active);
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);

  async function checkAgain() {
    setChecking(true);
    try {
      await refreshTenants();
      setChecked(true);
    } finally {
      setChecking(false);
    }
  }
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  async function choose(tenantId: string) {
    await switchTenant(tenantId);
    router.replace("/");
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + spacing.xxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <PageHeader
          brand
          title="Choose a tenant"
          subtitle="Pick the workspace you want to open"
        />

        {activeTenants.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title="No workspace access"
            description={
              checked
                ? "Still no workspace access. Ask an administrator to invite you."
                : "Ask an administrator to invite you to a workspace, then check again."
            }
            action={
              <AppButton
                title="Check again"
                variant="secondary"
                loading={checking}
                onPress={() => void checkAgain()}
              />
            }
          />
        ) : (
        <View style={styles.list}>
          {tenants.map((tenant) => (
            <Pressable
              key={tenant.id}
              accessibilityRole="button"
              accessibilityState={{
                selected: tenant.id === activeTenantId,
                disabled: !tenant.is_active,
              }}
              disabled={!tenant.is_active}
              onPress={() => void choose(tenant.id)}
            >
              <Card style={styles.row}>
                <View
                  style={[
                    styles.iconWrap,
                    { backgroundColor: `${theme.colors.accent}18` },
                  ]}
                >
                  <Ionicons
                    name="business-outline"
                    size={20}
                    color={theme.colors.accentText}
                  />
                </View>
                <View style={styles.text}>
                  <AppText variant="heading" numberOfLines={1}>
                    {tenant.name}
                  </AppText>
                  <AppText variant="caption" muted numberOfLines={1}>
                    {tenant.slug}
                  </AppText>
                </View>
                <Badge label={tenant.role} variant="accent" />
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={theme.colors.faint}
                />
              </Card>
            </Pressable>
          ))}
        </View>
        )}

        <Pressable
          accessibilityRole="button"
          onPress={() => void logout()}
          style={styles.signOut}
        >
          <AppText variant="caption" color={theme.colors.faint}>
            Sign out
          </AppText>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    gap: spacing.xl,
  },
  list: {
    gap: spacing.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: radius.lg,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    flex: 1,
    gap: 2,
  },
  signOut: {
    alignSelf: "center",
    padding: spacing.md,
  },
});
