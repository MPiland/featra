import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { createLifecycle, TRAY_NOTICE, type LifecycleOptions, type ManagedWindow } from "../src/lifecycle.ts";

/** Fakes only the OS window: records what the lifecycle asks of it. */
class FakeWindow extends EventEmitter implements ManagedWindow {
  visible = true;
  minimized = false;
  focused = false;
  hide() {
    this.visible = false;
    this.focused = false;
  }
  show() {
    this.visible = true;
  }
  focus() {
    this.focused = true;
  }
  restore() {
    this.minimized = false;
  }
  isMinimized() {
    return this.minimized;
  }
  /** What the OS does on the close button or Alt+F4: emit `close`, then close unless a listener prevented it. */
  tryClose(): "closed" | "kept" {
    let prevented = false;
    this.emit("close", { preventDefault: () => (prevented = true) });
    if (!prevented) this.visible = false;
    return prevented ? "kept" : "closed";
  }
}

function setup(over: Partial<LifecycleOptions> = {}) {
  const log = { notices: [] as string[], remembered: 0, exits: 0 };
  const lc = createLifecycle({
    platform: "win32",
    closeToTray: true,
    noticeShown: false,
    notify: (m) => void log.notices.push(m),
    rememberNotice: () => void log.remembered++,
    exit: () => void log.exits++,
    ...over,
  });
  const win = new FakeWindow();
  lc.manage(win);
  return { lc, win, log };
}

describe("AC6: close to tray", () => {
  it("close hides the window instead of quitting", () => {
    const { win, log, lc } = setup();
    expect(win.tryClose()).toBe("kept");
    expect(win.visible).toBe(false);
    expect(log.exits).toBe(0);
    expect(lc.usesTray).toBe(true);
  });

  it("shows the tray notice on the first close only, and remembers it", () => {
    const { win, log } = setup();
    win.tryClose();
    win.show();
    win.tryClose();
    expect(log.notices).toEqual([TRAY_NOTICE]);
    expect(TRAY_NOTICE).toBe("Featra is still running in the system tray");
    expect(log.remembered).toBe(1);
  });

  it("does not show the notice again when an earlier run already showed it", () => {
    const { win, log } = setup({ noticeShown: true });
    win.tryClose();
    expect(log.notices).toEqual([]);
    expect(log.remembered).toBe(0);
  });

  it("the tray's Show Featra restores, shows and focuses the window", () => {
    const { lc, win } = setup();
    win.tryClose();
    win.minimized = true;
    const items = lc.trayMenu(win);
    expect(items.map((i) => i.label)).toEqual(["Show Featra", "Quit Featra"]);
    items[0]!.click();
    expect(win).toMatchObject({ visible: true, minimized: false, focused: true });
  });

  it("Quit (menu or tray) exits, and the window then closes for real", () => {
    const { lc, win, log } = setup();
    lc.trayMenu(win)[1]!.click();
    expect(log.exits).toBe(1);
    expect(lc.quitting).toBe(true);
    expect(win.tryClose()).toBe("closed");

    const menu = setup();
    menu.lc.quit(); // File > Quit goes through the same call
    expect(menu.log.exits).toBe(1);
    expect(menu.win.tryClose()).toBe("closed");
  });

  it("any other quit (OS shutdown, Cmd+Q) is not caught by close-to-tray", () => {
    const { lc, win, log } = setup();
    lc.onBeforeQuit();
    expect(win.tryClose()).toBe("closed");
    expect(log.notices).toEqual([]);
  });

  it("with the flag off, close closes the window and there is no tray", () => {
    const { lc, win, log } = setup({ closeToTray: false });
    expect(lc.usesTray).toBe(false);
    expect(win.tryClose()).toBe("closed");
    expect(log.notices).toEqual([]);
  });

  it("macOS: close hides the window, no tray icon and no tray notice; reveal (Dock click) brings it back", () => {
    const { lc, win, log } = setup({ platform: "darwin" });
    expect(lc.usesTray).toBe(false);
    expect(win.tryClose()).toBe("kept");
    expect(win.visible).toBe(false);
    expect(log.notices).toEqual([]);
    lc.reveal(win);
    expect(win).toMatchObject({ visible: true, focused: true });
  });
});
