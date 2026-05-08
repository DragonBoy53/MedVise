import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

type RecoveryJob = {
  id: number;
  backupJobId: number;
  initiatedBy: number | null;
  initiatedByClerkUserId: string | null;
  status: BackupStatus;
  targetEnv: string;
  confirmedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  errorMessage: string | null;
};

type BackupRuntime = {
  apiReady: boolean;
  workerReady: boolean;
  workerOnline: boolean;
  workerLastSeenAt: string | null;
  queueConfigured: boolean;
  queueStatus: {
    configured: boolean;
    workerOnline: boolean;
    workerLastSeenAt: string | null;
    counts: Record<string, number> | null;
    error?: string;
  } | null;
  storageConfigured: boolean;
  missingApiEnv: string[];
  missingWorkerEnv: string[];
  backupBucket: string;
  workerCommand: string;
  note: string;
};

const STATUS_META: Record<
  string,
  { color: string; bg: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  queued: { color: "#B45309", bg: "#FFFBEB", icon: "time-outline" },
  processing: { color: "#2563EB", bg: "#EFF6FF", icon: "sync-outline" },
  completed: {
    color: "#059669",
    bg: "#ECFDF5",
    icon: "checkmark-circle-outline",
  },
  failed: { color: "#DC2626", bg: "#FEF2F2", icon: "alert-circle-outline" },
};

function getStatusMeta(status: BackupStatus) {
  return (
    STATUS_META[String(status).toLowerCase()] || {
      color: "#64748B",
      bg: "#F1F5F9",
      icon: "ellipse-outline" as const,
    }
  );
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

function getAgeMinutes(value: string | null) {
  if (!value) return null;

  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return null;

  return Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
}

export default function BackupScreen() {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<BackupJob[]>([]);
  const [recoveries, setRecoveries] = useState<RecoveryJob[]>([]);
  const [runtime, setRuntime] = useState<BackupRuntime | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const initialLoadDoneRef = useRef(false);
  const followUpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const followUpPollsRemainingRef = useRef(0);

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
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    };
  }, [getToken, isLoaded, isSignedIn]);

  const getRequestErrorMessage = (error: any, fallback: string) => {
    const status = error?.response?.status;

    if (status === 401) {
      return "Your admin session was rejected. Sign in again; if this keeps happening, verify CLERK_SECRET_KEY is set in the backend environment.";
    }

    if (status === 403) {
      return "Request is authenticated but blocked by admin role or MFA enforcement.";
    }

    return error?.response?.data?.message || error?.message || fallback;
  };

  const stopFollowUpPolling = useCallback(() => {
    if (followUpTimerRef.current) {
      clearTimeout(followUpTimerRef.current);
      followUpTimerRef.current = null;
    }
    followUpPollsRemainingRef.current = 0;
  }, []);

  const hasActiveJobs = useCallback(
    (backupItems: BackupJob[], recoveryItems: RecoveryJob[]) =>
      [...backupItems, ...recoveryItems].some((job) =>
        ["queued", "processing"].includes(String(job.status).toLowerCase()),
      ),
    [],
  );

  const loadBackups = useCallback(
    async (isRefresh = false, options?: { suppressAlert?: boolean }) => {
      try {
        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        const headers = await getAuthHeaders();
        const response = await apiClient.get("/api/admin/backups", {
          headers,
          params: { _: Date.now() },
        });
        const nextItems = response.data?.items || [];
        const nextRecoveries = response.data?.recoveries || [];
        const nextRuntime = response.data?.runtime || null;

        setItems(nextItems);
        setRecoveries(nextRecoveries);
        setRuntime(nextRuntime);

        return {
          items: nextItems as BackupJob[],
          recoveries: nextRecoveries as RecoveryJob[],
          runtime: nextRuntime as BackupRuntime | null,
        };
      } catch (error: any) {
        if (!options?.suppressAlert) {
          Alert.alert(
            "Backups unavailable",
            getRequestErrorMessage(error, "Could not load backup jobs."),
          );
        }
        return null;
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [getAuthHeaders],
  );

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      initialLoadDoneRef.current = false;
      setLoading(false);
      return;
    }

    if (initialLoadDoneRef.current) return;

    initialLoadDoneRef.current = true;
    void loadBackups();
    // Intentionally do not depend on loadBackups here; auth libraries can
    // recreate callbacks and cause repeated fetches while the screen is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn]);

  useEffect(() => stopFollowUpPolling, [stopFollowUpPolling]);

  const scheduleFollowUpPolling = useCallback(() => {
    stopFollowUpPolling();
    followUpPollsRemainingRef.current = 18;

    const poll = async () => {
      const snapshot = await loadBackups(true, { suppressAlert: true });
      const shouldContinue =
        !!snapshot &&
        hasActiveJobs(snapshot.items, snapshot.recoveries) &&
        followUpPollsRemainingRef.current > 1;

      if (!shouldContinue) {
        stopFollowUpPolling();
        return;
      }

      followUpPollsRemainingRef.current -= 1;
      followUpTimerRef.current = setTimeout(poll, 5000);
    };

    followUpTimerRef.current = setTimeout(poll, 5000);
  }, [hasActiveJobs, loadBackups, stopFollowUpPolling]);

  const latestCompleted = useMemo(
    () => items.find((item) => item.status === "completed"),
    [items],
  );

  const runtimeWarnings = useMemo(() => {
    if (!runtime) return [];

    const warnings: string[] = [];
    if (runtime.missingApiEnv.length) {
      warnings.push(`API missing: ${runtime.missingApiEnv.join(", ")}`);
    }
    if (runtime.missingWorkerEnv.length) {
      warnings.push(`Worker missing: ${runtime.missingWorkerEnv.join(", ")}`);
    }
    if (!runtime.storageConfigured) {
      warnings.push("Supabase backup storage is not configured.");
    }
    if (runtime.queueConfigured && !runtime.workerOnline) {
      warnings.push(
        "Database worker is offline. Queued jobs in Neon will not create or restore dump files until the worker is running.",
      );
    }
    if (runtime.queueStatus?.error) {
      warnings.push(`Queue status check failed: ${runtime.queueStatus.error}`);
    }

    return warnings;
  }, [runtime]);

  const stalledJobWarning = useMemo(() => {
    const activeJobs = [...items, ...recoveries].filter((job) =>
      ["queued", "processing"].includes(String(job.status).toLowerCase()),
    );

    if (!activeJobs.length) return null;

    const oldestActiveJob = activeJobs.reduce((oldest, job) =>
      new Date(job.createdAt).getTime() < new Date(oldest.createdAt).getTime()
        ? job
        : oldest,
    );
    const ageMinutes = getAgeMinutes(oldestActiveJob.createdAt);

    if (ageMinutes == null || ageMinutes < 2) return null;

    return `Oldest queued job has waited ${ageMinutes} min. No dump is saved while a backup stays queued in Neon; start the database worker to process it.`;
  }, [items, recoveries]);

  const createBackup = async () => {
    try {
      setCreatingBackup(true);
      const headers = await getAuthHeaders();
      await apiClient.post("/api/admin/backup", {}, { headers });
      const snapshot = await loadBackups(true);
      if (snapshot && hasActiveJobs(snapshot.items, snapshot.recoveries)) {
        scheduleFollowUpPolling();
      }
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
      const snapshot = await loadBackups(true);
      if (snapshot && hasActiveJobs(snapshot.items, snapshot.recoveries)) {
        scheduleFollowUpPolling();
      }
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

  const renderRuntimeStatus = () => {
    if (!runtime && !stalledJobWarning) return null;
    if (runtimeWarnings.length === 0 && !stalledJobWarning) return null;

    return (
      <View style={styles.runtimePanel}>
        <View style={styles.runtimeHeader}>
          <Ionicons name="construct-outline" size={18} color="#B45309" />
          <Text style={styles.runtimeTitle}>
            Backup Environment Needs Setup
          </Text>
        </View>
        {runtimeWarnings.map((warning) => (
          <Text key={warning} style={styles.runtimeText}>
            {warning}
          </Text>
        ))}
        {stalledJobWarning ? (
          <Text style={styles.runtimeText}>{stalledJobWarning}</Text>
        ) : null}
        {runtime?.workerLastSeenAt ? (
          <Text style={styles.runtimeText}>
            Worker last seen {formatDate(runtime.workerLastSeenAt)}
          </Text>
        ) : null}
        {runtime?.queueStatus?.counts ? (
          <Text style={styles.runtimeText}>
            Queue: {runtime.queueStatus.counts.waiting || 0} waiting,{" "}
            {runtime.queueStatus.counts.active || 0} active,{" "}
            {runtime.queueStatus.counts.failed || 0} failed
          </Text>
        ) : null}
        {runtime?.note ? (
          <Text style={styles.runtimeHint}>{runtime.note}</Text>
        ) : null}
      </View>
    );
  };

  const renderRecoveries = () => {
    if (!recoveries.length) return null;

    return (
      <View style={styles.recoverySection}>
        <Text style={styles.sectionTitle}>Recovery Jobs</Text>
        {recoveries.slice(0, 4).map((job) => {
          const meta = getStatusMeta(job.status);

          return (
            <View key={job.id} style={styles.recoveryCard}>
              <View style={styles.recoveryTop}>
                <View style={styles.recoveryTitleWrap}>
                  <Text style={styles.recoveryTitle}>Recovery #{job.id}</Text>
                  <Text style={styles.recoverySubtitle}>
                    Backup #{job.backupJobId} to {job.targetEnv}
                  </Text>
                </View>
                <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
                  <Text style={[styles.statusText, { color: meta.color }]}>
                    {String(job.status).toUpperCase()}
                  </Text>
                </View>
              </View>
              <Text style={styles.recoveryDate}>
                Queued {formatDate(job.createdAt)}
              </Text>
              {String(job.status).toLowerCase() === "queued" ? (
                <Text style={styles.recoveryNote}>
                  Waiting for the database worker to download the selected dump
                  and restore it.
                </Text>
              ) : null}
              {job.errorMessage ? (
                <Text style={styles.recoveryError}>{job.errorMessage}</Text>
              ) : null}
            </View>
          );
        })}
      </View>
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
            <Text style={styles.cardSubtitle}>
              {formatDate(item.createdAt)}
            </Text>
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
            <Text style={styles.detailValue}>
              {formatDate(item.completedAt)}
            </Text>
          </View>
        </View>

        {item.errorMessage ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={15} color="#DC2626" />
            <Text style={styles.errorText}>{item.errorMessage}</Text>
          </View>
        ) : null}

        {!item.errorMessage &&
        String(item.status).toLowerCase() === "queued" ? (
          <View style={styles.infoBox}>
            <Ionicons name="hourglass-outline" size={15} color="#B45309" />
            <Text style={styles.infoText}>
              Waiting for the database worker. No dump file has been saved yet.
            </Text>
          </View>
        ) : null}

        {!item.errorMessage &&
        String(item.status).toLowerCase() === "processing" ? (
          <View style={styles.infoBox}>
            <Ionicons name="sync-outline" size={15} color="#2563EB" />
            <Text style={styles.infoText}>
              Worker is creating the dump and uploading it to Supabase Storage.
            </Text>
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
            Backups run in a database worker and are stored as Supabase Storage
            artifacts.
          </Text>
        </View>
        {latestCompleted ? (
          <View style={styles.latestBadge}>
            <Text style={styles.latestLabel}>Latest</Text>
            <Text style={styles.latestValue}>
              {formatDate(latestCompleted.completedAt)}
            </Text>
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

      {renderRuntimeStatus()}
      {renderRecoveries()}

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
  heroSubtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: "#64748B",
    marginTop: 4,
  },
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
  runtimePanel: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#FDE68A",
    backgroundColor: "#FFFBEB",
    padding: 12,
  },
  runtimeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 6,
  },
  runtimeTitle: { fontSize: 13, fontWeight: "800", color: "#92400E" },
  runtimeText: { fontSize: 12, lineHeight: 18, color: "#92400E" },
  runtimeHint: {
    fontSize: 12,
    lineHeight: 18,
    color: "#A16207",
    marginTop: 6,
  },
  recoverySection: { marginHorizontal: 16, marginBottom: 12, gap: 8 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#334155",
    marginBottom: 2,
  },
  recoveryCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E9EDF4",
    backgroundColor: "#fff",
    padding: 12,
  },
  recoveryTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  recoveryTitleWrap: { flex: 1 },
  recoveryTitle: { fontSize: 14, fontWeight: "800", color: "#111827" },
  recoverySubtitle: { fontSize: 12, color: "#64748B", marginTop: 3 },
  recoveryDate: { fontSize: 12, color: "#8A94A6", marginTop: 8 },
  recoveryNote: {
    fontSize: 12,
    lineHeight: 17,
    color: "#92400E",
    marginTop: 7,
  },
  recoveryError: {
    fontSize: 12,
    lineHeight: 17,
    color: "#B91C1C",
    marginTop: 7,
  },
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
  infoBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    borderRadius: 12,
    backgroundColor: "#FFFBEB",
    padding: 10,
    marginTop: 12,
  },
  infoText: { flex: 1, fontSize: 12, lineHeight: 17, color: "#92400E" },
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
