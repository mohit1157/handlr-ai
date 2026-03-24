const { classifyCommand, isHardBlocked } = require("../tools/shell");

// Tools that ALWAYS need approval (unless session approved)
const MODIFYING_TOOLS = new Set([
  "write_file", "click_element", "type_text", "request_session_approval",
  "send_email", "reply_email", "configure_email", "self_modify",
  "download_file", "upload_file", "select_dropdown", "check_box",
  "open_tab", "close_tab", "handle_popup",
  "save_credential", "configure_calendar", "create_calendar_event", "update_calendar_event", "delete_calendar_event", "apply_update",
]);

// Tools that are always safe
const SAFE_TOOLS = new Set([
  "get_system_status", "take_screenshot", "get_page_text", "get_page_html",
  "read_file", "list_files", "browse_url", "scroll_page", "press_key",
  "save_memory", "recall_memory", "clear_browser_data",
  "check_email", "search_email", "create_document",
  "create_task", "update_task", "get_task", "list_tasks",
  "create_excel", "read_excel", "read_pdf",
  "list_tabs", "execute_js", "switch_tab",
  "analyze_screenshot", "process_image", "request_otp",
  "read_email_body", "analyze_form", "wait_for_element",
  "get_credential", "list_credentials", "list_calendar_events",
  "solve_captcha", "switch_model", "rollback_code", "check_update",
]);

// Pending approvals: Map<callbackId, { resolve, timer }>
const pendingApprovals = new Map();

// Session approvals: Map<chatId, { mode, expiresAt, domain? }>
const sessionApprovals = new Map();

function startSessionApproval(chatId, mode, options = {}) {
  const minutes = options.minutes || 1440;
  const entry = {
    mode, // "session" or "domain"
    expiresAt: Date.now() + minutes * 60 * 1000,
    domain: options.domain || null,
  };
  sessionApprovals.set(chatId, entry);
  return entry;
}

function endSessionApproval(chatId) {
  sessionApprovals.delete(chatId);
}

function getSessionApproval(chatId) {
  const session = sessionApprovals.get(chatId);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessionApprovals.delete(chatId);
    return null;
  }
  return session;
}

function isSessionApproved(chatId, toolName, args) {
  const session = getSessionApproval(chatId);
  if (!session) return false;

  // Shell modifying commands ALWAYS require approval — never session-bypass
  if (toolName === "run_shell_command") {
    const classification = classifyCommand(args.command || "");
    if (classification === "modifying") return false;
  }

  // write_file always requires approval — never session-bypass
  if (toolName === "write_file") return false;

  if (session.mode === "session") return true;

  if (session.mode === "domain" && session.domain) {
    // Only auto-approve browser actions on the specified domain
    const browserTools = new Set(["click_element", "type_text"]);
    if (!browserTools.has(toolName)) return false;
    // We can't easily check the current URL from here, so domain mode
    // approves all browser actions (the domain is just a label for the user)
    return true;
  }

  return false;
}

function needsApproval(toolName, args, chatId) {
  // Auto-approve everything if configured (owner mode)
  if (process.env.AUTO_APPROVE === "true") {
    // Still block hard-blocked commands (rm -rf /, format, etc.)
    if (toolName === "run_shell_command" && isHardBlocked(args.command || "")) return "blocked";
    return false;
  }

  if (SAFE_TOOLS.has(toolName)) return false;

  // Check session approval before requiring individual approval
  if (chatId && isSessionApproved(chatId, toolName, args)) return false;

  // find_by_text needs approval only when clicking
  if (toolName === "find_by_text") return args.click ? true : false;

  if (MODIFYING_TOOLS.has(toolName)) return true;

  // For shell commands, classify the command
  if (toolName === "run_shell_command") {
    const classification = classifyCommand(args.command || "");
    if (classification === "blocked") return "blocked";
    if (classification === "modifying") return true;
    return false;
  }

  return false; // unknown tools default to auto-execute
}

function escMd(str) {
  return (str || "").replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
}

function formatApprovalRequest(toolName, args) {
  if (toolName === "run_shell_command") {
    return `🔒 Shell command requires approval:\n${escMd(args.command)}`;
  }
  if (toolName === "write_file") {
    return `🔒 Write file requires approval:\nPath: ${escMd(args.path)}`;
  }
  if (toolName === "click_element") {
    return `🔒 Browser click requires approval:\nSelector: ${escMd(args.selector)}`;
  }
  if (toolName === "type_text") {
    return `🔒 Browser type requires approval:\nSelector: ${escMd(args.selector)}\nText: "${escMd(args.text)}"`;
  }
  if (toolName === "request_session_approval") {
    const mins = args.minutes || 1440;
    return `🔓 Jarvis wants session approval for ${mins} minutes.\nReason: ${escMd(args.reason || "multi-step workflow")}`;
  }
  if (toolName === "save_credential") {
    return `🔒 Save credential requires approval:\nSite: ${escMd(args.site)}\nUsername: ${escMd(args.username)}\nPassword: [HIDDEN]`;
  }
  if (toolName === "configure_email") {
    return `🔒 Configure email requires approval:\nUser: ${escMd(args.user)}`;
  }
  if (toolName === "send_email" || toolName === "reply_email") {
    return `🔒 Send email requires approval:\nTo: ${escMd(args.to || "reply")}\nSubject: ${escMd(args.subject || "")}`;
  }
  if (toolName === "self_modify") {
    return `🔒 Code modification requires approval:\nFile: ${escMd(args.file)}\nDescription: ${escMd(args.description)}`;
  }
  // Generic — hide sensitive fields
  const safeArgs = { ...args };
  delete safeArgs.password;
  delete safeArgs.pass;
  delete safeArgs.credentials_json;
  return `🔒 ${escMd(toolName)} requires approval:\n${escMd(JSON.stringify(safeArgs).slice(0, 200))}`;
}

function createApprovalId() {
  return `approve_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function requestApproval(bot, chatId, toolName, args, timeoutMs) {
  return new Promise((resolve) => {
    const approvalId = createApprovalId();
    const message = formatApprovalRequest(toolName, args);

    const timer = setTimeout(() => {
      pendingApprovals.delete(approvalId);
      resolve(false);
    }, timeoutMs);

    pendingApprovals.set(approvalId, { resolve, timer });

    bot.sendMessage(chatId, message, {
      reply_markup: {
        inline_keyboard: [[
          { text: "✅ Approve", callback_data: `approve:${approvalId}` },
          { text: "❌ Deny", callback_data: `deny:${approvalId}` },
        ]],
      },
    });
  });
}

function handleApprovalCallback(callbackQuery) {
  const data = callbackQuery.data;
  if (!data.startsWith("approve:") && !data.startsWith("deny:")) return false;

  const [action, approvalId] = data.split(":");
  const pending = pendingApprovals.get(approvalId);
  if (!pending) return false;

  clearTimeout(pending.timer);
  pendingApprovals.delete(approvalId);
  pending.resolve(action === "approve");
  return true;
}

module.exports = {
  needsApproval, requestApproval, handleApprovalCallback, formatApprovalRequest,
  startSessionApproval, endSessionApproval, getSessionApproval,
};
