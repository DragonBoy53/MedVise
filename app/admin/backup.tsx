import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import apiClient from "../../api/client";

type BackupStatus = "queued" | "processing" | "completed" | "failed" | string;

type BackupJob = {
  id: number;
  initiatedBy: number | null;
  initiatedByClerkUserId: string | null;
  status: BackupStatus;
  storageUri: string | null;
  checksum: string | null;
  sizeBytes: number | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  errorMessage: string | null;
};

const STATUS_META: Record<string, { color: string; bg: string; icon: keyof typeof Ionicons.glyphMap }> = {
  queued: { color: "#B45309", bg: "#FFFBEB", icon: "time-outline" },
  processing: { color: "#2563EB", bg: "#EFF6FF", icon: "sync-outline" },
  completed: { color: "#059669", bg: "#ECFDF5", icon: "checkmark-circle-outline" },
  failed: { color: "#DC2626", bg: "#FEF2F2", icon: "alert-circle-outline" },
};

function getStatusMeta(status: BackupStatus) {
  return STATUS_META[String(status).toLowerCase()] || {
    color: "#64748B",
    bg: "#F1F5F9",
    icon: "ellipse-outline" as const,
  };
}

function formatDate(value: string | null) {
  if (!value) return "-";

  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSize(sizeBytes: number | null) {
  if (!sizeBytes) return "Pending";

  const units = ["B", "KB", "MB", "GB"];
  let size = sizeBytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export default function BackupScreen() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<BackupJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [restoringId, setRestoringId] = useState<number | null>(null);

  const getAuthHeaders = useCallback(async () => {
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
  }, [getToken, isLoaded, isSignedIn]);

  const getRequestErrorMessage = (error: any, fallback: string) => {
    const status = error?.response?.status;

    if (status === 401) {
      return "Request was rejected by the admin API. Add CLERK_SECRET_KEY to the backend environment variables.";
    }

    if (status === 403) {
      return "Request is authenticated but blocked by admin role or MFA enforcement.";
    }

    return error?.response?.data?.message || error?.message || fallback;
  };

  const loadBackups = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        const headers = await getAuthHeaders();
        const response = await apiClient.get("/api/admin/backups", { headers });
        setItems(response.data?.items || []);
      } catch (error: any) {
        Alert.alert(
          "Backups unavailable",
          getRequestErrorMessage(error, "Could not load backup jobs."),
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [getAuthHeaders],
  );

  useFocusEffect(
    useCallback(() => {
      loadBackups();
    }, [loadBackups]),
  );

  useEffect(() => {
    const hasActiveJob = items.some((item) =>
      ["queued", "processing"].includes(String(item.status).toLowerCase()),
    );

    if (!hasActiveJob) return;

    const timer = setInterval(() => {
      loadBackups(true);
    }, 5000);

    return () => clearInterval(timer);
  }, [items, loadBackups]);

  const latestCompleted = useMemo(
    () => items.find((item) => item.status === "completed"),
    [items],
  );

  const createBackup = async () => {
    try {
      setCreatingBackup(true);
      const headers = await getAuthHeaders();
      await apiClient.post("/api/admin/backup", {}, { headers });
      await loadBackups(true);
    } catch (error: any) {
      Alert.alert(
        "Backup failed",
        getRequestErrorMessage(error, "Could not queue a backup job."),
      );
    } finally {
      setCreatingBackup(false);
    }
  };

  const confirmCreateBackup = () => {
    Alert.alert(
      "Create New Backup",
      "This will queue a full database backup and upload the artifact to Supabase Storage.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Create Backup", onPress: createBackup },
      ],
    );
  };

  const restoreBackup = async (backup: BackupJob) => {
    try {
      setRestoringId(backup.id);
      const headers = await getAuthHeaders();
      await apiClient.post(
        "/api/admin/recovery",
        { backupJobId: backup.id, targetEnv: "production" },
        { headers },
      );
      await loadBackups(true);
    } catch (error: any) {
      Alert.alert(
        "Recovery failed",
        getRequestErrorMessage(error, "Could not queue a recovery job."),
      );
    } finally {
      setRestoringId(null);
    }
  };

  const confirmRestore = (backup: BackupJob) => {
    Alert.alert(
      "Warning",
      "This will overwrite current data. Are you sure you want to proceed?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restore",
          style: "destructive",
          onPress: () => restoreBackup(backup),
        },
      ],
    );
  };

  const renderBackup = ({ item }: { item: BackupJob }) => {
    const meta = getStatusMeta(item.status);
    const isCompleted = String(item.status).toLowerCase() === "completed";
    const isRestoring = restoringId === item.id;

    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={[styles.iconWrap, { backgroundColor: meta.bg }]}>
            <Ionicons name={meta.icon} size={20} color={meta.color} />
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>Backup #{item.id}</Text>
            <Text style={styles.cardSubtitle}>{formatDate(item.createdAt)}</Text>
          </View>
          <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
            <Text style={[styles.statusText, { color: meta.color }]}>
              {String(item.status).toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.detailsGrid}>
          <View style={styles.detailBlock}>
            <Text style={styles.detailLabel}>Size</Text>
            <Text style={styles.detailValue}>{formatSize(item.sizeBytes)}</Text>
          </View>
          <View style={styles.detailBlock}>
            <Text style={styles.detailLabel}>Completed</Text>
            <Text style={styles.detailValue}>{formatDate(item.completedAt)}</Text>
          </View>
        </View>

        {item.errorMessage ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={15} color="#DC2626" />
            <Text style={styles.errorText}>{item.errorMessage}</Text>
          </View>
        ) : null}

        {isCompleted ? (
          <TouchableOpacity
            style={styles.restoreButton}
            activeOpacity={0.84}
            onPress={() => confirmRestore(item)}
            disabled={isRestoring}
          >
            {isRestoring ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="refresh-outline" size={17} color="#fff" />
                <Text style={styles.restoreButtonText}>Restore</Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#444" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Backup & Recovery</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.hero}>
        <View style={styles.heroText}>
          <Text style={styles.heroTitle}>Database Backups</Text>
          <Text style={styles.heroSubtitle}>
            Backups run in a Redis worker and are stored as Supabase Storage artifacts.
          </Text>
        </View>
        {latestCompleted ? (
          <View style={styles.latestBadge}>
            <Text style={styles.latestLabel}>Latest</Text>
            <Text style={styles.latestValue}>{formatDate(latestCompleted.completedAt)}</Text>
          </View>
        ) : null}
      </View>

      <TouchableOpacity
        style={styles.createButton}
        activeOpacity={0.86}
        onPress={confirmCreateBackup}
        disabled={creatingBackup}
      >
        {creatingBackup ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="cloud-upload-outline" size={19} color="#fff" />
            <Text style={styles.createButtonText}>Create New Backup</Text>
          </>
        )}
      </TouchableOpacity>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#111827" />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderBackup}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadBackups(true)}
              tintColor="#111827"
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="server-outline" size={32} color="#B6BEC9" />
              </View>
              <Text style={styles.emptyTitle}>No backups yet</Text>
              <Text style={styles.emptySubtitle}>
                Create your first database backup to enable recovery options.
              </Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
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
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: "#E9EDF2",
    backgroundColor: "#fff",
  },
  backBtn: { padding: 6, width: 40 },
  headerTitle: { color: "#222", fontSize: 16, fontWeight: "700" },
  headerSpacer: { width: 40 },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 12,
    gap: 12,
  },
  heroText: { flex: 1 },
  heroTitle: { fontSize: 22, fontWeight: "800", color: "#111827" },
  heroSubtitle: { fontSize: 13, lineHeight: 19, color: "#64748B", marginTop: 4 },
  latestBadge: {
    borderRadius: 14,
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 10,
    paddingVertical: 8,
    maxWidth: 136,
  },
  latestLabel: { fontSize: 10, fontWeight: "700", color: "#059669" },
  latestValue: { fontSize: 11, color: "#047857", marginTop: 2 },
  createButton: {
    minHeight: 52,
    borderRadius: 16,
    backgroundColor: "#111827",
    marginHorizontal: 16,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  createButtonText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { padding: 16, gap: 12, paddingBottom: 36 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E9EDF4",
    padding: 14,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: "800", color: "#111827" },
  cardSubtitle: { fontSize: 12, color: "#8A94A6", marginTop: 3 },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  statusText: { fontSize: 10, fontWeight: "800" },
  detailsGrid: { flexDirection: "row", gap: 10, marginTop: 14 },
  detailBlock: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  detailLabel: { fontSize: 11, color: "#8A94A6", marginBottom: 3 },
  detailValue: { fontSize: 13, color: "#111827", fontWeight: "700" },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    borderRadius: 12,
    backgroundColor: "#FEF2F2",
    padding: 10,
    marginTop: 12,
  },
  errorText: { flex: 1, fontSize: 12, lineHeight: 17, color: "#B91C1C" },
  restoreButton: {
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: "#DC2626",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 12,
  },
  restoreButtonText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 84,
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
    fontWeight: "800",
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
