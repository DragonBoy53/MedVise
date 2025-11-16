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

  
  const textOpacity = useRef(new Animated.Value(1)).current; // Text is always visible
  const dotOpacity = useRef(new Animated.Value(1)).current; // Dot will be animated
  const cardSlide = useRef(new Animated.Value(height)).current;
  const contentTranslateY = useRef(new Animated.Value(0)).current;

  // ❌ REMOVED: dotScale is no longer needed
  // const dotScale = useRef(new Animated.Value(1)).current;

  // ✅ MODIFIED: This animation is now a simple "blink" (fade in and out)
  const blinkAnimation = useRef(
    Animated.loop(
      Animated.sequence([
        // Fade "out" (hide)
        Animated.timing(dotOpacity, {
          toValue: 0, // Fade out completely
          duration: 800, // Slower duration
          useNativeDriver: true,
        }),
        // Fade "in" (show)
        Animated.timing(dotOpacity, {
          toValue: 1, // Fade back in
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    )
  ).current;

  const [displayText, setDisplayText] = useState("");

  // ✅ MODIFIED: Renamed to control the "blink"
  const startBlinking = () => {
    blinkAnimation.start();
  };

  const stopBlinking = () => {
    blinkAnimation.stop();
    // Ensure the dot is fully visible
    dotOpacity.setValue(1); 
    // ❌ REMOVED: dotScale.setValue(1);
  };


  useEffect(() => {
    startAnimation();
    // Clean up the animation on unmount
    return () => blinkAnimation.stop();
  }, []);

  const wait = (ms: number) => new Promise((res) => setTimeout(res, ms));

  
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
      
      // 1. --- TYPE ---
      stopBlinking(); // Stop blinking to type
      for (let j = 0; j < currentText.length; j++) {
        setDisplayText(currentText.substring(0, j + 1));
        await wait(typeSpeed);
      }

      // 2. --- PAUSE ---
      startBlinking(); // Start blinking on pause
      await wait(pauseTime);

      // 3. --- DELETE ---
      stopBlinking(); // Stop blinking to delete
      for (let j = currentText.length; j > 0; j--) {
        setDisplayText(currentText.substring(0, j - 1));
        await wait(deleteSpeed);
      }

      // 4. --- PAUSE (empty) ---
      startBlinking(); // Start blinking when empty
      await wait(300);

      // Move to the next word
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
        <Animated.View 
          style={[
            styles.centerArea, 
            { transform: [{ translateY: contentTranslateY }] }
          ]}
        >
          {/* ❌ REMOVED: The spacer view is gone. */}

          <Animated.Text
            style={[
              styles.titleText,
              { 
                opacity: textOpacity, // Uses textOpacity (which is 1)
                color: "#fff",
              },
            ]}
          >
            {/* The displayText state is now being set by the typewriter */}
            {displayText}
          </Animated.Text>
          
          {/* ✅ MODIFIED: The dot now only animates opacity */}
          <Animated.View style={[
            styles.dot, 
            { 
              opacity: dotOpacity,
              // ❌ REMOVED: transform: [{ scale: dotScale }]
            }
          ]} />

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
    top: "35%", 
    left: 0,
    right: 0,
    // ✅ MODIFIED: Changed to 'row' to put dot on the right
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#fff",
    // Spacing between text and dot
    marginLeft: 12,
  },
  titleText: {
    fontSize: 30,
    fontWeight: "700",
    // ❌ REMOVED: minWidth and textAlign
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