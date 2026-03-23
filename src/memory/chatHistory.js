const fs = require("fs");
const path = require("path");
const config = require("../config");

class ChatHistoryManager {
  constructor() {
    this.cache = new Map();
    fs.mkdirSync(config.HISTORY_DIR, { recursive: true });
  }

  _filePath(chatId) {
    return path.join(config.HISTORY_DIR, `${chatId}.json`);
  }

  getHistory(chatId) {
    if (this.cache.has(chatId)) return this.cache.get(chatId);
    try {
      const data = JSON.parse(fs.readFileSync(this._filePath(chatId), "utf8"));
      this.cache.set(chatId, data);
      return data;
    } catch {
      this.cache.set(chatId, []);
      return [];
    }
  }

  /**
   * Get a sanitized copy of history safe for OpenAI API.
   * Ensures tool messages always follow an assistant message with matching tool_calls.
   */
  getHistoryForAPI(chatId) {
    const history = this.getHistory(chatId);
    const clean = [];

    for (let i = 0; i < history.length; i++) {
      const msg = history[i];

      if (msg.role === "tool") {
        // Only include tool messages if previous message is assistant with tool_calls
        const prev = clean[clean.length - 1];
        if (prev && prev.role === "assistant" && prev.tool_calls?.length) {
          const hasMatchingCall = prev.tool_calls.some((tc) => tc.id === msg.tool_call_id);
          if (hasMatchingCall) {
            clean.push(msg);
            continue;
          }
        }
        // Skip orphaned tool messages
        continue;
      }

      if (msg.role === "assistant" && msg.tool_calls?.length) {
        // Check if the following messages contain ALL required tool results
        const requiredIds = new Set(msg.tool_calls.map((tc) => tc.id));
        const upcoming = history.slice(i + 1, i + 1 + requiredIds.size);
        const foundIds = new Set(upcoming.filter((m) => m.role === "tool").map((m) => m.tool_call_id));
        const allFound = [...requiredIds].every((id) => foundIds.has(id));

        if (allFound) {
          clean.push(msg);
          continue;
        }
        // Skip assistant messages with tool_calls if results are missing
        // Convert to plain text instead
        if (msg.content) {
          clean.push({ role: "assistant", content: msg.content });
        }
        continue;
      }

      clean.push(msg);
    }

    return clean;
  }

  addMessage(chatId, message) {
    const history = this.getHistory(chatId);
    history.push(message);

    // Trim if over limit — remove oldest user+assistant pairs
    while (history.length > config.MAX_HISTORY) {
      // Find first user message (skip tool chains at the start)
      let removeEnd = 1;
      if (history[0]?.role === "user") {
        removeEnd = 1;
        // Also remove the assistant response if it follows
        if (history[1]?.role === "assistant") {
          removeEnd = 2;
          // If assistant had tool_calls, remove those tool results too
          if (history[1]?.tool_calls?.length) {
            while (removeEnd < history.length && history[removeEnd]?.role === "tool") {
              removeEnd++;
            }
          }
        }
      }
      history.splice(0, removeEnd);
    }

    this._persist(chatId, history);
  }

  clear(chatId) {
    this.cache.set(chatId, []);
    try { fs.unlinkSync(this._filePath(chatId)); } catch {}
  }

  _persist(chatId, history) {
    try {
      fs.writeFileSync(this._filePath(chatId), JSON.stringify(history));
    } catch (err) {
      console.error("Failed to persist history:", err.message);
    }
  }
}

module.exports = new ChatHistoryManager();
