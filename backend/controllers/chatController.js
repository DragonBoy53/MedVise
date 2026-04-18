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

    // --- THE FIX ---
    // The strict type checker demands raw strings for text. 
    // Do NOT wrap text in { text: "..." }
    if (file) {
      const imageBuffer = fs.readFileSync(file.path);
      messagePayload = [
        {
          inlineData: {
            mimeType: file.mimetype,
            data: imageBuffer.toString("base64"),
          },
        },
        promptText // Raw string directly in the array
      ];
    } else {
      messagePayload = promptText; // Just a raw string!
    }

    const chat = ai.chats.create({
      model: MODEL_NAME,
      config: { systemInstruction: SYSTEM_INSTRUCTION, tools },
    });

    // 1. Send the initial user message
    let response = await chat.sendMessage({ message: messagePayload });

    // 2. The Function Calling Loop
    let maxIterations = 3;
    while (maxIterations-- > 0) {

      // The new SDK has a clean, built-in getter for function calls!
      const functionCalls = response.functionCalls;
      if (!functionCalls || functionCalls.length === 0) break; // Exit loop if no tools are called

      const call = functionCalls[0];
      const { name, args } = call;
      console.log(`[chatController] Tool called: ${name}`);

      // Call your Python FastAPI Service
      const toolStartTime = Date.now();
      const toolResult = await dispatchTool(name, args);
      const latencyMs = Date.now() - toolStartTime;
      const specialty = getSpecialtyFromToolName(name);

      if (specialty && !toolResult?.error) {
        try {
          await createPredictionEvent({
            specialty,
            extractedFeatures: args?.extracted_features || args,
            toolResult,
            latencyMs,
          });
        } catch (telemetryError) {
          console.error("[chatController] Telemetry logging failed:", telemetryError);
        }
      }

      // 3. Send the ML result back to the chat session
      response = await chat.sendMessage({
        message: [{
          functionResponse: {
            name: name,
            response: toolResult
          }
        }]
      });
    }

    // Extract final text using the built-in SDK getter
    const replyText = response.text || "I'm sorry, I couldn't generate a response. Please try again.";

    // Cleanup image upload
    if (file) {
      try { fs.unlinkSync(file.path); } catch (e) { console.warn("Temp cleanup failed"); }
    }

    res.json({ reply: replyText });

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
