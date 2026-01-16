import { useOAuth, useSignIn } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useRef, useState } from "react";
import { AntDesign } from "@expo/vector-icons";
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

WebBrowser.maybeCompleteAuthSession();

const { height } = Dimensions.get("window");

const useWarmUpBrowser = () => {
  useEffect(() => {
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);
};

export default function LoginScreen() {
  useWarmUpBrowser();
  const router = useRouter();

  const { signIn, setActive, isLoaded } = useSignIn();

  const { startOAuthFlow } = useOAuth({ strategy: "oauth_google" });

  const [displayText, setDisplayText] = useState("");
  const textOpacity = useRef(new Animated.Value(1)).current;
  const dotOpacity = useRef(new Animated.Value(1)).current;
  const cardSlide = useRef(new Animated.Value(height)).current;
  const contentTranslateY = useRef(new Animated.Value(0)).current;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const blinkAnimation = useRef(
    Animated.loop(
      Animated.sequence([
        Animated.timing(dotOpacity, {
          toValue: 0,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(dotOpacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    )
  ).current;

  const startBlinking = () => blinkAnimation.start();
  const stopBlinking = () => {
    blinkAnimation.stop();
    dotOpacity.setValue(1);
  };
  const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));

  useEffect(() => {
    startAnimation();
    return () => blinkAnimation.stop();
  }, []);

  const startAnimation = async () => {
    loopText();
    await wait(1200);
    Animated.parallel([
      Animated.spring(contentTranslateY, {
        toValue: -120,
        useNativeDriver: true,
        friction: 7,
        tension: 60,
      }),
      Animated.spring(cardSlide, {
        toValue: 0,
        useNativeDriver: true,
        friction: 7,
        tension: 60,
      }),
    ]).start();
  };

  const loopText = async () => {
    const texts = ["MedVise", "Let's Classify", "Let's Go"];
    const typeSpeed = 100,
      deleteSpeed = 50,
      pauseTime = 1500;
    let i = 0;
    while (true) {
      const currentText = texts[i];
      stopBlinking();
      for (let j = 0; j < currentText.length; j++) {
        setDisplayText(currentText.substring(0, j + 1));
        await wait(typeSpeed);
      }
      startBlinking();
      await wait(pauseTime);
      stopBlinking();
      for (let j = currentText.length; j > 0; j--) {
        setDisplayText(currentText.substring(0, j - 1));
        await wait(deleteSpeed);
      }
      startBlinking();
      await wait(300);
      i = (i + 1) % texts.length;
    }
  };
  const handleLogin = async () => {
    if (!isLoaded) return;
    if (!email || !password) {
      setError("Please enter email and password.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const signInAttempt = await signIn.create({
        identifier: email,
        password,
      });
      if (signInAttempt.status === "complete") {
        await setActive({ session: signInAttempt.createdSessionId });
        setLoading(false);
        router.replace("/chat");
      } else {
        setLoading(false);
        setError("Login incomplete. Additional steps required.");
      }
    } catch (err: any) {
      setLoading(false);
      if (err.errors && err.errors.length > 0) {
        setError(err.errors[0].message || "Invalid credentials");
      } else {
        setError("An unknown error occurred.");
      }
    }
  };

  const handleGoogleLogin = useCallback(async () => {
    try {
      const { createdSessionId, signIn, signUp, setActive } =
        await startOAuthFlow();

      if (createdSessionId) {
        setActive?.({ session: createdSessionId });
        router.replace("/chat");
      }
    } catch (err) {
      console.error("OAuth error", err);
      setError("Google Sign-In failed or was cancelled.");
    }
  }, []);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#000" }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Animated.View style={[styles.container]}>
        <Animated.View
          style={[
            styles.centerArea,
            { transform: [{ translateY: contentTranslateY }] },
          ]}
        >
          <Animated.Text
            style={[styles.titleText, { opacity: textOpacity, color: "#fff" }]}
          >
            {displayText}
          </Animated.Text>
          <Animated.View style={[styles.dot, { opacity: dotOpacity }]} />
        </Animated.View>

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

            {error && <Text style={styles.errorText}>{error}</Text>}

            <TextInput
              placeholder="Email"
              placeholderTextColor="#aaa"
              style={styles.input}
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              placeholder="Password"
              placeholderTextColor="#aaa"
              style={styles.input}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            <TouchableOpacity
              style={styles.googleButton}
              onPress={handleGoogleLogin}
            >
              <AntDesign
                name="google"
                size={20}
                color="#fff"
                style={{ marginRight: 10 }}
              />
              <Text style={styles.googleText}>Continue with Google</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.loginBtn}
              onPress={handleLogin}
              disabled={loading}
            >
              <Text style={styles.loginText}>
                {loading ? "Logging In..." : "Login"}
              </Text>
            </TouchableOpacity>

            <View style={styles.signupRow}>
              <Text style={styles.signupText}>Do not have an account? </Text>
              <TouchableOpacity onPress={() => router.push("/(auth)/sign-up")}>
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
  errorText: {
    color: "#E53E3E",
    textAlign: "center",
    marginBottom: 10,
    fontSize: 14,
    fontWeight: "600",
  },
  container: { flex: 1, backgroundColor: "#000" },
  centerArea: {
    position: "absolute",
    top: "35%",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#fff",
    marginLeft: 12,
  },
  titleText: { fontSize: 30, fontWeight: "700" },
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
    flexDirection: "row",
    justifyContent: "center",
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
  signupRow: { flexDirection: "row", justifyContent: "center" },
  signupText: { color: "#aaa" },
  signupLink: { color: "#4A90E2", fontWeight: "600" },
});
