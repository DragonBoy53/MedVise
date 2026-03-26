"""
MedVise Model Export Script
============================
Copy-paste each section into the corresponding cell in Models.ipynb
and run AFTER training is complete, so `model` and `scaler` are in scope.

Alternatively, run this entire file at the end of the notebook by adding:
    exec(open('export_models.py').read())
"""

import joblib
import json
import os

os.makedirs("exports", exist_ok=True)

# ──────────────────────────────────────────────
# CELL 1 — Thyroid (XGBoost + StandardScaler)
# Run this after Cell 1 has finished training
# ──────────────────────────────────────────────
# Variables expected in scope: model, scaler, X (DataFrame before scaling)

def export_thyroid(model, scaler, X):
    joblib.dump(model, "exports/thyroid_model.pkl")
    joblib.dump(scaler, "exports/thyroid_scaler.pkl")
    # Save feature order so the API uses the same column order
    with open("exports/thyroid_features.json", "w") as f:
        json.dump(list(X.columns), f)
    print("✅ Thyroid model exported.")
    print("   Features:", list(X.columns))


# ──────────────────────────────────────────────
# CELL 2 — Diabetes (CatBoost)
# Run this after Cell 2 has finished training
# ──────────────────────────────────────────────
# Variables expected in scope: model, X (DataFrame before split)

def export_diabetes(model, X):
    model.save_model("exports/diabetes_model.cbm")
    # Save feature order + which are categorical
    categorical_features = ["gender", "smoking_history"]
    feature_names = list(X.columns)
    with open("exports/diabetes_features.json", "w") as f:
        json.dump({"features": feature_names, "cat_features": categorical_features}, f)
    print("✅ Diabetes model exported.")
    print("   Features:", feature_names)


# ──────────────────────────────────────────────
# CELL 3 — Cardiology (XGBoost multi-class + StandardScaler)
# Run this after Cell 3 has finished training
# ──────────────────────────────────────────────
# Variables expected in scope: model, scaler, X (DataFrame before scaling)

def export_cardiology(model, scaler, X):
    joblib.dump(model, "exports/cardiology_model.pkl")
    joblib.dump(scaler, "exports/cardiology_scaler.pkl")
    with open("exports/cardiology_features.json", "w") as f:
        json.dump(list(X.columns), f)
    print("✅ Cardiology model exported.")
    print("   Features:", list(X.columns))


# ──────────────────────────────────────────────
# HOW TO USE
# ──────────────────────────────────────────────
# After training each model in its respective cell, call:
#
#   export_thyroid(model, scaler, X)      # after Cell 1
#   export_diabetes(model, X)             # after Cell 2
#   export_cardiology(model, scaler, X)   # after Cell 3
#
# Then copy the exports/ folder into ml_service/models/
