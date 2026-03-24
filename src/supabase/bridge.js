const { createClient } = require("@supabase/supabase-js");
const config = require("../config");
const { chat } = require("../ai/openai");
const chatHistory = require("../memory/chatHistory");

let supabase = null;
let isConnected = false;

function initBridge() {
  if (!config.SUPABASE_URL || !config.LICENSE_KEY) {
    console.log("Supabase bridge: not configured, skipping.");
    return null;
  }

  const key = config.SUPABASE_SERVICE_KEY || config.SUPABASE_ANON_KEY;
  if (!key) {
    console.log("Supabase bridge: no key found, skipping.");
    return null;
  }

  supabase = createClient(config.SUPABASE_URL, key);
  console.log("Supabase bridge: initialized.");
  return supabase;
}

async function updateBotStatus(online) {
  if (!supabase) return;
  try {
    const platform = require("../platform");
    const pkg = require("../../package.json");

    await supabase.from("bot_status").upsert({
      license_key: config.LICENSE_KEY,
      is_online: online,
      last_seen: new Date().toISOString(),
      platform: platform.osDescription,
      version: pkg.version || "6.4.0",
    }, { onConflict: "license_key" });

    console.log(`Supabase bridge: bot status → ${online ? "ONLINE" : "OFFLINE"}`);
  } catch (err) {
    console.error("Supabase bridge: failed to update status:", err.message);
  }
}

async function sendMessage(role, content, metadata = {}) {
  if (!supabase) return;
  try {
    await supabase.from("messages").insert({
      license_key: config.LICENSE_KEY,
      role,
      content,
      metadata,
    });
  } catch (err) {
    console.error("Supabase bridge: failed to send message:", err.message);
  }
}

async function handleUserMessage(msg) {
  const userId = config.LICENSE_KEY;
  const text = msg.content;

  console.log(`[Web] ${text}`);

  try {
    // Send "thinking" indicator
    await sendMessage("system", "Thinking...", { type: "typing" });

    // Get AI response using the same chat function as Telegram
    const reply = await chat(userId, text);

    if (reply) {
      // reply can be a string or an object { text, screenshots }
      const replyText = typeof reply === "string" ? reply : (reply.text || JSON.stringify(reply));
      const screenshots = (typeof reply === "object" && reply.screenshots) ? reply.screenshots : [];

      await sendMessage("assistant", replyText, { screenshots });
      console.log(`[Web] Reply: ${replyText.substring(0, 100)}...`);
    }
  } catch (err) {
    console.error("Supabase bridge: message handling error:", err.message);
    await sendMessage("assistant", `Error: ${err.message}`);
  }
}

async function startListening() {
  if (!supabase) return;

  // Mark bot as online
  await updateBotStatus(true);

  // Subscribe to new user messages
  const channel = supabase
    .channel("messages-listener")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `license_key=eq.${config.LICENSE_KEY}`,
      },
      async (payload) => {
        const msg = payload.new;
        // Only process user messages (not our own replies)
        if (msg.role === "user") {
          await handleUserMessage(msg);
        }
      }
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        isConnected = true;
        console.log("Supabase bridge: listening for messages.");
      } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
        isConnected = false;
        console.log(`Supabase bridge: channel ${status}. Reconnecting in 5s...`);
        setTimeout(() => startListening(), 5000);
      }
    });

  // Heartbeat — update last_seen every 60s
  setInterval(() => {
    if (isConnected) {
      updateBotStatus(true);
    }
  }, 60000);

  return channel;
}

async function stopBridge() {
  await updateBotStatus(false);
  if (supabase) {
    supabase.removeAllChannels();
  }
}

module.exports = { initBridge, startListening, stopBridge, sendMessage };
