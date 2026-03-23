const fs = require("fs");
const path = require("path");
const platform = require("./src/platform");

// Ensure data directories exist (cross-platform)
const dataDir = platform.dataDir;
for (const dir of ["chat_history", "screenshots", "documents", "downloads", "tasks", "backups", "browser_profile"]) {
  fs.mkdirSync(path.join(dataDir, dir), { recursive: true });
}

// Load config (validates env vars)
require("./src/config");

// Initialize mem0 memory system
const { initMem0 } = require("./src/memory/mem0");
initMem0().catch(() => {});

// Start the Telegram bot
const { startBot } = require("./src/telegram/bot");

console.log(`Starting Handlr AI on ${platform.osDescription}...`);
console.log(`Shell: ${platform.shell}`);
console.log(`Browser: ${platform.chromiumPath || "NOT FOUND"}`);
console.log(`Timezone: ${platform.timezone}`);

const bot = startBot();
console.log("Telegram bot started. Waiting for messages...");
console.log("Handlr is running.");

// Graceful shutdown
const shutdown = () => {
  console.log("Shutting down...");
  bot.stopPolling();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
if (!platform.isWindows) process.on("SIGHUP", shutdown);
