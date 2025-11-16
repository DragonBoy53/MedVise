import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  Alert,
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

// Import your new API client
import apiClient from "../api/client"; // Adjust path if needed

const { height } = Dimensions.get("window");

export default function SignupScreen() {
  const router = useRouter();

  // --- Animation refs ---
  const [displayText, setDisplayText] = useState("");
  const textOpacity = useRef(new Animated.Value(1)).current;
  const dotOpacity = useRef(new Animated.Value(1)).current;
  const cardSlide = useRef(new Animated.Value(height)).current;
  const contentTranslateY = useRef(new Animated.Value(0)).current;

  // --- Form State ---
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"user" | "admin">("user");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // --- Animation Logic (Unchanged) ---
  const blinkAnimation = useRef(
    Animated.loop(
      Animated.sequence([
        Animated.timing(dotOpacity, { toValue: 0, duration: 800, useNativeDriver: true }),
        Animated.timing(dotOpacity, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    )
  ).current;

  const startBlinking = () => blinkAnimation.start();
  const stopBlinking = () => { blinkAnimation.stop(); dotOpacity.setValue(1); };
  const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));

  useEffect(() => {
    startAnimation();
    return () => blinkAnimation.stop();
  }, []);

  const startAnimation = async () => {
    loopText();
    await wait(1200);
    Animated.parallel([
      Animated.spring(contentTranslateY, { toValue: -120, useNativeDriver: true, friction: 7, tension: 60 }),
      Animated.spring(cardSlide, { toValue: 0, useNativeDriver: true, friction: 7, tension: 60 }),
    ]).start();
  };

  const loopText = async () => {
    const texts = ["MedVise", "Let's Classify", "Let's Go"];
    const typeSpeed = 100, deleteSpeed = 50, pauseTime = 1500;
    let i = 0;
    while (true) {
      const currentText = texts[i];
      stopBlinking();
      for (let j = 0; j < currentText.length; j++) {
        setDisplayText(currentText.substring(0, j + 1));
        await wait(typeSpeed);
      }
      startBlinking(); await wait(pauseTime);
      stopBlinking();
      for (let j = currentText.length; j > 0; j--) {
        setDisplayText(currentText.substring(0, j - 1));
        await wait(deleteSpeed);
      }
      startBlinking(); await wait(300);
      i = (i + 1) % texts.length;
    }
  };
  // --- End of Animation Logic ---


  // ✅ --- NEW: Handle Sign Up Function ---
  const handleSignUp = async () => {
    if (!fullName || !email || !password) {
      setError("Please fill in all fields.");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      // Send data to your /api/register endpoint
      const response = await apiClient.post("/api/register", {
        fullName,
        email,
        password,
        role,
      });

      // Handle success
      setLoading(false);
      Alert.alert(
        "Success",
        "Registration successful! Please log in.",
        [{ text: "OK", onPress: () => router.push("/login") }]
      );

    } catch (err: any) {
      // Handle error
      setLoading(false);
      if (err.response) {
        // Server responded with a status code (e.g., 400, 500)
        setError(err.response.data.message);
      } else if (err.request) {
        // Request was made but no response received
        setError("Network error. Could not connect to server.");
      } else {
        // Something else happened
        setError("An unknown error occurred.");
      }
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#000" }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.container}>
        {/* Animated Title Area (Unchanged) */}
        <Animated.View style={[ styles.centerArea, { transform: [{ translateY: contentTranslateY }] } ]}>
          <Animated.Text style={[ styles.titleText, { opacity: textOpacity, color: "#fff" } ]}>
            {displayText}
          </Animated.Text>
          <Animated.View style={[ styles.dot, { opacity: dotOpacity } ]} />
        </Animated.View>
        
        {/* Sign Up Card */}
        <Animated.View style={[ styles.cardContainer, { transform: [{ translateY: cardSlide }] } ]}>
          <ScrollView
            contentContainerStyle={styles.scrollInner}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.cardTitle}>Sign Up</Text>

            {/* ✅ NEW: Display error message */}
            {error && <Text style={styles.errorText}>{error}</Text>}

            <TextInput
              placeholder="Full Name"
              placeholderTextColor="#aaa"
              style={styles.input}
              value={fullName} // ✅ Bind to state
              onChangeText={setFullName} // ✅ Update state
            />
            <TextInput
              placeholder="Email"
              placeholderTextColor="#aaa"
              style={styles.input}
              keyboardType="email-address"
              autoCapitalize="none"
              value={email} // ✅ Bind to state
              onChangeText={setEmail} // ✅ Update state
            />
            <TextInput
              placeholder="Password"
              placeholderTextColor="#aaa"
              style={styles.input}
              secureTextEntry
              value={password} // ✅ Bind to state
              onChangeText={setPassword} // ✅ Update state
            />

            <Text style={styles.roleLabel}>Sign up as:</Text>
            <View style={styles.roleRow}>
              {/* Role selection (Unchanged) */}
              <TouchableOpacity
                style={[ styles.roleOption, role === "user" && styles.roleSelected ]}
                onPress={() => setRole("user")}
              >
                <Text style={[ styles.roleText, role === "user" && styles.roleTextSelected ]}>
                  User
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[ styles.roleOption, role === "admin" && styles.roleSelected ]}
                onPress={() => setRole("admin")}
              >
                <Text style={[ styles.roleText, role === "admin" && styles.roleTextSelected ]}>
                  Admin
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.signupBtn}
              onPress={handleSignUp} // ✅ Call handleSignUp
              disabled={loading} // ✅ Disable button when loading
            >
              <Text style={styles.signupText}>
                {loading ? "Signing Up..." : "Sign Up"}
              </Text>
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
  // ... (All your existing styles) ...
  // ✅ NEW: Add an error style
  errorText: {
    color: "#E53E3E", // A red color
    textAlign: "center",
    marginBottom: 10,
    fontSize: 14,
    fontWeight: "600",
  },
  
  // (Your other styles)
  container: { flex: 1, backgroundColor: "#000" },
  centerArea: { position: "absolute", top: "35%", left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: "#fff", marginLeft: 12 },
  titleText: { fontSize: 30, fontWeight: "700" },
  cardContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: "#111", borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 20, height: 500, width: "100%", shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 10, elevation: 6 },
  scrollInner: { flexGrow: 1 },
  cardTitle: { fontSize: 24, fontWeight: "700", marginBottom: 20, textAlign: "center", color: "#fff" },
  input: { borderWidth: 1, borderColor: "#555", borderRadius: 8, padding: 12, marginBottom: 15, color: "#fff" },
  roleLabel: { fontSize: 16, color: "#aaa", marginBottom: 8, fontWeight: "600" },
  roleRow: { flexDirection: "row", justifyContent: "space-around", marginBottom: 20 },
  roleOption: { borderWidth: 1, borderColor: "#555", borderRadius: 8, paddingVertical: 10, paddingHorizontal: 30 },
  roleSelected: { backgroundColor: "#007AFF", borderColor: "#007AFF" },
  roleText: { color: "#aaa", fontWeight: "600" },
  roleTextSelected: { color: "#fff" },
  signupBtn: { backgroundColor: "#4A90E2", paddingVertical: 12, borderRadius: 8, alignItems: "center", marginBottom: 15 },
  signupText: { color: "#fff", fontWeight: "600" },
  loginRow: { flexDirection: "row", justifyContent: "center" },
  loginPrompt: { color: "#aaa" },
  loginLink: { color: "#4A90E2", fontWeight: "600" },
});