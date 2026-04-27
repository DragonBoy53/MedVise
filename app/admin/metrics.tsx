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

type ClassMetric = {
  precision?: number | null;
  recall?: number | null;
  support?: number | null;
};

type BaselineMetrics = {
  accuracy: number | null;
  precision: number | null;
  recall: number | null;
  falseAlarmRate: number | null;
  rocAuc: number | null;
  sampleSize: number;
  metricScope: string | null;
  classMetrics: Record<string, ClassMetric>;
  confusionMatrix: Record<string, number>;
  updatedAt: string | null;
  note?: string | null;
  schemaReady?: boolean;
};

type LiveMetrics = {
  accuracy: number | null;
  precision: number | null;
  recall: number | null;
  falseAlarmRate: number | null;
  totalPredictions: number;
  sampleSize: number;
  windowStart: string | null;
  windowEnd: string | null;
  lastUpdated: string | null;
  note?: string | null;
  schemaReady?: boolean;
};

type MetricsResponse = {
  specialty: string | null;
  modelName: string | null;
  versionTag: string | null;
  baseline?: BaselineMetrics;
  live?: LiveMetrics;
  accuracy?: number | null;
  precision?: number | null;
  recall?: number | null;
  falseAlarmRate?: number | null;
  totalPredictions?: number;
  sampleSize?: number;
  windowStart?: string | null;
  windowEnd?: string | null;
  lastUpdated?: string | null;
  note?: string | null;
};

const MODEL_OPTIONS = [
  { key: "cardiology", label: "Cardiology", subtitle: "Heart disease model" },
  { key: "diabetes", label: "Diabetes", subtitle: "Endocrine risk model" },
  { key: "thyroid", label: "Thyroid", subtitle: "Thyroid disorder model" },
] as const;

type ModelKey = (typeof MODEL_OPTIONS)[number]["key"];

type MetricCardData = {
  key: string;
  label: string;
  value: string;
  borderTopColor: string;
};

const DEFAULT_BASELINE_METRICS: BaselineMetrics = {
  accuracy: null,
  precision: null,
  recall: null,
  falseAlarmRate: null,
  rocAuc: null,
  sampleSize: 0,
  metricScope: null,
  classMetrics: {},
  confusionMatrix: {},
  updatedAt: null,
  note: "Baseline metrics are not available yet for this model response.",
  schemaReady: true,
};

const DEFAULT_LIVE_METRICS: LiveMetrics = {
  accuracy: null,
  precision: null,
  recall: null,
  falseAlarmRate: null,
  totalPredictions: 0,
  sampleSize: 0,
  windowStart: null,
  windowEnd: null,
  lastUpdated: null,
  note: "Live metrics are not available yet for this model response.",
  schemaReady: true,
};

function normalizeMetricsResponse(payload: any): MetricsResponse {
  if (!payload) {
    return {
      specialty: null,
      modelName: null,
      versionTag: null,
      baseline: DEFAULT_BASELINE_METRICS,
      live: DEFAULT_LIVE_METRICS,
    };
  }

  const legacyLiveShape: LiveMetrics = {
    accuracy: payload.accuracy ?? null,
    precision: payload.precision ?? null,
    recall: payload.recall ?? null,
    falseAlarmRate: payload.falseAlarmRate ?? null,
    totalPredictions: payload.totalPredictions ?? 0,
    sampleSize: payload.sampleSize ?? 0,
    windowStart: payload.windowStart ?? null,
    windowEnd: payload.windowEnd ?? null,
    lastUpdated: payload.lastUpdated ?? null,
    note: payload.note ?? DEFAULT_LIVE_METRICS.note,
    schemaReady: payload.schemaReady ?? true,
  };

  return {
    specialty: payload.specialty ?? null,
    modelName: payload.modelName ?? null,
    versionTag: payload.versionTag ?? null,
    baseline: payload.baseline ?? DEFAULT_BASELINE_METRICS,
    live: payload.live ?? legacyLiveShape,
  };
}

function MetricCard({ item }: { item: MetricCardData }) {
  return (
    <View style={[styles.statCard, { borderTopColor: item.borderTopColor }]}>
      <Text style={styles.statValue}>{item.value}</Text>
      <Text style={styles.statLabel}>{item.label}</Text>
    </View>
  );
}

export default function MetricsScreen() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
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

      setMetrics(normalizeMetricsResponse(res.data));
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 401) {
        setError(
          "Admin API rejected the request. Make sure the backend has CLERK_SECRET_KEY configured on Vercel.",
        );
      } else if (status === 403) {
        setError(
          "Admin access is authenticated, but MFA is still required by the backend.",
        );
      } else {
        setError(
          e?.response?.data?.message ||
            e?.message ||
            "Could not load metrics. Make sure the backend is running.",
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

  const hasValue = (value: unknown) => value !== null && value !== undefined;

  const formatPercent = (value: number | null | undefined) =>
    value == null ? "N/A" : `${(value * 100).toFixed(1)}%`;

  const formatNumber = (value: number | null | undefined) =>
    value == null ? "N/A" : value.toLocaleString();

  const formatDate = (value: string | null | undefined) =>
    value
      ? new Date(value).toLocaleString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "N/A";

  const formatClassLabel = (value: string) =>
    value
      .replace(/([A-Z])/g, " $1")
      .replace(/_/g, " ")
      .replace(/\b\w/g, (match) => match.toUpperCase())
      .trim();

  const baseline = metrics?.baseline ?? DEFAULT_BASELINE_METRICS;
  const live = metrics?.live ?? DEFAULT_LIVE_METRICS;
  const classMetricEntries = Object.entries(baseline.classMetrics || {});

  const baselineCards: MetricCardData[] = [
    hasValue(baseline.accuracy)
      ? {
          key: "baseline-accuracy",
          label: "Accuracy",
          value: formatPercent(baseline.accuracy),
          borderTopColor: "#34C759",
        }
      : null,
    hasValue(baseline.precision)
      ? {
          key: "baseline-precision",
          label: "Precision",
          value: formatPercent(baseline.precision),
          borderTopColor: "#4A90E2",
        }
      : null,
    hasValue(baseline.recall)
      ? {
          key: "baseline-recall",
          label: "Recall",
          value: formatPercent(baseline.recall),
          borderTopColor: "#AF52DE",
        }
      : null,
    hasValue(baseline.falseAlarmRate)
      ? {
          key: "baseline-false-alarm",
          label: "False Alarm Rate",
          value: formatPercent(baseline.falseAlarmRate),
          borderTopColor: "#FF3B30",
        }
      : null,
    hasValue(baseline.sampleSize) && baseline.sampleSize > 0
      ? {
          key: "baseline-sample",
          label: "Evaluation Sample",
          value: formatNumber(baseline.sampleSize),
          borderTopColor: "#222",
        }
      : null,
    hasValue(baseline.rocAuc)
      ? {
          key: "baseline-roc-auc",
          label: "ROC-AUC",
          value: formatPercent(baseline.rocAuc),
          borderTopColor: "#FF9500",
        }
      : null,
  ].filter(Boolean) as MetricCardData[];

  const liveCards: MetricCardData[] = [
    hasValue(live.accuracy)
      ? {
          key: "live-accuracy",
          label: "Accuracy",
          value: formatPercent(live.accuracy),
          borderTopColor: "#34C759",
        }
      : null,
    hasValue(live.precision)
      ? {
          key: "live-precision",
          label: "Precision",
          value: formatPercent(live.precision),
          borderTopColor: "#4A90E2",
        }
      : null,
    hasValue(live.recall)
      ? {
          key: "live-recall",
          label: "Recall",
          value: formatPercent(live.recall),
          borderTopColor: "#AF52DE",
        }
      : null,
    hasValue(live.falseAlarmRate)
      ? {
          key: "live-false-alarm",
          label: "False Alarm Rate",
          value: formatPercent(live.falseAlarmRate),
          borderTopColor: "#FF3B30",
        }
      : null,
    live.totalPredictions > 0
      ? {
          key: "live-total",
          label: "Total Predictions",
          value: live.totalPredictions.toLocaleString(),
          borderTopColor: "#222",
        }
      : null,
    live.sampleSize > 0
      ? {
          key: "live-sample",
          label: "Labeled Cases",
          value: live.sampleSize.toLocaleString(),
          borderTopColor: "#FF9500",
        }
      : null,
  ].filter(Boolean) as MetricCardData[];

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

        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="warning-outline" size={20} color="#FF9500" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {metrics ? (
          <>
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryTitle}>
                  {selectedModelOption.label} Performance Dashboard
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
            </View>

            <Text style={styles.sectionLabel}>Baseline Test-Set Metrics</Text>

            <View style={styles.metricPanel}>
              <Text style={styles.panelTitle}>Notebook Evaluation Snapshot</Text>
              {baseline.metricScope ? (
                <Text style={styles.panelMeta}>Scope: {baseline.metricScope}</Text>
              ) : null}
              {baseline.updatedAt ? (
                <Text style={styles.panelMeta}>
                  Updated: {formatDate(baseline.updatedAt)}
                </Text>
              ) : null}
            </View>

            <View style={styles.metricGrid}>
              {baselineCards.map((item) => (
                <MetricCard key={item.key} item={item} />
              ))}
            </View>

            {baseline.note ? (
              <View style={styles.noteBox}>
                <Ionicons name="information-circle-outline" size={18} color="#1565C0" />
                <Text style={styles.noteText}>{baseline.note}</Text>
              </View>
            ) : null}

            {classMetricEntries.length ? (
              <View style={styles.classMetricsCard}>
                <Text style={styles.classMetricsTitle}>Class-Level Detail</Text>
                {classMetricEntries.map(([key, value]) => (
                  <View key={key} style={styles.classMetricRow}>
                    <Text style={styles.classMetricName}>{formatClassLabel(key)}</Text>
                    <Text style={styles.classMetricValue}>
                      P {formatPercent(value.precision)} | R {formatPercent(value.recall)} | S{" "}
                      {formatNumber(value.support)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            <Text style={styles.sectionLabel}>Live Production Metrics</Text>

            <View style={styles.metricPanel}>
              <Text style={styles.panelTitle}>Real App Predictions</Text>
              {live.windowStart && live.windowEnd ? (
                <Text style={styles.panelMeta}>
                  Evaluation window: {formatDate(live.windowStart)} to{" "}
                  {formatDate(live.windowEnd)}
                </Text>
              ) : null}
              {live.lastUpdated ? (
                <Text style={styles.panelMeta}>
                  Last updated: {formatDate(live.lastUpdated)}
                </Text>
              ) : null}
            </View>

            <View style={styles.metricGrid}>
              {liveCards.map((item) => (
                <MetricCard key={item.key} item={item} />
              ))}
            </View>

            {live.note ? (
              <View style={styles.noteBox}>
                <Ionicons name="information-circle-outline" size={18} color="#1565C0" />
                <Text style={styles.noteText}>{live.note}</Text>
              </View>
            ) : null}
          </>
        ) : null}
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
                  style={[styles.modalOption, isActive && styles.modalOptionActive]}
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
    marginTop: 8,
  },
  metricPanel: {
    backgroundColor: "#fafafa",
    borderRadius: 16,
    padding: 16,
    borderWidth: 0.5,
    borderColor: "#ececec",
    gap: 4,
  },
  panelTitle: { color: "#111", fontSize: 15, fontWeight: "700" },
  panelMeta: { color: "#666", fontSize: 12, lineHeight: 18 },
  row: { flexDirection: "row", gap: 14 },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
  },
  statCard: {
    width: "47%",
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
  classMetricsCard: {
    backgroundColor: "#f8f8fb",
    borderRadius: 16,
    padding: 16,
    borderWidth: 0.5,
    borderColor: "#ececf4",
    gap: 10,
  },
  classMetricsTitle: { color: "#111", fontSize: 15, fontWeight: "700" },
  classMetricRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  classMetricName: { color: "#222", fontSize: 13, fontWeight: "600", flex: 1 },
  classMetricValue: { color: "#666", fontSize: 12, flex: 1, textAlign: "right" },
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
