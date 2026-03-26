import os
from pathlib import Path
from typing import Any, Dict

import joblib
import numpy as np
import pandas as pd
import xgboost
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

MODELS_DIR = Path(__file__).parent / "models"

print("Loading models...")

try:
    thyroid_model = joblib.load(MODELS_DIR / "thyroid_model.pkl")
    diabetes_model = joblib.load(MODELS_DIR / "diabetes_model.pkl")
    cardiology_model = joblib.load(MODELS_DIR / "medvise_cardio_xgboost.pkl")
    cardiology_scaler = joblib.load(MODELS_DIR / "medvise_scaler.pkl")
    print("All models loaded successfully.")
except Exception as e:
    print(f"Error loading models: {e}")
    print("Please ensure your .pkl files are inside the 'models/' folder.")

app = FastAPI(
    title="MedVise ML Inference Service",
    description="Inference endpoints for Thyroid, Diabetes, and Cardiology models.",
    version="1.0.0",
)

@app.get("/health")
def health():
    return {"status": "ok", "models": ["thyroid", "diabetes", "cardiology"]}

from typing import Optional

# --- THYROID ---
class ThyroidInput(BaseModel):
    age: float = 0.0
    sex: float = 0.0
    tsh: float = 0.0
    t3: float = 0.0
    tt4: float = 0.0
    t4u: float = 0.0
    fti: float = 0.0

@app.post("/predict/thyroid")
def predict_thyroid(body: ThyroidInput):
    try:
        # We must map the 7 inputs to the exact 25 columns the XGBoost model expects!
        data = {
            "age": body.age,
            "sex": body.sex,
            "on thyroxine": 0,
            "query on thyroxine": 0,
            "on antithyroid medication": 0,
            "sick": 0,
            "pregnant": 0,
            "thyroid surgery": 0,
            "I131 treatment": 0,
            "query hypothyroid": 0,
            "query hyperthyroid": 0,
            "lithium": 0,
            "goitre": 0,
            "tumor": 0,
            "hypopituitary": 0,
            "psych": 0,
            "TSH measured": 1 if body.tsh != 0.0 else 0,
            "TSH": body.tsh,
            "T3 measured": 1 if body.t3 != 0.0 else 0, # The dataset only expects a boolean here!
            "TT4 measured": 1 if body.tt4 != 0.0 else 0,
            "TT4": body.tt4,
            "T4U measured": 1 if body.t4u != 0.0 else 0,
            "T4U": body.t4u,
            "FTI measured": 1 if body.fti != 0.0 else 0,
            "FTI": body.fti
        }
        
        df = pd.DataFrame([data])
        
        # Scale the data if the user has uploaded the thyroid_scaler.pkl
        try:
            thyroid_scaler = joblib.load(MODELS_DIR / "thyroid_scaler.pkl")
            X_input = thyroid_scaler.transform(df)
        except Exception:
            # Fallback if scaler isn't found (though predictions may be less accurate)
            X_input = df

        pred = int(thyroid_model.predict(X_input)[0])

        try:
            proba = float(thyroid_model.predict_proba(X_input)[0][1])
        except:
            proba = 0.0

        label = "High Risk for Thyroid Disease" if pred == 1 else "Low Risk / Healthy"
        return {"prediction": pred, "label": label, "probability": round(proba, 4)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- DIABETES ---
class DiabetesInput(BaseModel):
    gender: str = "Female" 
    age: float = 0.0
    hypertension: int = 0
    heart_disease: int = 0
    smoking_history: str = "No Info"
    bmi: float = 0.0
    HbA1c_level: float = 5.5
    blood_glucose_level: float = 100.0
    glucose: float = 0.0

@app.post("/predict/diabetes")
def predict_diabetes(body: DiabetesInput):
    try:
        final_glucose = body.blood_glucose_level
        if final_glucose == 100.0 and body.glucose != 0.0:
            final_glucose = body.glucose
            
        data = {
            "gender": body.gender,
            "age": body.age,
            "hypertension": body.hypertension,
            "heart_disease": body.heart_disease,
            "smoking_history": body.smoking_history,
            "bmi": body.bmi,
            "HbA1c_level": body.HbA1c_level,
            "blood_glucose_level": int(final_glucose)
        }
        
        df = pd.DataFrame([data])
        
        pred = int(diabetes_model.predict(df)[0])
        proba = float(diabetes_model.predict_proba(df)[0][1])

        label = "High Risk for Diabetes" if pred == 1 else "Low Risk / Healthy"
        return {"prediction": pred, "label": label, "probability": round(proba, 4)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- CARDIOLOGY ---
class CardiologyInput(BaseModel):
    age: float = 0.0
    sex: int = 1
    chest_pain_type: int = 4
    resting_bp_s: float = 120.0
    cholesterol: float = 200.0
    fasting_blood_sugar: int = 0
    resting_ecg: int = 0
    max_heart_rate: float = 100.0
    exercise_angina: int = 0
    oldpeak: float = 0.0
    st_slope: int = 2

CARDIOLOGY_LABELS = {0: "Healthy / No Disease", 1: "Mild Heart Disease", 2: "Severe Heart Disease"}

@app.post("/predict/cardiology")
def predict_cardiology(body: CardiologyInput):
    try:
        # We MUST map these to the exact column strings found in your CSV
        data = {
            "age": body.age,
            "sex": body.sex,
            "chest pain type": body.chest_pain_type,
            "resting bp s": body.resting_bp_s,
            "cholesterol": body.cholesterol,
            "fasting blood sugar": body.fasting_blood_sugar,
            "resting ecg": body.resting_ecg,
            "max heart rate": body.max_heart_rate,
            "exercise angina": body.exercise_angina,
            "oldpeak": body.oldpeak,
            "ST slope": body.st_slope
        }
        
        df = pd.DataFrame([data])
        X_scaled = cardiology_scaler.transform(df)
        pred = int(cardiology_model.predict(X_scaled)[0])
        probas = cardiology_model.predict_proba(X_scaled)[0].tolist()

        label = CARDIOLOGY_LABELS.get(pred, "Unknown Risk Level")

        return {
            "prediction": pred,
            "label": label,
            "probabilities": [round(p, 4) for p in probas],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))