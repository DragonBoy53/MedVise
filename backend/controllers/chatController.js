const fs = require("fs");
const { ai, SYSTEM_INSTRUCTION, tools } = require("../services/chatService");
const {
  createPredictionEvent,
  getSpecialtyFromToolName,
} = require("../services/telemetryService");
const {
  getChatSessionForUser,
  listChatSessionsForUser,
  normalizeChatSessionId,
  persistChatInteraction,
} = require("../services/chatPersistenceService");
const {
  isSupabaseStorageConfigured,
  uploadChatImage,
} = require("../services/supabaseStorageService");

const MODEL_NAME = process.env.MODEL_NAME;
const ML_SERVICE_URL = process.env.ML_SERVICE_URL;

async function postJsonWithTimeout(url, payload, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const responseText = await response.text();
    let parsed;
    try {
      parsed = responseText ? JSON.parse(responseText) : {};
    } catch {
      parsed = { message: responseText };
    }

    if (!response.ok) {
      const error = new Error(
        parsed?.message || `Request failed with status ${response.status}`,
      );
      error.status = response.status;
      error.response = parsed;
      throw error;
    }

    return parsed;
  } finally {
    clearTimeout(timeout);
  }
}

async function runCardiologyModel(features) {
  if (!ML_SERVICE_URL) return { error: "ML_SERVICE_URL not configured." };
  return postJsonWithTimeout(`${ML_SERVICE_URL}/predict/cardiology`, features);
}

async function runDiabetesModel(features) {
  if (!ML_SERVICE_URL) return { error: "ML_SERVICE_URL not configured." };
  return postJsonWithTimeout(`${ML_SERVICE_URL}/predict/diabetes`, features);
}

async function runThyroidModel(features) {
  if (!ML_SERVICE_URL) return { error: "ML_SERVICE_URL not configured." };
  return postJsonWithTimeout(`${ML_SERVICE_URL}/predict/thyroid`, features);
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

function parseHistory(rawHistory) {
  if (!rawHistory) return [];
  let parsed;
  try {
    parsed = typeof rawHistory === "string" ? JSON.parse(rawHistory) : rawHistory;
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((turn) => {
      const role = turn?.role === "model" ? "model" : turn?.role === "user" ? "user" : null;
      const text = typeof turn?.text === "string" ? turn.text.trim() : "";
      if (!role || !text) return null;
      return { role, parts: [{ text }] };
    })
    .filter(Boolean);
}

async function chatController(req, res) {
  const file = req.file;

  try {
    const message = req.body.message || "";
    const chatSessionId = normalizeChatSessionId(req.body.chatSessionId);
    const promptText = message || (file ? "Please analyze this medical image." : "Hello");
    const history = parseHistory(req.body.history);
    let imageAttachment = null;

    let messagePayload;

    if (file) {
      const imageBuffer = fs.readFileSync(file.path);
      if (isSupabaseStorageConfigured()) {
        try {
          imageAttachment = await uploadChatImage({
            file,
            clerkUserId: req.auth?.clerkUserId || null,
          });
        } catch (storageError) {
          console.error("[chatController] Supabase image upload failed:", storageError);
        }
      } else {
        console.warn(
          "[chatController] Supabase Storage is not configured; image metadata will be saved without a remote URL.",
        );
      }

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
      history,
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

    try {
      const savedChat = await persistChatInteraction({
        clerkUserId: req.auth?.clerkUserId || null,
        chatSessionId,
        userMessage: message || null,
        assistantMessage: replyText,
        prediction: lastPrediction,
        hadImage: Boolean(file),
        imageAttachment,
      });
      res.locals.chatSessionId = savedChat.chatSessionId;
    } catch (persistenceError) {
      console.error("[chatController] Chat persistence failed:", persistenceError);
    }

    // Cleanup temp image
    if (file) {
      try { fs.unlinkSync(file.path); } catch (e) { console.warn("Temp cleanup failed"); }
    }

    // Return reply + prediction so the frontend can show the hospital prompt
    res.json({
      reply: replyText,
      prediction: lastPrediction, // null if no ML tool was called this turn
      chatSessionId: res.locals.chatSessionId || chatSessionId || null,
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

async function listChatHistory(req, res) {
  try {
    const items = await listChatSessionsForUser(req.auth?.clerkUserId, req.query?.limit);
    return res.json({ items });
  } catch (error) {
    console.error("[chatController.listChatHistory]", error);

    if (error.code === "SCHEMA_NOT_READY") {
      return res.status(503).json({
        message: `Schema not ready - ${error.originalMessage || error.message}. Apply the chat history SQL migration to NeonDB.`,
      });
    }

    if (error.code === "UNSUPPORTED_AUTH") {
      return res.status(400).json({ message: "This account cannot view chat history." });
    }

    return res.status(500).json({ message: "Failed to load chat history." });
  }
}

async function getChatHistorySession(req, res) {
  try {
    const item = await getChatSessionForUser({
      clerkUserId: req.auth?.clerkUserId,
      chatSessionId: req.params.id,
    });
    return res.json({ item });
  } catch (error) {
    console.error("[chatController.getChatHistorySession]", error);

    if (error.code === "CHAT_SESSION_NOT_FOUND") {
      return res.status(404).json({ message: "Chat session not found." });
    }

    if (error.code === "SCHEMA_NOT_READY") {
      return res.status(503).json({
        message: `Schema not ready - ${error.originalMessage || error.message}. Apply the chat history SQL migration to NeonDB.`,
      });
    }

    if (error.code === "UNSUPPORTED_AUTH") {
      return res.status(400).json({ message: "This account cannot view chat history." });
    }

    return res.status(500).json({ message: "Failed to load this chat." });
  }
}

module.exports = chatController;
module.exports.listChatHistory = listChatHistory;
module.exports.getChatHistorySession = getChatHistorySession;
