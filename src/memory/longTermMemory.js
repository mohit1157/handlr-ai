const fs = require("fs");
const path = require("path");
const config = require("../config");

const MEMORY_FILE = path.join(config.DATA_DIR, "memories.json");

function loadMemories() {
  try {
    return JSON.parse(fs.readFileSync(MEMORY_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveMemories(memories) {
  fs.mkdirSync(config.DATA_DIR, { recursive: true });
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(memories, null, 2));
}

function saveMemory(key, value) {
  const memories = loadMemories();
  memories[key] = { value, savedAt: new Date().toISOString() };
  saveMemories(memories);
  return { saved: true, key, totalMemories: Object.keys(memories).length };
}

function recallMemory(key) {
  const memories = loadMemories();
  if (key === "all") {
    const entries = Object.entries(memories).map(([k, v]) => `• ${k}: ${v.value}`);
    return { memories: entries.length ? entries.join("\n") : "No memories saved yet." };
  }
  const mem = memories[key];
  if (!mem) return { found: false, message: `No memory found for key: ${key}` };
  return { found: true, key, value: mem.value, savedAt: mem.savedAt };
}

module.exports = { saveMemory, recallMemory };
