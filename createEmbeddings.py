from sentence_transformers import SentenceTransformer
from tqdm import tqdm
import json

# Config
INPUT_FILE = "prepared.json"
OUTPUT_FILE = "topic_embeddings.jsonl"
MODEL_NAME = "intfloat/multilingual-e5-large"
BATCH_SIZE = 32

# Load prepared data
with open(INPUT_FILE, "r", encoding="utf-8") as f:
    data = json.load(f)

# Get unique topics
topics = sorted(set([d["topic"] for d in data]))

print(f"🔹 Found {len(topics)} unique topics")

# Load model
print(f"🔹 Loading model: {MODEL_NAME}")
model = SentenceTransformer(MODEL_NAME)

# Encode in batches
with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
    for i in tqdm(range(0, len(topics), BATCH_SIZE), desc="Embedding Topics"):
        batch = topics[i:i+BATCH_SIZE]
        emb = model.encode(batch, normalize_embeddings=True)
        for j, topic in enumerate(batch):
            record = {
                "topic": topic,
                "embedding": emb[j].tolist()
            }
            f.write(json.dumps(record, ensure_ascii=False) + "\n")

print(f"✅ Created topic embeddings for {len(topics)} topics → {OUTPUT_FILE}")
