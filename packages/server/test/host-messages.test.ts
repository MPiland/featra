import { describe, expect, it } from "vitest";
import { parseServerMessage } from "../src/host-messages.ts";

/** STORY-67: the waiting count the server tells the host, as the host reads it. */
describe("the server's waiting message", () => {
  it("carries a whole count of 0 or more", () => {
    expect(parseServerMessage({ type: "waiting", count: 0 })).toEqual({ type: "waiting", count: 0 });
    expect(parseServerMessage({ type: "waiting", count: 3 })).toEqual({ type: "waiting", count: 3 });
  });

  it("is dropped with a count that isn't one", () => {
    for (const count of [-1, 1.5, Number.NaN, "2", undefined])
      expect(parseServerMessage({ type: "waiting", count })).toBeNull();
  });
});
