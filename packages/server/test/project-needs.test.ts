/**
 * STORY-66: what each open project needs, kept current, through the real chat manager, approval desk, scanner and
 * folder watches over real git repositories. Only the Agent SDK, the clock and the timers are fake.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { recordAcceptance, type NeedsList } from "@featra/work-format";
import { createAllowedProjects, type AllowedProjects } from "../src/allowed-projects.ts";
import { createProjectNeeds } from "../src/project-needs.ts";
import { createRepoGit } from "../src/repo-git.ts";
import { createScanner } from "../src/work-scan.ts";
import { createWorkWatches, type WorkWatches } from "../src/work-watch.ts";
import { card, cardRepo, moved, type CardRepo } from "./card-repo.ts";
import { COLOUR, world } from "./inbox-world.ts";
import { sdk } from "./fake-query.ts";
import { until } from "./until.ts";

let scanner: ReturnType<typeof createScanner>;
let watches: WorkWatches;
let allowed: AllowedProjects;
let a: CardRepo;
let b: CardRepo;
const stops: (() => void)[] = [];

const draft = () => card("FEAT-2", "feature", null, "draft", { extra: { "drafted-by": "chat-1" } });

beforeEach(async () => {
  scanner = createScanner(createRepoGit());
  watches = createWorkWatches(scanner, () => {});
  allowed = createAllowedProjects();
  a = await cardRepo("alpha");
  b = await cardRepo("beta");
  for (const repo of [a, b]) {
    await repo.write(repo.main, card("FEAT-1", "feature", null, "done"));
    repo.commit(repo.main, "plan");
  }
  allowed.set([a.main, b.main]);
});
afterEach(async () => {
  stops.splice(0).forEach((stop) => stop());
  watches.close();
  await scanner.close();
  await a.dispose();
  await b.dispose();
});

/** The needs of every open project and one watch of them: its answer, and each push after it. */
function needs(w: ReturnType<typeof world>, folders: Pick<WorkWatches, "observe"> = watches) {
  const logs: string[] = [];
  const service = createProjectNeeds({ allowed, watches: folders, chats: w.manager, log: (m) => logs.push(m) });
  stops.push(() => service.close());
  const watch = () => {
    const pushes: NeedsList[] = [];
    const { needs: first } = service.watch((n) => pushes.push(n));
    const latest = () => pushes.at(-1) ?? first;
    return { first, pushes, latest, of: (dir: string) => latest().projects.find((p) => p.dir === dir) };
  };
  return { ...watch(), watch, ready: service.ready, logs };
}

/** The folder watches, with each one's start counted, and `fail` or `hang` for the folders to fail or never answer. */
function folderWatches(opts: { fail?: string[]; hang?: string[] } = {}) {
  const fail = new Set(opts.fail);
  const started: string[] = [];
  const observe: WorkWatches["observe"] = (dir, pick, listener) => {
    started.push(dir);
    if (opts.hang?.includes(dir)) return new Promise(() => {});
    if (fail.delete(dir)) return Promise.reject(new Error("the folder is busy"));
    return watches.observe(dir, pick, listener);
  };
  return { observe, started };
}

describe("AC1: each project counts its agents waiting on the user", () => {
  it("answers every open project, in the project list's order, with nothing waiting", async () => {
    const n = needs(world());
    expect(n.first).toEqual({
      projects: [
        { dir: a.main, waiting: 0, review: false },
        { dir: b.main, waiting: 0, review: false },
      ],
    });
  });

  it("counts an agent as soon as it asks for an approval, before the Inbox wait, in its own project only", async () => {
    const w = world();
    const n = needs(w);
    const c = await w.chatCalling({ dir: a.main });
    await c.askApproval("t1");
    await until(() => n.of(a.main)?.waiting === 1);
    expect(n.of(b.main)).toEqual({ dir: b.main, waiting: 0, review: false });
  });

  it("counts an agent waiting on an answer to its question", async () => {
    const w = world();
    const n = needs(w);
    const c = await w.chatCalling({ dir: b.main });
    await c.askQuestion();
    await until(() => n.of(b.main)?.waiting === 1);
    expect(n.of(b.main)).toEqual({ dir: b.main, waiting: 1, review: false });
  });

  it("counts an agent with two requests open once, and each agent with one", async () => {
    const w = world();
    const n = needs(w);
    const one = await w.chatCalling({ dir: a.main });
    await one.askApproval("t1");
    await one.askApproval("t2");
    await until(() => n.of(a.main)?.waiting === 1);
    const two = await w.chatCalling({ dir: a.main, message: "ask me" });
    await two.askQuestion();
    await until(() => n.of(a.main)?.waiting === 2);
    expect(n.pushes.map((p) => p.projects[0]?.waiting)).toEqual([1, 2]);
  });

  it("doesn't count an agent whose turn has finished", async () => {
    const w = world();
    const n = needs(w);
    const c = await w.chatCalling({ dir: a.main });
    c.run.say(sdk.assistant("m1", [sdk.text("Done.")]), sdk.success("Done."));
    await until(() => c.events.some((e) => e.type === "turn-end"));
    expect(n.of(a.main)?.waiting).toBe(0);
    expect(n.pushes).toEqual([]);
  });
});

describe("AC2: a project with a draft feature or a story at Acceptance has a review mark", () => {
  it("marks a project with a draft feature an agent made for the user", async () => {
    await b.write(b.main, draft());
    const n = needs(world());
    await n.ready();
    expect(n.of(b.main)).toEqual({ dir: b.main, waiting: 0, review: true });
    expect(n.of(a.main)?.review).toBe(false);
  });

  it("marks a project with a story waiting at Acceptance, apart from its count", async () => {
    await a.write(a.main, card("FEAT-3", "feature", null, "active"));
    await a.write(a.main, moved(card("STORY-1", "story", "FEAT-3", "In Review"), "Acceptance"));
    const n = needs(world());
    await n.ready();
    expect(n.of(a.main)).toEqual({ dir: a.main, waiting: 0, review: true });
  });

  it("reads a story's owner copy: at Acceptance in its worktree, though main still has it In Progress", async () => {
    await a.write(a.main, card("FEAT-3", "feature", null, "active"));
    const story = card("STORY-1", "story", "FEAT-3", "In Progress", { branch: "story-1" });
    await a.write(a.main, story);
    a.commit(a.main, "start");
    const tree = a.worktree("story-1", "story-1");
    await a.write(tree, moved(story, "Acceptance"));
    const n = needs(world());
    await n.ready();
    expect(n.of(a.main)).toEqual({ dir: a.main, waiting: 0, review: true });
  });

  it("reads a story's owner copy: accepted in its worktree, though main still has it waiting at Acceptance", async () => {
    await a.write(a.main, card("FEAT-3", "feature", null, "active"));
    const story = moved(card("STORY-1", "story", "FEAT-3", "In Review", { branch: "story-1" }), "Acceptance");
    await a.write(a.main, story);
    a.commit(a.main, "start");
    const tree = a.worktree("story-1", "story-1");
    await a.write(tree, recordAcceptance(story, true, "user", "2026-11-01T02:00:00Z"));
    const n = needs(world());
    await n.ready();
    expect(n.of(a.main)).toEqual({ dir: a.main, waiting: 0, review: false });
  });
});

describe("the needs answer at once and recover, whatever each project's scan does", () => {
  it("answers with the waiting counts at once, before any scan, and adds the review when its scan lands", async () => {
    await b.write(b.main, draft());
    const n = needs(world());
    expect(n.first.projects.map((p) => p.review)).toEqual([false, false]);
    await until(() => n.of(b.main)?.review === true);
    expect(n.pushes).toEqual([
      {
        projects: [
          { dir: a.main, waiting: 0, review: false },
          { dir: b.main, waiting: 0, review: true },
        ],
      },
    ]);
  });

  it("counts another project's waiting agents while one project's scan never answers", async () => {
    const folders = folderWatches({ hang: [a.main] });
    const w = world();
    const n = needs(w, folders);
    const c = await w.chatCalling({ dir: b.main });
    await c.askApproval();
    await until(() => n.of(b.main)?.waiting === 1);
    expect(n.of(b.main)).toEqual({ dir: b.main, waiting: 1, review: false });
    expect(folders.started).toContain(a.main);
  });

  it("tries a project whose first watch failed again at the next change of the project list", async () => {
    await b.write(b.main, draft());
    const folders = folderWatches({ fail: [b.main] });
    const n = needs(world(), folders);
    await n.ready();
    expect(n.of(b.main)?.review).toBe(false);
    expect(n.logs).toEqual([`Needs can't watch ${b.main}: the folder is busy`]);
    allowed.set(allowed.dirs());
    await until(() => n.of(b.main)?.review === true);
    expect(folders.started.filter((d) => d === b.main)).toHaveLength(2);
  });

  it("answers a second watch, as after a reconnect, from the scans it has, with no new ones", async () => {
    await b.write(b.main, draft());
    const folders = folderWatches();
    const n = needs(world(), folders);
    await n.ready();
    const again = n.watch();
    expect(again.first).toEqual(n.latest());
    expect(again.of(b.main)?.review).toBe(true);
    expect(folders.started).toEqual([a.main, b.main]);
  });
});

describe("AC4: the needs change live as requests come and go and cards change, in every project", () => {
  it("clears an agent's count when its request is answered", async () => {
    const w = world();
    const n = needs(w);
    const c = await w.chatCalling({ dir: a.main });
    const { answer } = await c.askQuestion();
    await until(() => n.of(a.main)?.waiting === 1);
    w.manager.answer(c.id, "q1", { [COLOUR.question]: ["Red"] });
    await answer;
    await until(() => n.of(a.main)?.waiting === 0);
    expect(n.pushes.map((p) => p.projects[0]?.waiting)).toEqual([1, 0]);
  });

  it("clears an agent's count when its session crashes with a request open", async () => {
    const w = world();
    const n = needs(w);
    const c = await w.chatCalling({ dir: a.main });
    await c.askApproval();
    await until(() => n.of(a.main)?.waiting === 1);
    c.run.crash(new Error("claude exited with code 1"));
    await until(() => n.of(a.main)?.waiting === 0);
    expect(n.pushes.map((p) => p.projects[0]?.waiting)).toEqual([1, 0]);
  });

  it("clears an agent's count when the user stops its turn with a request open", async () => {
    const w = world();
    const n = needs(w);
    const c = await w.chatCalling({ dir: a.main });
    await c.askApproval();
    await until(() => n.of(a.main)?.waiting === 1);
    await w.manager.stop(c.id);
    await until(() => n.of(a.main)?.waiting === 0);
    expect(n.pushes.map((p) => p.projects[0]?.waiting)).toEqual([1, 0]);
  });

  it("drops a project closed while its agent waits, with its count", async () => {
    const w = world();
    const n = needs(w);
    const c = await w.chatCalling({ dir: a.main });
    await c.askApproval();
    await until(() => n.of(a.main)?.waiting === 1);
    allowed.set([b.main]);
    expect(n.latest()).toEqual({ projects: [{ dir: b.main, waiting: 0, review: false }] });
  });

  it("marks and clears a review as a card file changes on disk", async () => {
    const n = needs(world());
    await b.write(b.main, draft());
    await until(() => n.of(b.main)?.review === true);
    await b.write(b.main, { ...draft(), status: "approved" });
    await until(() => n.of(b.main)?.review === false);
    expect(n.pushes.map((p) => p.projects[1]?.review)).toEqual([true, false]);
  });

  it("adds a project opened since and drops one closed", async () => {
    const n = needs(world());
    allowed.set([b.main]);
    await until(() => n.latest().projects.length === 1);
    expect(n.latest().projects[0]?.dir).toBe(b.main);
    await a.write(a.main, draft());
    allowed.set([b.main, a.main]);
    await until(() => n.of(a.main)?.review === true);
    expect(n.latest().projects.map((p) => p.dir)).toEqual([b.main, a.main]);
  });

  const caseless = process.platform === "win32" || process.platform === "darwin";
  it.runIf(caseless)("counts a request whose chat names its folder in another case as its project's", async () => {
    const w = world();
    const n = needs(w);
    const c = await w.chatCalling({ dir: a.main.toUpperCase() });
    await c.askApproval();
    await until(() => n.of(a.main)?.waiting === 1);
    expect(n.of(a.main)).toEqual({ dir: a.main, waiting: 1, review: false });
  });
});
