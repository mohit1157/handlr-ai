const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const config = require("../config");

const VAULT_PATH = path.join(config.DATA_DIR, "vault.enc");
const ALGO = "aes-256-gcm";

function getKey() {
  let key = process.env.VAULT_KEY;
  if (!key) {
    // Auto-generate and persist
    key = crypto.randomBytes(32).toString("hex");
    const envPath = path.resolve(".env");
    fs.appendFileSync(envPath, `\nVAULT_KEY=${key}\n`);
    process.env.VAULT_KEY = key;
  }
  return crypto.scryptSync(key, "jarvis-vault-salt", 32);
}

function encrypt(data) {
  const key = getKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  let encrypted = cipher.update(JSON.stringify(data), "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag();
  return { iv: iv.toString("hex"), tag: tag.toString("hex"), data: encrypted };
}

function decrypt(blob) {
  const key = getKey();
  const iv = Buffer.from(blob.iv, "hex");
  const tag = Buffer.from(blob.tag, "hex");
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(blob.data, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return JSON.parse(decrypted);
}

function loadVault() {
  try {
    if (fs.existsSync(VAULT_PATH)) {
      const blob = JSON.parse(fs.readFileSync(VAULT_PATH, "utf8"));
      return decrypt(blob);
    }
  } catch {}
  return {};
}

function saveVault(vault) {
  fs.mkdirSync(path.dirname(VAULT_PATH), { recursive: true });
  const blob = encrypt(vault);
  fs.writeFileSync(VAULT_PATH, JSON.stringify(blob));
}

function saveCredential({ site, username, password, notes }) {
  const vault = loadVault();
  vault[site] = { username, password, notes, savedAt: new Date().toISOString() };
  saveVault(vault);
  return { success: true, site, username };
}

function getCredential({ site }) {
  const vault = loadVault();
  const entry = vault[site];
  if (!entry) return { error: `No credentials found for "${site}"` };
  return { site, username: entry.username, password: entry.password, notes: entry.notes };
}

function listCredentials() {
  const vault = loadVault();
  const entries = Object.entries(vault).map(([site, e]) => ({ site, username: e.username, savedAt: e.savedAt }));
  return { credentials: entries };
}

module.exports = { saveCredential, getCredential, listCredentials };
