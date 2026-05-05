import { useAuth, useUser } from "@clerk/clerk-expo";
import { Stack, useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { getAppRole, isOnboardingComplete } from "@/utils/auth";

export default function DoctorLayout() {
  const { isSignedIn, isLoaded } = useAuth();
  const { user, isLoaded: isUserLoaded } = useUser();
  const router = useRouter();
  const role = getAppRole(user);
  const onboardingComplete = isOnboardingComplete(user);

  useEffect(() => {
    if (!isLoaded || !isUserLoaded) {
      return;
    }

    if (!isSignedIn) {
      router.replace("/(auth)/sign-in");
      return;
    }

    if (!onboardingComplete) {
      router.replace("/onboarding");
      return;
    }

    if (role !== "clinician") {
      router.replace("/chat");
    }
  }, [isSignedIn, isLoaded, isUserLoaded, onboardingComplete, role, router]);

  if (
    !isLoaded ||
    !isUserLoaded ||
    !isSignedIn ||
    !onboardingComplete ||
    role !== "clinician"
  ) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#fff",
        }}
      >
        <ActivityIndicator size="large" color="#0F766E" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
