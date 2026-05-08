import { useAuth } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
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
import apiClient from "../api/client";

type ChatSession = {
  id: string;
  specialty: string | null;
  status: string;
  summary: string | null;
  startedAt: string;
  lastMessageAt: string;
  messageCount: number;
  firstUserMessage: string | null;
};

type ChatMessage = {
  id: number;
  senderRole: "user" | "assistant";
  content: string | null;
  attachmentType: string | null;
  attachmentMimeType: string | null;
  attachmentOriginalName: string | null;
  imageUrl: string | null;
  createdAt: string;
};

type ChatDetail = ChatSession & {
  messages: ChatMessage[];
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function titleForSession(item: ChatSession) {
  if (item.firstUserMessage) {
    return item.firstUserMessage.replace(/\s+/g, " ").trim();
  }

  if (item.specialty) {
    return `${item.specialty.charAt(0).toUpperCase()}${item.specialty.slice(1)} chat`;
  }

  return "MedVise chat";
}

function specialtyIcon(
  specialty: string | null,
): keyof typeof Ionicons.glyphMap {
  const key = specialty?.toLowerCase();
  if (key === "cardiology") return "heart-outline";
  if (key === "diabetes") return "water-outline";
  if (key === "thyroid") return "pulse-outline";
  return "chatbubble-ellipses-outline";
}

export default function HistoryScreen() {
  const { getToken } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<ChatSession[]>([]);
  const [selectedChat, setSelectedChat] = useState<ChatDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadHistory = useCallback(
    async (isRefresh = false) => {
      try {
        if (isRefresh) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        const token = await getToken();
        const response = await apiClient.get("/api/chat/history", {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        setItems(response.data?.items || []);
      } catch (error: any) {
        console.error("Failed to load chat history", error);
        Alert.alert(
          "History unavailable",
          error?.response?.data?.message || "Could not load your chat history.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [getToken],
  );

  const openChat = useCallback(
    async (item: ChatSession) => {
      try {
        setDetailLoading(true);
        const token = await getToken();
        const response = await apiClient.get(`/api/chat/history/${item.id}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        setSelectedChat(response.data?.item || null);
      } catch (error: any) {
        console.error("Failed to load chat", error);
        Alert.alert(
          "Chat unavailable",
          error?.response?.data?.message || "Could not load this chat.",
        );
      } finally {
        setDetailLoading(false);
      }
    },
    [getToken],
  );

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [loadHistory]),
  );

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>History</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#111827" />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadHistory(true)}
              tintColor="#111827"
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {items.length ? (
            items.map((item) => (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.82}
                style={styles.card}
                onPress={() => openChat(item)}
                disabled={detailLoading}
              >
                <View style={styles.iconWrap}>
                  <Ionicons
                    name={specialtyIcon(item.specialty)}
                    size={20}
                    color="#111827"
                  />
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {titleForSession(item)}
                  </Text>
                  <Text style={styles.cardMeta}>
                    {formatDateTime(item.lastMessageAt)} - {item.messageCount}{" "}
                    messages
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#C5CBD5" />
              </TouchableOpacity>
            ))
          ) : (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="time-outline" size={34} color="#B6BEC9" />
              </View>
              <Text style={styles.emptyTitle}>No saved chats yet</Text>
              <Text style={styles.emptySubtitle}>
                Send a message to MedVise and the conversation will appear here
                with its date and time.
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      <Modal
        visible={Boolean(selectedChat)}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedChat(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <View style={styles.sheetTitleWrap}>
                <Text style={styles.sheetTitle}>Saved Chat</Text>
                {selectedChat?.lastMessageAt ? (
                  <Text style={styles.sheetSubtitle}>
                    {formatDateTime(selectedChat.lastMessageAt)}
                  </Text>
                ) : null}
              </View>
              <TouchableOpacity
                onPress={() => setSelectedChat(null)}
                style={styles.closeBtn}
              >
                <Ionicons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.messagesScroll}
              contentContainerStyle={styles.messagesContent}
              showsVerticalScrollIndicator={false}
            >
              {selectedChat?.messages.map((message) => {
                const fromUser = message.senderRole === "user";
                return (
                  <View
                    key={message.id}
                    style={[
                      styles.messageBubble,
                      fromUser ? styles.userBubble : styles.assistantBubble,
                    ]}
                  >
                    {message.imageUrl ? (
                      <Image
                        source={{ uri: message.imageUrl }}
                        style={styles.messageImage}
                      />
                    ) : null}
                    {message.content ? (
                      <Text
                        style={[
                          styles.messageText,
                          fromUser && styles.userMessageText,
                        ]}
                      >
                        {message.content}
                      </Text>
                    ) : null}
                    <Text
                      style={[
                        styles.messageTime,
                        fromUser && styles.userMessageTime,
                      ]}
                    >
                      {formatDateTime(message.createdAt)}
                    </Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
    marginRight: 12,
  },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: "#111827" },
  cardMeta: { fontSize: 12, color: "#8A94A6", marginTop: 4 },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 96,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.35)",
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "88%",
    backgroundColor: "#F8FAFC",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E9EDF2",
  },
  sheetTitleWrap: { flex: 1 },
  sheetTitle: { fontSize: 17, fontWeight: "700", color: "#111827" },
  sheetSubtitle: { fontSize: 12, color: "#8A94A6", marginTop: 3 },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },
  messagesScroll: { flexGrow: 0 },
  messagesContent: { padding: 16, gap: 10, paddingBottom: 34 },
  messageBubble: {
    maxWidth: "86%",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: "#111827",
    borderBottomRightRadius: 5,
  },
  assistantBubble: {
    alignSelf: "flex-start",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#E9EDF4",
    borderBottomLeftRadius: 5,
  },
  messageText: { fontSize: 14, lineHeight: 20, color: "#111827" },
  userMessageText: { color: "#fff" },
  messageImage: {
    width: 220,
    height: 220,
    maxWidth: "100%",
    borderRadius: 14,
    backgroundColor: "#E2E8F0",
    marginBottom: 8,
  },
  messageTime: { fontSize: 10, color: "#94A3B8", marginTop: 6 },
  userMessageTime: { color: "#CBD5E1" },
});
