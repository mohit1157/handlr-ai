/**
 * Auto-updater — checks GitHub releases for newer versions
 * Runs on startup and every 6 hours
 */
const https = require("https");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const REPO = "mohit1157/handlr-ai";
const CHECK_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours
const pkg = require("../package.json");

function getCurrentVersion() {
  return pkg.version;
}

function fetchLatestRelease() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.github.com",
      path: `/repos/${REPO}/releases/latest`,
      headers: { "User-Agent": "handlr-ai-updater" },
    };

    https.get(options, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        try {
          const release = JSON.parse(data);
          resolve({
            version: release.tag_name?.replace("v", ""),
            url: release.html_url,
            notes: release.body?.slice(0, 500),
            tarball: release.tarball_url,
            published: release.published_at,
          });
        } catch {
          reject(new Error("Failed to parse release data"));
        }
      });
    }).on("error", reject);
  });
}

function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
  }
  return 0;
}

async function checkForUpdate() {
  try {
    const current = getCurrentVersion();
    const latest = await fetchLatestRelease();

    if (!latest.version) return null;

    if (compareVersions(current, latest.version) < 0) {
      return {
        currentVersion: current,
        latestVersion: latest.version,
        notes: latest.notes,
        url: latest.url,
      };
    }

    return null; // Up to date
  } catch (err) {
    console.warn("Update check failed:", err.message);
    return null;
  }
}

async function applyUpdate() {
  try {
    const botDir = path.resolve(__dirname, "..");

    // Backup current code
    const backupDir = path.join(botDir, "data", "backups", `pre-update-${Date.now()}`);
    fs.mkdirSync(backupDir, { recursive: true });
    fs.cpSync(path.join(botDir, "src"), path.join(backupDir, "src"), { recursive: true });
    fs.copyFileSync(path.join(botDir, "index.js"), path.join(backupDir, "index.js"));
    fs.copyFileSync(path.join(botDir, "package.json"), path.join(backupDir, "package.json"));

    // Pull latest from git
    execSync("git pull origin main", { cwd: botDir, stdio: "pipe" });

    // Install any new dependencies
    execSync("npm install --production", { cwd: botDir, stdio: "pipe" });

    return { success: true, backupDir };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

function startPeriodicCheck(notifyFn) {
  // Check on startup (after 30s delay)
  setTimeout(async () => {
    const update = await checkForUpdate();
    if (update && notifyFn) {
      notifyFn(`Update available: v${update.currentVersion} → v${update.latestVersion}\n${update.notes || ""}\n\nSay "update handlr" to install.`);
    }
  }, 30000);

  // Check every 6 hours
  setInterval(async () => {
    const update = await checkForUpdate();
    if (update && notifyFn) {
      notifyFn(`Update available: v${update.currentVersion} → v${update.latestVersion}`);
    }
  }, CHECK_INTERVAL);
}

module.exports = { checkForUpdate, applyUpdate, startPeriodicCheck, getCurrentVersion };
