const fs = require("fs");
const axios = require("axios");
const { ai, SYSTEM_INSTRUCTION, tools } = require("../services/chatService");
const MODEL_NAME = "gemini-2.5-flash";
const ML_SERVICE_URL = process.env.ML_SERVICE_URL;

async function runCardiologyModel(features) {
  if (!ML_SERVICE_URL) throw new Error("ML_SERVICE_URL is not set.");
  const res = await axios.post(`${ML_SERVICE_URL}/predict/cardiology`, features, { timeout: 15000 });
  return res.data;
}

async function runDiabetesModel(features) {
  if (!ML_SERVICE_URL) throw new Error("ML_SERVICE_URL is not set.");
  const res = await axios.post(`${ML_SERVICE_URL}/predict/diabetes`, features, { timeout: 15000 });
  return res.data;
}

async function runThyroidModel(features) {
  if (!ML_SERVICE_URL) throw new Error("ML_SERVICE_URL is not set.");
  const res = await axios.post(`${ML_SERVICE_URL}/predict/thyroid`, features, { timeout: 15000 });
  return res.data;
}

async function dispatchTool(name, args) {
  const { extracted_features } = args;
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
    const userParts = [];

    if (file) {
      const imageBuffer = fs.readFileSync(file.path);
      userParts.push({
        inlineData: {
          mimeType: file.mimetype,
          data: imageBuffer.toString("base64"),
        },
      });
    }

    const promptText = message || (file ? "Please analyze this medical image." : "Hello");
    userParts.push({ text: promptText });

    let contents = [{ role: "user", parts: userParts }];

    let response = await ai.models.generateContent({
      model: MODEL_NAME,
      config: { systemInstruction: SYSTEM_INSTRUCTION, tools },
      contents,
    });

    let maxIterations = 5;
    while (maxIterations-- > 0) {
      const candidate = response.candidates?.[0];
      if (!candidate) break;

      const fcPart = candidate.content?.parts?.find((p) => p.functionCall);
      if (!fcPart) break;

      const { name, args } = fcPart.functionCall;
      console.log(`[chatController] Tool called: ${name}`);

      const toolResult = await dispatchTool(name, args);

      contents = [
        ...contents,
        { role: "model", parts: [{ functionCall: { name, args } }] },
        {
          role: "user",
          parts: [{ functionResponse: { name, response: { result: toolResult } } }],
        },
      ];

      response = await ai.models.generateContent({
        model: MODEL_NAME,
        config: { systemInstruction: SYSTEM_INSTRUCTION, tools },
        contents,
      });
    }

    const replyText =
      response.candidates?.[0]?.content?.parts
        ?.filter((p) => p.text)
        ?.map((p) => p.text)
        ?.join("\n")
        ?.trim() ||
      response.text ||
      "I'm sorry, I couldn't generate a response. Please try again.";

    if (file) {
      try { fs.unlinkSync(file.path); } catch (e) { console.warn("Temp file cleanup failed:", e.message); }
    }

    res.json({ reply: replyText });

  } catch (error) {
    console.error("[chatController] Error:", error);

    if (file) {
      try { fs.unlinkSync(file.path); } catch (e) {}
    }

    res.status(500).json({
      message: "MedVise AI is temporarily unavailable.",
      details: error.message,
    });
  }
}

module.exports = chatController;
