import { useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import apiClient from "../../api/client";

type Patient = {
  patientUserId: string;
  displayName: string;
  status: string;
  linkedAt: string;
  predictionCount: number;
  lastPredictionAt: string | null;
};

type PatientSummary = {
  id: string;
  specialty: string | null;
  summary: string;
  startedAt: string;
  lastMessageAt: string;
};

type PatientPrediction = {
  id: number;
  specialty: string;
  predictedLabel: string;
  predictedValue: number | null;
  riskLevel: string;
  probabilities: Record<string, number | null>;
  createdAt: string;
};

type PatientDetail = {
  patient: {
    patientUserId: string;
    displayName: string;
  };
  summaries: PatientSummary[];
  predictions: PatientPrediction[];
};

function formatDate(value?: string | null) {
  if (!value) return "No activity yet";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatSpecialty(value?: string | null) {
  if (!value) return "General";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function splitSummary(summary: string) {
  return summary
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
}

function riskColor(riskLevel: string) {
  const normalized = riskLevel.toLowerCase();
  if (normalized.includes("high")) return "#C62828";
  if (normalized.includes("elevated")) return "#B45309";
  if (normalized.includes("low")) return "#0F766E";
  return "#475569";
}

export default function DoctorDashboard() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loadingPatients, setLoadingPatients] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [patientsError, setPatientsError] = useState<string | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientDetail, setPatientDetail] = useState<PatientDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const clinicianName =
    user?.fullName ||
    user?.primaryEmailAddress?.emailAddress ||
    "Clinician";

  const getAuthHeaders = useCallback(async () => {
    const token = await getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [getToken]);

  const loadPatients = useCallback(async () => {
    setPatientsError(null);
    try {
      const headers = await getAuthHeaders();
      const response = await apiClient.get("/api/doctor/patients", { headers });
      setPatients(response.data?.items || []);
    } catch (error: any) {
      setPatientsError(
        error?.response?.data?.message ||
          error?.message ||
          "Could not load linked patients.",
      );
    } finally {
      setLoadingPatients(false);
      setRefreshing(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  const refreshPatients = () => {
    setRefreshing(true);
    loadPatients();
  };

  const openPatient = async (patient: Patient) => {
    setSelectedPatient(patient);
    setPatientDetail(null);
    setDetailError(null);
    setLoadingDetail(true);

    try {
      const headers = await getAuthHeaders();
      const response = await apiClient.get(
        `/api/doctor/patients/${encodeURIComponent(patient.patientUserId)}/summary`,
        { headers },
      );
      setPatientDetail(response.data?.item || null);
    } catch (error: any) {
      setDetailError(
        error?.response?.data?.message ||
          error?.message ||
          "Could not load patient clinical summary.",
      );
    } finally {
      setLoadingDetail(false);
    }
  };

  const closePatient = () => {
    setSelectedPatient(null);
    setPatientDetail(null);
    setDetailError(null);
  };

  const renderPatient = ({ item }: { item: Patient }) => (
    <TouchableOpacity
      style={styles.patientCard}
      activeOpacity={0.85}
      onPress={() => openPatient(item)}
    >
      <View style={styles.patientAvatar}>
        <Ionicons name="person-outline" size={22} color="#0F766E" />
      </View>
      <View style={styles.patientBody}>
        <Text style={styles.patientName}>{item.displayName}</Text>
        <Text style={styles.patientMeta} numberOfLines={1}>
          Linked {formatDate(item.linkedAt)} • {item.predictionCount} risk scores
        </Text>
        <Text style={styles.patientSubtle}>
          Last activity: {formatDate(item.lastPredictionAt)}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#94A3B8" />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>Clinician Portal</Text>
          <Text style={styles.title}>Patient Review</Text>
        </View>
        <View style={styles.headerBadge}>
          <Ionicons name="shield-checkmark-outline" size={16} color="#0F766E" />
          <Text style={styles.headerBadgeText}>{clinicianName}</Text>
        </View>
      </View>

      <FlatList
        data={patients}
        keyExtractor={(item) => item.patientUserId}
        renderItem={renderPatient}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refreshPatients} />
        }
        ListHeaderComponent={
          <View style={styles.summaryStrip}>
            <View>
              <Text style={styles.summaryValue}>{patients.length}</Text>
              <Text style={styles.summaryLabel}>Shared patients</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryTitle}>Secure clinical review</Text>
              <Text style={styles.summaryCopy}>
                Only active patient sharing links are returned by the API.
              </Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          loadingPatients ? (
            <View style={styles.emptyState}>
              <ActivityIndicator size="large" color="#0F766E" />
              <Text style={styles.emptyText}>Loading patients...</Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={32} color="#94A3B8" />
              <Text style={styles.emptyTitle}>
                {patientsError ? "Could not load patients" : "No shared patients"}
              </Text>
              <Text style={styles.emptyText}>
                {patientsError ||
                  "Patients will appear here after they link your clinician account."}
              </Text>
            </View>
          )
        }
      />

      <Modal
        visible={Boolean(selectedPatient)}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closePatient}
      >
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={closePatient} style={styles.closeButton}>
              <Ionicons name="close" size={22} color="#334155" />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>
                {selectedPatient?.displayName || "Patient"}
              </Text>
              <Text style={styles.modalSubtitle}>
                Shared clinical summaries and risk scores
              </Text>
            </View>
          </View>

          {loadingDetail ? (
            <View style={styles.detailLoading}>
              <ActivityIndicator size="large" color="#0F766E" />
              <Text style={styles.emptyText}>Loading clinical summary...</Text>
            </View>
          ) : detailError ? (
            <View style={styles.detailLoading}>
              <Ionicons name="alert-circle-outline" size={32} color="#C62828" />
              <Text style={styles.emptyTitle}>Unable to load summary</Text>
              <Text style={styles.emptyText}>{detailError}</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.detailContent}>
              <Text style={styles.sectionTitle}>Gemini Symptom Summaries</Text>
              {patientDetail?.summaries?.length ? (
                patientDetail.summaries.map((item) => (
                  <View key={item.id} style={styles.detailPanel}>
                    <View style={styles.panelHeader}>
                      <Text style={styles.panelTitle}>
                        {formatSpecialty(item.specialty)}
                      </Text>
                      <Text style={styles.panelDate}>
                        {formatDate(item.lastMessageAt)}
                      </Text>
                    </View>
                    {splitSummary(item.summary).map((line, index) => (
                      <View key={`${item.id}-${index}`} style={styles.bulletRow}>
                        <View style={styles.bulletDot} />
                        <Text style={styles.bulletText}>{line}</Text>
                      </View>
                    ))}
                  </View>
                ))
              ) : (
                <Text style={styles.placeholderText}>
                  No Gemini summaries have been shared for this patient yet.
                </Text>
              )}

              <Text style={styles.sectionTitle}>ML Risk Scores</Text>
              {patientDetail?.predictions?.length ? (
                patientDetail.predictions.map((item) => (
                  <View key={item.id} style={styles.riskRow}>
                    <View>
                      <Text style={styles.riskTitle}>
                        {formatSpecialty(item.specialty)}
                      </Text>
                      <Text style={styles.riskDate}>{formatDate(item.createdAt)}</Text>
                    </View>
                    <View
                      style={[
                        styles.riskBadge,
                        { backgroundColor: `${riskColor(item.riskLevel)}18` },
                      ]}
                    >
                      <Text
                        style={[
                          styles.riskBadgeText,
                          { color: riskColor(item.riskLevel) },
                        ]}
                      >
                        {item.riskLevel}
                      </Text>
                    </View>
                  </View>
                ))
              ) : (
                <Text style={styles.placeholderText}>
                  No ML risk scores have been recorded for this patient yet.
                </Text>
              )}
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F8FAFC" },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: "#F8FAFC",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  eyebrow: {
    color: "#0F766E",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  title: { color: "#0F172A", fontSize: 26, fontWeight: "800", marginTop: 3 },
  headerBadge: {
    maxWidth: 160,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ECFDF5",
    borderColor: "#CCFBF1",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  headerBadgeText: { color: "#0F766E", fontSize: 12, fontWeight: "700" },
  listContent: { padding: 20, paddingTop: 4, gap: 12 },
  summaryStrip: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginBottom: 4,
  },
  summaryValue: { color: "#0F172A", fontSize: 28, fontWeight: "800" },
  summaryLabel: { color: "#64748B", fontSize: 12, fontWeight: "600" },
  summaryDivider: { width: 1, height: 44, backgroundColor: "#E2E8F0" },
  summaryTitle: { color: "#0F172A", fontSize: 15, fontWeight: "800" },
  summaryCopy: { color: "#64748B", fontSize: 12, lineHeight: 17, marginTop: 2 },
  patientCard: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  patientAvatar: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ECFDF5",
  },
  patientBody: { flex: 1, gap: 3 },
  patientName: { color: "#0F172A", fontSize: 16, fontWeight: "800" },
  patientMeta: { color: "#475569", fontSize: 13 },
  patientSubtle: { color: "#94A3B8", fontSize: 12 },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 56,
    gap: 10,
  },
  emptyTitle: { color: "#0F172A", fontSize: 16, fontWeight: "800" },
  emptyText: {
    color: "#64748B",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
  modalSafe: { flex: 1, backgroundColor: "#fff" },
  modalHeader: {
    minHeight: 64,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },
  modalTitle: { color: "#0F172A", fontSize: 18, fontWeight: "800" },
  modalSubtitle: { color: "#64748B", fontSize: 12, marginTop: 2 },
  detailLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  detailContent: { padding: 20, gap: 14 },
  sectionTitle: {
    color: "#334155",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 6,
  },
  detailPanel: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 16,
    padding: 16,
    backgroundColor: "#F8FAFC",
    gap: 10,
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  panelTitle: { color: "#0F172A", fontSize: 15, fontWeight: "800" },
  panelDate: { color: "#64748B", fontSize: 12 },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 9 },
  bulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#0F766E",
    marginTop: 7,
  },
  bulletText: { flex: 1, color: "#334155", fontSize: 14, lineHeight: 20 },
  placeholderText: {
    color: "#64748B",
    fontSize: 13,
    lineHeight: 19,
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    padding: 16,
  },
  riskRow: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    padding: 14,
    backgroundColor: "#fff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  riskTitle: { color: "#0F172A", fontSize: 15, fontWeight: "800" },
  riskDate: { color: "#64748B", fontSize: 12, marginTop: 2 },
  riskBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  riskBadgeText: { fontSize: 12, fontWeight: "800" },
});
