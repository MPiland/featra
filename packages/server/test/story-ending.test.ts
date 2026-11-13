/** STORY-12, STORY-58: one ending of a story at a time, and the session's refusals while it runs. */
import { describe, expect, it } from "vitest";
import { ABANDON_MESSAGES, MERGE_MESSAGES } from "@featra/work-format";
import { createStoryEnding } from "../src/story-ending.ts";

describe("the story-ending gate", () => {
  it("refuses a merge while the story is abandoned, and an abandon while it merges", async () => {
    const ending = createStoryEnding();
    const seen: unknown[] = [];
    await ending.hold("/p", "STORY-1", "abandon", async () => {
      seen.push(ending.endingOf("/p", "STORY-1"), ending.busy("/p", "STORY-1"), ending.busy("/p", "STORY-2"));
      await ending.hold("/p", "STORY-1", "merge", async () => {}).catch((e: Error) => seen.push(e.message));
    });
    await ending.hold("/p", "STORY-1", "merge", async () => {
      await ending.hold("/p", "STORY-1", "abandon", async () => {}).catch((e: Error) => seen.push(e.message));
      await ending.hold("/p", "STORY-1", "merge", async () => {}).catch((e: Error) => seen.push(e.message));
    });
    expect(seen).toEqual([
      "abandon",
      ABANDON_MESSAGES.busy("STORY-1"),
      null,
      ABANDON_MESSAGES.busy("STORY-1"),
      MERGE_MESSAGES.busy("STORY-1"),
      MERGE_MESSAGES.merging("STORY-1"),
    ]);
    expect(ending.busy("/p", "STORY-1")).toBeNull();
  });

  it("lets the story end again after a failed ending", async () => {
    const ending = createStoryEnding();
    await expect(
      ending.hold("/p", "STORY-1", "abandon", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    await expect(ending.hold("/p", "STORY-1", "abandon", async () => 1)).resolves.toBe(1);
  });
});
