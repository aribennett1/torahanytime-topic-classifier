const fs = require("fs");
const path = require("path");

// Read the JSON file
const filePath = path.join(__dirname, "topics.json");
const rawData = fs.readFileSync(filePath);
const json = JSON.parse(rawData);

// Output array
const output = [];

// Function to extract topics from any array of topic objects
function extractFromArray(topics, parentCategory = null) {
  if (!Array.isArray(topics)) return;

  for (const topic of topics) {
    if (!topic || !topic.id || !topic.name) continue;

    const { id, name } = topic;

    // If this is a top-level category (no parentCategory), it's a main category
    if (!parentCategory) {
      // Add the main category entry
      output.push({
        categoryId: id,
        categoryName: name,
        subCategoryId: null,
        subCategoryName: null,
      });

      // Process subcategories if they exist
      if (Array.isArray(topic.subCategory) && topic.subCategory.length > 0) {
        extractFromArray(topic.subCategory, { id, name });
      }
    } else {
      // This is a subcategory
      output.push({
        categoryId: parentCategory.id,
        categoryName: parentCategory.name,
        subCategoryId: id,
        subCategoryName: name,
      });

      // Process nested subcategories if they exist (treating them as subcategories of the main category)
      if (Array.isArray(topic.subCategory) && topic.subCategory.length > 0) {
        extractFromArray(topic.subCategory, parentCategory);
      }
    }
  }
}

// Function to recursively search through any object for topic arrays
function findAllTopics(obj, parentCategory = null) {
  if (typeof obj !== "object" || obj === null) return;

  // If this object has id and name, it's a topic
  if (obj.id && obj.name) {
    if (!parentCategory) {
      // This is a main category
      output.push({
        categoryId: obj.id,
        categoryName: obj.name,
        subCategoryId: null,
        subCategoryName: null,
      });

      // Process subcategories if they exist
      if (Array.isArray(obj.subCategory) && obj.subCategory.length > 0) {
        extractFromArray(obj.subCategory, { id: obj.id, name: obj.name });
      }
    } else {
      // This is a subcategory
      output.push({
        categoryId: parentCategory.id,
        categoryName: parentCategory.name,
        subCategoryId: obj.id,
        subCategoryName: obj.name,
      });

      // Process nested subcategories
      if (Array.isArray(obj.subCategory) && obj.subCategory.length > 0) {
        extractFromArray(obj.subCategory, parentCategory);
      }
    }
  }

  // Recursively search through all properties
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      if (Array.isArray(obj[key])) {
        // If it's an array, check each item
        for (const item of obj[key]) {
          findAllTopics(item, parentCategory);
        }
      } else if (typeof obj[key] === "object") {
        // If it's an object, recurse into it
        findAllTopics(obj[key], parentCategory);
      }
    }
  }
}

// Start extraction from the entire JSON object
findAllTopics(json);

// Print result
console.log(JSON.stringify(output, null, 2));
