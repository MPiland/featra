import { describe, expect, it } from "vitest";
import { hasTrayHost, STATUS_NOTIFIER_WATCHER, type RunCommand } from "../src/tray-support.ts";

/** Fakes only the OS commands: each answers as the real tool prints, or fails as a missing tool does. */
function bus(answers: Record<string, string | Error>) {
  const ran: string[] = [];
  const run: RunCommand = async (command, args) => {
    ran.push(`${command} ${args.join(" ")}`);
    const a = answers[command] ?? new Error(`spawn ${command} ENOENT`);
    if (a instanceof Error) throw a;
    return a;
  };
  return { run, ran };
}

const DBUS_SEND_TRUE =
  "method return time=1.0 sender=org.freedesktop.DBus -> destination=:1.9 serial=3 reply_serial=2\n   boolean true\n";
const DBUS_SEND_FALSE = DBUS_SEND_TRUE.replace("true", "false");

describe("AC7: Linux has a tray only when a StatusNotifier host is on the session bus", () => {
  it("asks the session bus whether org.kde.StatusNotifierWatcher has an owner", async () => {
    const { run, ran } = bus({ "dbus-send": DBUS_SEND_TRUE });
    expect(await hasTrayHost("linux", run)).toBe(true);
    expect(ran).toEqual([
      `dbus-send --session --print-reply --dest=org.freedesktop.DBus /org/freedesktop/DBus org.freedesktop.DBus.NameHasOwner string:${STATUS_NOTIFIER_WATCHER}`,
    ]);
  });

  it("no watcher (stock GNOME) means no tray", async () => {
    expect(await hasTrayHost("linux", bus({ "dbus-send": DBUS_SEND_FALSE }).run)).toBe(false);
  });

  it("falls back to gdbus when dbus-send is missing", async () => {
    expect(await hasTrayHost("linux", bus({ gdbus: "(true,)\n" }).run)).toBe(true);
    expect(await hasTrayHost("linux", bus({ gdbus: "(false,)\n" }).run)).toBe(false);
  });

  it("no session bus or no tools means no tray, so close quits rather than hiding the window for good", async () => {
    expect(await hasTrayHost("linux", bus({}).run)).toBe(false);
  });

  it("Windows always has a tray and macOS never uses one, without asking anything", async () => {
    const { run, ran } = bus({});
    expect(await hasTrayHost("win32", run)).toBe(true);
    expect(await hasTrayHost("darwin", run)).toBe(false);
    expect(ran).toEqual([]);
  });
});
