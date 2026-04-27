import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import apiClient from "../api/client";
import HospitalRecommendationPopup from "../components/HospitalRecommendationPopup";

type GroundTruth = {
  id: number;
  predictionEventId: number;
  actualLabel: string;
  actualValue: number | null;
  labelSource: string | null;
  isPredictionCorrect: boolean | null;
  enteredByClerkUserId: string | null;
  createdAt: string;
};

type PredictionItem = {
  id: number;
  chatSessionId: string | null;
  modelVersionId: number | null;
  specialty: string;
  predictedLabel: string;
  predictedValue: number | null;
  probabilities: Record<string, number>;
  inputPayload: Record<string, unknown>;
  responsePayload: Record<string, unknown>;
  latencyMs: number | null;
  createdAt: string;
  groundTruth: GroundTruth | null;
};

const SPECIALTY_META: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }> = {
  cardiology: { icon: "heart", color: "#E84545", bg: "#FFF0F0" },
  diabetes: { icon: "water", color: "#3B82F6", bg: "#EFF6FF" },
  thyroid: { icon: "pulse", color: "#10B981", bg: "#ECFDF5" },
};

function getSpecialtyMeta(specialty: string) {
  return SPECIALTY_META[specialty.toLowerCase()] || {
    icon: "medical" as const,
    color: "#64748B",
    bg: "#F8FAFC",
  };
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toTitleCase(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatValue(value: unknown) {
  if (value == null) return "-";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function isPredictionUnhealthy(item: PredictionItem | null) {
  if (!item) return false;

  if (typeof item.predictedValue === "number") {
    if (item.specialty.toLowerCase() === "cardiology") return item.predictedValue > 0;
    return item.predictedValue === 1;
  }

  const label = (item.predictedLabel || "").toLowerCase();
  if (!label) return false;

  if (label.includes("healthy") || label.includes("negative") || label.includes("no disease")) {
    return false;
  }

  return (
    label.includes("disease") ||
    label.includes("positive") ||
    label.includes("risk") ||
    label.includes("abnormal") ||
    label.includes("unhealthy")
  );
}

function resolveRecommendationSpecialty(item: PredictionItem | null) {
  const specialty = (item?.specialty || "").toLowerCase();
  if (specialty === "cardiology") return "cardiology";
  if (specialty === "diabetes") return "diabetologist";
  if (specialty === "thyroid") return "endocrinologist";
  return "general hospital";
}

function ProbabilityBar({
  label,
  value,
  color,
  highlight,
}: {
  label: string;
  value: number;
  color: string;
  highlight: boolean;
}) {
  const widthAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: value,
      duration: 700,
      useNativeDriver: false,
    }).start();
  }, [value, widthAnim]);

  const width = widthAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  return (
    <View style={styles.probabilityRow}>
      <Text style={[styles.probabilityLabel, highlight && styles.probabilityLabelActive]}>
        {toTitleCase(label)}
      </Text>
      <View style={styles.probabilityTrack}>
        <Animated.View
          style={[
            styles.probabilityFill,
            {
              width: width as any,
              backgroundColor: highlight ? color : "#CBD5E1",
            },
          ]}
        />
      </View>
      <Text style={[styles.probabilityValue, highlight && { color }]}>
        {Math.round(value * 100)}%
      </Text>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function ConfirmSheet({
  visible,
  choice,
  loading,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  choice: boolean | null;
  loading: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const translateY = useRef(new Animated.Value(280)).current;

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: visible ? 0 : 280,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [translateY, visible]);

  if (!visible || choice == null) return null;

  const isTrue = choice;

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          <View style={styles.sheetHandle} />
          <View
            style={[
              styles.sheetIconWrap,
              { backgroundColor: isTrue ? "#ECFDF5" : "#FEF2F2" },
            ]}
          >
            <Ionicons
              name={isTrue ? "checkmark-circle" : "close-circle"}
              size={34}
              color={isTrue ? "#10B981" : "#EF4444"}
            />
          </View>
          <Text style={styles.sheetTitle}>
            {isTrue ? "Confirm true prediction?" : "Confirm false prediction?"}
          </Text>
          <Text style={styles.sheetText}>
            {isTrue
              ? "This will mark the prediction as correct and move it to the labeled tab."
              : "This will mark the prediction as incorrect and move it to the labeled tab."}
          </Text>
          <TouchableOpacity
            style={[
              styles.sheetPrimaryButton,
              { backgroundColor: isTrue ? "#10B981" : "#EF4444" },
            ]}
            activeOpacity={0.85}
            onPress={onConfirm}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.sheetPrimaryButtonText}>Confirm</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.sheetSecondaryButton} activeOpacity={0.75} onPress={onClose}>
            <Text style={styles.sheetSecondaryButtonText}>Cancel</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

export default function PredictionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getToken } = useAuth();
  const router = useRouter();
  const [item, setItem] = useState<PredictionItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [sheetChoice, setSheetChoice] = useState<boolean | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [wantsRecommendations, setWantsRecommendations] = useState<boolean | null>(null);
  const [showRecommendationPopup, setShowRecommendationPopup] = useState(false);

  const loadPrediction = useCallback(async () => {
    try {
      setLoading(true);
      const token = await getToken();
      const response = await apiClient.get(`/api/predictions/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      setItem(response.data?.item || null);
    } catch (error: any) {
      console.error("Failed to load prediction detail", error);
      Alert.alert(
        "Prediction unavailable",
        error?.response?.data?.message || "Could not load this prediction.",
      );
      router.back();
    } finally {
      setLoading(false);
    }
  }, [getToken, id, router]);

  useEffect(() => {
    loadPrediction();
  }, [loadPrediction]);

  const probabilityEntries = useMemo(() => {
    const pairs = Object.entries(item?.probabilities || {}).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number",
    );
    return pairs;
  }, [item?.probabilities]);

  const highestProbability = useMemo(() => {
    return probabilityEntries.reduce((max, [, value]) => Math.max(max, value), 0);
  }, [probabilityEntries]);

  const readOnly = Boolean(item?.groundTruth);
  const meta = getSpecialtyMeta(item?.specialty || "");
  const showRecommendationPrompt = isPredictionUnhealthy(item);
  const recommendationSpecialty = resolveRecommendationSpecialty(item);

  useEffect(() => {
    setWantsRecommendations(null);
    setShowRecommendationPopup(false);
  }, [item?.id]);

  const submitLabel = useCallback(async () => {
    if (!item || sheetChoice == null) return;

    try {
      setSubmitting(true);
      const token = await getToken();
      await apiClient.post(
        `/api/predictions/${item.id}/ground-truth`,
        { isPredictionCorrect: sheetChoice },
        {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        },
      );
      setSheetVisible(false);
      router.back();
    } catch (error: any) {
      console.error("Failed to label prediction", error);
      Alert.alert(
        "Could not save label",
        error?.response?.data?.message || "Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [getToken, item, router, sheetChoice]);

  if (loading || !item) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Prediction Detail</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.heroCard, { borderTopColor: meta.color }]}>
          <View style={[styles.heroIconWrap, { backgroundColor: meta.bg }]}>
            <Ionicons name={meta.icon} size={28} color={meta.color} />
          </View>
          <Text style={styles.heroSpecialty}>{item.specialty.toUpperCase()}</Text>
          <Text style={styles.heroTitle}>{item.predictedLabel}</Text>
          <Text style={styles.heroMeta}>{formatDate(item.createdAt)}</Text>

          {readOnly ? (
            <View
              style={[
                styles.readOnlyBadge,
                {
                  backgroundColor:
                    item.groundTruth?.isPredictionCorrect === true ? "#ECFDF5" : "#FEF2F2",
                },
              ]}
            >
              <Ionicons
                name={
                  item.groundTruth?.isPredictionCorrect === true
                    ? "checkmark-circle"
                    : "close-circle"
                }
                size={15}
                color={item.groundTruth?.isPredictionCorrect === true ? "#10B981" : "#EF4444"}
              />
              <Text
                style={[
                  styles.readOnlyBadgeText,
                  {
                    color:
                      item.groundTruth?.isPredictionCorrect === true ? "#10B981" : "#EF4444",
                  },
                ]}
              >
                {item.groundTruth?.isPredictionCorrect === true
                  ? "Marked as True Prediction"
                  : "Marked as False Prediction"}
              </Text>
            </View>
          ) : (
            <View style={styles.pendingBadge}>
              <View style={styles.pendingDot} />
              <Text style={styles.pendingText}>Awaiting your review</Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Model Confidence</Text>
          {probabilityEntries.length ? (
            probabilityEntries.map(([label, value]) => (
              <ProbabilityBar
                key={label}
                label={label}
                value={value}
                color={meta.color}
                highlight={value === highestProbability}
              />
            ))
          ) : (
            <Text style={styles.emptySectionText}>No probability breakdown was recorded.</Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Input Parameters</Text>
          {Object.entries(item.inputPayload || {}).map(([key, value]) => (
            <InfoRow key={key} label={toTitleCase(key)} value={formatValue(value)} />
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Prediction Info</Text>
          <InfoRow label="Prediction ID" value={`#${item.id}`} />
          <InfoRow label="Specialty" value={item.specialty} />
          <InfoRow label="Model Version" value={item.modelVersionId ? String(item.modelVersionId) : "-"} />
          <InfoRow label="Latency" value={item.latencyMs != null ? `${item.latencyMs} ms` : "-"} />
        </View>

        {item.groundTruth && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Label</Text>
            <InfoRow label="Result" value={item.groundTruth.isPredictionCorrect ? "True Prediction" : "False Prediction"} />
            <InfoRow label="Stored Label" value={item.groundTruth.actualLabel} />
            <InfoRow label="Labeled On" value={formatDate(item.groundTruth.createdAt)} />
          </View>
        )}

        <View style={styles.helperNote}>
          <Ionicons name="information-circle-outline" size={14} color="#94A3B8" />
          <Text style={styles.helperNoteText}>
            Your feedback is saved into the labeled dataset and removed from the unlabeled queue.
          </Text>
        </View>

        {showRecommendationPrompt && (
          <View style={styles.recommendationSection}>
            <View style={styles.recommendationHeader}>
              <View style={styles.recommendationIconWrap}>
                <Ionicons name="medkit-outline" size={20} color="#0F766E" />
              </View>
              <View style={styles.recommendationHeaderText}>
                <Text style={styles.recommendationTitle}>Recommend nearby hospital?</Text>
                <Text style={styles.recommendationSubtitle}>
                  If you want, MedVise can use your live location to find the nearest {recommendationSpecialty}.
                </Text>
              </View>
            </View>

            {wantsRecommendations == null && (
              <View style={styles.recommendationActions}>
                <TouchableOpacity
                  style={styles.recommendNoButton}
                  activeOpacity={0.84}
                  onPress={() => setWantsRecommendations(false)}
                >
                  <Text style={styles.recommendNoButtonText}>No</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.recommendYesButton}
                  activeOpacity={0.84}
                  onPress={() => {
                    setWantsRecommendations(true);
                    setShowRecommendationPopup(true);
                  }}
                >
                  <Ionicons name="location-outline" size={18} color="#fff" />
                  <Text style={styles.recommendYesButtonText}>Yes, find nearby</Text>
                </TouchableOpacity>
              </View>
            )}

            {wantsRecommendations === false && (
              <Text style={styles.recommendDismissedText}>
                You can still use the prediction details above and consult a clinician if symptoms worsen.
              </Text>
            )}

            {wantsRecommendations && (
              <View style={styles.recommendationResultWrap}>
                <Text style={styles.locationResolvedText}>
                  MedVise will use your live device location in the next step to find nearby {recommendationSpecialty}.
                </Text>
                <TouchableOpacity
                  style={styles.openRecommendationsButton}
                  activeOpacity={0.84}
                  onPress={() => setShowRecommendationPopup(true)}
                >
                  <Ionicons name="medkit-outline" size={18} color="#FFFFFF" />
                  <Text style={styles.openRecommendationsButtonText}>
                    View nearby options
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {!readOnly && (
          <View style={styles.footerButtons}>
            <TouchableOpacity
              style={styles.falseButton}
              activeOpacity={0.84}
              onPress={() => {
                setSheetChoice(false);
                setSheetVisible(true);
              }}
            >
              <Ionicons name="close-circle-outline" size={20} color="#EF4444" />
              <Text style={styles.falseButtonText}>False Prediction</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.trueButton}
              activeOpacity={0.84}
              onPress={() => {
                setSheetChoice(true);
                setSheetVisible(true);
              }}
            >
              <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
              <Text style={styles.trueButtonText}>True Prediction</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <ConfirmSheet
        visible={sheetVisible}
        choice={sheetChoice}
        loading={submitting}
        onConfirm={submitLabel}
        onClose={() => {
          if (!submitting) setSheetVisible(false);
        }}
      />

      <HospitalRecommendationPopup
        isVisible={showRecommendationPopup}
        specialty={recommendationSpecialty}
        onClose={() => setShowRecommendationPopup(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F4F7FB" },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 0.5,
    borderBottomColor: "#E9EDF2",
  },
  backBtn: { width: 40, alignItems: "flex-start", justifyContent: "center" },
  headerTitle: { fontSize: 16, fontWeight: "600", color: "#111827" },
  headerSpacer: { width: 40 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 14, paddingBottom: 36 },
  heroCard: {
    backgroundColor: "#fff",
    borderRadius: 22,
    borderTopWidth: 4,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E9EDF4",
  },
  heroIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  heroSpecialty: {
    fontSize: 11,
    fontWeight: "700",
    color: "#98A2B3",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  heroTitle: {
    fontSize: 21,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
  },
  heroMeta: { fontSize: 12, color: "#8A94A6", marginTop: 6 },
  pendingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    backgroundColor: "#FFFBEB",
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginTop: 16,
  },
  pendingDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: "#F59E0B",
  },
  pendingText: { fontSize: 12, fontWeight: "700", color: "#D97706" },
  readOnlyBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginTop: 16,
  },
  readOnlyBadgeText: { fontSize: 12, fontWeight: "700" },
  section: {
    backgroundColor: "#fff",
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#E9EDF4",
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: "#98A2B3",
    letterSpacing: 0.7,
    marginBottom: 10,
  },
  probabilityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  probabilityLabel: { width: 92, fontSize: 12, color: "#64748B" },
  probabilityLabelActive: { fontWeight: "700", color: "#111827" },
  probabilityTrack: {
    flex: 1,
    height: 9,
    borderRadius: 999,
    backgroundColor: "#E2E8F0",
    overflow: "hidden",
  },
  probabilityFill: { height: "100%", borderRadius: 999 },
  probabilityValue: { width: 42, textAlign: "right", fontSize: 12, fontWeight: "600", color: "#64748B" },
  emptySectionText: { fontSize: 13, color: "#8A94A6" },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 10,
    borderBottomWidth: 0.5,
    borderBottomColor: "#EDF2F7",
  },
  infoLabel: { flex: 1, fontSize: 13, color: "#64748B", paddingRight: 16 },
  infoValue: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
    textAlign: "right",
  },
  helperNote: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 4,
    alignItems: "flex-start",
  },
  helperNoteText: { flex: 1, fontSize: 12, lineHeight: 18, color: "#94A3B8" },
  recommendationSection: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#DDEFEA",
    padding: 16,
  },
  recommendationHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  recommendationIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#E6FFFB",
    alignItems: "center",
    justifyContent: "center",
  },
  recommendationHeaderText: { flex: 1 },
  recommendationTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  recommendationSubtitle: {
    fontSize: 13,
    lineHeight: 20,
    color: "#64748B",
    marginTop: 4,
  },
  recommendationActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  recommendNoButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },
  recommendNoButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#475569",
  },
  recommendYesButton: {
    flex: 1.5,
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: "#0F766E",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  recommendYesButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  recommendDismissedText: {
    marginTop: 16,
    fontSize: 13,
    lineHeight: 20,
    color: "#64748B",
  },
  recommendationResultWrap: { marginTop: 16 },
  locationResolvedText: {
    fontSize: 13,
    lineHeight: 20,
    color: "#475569",
    marginBottom: 12,
  },
  openRecommendationsButton: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: "#0F766E",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  openRecommendationsButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  footerButtons: { flexDirection: "row", gap: 12, marginTop: 2 },
  falseButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 54,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#EF4444",
    backgroundColor: "#FEF2F2",
  },
  falseButtonText: { fontSize: 14, fontWeight: "700", color: "#EF4444" },
  trueButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 54,
    borderRadius: 16,
    backgroundColor: "#10B981",
  },
  trueButtonText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  sheetOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.35)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    alignItems: "center",
  },
  sheetHandle: {
    width: 38,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#D8DEE8",
    marginBottom: 20,
  },
  sheetIconWrap: {
    width: 70,
    height: 70,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
  },
  sheetText: {
    fontSize: 13,
    lineHeight: 20,
    color: "#64748B",
    textAlign: "center",
    marginTop: 10,
    marginBottom: 24,
  },
  sheetPrimaryButton: {
    width: "100%",
    minHeight: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetPrimaryButtonText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  sheetSecondaryButton: { paddingVertical: 14 },
  sheetSecondaryButtonText: { fontSize: 14, fontWeight: "600", color: "#64748B" },
});
