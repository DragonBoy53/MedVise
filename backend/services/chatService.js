require("dotenv").config();
const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// ─── System Instruction ──────────────────────────────────────────────────────
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

// ─── Tool Declarations ────────────────────────────────────────────────────────
const tools = [
  {
    functionDeclarations: [
      {
        name: "predict_cardiology",
        description:
          "Predicts cardiovascular disease risk using clinical features extracted from the patient's description. Call this when the user reports cardiac symptoms such as chest pain, shortness of breath, palpitations, or irregular heartbeat.",
        parameters: {
          type: "object",
          properties: {
            extracted_features: {
              type: "object",
              description:
                "Clinical features required for the cardiology ML model, based on the UCI Heart Disease dataset.",
              properties: {
                age:                    { type: "number", description: "Patient age in years." },
                sex:                    { type: "number", description: "Sex: 1 = male, 0 = female." },
                chest_pain_type:        { type: "number", description: "Chest pain type: 0=typical angina, 1=atypical angina, 2=non-anginal pain, 3=asymptomatic." },
                resting_bp:             { type: "number", description: "Resting blood pressure in mmHg." },
                cholesterol:            { type: "number", description: "Serum cholesterol in mg/dL." },
                fasting_blood_sugar:    { type: "number", description: "Fasting blood sugar > 120 mg/dL: 1 = true, 0 = false." },
                resting_ecg:            { type: "number", description: "Resting ECG results: 0=normal, 1=ST-T wave abnormality, 2=left ventricular hypertrophy." },
                max_heart_rate:         { type: "number", description: "Maximum heart rate achieved during exercise." },
                exercise_induced_angina:{ type: "number", description: "Exercise induced angina: 1 = yes, 0 = no." },
                st_depression:          { type: "number", description: "ST depression induced by exercise relative to rest." },
              },
              required: ["age", "sex", "chest_pain_type", "resting_bp", "cholesterol", "max_heart_rate"],
            },
          },
          required: ["extracted_features"],
        },
      },

      {
        name: "predict_diabetes",
        description:
          "Predicts diabetes risk using clinical features extracted from the patient's description. Call this when the user reports symptoms such as extreme thirst, frequent urination, sudden weight loss, blurred vision, or mentions high blood glucose levels.",
        parameters: {
          type: "object",
          properties: {
            extracted_features: {
              type: "object",
              description:
                "Clinical features required for the diabetes ML model, based on the PIMA Indian Diabetes dataset.",
              properties: {
                pregnancies:              { type: "number", description: "Number of times pregnant (0 for males)." },
                glucose:                  { type: "number", description: "Plasma glucose concentration (mg/dL), from a 2-hour oral glucose tolerance test." },
                blood_pressure:           { type: "number", description: "Diastolic blood pressure in mmHg." },
                skin_thickness:           { type: "number", description: "Triceps skinfold thickness in mm." },
                insulin:                  { type: "number", description: "2-hour serum insulin in µU/mL." },
                bmi:                      { type: "number", description: "Body Mass Index (weight in kg / height in m²)." },
                diabetes_pedigree_function: { type: "number", description: "Diabetes pedigree function — a score of genetic diabetes risk based on family history." },
                age:                      { type: "number", description: "Patient age in years." },
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
          "Predicts thyroid disorder risk (hypothyroid, hyperthyroid, or normal) using clinical and lab features extracted from the patient's description. Call this when the user reports fatigue, unexplained weight changes, hair loss, cold/heat intolerance, neck swelling, or mentions abnormal TSH/T3/T4 values.",
        parameters: {
          type: "object",
          properties: {
            extracted_features: {
              type: "object",
              description:
                "Clinical and laboratory features required for the thyroid ML model.",
              properties: {
                age:          { type: "number",  description: "Patient age in years." },
                sex:          { type: "string",  description: "Patient sex: 'M' or 'F'." },
                on_thyroxine: { type: "boolean", description: "Whether the patient is currently on thyroxine medication." },
                tsh:          { type: "number",  description: "Thyroid Stimulating Hormone level (mIU/L)." },
                t3:           { type: "number",  description: "Triiodothyronine (T3) level (nmol/L)." },
                tt4:          { type: "number",  description: "Total Thyroxine (TT4) level (nmol/L)." },
                t4u:          { type: "number",  description: "T4 uptake ratio." },
                fti:          { type: "number",  description: "Free Thyroxine Index (FTI)." },
                goitre:       { type: "boolean", description: "Whether the patient has a goitre." },
                tumor:        { type: "boolean", description: "Whether a thyroid tumor has been noted." },
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

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = { ai, SYSTEM_INSTRUCTION, tools };
