import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
    Modal,
    Pressable,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import apiClient from "../../api/client";

type Metrics = {
  specialty: string | null;
  modelName: string | null;
  versionTag: string | null;
  accuracy: number;
  precision: number;
  recall: number;
  falseAlarmRate: number;
  totalPredictions: number;
  sampleSize: number;
  windowStart: string | null;
  windowEnd: string | null;
  lastUpdated: string | null;
  note?: string;
  schemaReady?: boolean;
};

const MODEL_OPTIONS = [
  { key: "cardiology", label: "Cardiology", subtitle: "Heart disease model" },
  { key: "diabetes", label: "Diabetes", subtitle: "Endocrine risk model" },
  { key: "thyroid", label: "Thyroid", subtitle: "Thyroid disorder model" },
] as const;

type ModelKey = (typeof MODEL_OPTIONS)[number]["key"];

export default function MetricsScreen() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<ModelKey>("cardiology");
  const [showModelModal, setShowModelModal] = useState(false);

  const fetchMetrics = async () => {
    if (!isLoaded) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (!isSignedIn) {
        throw new Error("You must sign in before accessing admin data.");
      }

      const token = await getToken();
      if (!token) {
        throw new Error("No Clerk session token was available for this request.");
      }

      const res = await apiClient.get("/api/admin/metrics", {
        params: {
          specialty: selectedModel,
        },
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      setMetrics(res.data);
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 401) {
        setError("Admin API rejected the request. Make sure the backend has CLERK_SECRET_KEY configured on Vercel.");
      } else if (status === 403) {
        setError("Admin access is authenticated, but MFA is still required by the backend.");
      } else {
        setError(
          e?.message || "Could not load metrics. Make sure the backend is running.",
        );
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isLoaded) {
      fetchMetrics();
    }
  }, [isLoaded, isSignedIn, selectedModel]);

  const selectedModelOption =
    MODEL_OPTIONS.find((option) => option.key === selectedModel) || MODEL_OPTIONS[0];

  const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`;
  const formatDate = (value: string | null) =>
    value
      ? new Date(value).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "N/A";

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#444" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Model Performance</Text>
        <TouchableOpacity onPress={fetchMetrics} style={styles.refreshBtn}>
          <Ionicons name="refresh-outline" size={22} color="#444" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.selectorBlock}>
          <Text style={styles.selectorLabel}>Selected Model</Text>
          <TouchableOpacity
            style={styles.selectorButton}
            onPress={() => setShowModelModal(true)}
            activeOpacity={0.85}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.selectorTitle}>{selectedModelOption.label}</Text>
              <Text style={styles.selectorSubtitle}>
                {selectedModelOption.subtitle}
              </Text>
            </View>
            <Ionicons name="chevron-down" size={20} color="#555" />
          </TouchableOpacity>
        </View>

        {loading && <Text style={styles.statusText}>Loading metrics...</Text>}

        {error && (
          <View style={styles.errorBox}>
            <Ionicons name="warning-outline" size={20} color="#FF9500" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {metrics && (
          <>
            <Text style={styles.sectionLabel}>Live Stats</Text>

            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryTitle}>
                  {selectedModelOption.label} Metrics
                </Text>
                <View style={styles.summaryBadge}>
                  <Text style={styles.summaryBadgeText}>
                    {(metrics.specialty || selectedModel).toUpperCase()}
                  </Text>
                </View>
              </View>
              <Text style={styles.summaryMeta}>
                Model: {metrics.modelName || "Not available"}
              </Text>
              <Text style={styles.summaryMeta}>
                Version: {metrics.versionTag || "Not available"}
              </Text>
              <Text style={styles.summaryMeta}>
                Evaluation window: {formatDate(metrics.windowStart)} to{" "}
                {formatDate(metrics.windowEnd)}
              </Text>
            </View>

            <View style={styles.row}>
              <View style={[styles.statCard, { borderTopColor: "#34C759" }]}>
                <Text style={styles.statValue}>{formatPercent(metrics.accuracy)}</Text>
                <Text style={styles.statLabel}>Accuracy</Text>
              </View>
              <View style={[styles.statCard, { borderTopColor: "#4A90E2" }]}>
                <Text style={styles.statValue}>{formatPercent(metrics.precision)}</Text>
                <Text style={styles.statLabel}>Precision</Text>
              </View>
            </View>

            <View style={styles.row}>
              <View style={[styles.statCard, { borderTopColor: "#AF52DE" }]}>
                <Text style={styles.statValue}>{formatPercent(metrics.recall)}</Text>
                <Text style={styles.statLabel}>Recall</Text>
              </View>
              <View style={[styles.statCard, { borderTopColor: "#FF3B30" }]}>
                <Text style={styles.statValue}>
                  {formatPercent(metrics.falseAlarmRate)}
                </Text>
                <Text style={styles.statLabel}>False Alarm Rate</Text>
              </View>
            </View>

            <View style={styles.row}>
              <View style={[styles.statCard, { borderTopColor: "#222" }]}>
                <Text style={styles.statValue}>
                  {metrics.totalPredictions.toLocaleString()}
                </Text>
                <Text style={styles.statLabel}>Total Predictions</Text>
              </View>
              <View style={[styles.statCard, { borderTopColor: "#FF9500" }]}>
                <Text style={styles.statValue}>
                  {metrics.sampleSize.toLocaleString()}
                </Text>
                <Text style={styles.statLabel}>Sample Size</Text>
              </View>
            </View>

            {metrics.note ? (
              <View style={styles.noteBox}>
                <Ionicons name="information-circle-outline" size={18} color="#1565C0" />
                <Text style={styles.noteText}>{metrics.note}</Text>
              </View>
            ) : null}

            <Text style={styles.updatedText}>
              Last updated: {formatDate(metrics.lastUpdated)}
            </Text>
          </>
        )}
      </ScrollView>

      <Modal
        transparent
        animationType="fade"
        visible={showModelModal}
        onRequestClose={() => setShowModelModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowModelModal(false)}
        >
          <Pressable style={styles.modalCard} onPress={() => undefined}>
            <Text style={styles.modalTitle}>Choose Model</Text>
            <Text style={styles.modalSubtitle}>
              Switch the dashboard between your three ML models.
            </Text>

            {MODEL_OPTIONS.map((option) => {
              const isActive = option.key === selectedModel;
              return (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    styles.modalOption,
                    isActive && styles.modalOptionActive,
                  ]}
                  onPress={() => {
                    setSelectedModel(option.key);
                    setShowModelModal(false);
                  }}
                  activeOpacity={0.85}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.modalOptionTitle,
                        isActive && styles.modalOptionTitleActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                    <Text style={styles.modalOptionSubtitle}>
                      {option.subtitle}
                    </Text>
                  </View>
                  {isActive ? (
                    <Ionicons name="checkmark-circle" size={22} color="#111" />
                  ) : (
                    <Ionicons name="ellipse-outline" size={20} color="#aaa" />
                  )}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  header: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
    backgroundColor: "#fff",
  },
  backBtn: { padding: 6, width: 40 },
  refreshBtn: { padding: 6, width: 40, alignItems: "flex-end" },
  headerTitle: { color: "#222", fontSize: 16, fontWeight: "700" },
  content: { padding: 20, gap: 14 },
  selectorBlock: { gap: 8 },
  selectorLabel: {
    color: "#888",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  selectorButton: {
    backgroundColor: "#f5f5f5",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 0.5,
    borderColor: "#e7e7e7",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  selectorTitle: { color: "#111", fontSize: 16, fontWeight: "700" },
  selectorSubtitle: { color: "#777", fontSize: 12, marginTop: 2 },
  statusText: { color: "#888", textAlign: "center", marginTop: 40 },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#fff8f0",
    padding: 16,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: "#ffe0b2",
  },
  errorText: { color: "#E65100", fontSize: 13, flex: 1 },
  summaryCard: {
    backgroundColor: "#f7f7f7",
    borderRadius: 16,
    padding: 18,
    borderWidth: 0.5,
    borderColor: "#ececec",
    gap: 6,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  summaryTitle: { color: "#111", fontSize: 17, fontWeight: "800", flex: 1 },
  summaryBadge: {
    backgroundColor: "#111",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  summaryBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  summaryMeta: { color: "#666", fontSize: 12, lineHeight: 18 },
  sectionLabel: {
    color: "#888",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  row: { flexDirection: "row", gap: 14 },
  statCard: {
    flex: 1,
    backgroundColor: "#f9f9f9",
    borderRadius: 14,
    padding: 18,
    borderTopWidth: 3,
    borderWidth: 0.5,
    borderColor: "#eee",
  },
  statValue: {
    color: "#111",
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 4,
  },
  statLabel: { color: "#888", fontSize: 12 },
  noteBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#eef6ff",
    padding: 14,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: "#cfe3ff",
  },
  noteText: { color: "#24507a", fontSize: 13, flex: 1, lineHeight: 18 },
  updatedText: {
    color: "#bbb",
    fontSize: 11,
    textAlign: "center",
    marginTop: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 20,
    gap: 12,
  },
  modalTitle: { color: "#111", fontSize: 18, fontWeight: "800" },
  modalSubtitle: { color: "#777", fontSize: 13, lineHeight: 18 },
  modalOption: {
    backgroundColor: "#f7f7f7",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 15,
    borderWidth: 1,
    borderColor: "#ebebeb",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  modalOptionActive: {
    backgroundColor: "#f0f4ff",
    borderColor: "#c7d7ff",
  },
  modalOptionTitle: { color: "#111", fontSize: 15, fontWeight: "700" },
  modalOptionTitleActive: { color: "#111" },
  modalOptionSubtitle: { color: "#777", fontSize: 12, marginTop: 2 },
});
