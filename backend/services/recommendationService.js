function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function validateRecommendationInput({ lat, lng, specialty }) {
  const latitude = toFiniteNumber(lat);
  const longitude = toFiniteNumber(lng);
  const normalizedSpecialty = String(specialty || "").trim();

  if (latitude == null || latitude < -90 || latitude > 90) {
    const error = new Error("lat must be a valid latitude between -90 and 90.");
    error.code = "INVALID_LATITUDE";
    throw error;
  }

  if (longitude == null || longitude < -180 || longitude > 180) {
    const error = new Error(
      "lng must be a valid longitude between -180 and 180.",
    );
    error.code = "INVALID_LONGITUDE";
    throw error;
  }

  if (!normalizedSpecialty) {
    const error = new Error("specialty is required.");
    error.code = "INVALID_SPECIALTY";
    throw error;
  }

  return {
    lat: latitude,
    lng: longitude,
    specialty: normalizedSpecialty,
  };
}

async function searchRecommendations({ lat, lng, specialty }) {
  const validatedInput = validateRecommendationInput({ lat, lng, specialty });
  const apiKey = process.env.PLACES_API;

  // Common production issue: the Places API request will fail immediately if
  // PLACES_API is missing or the Places API (New) is not enabled.
  if (!apiKey) {
    const error = new Error("PLACES_API is not configured.");
    error.code = "MISSING_PLACES_API";
    throw error;
  }

  const response = await fetch(
    "https://places.googleapis.com/v1/places:searchText",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "places.displayName,places.formattedAddress,places.rating,places.nationalPhoneNumber,places.currentOpeningHours.openNow",
      },
      body: JSON.stringify({
        textQuery: `${validatedInput.specialty} clinic or hospital`,
        locationBias: {
          circle: {
            center: {
              latitude: validatedInput.lat,
              longitude: validatedInput.lng,
            },
            radius: 5000.0,
          },
        },
      }),
    },
  );

  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const googleMessage =
      payload?.error?.message ||
      payload?.message ||
      "Google Places API request failed.";
    const error = new Error(googleMessage);
    error.code = "GOOGLE_PLACES_ERROR";
    error.status = response.status;
    error.details = payload;
    throw error;
  }

  const recommendations = Array.isArray(payload?.places)
    ? payload.places
        .map((place) => ({
          name: place?.displayName?.text || "Unknown location",
          address: place?.formattedAddress || "Address unavailable",
          rating:
            typeof place?.rating === "number"
              ? Number(place.rating.toFixed(1))
              : null,
          phone: place?.nationalPhoneNumber || null,
          isOpen:
            typeof place?.currentOpeningHours?.openNow === "boolean"
              ? place.currentOpeningHours.openNow
              : null,
        }))
        .sort((left, right) => {
          const leftRating = left.rating ?? -1;
          const rightRating = right.rating ?? -1;
          return rightRating - leftRating;
        })
        .slice(0, 3)
    : [];

  return recommendations;
}

module.exports = {
  searchRecommendations,
  validateRecommendationInput,
};
