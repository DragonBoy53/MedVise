const fs = require("fs");
const { ai, SYSTEM_INSTRUCTION, tools } = require("../services/chatService");
const MODEL_NAME = "gemini-2.5-flash";


function runCardiologyModel(features) {
  // TODO: Replace with real HTTP call, e.g.:
  // const res = await axios.post(process.env.CARDIOLOGY_MODEL_URL, features);
  // return res.data;
  console.log("[ML Stub] predict_cardiology called with:", features);
  return {
    prediction: "moderate_risk",
    probability: 0.62,
    model: "cardiology",
    note: "Stub result — replace with real ML inference call.",
  };
}

function runDiabetesModel(features) {
  // TODO: Replace with real HTTP call, e.g.:
  // const res = await axios.post(process.env.DIABETES_MODEL_URL, features);
  // return res.data;
  console.log("[ML Stub] predict_diabetes called with:", features);
  return {
    prediction: "at_risk",
    probability: 0.71,
    model: "diabetes",
    note: "Stub result — replace with real ML inference call.",
  };
}

function runThyroidModel(features) {
  // TODO: Replace with real HTTP call, e.g.:
  // const res = await axios.post(process.env.THYROID_MODEL_URL, features);
  // return res.data;
  console.log("[ML Stub] predict_thyroid called with:", features);
  return {
    prediction: "hypothyroid",
    probability: 0.78,
    model: "thyroid",
    note: "Stub result — replace with real ML inference call.",
  };
}

// ─── Tool Dispatcher ──────────────────────────────────────────────────────────
function dispatchTool(name, args) {
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

// ─── Chat Controller ──────────────────────────────────────────────────────────
async function chatController(req, res) {
  const file = req.file;

  try {
    const message = req.body.message || "";

    // 1. Build initial contents array
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

    // 2. First Gemini call
    let response = await ai.models.generateContent({
      model: MODEL_NAME,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: tools,
      },
      contents,
    });

    // 3. Function-calling loop (handles single or chained tool calls)
    let maxIterations = 5; // safety guard
    while (maxIterations-- > 0) {
      const candidate = response.candidates?.[0];
      if (!candidate) break;

      // Find a functionCall part in the response
      const fcPart = candidate.content?.parts?.find((p) => p.functionCall);
      if (!fcPart) break; // No tool call — we have a final text response

      const { name, args } = fcPart.functionCall;
      console.log(`[chatController] Gemini requested tool: ${name}`);

      // Execute the ML stub
      const toolResult = dispatchTool(name, args);

      // Append the model's tool-call turn and the tool result turn to contents
      contents = [
        ...contents,
        { role: "model", parts: [{ functionCall: { name, args } }] },
        {
          role: "user",
          parts: [
            {
              functionResponse: {
                name,
                response: { result: toolResult },
              },
            },
          ],
        },
      ];

      // Follow-up call so Gemini can generate a natural-language response
      response = await ai.models.generateContent({
        model: MODEL_NAME,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          tools: tools,
        },
        contents,
      });
    }

    // 4. Extract final text
    const replyText =
      response.candidates?.[0]?.content?.parts
        ?.filter((p) => p.text)
        ?.map((p) => p.text)
        ?.join("\n")
        ?.trim() ||
      response.text ||
      "I'm sorry, I couldn't generate a response. Please try again.";

    // 5. Cleanup temp file
    if (file) {
      try { fs.unlinkSync(file.path); } catch (e) { console.warn("Temp file cleanup failed:", e.message); }
    }

    res.json({ reply: replyText });

  } catch (error) {
    console.error("[chatController] Error:", error);

    // Cleanup on error
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
