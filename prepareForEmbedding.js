// prepareForEmbedding.js
import fs from "fs";
import path from "path";

const dir = "./data";

// -------------------------------------
// HELPERS
// -------------------------------------

const isEnglishOrHebrew = (text) => /[A-Za-z\u0590-\u05FF]{3,}/.test(text);

const clean = (str) =>
  str
    ?.replace(/\s+/g, " ")
    .replace(/[^\w\u0590-\u05FF|/'" -]/g, "")
    .trim() || "";

// -------------------------------------
// CATEGORY COLLAPSE MAP
// -------------------------------------
// These must match exactly the *cleaned* category names

const COLLAPSE_MAP = {
  Happiness: "Jewish Understanding",
  Chessed: "Middot/Character Development",
  "Honoring Parents": "Middot/Character Development",
  Appreciation: "Middot/Character Development",

  Afterlife: "Jewish Philosophy",
  Mashiach: "Jewish Philosophy",

  Kiruv: "Jewish Understanding",
  Science: "Jewish Understanding",
  Business: "Jewish Understanding",

  "Tzniut/Modesty": "Halacha/Jewish Law",
  "Kashrus/Kosher": "Halacha/Jewish Law",
  Health: "Halacha/Jewish Law",
  "Eretz Yisrael": "Jewish History",
  Megillot: "Ketuvim/Writings",
  "Tehillim/Psalms": "Tefillah/Prayer",
  "Lashon Hara": "Middot/Character Development",
  "Must See": "Jewish Understanding",
  "Exclusive Tisha B'av Burst of Inspiration": "Holidays",
  Video: "Jewish Understanding",
};

// Normalize a topic using the mapping
function collapseCategory(name) {
  return COLLAPSE_MAP[name] || name;
}

// -------------------------------------
// 1) LOAD RAW FILES
// -------------------------------------

const rawOutput = [];
const topicCount = new Map();

const files = fs.readdirSync(dir);

for (const file of files) {
  if (!file.endsWith(".json")) continue;

  const fullPath = path.join(dir, file);
  let data;

  try {
    data = JSON.parse(fs.readFileSync(fullPath, "utf8"));
  } catch {
    continue;
  }

  const title = clean(data.title?.trim());
  if (!title || !isEnglishOrHebrew(title)) continue;

  let category = clean(data.categories?.[0]?.name);
  let subcategory = clean(data.subcategories?.[0]?.name);

  if (!category) continue;

  // Skip unwanted categories
  if (["Corona Chizuk", "Fundraising"].includes(category)) continue;

  // Normalize Halacha subtopics
  if (category === "Halacha/Jewish Law") {
    if (subcategory === "Chanukah") subcategory = "Hilchot Chanukah";
    if (subcategory === "Pesach/Passover") subcategory = "Hilchot Pesach";
    if (subcategory === "Purim") subcategory = "Hilchot Purim";
  }

  // Collapse category using mapping table
  category = collapseCategory(category);

  // For now, we use ONLY the collapsed category, not subcategories
  const topic = category;

  rawOutput.push({ title, topic });

  topicCount.set(topic, (topicCount.get(topic) || 0) + 1);
}

// -------------------------------------
// 2) COLLAPSE RARE SUBTOPICS (we removed subtopics → skip logic)
// -------------------------------------

const MIN_COUNT = 25;

const collapsed = rawOutput.map(({ title, topic }) => {
  const count = topicCount.get(topic);
  return count >= MIN_COUNT ? { title, topic } : { title, topic };
});

// -------------------------------------
// 3) RECOUNT AFTER COLLAPSING
// -------------------------------------

const newCount = new Map();
for (const item of collapsed) {
  newCount.set(item.topic, (newCount.get(item.topic) || 0) + 1);
}

// -------------------------------------
// 4) FILTER OUT TOPICS BELOW MINIMUM
// -------------------------------------

const REALLY_MIN = 150;

const cleaned = collapsed.filter(
  (item) => newCount.get(item.topic) >= REALLY_MIN
);

// -------------------------------------
// 5) FINAL TOPIC STATS
// -------------------------------------

const finalCount = new Map();
for (const item of cleaned) {
  finalCount.set(item.topic, (finalCount.get(item.topic) || 0) + 1);
}

const sortedTopics = [...finalCount.entries()].sort((a, b) => b[1] - a[1]);

console.log(`📊 Final topic count: ${sortedTopics.length}`);

console.log("\n===== TOPIC FREQUENCY REPORT =====");
sortedTopics.forEach(([topic, count]) =>
  console.log(count.toString().padStart(6, " ") + "  " + topic)
);

// Write stats file
const report = sortedTopics
  .map(([topic, count]) => `${count}\t${topic}`)
  .join("\n");
fs.writeFileSync("topic_stats.txt", report, "utf8");

// Write cleaned training data
fs.writeFileSync("prepared.json", JSON.stringify(cleaned, null, 2), "utf8");

console.log("\n📄 Saved topic frequency report → topic_stats.txt");
console.log("📄 Saved cleaned dataset → prepared.json");
