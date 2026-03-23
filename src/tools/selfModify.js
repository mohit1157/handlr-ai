const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const config = require("../config");

const BACKUP_DIR = path.join(config.DATA_DIR, "backups");

function backupCode() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(BACKUP_DIR, `src_${timestamp}`);
  fs.mkdirSync(backupPath, { recursive: true });

  // Copy src/ and index.js
  copyRecursive(path.resolve("src"), path.join(backupPath, "src"));
  fs.copyFileSync(path.resolve("index.js"), path.join(backupPath, "index.js"));

  return { backupPath, timestamp };
}

function copyRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function modifyAndRestart({ file, content, description }) {
  // 1. Backup first
  const backup = backupCode();

  // 2. Write the new content
  const filePath = path.resolve(file);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);

  // 3. Syntax check
  try {
    execSync(`node -c "${filePath}"`, { timeout: 5000 });
  } catch (err) {
    // Syntax error — rollback
    rollbackFromPath(backup.backupPath);
    return { error: `Syntax error: ${err.message}. Rolled back to backup.` };
  }

  // 4. Restart via PM2
  try {
    execSync("pm2 restart jarvis", { timeout: 10000 });
    return {
      success: true,
      file: filePath,
      backupPath: backup.backupPath,
      description,
      message: "Code modified and Jarvis restarted. Backup saved.",
    };
  } catch (err) {
    return { success: true, file: filePath, warning: `Modified but PM2 restart failed: ${err.message}. May need manual restart.` };
  }
}

function rollback() {
  // Find the latest backup
  if (!fs.existsSync(BACKUP_DIR)) return { error: "No backups found." };

  const backups = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith("src_"))
    .sort()
    .reverse();

  if (!backups.length) return { error: "No backups found." };

  const latestBackup = path.join(BACKUP_DIR, backups[0]);
  return rollbackFromPath(latestBackup);
}

function rollbackFromPath(backupPath) {
  try {
    // Restore src/
    const srcBackup = path.join(backupPath, "src");
    if (fs.existsSync(srcBackup)) {
      copyRecursive(srcBackup, path.resolve("src"));
    }
    // Restore index.js
    const indexBackup = path.join(backupPath, "index.js");
    if (fs.existsSync(indexBackup)) {
      fs.copyFileSync(indexBackup, path.resolve("index.js"));
    }

    try { execSync("pm2 restart jarvis", { timeout: 10000 }); } catch {}

    return { success: true, restoredFrom: backupPath, message: "Code rolled back and Jarvis restarted." };
  } catch (err) {
    return { error: `Rollback failed: ${err.message}` };
  }
}

module.exports = { backupCode, modifyAndRestart, rollback };
