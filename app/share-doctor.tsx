import { useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import apiClient from "../api/client";
import { getAppRole } from "@/utils/auth";

type LinkedDoctor = {
  id: number;
  doctorUserId: string;
  doctorEmail: string | null;
  doctorName: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export default function ShareDoctorScreen() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { user, isLoaded: isUserLoaded } = useUser();
  const router = useRouter();
  const [doctorEmail, setDoctorEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadingDoctors, setLoadingDoctors] = useState(true);
  const [linkedDoctors, setLinkedDoctors] = useState<LinkedDoctor[]>([]);
  const role = getAppRole(user);

  const getHeaders = useCallback(async () => {
    const token = await getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [getToken]);

  const loadLinkedDoctors = useCallback(async () => {
    try {
      const headers = await getHeaders();
      const response = await apiClient.get("/api/patient/linked-doctors", { headers });
      setLinkedDoctors(response.data?.items || []);
    } catch (error: any) {
      Alert.alert(
        "Unable to load shared clinicians",
        error?.response?.data?.message ||
          error?.message ||
          "Please try again.",
      );
    } finally {
      setLoadingDoctors(false);
    }
  }, [getHeaders]);

  useEffect(() => {
    if (!isLoaded || !isUserLoaded) {
      return;
    }

    if (!isSignedIn) {
      router.replace("/(auth)/sign-in");
      return;
    }

    if (role !== "user") {
      router.replace("/chat");
      return;
    }

    loadLinkedDoctors();
  }, [isLoaded, isSignedIn, isUserLoaded, loadLinkedDoctors, role, router]);

  if (!isLoaded || !isUserLoaded || !isSignedIn || role !== "user") {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#0F766E" />
      </View>
    );
  }

  const linkDoctor = async () => {
    const normalized = doctorEmail.trim().toLowerCase();
    if (!normalized) {
      Alert.alert("Doctor email required", "Enter the clinician email to share your data.");
      return;
    }

    try {
      setSubmitting(true);
      const headers = await getHeaders();
      await apiClient.post(
        "/api/patient/link-doctor",
        { doctorIdentifier: normalized },
        { headers },
      );
      setDoctorEmail("");
      await loadLinkedDoctors();
      Alert.alert(
        "Clinician linked",
        "Your future MedVise analyses, predictions, and saved message summaries are now visible to that clinician.",
      );
    } catch (error: any) {
      Alert.alert(
        "Link failed",
        error?.response?.data?.message ||
          error?.message ||
          "We could not link that clinician email.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Share With Clinician</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={linkedDoctors}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Connect a doctor by email</Text>
            <Text style={styles.formCopy}>
              Once linked, that clinician can review your saved MedVise summaries, predictions, and analysis messages inside the doctor portal.
            </Text>
            <TextInput
              value={doctorEmail}
              onChangeText={setDoctorEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="doctor@clinic.com"
              placeholderTextColor="#94A3B8"
              style={styles.input}
            />
            <TouchableOpacity
              style={[styles.primaryButton, submitting && styles.primaryButtonDisabled]}
              onPress={linkDoctor}
              activeOpacity={0.9}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="share-social-outline" size={18} color="#fff" />
                  <Text style={styles.primaryButtonText}>Share data</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        }
        ListEmptyComponent={
          loadingDoctors ? (
            <View style={styles.emptyState}>
              <ActivityIndicator size="large" color="#0F766E" />
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="mail-open-outline" size={32} color="#94A3B8" />
              <Text style={styles.emptyTitle}>No clinicians linked yet</Text>
              <Text style={styles.emptyText}>
                Add a clinician email above to start sharing future analyses.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <View style={styles.linkCard}>
            <View style={styles.avatarWrap}>
              <Ionicons name="medkit-outline" size={20} color="#0F766E" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.linkName}>
                {item.doctorName || item.doctorEmail || item.doctorUserId}
              </Text>
              <Text style={styles.linkMeta}>
                {item.doctorEmail || item.doctorUserId}
              </Text>
            </View>
            <View style={styles.statusBadge}>
              <Text style={styles.statusText}>{item.status}</Text>
            </View>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F8FAFC" },
  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },
  header: {
    height: 56,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    backgroundColor: "#fff",
  },
  backBtn: { width: 40, alignItems: "flex-start" },
  headerTitle: { color: "#0F172A", fontSize: 16, fontWeight: "800" },
  content: { padding: 20, gap: 14, flexGrow: 1 },
  formCard: {
    backgroundColor: "#fff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 18,
    gap: 12,
    marginBottom: 10,
  },
  formTitle: { color: "#0F172A", fontSize: 20, fontWeight: "800" },
  formCopy: { color: "#64748B", fontSize: 13, lineHeight: 19 },
  input: {
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingHorizontal: 14,
    backgroundColor: "#F8FAFC",
    color: "#0F172A",
  },
  primaryButton: {
    height: 50,
    borderRadius: 14,
    backgroundColor: "#0F766E",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryButtonDisabled: { opacity: 0.7 },
  primaryButtonText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    gap: 10,
  },
  emptyTitle: { color: "#0F172A", fontSize: 16, fontWeight: "800" },
  emptyText: { color: "#64748B", fontSize: 13, textAlign: "center", lineHeight: 19 },
  linkCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ECFDF5",
  },
  linkName: { color: "#0F172A", fontSize: 15, fontWeight: "800" },
  linkMeta: { color: "#64748B", fontSize: 12, marginTop: 2 },
  statusBadge: {
    backgroundColor: "#DCFCE7",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusText: {
    color: "#166534",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
});
