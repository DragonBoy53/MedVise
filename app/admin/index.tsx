import { useAuth, useUser } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

export default function Index() {
  const { isSignedIn, isLoaded } = useAuth();
  const { user, isLoaded: isUserLoaded } = useUser();
  const router = useRouter();

  useEffect(() => {
    
    if (isLoaded && isUserLoaded) {
      if (isSignedIn) {
       
        const role = user?.publicMetadata?.role as string;
        if (role === "admin") {
          router.replace("/admin");
        } else {
          router.replace("/chat");
        }
      } else {
       
        router.replace("/(auth)/sign-in");
      }
    }
  }, [isSignedIn, isLoaded, isUserLoaded, user]);

 
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#000" }}>
      <ActivityIndicator size="large" color="#fff" />
    </View>
  );
}
