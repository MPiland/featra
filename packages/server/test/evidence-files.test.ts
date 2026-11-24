/**
 * STORY-72: evidence files read back for the app, on a real repository and the real scanner. STORY-1 is owned by its
 * worktree off feature/1 (read from disk); STORY-3 is a merged story owned by feature/1, which nothing checks out (read
 * from git). Only links a criterion of the card holds, inside its own evidence folder, small and plain, are read.
 */
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EVIDENCE_BYTES, EVIDENCE_OPEN_DIR, type Card } from "@featra/work-format";
import { createEvidenceApi } from "../src/api-evidence.ts";
import { cardViewIn } from "../src/card-actions.ts";
import { createEvidenceFiles } from "../src/evidence-files.ts";
import { createRepoGit } from "../src/repo-git.ts";
import { createScanner } from "../src/work-scan.ts";
import { createWorkWatches } from "../src/work-watch.ts";
import { card, cardRepo, type CardRepo } from "./card-repo.ts";

const ONE = ".featra/evidence/FEAT-1/STORY-1/";
const THREE = ".featra/evidence/FEAT-1/STORY-3/";
/** STORY-4's evidence folder is a junction to the checkout's `src` (STORY-72 review). */
const FOUR = ".featra/evidence/FEAT-1/STORY-4/";
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 1, 2, 3]);

let repo: CardRepo;
let tree: string;
let data: string;
let scanner: ReturnType<typeof createScanner>;
let files: ReturnType<typeof createEvidenceFiles>;
const logged: string[] = [];

const withLinks = (c: Card, links: string[]): Card => ({
  ...c,
  acs: links.map((evidence, i) => ({ text: `Criterion ${i + 1}`, done: true, test: null, evidence })),
});

const put = async (root: string, path: string, bytes: Buffer | string) => {
  const file = join(root, ...path.split("/"));
  await mkdir(join(file, ".."), { recursive: true });
  await writeFile(file, bytes);
};

/** Whether this machine lets a test make a symbolic link (Windows needs Developer Mode or an elevated shell). */
let canLink = true;

beforeAll(async () => {
  repo = await cardRepo();
  data = await mkdtemp(join(tmpdir(), "featra-data-"));
  await repo.write(repo.main, card("FEAT-1", "feature", null, "active"));
  await repo.write(repo.main, card("STORY-1", "story", "FEAT-1", "In Progress"));
  repo.commit(repo.main, "plan");
  repo.git(repo.main, "branch", "feature/1");
  await repo.commitOn(
    "feature/1",
    async (t) => {
      const links = ["shot.png", "gone.png", "link.png"].map((n) => `${THREE}${n}`);
      await repo.write(t, withLinks(card("STORY-3", "story", "FEAT-1", "Done"), links));
      await put(t, `${THREE}shot.png`, PNG);
      await put(t, "secret.png", PNG);
      await symlink("../../../../secret.png", join(t, ...`${THREE}link.png`.split("/")), "file").catch(() => {});
    },
    "merge STORY-3",
  );
  tree = repo.worktree("story-1", "story-1", "feature/1");
  // STORY-3's evidence is in feature/1's commit only: no working tree has it on disk.
  await rm(join(tree, ...THREE.split("/")), { recursive: true, force: true });
  const links = ["shot.png", "notes.txt", "gone.png", "big.png", "folder", "link.png"].map((n) => `${ONE}${n}`);
  const escapes = [`${THREE}shot.png`, `${ONE}../../../../secret.png`, "secret.png"];
  await repo.write(tree, withLinks(card("STORY-1", "story", "FEAT-1", "In Progress"), [...links, ...escapes]));
  await put(tree, `${ONE}shot.png`, PNG);
  await put(tree, `${ONE}notes.txt`, "All green.\n");
  await put(tree, `${ONE}big.png`, Buffer.alloc(EVIDENCE_BYTES + 1, 1));
  await mkdir(join(tree, ...`${ONE}folder`.split("/")), { recursive: true });
  await put(tree, "secret.png", PNG);
  await repo.write(tree, withLinks(card("STORY-4", "story", "FEAT-1", "In Progress"), [`${FOUR}secret.txt`]));
  await put(tree, "src/secret.txt", "secret");
  await symlink(join(tree, "src"), join(tree, ...FOUR.slice(0, -1).split("/")), "junction");
  try {
    await symlink(join(tree, "secret.png"), join(tree, ...`${ONE}link.png`.split("/")), "file");
  } catch {
    canLink = false;
  }
  scanner = createScanner(createRepoGit());
  files = createEvidenceFiles({ scan: scanner.scan, dataDir: data, log: (m) => logged.push(m) });
});

afterAll(async () => {
  await scanner.close();
  await repo.dispose();
  await rm(data, { recursive: true, force: true });
});

describe("AC1: a linked screenshot reads back as an image", () => {
  it("gives the card pane and the review screen each criterion's evidence link", async () => {
    const view = cardViewIn(await scanner.scan(repo.main), "STORY-1");
    expect(view?.acs.slice(0, 2)).toMatchObject([{ evidence: `${ONE}shot.png` }, { evidence: `${ONE}notes.txt` }]);
  });

  it("reads a screenshot in the story's worktree as an image, bytes and all", async () => {
    expect(await files.read(repo.main, "STORY-1", `${ONE}shot.png`)).toEqual({
      ok: true,
      kind: "image",
      name: "shot.png",
      mime: "image/png",
      data: PNG.toString("base64"),
    });
  });

  it("reads a merged story's screenshot from git when its owner isn't checked out", async () => {
    expect(await files.read(repo.main, "STORY-3", `${THREE}shot.png`)).toMatchObject({
      ok: true,
      kind: "image",
      data: PNG.toString("base64"),
    });
  });
});

describe("AC3: any other file reads back as a file to open", () => {
  it("reads a text file as a file, by name", async () => {
    expect(await files.read(repo.main, "STORY-1", `${ONE}notes.txt`)).toEqual({
      ok: true,
      kind: "file",
      name: "notes.txt",
    });
  });

  it("opens a copy in the app's data folder, never the original", async () => {
    const { file } = await files.open(repo.main, "STORY-1", `${ONE}notes.txt`);
    const rel = relative(join(data, EVIDENCE_OPEN_DIR), file);
    expect(rel.startsWith("..")).toBe(false);
    expect(isAbsolute(rel)).toBe(false);
    expect(file.endsWith("notes.txt")).toBe(true);
    expect(await readFile(file, "utf8")).toBe("All green.\n");
  });

  it("opens a merged story's file from git", async () => {
    const { file } = await files.open(repo.main, "STORY-3", `${THREE}shot.png`);
    expect(await readFile(file)).toEqual(PNG);
  });
});

describe("AC4: evidence that can't be shown says why, and nothing else is read", () => {
  it.each([
    ["a linked file that isn't there", "STORY-1", `${ONE}gone.png`, "missing"],
    ["a merged story's linked file git doesn't have", "STORY-3", `${THREE}gone.png`, "missing"],
    ["a file over the size limit", "STORY-1", `${ONE}big.png`, "unreadable"],
    ["a folder", "STORY-1", `${ONE}folder`, "unreadable"],
    ["a link to another story's evidence folder", "STORY-1", `${THREE}shot.png`, "unreadable"],
    ["a file no criterion links", "STORY-1", `${ONE}other.png`, "unreadable"],
    ["a path out of the folder", "STORY-1", `${ONE}../../../../secret.png`, "unreadable"],
    ["a file outside the evidence folders", "STORY-1", "secret.png", "unreadable"],
  ])("%s", async (_what, id, path, problem) => {
    expect(await files.read(repo.main, id, path)).toEqual({ ok: false, problem });
  });

  it("refuses a symbolic link that leads out of the evidence folder", async ({ skip }) => {
    if (!canLink) skip("this machine can't make symbolic links");
    expect(await files.read(repo.main, "STORY-1", `${ONE}link.png`)).toEqual({ ok: false, problem: "unreadable" });
  });

  it("refuses a story folder that is a junction into the checkout, for reading and opening", async () => {
    expect(await files.read(repo.main, "STORY-4", `${FOUR}secret.txt`)).toEqual({ ok: false, problem: "unreadable" });
    await expect(files.open(repo.main, "STORY-4", `${FOUR}secret.txt`)).rejects.toThrow("Can't open evidence");
  });

  it("refuses a symbolic link git has for a merged story", async ({ skip }) => {
    const mode = repo.git(repo.main, "ls-tree", "feature/1", "--", `${THREE}link.png`).split(" ")[0];
    if (mode !== "120000") skip("this machine's git didn't store a symbolic link");
    expect(await files.read(repo.main, "STORY-3", `${THREE}link.png`)).toEqual({ ok: false, problem: "unreadable" });
  });

  it("refuses to open what it can't read, with the note the app shows", async () => {
    await expect(files.open(repo.main, "STORY-1", `${ONE}gone.png`)).rejects.toThrow("Evidence missing");
    await expect(files.open(repo.main, "STORY-1", `${ONE}big.png`)).rejects.toThrow("Can't open evidence");
  });

  it("says a card that isn't there is gone", async () => {
    await expect(files.read(repo.main, "STORY-9", `${ONE}shot.png`)).rejects.toThrow("That card is gone.");
  });
});

describe("reading evidence while the card is shown", () => {
  it("reads from the watch's last scan, so a screen of screenshots doesn't rescan every card", async () => {
    let scans = 0;
    const counted = {
      ...scanner,
      scan: (...args: Parameters<typeof scanner.scan>) => (scans++, scanner.scan(...args)),
    };
    const watches = createWorkWatches(counted, () => {});
    const { stop } = await watches.watch(repo.main, () => {});
    try {
      const shown = createEvidenceFiles({ scan: watches.shown, dataDir: data, log: () => {} });
      const before = scans;
      for (const path of [`${ONE}shot.png`, `${ONE}notes.txt`, `${ONE}gone.png`])
        await shown.read(repo.main, "STORY-1", path);
      expect(await shown.read(repo.main, "STORY-1", `${ONE}shot.png`)).toMatchObject({ ok: true, kind: "image" });
      await shown.open(repo.main, "STORY-1", `${ONE}notes.txt`);
      expect(scans).toBe(before);
    } finally {
      stop();
      watches.close();
    }
  });
});

/** The open projects, as the API's guard sees them: this repository only. */
function allow(dir: string) {
  if (dir !== repo.main) throw new Error("That folder isn't an open project.");
  return dir;
}

describe("the local API's evidence methods", () => {
  it("reads and opens through evidence.read and evidence.open", async () => {
    const api = createEvidenceApi({ evidence: files, allow });
    const params = { dir: repo.main, id: "STORY-1", path: `${ONE}notes.txt` };
    expect(await api("evidence.read", params)).toEqual({ ok: true, kind: "file", name: "notes.txt" });
    const opened = await api("evidence.open", params);
    expect(await readFile((opened as { file: string }).file, "utf8")).toBe("All green.\n");
  });

  it("refuses bad params, a folder that isn't an open project, and a server without evidence", async () => {
    const api = createEvidenceApi({ evidence: files, allow });
    await expect(api("evidence.read", { dir: repo.main, id: "STORY-1" })).rejects.toThrow(
      "Expected { dir, id, path }.",
    );
    await expect(api("evidence.read", { dir: tree, id: "STORY-1", path: `${ONE}shot.png` })).rejects.toThrow(
      "That folder isn't an open project.",
    );
    const none = createEvidenceApi({ allow });
    await expect(none("evidence.read", { dir: repo.main, id: "STORY-1", path: `${ONE}shot.png` })).rejects.toThrow(
      "Evidence isn't available.",
    );
  });
});
