// api/client.js
import axios from "axios";
import * as SecureStore from "expo-secure-store";

// IMPORTANT: Replace with your computer's network IP address
// 1. On Windows, open cmd and type 'ipconfig'
// 2. On Mac, open Terminal and type 'ifconfig'
// 3. Find the 'IPv4 Address' (e.g., 192.168.1.10)
//
// DO NOT use 'localhost' - your phone can't see it.
const API_BASE_URL ="http://192.168.1.11:3001";

const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

// Function to set the auth token for future requests
export const setAuthToken = async (token) => {
  if (token) {
    // Apply token to every request
    apiClient.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    // Save token to secure store
    await SecureStore.setItemAsync("userToken", token);
  } else {
    // Remove token
    delete apiClient.defaults.headers.common["Authorization"];
    await SecureStore.deleteItemAsync("userToken");
  }
};

export default apiClient;