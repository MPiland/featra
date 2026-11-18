import { APP_SHORTCUTS, matchShortcut, shortcutLabel, type KeyInput } from "@featra/client/shortcuts";
import { describe, expect, it } from "vitest";
import { keysOf } from "../e2e/keys.ts";

/** The key event a Playwright press of `keys` ("Shift+Meta+N", say) gives the page. */
function pressed(keys: string): KeyInput {
  const parts = keys.split(/\+(?=.)/);
  const key = parts.at(-1)!;
  const mods = new Set(parts.slice(0, -1));
  return {
    key,
    code: /^[a-z]$/i.test(key) ? `Key${key.toUpperCase()}` : "",
    ctrlKey: mods.has("Control"),
    metaKey: mods.has("Meta"),
    altKey: mods.has("Alt"),
    shiftKey: mods.has("Shift"),
  };
}

describe("the e2e harness presses each platform's own shortcut (STORY-63)", () => {
  it.each(["win32", "linux", "darwin"])(
    "presses what the menu shows on %s, and the app takes it as that shortcut",
    (os) => {
      for (const id of APP_SHORTCUTS) {
        const keys = keysOf(shortcutLabel(id, os)!);
        expect({ id, keys, matched: matchShortcut(pressed(keys), os) }).toEqual({ id, keys, matched: id });
      }
    },
  );

  it("names the keys as Playwright does", () => {
    expect(keysOf("Ctrl+Shift+W")).toBe("Control+Shift+W");
    expect(keysOf("Ctrl+-")).toBe("Control+-");
    expect(keysOf("Alt+Left")).toBe("Alt+ArrowLeft");
    expect(keysOf("F5")).toBe("F5");
    expect(keysOf("⌘W")).toBe("Meta+W");
    expect(keysOf("⇧⌘Z")).toBe("Shift+Meta+Z");
    expect(keysOf("⌃⌘F")).toBe("Control+Meta+F");
    expect(keysOf("⌘Q")).toBe("Meta+Q");
  });
});
