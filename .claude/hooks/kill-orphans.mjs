// SessionEnd hook (Windows): kill process trees the ending claude.exe left behind (hung bash/python shells).
// Scoped to the nearest claude.exe ancestor, so other live sessions are untouched.
import { spawnSync } from "node:child_process";

const ps = spawnSync(
  "powershell",
  [
    "-NoProfile",
    "-Command",
    "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name | ConvertTo-Json -Compress",
  ],
  { encoding: "utf8" },
);
if (ps.status !== 0) process.exit(0);
const procs = new Map(JSON.parse(ps.stdout).map((p) => [p.ProcessId, p]));

const self = new Set();
let claude;
for (let p = procs.get(process.pid); p; p = procs.get(p.ParentProcessId)) {
  self.add(p.ProcessId);
  if (p.Name.toLowerCase() === "claude.exe") {
    claude = p;
    break;
  }
}
if (!claude) process.exit(0);

for (const p of procs.values()) {
  if (p.ParentProcessId === claude.ProcessId && !self.has(p.ProcessId)) {
    spawnSync("taskkill", ["/F", "/T", "/PID", String(p.ProcessId)]);
  }
}
