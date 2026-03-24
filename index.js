const fs = require("fs");
const path = require("path");
const platform = require("./src/platform");

// Ensure data directories exist (cross-platform)
const dataDir = platform.dataDir;
for (const dir of ["chat_history", "screenshots", "documents", "downloads", "tasks", "backups", "browser_profile"]) {
  fs.mkdirSync(path.join(dataDir, dir), { recursive: true });
}

// Load config (validates env vars)
const config = require("./src/config");

console.log(`Starting Handlr AI on ${platform.osDescription}...`);
console.log(`Shell: ${platform.shell}`);
console.log(`Browser: ${platform.chromiumPath || "NOT FOUND"}`);
console.log(`Timezone: ${platform.timezone}`);

// Start Telegram bot (if configured)
let bot = null;
if (config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_OWNER_ID) {
  const { startBot } = require("./src/telegram/bot");
  bot = startBot();
  console.log("Telegram bot started. Waiting for messages...");
}

// Start Supabase bridge (if configured)
let bridge = null;
if (config.SUPABASE_URL && config.LICENSE_KEY) {
  const { initBridge, startListening } = require("./src/supabase/bridge");
  initBridge();
  startListening();
  console.log("Supabase bridge started. Listening for web chat...");
}

console.log("Handlr is running.");

// Graceful shutdown
const shutdown = async () => {
  console.log("Shutting down...");
  if (bot) bot.stopPolling();
  if (config.SUPABASE_URL && config.LICENSE_KEY) {
    const { stopBridge } = require("./src/supabase/bridge");
    await stopBridge();
  }
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
if (!platform.isWindows) process.on("SIGHUP", shutdown);
