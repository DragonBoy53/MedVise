const fs = require("fs");
const axios = require("axios");
const { ai, SYSTEM_INSTRUCTION, tools } = require("../services/chatService");
const {
  createPredictionEvent,
  getSpecialtyFromToolName,
} = require("../services/telemetryService");

const MODEL_NAME = process.env.MODEL_NAME;
const ML_SERVICE_URL = process.env.ML_SERVICE_URL;

async function runCardiologyModel(features) {
  if (!ML_SERVICE_URL) return { error: "ML_SERVICE_URL not configured." };
  const res = await axios.post(`${ML_SERVICE_URL}/predict/cardiology`, features, { timeout: 15000 });
  return res.data;
}

async function runDiabetesModel(features) {
  if (!ML_SERVICE_URL) return { error: "ML_SERVICE_URL not configured." };
  const res = await axios.post(`${ML_SERVICE_URL}/predict/diabetes`, features, { timeout: 15000 });
  return res.data;
}

async function runThyroidModel(features) {
  if (!ML_SERVICE_URL) return { error: "ML_SERVICE_URL not configured." };
  const res = await axios.post(`${ML_SERVICE_URL}/predict/thyroid`, features, { timeout: 15000 });
  return res.data;
}

async function dispatchTool(name, args) {
  const extracted_features = args.extracted_features || args;

  switch (name) {
    case "predict_cardiology":
      return runCardiologyModel(extracted_features);
    case "predict_diabetes":
      return runDiabetesModel(extracted_features);
    case "predict_thyroid":
      return runThyroidModel(extracted_features);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

async function chatController(req, res) {
  const file = req.file;

  try {
    const message = req.body.message || "";
    const promptText = message || (file ? "Please analyze this medical image." : "Hello");

    let messagePayload;

    if (file) {
      const imageBuffer = fs.readFileSync(file.path);
      messagePayload = [
        {
          inlineData: {
            mimeType: file.mimetype,
            data: imageBuffer.toString("base64"),
          },
        },
        promptText,
      ];
    } else {
      messagePayload = promptText;
    }

    const chat = ai.chats.create({
      model: MODEL_NAME,
      config: { systemInstruction: SYSTEM_INSTRUCTION, tools },
    });

    // 1. Send the initial user message
    let response = await chat.sendMessage({ message: messagePayload });

    // Track the last prediction made during this chat turn
    let lastPrediction = null;

    // 2. The Function Calling Loop
    let maxIterations = 3;
    while (maxIterations-- > 0) {
      const functionCalls = response.functionCalls;
      if (!functionCalls || functionCalls.length === 0) break;

      const call = functionCalls[0];
      const { name, args } = call;
      console.log(`[chatController] Tool called: ${name}`);

      // Call the ML service
      const toolStartTime = Date.now();
      const toolResult = await dispatchTool(name, args);
      const latencyMs = Date.now() - toolStartTime;
      const specialty = getSpecialtyFromToolName(name);

      if (specialty && !toolResult?.error) {
        try {
          const savedEvent = await createPredictionEvent({
            specialty,
            extractedFeatures: args?.extracted_features || args,
            toolResult,
            latencyMs,
            clerkUserId: req.auth?.clerkUserId || null,
          });

          // Build a prediction object to return to the frontend
          // savedEvent has: id, specialty, predicted_label, predicted_value, created_at
          lastPrediction = {
            id: savedEvent?.id || null,
            specialty,
            predictedLabel: toolResult?.label || savedEvent?.predicted_label || "Unknown",
            predictedValue: Number.isInteger(toolResult?.prediction)
              ? toolResult.prediction
              : savedEvent?.predicted_value ?? null,
            probabilities: toolResult?.probabilities || toolResult?.probability || null,
          };
        } catch (telemetryError) {
          console.error("[chatController] Telemetry logging failed:", telemetryError);

          // Even if DB save failed, still surface the prediction to the frontend
          // so the hospital recommendation prompt can fire
          lastPrediction = {
            id: null,
            specialty,
            predictedLabel: toolResult?.label || "Unknown",
            predictedValue: Number.isInteger(toolResult?.prediction)
              ? toolResult.prediction
              : null,
            probabilities: toolResult?.probabilities || toolResult?.probability || null,
          };
        }
      }

      // 3. Send the ML result back to the chat session
      response = await chat.sendMessage({
        message: [{
          functionResponse: {
            name,
            response: toolResult,
          },
        }],
      });
    }

    // Extract final reply text
    const replyText = response.text || "I'm sorry, I couldn't generate a response. Please try again.";

    // Cleanup temp image
    if (file) {
      try { fs.unlinkSync(file.path); } catch (e) { console.warn("Temp cleanup failed"); }
    }

    // Return reply + prediction so the frontend can show the hospital prompt
    res.json({
      reply: replyText,
      prediction: lastPrediction, // null if no ML tool was called this turn
    });

  } catch (error) {
    console.error("[chatController] Error:", error);

    if (file) {
      try { fs.unlinkSync(file.path); } catch (e) { }
    }

    res.status(500).json({
      message: "MedVise AI is temporarily unavailable.",
      details: error.message,
    });
  }
}

module.exports = chatController;