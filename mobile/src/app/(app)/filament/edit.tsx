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
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppButton } from "@/components/ui/app-button";
import { AppText } from "@/components/ui/app-text";
import { Card } from "@/components/ui/card";
import { PageHeader, Screen } from "@/components/ui/screen";
import { TextField } from "@/components/ui/text-field";
import { useAsyncData } from "@/hooks/use-async-data";
import { useAuth } from "@/lib/auth";
import { formatError, normalizeHex } from "@/lib/format";
import { spacing, useTheme } from "@/lib/theme";
import type { Filament } from "@/lib/types";

interface FormState {
  brand: string;
  material: string;
  series: string;
  colorName: string;
  colorHex: string;
  spoolWeight: string;
  defaultPrice: string;
  nozzleMin: string;
  nozzleMax: string;
  bedTemp: string;
  notes: string;
}

function fromFilament(filament: Filament): FormState {
  return {
    brand: filament.brand,
    material: filament.material,
    series: filament.series ?? "",
    colorName: filament.color_name,
    colorHex: filament.color_hex,
    spoolWeight: String(filament.spool_weight_g),
    defaultPrice:
      filament.default_price_per_kg != null
        ? String(filament.default_price_per_kg)
        : "",
    nozzleMin:
      filament.nozzle_temp_min != null ? String(filament.nozzle_temp_min) : "",
    nozzleMax:
      filament.nozzle_temp_max != null ? String(filament.nozzle_temp_max) : "",
    bedTemp: filament.bed_temp != null ? String(filament.bed_temp) : "",
    notes: filament.notes ?? "",
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

export default function EditFilamentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const loader = useCallback(async () => {
    if (!id) throw new Error("Filament not found");
    return api.getFilament(id);
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
            title="Edit filament"
            subtitle="Changes apply to this material, not to spools already recorded."
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
              <AppText variant="body">Couldn&apos;t load this filament.</AppText>
              <AppText variant="caption" muted>
                {error}
              </AppText>
              <AppButton title="Try again" size="sm" onPress={reload} />
            </Card>
          ) : null}

          {data ? (
            <FilamentEditForm filament={data} />
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

function FilamentEditForm({ filament }: { filament: Filament }) {
  const { api } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const [form, setForm] = useState<FormState>(() => fromFilament(filament));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function patch(values: Partial<FormState>) {
    setForm((current) => ({ ...current, ...values }));
  }

  async function save() {
    const colorHex = normalizeHex(form.colorHex);
    if (!form.brand.trim() || !form.material.trim() || !form.colorName.trim()) {
      setError("Brand, material and colour name are required.");
      return;
    }
    if (!colorHex) {
      setError("Enter a colour like #1A2B3C.");
      return;
    }
    const spoolWeight = parseNumber(form.spoolWeight);
    const defaultPrice = parseNumber(form.defaultPrice);
    const nozzleMin = parseNumber(form.nozzleMin);
    const nozzleMax = parseNumber(form.nozzleMax);
    const bedTemp = parseNumber(form.bedTemp);
    if (
      spoolWeight.invalid ||
      spoolWeight.value == null ||
      spoolWeight.value <= 0
    ) {
      setError("Spool weight must be a number greater than zero.");
      return;
    }
    if (
      defaultPrice.invalid ||
      nozzleMin.invalid ||
      nozzleMax.invalid ||
      bedTemp.invalid
    ) {
      setError("Prices and temperatures must be valid numbers.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.updateFilament(filament.id, {
        brand: form.brand.trim(),
        material: form.material.trim(),
        series: form.series.trim() || null,
        color_name: form.colorName.trim(),
        color_hex: colorHex,
        spool_weight_g: spoolWeight.value,
        default_price_per_kg: defaultPrice.value,
        nozzle_temp_min: nozzleMin.value,
        nozzle_temp_max: nozzleMax.value,
        bed_temp: bedTemp.value,
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
      "Delete this filament?",
      "Every spool of this filament is deleted too. Print history keeps its weight and cost.",
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            setDeleting(true);
            setError(null);
            api
              .deleteFilament(filament.id)
              .then(() => {
                router.dismissAll();
                router.replace("/filaments");
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
        <AppText variant="heading">Filament</AppText>
        <TextField
          label="Brand"
          value={form.brand}
          onChangeText={(brand) => patch({ brand })}
          autoCapitalize="words"
        />
        <TextField
          label="Material"
          value={form.material}
          onChangeText={(material) => patch({ material })}
          autoCapitalize="characters"
        />
        <TextField
          label="Series"
          value={form.series}
          onChangeText={(series) => patch({ series })}
          placeholder="Optional"
        />
        <TextField
          label="Colour name"
          value={form.colorName}
          onChangeText={(colorName) => patch({ colorName })}
          autoCapitalize="words"
        />
        <TextField
          label="Colour hex"
          value={form.colorHex}
          onChangeText={(colorHex) => patch({ colorHex })}
          autoCapitalize="characters"
          placeholder="#1A2B3C"
        />
      </Card>

      <Card style={styles.section}>
        <AppText variant="heading">Packaging and price</AppText>
        <TextField
          label="Spool weight (g)"
          value={form.spoolWeight}
          onChangeText={(spoolWeight) => patch({ spoolWeight })}
          keyboardType="decimal-pad"
        />
        <TextField
          label="Default price / kg (€)"
          value={form.defaultPrice}
          onChangeText={(defaultPrice) => patch({ defaultPrice })}
          keyboardType="decimal-pad"
          placeholder="24.99"
          hint="Used for new and scanned spools until changed."
        />
      </Card>

      <Card style={styles.section}>
        <AppText variant="heading">Print settings</AppText>
        <View style={styles.pair}>
          <View style={styles.pairItem}>
            <TextField
              label="Nozzle min °C"
              value={form.nozzleMin}
              onChangeText={(nozzleMin) => patch({ nozzleMin })}
              keyboardType="number-pad"
            />
          </View>
          <View style={styles.pairItem}>
            <TextField
              label="Nozzle max °C"
              value={form.nozzleMax}
              onChangeText={(nozzleMax) => patch({ nozzleMax })}
              keyboardType="number-pad"
            />
          </View>
        </View>
        <TextField
          label="Bed °C"
          value={form.bedTemp}
          onChangeText={(bedTemp) => patch({ bedTemp })}
          keyboardType="number-pad"
        />
        <TextField
          label="Notes"
          value={form.notes}
          onChangeText={(notes) => patch({ notes })}
          multiline
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
        title="Delete filament"
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
  pair: {
    flexDirection: "row",
    gap: spacing.md,
  },
  pairItem: {
    flex: 1,
  },
});
