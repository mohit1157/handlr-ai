const { createClient } = require("@supabase/supabase-js");
const fs = require("fs");
const path = require("path");
const config = require("../config");
const { chat } = require("../ai/openai");
const chatHistory = require("../memory/chatHistory");

let supabase = null;
let isConnected = false;

// Pending approval requests: Map<actionId, { resolve, timer }>
const pendingWebApprovals = new Map();

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

// ---------------------------------------------------------------------------
// File upload to Supabase Storage
// ---------------------------------------------------------------------------

/**
 * Upload a file (buffer or local path) to the "chat-files" storage bucket.
 * Returns the public URL on success, or null on failure.
 */
async function uploadFileToStorage(filePathOrBuffer, fileName) {
  if (!supabase) return null;
  try {
    let fileBuffer;
    if (Buffer.isBuffer(filePathOrBuffer)) {
      fileBuffer = filePathOrBuffer;
    } else if (typeof filePathOrBuffer === "string" && fs.existsSync(filePathOrBuffer)) {
      fileBuffer = fs.readFileSync(filePathOrBuffer);
    } else {
      console.error("Supabase bridge: invalid file input for upload");
      return null;
    }

    // Build a unique storage path: licenseKey/timestamp-filename
    const storagePath = `${config.LICENSE_KEY}/${Date.now()}-${fileName}`;

    // Determine content type from extension
    const ext = path.extname(fileName).toLowerCase();
    const mimeTypes = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".pdf": "application/pdf",
      ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ".xls": "application/vnd.ms-excel",
      ".csv": "text/csv",
      ".doc": "application/msword",
      ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".txt": "text/plain",
      ".json": "application/json",
      ".zip": "application/zip",
    };
    const contentType = mimeTypes[ext] || "application/octet-stream";

    const { data, error } = await supabase.storage
      .from("chat-files")
      .upload(storagePath, fileBuffer, {
        contentType,
        upsert: false,
      });

    if (error) {
      console.error("Supabase bridge: storage upload error:", error.message);
      return null;
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("chat-files")
      .getPublicUrl(storagePath);

    const publicUrl = urlData?.publicUrl || null;
    console.log(`Supabase bridge: uploaded ${fileName} → ${publicUrl}`);
    return publicUrl;
  } catch (err) {
    console.error("Supabase bridge: upload failed:", err.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Message sending (extended with type, file_url, file_name support)
// ---------------------------------------------------------------------------

async function sendMessage(role, content, metadata = {}, options = {}) {
  if (!supabase) return null;
  try {
    const row = {
      license_key: config.LICENSE_KEY,
      role,
      content,
      metadata,
    };

    // Optional typed-message fields
    if (options.type) row.type = options.type;
    if (options.file_url) row.file_url = options.file_url;
    if (options.file_name) row.file_name = options.file_name;

    const { data, error } = await supabase.from("messages").insert(row).select("id").single();
    if (error) {
      console.error("Supabase bridge: failed to send message:", error.message);
      return null;
    }
    return data?.id || null;
  } catch (err) {
    console.error("Supabase bridge: failed to send message:", err.message);
    return null;
  }
}

/**
 * Send a file message: upload to storage, then insert a message row.
 */
async function sendFileMessage(filePathOrBuffer, fileName, caption) {
  const url = await uploadFileToStorage(filePathOrBuffer, fileName);
  if (!url) {
    // Fallback: send as plain text if upload fails
    await sendMessage("assistant", caption || `File: ${fileName}`, { fallback: true });
    return null;
  }
  return await sendMessage("assistant", caption || fileName, {}, {
    type: "file",
    file_url: url,
    file_name: fileName,
  });
}

/**
 * Send an image message: upload to storage, then insert a message row.
 */
async function sendImageMessage(imagePathOrBuffer, fileName, caption) {
  const imgName = fileName || "screenshot.png";
  const url = await uploadFileToStorage(imagePathOrBuffer, imgName);
  if (!url) {
    // Fallback: embed as base64 in metadata (legacy behaviour)
    let photoData = null;
    if (typeof imagePathOrBuffer === "string" && fs.existsSync(imagePathOrBuffer)) {
      photoData = `data:image/png;base64,${fs.readFileSync(imagePathOrBuffer).toString("base64")}`;
    }
    await sendMessage("assistant", caption || "Screenshot", { type: "screenshot", image: photoData });
    return null;
  }
  return await sendMessage("assistant", caption || "Screenshot", {}, {
    type: "image",
    file_url: url,
    file_name: imgName,
  });
}

/**
 * Send a status/progress message.
 */
async function sendStatusMessage(content) {
  return await sendMessage("assistant", content, {}, { type: "status" });
}

// ---------------------------------------------------------------------------
// Approval flow via Supabase messages
// ---------------------------------------------------------------------------

/**
 * Request approval from the web chat user.
 * Inserts an "approval" message and waits for an "approval_response" message
 * with the matching action_id.
 * Returns true (approved) or false (denied/timeout).
 */
function requestWebApproval(toolName, args, timeoutMs) {
  return new Promise(async (resolve) => {
    const actionId = `webapprove_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const timer = setTimeout(() => {
      pendingWebApprovals.delete(actionId);
      console.log(`Supabase bridge: approval ${actionId} timed out`);
      resolve(false);
    }, timeoutMs || config.APPROVAL_TIMEOUT || 120000);

    pendingWebApprovals.set(actionId, { resolve, timer });

    // Build a human-readable description
    const safeArgs = { ...args };
    delete safeArgs.password;
    delete safeArgs.pass;
    delete safeArgs.credentials_json;
    const description = `${toolName}: ${JSON.stringify(safeArgs).slice(0, 300)}`;

    await sendMessage("assistant", description, {
      action_id: actionId,
      tool_name: toolName,
      args: safeArgs,
    }, { type: "approval" });

    console.log(`Supabase bridge: approval requested → ${actionId} (${toolName})`);
  });
}

/**
 * Handle an incoming approval_response message from the web chat.
 */
function handleApprovalResponse(msg) {
  const actionId = msg.metadata?.action_id;
  if (!actionId) return false;

  const pending = pendingWebApprovals.get(actionId);
  if (!pending) return false;

  const approved = msg.metadata?.approved === true;
  clearTimeout(pending.timer);
  pendingWebApprovals.delete(actionId);
  pending.resolve(approved);

  console.log(`Supabase bridge: approval ${actionId} → ${approved ? "APPROVED" : "DENIED"}`);
  return true;
}

// ---------------------------------------------------------------------------
// Web sender — mimics Telegram bot API, sends via Supabase
// ---------------------------------------------------------------------------

function createWebSender() {
  return {
    sendMessage: async (chatId, text, opts) => {
      // If opts contains inline_keyboard (approval buttons), send as approval message
      const keyboard = opts?.reply_markup?.inline_keyboard;
      if (keyboard && keyboard.length > 0) {
        // Extract approval info from callback_data
        const approveBtn = keyboard.flat().find((b) => b.callback_data?.startsWith("approve:"));
        const denyBtn = keyboard.flat().find((b) => b.callback_data?.startsWith("deny:"));
        if (approveBtn && denyBtn) {
          const approvalId = approveBtn.callback_data.split(":")[1];
          await sendMessage("assistant", text, {
            action_id: approvalId,
            buttons: keyboard.flat().map((b) => ({
              text: b.text,
              callback_data: b.callback_data,
            })),
          }, { type: "approval" });
          return { message_id: Date.now() };
        }
      }

      await sendMessage("assistant", text, { telegram_opts: opts });
      return { message_id: Date.now() };
    },

    sendPhoto: async (chatId, photo, opts) => {
      const caption = opts?.caption || "Screenshot";
      // Upload to Supabase Storage instead of base64 in metadata
      if (typeof photo === "string" && fs.existsSync(photo)) {
        const fileName = path.basename(photo);
        await sendImageMessage(photo, fileName, caption);
      } else if (Buffer.isBuffer(photo)) {
        await sendImageMessage(photo, "screenshot.png", caption);
      } else {
        // Fallback for URLs or other types
        await sendMessage("assistant", caption, {
          type: "screenshot",
          image: typeof photo === "string" ? photo : null,
        });
      }
      return { message_id: Date.now() };
    },

    sendDocument: async (chatId, doc, opts) => {
      const caption = opts?.caption || "Document";
      const fileName = opts?.filename || "file";

      if (typeof doc === "string" && fs.existsSync(doc)) {
        await sendFileMessage(doc, fileName, caption);
      } else if (Buffer.isBuffer(doc)) {
        await sendFileMessage(doc, fileName, caption);
      } else {
        // Fallback: send as plain text message
        await sendMessage("assistant", caption, {
          type: "document",
          filename: fileName,
        });
      }
      return { message_id: Date.now() };
    },

    editMessageText: async (text) => {
      // Send progress/status updates as status messages
      if (text) {
        await sendStatusMessage(text);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Incoming message handling
// ---------------------------------------------------------------------------

async function handleUserMessage(msg) {
  const userId = config.LICENSE_KEY;
  const text = msg.content;

  console.log(`[Web] ${text}`);

  try {
    // Auto-grant session approval for web chat (owner is authenticated)
    const { startSessionApproval } = require("../security/approval");
    startSessionApproval(userId, "session", { minutes: 1440 });

    // Send "thinking" indicator
    await sendStatusMessage("Thinking...");

    // Create a web-compatible sender that mimics Telegram bot
    const webBot = createWebSender();

    // Get AI response using the same chat function as Telegram
    const reply = await chat(userId, text, webBot);

    if (reply) {
      // reply can be a string or an object { text, screenshots }
      const replyText = typeof reply === "string" ? reply : (reply.text || JSON.stringify(reply));
      const screenshots = (typeof reply === "object" && reply.screenshots) ? reply.screenshots : [];

      // Upload any screenshots attached to the reply
      if (screenshots.length > 0) {
        for (const screenshotPath of screenshots) {
          if (typeof screenshotPath === "string" && fs.existsSync(screenshotPath)) {
            await sendImageMessage(screenshotPath, path.basename(screenshotPath), "Screenshot");
          }
        }
      }

      await sendMessage("assistant", replyText);
      console.log(`[Web] Reply: ${replyText.substring(0, 100)}...`);
    }
  } catch (err) {
    console.error("Supabase bridge: message handling error:", err.message);
    await sendMessage("assistant", `Error: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Realtime listener
// ---------------------------------------------------------------------------

async function startListening() {
  if (!supabase) return;

  // Mark bot as online
  await updateBotStatus(true);

  // Subscribe to new messages (user messages + approval responses)
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

        // Handle approval responses from web chat
        if (msg.role === "user" && msg.type === "approval_response") {
          handleApprovalResponse(msg);
          return;
        }

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

module.exports = {
  initBridge,
  startListening,
  stopBridge,
  sendMessage,
  sendFileMessage,
  sendImageMessage,
  sendStatusMessage,
  uploadFileToStorage,
  requestWebApproval,
  createWebSender,
};
