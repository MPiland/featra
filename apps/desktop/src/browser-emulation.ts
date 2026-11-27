import type { BrowserLayout } from "@featra/client/bridge";

/** What emulation needs of a page's contents: Electron's `webContents.debugger`, the Chrome DevTools Protocol. */
export interface Debugger {
  isAttached: () => boolean;
  attach: (protocolVersion?: string) => void;
  sendCommand: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
}

/** The device a page is shown as, and the window's zoom it is drawn at. */
export type Emulated = BrowserLayout["device"];

/**
 * The DevTools Protocol commands that show a page as `device` (STORY-74, ADR 0047), as Chrome's device toolbar does:
 * the page sees the device's viewport, screen and pixel ratio, and touch when it is a phone or tablet, and is drawn at
 * `scale` (to fit the pane) times the window's `zoom` (the view is sized in the window's pixels). None: the page fills
 * the view at its own size.
 */
export function emulationCommands(device: Emulated, zoom: number): [string, Record<string, unknown>][] {
  if (!device) {
    return [
      ["Emulation.clearDeviceMetricsOverride", {}],
      ["Emulation.setTouchEmulationEnabled", { enabled: false }],
      ["Emulation.setEmitTouchEventsForMouse", { enabled: false }],
    ];
  }
  const { width, height, dpr, mobile, scale } = device;
  return [
    [
      "Emulation.setDeviceMetricsOverride",
      {
        width,
        height,
        deviceScaleFactor: dpr,
        mobile,
        scale: scale * zoom,
        screenWidth: width,
        screenHeight: height,
      },
    ],
    ["Emulation.setTouchEmulationEnabled", mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false }],
    ["Emulation.setEmitTouchEventsForMouse", mobile ? { enabled: true, configuration: "mobile" } : { enabled: false }],
  ];
}

/**
 * Applies emulation to one page, one change at a time and in order: a later layout never lands before an earlier one.
 * A page whose contents went away meanwhile is left alone.
 */
export function createEmulation(dbg: Debugger, log: (message: string) => void) {
  let queue: Promise<void> = Promise.resolve();
  let last = "";
  return {
    /** Shows the page as `device` at `zoom`; `again` re-sends it after a navigation, as a new document may need. */
    apply(device: Emulated, zoom: number, again = false): Promise<void> {
      const commands = emulationCommands(device, zoom);
      const key = JSON.stringify(commands);
      if (key === last && !again) return queue;
      last = key;
      queue = queue.then(async () => {
        try {
          if (!dbg.isAttached()) dbg.attach("1.3");
          for (const [method, params] of commands) await dbg.sendCommand(method, params);
        } catch (err) {
          log(`Browser pane emulation failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      });
      return queue;
    },
  };
}
