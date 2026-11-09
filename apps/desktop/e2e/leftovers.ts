import { execFileSync } from "node:child_process";
import { basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { wslg } from "./foreground.ts";

/** The app folder Featra is launched on (as in app.ts). */
const appDir = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));

/**
 * Processes the e2e harness starts and must end with each test (BUG-4): Featra itself (an Electron main process on
 * this app folder) and the PowerShell helpers. One left running holds windows and the foreground and skews every test
 * after it, so global setup refuses to start beside one and global teardown fails the run if one outlives it.
 */
export function isHarnessProcess(name: string, commandLine: string, dir = appDir): boolean {
  if (/busy-user\.ps1|user32-helper\.ps1/i.test(commandLine)) return /^(powershell|pwsh)(\.exe)?$/i.test(name);
  return /^electron(\.exe)?$/i.test(name) && commandLine.includes(dir);
}

interface Proc {
  pid: number;
  name: string;
  commandLine: string;
}

const WINDOWS_LIST =
  "Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine } | " +
  'ForEach-Object { "$($_.ProcessId)`t$($_.Name)`t$($_.CommandLine)" }';

function windowsProcesses(exe: string): Proc[] {
  const out = execFileSync(exe, ["-NoProfile", "-NonInteractive", "-Command", WINDOWS_LIST], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [pid, name, ...rest] = line.split("\t");
      return { pid: Number(pid), name: name ?? "", commandLine: rest.join("\t") };
    });
}

function linuxProcesses(): Proc[] {
  const out = execFileSync("ps", ["-eo", "pid=,args="], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return out
    .split("\n")
    .map((line) => /^\s*(\d+)\s+(.*)$/.exec(line))
    .filter((m): m is RegExpExecArray => m !== null)
    .map(([, pid, args]) => ({ pid: Number(pid), name: basename(args!.split(" ")[0]!), commandLine: args! }));
}

/** The harness's processes still running: on this OS, and under WSLg on the Windows side too. */
export function harnessLeftovers(): string[] {
  const procs =
    process.platform === "win32"
      ? windowsProcesses("powershell.exe")
      : [
          ...linuxProcesses(),
          ...(wslg ? windowsProcesses("/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe") : []),
        ];
  return procs
    .filter((p) => p.pid !== process.pid && isHarnessProcess(p.name, p.commandLine))
    .map((p) => `${p.pid} ${p.name} ${p.commandLine.slice(0, 160)}`);
}

/** Waits up to `ms` for leftovers to end on their own (a helper notices its worker is gone), then lists them. */
export async function harnessLeftoversAfter(ms: number): Promise<string[]> {
  const deadline = Date.now() + ms;
  for (;;) {
    const left = harnessLeftovers();
    if (left.length === 0 || Date.now() > deadline) return left;
    await new Promise((r) => setTimeout(r, 500));
  }
}
