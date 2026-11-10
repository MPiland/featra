import { describe, expect, it } from "vitest";
import {
  chatConfigureParams,
  foldChat,
  formatTokens,
  meterPercent,
  meterText,
  normalizeChatEvent,
  normalizeControlState,
} from "../src/index.ts";

describe("the context meter's text", () => {
  it.each([
    [842, "842"],
    [1000, "1k"],
    [12_345, "12.3k"],
    [200_000, "200k"],
    [1_000_000, "1M"],
    [1_500_000, "1.5M"],
  ])("writes %i as %s", (n, text) => expect(formatTokens(n)).toBe(text));

  it("shows used of the window, or only what was used when the provider gave no window", () => {
    expect(meterText({ used: 12_345, window: 200_000 })).toBe("12.3k / 200k tokens");
    expect(meterText({ used: 12_345, window: null })).toBe("12.3k tokens");
  });

  it("gives a percent only with a window, and never past 100", () => {
    expect(meterPercent({ used: 50_000, window: 200_000 })).toBe(25);
    expect(meterPercent({ used: 250_000, window: 200_000 })).toBe(100);
    expect(meterPercent({ used: 5, window: null })).toBeNull();
  });
});

describe("usage events", () => {
  it("fold to the chat's latest usage", () => {
    const state = foldChat([
      { type: "usage", used: 10, window: 100 },
      { type: "usage", used: 20, window: null },
    ]);
    expect(state.usage).toEqual({ used: 20, window: null });
  });

  it("are read from the socket, dropping a bad window and refusing bad counts", () => {
    expect(normalizeChatEvent({ type: "usage", used: 5, window: 0 })).toEqual({ type: "usage", used: 5, window: null });
    expect(normalizeChatEvent({ type: "usage", used: 5, window: 200 })).toEqual({
      type: "usage",
      used: 5,
      window: 200,
    });
    expect(normalizeChatEvent({ type: "usage", used: -1, window: 200 })).toBeNull();
    expect(normalizeChatEvent({ type: "usage", window: 200 })).toBeNull();
  });
});

describe("composer params and state", () => {
  it("chat.configure takes an id and at least one text setting", () => {
    expect(chatConfigureParams({ id: "c", change: { model: "opus", mode: "plan" } })).toEqual({
      id: "c",
      change: { model: "opus", mode: "plan" },
    });
    expect(chatConfigureParams({ id: "c", change: {} })).toBeNull();
    expect(chatConfigureParams({ id: "c", change: { model: 3 } })).toBeNull();
    expect(chatConfigureParams({ id: "c" })).toBeNull();
  });

  it("reads the controls and settings the server answers, and refuses an answer without them", () => {
    const raw = {
      controls: {
        models: [{ value: "m", label: "m" }, { nope: 1 }],
        efforts: [],
        modes: [{ value: "x", label: "x", fullAccess: true }],
      },
      settings: { role: "r", model: "m", effort: "", mode: "x" },
    };
    expect(normalizeControlState(raw)).toEqual({
      controls: {
        models: [{ value: "m", label: "m" }],
        efforts: [],
        modes: [{ value: "x", label: "x", fullAccess: true }],
      },
      settings: { role: "r", model: "m", effort: "", mode: "x" },
    });
    expect(normalizeControlState({ controls: {} })).toBeNull();
  });
});
