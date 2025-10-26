const fs = require("fs");
const readline = require("readline");

async function extractTopicNames() {
  const topics = [];

  // Create a readline interface to read the JSONL file line by line
  const fileStream = fs.createReadStream("topic_embeddings.jsonl");
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity, // Handle Windows line endings
  });

  // Process each line
  for await (const line of rl) {
    if (line.trim()) {
      try {
        const data = JSON.parse(line);
        if (data.topic) {
          topics.push(data.topic);
        }
      } catch (error) {
        console.error(`Error parsing line: ${line.substring(0, 100)}...`);
        console.error(`Error: ${error.message}`);
      }
    }
  }

  return topics;
}

// Main execution
async function main() {
  try {
    const topics = await extractTopicNames();

    // Print all topic names
    topics.forEach((topic, index) => {
      console.log(`"${topic}", `);
    });
  } catch (error) {
    console.error("Error:", error.message);
  }
}

// Run the script
main();
