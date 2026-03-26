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

class ThyroidInput(BaseModel):
    age: int = 0
    sex: int = 0
    tsh: float = 0.0
    t3: float = 0.0
    tt4: float = 0.0
    t4u: float = 0.0
    fti: float = 0.0

@app.post("/predict/thyroid")
def predict_thyroid(body: ThyroidInput):
    try:
        df = pd.DataFrame([body.dict()])
        pred = int(thyroid_model.predict(df)[0])

        try:
            proba = float(thyroid_model.predict_proba(df)[0][1])
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
class CardiologyInput(BaseModel):
    age: float = 0.0
    gender: int = 0
    height: float = 0.0
    weight: float = 0.0
    ap_hi: float = 0.0
    ap_lo: float = 0.0
    cholesterol: int = 1
    gluc: int = 1
    smoke: int = 0
    alco: int = 0
    active: int = 0

CARDIOLOGY_LABELS = {0: "Healthy", 1: "Mild Heart Disease", 2: "Severe Heart Disease"}

@app.post("/predict/cardiology")
def predict_cardiology(body: CardiologyInput):
    try:
        df = pd.DataFrame([body.dict()])
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