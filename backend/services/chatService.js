require("dotenv").config();
const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_INSTRUCTION = `
You are MedVise Assistant — an AI-powered medical support companion built into the MedVise platform.

## Identity
- You are "MedVise Assistant". Never identify yourself as Gemini, a large language model, an AI by Google, or any other product.
- If asked who or what you are, say: "I am MedVise Assistant, your personal medical support companion."

## Domain Restriction
- You ONLY discuss topics within the medical and healthcare domain: symptoms, diseases, medications, diagnostics, wellness, anatomy, lab values, and general health guidance.
- If the user asks about programming, software, recipes, weather, history, sports, finance, or ANY non-medical topic, politely decline and steer the conversation back to health:
  Example: "I'm here to help with medical and health-related questions only. Is there anything about your health or symptoms I can assist you with?"

## Tone and Style
- Be empathetic, calm, clear, and professional.
- Avoid medical jargon when speaking to non-professionals; explain terms simply.
- When providing health insights, ALWAYS include this disclaimer at the end:
  "⚠️ Disclaimer: This information is for educational purposes only and does not constitute professional medical advice. Please consult a licensed healthcare provider for diagnosis and treatment."

## Tool Usage (ML Model Predictions)
- You have access to three specialized ML prediction tools. Use them intelligently based on the user's symptoms:
  - predict_cardiology: when symptoms relate to the heart (chest pain, shortness of breath, palpitations, irregular heartbeat, jaw/arm pain).
  - predict_diabetes: when symptoms relate to diabetes (extreme thirst, frequent urination, sudden weight loss, blurred vision, high blood glucose readings, numbness in extremities).
  - predict_thyroid: when symptoms relate to thyroid disorders (fatigue, unexplained weight gain or loss, hair loss, cold or heat intolerance, neck swelling, voice changes, TSH/T3/T4 abnormalities).
- Before calling a tool, extract as many feature values as possible from the user's message.
- If critical feature values are missing, ask the user for them in a friendly, conversational way before invoking the tool. Never call a tool with completely unknown/null values for the core clinical fields.
- After receiving tool results, interpret them for the patient in plain language and include the medical disclaimer.
`.trim();

const tools = [
  {
    functionDeclarations: [
      {
        name: "predict_cardiology",
        description:
          "Predicts cardiovascular disease risk. Call when a user reports cardiac symptoms: chest pain, shortness of breath, palpitations, high blood pressure, or mentions heart-related lab values.",
        parameters: {
          type: "object",
          properties: {
            extracted_features: {
              type: "object",
              description: "Features matching the CardiologyInput Pydantic model in the ML service.",
              properties: {
                age:         { type: "number", description: "Patient age in years." },
                gender:      { type: "number", description: "Gender: 1 = male, 0 = female." },
                height:      { type: "number", description: "Height in centimetres." },
                weight:      { type: "number", description: "Weight in kilograms." },
                ap_hi:       { type: "number", description: "Systolic blood pressure (mmHg)." },
                ap_lo:       { type: "number", description: "Diastolic blood pressure (mmHg)." },
                cholesterol: { type: "number", description: "Cholesterol level: 1 = normal, 2 = above normal, 3 = well above normal." },
                gluc:        { type: "number", description: "Glucose level: 1 = normal, 2 = above normal, 3 = well above normal." },
                smoke:       { type: "number", description: "Smoking status: 1 = yes, 0 = no." },
                alco:        { type: "number", description: "Alcohol intake: 1 = yes, 0 = no." },
                active:      { type: "number", description: "Physical activity: 1 = yes, 0 = no." },
              },
              required: ["age", "gender", "ap_hi", "ap_lo", "cholesterol"],
            },
          },
          required: ["extracted_features"],
        },
      },

      {
        name: "predict_diabetes",
        description:
          "Predicts diabetes risk. Call when a user reports extreme thirst, frequent urination, sudden weight loss, blurred vision, high blood glucose, or mentions insulin/glucose lab values.",
        parameters: {
          type: "object",
          properties: {
            extracted_features: {
              type: "object",
              description: "Features matching the DiabetesInput Pydantic model in the ML service (PIMA dataset).",
              properties: {
                pregnancies:     { type: "number", description: "Number of times pregnant (use 0 for males)." },
                glucose:         { type: "number", description: "Plasma glucose concentration in mg/dL (2-hour oral glucose tolerance test)." },
                blood_pressure:  { type: "number", description: "Diastolic blood pressure in mmHg." },
                skin_thickness:  { type: "number", description: "Triceps skinfold thickness in mm." },
                insulin:         { type: "number", description: "2-hour serum insulin in µU/mL." },
                bmi:             { type: "number", description: "Body Mass Index (kg/m²)." },
                dpf:             { type: "number", description: "Diabetes Pedigree Function — genetic diabetes risk score based on family history." },
                age:             { type: "number", description: "Patient age in years." },
              },
              required: ["glucose", "bmi", "age"],
            },
          },
          required: ["extracted_features"],
        },
      },

      {
        name: "predict_thyroid",
        description:
          "Predicts thyroid disease risk. Call when a user reports fatigue, unexplained weight gain/loss, hair loss, cold/heat intolerance, neck swelling, or mentions abnormal TSH/T3/T4 lab values.",
        parameters: {
          type: "object",
          properties: {
            extracted_features: {
              type: "object",
              description: "Features matching the ThyroidInput Pydantic model in the ML service.",
              properties: {
                age: { type: "number", description: "Patient age in years." },
                sex: { type: "number", description: "Sex: 1 = male, 0 = female." },
                tsh: { type: "number", description: "Thyroid Stimulating Hormone level (mIU/L). Normal range: 0.4 – 4.0." },
                t3:  { type: "number", description: "Triiodothyronine (T3) level (nmol/L). Normal: 1.2 – 2.7." },
                tt4: { type: "number", description: "Total Thyroxine (TT4) level (nmol/L). Normal: 64 – 154." },
                t4u: { type: "number", description: "T4 Uptake ratio. Normal: 0.7 – 1.05." },
                fti: { type: "number", description: "Free Thyroxine Index (FTI). Normal: 63 – 150." },
              },
              required: ["age", "sex", "tsh"],
            },
          },
          required: ["extracted_features"],
        },
      },
    ],
  },
];

module.exports = { ai, SYSTEM_INSTRUCTION, tools };
