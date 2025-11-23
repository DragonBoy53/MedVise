import { useColorScheme } from '@/hooks/use-color-scheme';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
      
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="signup" options={{ headerShown: false }} />
    
        {/* This is the group for your tab bar. 
          It's still here if you need it. 
        */}
        {/* <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
         */}
        {/* ✅ ADDED: This registers your app/chat.tsx file.
          Now router.push('/chat') from your login screen will work.
        */}
        <Stack.Screen name="chat" options={{ headerShown: false }} />

        {/* ✅ ADDED: This registers your app/modal.tsx file
          and makes it present as a modal sheet.
        */}
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />

      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}