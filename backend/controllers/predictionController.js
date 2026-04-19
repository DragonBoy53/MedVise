const predictionService = require("../services/predictionService");

async function listPredictions(req, res) {
  try {
    const items = await predictionService.listPredictionsForUser(req.auth);
    return res.json({ items });
  } catch (error) {
    console.error("[predictionController.listPredictions]", error);
    if (error.code === "SCHEMA_NOT_READY") {
      return res.status(503).json({
        message:
          "Prediction tables are not ready yet. Run backend/sql/admin_portal_schema.sql first.",
      });
    }
    if (error.code === "UNSUPPORTED_AUTH") {
      return res.status(400).json({ message: "This account type is not supported for predictions." });
    }
    return res.status(500).json({ message: "Failed to load predictions." });
  }
}

async function getPrediction(req, res) {
  try {
    const item = await predictionService.getPredictionForUser(Number(req.params.id), req.auth);
    return res.json({ item });
  } catch (error) {
    console.error("[predictionController.getPrediction]", error);
    if (error.code === "SCHEMA_NOT_READY") {
      return res.status(503).json({
        message:
          "Prediction tables are not ready yet. Run backend/sql/admin_portal_schema.sql first.",
      });
    }
    if (error.code === "PREDICTION_NOT_FOUND") {
      return res.status(404).json({ message: "Prediction not found." });
    }
    if (error.code === "UNSUPPORTED_AUTH") {
      return res.status(400).json({ message: "This account type is not supported for predictions." });
    }
    return res.status(500).json({ message: "Failed to load prediction detail." });
  }
}

async function labelPrediction(req, res) {
  try {
    const isPredictionCorrect = req.body?.isPredictionCorrect;
    if (typeof isPredictionCorrect !== "boolean") {
      return res.status(400).json({ message: "isPredictionCorrect must be true or false." });
    }

    const record = await predictionService.labelPredictionForUser(
      Number(req.params.id),
      req.auth,
      isPredictionCorrect,
    );

    return res.status(201).json({
      message: "Prediction label saved successfully.",
      record,
    });
  } catch (error) {
    console.error("[predictionController.labelPrediction]", error);
    if (error.code === "SCHEMA_NOT_READY") {
      return res.status(503).json({
        message:
          "Prediction tables are not ready yet. Run backend/sql/admin_portal_schema.sql first.",
      });
    }
    if (error.code === "PREDICTION_NOT_FOUND") {
      return res.status(404).json({ message: "Prediction not found." });
    }
    if (error.code === "UNSUPPORTED_AUTH") {
      return res.status(400).json({ message: "This account type is not supported for predictions." });
    }
    return res.status(500).json({ message: "Failed to save prediction label." });
  }
}

module.exports = {
  listPredictions,
  getPrediction,
  labelPrediction,
};
