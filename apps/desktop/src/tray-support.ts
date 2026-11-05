/**
 * Whether the desktop can show a tray icon, so close-to-tray has somewhere to go. Free of Electron imports; main.ts
 * hands in a real command runner and tests hand in fakes.
 *
 * Linux trays are StatusNotifierItems: they show only when a StatusNotifier host has registered
 * `org.kde.StatusNotifierWatcher` on the session bus (KDE, most other desktops, GNOME with the AppIndicator
 * extension). Stock GNOME has none, and an icon there would be invisible, so close must quit instead.
 */

export const STATUS_NOTIFIER_WATCHER = "org.kde.StatusNotifierWatcher";

/** Runs a command and resolves with its stdout; rejects if it can't be run or fails. */
export type RunCommand = (command: string, args: readonly string[]) => Promise<string>;

/** Two ways to ask the session bus whether the watcher's name has an owner: dbus-send (the dbus package), then gdbus (GLib). */
const PROBES: readonly { command: string; args: readonly string[]; yes: RegExp }[] = [
  {
    command: "dbus-send",
    args: [
      "--session",
      "--print-reply",
      "--dest=org.freedesktop.DBus",
      "/org/freedesktop/DBus",
      "org.freedesktop.DBus.NameHasOwner",
      `string:${STATUS_NOTIFIER_WATCHER}`,
    ],
    yes: /boolean true/,
  },
  {
    command: "gdbus",
    args: [
      "call",
      "--session",
      "--dest",
      "org.freedesktop.DBus",
      "--object-path",
      "/org/freedesktop/DBus",
      "--method",
      "org.freedesktop.DBus.NameHasOwner",
      STATUS_NOTIFIER_WATCHER,
    ],
    yes: /\(true,?\)/,
  },
];

/**
 * Windows always has a notification area; macOS uses the Dock, not a tray. On Linux the first probe that runs
 * decides; if none can run (no session bus, no tools), there is no tray.
 */
export async function hasTrayHost(platform: string, run: RunCommand): Promise<boolean> {
  if (platform === "win32") return true;
  if (platform !== "linux") return false;
  for (const probe of PROBES) {
    let out: string;
    try {
      out = await run(probe.command, probe.args);
    } catch {
      continue;
    }
    return probe.yes.test(out);
  }
  return false;
}
