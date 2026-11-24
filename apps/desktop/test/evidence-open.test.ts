/**
 * STORY-72 AC3: the page asks the main process to open an evidence file, and only the server's copy in the data
 * folder's evidence folder is given to the OS: a document or image opened, anything else shown in its folder.
 */
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EVIDENCE_OPEN_DIR } from "@featra/work-format/evidence-link";
import { evidenceOpening, openEvidenceFile, type EvidenceShell } from "../src/evidence-open.ts";

let data: string;
let copies: string;
const at = (...parts: string[]) => join(copies, ...parts);

beforeAll(async () => {
  data = await mkdtemp(join(tmpdir(), "featra-desktop-"));
  copies = join(data, EVIDENCE_OPEN_DIR);
  await mkdir(at("a1"), { recursive: true });
  await writeFile(at("a1", "notes.txt"), "ok");
  await writeFile(at("a1", "run.exe"), "MZ");
  await writeFile(at("a1", "page.html"), "<p>");
  await writeFile(join(data, "outside.txt"), "no");
});
afterAll(() => rm(data, { recursive: true, force: true }));

describe("evidenceOpening", () => {
  it("opens a document copied into the evidence folder", async () => {
    expect(await evidenceOpening(data, at("a1", "notes.txt"))).toMatchObject({ how: "open" });
  });

  it("shows a program or a page in its folder rather than run it", async () => {
    expect(await evidenceOpening(data, at("a1", "run.exe"))).toMatchObject({ how: "show" });
    expect(await evidenceOpening(data, at("a1", "page.html"))).toMatchObject({ how: "show" });
  });

  it.each([
    ["a file outside the evidence folder", () => join(data, "outside.txt")],
    ["a path that climbs out of it", () => at("a1", "..", "..", "outside.txt")],
    // Written by hand, as the page could send it: path.join would have taken the `..` out already.
    ["a raw path that climbs out of it", () => `${copies}/a1/../../outside.txt`],
    ["the folder itself", () => copies],
    ["a folder in it", () => at("a1")],
    ["a file that isn't there", () => at("a1", "gone.txt")],
    ["a relative path", () => "notes.txt"],
  ])("refuses %s", async (_what, file) => {
    expect(await evidenceOpening(data, file())).toBeNull();
  });

  it("refuses anything that isn't a path", async () => {
    expect(await evidenceOpening(data, 42)).toBeNull();
    expect(await evidenceOpening(data, null)).toBeNull();
  });

  it("refuses a link in the evidence folder that leads out of it", async ({ skip }) => {
    try {
      await symlink(join(data, "outside.txt"), at("a1", "link.txt"), "file");
    } catch {
      skip("this machine can't make symbolic links");
    }
    expect(await evidenceOpening(data, at("a1", "link.txt"))).toBeNull();
  });
});

/** The OS side, recording each call by how it was made. */
function recording() {
  const calls: string[] = [];
  const os: EvidenceShell = {
    openPath: async (file) => (calls.push(`open:${file}`), ""),
    showItemInFolder: (file) => void calls.push(`show:${file}`),
  };
  return { os, calls };
}

describe("openEvidenceFile", () => {
  it("shows a program in its folder and never opens it", async () => {
    const { os, calls } = recording();
    const opening = await openEvidenceFile(data, at("a1", "run.exe"), os, () => {});
    expect(calls).toEqual([`show:${opening?.file}`]);
    expect(calls.some((c) => c.startsWith("open:"))).toBe(false);
  });

  it("opens a document with its app", async () => {
    const { os, calls } = recording();
    const opening = await openEvidenceFile(data, at("a1", "notes.txt"), os, () => {});
    expect(calls).toEqual([`open:${opening?.file}`]);
  });

  it("gives the OS nothing for a path that isn't a copy, and says so in the log", async () => {
    const { os, calls } = recording();
    const logged: string[] = [];
    expect(await openEvidenceFile(data, join(data, "outside.txt"), os, (m) => logged.push(m))).toBeNull();
    expect(calls).toEqual([]);
    expect(logged).toEqual(["Evidence not opened: not a copy in the data folder"]);
  });

  it("logs a file the OS couldn't open", async () => {
    const logged: string[] = [];
    const os: EvidenceShell = { openPath: async () => "No app for it", showItemInFolder: () => {} };
    await openEvidenceFile(data, at("a1", "notes.txt"), os, (m) => logged.push(m));
    expect(logged).toEqual(["Can't open evidence: No app for it"]);
  });
});
