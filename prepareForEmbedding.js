// prepareForEmbedding.js
import fs from "fs";
import path from "path";

const dir = "./data";

// Read all JSON files from directory
const files = fs.readdirSync(dir);
const rawOutput = [];
const topicCount = new Map();

const isEnglishOrHebrew = (text) => /[a-zA-Z\u0590-\u05FF]/.test(text);

// First pass: collect all valid entries and count topics
for (const file of files) {
  if (!file.endsWith(".json")) continue;

  const fullPath = path.join(dir, file);
  const content = fs.readFileSync(fullPath, "utf8");
  let data;

  try {
    data = JSON.parse(content);
  } catch {
    continue; // Skip malformed JSON
  }

  const title = data.title?.trim();
  if (!title || !isEnglishOrHebrew(title)) continue;

  const category = data.categories?.[0]?.name;
  let subcategory = data.subcategories?.[0]?.name;
  if (!category) continue;

  if (category === "Corona Chizuk") {
    continue;
  }

  if (category === "Halacha/Jewish Law") {
    if (subcategory === "Chanukah") {
      subcategory = "Hilchot Chanukah";
    }
    if (subcategory === "Pesach/Passover") {
      subcategory = "Hilchot Pesach";
    }
    if (subcategory === "Purim") {
      subcategory = "Hilchot Purim";
    }
  }

  const topic = subcategory ? `${category}|${subcategory}` : category;

  rawOutput.push({ title, topic });

  topicCount.set(topic, (topicCount.get(topic) || 0) + 1);
}

// Second pass: filter out topics appearing less than 10 times
const filteredOutput = rawOutput.filter(
  ({ topic }) => topicCount.get(topic) >= 13
);

// Write to file
fs.writeFileSync(
  "prepared.json",
  JSON.stringify(filteredOutput, null, 2),
  "utf8"
);

console.log(`✅ Prepared ${filteredOutput.length} lectures`);
