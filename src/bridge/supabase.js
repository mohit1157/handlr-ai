/**
 * Supabase Realtime Bridge
 * Connects the bot engine to handlr.online/chat via Supabase
 * Replaces Telegram as the communication channel for SaaS users
 */
const { createClient } = require("@supabase/supabase-js");
const config = require("../config");
const platform = require("../platform");

let supabase = null;
let licenseKey = null;
let messageHandler = null;
let approvalHandlers = new Map(); // approvalId -> resolve function

function init(license) {
  if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_KEY) {
    console.warn("Supabase not configured — bridge disabled");
    return false;
  }

  licenseKey = license;
  supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY);

  // Mark bot as online
  updateBotStatus(true);

  // Listen for new user messages
  supabase
    .channel("user_messages")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `license_key=eq.${licenseKey}`,
      },
      async (payload) => {
        const msg = payload.new;
        // Only process user messages (not our own responses)
        if (msg.role === "user" && messageHandler) {
          try {
            await messageHandler(msg.content, msg.id);
          } catch (err) {
            console.error("Message handler error:", err.message);
            await sendMessage("assistant", `Error: ${err.message}`);
          }
        }
      }
    )
    .subscribe();

  // Listen for approval responses
  supabase
    .channel("approval_responses")
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "approvals",
        filter: `license_key=eq.${licenseKey}`,
      },
      (payload) => {
        const approval = payload.new;
        if (approval.status !== "pending") {
          const handler = approvalHandlers.get(approval.id);
          if (handler) {
            handler(approval.status === "approved");
            approvalHandlers.delete(approval.id);
          }
        }
      }
    )
    .subscribe();

  // Heartbeat every 30s
  setInterval(() => updateBotStatus(true), 30000);

  console.log("Supabase bridge initialized.");
  return true;
}

// Set the function that handles incoming messages
function onMessage(handler) {
  messageHandler = handler;
}

// Send a message from the bot
async function sendMessage(role, content, metadata = {}) {
  if (!supabase || !licenseKey) return;

  await supabase.from("messages").insert({
    license_key: licenseKey,
    role,
    content,
    metadata,
  });
}

// Send a screenshot
async function sendScreenshot(screenshotPath, caption) {
  if (!supabase || !licenseKey) return;

  // Upload to Supabase Storage
  const fs = require("fs");
  const path = require("path");
  const fileName = `screenshots/${licenseKey}/${Date.now()}_${path.basename(screenshotPath)}`;
  const fileBuffer = fs.readFileSync(screenshotPath);

  const { data } = await supabase.storage
    .from("handlr-files")
    .upload(fileName, fileBuffer, { contentType: "image/png" });

  if (data) {
    const { data: urlData } = supabase.storage.from("handlr-files").getPublicUrl(fileName);
    await sendMessage("assistant", caption || "Screenshot", {
      screenshot: urlData.publicUrl,
    });
  }
}

// Send a document
async function sendDocument(filePath, fileName) {
  if (!supabase || !licenseKey) return;

  const fs = require("fs");
  const path = require("path");
  const storagePath = `documents/${licenseKey}/${Date.now()}_${fileName || path.basename(filePath)}`;
  const fileBuffer = fs.readFileSync(filePath);

  const { data } = await supabase.storage
    .from("handlr-files")
    .upload(storagePath, fileBuffer);

  if (data) {
    const { data: urlData } = supabase.storage.from("handlr-files").getPublicUrl(storagePath);
    await sendMessage("assistant", `Document: ${fileName || path.basename(filePath)}`, {
      document: { name: fileName || path.basename(filePath), url: urlData.publicUrl },
    });
  }
}

// Request approval from the user
async function requestApproval(toolName, toolArgs, description, timeoutMs = 120000) {
  if (!supabase || !licenseKey) return false;

  // Create approval record
  const { data } = await supabase.from("approvals").insert({
    license_key: licenseKey,
    tool_name: toolName,
    tool_args: toolArgs,
    description,
    status: "pending",
  }).select().single();

  if (!data) return false;

  // Send approval message to chat
  await sendMessage("approval", description, {
    approval_id: data.id,
    tool_name: toolName,
  });

  // Wait for user response
  return new Promise((resolve) => {
    approvalHandlers.set(data.id, resolve);

    // Timeout
    setTimeout(async () => {
      if (approvalHandlers.has(data.id)) {
        approvalHandlers.delete(data.id);
        await supabase.from("approvals").update({
          status: "expired",
          resolved_at: new Date().toISOString(),
        }).eq("id", data.id);
        resolve(false);
      }
    }, timeoutMs);
  });
}

// Update bot online status
async function updateBotStatus(isOnline) {
  if (!supabase || !licenseKey) return;

  const pkg = require("../../package.json");
  await supabase.from("bot_status").upsert({
    license_key: licenseKey,
    is_online: isOnline,
    last_seen: new Date().toISOString(),
    platform: platform.osDescription,
    version: pkg.version,
    updated_at: new Date().toISOString(),
  });
}

// Mark offline on shutdown
async function shutdown() {
  await updateBotStatus(false);
}

module.exports = {
  init,
  onMessage,
  sendMessage,
  sendScreenshot,
  sendDocument,
  requestApproval,
  updateBotStatus,
  shutdown,
};
