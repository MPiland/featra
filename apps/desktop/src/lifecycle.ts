/**
 * What closing, reopening and quitting the window do. Kept free of Electron imports: main.ts hands in the real
 * window, tray and notification, and tests hand in fakes of those OS surfaces.
 */

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
   * Close hides the window and the app keeps running (agent sessions carry on). STORY-20 wires this to Settings.
   * Off: closing the last window quits, as before.
   */
  closeToTray: boolean;
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
  /** A tray icon is shown on Windows and Linux; macOS keeps the app in the Dock instead. */
  readonly usesTray: boolean;
  readonly quitting: boolean;
  /** Takes over the window's close button and Alt+F4. */
  manage(win: ManagedWindow): void;
  /** Shows, un-minimises and focuses the window: tray click, Dock click, second launch. */
  reveal(win: ManagedWindow): void;
  /** Quits for real (File > Quit, the tray's Quit). */
  quit(): void;
  /** Electron's `before-quit`: any quit (Cmd+Q, OS shutdown, `app.quit`) closes windows for real from here on. */
  onBeforeQuit(): void;
  trayMenu(win: ManagedWindow): TrayMenuItem[];
}

export function createLifecycle(o: LifecycleOptions): Lifecycle {
  let quitting = false;
  let noticeShown = o.noticeShown;
  const usesTray = o.closeToTray && o.platform !== "darwin";

  const lifecycle: Lifecycle = {
    usesTray,
    get quitting() {
      return quitting;
    },
    manage(win) {
      win.on("close", (e) => {
        if (quitting || !o.closeToTray) return;
        e.preventDefault();
        win.hide();
        if (usesTray && !noticeShown) {
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
    onBeforeQuit() {
      quitting = true;
    },
    trayMenu: (win) => [
      { label: "Show Featra", click: () => lifecycle.reveal(win) },
      { label: "Quit Featra", click: () => lifecycle.quit() },
    ],
  };
  return lifecycle;
}
