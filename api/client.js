import axios from "axios";
import * as SecureStore from "expo-secure-store";
import { useAuth } from "@clerk/clerk-expo";

const API_BASE_URL = "https://med-vise.vercel.app/";

const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

export const setupClerkToken = async (getToken) => {
  try {
    const token = await getToken();
    if (token) {
      apiClient.defaults.headers.common["Authorization"] = `Bearer ${token}`;
      return true;
    }
  } catch (error) {
    console.error("Error getting Clerk token:", error);
  }
  return false;
};

// Legacy method (keep for backward compatibility)
export const setAuthToken = async (token) => {
  if (token) {
    apiClient.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    await SecureStore.setItemAsync("userToken", token);
  } else {
    delete apiClient.defaults.headers.common["Authorization"];
    await SecureStore.deleteItemAsync("userToken");
  }
};

// export const setAuthToken = async (token) => {
//   if (token) {
//     apiClient.defaults.headers.common["Authorization"] = `Bearer ${token}`;
//     await SecureStore.setItemAsync("userToken", token);
//   } else {
//     delete apiClient.defaults.headers.common["Authorization"];
//     await SecureStore.deleteItemAsync("userToken");
//   }
// };

export default apiClient;