const fs = require("fs");
const path = require("path");
const config = require("../config");
const { loadEncryptedFile, saveEncryptedFile } = require("../security/crypto");

const EMAIL_CONFIG_PATH = path.join(config.DATA_DIR, "email_config.enc");
// Also check for legacy unencrypted config
const LEGACY_CONFIG_PATH = path.join(config.DATA_DIR, "email_config.json");

// ── Retry helper ──
async function withRetry(fn, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === retries - 1) throw translateError(err);
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
}

// ── Friendly error messages ──
function translateError(err) {
  const msg = err.message || String(err);
  if (/AUTHENTICATIONFAILED|Invalid credentials/i.test(msg)) {
    return new Error("Email login failed. Check your app password or credentials.");
  }
  if (/ECONNREFUSED/i.test(msg)) {
    return new Error("Cannot reach email server. Check your SMTP/IMAP host and port.");
  }
  if (/ETIMEDOUT|ECONNRESET/i.test(msg)) {
    return new Error("Email server timed out. Check your network connection.");
  }
  if (/certificate/i.test(msg)) {
    return new Error("SSL certificate error. The email server's certificate may be invalid.");
  }
  return err;
}

// ── Config management (encrypted) ──
function loadEmailConfig() {
  // Try encrypted first
  const encrypted = loadEncryptedFile(EMAIL_CONFIG_PATH);
  if (encrypted) return encrypted;

  // Fallback to legacy unencrypted
  try {
    if (fs.existsSync(LEGACY_CONFIG_PATH)) {
      const cfg = JSON.parse(fs.readFileSync(LEGACY_CONFIG_PATH, "utf8"));
      // Migrate to encrypted
      saveEncryptedFile(EMAIL_CONFIG_PATH, cfg);
      fs.unlinkSync(LEGACY_CONFIG_PATH);
      return cfg;
    }
  } catch {}
  return null;
}

function saveEmailConfig(cfg) {
  saveEncryptedFile(EMAIL_CONFIG_PATH, cfg);
}

// ── IMAP client factory ──
function createImapClient(cfg) {
  const { ImapFlow } = require("imapflow");
  return new ImapFlow({
    host: cfg.imap.host,
    port: cfg.imap.port,
    secure: true,
    auth: { user: cfg.user, pass: cfg.pass },
    logger: false,
    tls: { rejectUnauthorized: false },
  });
}

// ── Configure ──
async function configureEmail({ smtp_host, smtp_port, imap_host, imap_port, user, pass }) {
  const cfg = {
    smtp: { host: smtp_host, port: smtp_port || 587, secure: (smtp_port || 587) === 465 },
    imap: { host: imap_host, port: imap_port || 993 },
    user,
    pass,
    configuredAt: new Date().toISOString(),
  };
  saveEmailConfig(cfg);
  return { success: true, message: `Email configured for ${user} (encrypted)` };
}

// ── Send ──
async function sendEmail({ to, subject, body, attachments }) {
  const cfg = loadEmailConfig();
  if (!cfg) return { error: "Email not configured. Use configure_email first." };

  return withRetry(async () => {
    const nodemailer = require("nodemailer");
    const transport = nodemailer.createTransport({
      host: cfg.smtp.host,
      port: cfg.smtp.port,
      secure: cfg.smtp.secure,
      auth: { user: cfg.user, pass: cfg.pass },
    });

    const mailOptions = {
      from: cfg.user,
      to,
      subject,
      text: body,
    };

    if (attachments?.length) {
      mailOptions.attachments = attachments.map((a) => ({
        filename: path.basename(a),
        path: a,
      }));
    }

    const info = await transport.sendMail(mailOptions);
    return { success: true, messageId: info.messageId, to, subject };
  });
}

// ── Check inbox ──
async function checkEmail({ folder, limit, unread_only }) {
  const cfg = loadEmailConfig();
  if (!cfg) return { error: "Email not configured. Use configure_email first." };

  return withRetry(async () => {
    const client = createImapClient(cfg);
    await client.connect();
    const mailbox = await client.getMailboxLock(folder || "INBOX");

    try {
      const messages = [];
      const count = limit || 10;
      const totalMessages = client.mailbox.exists;
      const startSeq = Math.max(1, totalMessages - count + 1);

      for await (const msg of client.fetch(`${startSeq}:*`, { envelope: true })) {
        messages.push({
          uid: msg.uid,
          subject: msg.envelope.subject,
          from: msg.envelope.from?.[0]?.address || "unknown",
          date: msg.envelope.date?.toISOString(),
          seen: msg.flags?.has("\\Seen"),
        });
      }

      return {
        folder: folder || "INBOX",
        total: totalMessages,
        messages: messages.reverse().slice(0, count),
      };
    } finally {
      mailbox.release();
      await client.logout();
    }
  });
}

// ── Read full email body ──
async function readEmail({ uid, folder }) {
  const cfg = loadEmailConfig();
  if (!cfg) return { error: "Email not configured. Use configure_email first." };

  return withRetry(async () => {
    const client = createImapClient(cfg);
    await client.connect();
    const mailbox = await client.getMailboxLock(folder || "INBOX");

    try {
      const msg = await client.fetchOne(uid, { envelope: true, source: true });
      const source = msg.source?.toString("utf8") || "";

      // Extract plain text body (simple parser)
      let body = "";
      const textMatch = source.match(/Content-Type: text\/plain[\s\S]*?\r\n\r\n([\s\S]*?)(?:\r\n--|\r\n\.\r\n|$)/i);
      if (textMatch) {
        body = textMatch[1].trim();
      } else {
        // Fallback: strip HTML tags
        const htmlMatch = source.match(/Content-Type: text\/html[\s\S]*?\r\n\r\n([\s\S]*?)(?:\r\n--|\r\n\.\r\n|$)/i);
        if (htmlMatch) {
          body = htmlMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        } else {
          // Simple message without MIME
          const parts = source.split("\r\n\r\n");
          body = parts.slice(1).join("\r\n\r\n").trim();
        }
      }

      return {
        uid,
        subject: msg.envelope.subject,
        from: msg.envelope.from?.[0]?.address || "unknown",
        to: msg.envelope.to?.[0]?.address || "unknown",
        date: msg.envelope.date?.toISOString(),
        body: body.slice(0, 10000), // Cap at 10KB
      };
    } finally {
      mailbox.release();
      await client.logout();
    }
  });
}

// ── Reply ──
async function replyEmail({ uid, folder, body }) {
  const cfg = loadEmailConfig();
  if (!cfg) return { error: "Email not configured. Use configure_email first." };

  return withRetry(async () => {
    const client = createImapClient(cfg);
    await client.connect();
    const mailbox = await client.getMailboxLock(folder || "INBOX");

    try {
      const msg = await client.fetchOne(uid, { envelope: true });
      const replyTo = msg.envelope.from?.[0]?.address;
      const subject = msg.envelope.subject?.startsWith("Re:")
        ? msg.envelope.subject
        : `Re: ${msg.envelope.subject}`;

      mailbox.release();
      await client.logout();

      return await sendEmail({ to: replyTo, subject, body });
    } catch (err) {
      mailbox.release();
      await client.logout();
      throw err;
    }
  });
}

// ── Search ──
async function searchEmail({ query, folder }) {
  const cfg = loadEmailConfig();
  if (!cfg) return { error: "Email not configured. Use configure_email first." };

  return withRetry(async () => {
    const client = createImapClient(cfg);
    await client.connect();
    const mailbox = await client.getMailboxLock(folder || "INBOX");

    try {
      const results = [];
      const uids = await client.search({ or: [{ subject: query }, { from: query }] });

      for (const uid of uids.slice(-20)) {
        const msg = await client.fetchOne(uid, { envelope: true });
        results.push({
          uid,
          subject: msg.envelope.subject,
          from: msg.envelope.from?.[0]?.address,
          date: msg.envelope.date?.toISOString(),
        });
      }

      return { query, folder: folder || "INBOX", results: results.reverse() };
    } finally {
      mailbox.release();
      await client.logout();
    }
  });
}

module.exports = { configureEmail, sendEmail, checkEmail, readEmail, replyEmail, searchEmail };
