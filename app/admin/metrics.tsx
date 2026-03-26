import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
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
  accuracy: number;
  falseAlarmRate: number;
  totalPredictions: number;
  lastUpdated: string;
};

export default function MetricsScreen() {
  const router = useRouter();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get("/api/admin/metrics");
      setMetrics(res.data);
    } catch (e) {
      setError("Could not load metrics. Make sure the backend is running.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

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

            <View style={styles.row}>
              <View style={[styles.statCard, { borderTopColor: "#34C759" }]}>
                <Text style={styles.statValue}>
                  {(metrics.accuracy * 100).toFixed(1)}%
                </Text>
                <Text style={styles.statLabel}>Accuracy</Text>
              </View>
              <View style={[styles.statCard, { borderTopColor: "#FF3B30" }]}>
                <Text style={styles.statValue}>
                  {(metrics.falseAlarmRate * 100).toFixed(1)}%
                </Text>
                <Text style={styles.statLabel}>False Alarm Rate</Text>
              </View>
            </View>

            <View
              style={[
                styles.statCard,
                { borderTopColor: "#4A90E2", marginTop: 0 },
              ]}
            >
              <Text style={styles.statValue}>
                {metrics.totalPredictions.toLocaleString()}
              </Text>
              <Text style={styles.statLabel}>Total Predictions</Text>
            </View>

            <Text style={styles.updatedText}>
              Last updated: {metrics.lastUpdated}
            </Text>
          </>
        )}
      </ScrollView>
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
    fontSize: 28,
    fontWeight: "800",
    marginBottom: 4,
  },
  statLabel: { color: "#888", fontSize: 12 },
  updatedText: {
    color: "#bbb",
    fontSize: 11,
    textAlign: "center",
    marginTop: 8,
  },
});
