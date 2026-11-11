/**
 * STORY-9 (review): what a start writes and refuses. The card's `agent` is the provider and `role` the role (the story's
 * own role, else the developer); a branch left from an earlier start is reused; the owner's uncommitted edits carry
 * into the worktree; an id that isn't a STORY id never names a path; a failed start says what remains; a project closed
 * while the worktree is made leaves nothing behind. Real services, sockets and git; only the Agent SDK and clock are faked.
 */
import { existsSync } from "node:fs";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { story, storyWorld, type StoryWorld } from "./story-fixture.ts";

let w: StoryWorld;
beforeAll(async () => {
  w = await storyWorld({ config: "maxStoryAgents: 10\n" });
  await w.repo.write(w.repo.main, { ...story("STORY-30", "Test it"), role: "qa" });
  await w.repo.write(w.repo.main, story("STORY-31", "Added late"));
  w.repo.commit(w.repo.main, "more stories");
});
afterAll(() => w.close());

const FEATURE = "feature/2-delegation";
const sh = (p: string) => p.replaceAll("\\", "/");
const start = (id: string) => w.window.ask("story.start", { dir: w.repo.main, id });
const folder = (name: string) => join(w.repo.main, ".claude", "worktrees", name);
const branches = () => w.repo.git(w.repo.main, "branch", "--format=%(refname:short)").split("\n");

describe("the card's agent and role", () => {
  it("records the provider as `agent` and the story's own role as `role`, and runs that role", async () => {
    expect(await start("STORY-30")).toMatchObject({ ok: true });
    expect(await w.card("STORY-30", folder("STORY-30-test-it"))).toMatchObject({ agent: "claude", role: "qa" });
    expect((await w.sessions()).find((c) => c.story?.id === "STORY-30")?.role.id).toBe("qa");
  });

  it("runs the developer when neither the caller nor the card names a role, through spawn_session too", async () => {
    const lead = await w.devLead();
    const before = w.claude.runs.length;
    lead.agent.socket.send({ id: 1, method: "story.spawn", params: { story: "STORY-5" } });
    expect(await lead.agent.socket.next((f) => f.id === 1, 20_000)).toMatchObject({ ok: true });
    await w.until(() => (w.claude.runs[before]?.heard.length ?? 0) === 1);
    expect(await w.card("STORY-5", folder("STORY-5-spawn-five"))).toMatchObject({ agent: "claude", role: "developer" });
  });
});

describe("an id that isn't a STORY id", () => {
  it("is refused and names no path", async () => {
    for (const id of ["../../evil", "STORY-5/../../evil", "FEAT-2"]) {
      expect(await start(id)).toMatchObject({ ok: false });
    }
    expect(existsSync(join(w.repo.root, "evil"))).toBe(false);
  });
});

describe("a branch left from an earlier start", () => {
  it("is reused when no worktree has it, instead of failing with git's own message", async () => {
    w.repo.git(w.repo.main, "branch", "featra/story-6-spawn-six", FEATURE);
    const reply = await start("STORY-6");
    expect(reply).toMatchObject({ ok: true });
    expect(w.repo.git(folder("STORY-6-spawn-six"), "rev-parse", "--abbrev-ref", "HEAD")).toBe(
      "featra/story-6-spawn-six",
    );
  });

  it("refuses in one sentence when another worktree has it checked out", async () => {
    w.repo.git(
      w.repo.main,
      "worktree",
      "add",
      join(w.repo.root, "elsewhere"),
      "-b",
      "featra/story-7-spawn-seven",
      FEATURE,
    );
    const reply = await start("STORY-7");
    expect(reply).toMatchObject({ ok: false });
    expect(String(reply.error)).toContain("featra/story-7-spawn-seven is checked out in another worktree.");
    expect(existsSync(folder("STORY-7-spawn-seven"))).toBe(false);
  });
});

describe("a start that fails", () => {
  it("says what remains, undoes the rest, and never claims nothing was changed", async () => {
    await mkdir(folder("STORY-31-added-late"), { recursive: true });
    await writeFile(join(folder("STORY-31-added-late"), "in-the-way.txt"), "x");
    const reply = await start("STORY-31");
    expect(reply).toMatchObject({ ok: false });
    const error = String(reply.error);
    expect(error).toContain("Couldn't start STORY-31.");
    expect(error).toContain(`Its card was added to ${FEATURE}.`);
    expect(error).not.toContain("nothing was changed");
    expect(branches().some((b) => b.startsWith("featra/story-31"))).toBe(false);
    expect((await w.card("STORY-31")).status).toBe("New");
  });
});

describe("the owner's copy", () => {
  it("carries its uncommitted edits into the worktree, not the feature branch's last commit", async () => {
    // The feature branch is checked out, so its copy of the card is the owner's, edited and not committed.
    const held = join(w.repo.root, "feature-held");
    w.repo.git(w.repo.main, "worktree", "add", held, FEATURE);
    await w.repo.write(held, { ...story("STORY-10", "Spawn 10"), description: "Changed, not committed." });
    expect(await start("STORY-10")).toMatchObject({ ok: true });
    expect(await w.card("STORY-10", folder("STORY-10-spawn-10"))).toMatchObject({
      status: "In Progress",
      description: "Changed, not committed.",
    });
  });
});

describe("a project closed while the worktree is made", () => {
  it("leaves no worktree, branch or In Progress card without a session", { timeout: 120_000 }, async () => {
    // A commit hook runs this suite with `-c core.hooksPath` in the environment, which would hide the repository's own hook.
    const hooksPath = process.env.GIT_CONFIG_PARAMETERS;
    delete process.env.GIT_CONFIG_PARAMETERS;
    try {
      await w.repo.write(w.repo.main, story("STORY-32", "Closed midway"));
      w.repo.commit(w.repo.main, "another story");
      const marks = { started: join(w.repo.root, "hook-started"), release: join(w.repo.root, "hook-release") };
      const hook = join(w.repo.main, ".git", "hooks", "post-checkout");
      await writeFile(
        hook,
        `#!/bin/sh\ntouch "${sh(marks.started)}"\nwhile [ ! -f "${sh(marks.release)}" ]; do sleep 0.1; done\n`,
      );
      await chmod(hook, 0o755);

      const reply = start("STORY-32");
      await w.until(() => existsSync(marks.started), 60_000);
      w.allowed.set([]);
      await writeFile(marks.release, "go");
      expect(await reply).toMatchObject({ ok: false });

      await w.until(() => !existsSync(folder("STORY-32-closed-midway")), 20_000);
      expect(branches().some((b) => b.startsWith("featra/story-32"))).toBe(false);
      expect((await w.card("STORY-32")).status).toBe("New");
      expect(w.claude.runs.every((r) => !r.heard.some((h) => h.includes("STORY-32")))).toBe(true);
    } finally {
      if (hooksPath !== undefined) process.env.GIT_CONFIG_PARAMETERS = hooksPath;
    }
  });
});
