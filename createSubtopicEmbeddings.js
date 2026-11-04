import fs from "fs";
import path from "path";

const RAW_DIR = "./data"; // raw lecture JSONs
const PARENT_TOPICS_FILE = "topic_stats.txt"; // filtered parent topics
const OUT_DIR = "./subtopics"; // per-parent subtopic datasets

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR);

// ---------------------------------------------
// Load parent topics
// ---------------------------------------------
const parentTopics = fs
  .readFileSync(PARENT_TOPICS_FILE, "utf8")
  .split("\n")
  .map((line) => line.split(/\s+/).slice(1).join(" ").trim())
  .filter(Boolean);

console.log(`Loaded ${parentTopics.length} parent topics.`);

const buckets = {};
for (const p of parentTopics) buckets[p] = [];

// ---------------------------------------------
// Helpers
// ---------------------------------------------
const clean = (str) =>
  str
    ?.replace(/\s+/g, " ")
    .replace(/[^\w\u0590-\u05FF/'" -]/g, "")
    .trim() || "";

const isEnglishOrHebrew = (text) => /[A-Za-z\u0590-\u05FF]{3,}/.test(text);

// ---------------------------------------------
// Process RAW lecture files
// ---------------------------------------------
let subtopicCount = 0;
let skippedParentOnly = 0;

for (const file of fs.readdirSync(RAW_DIR)) {
  if (!file.endsWith(".json")) continue;

  const fullPath = path.join(RAW_DIR, file);
  let data;

  try {
    data = JSON.parse(fs.readFileSync(fullPath, "utf8"));
  } catch {
    continue;
  }

  const title = clean(data.title);
  if (!title || !isEnglishOrHebrew(title)) continue;

  let category = clean(data.categories?.[0]?.name);
  let subcategory = clean(data.subcategories?.[0]?.name);

  if (!category) continue;

  if (!parentTopics.includes(category)) continue;

  // Ignore items with no subtopic
  if (!subcategory) {
    skippedParentOnly++;
    continue;
  }

  // Normalize Halacha subtopics
  if (category === "Halacha/Jewish Law") {
    if (subcategory === "Chanukah") subcategory = "Hilchot Chanukah";
    if (subcategory === "Pesach/Passover") subcategory = "Hilchot Pesach";
    if (subcategory === "Purim") subcategory = "Hilchot Purim";
  }

  // Final subtopic label (NO parent prefix)
  const topicLabel = subcategory;

  buckets[category].push({ title, topic: topicLabel });
  subtopicCount++;
}

console.log(`\nFound ${subtopicCount} subtopic records.`);
console.log(`Skipped ${skippedParentOnly} parent-only items.`);

// ---------------------------------------------
// Write per-parent output
// ---------------------------------------------
for (const parent of parentTopics) {
  const rows = buckets[parent];
  if (rows.length < 20 || parent === "Dating and Marriage") continue;
  const filename = parent.replace(/[^\w]+/g, "-") + ".json";
  const outPath = path.join(OUT_DIR, filename);

  fs.writeFileSync(outPath, JSON.stringify(rows, null, 2), "utf8");

  console.log(`Saved ${rows.length} subtopic rows → ${outPath}`);
}

console.log("\n✅ ALL SUBTOPIC DATASETS CREATED");
