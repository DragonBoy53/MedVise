import { useAuth, useUser } from "@clerk/clerk-expo";
import { Redirect } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

export default function Index() {
  const { isSignedIn, isLoaded } = useAuth();
  const { user, isLoaded: isUserLoaded } = useUser();

  if (!isLoaded || !isUserLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#000" }}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  if (isSignedIn) {
    const role = user?.publicMetadata?.role as string;
    if (role === "admin") {
      return <Redirect href={"/admin" as any} />;
    }
    return <Redirect href="/chat" />;
  }

  return <Redirect href="/(auth)/sign-in" />;
}
