require("dotenv").config();
const { GoogleGenAI } = require("@google/genai");

// Initialize the new Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_INSTRUCTION = `
You are MedVise Assistant — an AI-powered medical support companion built into the MedVise platform.

## Identity
- You are "MedVise Assistant". Never identify yourself as Gemini, a large language model, an AI by Google, or any other product.
- If asked who or what you are, say: "I am MedVise Assistant, your personal medical support companion."

## Domain Restriction
- You ONLY discuss topics within the medical and healthcare domain: symptoms, diseases, medications, diagnostics, wellness, anatomy, lab values, and general health guidance.
- If the user asks about programming, software, recipes, weather, history, sports, finance, or ANY non-medical topic, politely decline and steer the conversation back to health.

## Tone and Style
- Be empathetic, calm, clear, and professional.
- Avoid medical jargon when speaking to non-professionals; explain terms simply.
- When providing health insights, ALWAYS include this disclaimer at the end:
  "⚠️ Disclaimer: This information is for educational purposes only and does not constitute professional medical advice. Please consult a licensed healthcare provider for diagnosis and treatment."

## Tool Usage (ML Model Predictions)
- You have access to three specialized ML prediction tools. Use them intelligently based on the user's symptoms:
  - predict_cardiology: for heart issues (chest pain, shortness of breath, high blood pressure).
  - predict_diabetes: for diabetes (extreme thirst, frequent urination, high blood glucose).
  - predict_thyroid: for thyroid disorders (fatigue, unexplained weight changes, neck swelling, TSH/T3/T4 abnormalities).
- Before calling a tool, extract as many feature values as possible from the user's message.
- If critical feature values are missing, ask the user for them in a friendly, conversational way before invoking the tool.
- After receiving tool results, interpret them for the patient in plain language.
`.trim();

const tools = [
  {
    functionDeclarations: [
      {
        name: "predict_cardiology",
        description: "Predicts cardiovascular disease risk. Call when a user reports cardiac symptoms or mentions heart-related lab values.",
        parameters: {
          type: "OBJECT",
          properties: {
            extracted_features: {
              type: "OBJECT",
              description: "Features matching the CardiologyInput model.",
              properties: {
                age: { type: "NUMBER", description: "Patient age in years." },
                gender: { type: "INTEGER", description: "Gender: 1 = male, 2 = female, 0 = unknown." },
                height: { type: "NUMBER", description: "Height in centimetres." },
                weight: { type: "NUMBER", description: "Weight in kilograms." },
                ap_hi: { type: "NUMBER", description: "Systolic blood pressure (mmHg)." },
                ap_lo: { type: "NUMBER", description: "Diastolic blood pressure (mmHg)." },
                cholesterol: { type: "INTEGER", description: "Cholesterol level: 1 = normal, 2 = above normal, 3 = well above normal." },
                gluc: { type: "INTEGER", description: "Glucose level: 1 = normal, 2 = above normal, 3 = well above normal." },
                smoke: { type: "INTEGER", description: "Smoking status: 1 = yes, 0 = no." },
                alco: { type: "INTEGER", description: "Alcohol intake: 1 = yes, 0 = no." },
                active: { type: "INTEGER", description: "Physical activity: 1 = yes, 0 = no." },
              },
              required: ["age", "ap_hi", "ap_lo", "cholesterol"],
            },
          },
          required: ["extracted_features"],
        },
      },
      {
        name: "predict_diabetes",
        description: "Predicts diabetes risk. Call when a user reports thirst, frequent urination, blurred vision, or mentions blood glucose levels.",
        parameters: {
          type: "OBJECT",
          properties: {
            extracted_features: {
              type: "OBJECT",
              description: "Features matching your exact CatBoost dataset for Diabetes.",
              properties: {
                age: { type: "NUMBER", description: "Patient age in years." },
                gender: { type: "STRING", description: "'Male', 'Female', or 'Other'" },
                bmi: { type: "NUMBER", description: "Body Mass Index (kg/m²)." },
                blood_glucose_level: { type: "NUMBER", description: "Blood glucose level in mg/dL" },
                HbA1c_level: { type: "NUMBER", description: "HbA1c level percentage" },
                hypertension: { type: "INTEGER", description: "1 if they have hypertension, 0 if not" },
                heart_disease: { type: "INTEGER", description: "1 if they have heart disease, 0 if not" },
                smoking_history: { type: "STRING", description: "'never', 'former', 'current', or 'No Info'" },
              },
              required: ["age", "blood_glucose_level", "bmi"],
            },
          },
          required: ["extracted_features"],
        },
      },
      {
        name: "predict_thyroid",
        description: "Predicts thyroid disease risk. Call when a user reports fatigue, weight changes, cold/heat intolerance, or TSH/T3/T4 values.",
        parameters: {
          type: "OBJECT",
          properties: {
            extracted_features: {
              type: "OBJECT",
              description: "Features matching the ThyroidInput model.",
              properties: {
                age: { type: "NUMBER", description: "Patient age in years." },
                sex: { type: "INTEGER", description: "Sex: 1 = male, 0 = female." },
                tsh: { type: "NUMBER", description: "Thyroid Stimulating Hormone level (mIU/L)." },
                t3: { type: "NUMBER", description: "Triiodothyronine (T3) level (nmol/L)." },
                tt4: { type: "NUMBER", description: "Total Thyroxine (TT4) level (nmol/L)." },
                t4u: { type: "NUMBER", description: "T4 Uptake ratio." },
                fti: { type: "NUMBER", description: "Free Thyroxine Index (FTI)." },
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