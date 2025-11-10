import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

export default function SignupScreen() {
  const router = useRouter();


  const translateY = useRef(new Animated.Value(200)).current; 
  const opacityAnim = useRef(new Animated.Value(0)).current;

  const [role, setRole] = useState<"user" | "admin">("user");

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        friction: 6,
        tension: 60,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#000" }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.container}>
  
        <Text style={styles.appTitle}>MedVise</Text>

       
        <Animated.View
          style={[
            styles.cardContainer,
            {
              opacity: opacityAnim,
              transform: [{ translateY }],
            },
          ]}
        >
          <ScrollView
            contentContainerStyle={styles.scrollInner}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.cardTitle}>Sign Up</Text>

            <TextInput
              placeholder="Full Name"
              placeholderTextColor="#aaa"
              style={styles.input}
            />
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

            <Text style={styles.roleLabel}>Sign up as:</Text>
            <View style={styles.roleRow}>
              <TouchableOpacity
                style={[
                  styles.roleOption,
                  role === "user" && styles.roleSelected,
                ]}
                onPress={() => setRole("user")}
              >
                <Text
                  style={[
                    styles.roleText,
                    role === "user" && styles.roleTextSelected,
                  ]}
                >
                  User
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.roleOption,
                  role === "admin" && styles.roleSelected,
                ]}
                onPress={() => setRole("admin")}
              >
                <Text
                  style={[
                    styles.roleText,
                    role === "admin" && styles.roleTextSelected,
                  ]}
                >
                  Admin
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.signupBtn}
              onPress={() => router.push("/login")}
            >
              <Text style={styles.signupText}>Sign Up</Text>
            </TouchableOpacity>

            <View style={styles.loginRow}>
              <Text style={styles.loginPrompt}>Already have an account? </Text>
              <TouchableOpacity onPress={() => router.push("/login")}>
                <Text style={styles.loginLink}>Login</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </Animated.View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "flex-end", 
    alignItems: "center",
    backgroundColor: "#000",
  },
  appTitle: {
    position: "absolute",
    top: 200,
    fontSize: 36,
    fontWeight: "900",
    color: "#fff", 
    textAlign: "center",
  },
  cardContainer: {
    backgroundColor: "#111",
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    padding: 20,
    height:500,
    width: "100%",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  scrollInner: { flexGrow: 1 },
  cardTitle: {
    fontSize: 24,
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
  roleLabel: {
    fontSize: 16,
    color: "#aaa",
    marginBottom: 8,
    fontWeight: "600",
  },
  roleRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 20,
  },
  roleOption: {
    borderWidth: 1,
    borderColor: "#555",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 30,
  },
  roleSelected: {
    backgroundColor: "#007AFF",
    borderColor: "#007AFF",
  },
  roleText: { color: "#aaa", fontWeight: "600" },
  roleTextSelected: { color: "#fff" },
  signupBtn: {
    backgroundColor: "#4A90E2",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 15,
  },
  signupText: { color: "#fff", fontWeight: "600" },
  loginRow: {
    flexDirection: "row",
    justifyContent: "center",
  },
  loginPrompt: { color: "#aaa" },
  loginLink: { color: "#4A90E2", fontWeight: "600" },
});
