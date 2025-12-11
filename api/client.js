import axios from "axios";
import * as SecureStore from "expo-secure-store";

// ⚠️ REPLACE THIS WITH YOUR COMPUTER'S LOCAL IP ADDRESS
// e.g., http://192.168.1.11:3001 or http://10.0.2.2:3001 (Android Emulator default)
const API_BASE_URL = "https://med-vise.vercel.app/";

const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

export const setAuthToken = async (token) => {
  if (token) {
    apiClient.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    await SecureStore.setItemAsync("userToken", token);
  } else {
    delete apiClient.defaults.headers.common["Authorization"];
    await SecureStore.deleteItemAsync("userToken");
  }
};

export default apiClient;