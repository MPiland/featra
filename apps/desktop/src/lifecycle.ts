/**
 * What closing, reopening and quitting the window do. Kept free of Electron imports: main.ts hands in the real
 * window, tray and notification, and tests hand in fakes of those OS surfaces.
 */

import { NO_TRAY_REASON, type CloseToTraySupport } from "@featra/client/bridge";

export const TRAY_NOTICE = "Featra is still running in the system tray";

/** The parts of a BrowserWindow the lifecycle uses. */
export interface ManagedWindow {
  on(event: "close", listener: (e: { preventDefault(): void }) => void): unknown;
  hide(): void;
  show(): void;
  focus(): void;
  restore(): void;
  isMinimized(): boolean;
}

export interface LifecycleOptions {
  platform: string;
  /**
   * Close hides the window and the app keeps running (agent sessions carry on): Settings > General > Close button,
   * "Keep running in the tray". Off: closing the last window quits. `setCloseToTray` changes it while running.
   */
  closeToTray: boolean;
  /**
   * Whether the desktop shows tray icons (see tray-support.ts). Without one (stock GNOME) a hidden window could not be
   * brought back, so close quits instead. Ignored on macOS, where the Dock reopens the window.
   */
  trayAvailable: boolean;
  /** Whether the one-time tray notice was already shown in an earlier run. */
  noticeShown: boolean;
  /** Shows an OS notification. */
  notify(message: string): void;
  /** Remembers that the notice was shown. */
  rememberNotice(): void;
  /** Exits the app (Electron's `app.quit`). */
  exit(): void;
}

export interface TrayMenuItem {
  label: string;
  click(): void;
}

export interface Lifecycle {
  /**
   * A tray icon is shown on Windows, and on Linux when it has a tray, while close keeps the app running; macOS keeps
   * the app in the Dock instead.
   */
  readonly usesTray: boolean;
  /** Whether close can keep the app running at all: false on a Linux desktop without a tray. */
  readonly canCloseToTray: boolean;
  /** Close hides the window (to the tray or the Dock) instead of quitting. */
  readonly closeHides: boolean;
  readonly quitting: boolean;
  /** Takes over the window's close button and Alt+F4. */
  manage(win: ManagedWindow): void;
  /** Shows, un-minimises and focuses the window: tray click, Dock click, second launch. */
  reveal(win: ManagedWindow): void;
  /** Quits for real (File > Exit, the tray's Exit). */
  quit(): void;
  /** The Close button setting changed: applies to the next close, no restart needed. */
  setCloseToTray(on: boolean): void;
  /** Electron's `before-quit`: any quit (Cmd+Q, OS shutdown, `app.quit`) closes windows for real from here on. */
  onBeforeQuit(): void;
  trayMenu(win: ManagedWindow): TrayMenuItem[];
}

export function createLifecycle(o: LifecycleOptions): Lifecycle {
  let quitting = false;
  let noticeShown = o.noticeShown;
  let closeToTray = o.closeToTray;
  const mac = o.platform === "darwin";
  const canCloseToTray = mac || o.trayAvailable;

  const lifecycle: Lifecycle = {
    get usesTray() {
      return closeToTray && !mac && o.trayAvailable;
    },
    get closeHides() {
      return closeToTray && canCloseToTray;
    },
    canCloseToTray,
    get quitting() {
      return quitting;
    },
    manage(win) {
      win.on("close", (e) => {
        if (quitting || !lifecycle.closeHides) return;
        e.preventDefault();
        win.hide();
        if (lifecycle.usesTray && !noticeShown) {
          noticeShown = true;
          o.notify(TRAY_NOTICE);
          o.rememberNotice();
        }
      });
    },
    reveal(win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    },
    quit() {
      quitting = true;
      o.exit();
    },
    setCloseToTray(on) {
      closeToTray = on;
    },
    onBeforeQuit() {
      quitting = true;
    },
    trayMenu: (win) => [
      { label: "Show Featra", click: () => lifecycle.reveal(win) },
      { label: "Exit", click: () => lifecycle.quit() },
    ],
  };
  return lifecycle;
}

/** What Settings > General may offer for the close button on this desktop. */
export function closeToTraySupport(lifecycle: Pick<Lifecycle, "canCloseToTray">, platform: string): CloseToTraySupport {
  if (!lifecycle.canCloseToTray) return { available: false, reason: NO_TRAY_REASON };
  return { available: true, place: platform === "darwin" ? "dock" : "tray" };
}
