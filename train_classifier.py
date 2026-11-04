import json
import numpy as np
from tqdm import tqdm
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, accuracy_score
import joblib

# ---------------------------------------------------------
# Config
# ---------------------------------------------------------
INPUT_FILE = "title_embeddings.jsonl"   # From your embedding script
CLASSIFIER_OUT = "classifier.joblib"
LABEL_OUT = "label_encoder.joblib"
TEST_SIZE = 0.1   # 10% test split
MAX_ITER = 3000   # For Logistic Regression
# ---------------------------------------------------------


# ---------------------------------------------------------
# Load dataset
# ---------------------------------------------------------
print("🔹 Loading embeddings...")

titles = []
topics = []
embeddings = []

with open(INPUT_FILE, "r", encoding="utf-8") as f:
    for line in tqdm(f, desc="Reading JSONL"):
        rec = json.loads(line)
        titles.append(rec["title"])
        topics.append(rec["topic"])
        embeddings.append(rec["embedding"])

X = np.array(embeddings, dtype=np.float32)
y_text = np.array(topics)

print(f"🔹 Loaded {len(X)} samples, embedding dimension = {X.shape[1]}")


# ---------------------------------------------------------
# Encode string labels → integers
# ---------------------------------------------------------
print("🔹 Encoding labels...")

label_encoder = LabelEncoder()
y = label_encoder.fit_transform(y_text)

print(f"🔹 Found {len(label_encoder.classes_)} unique topics")


# ---------------------------------------------------------
# Train/test split
# ---------------------------------------------------------
print("🔹 Splitting train/test...")
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=TEST_SIZE, random_state=42, stratify=y
)


# ---------------------------------------------------------
# Train classifier (Logistic Regression)
# ---------------------------------------------------------
print("🔹 Training Logistic Regression classifier...")
clf = LogisticRegression(
    max_iter=MAX_ITER,
    n_jobs=-1,          # use all CPU cores
    verbose=1,
)

clf.fit(X_train, y_train)

print("🔹 Training complete!")


# ---------------------------------------------------------
# Evaluate model
# ---------------------------------------------------------
print("🔹 Evaluating model...")

y_pred = clf.predict(X_test)
acc = accuracy_score(y_test, y_pred)

print(f"\n🔥 Accuracy: {acc:.4f}")
print("\n📊 Classification report:")
print(classification_report(y_test, y_pred, target_names=label_encoder.classes_))


# ---------------------------------------------------------
# Save classifier + label encoder
# ---------------------------------------------------------
print("🔹 Saving classifier and label encoder...")
joblib.dump(clf, CLASSIFIER_OUT)
joblib.dump(label_encoder, LABEL_OUT)

print(f"✅ Saved classifier to: {CLASSIFIER_OUT}")
print(f"✅ Saved label encoder to: {LABEL_OUT}")