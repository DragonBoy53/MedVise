import { useAuth, useUser } from "@clerk/clerk-expo";
import { FontAwesome5, Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Markdown from "react-native-markdown-display";
import { SafeAreaView } from "react-native-safe-area-context";
import apiClient from "../api/client";

type Message = {
  id: string;
  text?: string;
  imageUri?: string;
  fromUser: boolean;
};

const WINDOW = Dimensions.get("window");

export default function ChatScreen() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showAttachMenu, setShowAttachMenu] = useState(false);

  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.6)).current;
  const centerScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulseScale, {
            toValue: 1.25,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseScale, {
            toValue: 1,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(pulseOpacity, {
            toValue: 0.05,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseOpacity, {
            toValue: 0.6,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ]),
    ).start();
  }, []);

  const handleCenterPress = () => {
    Animated.sequence([
      Animated.timing(centerScale, {
        toValue: 0.9,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(centerScale, {
        toValue: 1,
        duration: 120,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const sendMessage = async () => {
    if (!input.trim() && !selectedImage) return;

    const currentInput = input;
    const currentImage = selectedImage;

    const newMsg: Message = {
      id: Date.now().toString(),
      text: currentInput,
      imageUri: currentImage || undefined,
      fromUser: true,
    };

    setMessages((m) => [newMsg, ...m]);
    setInput("");
    setSelectedImage(null);
    Keyboard.dismiss();

    try {
      const formData = new FormData();

      if (currentInput.trim()) {
        formData.append("message", currentInput);
      }

      if (currentImage) {
        const filename = currentImage.split("/").pop();
        const match = /\.(\w+)$/.exec(filename || "");
        const type = match ? `image/${match[1]}` : `image/jpeg`;
        // @ts-ignore
        formData.append("image", { uri: currentImage, name: filename, type });
      }

      const response = await apiClient.post("/api/chat", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: response.data.reply,
        fromUser: false,
      };
      setMessages((m) => [botMsg, ...m]);
    } catch (error: any) {
      console.error("Chat Error:", error);
      Alert.alert("Error", "Could not connect to MedVise AI.");
    }
  };

  const pickImage = async () => {
    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Required", "We need access to your photos.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 0.8,
      });
      if (!result.canceled && result.assets?.length > 0) {
        setSelectedImage(result.assets[0].uri);
      }
    } catch (error) {
      console.log("Error picking image:", error);
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission Denied", "Camera access is required.");
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        quality: 0.7,
      });
      if (!result.canceled && result.assets?.length > 0) {
        setSelectedImage(result.assets[0].uri);
      }
    } catch (error) {
      console.log("Error taking photo:", error);
    }
  };

  // const scanDocument = async () => {
  //   try {
  //     if (Platform.OS === "web") {
  //       Alert.alert(
  //         "Not Supported",
  //         "Document scanning is only available on Android and iOS builds.",
  //       );
  //       return;
  //     }

  //     const scannerModule = require("react-native-document-scanner-plugin");
  //     const DocumentScanner = scannerModule.default;
  //     const ResponseType = scannerModule.ResponseType;
  //     const ScanDocumentResponseStatus =
  //       scannerModule.ScanDocumentResponseStatus;

  //     const { scannedImages, status } = await DocumentScanner.scanDocument({
  //       maxNumDocuments: 1,
  //       responseType: ResponseType.ImageFilePath,
  //     });

  //     if (scannedImages?.length) {
  //       setSelectedImage(scannedImages[0]);
  //       return;
  //     }

  //     if (status === ScanDocumentResponseStatus.Cancel) {
  //       return;
  //     }

  //     Alert.alert("No Scan Captured", "Please scan a document and try again.");
  //   } catch (error) {
  //     console.log("Error scanning document:", error);
  //     Alert.alert(
  //       "Scanner Unavailable",
  //       "Document scanner could not start. Make sure you are using a native development build, not Expo Go.",
  //     );
  //   }
  // };

  const renderMessage = ({ item }: { item: Message }) => (
    <View
      style={[styles.message, item.fromUser ? styles.userMsg : styles.botMsg]}
    >
      {item.imageUri && (
        <Image source={{ uri: item.imageUri }} style={styles.sentImage} />
      )}
      {item.text ? (
        <View style={styles.textWrapper}>
          <Markdown
            style={item.fromUser ? userMarkdownStyles : botMarkdownStyles}
            mergeStyle={true}
          >
            {item.text}
          </Markdown>
        </View>
      ) : null}
    </View>
  );

  const renderEmptyComponent = () => {
    if (messages.length > 0) return null;
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.centerWrapper} pointerEvents="box-none">
          <Animated.View
            style={[
              styles.pulse,
              { transform: [{ scale: pulseScale }], opacity: pulseOpacity },
            ]}
          />
          <Animated.View style={{ transform: [{ scale: centerScale }] }}>
            <TouchableOpacity
              onPress={handleCenterPress}
              style={styles.centerBtn}
            >
              <FontAwesome5 name="plus" size={36} color="#000" />
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      <TopBar />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <View style={styles.container}>
          <FlatList
            inverted
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={renderEmptyComponent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          />

          <View style={styles.bottomWrapper}>
            {selectedImage && (
              <View style={styles.previewContainer}>
                <Image
                  source={{ uri: selectedImage }}
                  style={styles.previewImage}
                />
                <TouchableOpacity
                  style={styles.removePreviewBtn}
                  onPress={() => setSelectedImage(null)}
                >
                  <Ionicons name="close" size={16} color="#fff" />
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.inputRow}>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => {
                  Keyboard.dismiss();
                  setShowAttachMenu(true);
                }}
              >
                <Ionicons name="add-circle-outline" size={28} color="#444" />
              </TouchableOpacity>

              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder={selectedImage ? "Add a caption..." : "Message"}
                placeholderTextColor="#666"
                style={styles.input}
                multiline
              />

              <TouchableOpacity
                style={[
                  styles.sendBtn,
                  !input.trim() && !selectedImage
                    ? styles.sendBtnDisabled
                    : styles.sendBtnEnabled,
                ]}
                onPress={sendMessage}
                disabled={!input.trim() && !selectedImage}
              >
                <Ionicons name="arrow-up" size={20} color="#fff" />
              </TouchableOpacity>

              <TouchableOpacity style={styles.iconBtn}>
                <Ionicons name="mic-outline" size={22} color="#444" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>

      <Modal
        transparent={true}
        visible={showAttachMenu}
        onRequestClose={() => setShowAttachMenu(false)}
        animationType="fade"
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowAttachMenu(false)}
        >
          <View style={styles.attachMenu}>
            <TouchableOpacity
              style={styles.attachOption}
              onPress={() => {
                setShowAttachMenu(false);
                setTimeout(() => takePhoto(), 300);
              }}
            >
              <View style={[styles.optionIcon, { backgroundColor: "#E3F2FD" }]}>
                <Ionicons name="camera" size={20} color="#1565C0" />
              </View>
              <Text style={styles.attachText}>Camera</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.attachOption}
              onPress={() => {
                setShowAttachMenu(false);
                setTimeout(() => pickImage(), 300);
              }}
            >
              <View style={[styles.optionIcon, { backgroundColor: "#E8F5E9" }]}>
                <Ionicons name="images" size={20} color="#2E7D32" />
              </View>
              <Text style={styles.attachText}>Gallery</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.attachOption}
              onPress={() => {
                setShowAttachMenu(false);
                //setTimeout(() => scanDocument(), 300);
              }}
            >
              <View style={[styles.optionIcon, { backgroundColor: "#F3E5F5" }]}>
                <Ionicons name="scan" size={20} color="#7B1FA2" />
              </View>
              <Text style={styles.attachText}>Scanner</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

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
        onError={() => {
          console.log("Avatar load failed for:", url);
          setFailed(true);
        }}
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

function TopBar() {
  const { user } = useUser();
  const { signOut } = useAuth();
  const router = useRouter();

  const [showProfile, setShowProfile] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.88)).current;

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
      try {
        await signOut();
        router.replace("/(auth)/sign-in");
      } catch (err) {
        console.error("Sign out error:", err);
      }
    }, 200);
  };

  const fullName = user?.fullName || "";
  const firstName = user?.firstName || "";
  const lastName = user?.lastName || "";
  const email = user?.primaryEmailAddress?.emailAddress || "";
  const phone = user?.primaryPhoneNumber?.phoneNumber || null;
  const username = user?.username || null;
  const role = (user?.unsafeMetadata?.role as string) || null;
  const isAdmin = role === "admin";
  const createdAt = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;
  // Get Google profile photo directly from externalAccounts if available
  const googleAccount = user?.externalAccounts?.find(
    (a) => a.provider === "google",
  );
  const googlePhoto = googleAccount?.imageUrl || null;
  // Clerk imageUrl works for Google signups — use it directly with a cache-bust
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

  return (
    <>
      {/* ── Navigation bar ── */}
      <View style={styles.topBar}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {isAdmin && (
            <TouchableOpacity
              onPress={() => router.replace("/admin" as any)}
              style={{ marginRight: 4 }}
            >
              <Ionicons name="arrow-back" size={22} color="#444" />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => router.push("/settings")}
            style={{ width: 40 }}
          >
            <Ionicons name="settings-outline" size={22} color="#444" />
          </TouchableOpacity>
        </View>
        <Text style={styles.title}>MedVise</Text>
        <TouchableOpacity onPress={openProfile} activeOpacity={0.75}>
          <UserAvatar url={avatarUrl} initials={initials} size={36} />
        </TouchableOpacity>
      </View>

      {/* ── Profile popup ── */}
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
                    {role ? (
                      <View
                        style={[
                          profileStyles.badge,
                          { backgroundColor: "#f0f0f0" },
                        ]}
                      >
                        <Text
                          style={[profileStyles.badgeText, { color: "#111" }]}
                        >
                          {role.charAt(0).toUpperCase() + role.slice(1)}
                        </Text>
                      </View>
                    ) : (
                      <View style={profileStyles.badge}>
                        <Text style={profileStyles.badgeText}>
                          MedVise User
                        </Text>
                      </View>
                    )}
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
    </>
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
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#eee" },
  container: { flex: 1 },
  listContent: {
    padding: 16,
    paddingBottom: 24,
    flexGrow: 1,
    justifyContent: "flex-end",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    transform: [{ scaleY: -1 }],
    paddingBottom: 50,
  },
  message: {
    marginVertical: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    maxWidth: "80%",
    minWidth: 48,
  },
  userMsg: {
    backgroundColor: "#000000ff",
    alignSelf: "flex-end",
    borderBottomRightRadius: 4,
  },
  botMsg: {
    backgroundColor: "#F2F2F7",
    alignSelf: "flex-start",
    borderBottomLeftRadius: 4,
  },
  textWrapper: { flexShrink: 1 },
  sentImage: {
    width: 200,
    height: 200,
    borderRadius: 14,
    resizeMode: "cover",
    marginBottom: 6,
    backgroundColor: "#e1e1e1",
  },
  centerWrapper: {
    width: 80,
    height: 80,
    alignItems: "center",
    justifyContent: "center",
  },
  pulse: {
    position: "absolute",
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#E3F2FD",
  },
  centerBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#eee",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  bottomWrapper: {
    width: "100%",
    backgroundColor: "#fff",
    borderTopWidth: 0.5,
    borderTopColor: "#eee",
    paddingBottom: Platform.OS === "ios" ? 4 : 0,
  },
  previewContainer: {
    flexDirection: "row",
    padding: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  previewImage: {
    width: 70,
    height: 70,
    borderRadius: 8,
    backgroundColor: "#eee",
  },
  removePreviewBtn: {
    position: "absolute",
    top: 6,
    left: 72,
    backgroundColor: "#333",
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  iconBtn: {
    padding: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  input: {
    flex: 1,
    maxHeight: 120,
    minHeight: 40,
    fontSize: 16,
    color: "#111",
    backgroundColor: "#f5f5f5",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    marginHorizontal: 4,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
    marginBottom: 0,
  },
  sendBtnEnabled: { backgroundColor: "#000000ff" },
  sendBtnDisabled: { backgroundColor: "#E0E0E0" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  attachMenu: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: Platform.OS === "ios" ? 40 : 24,
    flexDirection: "row",
    justifyContent: "space-around",
  },
  attachOption: { alignItems: "center" },
  optionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  attachText: { fontSize: 13, color: "#333", fontWeight: "500" },
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
  bigAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#e0e0e0",
    borderWidth: 2.5,
    borderColor: "#f0f0f0",
  },
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
  name: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111",
    marginBottom: 2,
  },
  username: {
    fontSize: 13,
    color: "#999",
    marginBottom: 6,
  },
  badgeRow: { flexDirection: "row" },
  badge: {
    backgroundColor: "#f0f0f0",
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 11,
    color: "#111",
    fontWeight: "700",
  },
  divider: {
    height: 0.6,
    backgroundColor: "#f0f0f0",
    marginVertical: 14,
  },
  infoSection: { gap: 12 },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  infoIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  infoText: {
    fontSize: 14,
    color: "#444",
    flex: 1,
  },
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
  closeBtnText: {
    fontSize: 14,
    color: "#555",
    fontWeight: "500",
  },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: "#111",
  },
  signOutText: {
    fontSize: 14,
    color: "#fff",
    fontWeight: "600",
  },
});

const userMarkdownStyles = StyleSheet.create({
  body: { color: "#fff", fontSize: 16, lineHeight: 22 },
  paragraph: { margin: 0, padding: 0 },
  strong: { fontWeight: "bold", color: "#fff" },
});

const botMarkdownStyles = StyleSheet.create({
  body: { color: "#111", fontSize: 16, lineHeight: 22 },
  paragraph: { margin: 0, padding: 0 },
  strong: { fontWeight: "bold", color: "#000" },
});
