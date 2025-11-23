import { FontAwesome5, Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert, Animated, Dimensions, Easing, FlatList, Image,
  Keyboard, KeyboardAvoidingView, Platform, StatusBar,
  StyleSheet, Text, TextInput, TouchableOpacity, TouchableWithoutFeedback, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// ✅ Import API Client
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

  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.6)).current;
  const centerScale = useRef(new Animated.Value(1)).current;

  // Pulsing animation
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

  // ✅ UPDATED: Send Message Function connected to Backend
  const sendMessage = async () => {
    if (!input.trim()) return;

    // 1. Optimistic UI: Add user message immediately
    const userMsg: Message = {
      id: Date.now().toString(),
      text: input,
      fromUser: true,
    };
    
    // Update local state immediately
    setMessages((prevMessages) => [userMsg, ...prevMessages]);
    
    // Store input in a temp variable and clear the box
    const messageToSend = input;
    setInput("");
    Keyboard.dismiss();

    try {
      // 2. Call the Backend
      const response = await apiClient.post("/api/chat", {
        message: messageToSend,
        history: [], // Expand this later if you want context
      });

      // 3. Add Bot Response to UI
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: response.data.reply, // Matches backend: res.json({ reply: ... })
        fromUser: false,
      };

      setMessages((prevMessages) => [botMsg, ...prevMessages]);

    } catch (error) {
      console.error("Chat Error:", error);
      Alert.alert("Error", "Could not connect to MedVise AI.");
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission Required",
        "We need access to your photo library to select images."
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.length > 0) {
      const newMsg: Message = {
        id: Date.now().toString(),
        imageUri: result.assets[0].uri,
        fromUser: true,
      };
      setMessages((m) => [newMsg, ...m]);
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission Denied", "Camera access is required to take photos.");
      return;
    }
    
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.7,
    });
    
    if (!result.canceled && result.assets?.length > 0) {
      const newMsg: Message = {
        id: Date.now().toString(),
        imageUri: result.assets[0].uri,
        fromUser: true,
      };
      setMessages((m) => [newMsg, ...m]);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => (
    <View
      style={[
        styles.message,
        item.fromUser ? styles.userMsg : styles.botMsg,
      ]}
    >
      {item.text ? (
        <Text style={item.fromUser ? styles.userText : styles.botText}>
          {item.text}
        </Text>
      ) : item.imageUri ? (
        <Image source={{ uri: item.imageUri }} style={styles.sentImage} />
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
              {
                transform: [{ scale: pulseScale }],
                opacity: pulseOpacity,
              },
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
                  placeholder="Message"
                  placeholderTextColor="#666"
                  style={styles.input}
                  multiline
                />

                <TouchableOpacity
                  style={[
                    styles.sendBtn,
                    !input.trim() ? styles.sendBtnDisabled : styles.sendBtnEnabled,
                  ]}
                  onPress={sendMessage}
                  disabled={!input.trim()}
                >
                  <Ionicons 
                    name="arrow-up"
                    size={20} 
                    color="#fff" 
                  />
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
  return (
    <View style={styles.topBar}>
      <View style={{ width: 40 }} />
      <Text style={styles.title}>MedVise</Text>
      <TouchableOpacity>
        <Image
          source={{
            uri: "https://api.dicebear.com/7.x/initials/svg?seed=ME",
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
  avatar: { width: 40, height: 40, borderRadius: 20 },
  container: { flex: 1 },
  listContent: { 
    padding: 16, 
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    transform: [{ scaleY: -1 }] 
  },
  message: {
    marginVertical: 6,
    padding: 12,
    borderRadius: 12,
    maxWidth: "80%",
  },
  userMsg: { 
    backgroundColor: "#000",
    alignSelf: "flex-end" 
  },
  botMsg: { backgroundColor: "#F5F5F7", alignSelf: "flex-start" },
  userText: { 
    color: "#fff",
    fontSize: 15 
  },
  botText: { color: "#333", fontSize: 15 },
  sentImage: {
    width: 200,
    height: 200,
    borderRadius: 10,
    resizeMode: "cover",
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
    backgroundColor: "#fff",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 12,
    backgroundColor: "#F5F5F7",
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
  sendBtnEnabled: {
    backgroundColor: "#000",
  },
  sendBtnDisabled: { 
    backgroundColor: "#BDBDBD",
  },
});