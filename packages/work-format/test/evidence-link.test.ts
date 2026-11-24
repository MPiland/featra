/**
 * STORY-72: how the app reads an evidence file back, on real work-format code. Pure: what a screenshot is, what the
 * socket may carry, and the notes shown when evidence can't be.
 */
import { describe, expect, it } from "vitest";
import { normalizeCardView } from "@featra/work-format/card-view";
import {
  EVIDENCE_COPY,
  EVIDENCE_OPENABLE,
  evidenceImageType,
  evidenceName,
  evidenceParams,
  normalizeEvidenceFile,
} from "@featra/work-format/evidence-link";

describe("AC1: which evidence files are screenshots", () => {
  it.each([
    ["shot.png", "image/png"],
    ["shot.JPG", "image/jpeg"],
    ["shot.jpeg", "image/jpeg"],
    ["shot.gif", "image/gif"],
    ["shot.webp", "image/webp"],
    ["shot.svg", null],
    ["notes.txt", null],
    ["png", null],
  ])("%s is %s", (name, mime) => {
    expect(evidenceImageType(`.featra/evidence/FEAT-1/STORY-2/${name}`)).toBe(mime);
  });

  it("names a file by the last part of its path", () => {
    expect(evidenceName(".featra/evidence/FEAT-1/STORY-2/run/out.log")).toBe("out.log");
  });

  it("keeps a criterion's evidence link through the socket, and drops one that isn't text", () => {
    const view = normalizeCardView({
      id: "STORY-2",
      acs: [
        { text: "Shown", evidence: ".featra/evidence/FEAT-1/STORY-2/a.png" },
        { text: "None", evidence: 3 },
      ],
    });
    expect(view?.acs[0]?.evidence).toBe(".featra/evidence/FEAT-1/STORY-2/a.png");
    expect(view?.acs[1]).not.toHaveProperty("evidence");
  });
});

describe("AC3: other files open with the OS only when they can't run", () => {
  it("opens documents and images, never programs or pages", () => {
    expect(EVIDENCE_OPENABLE).toEqual(expect.arrayContaining(["txt", "md", "log", "json", "pdf", "png"]));
    for (const ext of ["exe", "bat", "cmd", "sh", "js", "html", "lnk", "app", "ps1"]) {
      expect(EVIDENCE_OPENABLE).not.toContain(ext);
    }
  });
});

describe("AC4: what crosses the socket, read defensively", () => {
  it("keeps an image, a file and a problem as they are", () => {
    const image = { ok: true, kind: "image", name: "a.png", mime: "image/png", data: "iVBO" } as const;
    expect(normalizeEvidenceFile(image)).toEqual(image);
    expect(normalizeEvidenceFile({ ok: true, kind: "file", name: "a.txt" })).toEqual({
      ok: true,
      kind: "file",
      name: "a.txt",
    });
    expect(normalizeEvidenceFile({ ok: false, problem: "missing" })).toEqual({ ok: false, problem: "missing" });
  });

  it.each([
    ["nothing", null],
    [
      "an image of a type the app doesn't show",
      { ok: true, kind: "image", name: "a.svg", mime: "image/svg+xml", data: "x" },
    ],
    ["an image without bytes", { ok: true, kind: "image", name: "a.png", mime: "image/png", data: "" }],
    ["a file without a name", { ok: true, kind: "file", name: "" }],
    ["an unknown problem", { ok: false, problem: "gone" }],
  ])("reads %s as evidence that can't be opened", (_what, raw) => {
    expect(normalizeEvidenceFile(raw)).toEqual({ ok: false, problem: "unreadable" });
  });

  it("says why in a few words", () => {
    expect(EVIDENCE_COPY.missing).toBe("Evidence missing");
    expect(EVIDENCE_COPY.unreadable).toBe("Can't open evidence");
  });

  it("takes { dir, id, path } and nothing less", () => {
    expect(evidenceParams({ dir: "/p", id: "STORY-2", path: "a" })).toEqual({ dir: "/p", id: "STORY-2", path: "a" });
    expect(evidenceParams({ dir: "/p", id: "STORY-2" })).toBeNull();
    expect(evidenceParams({ dir: "/p", id: "", path: "a" })).toBeNull();
  });
});
