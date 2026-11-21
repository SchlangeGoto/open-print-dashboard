import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppButton } from "@/components/ui/app-button";
import { AppText } from "@/components/ui/app-text";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, Screen } from "@/components/ui/screen";
import { ShelfRule } from "@/components/ui/shelf-rule";
import { TextField } from "@/components/ui/text-field";
import { useAsyncData } from "@/hooks/use-async-data";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { TAB_BAR_HEIGHT } from "@/lib/layout";
import { radius, spacing, useTheme } from "@/lib/theme";
import type { TenantSummary } from "@/lib/types";

export default function TenantsScreen() {
  const { api, user, switchTenant, refreshTenants, activeTenantId } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loader = useCallback(async (): Promise<TenantSummary[]> => {
    return api.getTenants();
  }, [api]);

  const { data, loading, refreshing, error, reload, refresh } =
    useAsyncData(loader);

  async function create() {
    if (!name.trim() || !slug.trim()) return;
    setBusy(true);
    try {
      await api.createTenant(name.trim(), slug.trim());
      setName("");
      setSlug("");
      setCreateOpen(false);
      await reload();
      await refreshTenants();
    } catch (err) {
      Alert.alert(
        "Could not create tenant",
        err instanceof Error ? err.message : "Try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  function toggle(tenant: TenantSummary) {
    const next = !tenant.is_active;
    const run = () => {
      setBusyId(tenant.id);
      void api
        .updateTenant(tenant.id, { is_active: next })
        .then(async () => {
          await reload();
          await refreshTenants();
        })
        .catch((err) => {
          Alert.alert(
            "Could not update tenant",
            err instanceof Error ? err.message : "Try again.",
          );
        })
        .finally(() => setBusyId(null));
    };
    if (next) {
      run();
      return;
    }
    Alert.alert(
      `Deactivate ${tenant.name}?`,
      "Members lose access and the printers disconnect. The data is kept.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Deactivate", style: "destructive", onPress: run },
      ],
    );
  }

  if (!user?.is_superuser) {
    return (
      <Screen>
        <View style={styles.emptyWrap}>
          <EmptyState
            icon="lock-closed-outline"
            title="Platform admins only"
            description="Only the operator of this deployment can manage tenants."
            action={<AppButton title="Back" onPress={() => router.back()} />}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + TAB_BAR_HEIGHT + spacing.xxxl },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={theme.colors.accentText}
            colors={[theme.colors.accentText]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <PageHeader
          title="Tenants"
          subtitle="Workspaces on this deployment"
          left={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={8}
              onPress={() => router.back()}
              style={[
                styles.backButton,
                { backgroundColor: theme.colors.surfaceAlt },
              ]}
            >
              <Ionicons
                name="chevron-back"
                size={20}
                color={theme.colors.text}
              />
            </Pressable>
          }
          right={
            <AppButton
              title="Create"
              size="sm"
              onPress={() => setCreateOpen(true)}
            />
          }
        />

        {error ? (
          <Card style={styles.errorCard}>
            <AppText variant="body">Couldn&apos;t load tenants.</AppText>
            <AppText variant="caption" muted>
              {error}
            </AppText>
            <AppButton title="Try again" size="sm" onPress={reload} />
          </Card>
        ) : null}

        {loading && !data ? (
          <Card>
            <AppText variant="caption" muted>
              Loading tenants…
            </AppText>
          </Card>
        ) : (
          <Card style={styles.listCard}>
            {(data ?? []).map((tenant, index) => (
              <View key={tenant.id}>
                {index > 0 ? <ShelfRule /> : null}
                <View style={styles.tenantRow}>
                  <View style={styles.tenantText}>
                    <View style={styles.tenantTitle}>
                      <AppText variant="body" numberOfLines={1}>
                        {tenant.name}
                      </AppText>
                      <Badge
                        label={tenant.is_active ? "Active" : "Inactive"}
                        variant={tenant.is_active ? "success" : "neutral"}
                      />
                    </View>
                    <AppText variant="micro" muted numberOfLines={1}>
                      {tenant.slug} · created {formatDate(tenant.created_at)}
                    </AppText>
                    <View style={styles.tenantActions}>
                      <AppButton
                        title={
                          tenant.id === activeTenantId ? "Current" : "Open"
                        }
                        size="sm"
                        variant="secondary"
                        disabled={!tenant.is_active}
                        onPress={() => switchTenant(tenant.id)}
                      />
                      <AppButton
                        title={tenant.is_active ? "Deactivate" : "Activate"}
                        size="sm"
                        variant={tenant.is_active ? "ghost" : "secondary"}
                        loading={busyId === tenant.id}
                        disabled={tenant.slug === "default"}
                        onPress={() => toggle(tenant)}
                      />
                    </View>
                  </View>
                </View>
              </View>
            ))}
          </Card>
        )}
      </ScrollView>

      <Modal
        transparent
        visible={createOpen}
        animationType="slide"
        onRequestClose={() => setCreateOpen(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setCreateOpen(false)}
        />
        <View style={styles.sheet}>
          <Card style={styles.sheetCard}>
            <AppText variant="heading">Create a tenant</AppText>
            <AppText variant="caption" muted>
              The workspace starts empty. Invite its owner afterwards.
            </AppText>
            <TextField
              label="Name"
              value={name}
              onChangeText={setName}
              placeholder="Acme"
            />
            <TextField
              label="Slug"
              value={slug}
              onChangeText={(value) => setSlug(value.toLowerCase())}
              placeholder="acme"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.sheetActions}>
              <AppButton
                title="Cancel"
                variant="ghost"
                size="sm"
                onPress={() => setCreateOpen(false)}
              />
              <AppButton
                title="Create"
                size="sm"
                loading={busy}
                onPress={() => void create()}
              />
            </View>
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    gap: spacing.xl,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: radius.lg,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  errorCard: {
    gap: spacing.sm,
  },
  listCard: {
    paddingVertical: spacing.xs,
  },
  tenantRow: {
    paddingVertical: spacing.md,
  },
  tenantText: {
    gap: spacing.sm,
  },
  tenantTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  tenantActions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.xl,
  },
  backdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "#00000088",
  },
  sheet: {
    flex: 1,
    justifyContent: "flex-end",
    padding: spacing.lg,
  },
  sheetCard: {
    gap: spacing.md,
  },
  sheetActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
