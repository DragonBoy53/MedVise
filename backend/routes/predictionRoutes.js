const express = require("express");
const predictionController = require("../controllers/predictionController");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.use(requireAuth);

router.get("/", predictionController.listPredictions);
router.get("/:id", predictionController.getPrediction);
router.post("/:id/ground-truth", predictionController.labelPrediction);

module.exports = router;
