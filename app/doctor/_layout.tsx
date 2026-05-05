import { useAuth, useUser } from "@clerk/clerk-expo";
import { Stack, useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

export default function DoctorLayout() {
  const { isSignedIn, isLoaded } = useAuth();
  const { user, isLoaded: isUserLoaded } = useUser();
  const router = useRouter();
  const role = user?.publicMetadata?.role as string | undefined;

  useEffect(() => {
    if (!isLoaded || !isUserLoaded) {
      return;
    }

    if (!isSignedIn) {
      router.replace("/(auth)/sign-in");
      return;
    }

    if (role !== "clinician") {
      router.replace("/chat");
    }
  }, [isSignedIn, isLoaded, isUserLoaded, role, router]);

  if (!isLoaded || !isUserLoaded || !isSignedIn || role !== "clinician") {
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
