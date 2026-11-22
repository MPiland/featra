/**
 * STORY-68 AC5: while an agent's `request_action` waits, the agent counts as waiting in the project switcher (STORY-66)
 * and the badge (STORY-67). Through the real agent bridge, action request, chat manager, approval desk, needs service,
 * scanner and folder watches over real git repositories; only the Agent SDK, the clock and the timers are fake.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createActionRequest } from "../src/action-request.ts";
import { createAgentBridge } from "../src/agent-bridge.ts";
import { createAllowedProjects, type AllowedProjects } from "../src/allowed-projects.ts";
import { createLogWriter } from "../src/log-writer.ts";
import { createProjectNeeds, watchWaitingTotal } from "../src/project-needs.ts";
import { createRepoGit } from "../src/repo-git.ts";
import { createScanner } from "../src/work-scan.ts";
import { createWorkWatches, type WorkWatches } from "../src/work-watch.ts";
import { card, cardRepo, type CardRepo } from "./card-repo.ts";
import { world } from "./inbox-world.ts";
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

const writer = createLogWriter({ fs: { read: async () => null, write: async () => {} }, now: () => new Date() });
const STEPS = { title: "Sign in", steps: [{ text: "Sign in to the CLI.", command: "gh auth login" }] };

describe("AC5: a waiting request counts its agent as waiting in the switcher and the badge", () => {
  it("counts the agent from the moment it asks until the user answers, in its own project only", async () => {
    const w = world();
    const needs = createProjectNeeds({ allowed, watches, chats: w.manager, log: () => {} });
    const switcher: number[] = [];
    const other: number[] = [];
    const { needs: first } = needs.watch((n) => {
      switcher.push(n.projects.find((p) => p.dir === b.main)?.waiting ?? -1);
      other.push(n.projects.find((p) => p.dir === a.main)?.waiting ?? -1);
    });
    const badge: number[] = [];
    stops.push(
      watchWaitingTotal(needs, (count) => badge.push(count)),
      () => needs.close(),
    );
    expect(first.projects.map((p) => p.waiting)).toEqual([0, 0]);

    const c = await w.chatCalling({ dir: b.main });
    const bridge = createAgentBridge({
      entry: null,
      enabled: async () => true,
      chats: w.manager,
      writer,
      actions: createActionRequest({ chats: w.manager }),
    });
    const answer = bridge.call(c.id, "action.request", STEPS);
    // Before the Inbox wait: it counts as soon as it is asked.
    await until(() => switcher.at(-1) === 1 && badge.at(-1) === 1);
    const asked = c.events.find((e) => e.type === "approval");
    if (asked?.type !== "approval") throw new Error("No request card.");

    w.manager.approve(c.id, asked.id, { choice: "allow" });
    await answer;
    await until(() => switcher.at(-1) === 0 && badge.at(-1) === 0);
    expect(switcher).toEqual([1, 0]);
    expect(other.every((n) => n === 0)).toBe(true);
  });
});
