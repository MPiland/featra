/** STORY-68 (review nit): the clipboard IPC takes a request's command, and nothing longer or other than text. */
import { describe, expect, it } from "vitest";
import { ACTION_LIMITS } from "@featra/work-format";
import { copyable } from "../src/copy-text.ts";

describe("copyable", () => {
  it("takes text up to a command's length, as given", () => {
    expect(copyable("gh auth login")).toBe("gh auth login");
    expect(copyable("a\n\tb")).toBe("a\n\tb");
    expect(copyable("x".repeat(ACTION_LIMITS.command))).toBe("x".repeat(ACTION_LIMITS.command));
  });

  it("refuses text longer than a command may be, and anything that isn't text", () => {
    expect(copyable("x".repeat(ACTION_LIMITS.command + 1))).toBeNull();
    expect(copyable(undefined)).toBeNull();
    expect(copyable(42)).toBeNull();
    expect(copyable({ toString: () => "gh auth login" })).toBeNull();
  });
});
