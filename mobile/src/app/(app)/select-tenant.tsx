import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/ui/app-text";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader, Screen } from "@/components/ui/screen";
import { useAuth } from "@/lib/auth";
import { radius, spacing, useTheme } from "@/lib/theme";

export default function SelectTenantScreen() {
  const { tenants, activeTenantId, switchTenant, logout } = useAuth();
  const router = useRouter();
  const theme = useTheme();

  async function choose(tenantId: string) {
    await switchTenant(tenantId);
    router.replace("/");
  }

  return (
    <Screen>
      <View style={styles.content}>
        <PageHeader
          brand
          title="Choose a tenant"
          subtitle="Pick the workspace you want to open"
        />

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

        <Pressable
          accessibilityRole="button"
          onPress={() => void logout()}
          style={styles.signOut}
        >
          <AppText variant="caption" color={theme.colors.faint}>
            Sign out
          </AppText>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
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
