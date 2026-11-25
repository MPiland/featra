/**
 * STORY-25: the screenshots a story's move to review attaches, on the real services (proof-world.ts): a real repository
 * and worktrees, the real agent socket, card reports, proof settings, dev servers and capture. Only the platform is
 * faked: the dev server's process, port probe and HTTP answer, and the desktop host's page capture.
 */
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EVIDENCE_BYTES, PROOF_COPY } from "@featra/work-format";
import { CONFIG, criterion, folder, ORIGIN, platform, PNG, proofWorld } from "./proof-world.ts";

let p: Awaited<ReturnType<typeof proofWorld>>;

beforeAll(async () => {
  p = await proofWorld();
});
afterAll(() => p.w.close());

/** The file at `path` in worktree `tree`, as a card links it. */
const fileOf = (tree: string, path: string) => join(tree, ...path.split("/"));
const exists = (file: string) =>
  access(file).then(
    () => true,
    () => false,
  );

describe("AC2: the pages a story's criteria list are captured as it moves to review", () => {
  it("attaches each criterion's page and test screenshot, links them, and tells the agent to commit them", async () => {
    const five = await p.spawned("STORY-5", "STORY-5-spawn-five");
    await mkdir(join(five, "shots"), { recursive: true });
    await writeFile(join(five, "shots", "STORY-5-ac2-dark.png"), "a test's screenshot");
    const runs = p.w.claude.runs.length;
    const heard = p.w.claude.runs.map((r) => r.heard.length);

    const answer = await p.update({
      card: "STORY-5",
      criteria: [{ criterion: "Settings show it", page: "/settings" }, { criterion: "A test shows it" }],
      stage: "In Review",
    });

    expect(answer).toMatchObject({ ok: true });
    const said = (answer.result as { changes: string[] }).changes;
    expect(said).toContain("listed 1 page to capture");
    expect(said).toContain(PROOF_COPY.captured(2, folder("STORY-5")));
    expect(platform.procs).toMatchObject([{ command: "pnpm dev --port 5173", cwd: five }]);
    // The host is told the dev server's origin, which it loads the page only on.
    expect(platform.captured).toEqual([{ url: `${ORIGIN}/settings`, origin: ORIGIN }]);

    const card = await p.w.card("STORY-5", five);
    expect(card.status).toBe("In Review");
    expect(card.acs.map((ac) => ac.evidence)).toEqual([
      `${folder("STORY-5")}ac1-page.png`,
      `${folder("STORY-5")}ac2-test.png`,
    ]);
    expect(card.acs[0]?.page).toBe("/settings");
    expect(await readFile(fileOf(five, `${folder("STORY-5")}ac1-page.png`))).toEqual(PNG);
    expect(await readFile(fileOf(five, `${folder("STORY-5")}ac2-test.png`), "utf8")).toBe("a test's screenshot");

    // AC4: no agent was started or told anything to capture them.
    expect(p.w.claude.runs.length).toBe(runs);
    expect(p.w.claude.runs.map((r) => r.heard.length)).toEqual(heard);
  });

  it("shows the screenshots on the card, with no note and Preview offered", async () => {
    const shown = await p.view("STORY-5");
    expect(shown.acs.map((ac) => ac.proofNote)).toEqual([undefined, undefined]);
    expect(shown.preview).toBe(true);
  });

  it("replaces a criterion's earlier screenshot of another type, leaving no stale file", async () => {
    const twelve = await p.spawned("STORY-12", "STORY-12-spawn-12");
    expect(await p.moveWithPage("STORY-12")).toBeUndefined();
    const png = `${folder("STORY-12")}ac1-page.png`;
    const jpg = `${folder("STORY-12")}ac1-page.jpg`;
    expect(await exists(fileOf(twelve, png))).toBe(true);

    // Back in progress, and the page is now over the PNG limit, so the host answers with a JPEG.
    await p.w.repo.write(twelve, { ...(await p.w.card("STORY-12", twelve)), status: "In Progress" });
    platform.shots.set("/settings", { ok: true, data: Buffer.from("a jpeg"), ext: "jpg" });
    try {
      expect(await p.moveWithPage("STORY-12")).toBeUndefined();
    } finally {
      platform.shots.clear();
    }
    expect((await p.w.card("STORY-12", twelve)).acs[0]?.evidence).toBe(jpg);
    expect(await readFile(fileOf(twelve, jpg), "utf8")).toBe("a jpeg");
    expect(await exists(fileOf(twelve, png))).toBe(false);
  });
});

describe("a screenshot that can't be taken is a note on the criterion, and the move to review stands", () => {
  it("says the dev-server command isn't confirmed when it changed outside Settings", async () => {
    await p.spawned("STORY-6", "STORY-6-spawn-six");
    await p.setConfig(CONFIG.replace("pnpm dev", "npm run dev"));
    const before = platform.procs.length;
    expect(await p.moveWithPage("STORY-6")).toEqual({ note: PROOF_COPY.notes.unconfirmed });
    expect(platform.procs).toHaveLength(before);
  });

  it("says there is no dev-server command", async () => {
    await p.spawned("STORY-7", "STORY-7-spawn-seven");
    await p.setConfig(CONFIG.replace(/devServerCommand:.*\n/, ""));
    expect(await p.moveWithPage("STORY-7")).toEqual({ note: PROOF_COPY.notes.noCommand });
  });

  it("says the dev server didn't start, with its last output", async () => {
    await p.spawned("STORY-9", "STORY-9-spawn-9");
    await p.setConfig(CONFIG);
    platform.up = false;
    platform.printed = "Error: Cannot find module 'vite'\n";
    const captured = platform.captured.length;
    try {
      expect(await p.moveWithPage("STORY-9")).toEqual({
        note: PROOF_COPY.notes.notStarted,
        output: "Error: Cannot find module 'vite'",
      });
    } finally {
      platform.up = true;
    }
    expect(platform.procs.at(-1)?.cancelled).toBe(1);
    expect(platform.captured).toHaveLength(captured);
  });

  it("says a page didn't load when the host couldn't capture it or it is over the evidence limit", async () => {
    await p.spawned("STORY-11", "STORY-11-spawn-11", [criterion("Broken page"), criterion("Huge page")]);
    platform.shots.set("/broken", { ok: false, error: "The page took too long to load." });
    platform.shots.set("/huge", { ok: true, data: Buffer.alloc(EVIDENCE_BYTES + 1), ext: "jpg" });
    try {
      const answer = await p.update({
        card: "STORY-11",
        criteria: [
          { criterion: "Broken page", page: "/broken" },
          { criterion: "Huge page", page: "/huge" },
        ],
        stage: "In Review",
      });
      expect(answer).toMatchObject({ ok: true });
    } finally {
      platform.shots.clear();
    }
    const shown = await p.view("STORY-11");
    expect(shown.acs.map((ac) => ac.proofNote)).toEqual([
      { note: PROOF_COPY.notes.pageFailed },
      { note: PROOF_COPY.notes.pageFailed },
    ]);
    expect(shown.acs.map((ac) => ac.evidence)).toEqual([undefined, undefined]);
  });

  it("says a test's screenshot is unusable when it is over the evidence limit", async () => {
    const tree = await p.spawned("STORY-13", "STORY-13-spawn-13");
    await mkdir(join(tree, "shots"), { recursive: true });
    await writeFile(join(tree, "shots", "STORY-13-ac2.png"), Buffer.alloc(EVIDENCE_BYTES + 1));
    expect(await p.moveWithPage("STORY-13")).toBeUndefined();
    const shown = await p.view("STORY-13");
    expect(shown.acs[1]?.proofNote).toEqual({ note: PROOF_COPY.notes.shotUnusable });
    expect(shown.acs[1]?.evidence).toBeUndefined();
  });
});

describe("a page written into the card's file by hand", () => {
  it("is never captured when it isn't a route on the dev server", async () => {
    const tree = await p.spawned("STORY-10", "STORY-10-spawn-10", [
      criterion("Settings show it"),
      criterion("Off the origin", { page: "@127.0.0.1:8080/" }),
    ]);
    const before = platform.captured.length;
    expect(await p.moveWithPage("STORY-10")).toBeUndefined();
    expect(platform.captured.slice(before).map((c) => new URL(c.url).pathname)).toEqual(["/settings"]);
    expect(JSON.stringify(platform.captured)).not.toContain("8080");
    const card = await p.w.card("STORY-10", tree);
    expect(card.acs[1]).toMatchObject({ page: "@127.0.0.1:8080/" });
    expect(card.acs[1]?.evidence).toBeUndefined();
  });
});
