#source venv/bin/activate && python3 createTitleEmbeddings.py
from sentence_transformers import SentenceTransformer
from tqdm import tqdm
import json
import os

# -----------------------------
# Config
# -----------------------------
INPUT_FILE = "prepared.json"          # Input with all titles + topics
OUTPUT_FILE = "title_embeddings.jsonl"  # Output file
MODEL_NAME = "intfloat/multilingual-e5-large"
BATCH_SIZE = 128                      # Adjust for RAM if needed
RESUME = False                        # Allow resumable runs
# -----------------------------

# -----------------------------
# Load prepared data
# -----------------------------
with open(INPUT_FILE, "r", encoding="utf-8") as f:
    data = json.load(f)

titles = [item["title"] for item in data]
topics = [item["topic"] for item in data]

print(f"🔹 Loaded {len(titles)} titles")

# -----------------------------
# Load embedding model
# -----------------------------
print(f"🔹 Loading model: {MODEL_NAME}")
model = SentenceTransformer(MODEL_NAME)

# -----------------------------
# Resume support
# -----------------------------
start_index = 0
if RESUME and os.path.exists(OUTPUT_FILE):
    with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
        start_index = sum(1 for _ in f)
    print(f"⏩ Resuming from index {start_index}")

# -----------------------------
# Create embeddings in batches
# -----------------------------
with open(OUTPUT_FILE, "a", encoding="utf-8") as f_out:
    for i in tqdm(range(start_index, len(titles), BATCH_SIZE), desc="Embedding"):
        batch_titles = titles[i : i + BATCH_SIZE]
        batch_topics = topics[i : i + BATCH_SIZE]

        # Get embeddings
        batch_embeddings = model.encode(batch_titles, normalize_embeddings=True)

        # Write JSONL lines
        for j, emb in enumerate(batch_embeddings):
            record = {
                "title": batch_titles[j],
                "topic": batch_topics[j],
                "embedding": emb.tolist()
            }
            f_out.write(json.dumps(record, ensure_ascii=False) + "\n")

print(f"✅ Finished embedding {len(titles)} titles → {OUTPUT_FILE}")