/**
 * STORY-25: the dev pages Electron's Chromium loads (dev-pages.ts, ADR 0044). Only a page on the story's dev server's
 * own origin is captured or previewed; no navigation or server redirect takes a dev page off it, and the app's own
 * window goes nowhere; and dev pages run in a session of their own that grants no permission. Fakes only Electron:
 * its windows, their contents and the session, which record what Featra asked of them.
 */
import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

interface Moved {
  prevented: boolean;
  preventDefault: () => void;
}
const moved = (): Moved => ({
  prevented: false,
  preventDefault() {
    this.prevented = true;
  },
});

/** A window's contents: what Electron emits, and what it captures. */
class FakeContents extends EventEmitter {
  setWindowOpenHandler = vi.fn<(handler: () => { action: string }) => void>();
  capturePage = async () => ({ toPNG: () => Buffer.from("png"), toJPEG: () => Buffer.from("jpg") });
}

const platform = {
  created: [] as Record<string, unknown>[],
  contents: [] as FakeContents[],
  /** Where the server redirects the next page load, and whether each redirect was stopped. */
  redirectTo: null as string | null,
  redirects: [] as { to: string; stopped: boolean }[],
  partitions: [] as string[],
  requestHandler: null as null | ((contents: unknown, permission: string, decide: (ok: boolean) => void) => void),
  checkHandler: null as null | ((...args: unknown[]) => boolean),
};

vi.mock("electron", () => ({
  BrowserWindow: class {
    webContents = new FakeContents();
    constructor(options: Record<string, unknown>) {
      platform.created.push(options);
      platform.contents.push(this.webContents);
      // As the app does for every new window, on Electron's `web-contents-created`.
      guard(this.webContents);
    }
    on() {}
    isDestroyed() {
      return false;
    }
    destroy() {}
    async loadURL() {
      if (!platform.redirectTo) return;
      const e = moved();
      this.webContents.emit("will-redirect", e, platform.redirectTo);
      platform.redirects.push({ to: platform.redirectTo, stopped: e.prevented });
      if (e.prevented) throw new Error("ERR_ABORTED");
    }
  },
  session: {
    fromPartition(name: string) {
      platform.partitions.push(name);
      return {
        setPermissionRequestHandler: (h: typeof platform.requestHandler) => {
          platform.requestHandler = h;
        },
        setPermissionCheckHandler: (h: typeof platform.checkHandler) => {
          platform.checkHandler = h;
        },
      };
    },
  },
}));

const pages = await import("../src/dev-pages.ts");
const guard = (contents: FakeContents) => pages.guardContents(contents as never);

const ORIGIN = "http://localhost:5173";

describe("a dev server's page on this computer", () => {
  it("has the origin of an http page on localhost or 127.0.0.1", () => {
    expect(pages.localOrigin("http://localhost:5173/settings?x=1")).toBe(ORIGIN);
    expect(pages.localOrigin("http://127.0.0.1:3000")).toBe("http://127.0.0.1:3000");
  });

  it.each([
    "https://localhost:5173/",
    "http://example.com:5173/",
    "http://localhost:5173@127.0.0.1:8080/",
    "http://user:pw@localhost:5173/",
    "file:///etc/passwd",
    "not a url",
    42,
  ])("isn't %s", (url) => {
    expect(pages.localOrigin(url)).toBeNull();
  });
});

describe("capturing a page", () => {
  it.each(["http://localhost:5173@127.0.0.1:8080/", "http://127.0.0.1:8080/", "http://localhost:5174/"])(
    "never loads %s, off the dev server's origin",
    async (url) => {
      const before = platform.created.length;
      expect(await pages.capturePage(url, ORIGIN)).toEqual({
        error: "Only a page of the story's dev server is captured.",
      });
      expect(platform.created).toHaveLength(before);
    },
  );

  it("captures a page on the origin", async () => {
    expect(await pages.capturePage(`${ORIGIN}/settings`, ORIGIN)).toEqual({
      data: Buffer.from("png").toString("base64"),
      ext: "png",
    });
  });

  it("stops a server's redirect off the origin, and the page isn't captured", async () => {
    platform.redirectTo = "http://127.0.0.1:8080/secret";
    try {
      const shot = await pages.capturePage(`${ORIGIN}/settings`, ORIGIN);
      expect(platform.redirects.at(-1)).toEqual({ to: "http://127.0.0.1:8080/secret", stopped: true });
      expect(shot).toEqual({ error: "ERR_ABORTED" });
    } finally {
      platform.redirectTo = null;
    }
  });

  it("follows a redirect within the origin", async () => {
    platform.redirectTo = `${ORIGIN}/login`;
    try {
      expect(await pages.capturePage(`${ORIGIN}/settings`, ORIGIN)).toMatchObject({ ext: "png" });
      expect(platform.redirects.at(-1)).toEqual({ to: `${ORIGIN}/login`, stopped: false });
    } finally {
      platform.redirectTo = null;
    }
  });
});

/** Moves `contents` to `url` as Electron would emit it; whether Featra stopped it. */
function go(contents: FakeContents, event: "will-navigate" | "will-redirect", url: string) {
  const e = moved();
  contents.emit(event, e, url);
  return e.prevented;
}

describe("where a window may go", () => {
  it("lets a Preview window move within its dev server only, by a link or a redirect", () => {
    pages.openPreview(`${ORIGIN}/`, "Preview STORY-1");
    const preview = platform.contents.at(-1)!;
    for (const event of ["will-navigate", "will-redirect"] as const) {
      expect(go(preview, event, `${ORIGIN}/other`)).toBe(false);
      expect(go(preview, event, "http://127.0.0.1:8080/")).toBe(true);
      expect(go(preview, event, "https://example.com/")).toBe(true);
    }
    expect(pages.mayNavigate(preview as never, `${ORIGIN}/x`)).toBe(true);
    expect(pages.mayNavigate(preview as never, "http://localhost:5174/")).toBe(false);
  });

  it("keeps the app's own window where it is, and opens no pop-ups", () => {
    const app = new FakeContents();
    guard(app);
    expect(go(app, "will-navigate", `${ORIGIN}/`)).toBe(true);
    expect(go(app, "will-redirect", "https://example.com/")).toBe(true);
    expect(pages.mayNavigate(app as never, `${ORIGIN}/`)).toBe(false);
    expect(app.setWindowOpenHandler.mock.calls[0]?.[0]()).toEqual({ action: "deny" });
  });
});

describe("the dev pages' session", () => {
  it("is their own, and refuses every permission a page asks for", () => {
    pages.openPreview(`${ORIGIN}/`, "Preview STORY-2");
    expect(platform.created.at(-1)).toMatchObject({
      webPreferences: { sandbox: true, contextIsolation: true, partition: pages.DEV_PARTITION },
    });
    expect(platform.partitions).toEqual([pages.DEV_PARTITION]);
    const decided: boolean[] = [];
    for (const permission of ["media", "notifications", "geolocation", "clipboard-read"])
      platform.requestHandler?.({}, permission, (ok) => decided.push(ok));
    expect(decided).toEqual([false, false, false, false]);
    expect(platform.checkHandler?.({}, "media")).toBe(false);
  });
});
