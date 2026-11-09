import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
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
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CloseButton } from "@/components/close-button";
import { PageHeader, Screen } from "@/components/ui/screen";
import { TextField } from "@/components/ui/text-field";
import { useAuth } from "@/lib/auth";
import {
  COLOR_PRESETS,
  DEFAULT_COLOR_HEX,
  HEX_COLOR_EXAMPLE,
} from "@/lib/color-presets";
import { formatError, isLightColor, normalizeHex } from "@/lib/format";
import { parseSuggestion } from "@/lib/suggested-filament";
import { radius, spacing, useTheme } from "@/lib/theme";

export default function ScanConfirmScreen() {
  const { code, suggested } = useLocalSearchParams<{
    code?: string;
    suggested?: string;
  }>();
  const { api } = useAuth();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const suggestion = useMemo(() => parseSuggestion(suggested), [suggested]);

  const detectedSeries = suggestion?.series ?? null;
  const [brand, setBrand] = useState(suggestion ? "Bambu Lab" : "");
  const [material, setMaterial] = useState(
    detectedSeries ? detectedSeries.split(" ")[0] : "",
  );
  const [colorName, setColorName] = useState("");
  const [colorHex, setColorHex] = useState(DEFAULT_COLOR_HEX);
  const [weight, setWeight] = useState(
    String(suggestion?.spool_weight_g ?? 1000),
  );
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!code) {
    return (
      <Screen>
        <View style={styles.content}>
          <PageHeader
            title="New filament"
            left={<CloseButton onPress={() => router.back()} />}
          />
          <AppText muted>
            No barcode was provided. Scan a filament box first.
          </AppText>
        </View>
      </Screen>
    );
  }

  async function handleCreate() {
    if (!code) return;
    const normalizedHex = normalizeHex(colorHex);
    const weightValue = Number(weight.replace(",", "."));
    const priceValue = price.trim()
      ? Number(price.replace(",", "."))
      : undefined;

    if (!brand.trim() || !material.trim() || !colorName.trim()) {
      setError("Fill in the brand, material, and colour name.");
      return;
    }
    if (!normalizedHex) {
      setError(`Enter a valid hex colour, for example ${HEX_COLOR_EXAMPLE}.`);
      return;
    }
    if (!Number.isFinite(weightValue) || weightValue <= 0) {
      setError("Enter a spool weight greater than 0.");
      return;
    }
    if (priceValue !== undefined && (!Number.isFinite(priceValue) || priceValue < 0)) {
      setError("Enter a valid price, or leave it empty.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await api.confirmBarcode(
        code,
        {
          brand: brand.trim(),
          material: material.trim(),
          color_name: colorName.trim(),
          color_hex: normalizedHex,
          spool_weight_g: weightValue,
        },
        weightValue,
        priceValue,
      );
      await Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      );
      if (result.spool) {
        router.replace({
          pathname: "/spool/[id]",
          params: { id: result.spool.id },
        });
      } else {
        router.back();
      }
    } catch (err) {
      setError(formatError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + spacing.xxxl },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <PageHeader
            title="New filament"
            subtitle={`Barcode ${code}`}
            left={<CloseButton onPress={() => router.back()} />}
            right={<Badge label="Unknown" variant="warning" />}
          />

          {detectedSeries ? (
            <View
              style={[
                styles.detected,
                {
                  backgroundColor: `${theme.colors.info}12`,
                  borderColor: `${theme.colors.info}44`,
                },
              ]}
            >
              <Ionicons
                name="sparkles-outline"
                size={17}
                color={theme.colors.info}
              />
              <AppText variant="caption" color={theme.colors.info}>
                Detected Bambu series: {detectedSeries}
              </AppText>
            </View>
          ) : null}

          <Card style={styles.card}>
            <AppText variant="heading">Filament</AppText>
            <TextField
              label="Brand"
              value={brand}
              onChangeText={setBrand}
              placeholder="Bambu Lab"
              autoCapitalize="words"
            />
            <TextField
              label="Material"
              value={material}
              onChangeText={setMaterial}
              placeholder="PLA"
              autoCapitalize="characters"
            />
            <TextField
              label="Colour name"
              value={colorName}
              onChangeText={setColorName}
              placeholder="Mandarin Orange"
              autoCapitalize="words"
            />
          </Card>

          <Card style={styles.card}>
            <View style={styles.sectionTitle}>
              <AppText variant="heading">Colour</AppText>
              <View
                style={[
                  styles.preview,
                  {
                    backgroundColor:
                      normalizeHex(colorHex) ?? theme.colors.muted,
                    borderColor: theme.colors.border,
                  },
                ]}
              />
            </View>
            <TextField
              label="Hex colour"
              value={colorHex}
              onChangeText={setColorHex}
              placeholder={HEX_COLOR_EXAMPLE}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <View style={styles.presets}>
              {COLOR_PRESETS.map((preset) => {
                const selected =
                  normalizeHex(colorHex)?.toUpperCase() === preset.hex;
                return (
                  <Pressable
                    key={preset.hex}
                    accessibilityRole="button"
                    accessibilityLabel={preset.name}
                    accessibilityState={{ selected }}
                    onPress={() => setColorHex(preset.hex)}
                    style={[
                      styles.preset,
                      {
                        backgroundColor: preset.hex,
                        borderColor: selected
                          ? theme.colors.accent
                          : theme.colors.border,
                        borderWidth: selected ? 3 : StyleSheet.hairlineWidth,
                      },
                    ]}
                  >
                    {selected ? (
                      <Ionicons
                        name="checkmark"
                        size={16}
                        color={
                          isLightColor(preset.hex)
                            ? theme.colors.mediaInk
                            : theme.colors.mediaPaper
                        }
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </Card>

          <Card style={styles.card}>
            <AppText variant="heading">Spool</AppText>
            <View style={styles.row}>
              <View style={styles.half}>
                <TextField
                  label="Net weight (g)"
                  value={weight}
                  onChangeText={setWeight}
                  keyboardType="decimal-pad"
                  placeholder="1000"
                />
              </View>
              <View style={styles.half}>
                <TextField
                  label="Price / kg"
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="decimal-pad"
                  placeholder="Optional"
                />
              </View>
            </View>
          </Card>

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
            title="Create filament & spool"
            size="lg"
            loading={busy}
            onPress={handleCreate}
            icon={
              <Ionicons
                name="add"
                size={20}
                color={theme.colors.onAccent}
              />
            }
          />
          <AppText variant="caption" muted style={styles.footer}>
            This barcode is saved with the filament, so scanning it again will
            add another spool automatically.
          </AppText>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  detected: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    borderCurve: "continuous",
    padding: spacing.md,
  },
  card: {
    gap: spacing.md,
  },
  sectionTitle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  preview: {
    width: 35,
    height: 35,
    borderRadius: radius.md,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
  },
  presets: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  preset: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    gap: spacing.md,
  },
  half: {
    flex: 1,
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
  footer: {
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: spacing.md,
  },
});
