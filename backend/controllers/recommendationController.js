const { searchRecommendations } = require("../services/recommendationService");

async function createRecommendations(req, res) {
  try {
    const { lat, lng, specialty } = req.body || {};
    const recommendations = await searchRecommendations({
      lat,
      lng,
      specialty,
    });

    return res.json({
      recommendations,
    });
  } catch (error) {
    if (
      error.code === "INVALID_LATITUDE" ||
      error.code === "INVALID_LONGITUDE" ||
      error.code === "INVALID_SPECIALTY"
    ) {
      return res.status(400).json({ message: error.message });
    }

    console.error("[recommendationController.createRecommendations]", error);

    // Common production issue: Google may return a 4xx/5xx response for an
    // invalid field mask, disabled API, billing problem, or a missing API key.
    return res.status(500).json({
      message:
        error.code === "MISSING_PLACES_API"
          ? "Server configuration is incomplete. PLACES_API is missing."
          : "Failed to fetch hospital recommendations.",
    });
  }
}

module.exports = {
  createRecommendations,
};
