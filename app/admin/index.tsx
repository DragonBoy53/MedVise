import { useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import {
    Animated,
    Image,
    Modal,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

function UserAvatar({
  url,
  initials,
  size,
}: {
  url: string;
  initials: string;
  size: number;
}) {
  const [failed, setFailed] = useState(false);
  const radius = size / 2;
  if (url && !failed) {
    return (
      <Image
        source={{ uri: url }}
        style={{
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: "#ddd",
        }}
        onError={() => setFailed(true)}
        resizeMode="cover"
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: "#111",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: "#fff", fontSize: size * 0.35, fontWeight: "700" }}>
        {initials}
      </Text>
    </View>
  );
}

export default function AdminDashboard() {
  const { user } = useUser();
  const { signOut } = useAuth();
  const router = useRouter();

  const [showProfile, setShowProfile] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.88)).current;

  const fullName = user?.fullName || "";
  const firstName = user?.firstName || "";
  const lastName = user?.lastName || "";
  const email = user?.primaryEmailAddress?.emailAddress || "";
  const phone = user?.primaryPhoneNumber?.phoneNumber || null;
  const username = user?.username || null;
  const role = (user?.unsafeMetadata?.role as string) || null;
  const createdAt = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;
  const googleAccount = user?.externalAccounts?.find(
    (a) => a.provider === "google",
  );
  const googlePhoto = googleAccount?.imageUrl || null;
  const clerkPhoto = user?.imageUrl || null;
  const avatarUrl =
    googlePhoto ||
    clerkPhoto ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName || email || "U")}&background=111111&color=fff&size=128&bold=true&format=png`;
  const displayName = fullName || email || "MedVise User";
  const initials =
    `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() ||
    email.charAt(0).toUpperCase() ||
    "U";

  const openProfile = () => {
    setShowProfile(true);
    Animated.parallel([
      Animated.spring(fadeAnim, {
        toValue: 1,
        useNativeDriver: true,
        friction: 9,
        tension: 80,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        friction: 9,
        tension: 80,
      }),
    ]).start();
  };

  const closeProfile = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.88,
        duration: 160,
        useNativeDriver: true,
      }),
    ]).start(() => setShowProfile(false));
  };

  const handleSignOut = () => {
    closeProfile();
    setTimeout(async () => {
      await signOut();
      router.replace("/(auth)/sign-in");
    }, 200);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* ── TopBar — identical to chat ── */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => router.push("/settings")}
          style={{ width: 40 }}
        >
          <Ionicons name="settings-outline" size={22} color="#444" />
        </TouchableOpacity>
        <Text style={styles.title}>MedVise</Text>
        <TouchableOpacity onPress={openProfile} activeOpacity={0.75}>
          <UserAvatar url={avatarUrl} initials={initials} size={36} />
        </TouchableOpacity>
      </View>

      {/* ── Cards ── */}
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Admin Panel</Text>

        <TouchableOpacity
          style={[styles.card, { borderLeftColor: "#4A90E2" }]}
          onPress={() => router.push("/chat")}
        >
          <View style={[styles.cardIcon, { backgroundColor: "#E3F2FD" }]}>
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={26}
              color="#1565C0"
            />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>MedVise Chat</Text>
            <Text style={styles.cardDesc}>
              Access the AI assistant — same view as patients
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#aaa" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.card, { borderLeftColor: "#34C759" }]}
          onPress={() => router.push("/admin/metrics" as any)}
        >
          <View style={[styles.cardIcon, { backgroundColor: "#E8F5E9" }]}>
            <Ionicons name="bar-chart-outline" size={26} color="#2E7D32" />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Model Performance</Text>
            <Text style={styles.cardDesc}>
              Monitor metrics, accuracy & false alarm rates
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#aaa" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.card, { borderLeftColor: "#FF9500" }]}
          onPress={() => router.push("/admin/backup" as any)}
        >
          <View style={[styles.cardIcon, { backgroundColor: "#FFF3E0" }]}>
            <Ionicons name="cloud-upload-outline" size={26} color="#E65100" />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Backup & Recovery</Text>
            <Text style={styles.cardDesc}>
              Trigger data backups and system recovery
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#aaa" />
        </TouchableOpacity>
      </ScrollView>

      {/* ── Profile Modal — identical to chat ── */}
      <Modal
        transparent
        visible={showProfile}
        animationType="none"
        onRequestClose={closeProfile}
      >
        <TouchableOpacity
          style={profileStyles.overlay}
          activeOpacity={1}
          onPress={closeProfile}
        >
          <Animated.View
            style={[
              profileStyles.card,
              { opacity: fadeAnim, transform: [{ scale: scaleAnim }] },
            ]}
          >
            <TouchableOpacity activeOpacity={1}>
              <View style={profileStyles.header}>
                <View style={profileStyles.avatarWrap}>
                  <UserAvatar url={avatarUrl} initials={initials} size={72} />
                  <View style={profileStyles.onlineDot} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={profileStyles.name} numberOfLines={1}>
                    {displayName}
                  </Text>
                  {username ? (
                    <Text style={profileStyles.username}>@{username}</Text>
                  ) : null}
                  <View style={profileStyles.badgeRow}>
                    <View
                      style={[profileStyles.badge, { backgroundColor: "#111" }]}
                    >
                      <Text
                        style={[profileStyles.badgeText, { color: "#fff" }]}
                      >
                        {role
                          ? role.charAt(0).toUpperCase() + role.slice(1)
                          : "Admin"}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              <View style={profileStyles.divider} />

              <View style={profileStyles.infoSection}>
                {email ? (
                  <View style={profileStyles.infoRow}>
                    <View
                      style={[
                        profileStyles.infoIconWrap,
                        { backgroundColor: "#f0f0f0" },
                      ]}
                    >
                      <Ionicons name="mail-outline" size={15} color="#444" />
                    </View>
                    <Text style={profileStyles.infoText} numberOfLines={1}>
                      {email}
                    </Text>
                  </View>
                ) : null}
                {phone ? (
                  <View style={profileStyles.infoRow}>
                    <View
                      style={[
                        profileStyles.infoIconWrap,
                        { backgroundColor: "#f5f5f5" },
                      ]}
                    >
                      <Ionicons name="call-outline" size={15} color="#444" />
                    </View>
                    <Text style={profileStyles.infoText}>{phone}</Text>
                  </View>
                ) : null}
                {firstName && lastName ? (
                  <View style={profileStyles.infoRow}>
                    <View
                      style={[
                        profileStyles.infoIconWrap,
                        { backgroundColor: "#f5f5f5" },
                      ]}
                    >
                      <Ionicons name="person-outline" size={15} color="#444" />
                    </View>
                    <Text style={profileStyles.infoText}>
                      {firstName} {lastName}
                    </Text>
                  </View>
                ) : null}
                {createdAt ? (
                  <View style={profileStyles.infoRow}>
                    <View
                      style={[
                        profileStyles.infoIconWrap,
                        { backgroundColor: "#f5f5f5" },
                      ]}
                    >
                      <Ionicons
                        name="calendar-outline"
                        size={15}
                        color="#444"
                      />
                    </View>
                    <Text style={profileStyles.infoText}>
                      Member since {createdAt}
                    </Text>
                  </View>
                ) : null}
              </View>

              <View style={profileStyles.divider} />

              <View style={profileStyles.actions}>
                <TouchableOpacity
                  style={profileStyles.closeBtn}
                  onPress={closeProfile}
                >
                  <Text style={profileStyles.closeBtnText}>Close</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={profileStyles.signOutBtn}
                  onPress={handleSignOut}
                >
                  <Ionicons name="log-out-outline" size={16} color="#fff" />
                  <Text style={profileStyles.signOutText}>Sign Out</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  topBar: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
    backgroundColor: "#fff",
    zIndex: 10,
  },
  title: { fontSize: 16, fontWeight: "600", color: "#222" },
  content: { padding: 20, gap: 14 },
  sectionTitle: {
    color: "#222",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 6,
  },
  card: {
    backgroundColor: "#f9f9f9",
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderLeftWidth: 4,
    borderWidth: 0.5,
    borderColor: "#eee",
  },
  cardIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  cardText: { flex: 1 },
  cardTitle: {
    color: "#111",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 3,
  },
  cardDesc: { color: "#888", fontSize: 12, lineHeight: 17 },
});

const profileStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  card: {
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 28,
    paddingTop: 24,
    paddingBottom: 20,
    paddingHorizontal: 20,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 30,
    elevation: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
    gap: 14,
  },
  avatarWrap: { position: "relative" },
  onlineDot: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#111",
    borderWidth: 2,
    borderColor: "#fff",
  },
  name: { fontSize: 18, fontWeight: "700", color: "#111", marginBottom: 2 },
  username: { fontSize: 13, color: "#999", marginBottom: 6 },
  badgeRow: { flexDirection: "row" },
  badge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  divider: { height: 0.6, backgroundColor: "#f0f0f0", marginVertical: 14 },
  infoSection: { gap: 12 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  infoIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  infoText: { fontSize: 14, color: "#444", flex: 1 },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 4,
  },
  closeBtn: {
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e8e8e8",
    backgroundColor: "#fafafa",
  },
  closeBtnText: { fontSize: 14, color: "#555", fontWeight: "500" },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: "#111",
  },
  signOutText: { fontSize: 14, color: "#fff", fontWeight: "600" },
});
