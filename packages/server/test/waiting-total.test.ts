/**
 * STORY-67: the badge's number, from the same needs watch as the switcher (STORY-66), through the real chat manager,
 * approval desk, scanner and folder watches over real git repositories. Only the Agent SDK, the clock and the timers
 * are fake.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAllowedProjects, type AllowedProjects } from "../src/allowed-projects.ts";
import { createProjectNeeds, watchWaitingTotal } from "../src/project-needs.ts";
import { createRepoGit } from "../src/repo-git.ts";
import { createScanner } from "../src/work-scan.ts";
import { createWorkWatches, type WorkWatches } from "../src/work-watch.ts";
import { card, cardRepo, type CardRepo } from "./card-repo.ts";
import { COLOUR, world } from "./inbox-world.ts";
import { until } from "./until.ts";

let scanner: ReturnType<typeof createScanner>;
let watches: WorkWatches;
let allowed: AllowedProjects;
let a: CardRepo;
let b: CardRepo;
const stops: (() => void)[] = [];

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

/** The badge's reports from a needs service over `w`, and the service, to see what the switcher gets beside it. */
function badge(w: ReturnType<typeof world>, list: AllowedProjects = allowed, platform?: string) {
  const needs = createProjectNeeds({ allowed: list, watches, chats: w.manager, log: () => {}, platform });
  const reports: number[] = [];
  const stop = watchWaitingTotal(needs, (count) => reports.push(count));
  stops.push(stop, () => needs.close());
  return { reports, needs, last: () => reports.at(-1) };
}

describe("AC1: the badge counts the waiting agents across every open project, as the switcher does", () => {
  it("starts at 0, then adds each project's waiting agents, an agent with two requests once", async () => {
    const w = world();
    const n = badge(w);
    const one = await w.chatCalling({ dir: a.main });
    await one.askApproval("t1");
    await one.askApproval("t2");
    await until(() => n.last() === 1);
    const two = await w.chatCalling({ dir: b.main, message: "ask me" });
    await two.askQuestion();
    await until(() => n.last() === 2);
    expect(n.reports).toEqual([0, 1, 2]);
  });

  it("is the sum of the counts the switcher gets from the same watch", async () => {
    const w = world();
    const n = badge(w);
    const seen: number[][] = [];
    n.needs.watch((list) => seen.push(list.projects.map((p) => p.waiting)));
    await (await w.chatCalling({ dir: a.main })).askApproval();
    await (await w.chatCalling({ dir: b.main, message: "ask me" })).askQuestion();
    await until(() => n.last() === 2);
    expect(seen.at(-1)).toEqual([1, 1]);
  });

  it("leaves out an agent of a project that is closed", async () => {
    const w = world();
    const n = badge(w);
    await (await w.chatCalling({ dir: a.main })).askApproval();
    await until(() => n.last() === 1);
    allowed.set([b.main]);
    await until(() => n.last() === 0);
    expect(n.reports).toEqual([0, 1, 0]);
  });

  // Regression (STORY-67 review): a folder the host listed in two cases was two projects, so its agent counted twice.
  it("counts an agent once when its folder is listed in two cases where case doesn't matter", async () => {
    const caseless = createAllowedProjects("win32");
    caseless.set([a.main, a.main.toUpperCase(), b.main]);
    const w = world();
    const n = badge(w, caseless, "win32");
    await (await w.chatCalling({ dir: a.main })).askApproval();
    await until(() => n.last() !== 0);
    expect(n.reports).toEqual([0, 1]);
  });
});

describe("AC3: the badge clears when no agent is waiting, and updates live", () => {
  it("drops by one as each agent is answered, and clears at none", async () => {
    const w = world();
    const n = badge(w);
    const asking = await w.chatCalling({ dir: a.main });
    const { answer } = await asking.askQuestion();
    const approving = await w.chatCalling({ dir: b.main, message: "use a tool" });
    await approving.askApproval();
    await until(() => n.last() === 2);
    w.manager.answer(asking.id, "q1", { [COLOUR.question]: ["Red"] });
    await answer;
    await until(() => n.last() === 1);
    await w.manager.stop(approving.id);
    await until(() => n.last() === 0);
    expect(n.reports).toEqual([0, 1, 2, 1, 0]);
  });
});

describe("AC4: reviews don't change the badge", () => {
  it("keeps the count when a project gains a draft feature to review, with an agent waiting", async () => {
    const w = world();
    const n = badge(w);
    await (await w.chatCalling({ dir: a.main })).askApproval();
    await until(() => n.last() === 1);
    const review = new Promise<void>((resolve) =>
      n.needs.watch((list) => list.projects.some((p) => p.review) && resolve()),
    );
    await n.needs.ready();
    await b.write(b.main, card("FEAT-2", "feature", null, "draft", { extra: { "drafted-by": "chat-1" } }));
    await review;
    expect(n.reports).toEqual([0, 1]);
  });
});
