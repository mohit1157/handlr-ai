require("dotenv").config();
const path = require("path");

const DATA_DIR = path.resolve(process.env.DATA_DIR || "./data");

const config = {
  // Telegram
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_OWNER_ID: Number(process.env.TELEGRAM_OWNER_ID),

  // AI Providers
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || null,
  GOOGLE_AI_KEY: process.env.GOOGLE_AI_KEY || null,
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || null,
  GROQ_API_KEY: process.env.GROQ_API_KEY || null,
  MODEL: process.env.MODEL || "gpt-4o-mini",

  // Limits
  MAX_HISTORY: 50,
  MAX_TOOL_ROUNDS: 30,
  SHELL_TIMEOUT: 60000,
  SHELL_MAX_OUTPUT: 8000,
  TOOL_RESULT_MAX_LENGTH: 8000,
  BROWSER_IDLE_TIMEOUT: 15 * 60 * 1000,
  APPROVAL_TIMEOUT: 120000,
  PROGRESS_INTERVAL: 10,

  // Paths (all absolute)
  DATA_DIR,
  SCREENSHOTS_DIR: path.join(DATA_DIR, "screenshots"),
  HISTORY_DIR: path.join(DATA_DIR, "chat_history"),
  DOWNLOADS_DIR: path.join(DATA_DIR, "downloads"),

  // Optional - Platform
  CHROMIUM_PATH: process.env.CHROMIUM_PATH || null,
  SHELL_PATH: process.env.SHELL_PATH || null,
  TIMEZONE: process.env.TIMEZONE || null,

  // Optional - Memory (mem0)
  MEM0_ENABLED: process.env.MEM0_ENABLED !== "false",
  MEM0_URL: process.env.MEM0_URL || "http://localhost:8080",
  MEM0_API_KEY: process.env.MEM0_API_KEY || null,

  // Optional - Browser
  PROXY_URL: process.env.PROXY_URL || null,
  PROXY_AUTH: process.env.PROXY_AUTH || null,

  // Optional - Supabase Bridge (for SaaS chat interface)
  SUPABASE_URL: process.env.SUPABASE_URL || null,
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY || null,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || null,
  LICENSE_KEY: process.env.LICENSE_KEY || null,

  // Optional - Services
  VAULT_KEY: process.env.VAULT_KEY || null,
  GOOGLE_CALENDAR_ID: process.env.GOOGLE_CALENDAR_ID || "primary",
};

// Validate required config — Telegram OR Supabase bridge must be configured
const hasTelegram = config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_OWNER_ID;
const hasSupabase = config.SUPABASE_URL && config.LICENSE_KEY;
if (!hasTelegram && !hasSupabase) {
  console.error("Missing config: set either TELEGRAM_BOT_TOKEN+TELEGRAM_OWNER_ID or SUPABASE_URL+LICENSE_KEY");
  process.exit(1);
}
if (!config.OPENAI_API_KEY) {
  console.error("Missing required env var: OPENAI_API_KEY");
  process.exit(1);
}
const required = ["OPENAI_API_KEY"];
for (const key of required) {
  if (!config[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

module.exports = config;
