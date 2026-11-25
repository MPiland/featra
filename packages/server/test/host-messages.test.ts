import { describe, expect, it } from "vitest";
import { parseHostMessage, parseServerMessage } from "../src/host-messages.ts";

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

/** STORY-25: the server asks the host to capture a dev server's page, and the host answers with it or why not. */
describe("the capture messages", () => {
  it("ask with a numbered URL and the dev server's origin, which the host checks the URL against", () => {
    const origin = "http://localhost:5173";
    expect(parseServerMessage({ type: "capture", seq: 4, url: "http://localhost:5173/settings", origin })).toEqual({
      type: "capture",
      seq: 4,
      url: "http://localhost:5173/settings",
      origin,
    });
    expect(parseServerMessage({ type: "capture", seq: 4, url: "http://localhost:5173/settings" })).toBeNull();
    expect(parseServerMessage({ type: "capture", seq: 1.5, url: "http://localhost:5173", origin })).toBeNull();
    expect(parseServerMessage({ type: "capture", seq: 1, origin })).toBeNull();
  });

  it("answer with a png or jpg, or why it wasn't captured", () => {
    expect(parseHostMessage({ type: "captured", seq: 4, data: "iVBO", ext: "png" })).toEqual({
      type: "captured",
      seq: 4,
      data: "iVBO",
      ext: "png",
    });
    expect(parseHostMessage({ type: "captured", seq: 4, error: "The page took too long to load." })).toEqual({
      type: "captured",
      seq: 4,
      error: "The page took too long to load.",
    });
    for (const bad of [
      { type: "captured", seq: 4, data: "iVBO", ext: "gif" },
      { type: "captured", seq: 4, data: "", ext: "png" },
      { type: "captured", seq: "4", error: "x" },
      { type: "captured", seq: 4 },
    ])
      expect(parseHostMessage(bad)).toBeNull();
  });
});
