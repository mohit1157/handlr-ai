const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ALGO = "aes-256-gcm";

function getKey() {
  let key = process.env.VAULT_KEY;
  if (!key) {
    key = crypto.randomBytes(32).toString("hex");
    const envPath = path.resolve(".env");
    fs.appendFileSync(envPath, `\nVAULT_KEY=${key}\n`);
    process.env.VAULT_KEY = key;
  }
  return crypto.scryptSync(key, "handlr-vault-salt", 32);
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

function loadEncryptedFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const blob = JSON.parse(fs.readFileSync(filePath, "utf8"));
      return decrypt(blob);
    }
  } catch {}
  return null;
}

function saveEncryptedFile(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const blob = encrypt(data);
  fs.writeFileSync(filePath, JSON.stringify(blob));
}

module.exports = { encrypt, decrypt, getKey, loadEncryptedFile, saveEncryptedFile };
