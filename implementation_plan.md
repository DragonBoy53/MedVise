# ML Model Deployment to Google Cloud Run

Deploy the 3 MedVise ML models as a single containerized **FastAPI** inference service on **Google Cloud Run**, then wire the existing Vercel-hosted Node.js backend to call it.

> [!IMPORTANT]
> The backend is hosted on **Vercel**. Cloud Run will be a **separate** service. The Node.js backend stubs in [chatController.js](file:///c:/Users/abdul/OneDrive/Documents/Gitkraken/MedVise/backend/controllers/chatController.js) will call the Cloud Run URL via HTTP.

---

## Model Summary (from notebook analysis)

| Model | Library | Algorithm | Preprocessing | Output Classes |
|---|---|---|---|---|
| **Thyroid** | `xgboost` + `imblearn` | `XGBClassifier` | `StandardScaler` | Binary: 0=Healthy, 1=Disease |
| **Diabetes** | `catboost` | `CatBoostClassifier` | None (CatBoost handles it) | Binary: 0=No Diabetes, 1=Diabetes |
| **Cardiology** | `xgboost` + `imblearn` | `XGBClassifier` (multi:softprob) | `StandardScaler` | 3-class: 0=Healthy, 1=Mild, 2=Severe |

---

## Phase 1 — Export Models from the Notebook

Add this cell at the **end** of [tools/Models.ipynb](file:///c:/Users/abdul/OneDrive/Documents/Gitkraken/MedVise/tools/Models.ipynb) to save all three models:

```python
import joblib, os
os.makedirs("exports", exist_ok=True)

# --- Thyroid (cell 1: model + scaler are already in memory) ---
joblib.dump(model, "exports/thyroid_model.pkl")        # XGBClassifier
joblib.dump(scaler, "exports/thyroid_scaler.pkl")      # StandardScaler

# --- Diabetes (cell 2: model is already in memory) ---
# CatBoost has native save
model.save_model("exports/diabetes_model.cbm")         # CatBoostClassifier

# --- Cardiology (cell 3: model + scaler are already in memory) ---
joblib.dump(model, "exports/cardiology_model.pkl")     # XGBClassifier
joblib.dump(scaler, "exports/cardiology_scaler.pkl")   # StandardScaler

print("All models exported to exports/")
```

> [!NOTE]
> Run each training cell first in sequence so `model` and `scaler` variables are in scope. Cell 1 = Thyroid, Cell 2 = Diabetes, Cell 3 = Cardiology.

---

## Phase 2 — Build the `ml_service/` Folder

Create this folder structure at the root of the repo:

```
ml_service/
├── models/                          ← Copy exported files here
│   ├── thyroid_model.pkl
│   ├── thyroid_scaler.pkl
│   ├── diabetes_model.cbm
│   ├── cardiology_model.pkl
│   └── cardiology_scaler.pkl
├── main.py                          ← FastAPI app
├── requirements.txt
└── Dockerfile
```

### [NEW] ml_service/requirements.txt

```
fastapi
uvicorn[standard]
xgboost
catboost
scikit-learn
joblib
numpy
pandas
```

### [NEW] ml_service/main.py

Three POST endpoints:

#### `POST /predict/thyroid`
Input (JSON):
```json
{
  "age": 50, "sex": "F", "on_thyroxine": false,
  "tsh": 8.5, "t3": 1.2, "tt4": 80.0,
  "t4u": 0.9, "fti": 88.0, "goitre": false, "tumor": false
}
```
Output: `{ "prediction": 1, "label": "Thyroid Disease", "probability": 0.87 }`

#### `POST /predict/diabetes`
Input (JSON):
```json
{
  "gender": "Female", "age": 34.0, "hypertension": 0,
  "heart_disease": 0, "smoking_history": "never",
  "bmi": 31.5, "HbA1c_level": 6.5, "blood_glucose_level": 180
}
```
Output: `{ "prediction": 1, "label": "Diabetes", "probability": 0.71 }`

#### `POST /predict/cardiology`
Input (JSON) — features from `heart_disease_multiclass_engineered.csv` (all numeric, `drop(['target','diagnosis_class','diagnosis_label'])`):
```json
{
  "age": 45, "sex": 1, "cp": 0, "trestbps": 130,
  "chol": 240, "fbs": 1, "restecg": 0,
  "thalach": 150, "exang": 1, "oldpeak": 2.0
  // ... all engineered features from the CSV
}
```
Output: `{ "prediction": 1, "label": "Mild Disease", "probabilities": [0.1, 0.7, 0.2] }`

> [!IMPORTANT]
> **Cardiology feature list**: The exact column names depend on `heart_disease_multiclass_engineered.csv`. After running the export cell above, also run: `print(list(X.columns))` in the cardiology cell to get the definitive ordered feature list, then hard-code that order in `main.py`.

### [NEW] ml_service/Dockerfile

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
```

---

## Phase 3 — Deploy to Google Cloud Run

### Prerequisites
- Google Cloud SDK (`gcloud`) installed and authenticated
- A GCP project with billing and Cloud Run API enabled

### Commands

```bash
# 1. Set your project
gcloud config set project YOUR_PROJECT_ID

# 2. Build & push via Cloud Build (no local Docker needed)
cd ml_service
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/medvise-ml

# 3. Deploy to Cloud Run
gcloud run deploy medvise-ml \
  --image gcr.io/YOUR_PROJECT_ID/medvise-ml \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --memory 2Gi \
  --port 8080
```

Cloud Run will return a URL like:
`https://medvise-ml-xxxxxxxxxx-uc.a.run.app`

---

## Phase 4 — Wire Node.js Backend (Vercel)

### [MODIFY] backend/.env (Vercel environment variables)
Add via Vercel dashboard → Settings → Environment Variables:
```
ML_SERVICE_URL=https://medvise-ml-xxxxxxxxxx-uc.a.run.app
```

### [MODIFY] backend/controllers/chatController.js
Replace the 3 stub functions (already stubbed) with real axios calls:

```js
const axios = require("axios");
const ML_BASE = process.env.ML_SERVICE_URL;

async function runCardiologyModel(features) {
  const res = await axios.post(`${ML_BASE}/predict/cardiology`, features, { timeout: 15000 });
  return res.data;
}
async function runDiabetesModel(features) {
  const res = await axios.post(`${ML_BASE}/predict/diabetes`, features, { timeout: 15000 });
  return res.data;
}
async function runThyroidModel(features) {
  const res = await axios.post(`${ML_BASE}/predict/thyroid`, features, { timeout: 15000 });
  return res.data;
}
```

`axios` is already a backend dependency; no new package needed.

---

## Verification Plan

### 1. Local FastAPI test (before deploying)
```bash
cd ml_service
pip install -r requirements.txt
uvicorn main:app --reload --port 8080
```
Then:
```bash
curl -X POST http://localhost:8080/predict/diabetes \
  -H "Content-Type: application/json" \
  -d '{"gender":"Female","age":34,"hypertension":0,"heart_disease":0,"smoking_history":"never","bmi":31.5,"HbA1c_level":6.5,"blood_glucose_level":180}'
```

### 2. Cloud Run health check
```bash
curl https://medvise-ml-xxxx-uc.a.run.app/predict/diabetes \
  -H "Content-Type: application/json" \
  -d '{"gender":"Female","age":34,"hypertension":0,"heart_disease":0,"smoking_history":"never","bmi":31.5,"HbA1c_level":6.5,"blood_glucose_level":180}'
```

### 3. End-to-end (via Expo app)
Send a diabetes-triggering message (e.g., "Female, 34, glucose 180, BMI 31.5") and confirm Gemini calls the tool and returns a prediction-informed response.
