import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions, // Added Dimensions
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// Added height from Dimensions
const { height } = Dimensions.get("window");

export default function SignupScreen() {
  const router = useRouter();

  // --- Animation refs and state from LoginScreen ---
  const [displayText, setDisplayText] = useState("");
  const textOpacity = useRef(new Animated.Value(1)).current; // Text is always visible
  const dotOpacity = useRef(new Animated.Value(1)).current; // Dot will be animated
  const cardSlide = useRef(new Animated.Value(height)).current;
  const contentTranslateY = useRef(new Animated.Value(0)).current;

  // The "blink" (fade in and out) animation
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
  // --- End of LoginScreen refs ---

  // This state is unique to SignupScreen
  const [role, setRole] = useState<"user" | "admin">("user");

  // --- Helper functions from LoginScreen ---
  const startBlinking = () => {
    blinkAnimation.start();
  };

  const stopBlinking = () => {
    blinkAnimation.stop();
    dotOpacity.setValue(1);
  };
  
  const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));
  // --- End of helper functions ---


  // Replaced original useEffect with LoginScreen's logic
  useEffect(() => {
    startAnimation();
    // Clean up the animation on unmount
    return () => blinkAnimation.stop();
  }, []);

  // --- Animation functions from LoginScreen ---
  const startAnimation = async () => {
    // Start the text loop immediately
    loopText();

    // Wait for the animation to get going
    await wait(1200);

    // Animate the content block sliding UP and the card sliding IN
    Animated.parallel([
      Animated.spring(contentTranslateY, {
        toValue: -120, // Moves the dot/text block up
        useNativeDriver: true,
        friction: 7,
        tension: 60,
      }),
      Animated.spring(cardSlide, {
        toValue: 0, // Moves the login card up
        useNativeDriver: true,
        friction: 7,
        tension: 60,
      }),
    ]).start();
  };

  // This loop now controls the blinking cursor
  const loopText = async () => {
    const texts = ["MedVise", "Let's Classify", "Let's Go"];
    const typeSpeed = 100; // Milliseconds between letters
    const deleteSpeed = 50; // Faster deleting
    const pauseTime = 1500; // How long to show the full word

    let i = 0;
    while (true) {
      const currentText = texts[i];
      
      stopBlinking(); // Stop blinking to type
      for (let j = 0; j < currentText.length; j++) {
        setDisplayText(currentText.substring(0, j + 1));
        await wait(typeSpeed);
      }

      startBlinking(); // Start blinking on pause
      await wait(pauseTime);

      stopBlinking(); // Stop blinking to delete
      for (let j = currentText.length; j > 0; j--) {
        setDisplayText(currentText.substring(0, j - 1));
        await wait(deleteSpeed);
      }

      startBlinking(); // Start blinking when empty
      await wait(300);

      i = (i + 1) % texts.length;
    }
  };
  // --- End of animation functions ---

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#000" }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      {/* Container style updated to match LoginScreen */}
      <View style={styles.container}>
  
        {/* Replaced static title with animated component from LoginScreen */}
        <Animated.View 
          style={[
            styles.centerArea, 
            { transform: [{ translateY: contentTranslateY }] }
          ]}
        >
          <Animated.Text
            style={[
              styles.titleText,
              { 
                opacity: textOpacity,
                color: "#fff",
              },
            ]}
          >
            {displayText}
          </Animated.Text>
          
          <Animated.View style={[
            styles.dot, 
            { 
              opacity: dotOpacity,
            }
          ]} />
        </Animated.View>

       
        {/* Updated Animated.View to use cardSlide from LoginScreen */}
        <Animated.View
          style={[
            styles.cardContainer,
            {
              transform: [{ translateY: cardSlide }],
            },
          ]}
        >
          {/* The content of the signup form remains unchanged */}
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
  // Style updated to match LoginScreen
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  
  // Removed appTitle style
  
  // Added centerArea, dot, and titleText from LoginScreen
  centerArea: {
    position: "absolute",
    top: "35%", 
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#fff",
    marginLeft: 12,
  },
  titleText: {
    fontSize: 30,
    fontWeight: "700",
  },

  // Card container updated to use absolute positioning
  cardContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#111",
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    padding: 20,
    height: 500, // Kept 500 height for the longer signup form
    width: "100%",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  
  // --- All styles below this line are unchanged ---
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