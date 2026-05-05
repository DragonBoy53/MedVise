import { useAuth, useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import apiClient from "../api/client";
import { getAppRole, isOnboardingComplete } from "@/utils/auth";

type RoleOption = "user" | "clinician";

const ROLE_OPTIONS: {
  key: RoleOption;
  title: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    key: "user",
    title: "Patient",
    description: "Use MedVise for chats, predictions, and sharing results with a clinician.",
    icon: "person-outline",
  },
  {
    key: "clinician",
    title: "Doctor / Clinician",
    description: "Review shared patient analyses, risk scores, and MedVise summaries.",
    icon: "medkit-outline",
  },
];

export default function OnboardingScreen() {
  const { role: routeRole } = useLocalSearchParams<{ role?: string }>();
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const { user, isLoaded: isUserLoaded } = useUser();
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<RoleOption>(
    routeRole === "clinician" ? "clinician" : "user",
  );
  const [saving, setSaving] = useState(false);

  const currentRole = getAppRole(user);
  const onboardingComplete = isOnboardingComplete(user);

  useEffect(() => {
    if (currentRole === "admin") {
      router.replace("/admin");
      return;
    }

    if (currentRole === "clinician" && onboardingComplete) {
      router.replace("/doctor");
      return;
    }

    if (currentRole === "user" && onboardingComplete) {
      router.replace("/chat");
    }
  }, [currentRole, onboardingComplete, router]);

  useEffect(() => {
    if (routeRole === "clinician" || routeRole === "user") {
      setSelectedRole(routeRole);
    } else if (currentRole === "clinician" || currentRole === "user") {
      setSelectedRole(currentRole);
    }
  }, [currentRole, routeRole]);

  const completeOnboarding = async () => {
    try {
      setSaving(true);
      const token = await getToken();

      if (!token) {
        Alert.alert("Authentication required", "Please sign in again to complete setup.");
        return;
      }

      await apiClient.post(
        "/api/auth/onboarding/complete",
        { role: selectedRole },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      await user?.reload?.();

      if (selectedRole === "clinician") {
        router.replace("/doctor");
        return;
      }

      router.replace("/chat");
    } catch (error: any) {
      Alert.alert(
        "Setup failed",
        error?.response?.data?.message ||
          error?.message ||
          "We could not finish setting up your account.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (!isLoaded || !isUserLoaded) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#0F766E" />
      </View>
    );
  }

  if (!isSignedIn) {
    router.replace("/(auth)/sign-in");
    return null;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#F7FAFC" />
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>First-time setup</Text>
        <Text style={styles.title}>Choose how you’ll use MedVise</Text>
        <Text style={styles.subtitle}>
          We use this once to route your account to the right portal and secure what data you can access.
        </Text>
      </View>

      <View style={styles.cardList}>
        {ROLE_OPTIONS.map((option) => {
          const isActive = selectedRole === option.key;
          return (
            <TouchableOpacity
              key={option.key}
              style={[styles.roleCard, isActive && styles.roleCardActive]}
              activeOpacity={0.88}
              onPress={() => setSelectedRole(option.key)}
            >
              <View style={[styles.iconWrap, isActive && styles.iconWrapActive]}>
                <Ionicons
                  name={option.icon}
                  size={24}
                  color={isActive ? "#0F766E" : "#475569"}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.roleTitle}>{option.title}</Text>
                <Text style={styles.roleDescription}>{option.description}</Text>
              </View>
              <Ionicons
                name={isActive ? "radio-button-on" : "radio-button-off"}
                size={20}
                color={isActive ? "#0F766E" : "#94A3B8"}
              />
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Clinicians can receive shared patient analyses after patients link them by email.
        </Text>
        <TouchableOpacity
          style={[styles.primaryButton, saving && styles.primaryButtonDisabled]}
          activeOpacity={0.9}
          onPress={completeOnboarding}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Text style={styles.primaryButtonText}>Continue</Text>
              <Ionicons name="arrow-forward" size={18} color="#fff" />
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F7FAFC", paddingHorizontal: 20 },
  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F7FAFC",
  },
  hero: { paddingTop: 28, paddingBottom: 26, gap: 8 },
  eyebrow: {
    color: "#0F766E",
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  title: { color: "#0F172A", fontSize: 30, fontWeight: "800", lineHeight: 36 },
  subtitle: { color: "#475569", fontSize: 14, lineHeight: 21, maxWidth: 320 },
  cardList: { gap: 14 },
  roleCard: {
    backgroundColor: "#fff",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  roleCardActive: {
    borderColor: "#99F6E4",
    backgroundColor: "#F0FDFA",
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
  },
  iconWrapActive: { backgroundColor: "#CCFBF1" },
  roleTitle: { color: "#0F172A", fontSize: 18, fontWeight: "800" },
  roleDescription: { color: "#64748B", fontSize: 13, lineHeight: 19, marginTop: 4 },
  footer: { marginTop: "auto", paddingBottom: 22, gap: 16 },
  footerText: { color: "#64748B", fontSize: 13, lineHeight: 19 },
  primaryButton: {
    height: 54,
    borderRadius: 16,
    backgroundColor: "#0F766E",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryButtonDisabled: { opacity: 0.7 },
  primaryButtonText: { color: "#fff", fontSize: 16, fontWeight: "800" },
});
