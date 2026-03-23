const TelegramBot = require("node-telegram-bot-api");
const config = require("../config");
const { chat } = require("../ai/openai");
const { sendText } = require("./sender");
const { handleApprovalCallback, startSessionApproval, endSessionApproval, getSessionApproval } = require("../security/approval");
const history = require("../memory/chatHistory");
const { getSystemStatus } = require("../tools/status");

function startBot() {
  const bot = new TelegramBot(config.TELEGRAM_BOT_TOKEN, { polling: true });

  console.log("Telegram bot started. Waiting for messages...");

  // Owner-only filter
  function isOwner(msg) {
    return msg.chat.id === config.TELEGRAM_OWNER_ID;
  }

  // Handle inline keyboard callbacks (approval buttons)
  bot.on("callback_query", async (query) => {
    if (query.from.id !== config.TELEGRAM_OWNER_ID) return;

    const handled = handleApprovalCallback(query);
    if (handled) {
      await bot.answerCallbackQuery(query.id, {
        text: query.data.startsWith("approve") ? "Approved" : "Denied",
      });
      // Edit the message to remove buttons
      try {
        await bot.editMessageReplyMarkup(
          { inline_keyboard: [] },
          { chat_id: query.message.chat.id, message_id: query.message.message_id }
        );
      } catch {}
    }
  });

  // Handle commands
  bot.onText(/^\/clear$/, async (msg) => {
    if (!isOwner(msg)) return;
    history.clear(msg.chat.id);
    await bot.sendMessage(msg.chat.id, "🗑 Conversation history cleared.");
  });

  bot.onText(/^\/status$/, async (msg) => {
    if (!isOwner(msg)) return;
    const status = await getSystemStatus();
    await bot.sendMessage(msg.chat.id, status);
  });

  // Approve session commands
  bot.onText(/^\/approve (.+)$/, async (msg, match) => {
    if (!isOwner(msg)) return;
    const arg = match[1].trim();

    if (arg === "off") {
      endSessionApproval(msg.chat.id);
      await bot.sendMessage(msg.chat.id, "🔒 Session approval disabled. Back to ask-every-time mode.");
      return;
    }

    if (arg === "status") {
      const session = getSessionApproval(msg.chat.id);
      if (!session) {
        await bot.sendMessage(msg.chat.id, "No active session approval.");
      } else {
        const remaining = Math.round((session.expiresAt - Date.now()) / 60000);
        await bot.sendMessage(msg.chat.id, `🔓 Session approval active (${session.mode}). ${remaining} min remaining.`);
      }
      return;
    }

    const parts = arg.split(" ");
    if (parts[0] === "session") {
      const mins = parseInt(parts[1]) || 30;
      startSessionApproval(msg.chat.id, "session", { minutes: mins });
      await bot.sendMessage(msg.chat.id, `🔓 Session approval ON for ${mins} minutes.\nBrowser clicks/typing auto-approved.\nShell writes & file writes still need approval.`);
      return;
    }

    if (parts[0] === "domain") {
      const domain = parts[1];
      if (!domain) {
        await bot.sendMessage(msg.chat.id, "Usage: /approve domain linkedin.com");
        return;
      }
      const mins = parseInt(parts[2]) || 30;
      startSessionApproval(msg.chat.id, "domain", { domain, minutes: mins });
      await bot.sendMessage(msg.chat.id, `🔓 Domain approval ON for ${domain} (${mins} min).\nBrowser actions auto-approved.`);
      return;
    }

    await bot.sendMessage(msg.chat.id, "Usage:\n/approve session 30\n/approve domain linkedin.com\n/approve off\n/approve status");
  });

  bot.onText(/^\/model(?:\s+(.+))?$/, async (msg, match) => {
    if (!isOwner(msg)) return;
    const { setModel, getModel, MODEL_MAP } = require("../ai/providers");
    const arg = match[1]?.trim();
    if (!arg) {
      const current = getModel();
      const available = Object.entries(MODEL_MAP).map(([k, v]) => `  ${k} → ${v}`).join("\n");
      await bot.sendMessage(msg.chat.id, `Current model: ${current}\n\nAvailable:\n${available}`);
      return;
    }
    const result = setModel(arg);
    await bot.sendMessage(msg.chat.id, `🔄 Switched to: ${result.model}`);
  });

  bot.onText(/^\/help$/, async (msg) => {
    if (!isOwner(msg)) return;
    await bot.sendMessage(msg.chat.id, [
      "*Jarvis Commands*",
      "",
      "/clear — Clear conversation history",
      "/status — System status (CPU, RAM, disk, temp)",
      "/approve session 30 — Auto-approve browser actions for 30 min",
      "/approve domain site.com — Auto-approve for specific domain",
      "/approve off — Disable session approval",
      "/approve status — Check current approval mode",
      "/help — Show this message",
      "",
      "Just chat normally. Jarvis will autonomously run commands, browse the web, manage files, create documents, and handle emails.",
      "",
      "Read-only actions execute automatically.",
      "System-modifying actions ask for your approval first.",
      "Use /approve session for long multi-step workflows.",
    ].join("\n"), { parse_mode: "Markdown" });
  });

  bot.onText(/^\/start$/, async (msg) => {
    // Always respond to /start so user can see their chat ID
    console.log(`/start from chat ID: ${msg.chat.id}`);
    if (!isOwner(msg)) {
      await bot.sendMessage(msg.chat.id, [
        `Your chat ID: \`${msg.chat.id}\``,
        "",
        "Set this as TELEGRAM_OWNER_ID in .env to activate Jarvis.",
      ].join("\n"), { parse_mode: "Markdown" });
      return;
    }
    await bot.sendMessage(msg.chat.id, [
      "👋 Jarvis is online and ready.",
      "",
      `Your chat ID: \`${msg.chat.id}\``,
      "",
      "I have full control over the Raspberry Pi:",
      "• Shell commands",
      "• Browser automation",
      "• File system access",
      "• System monitoring",
      "",
      "Just tell me what you need.",
    ].join("\n"), { parse_mode: "Markdown" });
  });

  // Handle all text messages (non-command)
  bot.on("message", async (msg) => {
    if (!isOwner(msg)) return;
    if (!msg.text) return;
    if (msg.text.startsWith("/")) return; // already handled by onText

    const chatId = msg.chat.id;

    try {
      // Send typing indicator
      await bot.sendChatAction(chatId, "typing");

      const result = await chat(chatId, msg.text, bot);

      if (result?.text) {
        await sendText(bot, chatId, result.text);
      }
    } catch (err) {
      console.error("Message handling error:", err);
      await bot.sendMessage(chatId, `❗ Error: ${err.message}`).catch(() => {});
    }
  });

  // Error handling
  bot.on("polling_error", (err) => {
    console.error("Telegram polling error:", err.message);
  });

  return bot;
}

module.exports = { startBot };
