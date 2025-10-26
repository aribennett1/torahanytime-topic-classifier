# TorahAnytime Topic Classification Project

This project scrapes TorahAnytime lecture metadata, processes it for machine learning, and creates embeddings for topic classification. The workflow involves multiple steps from data collection to Google Apps Script implementation.

## Project Overview

The goal is to classify Torah lecture topics using semantic embeddings generated from lecture titles and their associated categories/subcategories. The final output is a Google Apps Script that can classify topics using vector similarity search.

## Workflow

### 1. Data Scraping (`scraper.js`)

- **Purpose**: Scrapes TorahAnytime lecture metadata from their API
- **Range**: Lectures with IDs from 1 to 402,000
- **Output**: Individual JSON files in `data/` folder (one per lecture)
- **Features**:
  - Skips already-downloaded files
  - Includes rate limiting (400-800ms delay between requests)
  - Error handling for failed requests
  - Progress logging

```bash
node scraper.js
```

**Creates**: `data/` folder with ~393,000 JSON files

### 2. Data Preparation (`prepareForEmbedding.js`)

- **Purpose**: Processes raw lecture data into title-topic pairs
- **Input**: JSON files from `data/` folder
- **Processing**:
  - Filters for English/Hebrew content only
  - Combines category and subcategory into topic format: `Category|Subcategory`
  - Excludes "Corona Chizuk" category
  - Normalizes some Halacha subcategories (e.g., "Chanukah" → "Hilchot Chanukah")
  - Filters out topics with fewer than 13 occurrences
- **Output**: `prepared.json` with structured data

```bash
node prepareForEmbedding.js
```

**Creates**: `prepared.json` with ~1.5M processed lecture entries

### 3. Embedding Generation (`createEmbeddings.py`)

- **Purpose**: Creates semantic embeddings for unique topics
- **Model**: `intfloat/multilingual-e5-large` (supports Hebrew and English)
- **Processing**:
  - Extracts unique topics from prepared data
  - Generates normalized embeddings in batches of 32
  - Saves as JSONL format for efficient streaming
- **Output**: `topic_embeddings.jsonl`

```bash
python3 createEmbeddings.py
```

**Creates**: `topic_embeddings.jsonl` with 295 unique topic embeddings

### 4. Topic Name Extraction (`extract_topic_names.js`)

- **Purpose**: Extracts topic names from embeddings file for testing
- **Usage**: Designed to pipe output to clipboard for Google Apps Script
- **Output**: Formatted topic names as JavaScript array

```bash
node extract_topic_names.js | pbcopy
```

**Used for**: Copying topic names into `classifyTopic.gs` for testing

### 5. Category Structure Parsing (`topics_parser.js`)

- **Purpose**: Parses TorahAnytime's category structure from their topics.json
- **Input**: `topics.json` (copied from torahanytime.com)
- **Processing**:
  - Recursively extracts categories and subcategories
  - Maintains category-subcategory relationships with IDs
  - Handles nested category structures
- **Output**: Formatted JSON with category mappings

```bash
node topics_parser.js | pbcopy
```

**Used for**: Copying category structure into Google Apps Script

### 6. Google Apps Script Implementation (`classifyTopic.gs`)

- **Purpose**: Topic classification using vector similarity
- **Input**:
  - `topic_embeddings.jsonl` (uploaded to Google Drive)
  - Topic names from step 4
  - Category structure from step 5
- **Functionality**:
  - Loads embeddings from Google Drive
  - Performs cosine similarity search
  - Returns best matching topics for input text

## File Structure

```
TAT Scraper/
├── scraper.js                 # Step 1: Data scraping
├── prepareForEmbedding.js     # Step 2: Data preparation
├── createEmbeddings.py        # Step 3: Embedding generation
├── extract_topic_names.js     # Step 4: Topic extraction
├── topics_parser.js           # Step 5: Category parsing
├── classifyTopic.gs          # Step 6: Google Apps Script
├── data/                     # Raw scraped data (~390,000K files)
├── prepared.json             # Processed lecture data
├── topic_embeddings.jsonl    # Topic embeddings
├── topics.json              # TorahAnytime category structure
└── README.md                # This file
```

## Generated Data

- **`data/`**: 392,894 JSON files with individual lecture metadata
- **`prepared.json`**: 1.56M processed lecture entries with title-topic pairs
- **`topic_embeddings.jsonl`**: 295 unique topic embeddings with 1024-dimensional vectors
- **`classifyTopic.gs`**: 4,506 lines of Google Apps Script code

## Key Features

1. **Multilingual Support**: Uses multilingual embeddings for Hebrew and English content
2. **Data Quality**: Filters for meaningful content and sufficient sample sizes
3. **Scalable Processing**: Handles large datasets efficiently with streaming and batching
4. **Production Ready**: Includes error handling, rate limiting, and progress tracking
5. **Cloud Integration**: Designed for Google Apps Script deployment

## Dependencies

### Node.js Scripts

- Node.js with ES modules support
- Built-in modules: `fs`, `path`, `readline`

### Python Script

- `sentence-transformers`
- `tqdm`
- `json`

```bash
pip3 install sentence-transformers tqdm
```

## Usage Notes

- The scraper can be resumed if interrupted (skips existing files)
- Embedding generation requires significant compute resources (~1GB VRAM)
- Google Apps Script has file size limits; embeddings are loaded from Google Drive
- Topic classification uses cosine similarity for semantic matching

## Data Statistics

- **Total Lectures Scraped**: ~80,000
- **Processed Lectures**: ~1.56M entries
- **Unique Topics**: 295
- **Embedding Dimensions**: 1024
- **Model Size**: ~2.5GB (multilingual-e5-large)

This project demonstrates a complete pipeline from data collection to production deployment for semantic topic classification in Jewish learning content.
