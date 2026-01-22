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
import { SafeAreaView } from "react-native-safe-area-context";

// @ts-ignore
import Markdown from "react-native-markdown-display";
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

  // Animation Loop
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
      ])
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
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
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

  const renderMessage = ({ item }: { item: Message }) => (
    <View
      style={[
        styles.message,
        item.fromUser ? styles.userMsg : styles.botMsg,
        // Optional: Add specific width logic if needed, but flex-start/end handles it naturally
      ]}
    >
      {item.imageUri && (
        <Image source={{ uri: item.imageUri }} style={styles.sentImage} />
      )}
      {item.text ? (
        <View style={styles.textWrapper}>
          <Markdown
            style={item.fromUser ? userMarkdownStyles : botMarkdownStyles}
            // Prevent Markdown from collapsing completely or stretching weirdly
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
        behavior={Platform.OS === "ios" ? "padding" : undefined}
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

      {/* Attachment Menu Modal */}
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
                // Slight delay to allow modal to close smoothly before camera opens
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
                Alert.alert("Coming Soon", "Document scanner is under maintenance.");
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

function TopBar() {
  const { user } = useUser();
  const { signOut } = useAuth();
  const router = useRouter();

  const handleProfilePress = () => {
    Alert.alert(
      "Profile",
      `Logged in as ${user?.fullName || user?.primaryEmailAddress?.emailAddress}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: async () => {
            try {
              await signOut();
              router.replace("/(auth)/sign-in");
            } catch (err) {
              console.error("Sign out error:", err);
            }
          },
        },
      ]
    );
  };
  return (
    <View style={styles.topBar}>
      <View style={{ width: 40 }} />
      <Text style={styles.title}>MedVise</Text>
      <TouchableOpacity onPress={handleProfilePress}>
        <Image
          source={{
            uri:
              user?.imageUrl ||
              "https://api.dicebear.com/7.x/initials/svg?seed=Guest",
          }}
          style={styles.avatar}
        />
      </TouchableOpacity>
    </View>
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
    paddingHorizontal: 14, // Nice horizontal breathing room
    paddingVertical: 10,   // Balanced vertical height
    borderRadius: 20,      // Softer, more modern roundness
    maxWidth: "80%",       // Prevents super wide messages
    minWidth: 48,          // Prevents "Hi" from being a tiny circle
  },
  userMsg: {
    backgroundColor: "#000000ff",
    alignSelf: "flex-end",
    borderBottomRightRadius: 4, // Subtle corner accent
  },
  botMsg: {
    backgroundColor: "#F2F2F7", // Slightly darker gray for better contrast on white
    alignSelf: "flex-start",
    borderBottomLeftRadius: 4,
  },
  textWrapper: {
    // Ensures text container doesn't force extra width
    flexShrink: 1,
  },

  // --- Images ---
  sentImage: {
    width: 200,
    height: 200,
    borderRadius: 14,
    resizeMode: "cover",
    marginBottom: 6,
    backgroundColor: "#e1e1e1",
  },

  // --- Animation & UI ---
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

// --- Fixed Markdown Styles ---
// We remove margins here so the bubble padding controls the look
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