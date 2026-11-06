import { execFileSync } from "node:child_process";

/**
 * The OS foreground window, for the e2e harness only (BUG-2, see decisions.md).
 *
 * Windows lets a process take the foreground only if it got the user's last input, or was granted the right by the
 * process that did. A real tray click, tray-menu choice or Start-menu launch carries that grant; the harness fakes
 * those events from outside, so it must also fake the grant. Otherwise `focus()` is refused whenever the person at the
 * desktop has typed or clicked in another app in the last `ForegroundLockTimeout` (200 s by default).
 *
 * The helpers call user32 through PowerShell's Add-Type: no native npm dependency, and nothing here ships in the app.
 */

const USER32 = `
using System;
using System.Runtime.InteropServices;
public static class FeatraForeground {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, IntPtr pid);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint from, uint to, bool attach);
  [DllImport("user32.dll")] static extern bool AllowSetForegroundWindow(int pid);
  // Shares the foreground thread's input state, as the process the user is typing into would, and passes the right
  // to take the foreground on to pid: what the shell does for a tray icon's owner when the icon is clicked.
  public static bool Grant(int pid) {
    uint fg = GetWindowThreadProcessId(GetForegroundWindow(), IntPtr.Zero);
    uint me = GetCurrentThreadId();
    bool attached = fg != 0 && fg != me && AttachThreadInput(me, fg, true);
    try { return AllowSetForegroundWindow(pid); }
    finally { if (attached) AttachThreadInput(me, fg, false); }
  }
  public static long Foreground() { return GetForegroundWindow().ToInt64(); }
}`;

function powershell(call: string): string {
  const script = `Add-Type -TypeDefinition @'\n${USER32}\n'@\n${call}`;
  try {
    // A bounded wait: a hung call should fail as itself, not as the test's 60 s timeout.
    return execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      encoding: "utf8",
      timeout: 15_000,
    }).trim();
  } catch (e) {
    throw new Error(`user32 call through PowerShell failed: ${call}`, { cause: e });
  }
}

/**
 * Grants process `pid` the right to take the foreground, as a real click on its tray icon or menu would. Windows
 * only: elsewhere there is no foreground lock to get past, so it does nothing.
 */
export function grantForeground(pid: number): void {
  if (process.platform !== "win32") return;
  const granted = powershell(`[FeatraForeground]::Grant(${pid})`);
  if (granted !== "True") throw new Error(`Could not grant process ${pid} the foreground (AllowSetForegroundWindow)`);
}

/**
 * The OS foreground window's handle as a number: the HWND on Windows, the window manager's `_NET_ACTIVE_WINDOW` on
 * X11. Undefined when no window is active.
 */
export function foregroundWindow(): bigint | undefined {
  if (process.platform === "win32") return BigInt(powershell("[FeatraForeground]::Foreground()"));
  const out = execFileSync("xprop", ["-root", "_NET_ACTIVE_WINDOW"], { encoding: "utf8" });
  const id = /window id # (0x[0-9a-f]+)/i.exec(out)?.[1];
  return id === undefined ? undefined : BigInt(id);
}
