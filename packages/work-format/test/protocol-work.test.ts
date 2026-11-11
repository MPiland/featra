import { describe, expect, it } from "vitest";
import { copyParams, normalizeCopyActionResult } from "../src/protocol-copy.ts";
import { parsePush, parseRequest, unwatchParams } from "../src/protocol.ts";

describe("the work methods and pushes (ADR 0016)", () => {
  it("knows the work methods", () => {
    for (const method of ["work.watch", "work.unwatch", "work.applyCopy", "work.discardCopy"]) {
      expect(parseRequest(JSON.stringify({ id: 1, method, params: {} }))).toEqual({ id: 1, method, params: {} });
    }
  });

  it("reads a push: no id, a known event, the watch it belongs to", () => {
    expect(parsePush('{"event":"work.list","watch":3,"data":{"epics":[]}}')).toEqual({
      event: "work.list",
      watch: 3,
      data: { epics: [] },
    });
    for (const text of [
      '{"id":1,"event":"work.list","watch":3}',
      '{"event":"other","watch":3}',
      '{"event":"work.list"}',
      '{"event":"work.list","watch":"3"}',
      "garbage",
    ]) {
      expect(parsePush(text), text).toBeNull();
    }
  });

  it("takes copy and unwatch params only when complete", () => {
    expect(copyParams({ dir: "/p", key: "main|a.md" })).toEqual({ dir: "/p", key: "main|a.md" });
    expect(copyParams({ dir: "/p" })).toBeNull();
    expect(copyParams({ dir: "/p", key: "" })).toBeNull();
    expect(unwatchParams({ watch: 2 })).toEqual({ watch: 2 });
    expect(unwatchParams({ watch: "2" })).toBeNull();
  });

  it("normalizes a copy action result", () => {
    expect(normalizeCopyActionResult({ ok: true, x: 1 })).toEqual({ ok: true });
    expect(normalizeCopyActionResult({ ok: false, error: "No." })).toEqual({ ok: false, error: "No." });
    expect(normalizeCopyActionResult(null)).toEqual({ ok: false, error: "Something went wrong." });
  });
});
