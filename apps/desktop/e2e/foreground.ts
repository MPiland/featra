import { execFileSync } from "node:child_process";

/**
 * The OS foreground window, for the e2e harness only (BUG-2, see decisions.md).
 *
 * Chromium's `isFocused()` can say true while another app is in front, so focus tests also ask the OS.
 *
 * The helpers call user32 through PowerShell's Add-Type: no native npm dependency, and nothing here ships in the app.
 */

const USER32 = `
using System;
using System.Runtime.InteropServices;
public static class FeatraForeground {
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  public static long Foreground() { return GetForegroundWindow().ToInt64(); }
}`;

function powershell(call: string): string {
  const script = `Add-Type -TypeDefinition @'\n${USER32}\n'@\n${call}`;
  return execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
  }).trim();
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
