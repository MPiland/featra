import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { clientIndex } from "../src/client-path.ts";

// STORY-64: the window loads the workspace's client build from source, and the app folder's own copy when installed.

describe("the client the window loads (STORY-64)", () => {
  it("is the client package's build when run from source", () => {
    const desktop = join(import.meta.dirname, "..");
    expect(clientIndex({ appPath: desktop, packaged: false })).toBe(
      join(desktop, "..", "..", "packages", "client", "dist", "index.html"),
    );
  });

  it("is the app folder's own copy when installed", () => {
    const app = join("/Applications", "Featra.app", "Contents", "Resources", "app");
    expect(clientIndex({ appPath: app, packaged: true })).toBe(join(app, "client", "index.html"));
  });
});
