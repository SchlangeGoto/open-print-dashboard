import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  RefreshControl,
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
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, Screen } from "@/components/ui/screen";
import { ShelfRule } from "@/components/ui/shelf-rule";
import { StatReadout } from "@/components/ui/stat-readout";
import { TextField } from "@/components/ui/text-field";
import { useAsyncData } from "@/hooks/use-async-data";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { TAB_BAR_HEIGHT } from "@/lib/layout";
import { radius, spacing, useTheme } from "@/lib/theme";
import type {
  TenantInvite,
  TenantInviteCreated,
  TenantMember,
} from "@/lib/types";

const ROLES = ["owner", "admin", "operator", "viewer"] as const;
const INVITE_ROLES = ["admin", "operator", "viewer"] as const;

interface MembersData {
  members: TenantMember[];
  invites: TenantInvite[];
}

function roleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export default function MembersScreen() {
  const { api, tenants, activeTenantId } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const tenant = tenants.find((item) => item.id === activeTenantId);
  const canManage = tenant?.role === "owner" || tenant?.role === "admin";

  const [selected, setSelected] = useState<TenantMember | null>(null);
  const [selectedRole, setSelectedRole] = useState("viewer");
  const [saving, setSaving] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [inviteBusy, setInviteBusy] = useState(false);
  const [createdInvite, setCreatedInvite] =
    useState<TenantInviteCreated | null>(null);

  const loader = useCallback(async (): Promise<MembersData> => {
    const [members, invites] = await Promise.all([
      api.getTenantMembers(),
      api.getTenantInvites(),
    ]);
    return { members, invites };
  }, [api]);

  const { data, loading, refreshing, error, reload, refresh } =
    useAsyncData(loader);

  const counts = useMemo(() => {
    const members = data?.members ?? [];
    return {
      total: members.length,
      admins: members.filter(
        (member) => member.role === "owner" || member.role === "admin",
      ).length,
      invites: data?.invites.length ?? 0,
    };
  }, [data]);

  function openMember(member: TenantMember) {
    setSelected(member);
    setSelectedRole(member.role);
  }

  async function saveRole() {
    if (!selected) return;
    setSaving(true);
    try {
      await api.updateTenantMember(selected.user_id, selectedRole);
      setSelected(null);
      await reload();
    } catch (err) {
      Alert.alert(
        "Could not change role",
        err instanceof Error ? err.message : "Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  function confirmRemove() {
    if (!selected) return;
    const member = selected;
    Alert.alert(
      `Remove ${member.full_name || member.email}?`,
      "They lose access to this workspace. Their account is not deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            void api
              .removeTenantMember(member.user_id)
              .then(async () => {
                setSelected(null);
                await reload();
              })
              .catch((err) => {
                Alert.alert(
                  "Could not remove member",
                  err instanceof Error ? err.message : "Try again.",
                );
              });
          },
        },
      ],
    );
  }

  async function createInvite() {
    if (!inviteEmail.trim()) return;
    setInviteBusy(true);
    setCreatedInvite(null);
    try {
      const created = await api.createTenantInvite(
        inviteEmail.trim(),
        inviteRole,
      );
      setCreatedInvite(created);
      setInviteEmail("");
      await reload();
    } catch (err) {
      Alert.alert(
        "Could not invite",
        err instanceof Error ? err.message : "Try again.",
      );
    } finally {
      setInviteBusy(false);
    }
  }

  async function revokeInvite(invite: TenantInvite) {
    try {
      await api.revokeTenantInvite(invite.id);
      await reload();
    } catch (err) {
      Alert.alert(
        "Could not revoke invite",
        err instanceof Error ? err.message : "Try again.",
      );
    }
  }

  if (!canManage) {
    return (
      <Screen>
        <View style={styles.emptyWrap}>
          <EmptyState
            icon="lock-closed-outline"
            title="Members are admin-only"
            description="Ask a workspace owner or admin to manage people."
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
          title="Members"
          subtitle={tenant?.name ?? "Workspace access"}
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
              title="Invite"
              size="sm"
              onPress={() => {
                setCreatedInvite(null);
                setInviteOpen(true);
              }}
            />
          }
        />

        <StatReadout
          stats={[
            { value: data ? String(counts.total) : "...", label: "Members" },
            { value: data ? String(counts.admins) : "...", label: "Admins" },
            { value: data ? String(counts.invites) : "...", label: "Invites" },
          ]}
        />

        {error ? (
          <Card style={styles.errorCard}>
            <AppText variant="body">Couldn&apos;t load members.</AppText>
            <AppText variant="caption" muted>
              {error}
            </AppText>
            <AppButton title="Try again" size="sm" onPress={reload} />
          </Card>
        ) : null}

        <View style={styles.section}>
          <AppText variant="label" muted>
            People
          </AppText>
          {loading && !data ? (
            <Card>
              <AppText variant="caption" muted>
                Loading members…
              </AppText>
            </Card>
          ) : (
            <Card style={styles.listCard}>
              {(data?.members ?? []).map((member, index) => (
                <View key={member.user_id}>
                  {index > 0 ? <ShelfRule /> : null}
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => openMember(member)}
                    style={styles.memberRow}
                  >
                    <View style={styles.memberText}>
                      <AppText variant="body" numberOfLines={1}>
                        {member.full_name || member.email}
                      </AppText>
                      <AppText variant="micro" muted numberOfLines={1}>
                        {member.email}
                      </AppText>
                    </View>
                    <Badge
                      label={roleLabel(member.role)}
                      variant={
                        member.role === "owner" ? "accent" : "neutral"
                      }
                    />
                    <Ionicons
                      name="chevron-forward"
                      size={17}
                      color={theme.colors.faint}
                    />
                  </Pressable>
                </View>
              ))}
            </Card>
          )}
        </View>

        <View style={styles.section}>
          <AppText variant="label" muted>
            Pending invites
          </AppText>
          {(data?.invites ?? []).length ? (
            <Card style={styles.listCard}>
              {(data?.invites ?? []).map((invite, index) => (
                <View key={invite.id}>
                  {index > 0 ? <ShelfRule /> : null}
                  <View style={styles.inviteRow}>
                    <View style={styles.memberText}>
                      <AppText variant="body" numberOfLines={1}>
                        {invite.email}
                      </AppText>
                      <AppText variant="micro" muted>
                        {roleLabel(invite.role)} · expires{" "}
                        {formatDate(invite.expires_at)}
                      </AppText>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => void revokeInvite(invite)}
                    >
                      <AppText variant="caption" color={theme.colors.danger}>
                        Revoke
                      </AppText>
                    </Pressable>
                  </View>
                </View>
              ))}
            </Card>
          ) : (
            <Card>
              <AppText variant="caption" muted>
                No pending invitations.
              </AppText>
            </Card>
          )}
        </View>
      </ScrollView>

      <Modal
        transparent
        visible={Boolean(selected)}
        animationType="fade"
        onRequestClose={() => setSelected(null)}
      >
        <Pressable style={styles.backdrop} onPress={() => setSelected(null)} />
        <View style={styles.sheet}>
          <Card style={styles.sheetCard}>
            <AppText variant="heading" numberOfLines={1}>
              {selected?.full_name || selected?.email}
            </AppText>
            <AppText variant="caption" muted>
              {selected?.email}
            </AppText>
            <View style={styles.roles}>
              {ROLES.map((role) => {
                const active = role === selectedRole;
                return (
                  <Pressable
                    key={role}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setSelectedRole(role)}
                    style={[
                      styles.roleChip,
                      {
                        borderColor: active
                          ? theme.colors.accent
                          : theme.colors.border,
                        backgroundColor: active
                          ? `${theme.colors.accent}18`
                          : "transparent",
                      },
                    ]}
                  >
                    <AppText
                      variant="caption"
                      color={
                        active ? theme.colors.accentText : theme.colors.muted
                      }
                    >
                      {roleLabel(role)}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.sheetActions}>
              <AppButton
                title="Remove"
                variant="ghost"
                size="sm"
                onPress={confirmRemove}
              />
              <AppButton
                title="Save role"
                size="sm"
                loading={saving}
                onPress={() => void saveRole()}
              />
            </View>
          </Card>
        </View>
      </Modal>

      <Modal
        transparent
        visible={inviteOpen}
        animationType="slide"
        onRequestClose={() => setInviteOpen(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setInviteOpen(false)}
        />
        <View style={styles.sheet}>
          <Card style={styles.sheetCard}>
            <AppText variant="heading">Invite a member</AppText>
            <AppText variant="caption" muted>
              They keep their account and gain access to this workspace.
            </AppText>
            <TextField
              label="Email"
              value={inviteEmail}
              onChangeText={setInviteEmail}
              placeholder="person@example.com"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />
            <View style={styles.roles}>
              {INVITE_ROLES.map((role) => {
                const active = role === inviteRole;
                return (
                  <Pressable
                    key={role}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setInviteRole(role)}
                    style={[
                      styles.roleChip,
                      {
                        borderColor: active
                          ? theme.colors.accent
                          : theme.colors.border,
                        backgroundColor: active
                          ? `${theme.colors.accent}18`
                          : "transparent",
                      },
                    ]}
                  >
                    <AppText
                      variant="caption"
                      color={
                        active ? theme.colors.accentText : theme.colors.muted
                      }
                    >
                      {roleLabel(role)}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
            {createdInvite?.accept_url ? (
              <View style={styles.inviteLink}>
                <AppText variant="caption" muted>
                  Email delivery is off. Share this one-time link:
                </AppText>
                <AppText variant="monoSmall" selectable>
                  {createdInvite.accept_url}
                </AppText>
                <AppButton
                  title="Share link"
                  size="sm"
                  variant="secondary"
                  onPress={() =>
                    void Share.share({ message: createdInvite.accept_url! })
                  }
                />
              </View>
            ) : null}
            <View style={styles.sheetActions}>
              <AppButton
                title="Close"
                variant="ghost"
                size="sm"
                onPress={() => setInviteOpen(false)}
              />
              <AppButton
                title="Send invite"
                size="sm"
                loading={inviteBusy}
                onPress={() => void createInvite()}
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
  section: {
    gap: spacing.md,
  },
  listCard: {
    paddingVertical: spacing.xs,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  inviteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  memberText: {
    flex: 1,
    gap: 2,
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
  roles: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  roleChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  sheetActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  inviteLink: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: "#3f3f46",
  },
});
