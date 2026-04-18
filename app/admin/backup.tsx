import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import apiClient from "../../api/client";

type LogEntry = {
  time: string;
  message: string;
  type: "success" | "error" | "info";
};

export default function BackupScreen() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const [backupLoading, setBackupLoading] = useState(false);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const getAuthHeaders = async () => {
    if (!isLoaded || !isSignedIn) {
      throw new Error("You must sign in before using admin actions.");
    }

    const token = await getToken();
    if (!token) {
      throw new Error("No Clerk session token was available for this request.");
    }

    return {
      Authorization: `Bearer ${token}`,
    };
  };

  const getRequestErrorMessage = (error: any, fallback: string) => {
    const status = error?.response?.status;

    if (status === 401) {
      return "Request was rejected by the admin API. Add CLERK_SECRET_KEY to Vercel backend environment variables.";
    }

    if (status === 403) {
      return "Request is authenticated but blocked by MFA enforcement on the backend.";
    }

    return error?.message || fallback;
  };

  const addLog = (message: string, type: LogEntry["type"] = "info") => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [{ time, message, type }, ...prev]);
  };

  const handleBackup = async () => {
    Alert.alert(
      "Trigger Backup",
      "This will start a full data backup. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Start Backup",
          onPress: async () => {
            setBackupLoading(true);
            addLog("Backup initiated...", "info");
            try {
              const headers = await getAuthHeaders();
              const res = await apiClient.post("/api/admin/backup", {}, { headers });
              addLog(
                res.data.message || "Backup completed successfully.",
                "success",
              );
            } catch (e: any) {
              addLog(
                getRequestErrorMessage(e, "Backup failed. Check server logs."),
                "error",
              );
            } finally {
              setBackupLoading(false);
            }
          },
        },
      ],
    );
  };

  const handleRecovery = async () => {
    Alert.alert(
      "Start Recovery",
      "This will trigger system recovery from the latest backup. This action cannot be undone. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Start Recovery",
          style: "destructive",
          onPress: async () => {
            setRecoveryLoading(true);
            addLog("Recovery initiated...", "info");
            try {
              const headers = await getAuthHeaders();
              const res = await apiClient.post(
                "/api/admin/recovery",
                { targetEnv: "staging" },
                { headers },
              );
              addLog(
                res.data.message || "Recovery completed successfully.",
                "success",
              );
            } catch (e: any) {
              addLog(
                getRequestErrorMessage(e, "Recovery failed. Check server logs."),
                "error",
              );
            } finally {
              setRecoveryLoading(false);
            }
          },
        },
      ],
    );
  };

  const logColor = (type: LogEntry["type"]) => {
    if (type === "success") return "#34C759";
    if (type === "error") return "#FF3B30";
    return "#888";
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#444" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Backup & Recovery</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Backup Card */}
        <View style={styles.actionCard}>
          <View style={[styles.iconWrap, { backgroundColor: "#FFF3E0" }]}>
            <Ionicons name="cloud-upload-outline" size={28} color="#E65100" />
          </View>
          <Text style={styles.actionTitle}>Data Backup</Text>
          <Text style={styles.actionDesc}>
            Creates a full snapshot of all system data. Recommended before any
            major update.
          </Text>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: "#E65100" }]}
            onPress={handleBackup}
            disabled={backupLoading}
          >
            {backupLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.actionBtnText}>Start Backup</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Recovery Card */}
        <View style={styles.actionCard}>
          <View style={[styles.iconWrap, { backgroundColor: "#FCE4EC" }]}>
            <Ionicons name="refresh-circle-outline" size={28} color="#C62828" />
          </View>
          <Text style={styles.actionTitle}>System Recovery</Text>
          <Text style={styles.actionDesc}>
            Restores the system from the latest backup. Use only in case of
            failure or data corruption.
          </Text>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: "#C62828" }]}
            onPress={handleRecovery}
            disabled={recoveryLoading}
          >
            {recoveryLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.actionBtnText}>Start Recovery</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Activity Log */}
        {logs.length > 0 && (
          <>
            <Text style={styles.logTitle}>Activity Log</Text>
            {logs.map((log, i) => (
              <View key={i} style={styles.logRow}>
                <Text style={styles.logTime}>{log.time}</Text>
                <Text style={[styles.logMsg, { color: logColor(log.type) }]}>
                  {log.message}
                </Text>
              </View>
            ))}
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
  headerTitle: { color: "#222", fontSize: 16, fontWeight: "700" },
  content: { padding: 20, gap: 16 },
  actionCard: {
    backgroundColor: "#f9f9f9",
    borderRadius: 18,
    padding: 20,
    borderWidth: 0.5,
    borderColor: "#eee",
    gap: 10,
  },
  iconWrap: {
    width: 54,
    height: 54,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  actionTitle: { color: "#111", fontSize: 17, fontWeight: "700" },
  actionDesc: { color: "#888", fontSize: 13, lineHeight: 19 },
  actionBtn: {
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 4,
  },
  actionBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  logTitle: {
    color: "#888",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  logRow: {
    backgroundColor: "#f9f9f9",
    borderRadius: 10,
    padding: 12,
    borderWidth: 0.5,
    borderColor: "#eee",
  },
  logTime: { color: "#bbb", fontSize: 11, marginBottom: 2 },
  logMsg: { fontSize: 13 },
});
