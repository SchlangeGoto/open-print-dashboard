import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppButton } from "@/components/ui/app-button";
import { AppText } from "@/components/ui/app-text";
import { Card } from "@/components/ui/card";
import { PageHeader, Screen } from "@/components/ui/screen";
import { TextField } from "@/components/ui/text-field";
import { useAsyncData } from "@/hooks/use-async-data";
import { useAuth } from "@/lib/auth";
import { formatError } from "@/lib/format";
import { spacing, useTheme } from "@/lib/theme";
import type { Spool } from "@/lib/types";

interface FormState {
  total: string;
  remaining: string;
  price: string;
  notes: string;
}

function fromSpool(spool: Spool): FormState {
  return {
    total: String(spool.total_weight_g),
    remaining: spool.remaining_unknown ? "" : String(spool.remaining_g),
    price: spool.price_per_kg != null ? String(spool.price_per_kg) : "",
    notes: spool.notes ?? "",
  };
}

function parseNumber(value: string): { value: number | null; invalid: boolean } {
  const raw = value.trim().replace(",", ".");
  if (!raw) return { value: null, invalid: false };
  const parsed = Number(raw);
  return Number.isFinite(parsed)
    ? { value: parsed, invalid: false }
    : { value: null, invalid: true };
}

export default function EditSpoolScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const loader = useCallback(async () => {
    if (!id) throw new Error("Spool not found");
    return api.getSpool(id);
  }, [api, id]);
  const { data, loading, error, reload } = useAsyncData(loader);

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + spacing.xxxl },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <PageHeader
            title="Edit spool"
            subtitle="Correct the weight after a partial print or a manual measurement."
            left={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={8}
                onPress={() => router.back()}
                style={[
                  styles.iconButton,
                  { backgroundColor: theme.colors.surfaceAlt },
                ]}
              >
                <Ionicons name="close" size={20} color={theme.colors.text} />
              </Pressable>
            }
          />

          {error ? (
            <Card style={styles.section}>
              <AppText variant="body">Couldn&apos;t load this spool.</AppText>
              <AppText variant="caption" muted>
                {error}
              </AppText>
              <AppButton title="Try again" size="sm" onPress={reload} />
            </Card>
          ) : null}

          {data ? (
            <SpoolEditForm spool={data} />
          ) : (
            !error &&
            loading && (
              <AppText variant="caption" muted>
                Loading…
              </AppText>
            )
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function SpoolEditForm({ spool }: { spool: Spool }) {
  const { api } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const [form, setForm] = useState<FormState>(() => fromSpool(spool));
  const [initial] = useState<FormState>(() => fromSpool(spool));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function patch(values: Partial<FormState>) {
    setForm((current) => ({ ...current, ...values }));
  }

  async function save() {
    const total = parseNumber(form.total);
    const remaining = parseNumber(form.remaining);
    const price = parseNumber(form.price);
    if (total.invalid || total.value == null || total.value <= 0) {
      setError("Enter a spool weight greater than zero.");
      return;
    }
    if (remaining.invalid) {
      setError("Remaining weight must be a valid number.");
      return;
    }
    if (
      remaining.value != null &&
      (remaining.value < 0 || remaining.value > total.value)
    ) {
      setError("Remaining weight must be between 0 and the spool weight.");
      return;
    }
    if (price.invalid) {
      setError("Price must be a valid number, or empty to clear it.");
      return;
    }
    const weights: Record<string, number> = {};
    if (form.total !== initial.total) {
      weights.total_weight_g = total.value;
    }
    if (form.remaining !== initial.remaining && remaining.value != null) {
      weights.remaining_g = remaining.value;
    }
    setSaving(true);
    setError(null);
    try {
      await api.updateSpool(spool.id, {
        ...weights,
        ...(weights.remaining_g != null
          ? { remaining_unknown: false }
          : {}),
        price_per_kg: price.value,
        notes: form.notes.trim() || null,
      });
      router.back();
    } catch (err) {
      setError(formatError(err));
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    if (deleting) return;
    Alert.alert(
      "Delete this spool?",
      "Print history keeps its recorded weight and cost.",
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            setDeleting(true);
            setError(null);
            api
              .deleteSpool(spool.id)
              .then(() => {
                router.dismissAll();
                router.replace("/spools");
              })
              .catch((err) => setError(formatError(err)))
              .finally(() => setDeleting(false));
          },
        },
      ],
    );
  }

  return (
    <>
      <Card style={styles.section}>
        <AppText variant="heading">Weight</AppText>
        <TextField
          label="Spool weight (g)"
          value={form.total}
          onChangeText={(total) => patch({ total })}
          keyboardType="decimal-pad"
        />
        <TextField
          label="Remaining (g)"
          value={form.remaining}
          onChangeText={(remaining) => patch({ remaining })}
          keyboardType="decimal-pad"
          placeholder={spool.remaining_unknown ? "Unknown" : "0"}
          hint={
            spool.remaining_unknown
              ? "Leave empty to keep the weight unknown."
              : "Enter what is actually left on the roll."
          }
        />
      </Card>

      <Card style={styles.section}>
        <AppText variant="heading">Purchase</AppText>
        <TextField
          label="Price / kg (€)"
          value={form.price}
          onChangeText={(price) => patch({ price })}
          keyboardType="decimal-pad"
          placeholder="24.99"
          hint="Only this spool. New spools use the filament default."
        />
      </Card>

      <Card style={styles.section}>
        <AppText variant="heading">Notes</AppText>
        <TextField
          label="Notes"
          value={form.notes}
          onChangeText={(notes) => patch({ notes })}
          multiline
          placeholder="Optional"
        />
      </Card>

      {error ? (
        <AppText variant="caption" color={theme.colors.danger}>
          {error}
        </AppText>
      ) : null}

      <AppButton
        title="Save changes"
        loading={saving}
        disabled={deleting}
        onPress={() => void save()}
      />
      <AppButton
        title="Delete spool"
        variant="danger"
        loading={deleting}
        disabled={saving}
        onPress={confirmDelete}
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    gap: spacing.lg,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  section: {
    gap: spacing.md,
  },
});
