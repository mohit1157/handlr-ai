const { runShell } = require("./shell");
const platform = require("../platform");

async function getSystemStatus() {
  let cmds;

  if (platform.isWindows) {
    cmds = {
      uptime: 'powershell -c "(Get-Date) - (gcim Win32_OperatingSystem).LastBootUpTime | ForEach-Object { $_.Days.ToString() + \'d \' + $_.Hours.ToString() + \'h \' + $_.Minutes.ToString() + \'m\' }"',
      mem: 'powershell -c "$os = gcim Win32_OperatingSystem; $total = [math]::Round($os.TotalVisibleMemorySize/1MB,1); $free = [math]::Round($os.FreePhysicalMemory/1MB,1); Write-Output \\"Total: ${total}GB  Free: ${free}GB\\""',
      disk: 'powershell -c "Get-PSDrive C | ForEach-Object { $used = [math]::Round($_.Used/1GB,1); $free = [math]::Round($_.Free/1GB,1); Write-Output \\"C: Used ${used}GB  Free ${free}GB\\" }"',
      cpu: 'powershell -c "(gcim Win32_Processor).LoadPercentage | ForEach-Object { Write-Output \\"CPU Load: $__%\\" }"',
      temp: 'echo N/A',
    };
  } else if (platform.isMac) {
    cmds = {
      uptime: "uptime",
      mem: "vm_stat | head -5",
      disk: "df -h / | tail -1",
      cpu: "top -l 1 -n 0 | head -4 | tail -1",
      temp: platform.tempCommand ? platform.tempCommand : "echo N/A",
    };
  } else {
    // Linux (including Pi)
    cmds = {
      uptime: "uptime -p",
      mem: "free -h | head -2",
      disk: "df -h / | tail -1",
      cpu: "top -bn1 | head -3 | tail -1",
      temp: platform.tempCommand || "echo N/A",
    };
  }

  const [uptime, mem, disk, cpu, temp] = await Promise.all([
    runShell(cmds.uptime),
    runShell(cmds.mem),
    runShell(cmds.disk),
    runShell(cmds.cpu),
    runShell(cmds.temp),
  ]);

  return [
    `System Status (${platform.osDescription}):`,
    `Uptime: ${uptime.output.trim()}`,
    `Memory:\n${mem.output.trim()}`,
    `Disk: ${disk.output.trim()}`,
    `CPU: ${cpu.output.trim()}`,
    `Temp: ${temp.output.trim()}`,
  ].join("\n");
}

module.exports = { getSystemStatus };
