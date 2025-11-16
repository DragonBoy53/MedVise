import axios from "axios";
import * as SecureStore from "expo-secure-store";
const API_BASE_URL ="http://192.168.1.11:3001";

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
