/**
 * STORY-72 AC3: the page asks the main process to open an evidence file, and only the server's copy in the data
 * folder's evidence folder is given to the OS: a document or image opened, anything else shown in its folder.
 */
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EVIDENCE_OPEN_DIR } from "@featra/work-format/evidence-link";
import { evidenceOpening } from "../src/evidence-open.ts";

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
