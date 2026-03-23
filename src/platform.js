const os = require("os");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const PLATFORM = os.platform(); // "win32", "linux", "darwin"
const ARCH = os.arch(); // "arm64", "x64", etc.

// ── Shell ──
function getShell() {
  if (process.env.SHELL_PATH) return process.env.SHELL_PATH;
  if (PLATFORM === "win32") return "powershell.exe";
  return "/bin/bash";
}

// ── Chromium / Chrome path ──
function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;

  const candidates = {
    win32: [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      `${os.homedir()}\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe`,
      "C:\\Program Files\\Chromium\\Application\\chrome.exe",
    ],
    darwin: [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ],
    linux: [
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/snap/bin/chromium",
    ],
  };

  const paths = candidates[PLATFORM] || candidates.linux;
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }

  // Fallback: try `which` / `where`
  try {
    const cmd = PLATFORM === "win32" ? "where chrome 2>nul" : "which chromium chromium-browser google-chrome 2>/dev/null";
    const result = execSync(cmd, { encoding: "utf8" }).trim().split("\n")[0];
    if (result && fs.existsSync(result)) return result;
  } catch {}

  return null;
}

// ── Browser launch args ──
function getBrowserArgs() {
  const base = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--disable-web-security",
    "--disable-features=IsolateOrigins,site-per-process",
  ];

  // Pi / low-memory ARM devices
  if (PLATFORM === "linux" && ARCH === "arm64") {
    base.push("--single-process", "--no-zygote");
  }

  // Proxy
  if (process.env.PROXY_URL) {
    base.push(`--proxy-server=${process.env.PROXY_URL}`);
  }

  return base;
}

// ── User agent ──
function getUserAgent() {
  const agents = {
    win32: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    darwin: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    linux: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  };
  return agents[PLATFORM] || agents.linux;
}

// ── Temperature command ──
function getTempCommand() {
  if (PLATFORM === "linux") {
    if (fs.existsSync("/usr/bin/vcgencmd")) return "vcgencmd measure_temp";
    if (fs.existsSync("/sys/class/thermal/thermal_zone0/temp")) return "cat /sys/class/thermal/thermal_zone0/temp";
  }
  if (PLATFORM === "darwin") {
    try { execSync("which osx-cpu-temp", { encoding: "utf8" }); return "osx-cpu-temp"; } catch {}
  }
  return null;
}

// ── OS description ──
function getOsDescription() {
  if (PLATFORM === "win32") return `Windows ${os.release()}`;
  if (PLATFORM === "darwin") return `macOS ${os.release()}`;
  if (PLATFORM === "linux") {
    if (ARCH === "arm64") return "Linux ARM64 (Raspberry Pi)";
    return `Linux ${ARCH}`;
  }
  return `${PLATFORM} ${ARCH}`;
}

// ── Process manager ──
function getProcessManager() {
  try {
    execSync("which pm2 2>/dev/null || where pm2 2>nul", { encoding: "utf8" });
    return "pm2";
  } catch {
    return "none";
  }
}

// ── Data directory ──
const DATA_DIR = path.resolve(process.env.DATA_DIR || "./data");

// ── Timezone ──
function getTimezone() {
  return process.env.TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone;
}

module.exports = {
  os: PLATFORM,
  arch: ARCH,
  isWindows: PLATFORM === "win32",
  isMac: PLATFORM === "darwin",
  isLinux: PLATFORM === "linux",
  isPi: PLATFORM === "linux" && ARCH === "arm64",
  shell: getShell(),
  chromiumPath: findChromium(),
  browserArgs: getBrowserArgs(),
  userAgent: getUserAgent(),
  tempCommand: getTempCommand(),
  osDescription: getOsDescription(),
  processManager: getProcessManager(),
  dataDir: DATA_DIR,
  homeDir: os.homedir(),
  timezone: getTimezone(),
};
