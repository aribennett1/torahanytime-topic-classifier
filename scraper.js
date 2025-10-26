import fs from "fs";
import path from "path";

const DATA_DIR = "./data";
const START_ID = 1;
const END_ID = 402000; // you can increase later (e.g. 400000)

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

for (let id = START_ID; id <= END_ID; id++) {
  const filePath = path.join(DATA_DIR, `${id}.json`);

  // skip already-downloaded files
  if (fs.existsSync(filePath)) {
    continue;
  }

  const url = `https://api.torahanytime.com/lectures/${id}`;
  try {
    const res = await fetch(url, { timeout: 10000 });

    if (res.ok) {
      const json = await res.json();
      fs.writeFileSync(filePath, JSON.stringify(json, null, 2), "utf8");
      console.log(`✅ Saved lecture ${id}`);
    } else {
      console.log(`❌ Lecture ${id}: ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    console.log(`⚠️  Error fetching lecture ${id}: ${err.message}`);
  }

  // random delay between 400–800 ms
  await delay(400 + Math.random() * 400);
}

console.log("🎉 Scraping complete!");
