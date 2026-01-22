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
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// @ts-ignore
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
      console.log("Sending message...");

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
  };

  const takePhoto = async () => {
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
  };

  const renderMessage = ({ item }: { item: Message }) => (
    <View
      style={[styles.message, item.fromUser ? styles.userMsg : styles.botMsg]}
    >
      {item.imageUri && (
        <Image source={{ uri: item.imageUri }} style={styles.sentImage} />
      )}
      {item.text ? (
        <Text style={item.fromUser ? styles.userText : styles.botText}>
          {item.text}
        </Text>
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

      <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.container}>
            <FlatList
              inverted
              data={messages}
              keyExtractor={(item) => item.id}
              renderItem={renderMessage}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={renderEmptyComponent}
              style={{ flex: 1 }}
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
                <TouchableOpacity style={styles.iconBtn} onPress={takePhoto}>
                  <Ionicons name="camera-outline" size={22} color="#444" />
                </TouchableOpacity>

                <TouchableOpacity style={styles.iconBtn} onPress={pickImage}>
                  <Ionicons name="image-outline" size={22} color="#444" />
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
      </TouchableWithoutFeedback>
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
      `Logged in as ${
        user?.fullName || user?.primaryEmailAddress?.emailAddress
      }`,
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
    borderBottomWidth: 0.3,
    borderBottomColor: "#eee",
    backgroundColor: "#fff",
    zIndex: 10,
  },
  title: { fontSize: 16, fontWeight: "600", color: "#222" },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#eee" },
  container: { flex: 1 },
  listContent: { padding: 16, flexGrow: 1 },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    transform: [{ scaleY: -1 }],
  },
  message: {
    marginVertical: 6,
    padding: 12,
    borderRadius: 12,
    maxWidth: "80%",
  },
  userMsg: { backgroundColor: "#000", alignSelf: "flex-end" },
  botMsg: { backgroundColor: "#F5F5F7", alignSelf: "flex-start" },
  userText: { color: "#fff", fontSize: 15 },
  botText: { color: "#333", fontSize: 15 },
  sentImage: {
    width: 200,
    height: 200,
    borderRadius: 10,
    resizeMode: "cover",
    marginBottom: 5,
  },
  centerWrapper: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  pulse: {
    position: "absolute",
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#D3D3D3",
  },
  centerBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#000",
  },
  bottomWrapper: {
    left: 0,
    right: 0,
    bottom: 0,
    paddingBottom: Platform.OS === "ios" ? 24 : 8,
    backgroundColor: "#ffffff00",
  },
  previewContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingBottom: 8,
    alignItems: "flex-end",
  },
  previewImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    marginRight: 8,
    backgroundColor: "#eee",
  },
  removePreviewBtn: {
    position: "absolute",
    top: -5,
    left: 85,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 12,
    backgroundColor: "#f5f5f7",
    padding: 6,
    borderRadius: 25,
  },
  iconBtn: { paddingHorizontal: 6, paddingVertical: 6 },
  input: {
    flex: 1,
    maxHeight: 100,
    fontSize: 15,
    color: "#111",
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  sendBtn: {
    height: 38,
    minWidth: 38,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 4,
  },
  sendBtnEnabled: { backgroundColor: "#000" },
  sendBtnDisabled: { backgroundColor: "#BDBDBD" },
});
