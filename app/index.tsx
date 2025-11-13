import { Redirect } from 'expo-router';

/**
 * This is the entry point for your app.
 * It will immediately redirect the user to the /login route.
 * Expo Router looks for "index.tsx" as the default file
 * in a directory. Since your app/_layout.tsx is a Stack,
 * this index file tells the router what to show first.
 */
export default function AppRoot() {
  // You can add auth logic here later. For now, we redirect to login.
  return <Redirect href="/login" />;
}