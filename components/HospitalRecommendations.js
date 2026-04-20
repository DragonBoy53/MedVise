import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

const RECOMMENDATIONS_URL =
  "https://med-vise.vercel.app/api/recommendations";

export default function HospitalRecommendations({ lat, lng, specialty }) {
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchRecommendations = useCallback(async () => {
    if (lat == null || lng == null || !specialty) {
      setHospitals([]);
      setError("Location and specialty are required to find recommendations.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(RECOMMENDATIONS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          lat,
          lng,
          specialty,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.message || "Unable to fetch hospital recommendations.",
        );
      }

      setHospitals(Array.isArray(data?.recommendations) ? data.recommendations : []);
    } catch (fetchError) {
      setHospitals([]);
      setError(
        fetchError?.message || "Something went wrong while fetching hospitals.",
      );
    } finally {
      setLoading(false);
    }
  }, [lat, lng, specialty]);

  useEffect(() => {
    fetchRecommendations();
  }, [fetchRecommendations]);

  const handleCall = async (phone) => {
    if (!phone || phone === "No phone available") {
      return;
    }

    const phoneUrl = `tel:${phone}`;

    try {
      const supported = await Linking.canOpenURL(phoneUrl);
      if (!supported) {
        Alert.alert("Unavailable", "Calling is not supported on this device.");
        return;
      }

      await Linking.openURL(phoneUrl);
    } catch {
      Alert.alert("Error", "Unable to open the dialer right now.");
    }
  };

  const handleDirections = async (address) => {
    if (!address) {
      return;
    }

    const encodedAddress = encodeURIComponent(address);
    const mapsUrl =
      Platform.OS === "ios"
        ? `maps:0?q=${encodedAddress}`
        : `geo:0,0?q=${encodedAddress}`;
    const fallbackUrl = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;

    try {
      const supported = await Linking.canOpenURL(mapsUrl);
      await Linking.openURL(supported ? mapsUrl : fallbackUrl);
    } catch {
      Alert.alert("Error", "Unable to open directions right now.");
    }
  };

  const renderHospitalCard = ({ item }) => {
    const hasPhone = item.phone && item.phone !== "No phone available";

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.hospitalName}>{item.name}</Text>
          <View
            style={[
              styles.badge,
              item.isOpen ? styles.openBadge : styles.closedBadge,
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                item.isOpen ? styles.openBadgeText : styles.closedBadgeText,
              ]}
            >
              {item.isOpen ? "Open Now" : "Closed"}
            </Text>
          </View>
        </View>

        <Text style={styles.ratingText}>Rating: {item.rating ?? "N/A"} / 5.0</Text>
        <Text style={styles.addressText}>{item.address}</Text>

        <View style={styles.buttonRow}>
          <Pressable
            style={[
              styles.actionButton,
              styles.callButton,
              !hasPhone && styles.disabledButton,
            ]}
            onPress={() => handleCall(item.phone)}
            disabled={!hasPhone}
          >
            <Text
              style={[
                styles.callButtonText,
                !hasPhone && styles.disabledButtonText,
              ]}
            >
              Call
            </Text>
          </Pressable>

          <Pressable
            style={[styles.actionButton, styles.directionsButton]}
            onPress={() => handleDirections(item.address)}
          >
            <Text style={styles.directionsButtonText}>Directions</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color="#0E7490" />
        <Text style={styles.stateText}>Finding specialists...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.retryButton} onPress={fetchRecommendations}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      data={hospitals}
      keyExtractor={(item, index) => `${item.name}-${index}`}
      renderItem={renderHospitalCard}
      contentContainerStyle={[
        styles.listContent,
        hospitals.length === 0 && styles.emptyListContent,
      ]}
      ListEmptyComponent={
        <View style={styles.centerState}>
          <Text style={styles.emptyText}>
            No hospital recommendations were found for this specialty yet.
          </Text>
        </View>
      }
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  listContent: {
    padding: 16,
    gap: 14,
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  stateText: {
    marginTop: 12,
    fontSize: 16,
    color: "#475569",
    textAlign: "center",
  },
  errorText: {
    fontSize: 15,
    color: "#B91C1C",
    textAlign: "center",
    marginBottom: 16,
    lineHeight: 22,
  },
  emptyText: {
    fontSize: 15,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 22,
  },
  retryButton: {
    backgroundColor: "#0F766E",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
  },
  retryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 10,
  },
  hospitalName: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: "#0F172A",
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  openBadge: {
    backgroundColor: "#DCFCE7",
  },
  closedBadge: {
    backgroundColor: "#FEE2E2",
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "700",
  },
  openBadgeText: {
    color: "#166534",
  },
  closedBadgeText: {
    color: "#B91C1C",
  },
  ratingText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0F766E",
    marginBottom: 8,
  },
  addressText: {
    fontSize: 14,
    color: "#6B7280",
    lineHeight: 21,
    marginBottom: 16,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
  },
  actionButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 10,
  },
  callButton: {
    backgroundColor: "#E0F2FE",
  },
  directionsButton: {
    backgroundColor: "#0F766E",
  },
  callButtonText: {
    color: "#075985",
    fontSize: 14,
    fontWeight: "700",
  },
  directionsButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  disabledButton: {
    backgroundColor: "#E5E7EB",
  },
  disabledButtonText: {
    color: "#9CA3AF",
  },
});
