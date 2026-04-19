import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import apiClient from "../api/client";

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

type Tab = "unlabeled" | "labeled";

const SPECIALTY_META: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string }> = {
  cardiology: { icon: "heart-outline", color: "#E84545", bg: "#FFF0F0" },
  diabetes: { icon: "water-outline", color: "#3B82F6", bg: "#EFF6FF" },
  thyroid: { icon: "pulse-outline", color: "#10B981", bg: "#ECFDF5" },
};

function getSpecialtyMeta(specialty: string) {
  return SPECIALTY_META[specialty.toLowerCase()] || {
    icon: "medical-outline" as const,
    color: "#64748B",
    bg: "#F8FAFC",
  };
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getConfidence(probabilities: Record<string, number>) {
  const values = Object.values(probabilities || {}).filter(
    (value): value is number => typeof value === "number",
  );

  if (!values.length) {
    return null;
  }

  return Math.round(Math.max(...values) * 100);
}

function PredictionCard({
  item,
  onPress,
}: {
  item: PredictionItem;
  onPress: () => void;
}) {
  const meta = getSpecialtyMeta(item.specialty);
  const confidence = getConfidence(item.probabilities);
  const isLabeled = Boolean(item.groundTruth);
  const isCorrect = item.groundTruth?.isPredictionCorrect === true;
  const isIncorrect = item.groundTruth?.isPredictionCorrect === false;

  return (
    <TouchableOpacity activeOpacity={0.82} onPress={onPress} style={styles.card}>
      <View
        style={[
          styles.cardAccent,
          {
            backgroundColor: isLabeled
              ? isCorrect
                ? "#10B981"
                : "#EF4444"
              : meta.color,
          },
        ]}
      />
      <View style={[styles.iconWrap, { backgroundColor: meta.bg }]}>
        <Ionicons name={meta.icon} size={20} color={meta.color} />
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardSpecialty}>{item.specialty.toUpperCase()}</Text>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {item.predictedLabel}
        </Text>
        <Text style={styles.cardSubtitle}>{formatDate(item.createdAt)}</Text>
      </View>
      <View style={styles.cardRight}>
        {!isLabeled && <View style={styles.pendingDot} />}
        {isLabeled ? (
          <View
            style={[
              styles.truthBadge,
              {
                backgroundColor: isCorrect ? "#ECFDF5" : "#FEF2F2",
              },
            ]}
          >
            <Ionicons
              name={isCorrect ? "checkmark-circle" : "close-circle"}
              size={13}
              color={isCorrect ? "#10B981" : "#EF4444"}
            />
            <Text
              style={[
                styles.truthBadgeText,
                { color: isCorrect ? "#10B981" : "#EF4444" },
              ]}
            >
              {isCorrect ? "True" : isIncorrect ? "False" : "Labeled"}
            </Text>
          </View>
        ) : confidence != null ? (
          <View style={[styles.confidenceBadge, { backgroundColor: meta.bg }]}>
            <Text style={[styles.confidenceText, { color: meta.color }]}>
              {confidence}%
            </Text>
          </View>
        ) : null}
        <Ionicons name="chevron-forward" size={16} color="#C5CBD5" />
      </View>
    </TouchableOpacity>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  const isUnlabeled = tab === "unlabeled";

  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconWrap}>
        <Ionicons
          name={isUnlabeled ? "time-outline" : "checkmark-done-outline"}
          size={32}
          color="#B6BEC9"
        />
      </View>
      <Text style={styles.emptyTitle}>
        {isUnlabeled ? "No unlabeled predictions" : "No labeled predictions yet"}
      </Text>
      <Text style={styles.emptySubtitle}>
        {isUnlabeled
          ? "Run a new AI prediction from chat and it will appear here for review."
          : "After you mark a prediction as true or false, it will move here automatically."}
      </Text>
    </View>
  );
}

export default function PredictionsScreen() {
  const { getToken } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("unlabeled");
  const [items, setItems] = useState<PredictionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadPredictions = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        const token = await getToken();
        const response = await apiClient.get("/api/predictions", {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        setItems(response.data?.items || []);
      } catch (error: any) {
        console.error("Failed to load predictions", error);
        Alert.alert(
          "Predictions unavailable",
          error?.response?.data?.message || "Could not load your predictions right now.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [getToken],
  );

  useFocusEffect(
    useCallback(() => {
      loadPredictions();
    }, [loadPredictions]),
  );

  const unlabeledItems = useMemo(
    () => items.filter((item) => !item.groundTruth),
    [items],
  );
  const labeledItems = useMemo(
    () => items.filter((item) => Boolean(item.groundTruth)),
    [items],
  );

  const visibleItems = tab === "unlabeled" ? unlabeledItems : labeledItems;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Predictions</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.summaryBar}>
        <View style={styles.summaryBlock}>
          <Text style={[styles.summaryValue, { color: "#D97706" }]}>
            {unlabeledItems.length}
          </Text>
          <Text style={styles.summaryLabel}>Pending</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryBlock}>
          <Text style={[styles.summaryValue, { color: "#10B981" }]}>
            {labeledItems.length}
          </Text>
          <Text style={styles.summaryLabel}>Labeled</Text>
        </View>
        <View style={styles.summaryDivider} />
        <View style={styles.summaryBlock}>
          <Text style={[styles.summaryValue, { color: "#2563EB" }]}>
            {items.length}
          </Text>
          <Text style={styles.summaryLabel}>Total</Text>
        </View>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tabButton, tab === "unlabeled" && styles.tabButtonActive]}
          activeOpacity={0.8}
          onPress={() => setTab("unlabeled")}
        >
          <Text
            style={[styles.tabButtonText, tab === "unlabeled" && styles.tabButtonTextActive]}
          >
            Unlabeled
          </Text>
          {unlabeledItems.length > 0 && <View style={styles.pendingDotSmall} />}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, tab === "labeled" && styles.tabButtonActive]}
          activeOpacity={0.8}
          onPress={() => setTab("labeled")}
        >
          <Text
            style={[styles.tabButtonText, tab === "labeled" && styles.tabButtonTextActive]}
          >
            Labeled
          </Text>
          <View style={styles.trueFalsePreview}>
            <View style={[styles.previewBadge, { backgroundColor: "#ECFDF5" }]}>
              <Text style={[styles.previewBadgeText, { color: "#10B981" }]}>T</Text>
            </View>
            <View style={[styles.previewBadge, { backgroundColor: "#FEF2F2" }]}>
              <Text style={[styles.previewBadgeText, { color: "#EF4444" }]}>F</Text>
            </View>
          </View>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadPredictions(true)}
              tintColor="#2563EB"
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {visibleItems.length ? (
            visibleItems.map((item) => (
              <PredictionCard
                key={item.id}
                item={item}
                onPress={() =>
                  router.push({
                    pathname: "/prediction-detail",
                    params: {
                      id: String(item.id),
                    },
                  })
                }
              />
            ))
          ) : (
            <EmptyState tab={tab} />
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F4F7FB" },
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
  summaryBar: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 16,
    backgroundColor: "#fff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E8EDF5",
  },
  summaryBlock: { flex: 1, alignItems: "center" },
  summaryValue: { fontSize: 22, fontWeight: "700" },
  summaryLabel: { fontSize: 12, color: "#7B8794", marginTop: 2 },
  summaryDivider: { width: 1, backgroundColor: "#EEF2F6" },
  tabs: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 10,
    padding: 4,
    borderRadius: 16,
    backgroundColor: "#EAF0F8",
  },
  tabButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 12,
  },
  tabButtonActive: { backgroundColor: "#fff" },
  tabButtonText: { fontSize: 13, fontWeight: "600", color: "#6B7280" },
  tabButtonTextActive: { color: "#111827" },
  pendingDotSmall: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: "#F59E0B",
  },
  trueFalsePreview: { flexDirection: "row", gap: 4 },
  previewBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  previewBadgeText: { fontSize: 10, fontWeight: "700" },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 12, paddingBottom: 40 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E9EDF4",
    overflow: "hidden",
  },
  cardAccent: { width: 5, alignSelf: "stretch" },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 14,
    marginRight: 12,
  },
  cardBody: { flex: 1, paddingVertical: 14 },
  cardSpecialty: {
    fontSize: 10,
    fontWeight: "700",
    color: "#98A2B3",
    letterSpacing: 0.7,
    marginBottom: 3,
  },
  cardTitle: { fontSize: 15, fontWeight: "600", color: "#111827" },
  cardSubtitle: { fontSize: 12, color: "#8A94A6", marginTop: 4 },
  cardRight: {
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 8,
    paddingRight: 14,
  },
  pendingDot: {
    width: 9,
    height: 9,
    borderRadius: 999,
    backgroundColor: "#F59E0B",
  },
  confidenceBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  confidenceText: { fontSize: 12, fontWeight: "700" },
  truthBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  truthBadgeText: { fontSize: 11, fontWeight: "700" },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    paddingHorizontal: 28,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E9EDF5",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1F2937",
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 13,
    lineHeight: 20,
    color: "#8A94A6",
    textAlign: "center",
    marginTop: 8,
  },
});
