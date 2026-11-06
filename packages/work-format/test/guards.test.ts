import { describe, expect, it } from "vitest";
import { errorMessage, isOneOf, isRecord, toText } from "../src/index.ts";

describe("guards", () => {
  it("isRecord accepts plain objects only", () => {
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord([])).toBe(false);
    expect(isRecord("x")).toBe(false);
  });

  it("isOneOf accepts only the listed strings", () => {
    const sizes = ["s", "m"] as const;
    expect(isOneOf(sizes, "m")).toBe(true);
    expect(isOneOf(sizes, "l")).toBe(false);
    expect(isOneOf(sizes, 1)).toBe(false);
  });

  it("toText writes objects as JSON and scalars as themselves", () => {
    expect(toText("a")).toBe("a");
    expect(toText(3)).toBe("3");
    expect(toText(false)).toBe("false");
    expect(toText(null)).toBe("null");
    expect(toText(undefined)).toBe("undefined");
    expect(toText({ a: 1 })).toBe('{"a":1}');
  });

  it("errorMessage reads an Error's message or the thrown value", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage("plain")).toBe("plain");
  });
});
