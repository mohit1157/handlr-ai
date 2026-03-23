const config = require("../config");
const longTermMemory = require("./longTermMemory");

let memoryClient = null;
let mem0Available = false;

async function initMem0() {
  if (!config.MEM0_ENABLED) return false;

  try {
    if (config.MEM0_API_KEY) {
      // Cloud mode
      const MemoryClient = require("mem0ai").default;
      memoryClient = new MemoryClient(config.MEM0_API_KEY);
      mem0Available = true;
    } else {
      // Self-hosted / OSS mode
      const { Memory } = require("mem0ai/oss");
      memoryClient = new Memory();
      mem0Available = true;
    }
    console.log("mem0 memory system initialized.");
    return true;
  } catch (err) {
    console.warn("mem0 not available, falling back to file-based memory:", err.message);
    mem0Available = false;
    return false;
  }
}

/**
 * Add memories from a conversation turn.
 * Call after each completed AI response (fire-and-forget).
 */
async function addMemory(chatId, messages) {
  if (!mem0Available || !memoryClient) {
    // Fallback: extract key-value from the last assistant message
    return;
  }

  try {
    const formatted = messages.map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    })).filter((m) => m.content && m.role !== "tool");

    if (formatted.length === 0) return;

    await memoryClient.add(formatted, { user_id: String(chatId) });
  } catch (err) {
    console.warn("mem0 addMemory failed:", err.message);
  }
}

/**
 * Search for relevant memories before an AI call.
 * Returns a formatted string to inject into the system prompt.
 */
async function searchMemory(chatId, query) {
  if (!mem0Available || !memoryClient) {
    // Fallback: return all saved memories from file store
    const all = longTermMemory.getAllMemories();
    if (!all || Object.keys(all).length === 0) return "";
    const items = Object.entries(all).map(([k, v]) => `- ${k}: ${v.value}`);
    return items.length ? `\nRELEVANT MEMORIES:\n${items.join("\n")}` : "";
  }

  try {
    const results = await memoryClient.search(query, { user_id: String(chatId), limit: 10 });
    if (!results?.length) return "";

    const items = results.map((r) => `- ${r.memory || r.text || JSON.stringify(r)}`);
    return `\nRELEVANT MEMORIES:\n${items.join("\n")}`;
  } catch (err) {
    console.warn("mem0 searchMemory failed:", err.message);
    return "";
  }
}

/**
 * Get all memories for a user.
 */
async function getAllMemories(chatId) {
  if (!mem0Available || !memoryClient) {
    return longTermMemory.getAllMemories();
  }

  try {
    const results = await memoryClient.getAll({ user_id: String(chatId) });
    return results;
  } catch (err) {
    console.warn("mem0 getAllMemories failed:", err.message);
    return longTermMemory.getAllMemories();
  }
}

/**
 * Delete a specific memory.
 */
async function deleteMemory(memoryId) {
  if (!mem0Available || !memoryClient) {
    return { error: "mem0 not available" };
  }

  try {
    await memoryClient.delete(memoryId);
    return { success: true };
  } catch (err) {
    return { error: err.message };
  }
}

module.exports = { initMem0, addMemory, searchMemory, getAllMemories, deleteMemory };
