const { exec } = require("child_process");
const config = require("../config");
const platform = require("../platform");

// Commands that are NEVER allowed, even with approval
const HARD_BLOCKED_UNIX = [
  /rm\s+(-rf?|--force)\s+\/\s*$/,
  /mkfs\b/,
  /dd\s+if=\/dev\/(zero|random|urandom)/,
  /:\(\)\s*\{.*\|.*&\s*\}\s*;?\s*:/,  // fork bomb
];

const HARD_BLOCKED_WIN = [
  /format\s+[a-z]:/i,
  /rd\s+\/s\s+\/q\s+[a-z]:\\/i,
  /del\s+\/f\s+\/s\s+\/q\s+[a-z]:\\/i,
];

const HARD_BLOCKED = platform.isWindows ? HARD_BLOCKED_WIN : HARD_BLOCKED_UNIX;

// Patterns that indicate a MODIFYING command (needs approval)
const WRITE_PATTERNS_UNIX = [
  /^(rm|rmdir|mv|cp)\b/,
  /^(mkdir|touch|chmod|chown|chgrp)\b/,
  /^(apt|apt-get|dpkg|pip|pip3|npm|yarn)\s+(install|remove|purge|uninstall|update|upgrade)/,
  /^(systemctl|service)\s+(start|stop|restart|enable|disable)/,
  /^(shutdown|reboot|halt|poweroff)\b/,
  /^(passwd|usermod|useradd|userdel|groupadd)\b/,
  /^(iptables|ufw)\b/,
  /^(crontab)\b/,
  /^(tee|sed|awk)\b.*>/,
  /^(echo|cat|printf)\b.*>/,
  />\s*\//,  // redirect to absolute path
  /\|\s*(ba)?sh\b/,  // pipe to shell
  /^(kill|killall|pkill)\b/,
  /^(mount|umount)\b/,
  /^(git)\s+(push|reset|checkout|clean|stash)/,
];

const WRITE_PATTERNS_WIN = [
  /^(del|erase|rd|rmdir|move|copy|xcopy|robocopy)\b/i,
  /^(mkdir|md|ren|rename)\b/i,
  /^(choco|winget|scoop)\s+(install|remove|uninstall|upgrade)/i,
  /^(npm|yarn|pip|pip3)\s+(install|remove|uninstall|update|upgrade)/i,
  /^(net\s+(start|stop|user))\b/i,
  /^(shutdown|restart-computer)\b/i,
  /^(sc\s+(start|stop|delete|config))\b/i,
  /^(reg\s+(add|delete))\b/i,
  /^(schtasks\s+\/(create|delete))\b/i,
  /^(powershell|pwsh).*Remove-Item/i,
  /^(Set-Content|Out-File|New-Item)\b/i,
  /^(Stop-Process|Kill)\b/i,
  />\s*[a-z]:\\/i,
  /^(git)\s+(push|reset|checkout|clean|stash)/,
];

const WRITE_PATTERNS = platform.isWindows ? WRITE_PATTERNS_WIN : WRITE_PATTERNS_UNIX;

function isHardBlocked(cmd) {
  return HARD_BLOCKED.some((p) => p.test(cmd));
}

function isModifying(cmd) {
  const trimmed = cmd.trim();
  return WRITE_PATTERNS.some((p) => p.test(trimmed));
}

function classifyCommand(cmd) {
  if (isHardBlocked(cmd)) return "blocked";
  if (isModifying(cmd)) return "modifying";
  return "read";
}

function runShell(cmd, timeoutMs) {
  const timeout = Math.min(timeoutMs || config.SHELL_TIMEOUT, 120000);
  return new Promise((resolve) => {
    exec(cmd, { timeout, maxBuffer: 1024 * 512, shell: platform.shell }, (err, stdout, stderr) => {
      if (err) {
        if (err.killed) return resolve({ output: `Command timed out after ${timeout / 1000}s.`, code: -1 });
        return resolve({ output: `Error: ${err.message}\n${stderr}`.slice(0, config.SHELL_MAX_OUTPUT), code: err.code || 1 });
      }
      resolve({ output: (stdout || stderr || "(no output)").slice(0, config.SHELL_MAX_OUTPUT), code: 0 });
    });
  });
}

module.exports = { runShell, classifyCommand, isHardBlocked, isModifying };
