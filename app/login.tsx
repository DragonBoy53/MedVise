import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const { height } = Dimensions.get("window");

export default function LoginScreen() {
  const router = useRouter();

  const dotOpacity = useRef(new Animated.Value(1)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const cardSlide = useRef(new Animated.Value(height)).current;

  const [displayText, setDisplayText] = useState("");

  useEffect(() => {
    startAnimation();
  }, []);

  const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));

  const fadeIn = (anim: Animated.Value, duration = 600) =>
    Animated.timing(anim, {
      toValue: 1,
      duration,
      useNativeDriver: true,
    });

  const fadeOut = (anim: Animated.Value, duration = 600) =>
    Animated.timing(anim, {
      toValue: 0,
      duration,
      useNativeDriver: true,
    });

  const startAnimation = async () => {
    await wait(800);
    fadeOut(dotOpacity, 800).start();

    await wait(1000);
    Animated.spring(cardSlide, {
      toValue: 0,
      useNativeDriver: true,
      friction: 6,
      tension: 50,
    }).start();

    
    loopText();
  };


  const loopText = async () => {
    const texts = ["MedVise", "Let's Classify", "Let's Go"];
    let i = 0;
    while (true) {
      setDisplayText(texts[i]);
      fadeIn(textOpacity, 600).start();
      await wait(1500);
      fadeOut(textOpacity, 400).start();
      await wait(400);
      i = (i + 1) % texts.length;
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#000" }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Animated.View style={[styles.container]}>
        {/* Center animation area */}
        <View style={styles.centerArea}>
          <Animated.View style={[styles.dot, { opacity: dotOpacity }]} />
          {displayText !== "" && (
            <Animated.Text
              style={[styles.titleText, { opacity: textOpacity, color: "#fff" }]}
            >
              {displayText}
            </Animated.Text>
          )}
        </View>

   
        <Animated.View
          style={[
            styles.cardContainer,
            { transform: [{ translateY: cardSlide }] },
          ]}
        >
          <ScrollView
            contentContainerStyle={styles.scrollInner}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.cardTitle}>Login</Text>

            <TextInput
              placeholder="Email"
              placeholderTextColor="#aaa"
              style={styles.input}
              keyboardType="email-address"
            />
            <TextInput
              placeholder="Password"
              placeholderTextColor="#aaa"
              style={styles.input}
              secureTextEntry
            />

            <TouchableOpacity style={styles.googleButton}>
              <Text style={styles.googleText}>Continue with Google</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.loginBtn}
              onPress={() => router.push("/chat")}
            >
              <Text style={styles.loginText}>Login</Text>
            </TouchableOpacity>

            <View style={styles.signupRow}>
              <Text style={styles.signupText}>Don't have an account? </Text>
              <TouchableOpacity onPress={() => router.push("/signup")}>
                <Text style={styles.signupLink}>Sign Up</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  centerArea: {
    position: "absolute",
    top: "25%",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#fff",
  },
  titleText: {
    fontSize: 30,
    fontWeight: "700",
    marginTop: 20,
  },
  cardContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#111",
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    padding: 20,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
    height: 450,
  },
  scrollInner: { flexGrow: 1, justifyContent: "center" },
  cardTitle: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 20,
    textAlign: "center",
    color: "#fff",
  },
  input: {
    borderWidth: 1,
    borderColor: "#555",
    borderRadius: 8,
    padding: 12,
    marginBottom: 15,
    color: "#fff",
  },
  googleButton: {
    borderWidth: 1,
    borderColor: "#555",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 15,
  },
  googleText: { fontWeight: "600", color: "#fff" },
  loginBtn: {
    backgroundColor: "#007AFF",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 15,
  },
  loginText: { color: "#fff", fontWeight: "600" },
  signupRow: {
    flexDirection: "row",
    justifyContent: "center",
  },
  signupText: { color: "#aaa" },
  signupLink: { color: "#4A90E2", fontWeight: "600" },
});
