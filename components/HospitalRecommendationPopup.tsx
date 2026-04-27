import * as Location from "expo-location";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import apiClient from "../api/client";

type HospitalRecommendation = {
  name: string;
  address: string;
  rating: number | null;
  phone: string | null;
  isOpen: boolean | null;
};

type Props = {
  isVisible: boolean;
  specialty: string;
  onClose: () => void;
};

export default function HospitalRecommendationPopup({
  isVisible,
  specialty,
  onClose,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hospitals, setHospitals] = useState<HospitalRecommendation[]>([]);

  const fetchRecommendations = useCallback(async () => {
    if (!isVisible) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setHospitals([]);

      // Common mobile failure case: Expo location permission gets denied or the
      // simulator/device location service is turned off.
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        throw new Error(
          "Location permission is required to find nearby hospitals and specialists.",
        );
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const response = await apiClient.post("/api/recommendations", {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        specialty,
      });

      const nextHospitals = Array.isArray(response.data?.recommendations)
        ? response.data.recommendations
        : [];

      setHospitals(nextHospitals);
    } catch (fetchError: any) {
      console.error("[HospitalRecommendationPopup.fetchRecommendations]", fetchError);
      setHospitals([]);
      setError(
        fetchError?.response?.data?.message ||
          fetchError?.message ||
          "Unable to fetch nearby recommendations right now.",
      );
    } finally {
      setLoading(false);
    }
  }, [isVisible, specialty]);

  useEffect(() => {
    if (isVisible) {
      fetchRecommendations();
      return;
    }

    setLoading(false);
    setError(null);
    setHospitals([]);
  }, [fetchRecommendations, isVisible]);

  const handleCall = useCallback(async (phone: string | null) => {
    if (!phone) {
      return;
    }

    const phoneUrl = `tel:${phone}`;

    try {
      const supported = await Linking.canOpenURL(phoneUrl);
      if (!supported) {
        throw new Error("Calling is not supported on this device.");
      }

      await Linking.openURL(phoneUrl);
    } catch (callError: any) {
      setError(callError?.message || "Unable to open the dialer right now.");
    }
  }, []);

  const handleDirections = useCallback(async (address: string) => {
    const mapsUrl = `http://maps.google.com/?q=${encodeURIComponent(address)}`;

    try {
      await Linking.openURL(mapsUrl);
    } catch (directionsError: any) {
      setError(directionsError?.message || "Unable to open directions right now.");
    }
  }, []);

  const renderHospital = ({ item }: { item: HospitalRecommendation }) => {
    const hasPhone = Boolean(item.phone);

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.name}>{item.name}</Text>
          {item.isOpen != null ? (
            <View
              style={[
                styles.statusBadge,
                item.isOpen ? styles.statusOpenBadge : styles.statusClosedBadge,
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  item.isOpen ? styles.statusOpenText : styles.statusClosedText,
                ]}
              >
                {item.isOpen ? "Open" : "Closed"}
              </Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.meta}>
          Rating: {item.rating != null ? `${item.rating}/5` : "Unavailable"}
        </Text>
        <Text style={styles.address}>{item.address}</Text>
        <Text style={styles.phone}>{item.phone || "Phone unavailable"}</Text>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionButton, styles.callButton, !hasPhone && styles.actionDisabled]}
            activeOpacity={0.85}
            disabled={!hasPhone}
            onPress={() => handleCall(item.phone)}
          >
            <Text style={[styles.callButtonText, !hasPhone && styles.actionDisabledText]}>
              Call
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.directionsButton]}
            activeOpacity={0.85}
            onPress={() => handleDirections(item.address)}
          >
            <Text style={styles.directionsButtonText}>Directions</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={isVisible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.modalCard}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Nearby care options</Text>
              <Text style={styles.subtitle}>
                We are searching for nearby {specialty} clinics or hospitals.
              </Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.8}>
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.stateBlock}>
              <ActivityIndicator size="large" color="#0F766E" />
              <Text style={styles.stateText}>Finding nearby hospitals...</Text>
            </View>
          ) : error ? (
            <View style={styles.stateBlock}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity
                style={styles.retryButton}
                activeOpacity={0.85}
                onPress={fetchRecommendations}
              >
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={hospitals}
              keyExtractor={(item, index) => `${item.name}-${index}`}
              renderItem={renderHospital}
              contentContainerStyle={[
                styles.listContent,
                hospitals.length === 0 && styles.emptyListContent,
              ]}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={styles.stateBlock}>
                  <Text style={styles.emptyText}>
                    No nearby recommendations were returned for this specialty.
                  </Text>
                </View>
              }
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  modalCard: {
    maxHeight: "82%",
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    paddingTop: 18,
    paddingBottom: 10,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#E8EDF3",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 19,
    color: "#64748B",
  },
  closeButton: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
  },
  closeButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#475569",
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  stateBlock: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 36,
  },
  stateText: {
    marginTop: 12,
    fontSize: 14,
    color: "#475569",
    textAlign: "center",
  },
  errorText: {
    fontSize: 14,
    lineHeight: 21,
    color: "#B91C1C",
    textAlign: "center",
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 21,
    color: "#64748B",
    textAlign: "center",
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: "#0F766E",
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  card: {
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 16,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  name: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  statusOpenBadge: {
    backgroundColor: "#DCFCE7",
  },
  statusClosedBadge: {
    backgroundColor: "#FEE2E2",
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  statusOpenText: {
    color: "#166534",
  },
  statusClosedText: {
    color: "#B91C1C",
  },
  meta: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: "600",
    color: "#0F766E",
  },
  address: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 20,
    color: "#475569",
  },
  phone: {
    marginTop: 6,
    fontSize: 13,
    color: "#64748B",
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  actionButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  callButton: {
    backgroundColor: "#E0F2FE",
  },
  directionsButton: {
    backgroundColor: "#0F766E",
  },
  callButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#075985",
  },
  directionsButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  actionDisabled: {
    backgroundColor: "#E5E7EB",
  },
  actionDisabledText: {
    color: "#9CA3AF",
  },
});
