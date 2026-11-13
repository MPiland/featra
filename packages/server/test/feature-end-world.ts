/**
 * The world of the feature end tests (STORY-14): a real repository with FEAT-1 in progress on its branch and its
 * stories finished, the real scanner, watches, card lane, settings, feature end, checks, PRs and merge, and the
 * work-format rules. Only the platform is faked: GitHub (`fake-gh.cjs` over a bare remote whose path names
 * github.com), the clock and timers, the check command (a small Node script of the project that reads its verdict
 * from a file), and the chat manager, which records the notices it is asked to post.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach } from "vitest";
import { parseCard, type Card, type Notice } from "@featra/work-format";
import { createAllowedProjects, type AllowedProjects } from "../src/allowed-projects.ts";
import { createCardLane } from "../src/card-lane.ts";
import type { ChatManager } from "../src/chat-manager-types.ts";
import { createCheckSettings, type CheckSettings } from "../src/check-settings.ts";
import { createFeatureEnd, type FeatureEnd } from "../src/feature-end.ts";
import { createRepoGit } from "../src/repo-git.ts";
import { createScanner } from "../src/work-scan.ts";
import { createWorkWatches, type WorkWatches } from "../src/work-watch.ts";
import { card, cardRepo, type CardRepo } from "./card-repo.ts";
import { fakeGh, type FakeGh, type FakeGhState } from "./fake-gh.ts";
import { manualClock, MINUTE } from "./manual-clock.ts";

export const FEATURE_BRANCH = "feature/1-ship";
export const LEAD = "lead-1";
export const PR = "https://github.com/acme/app/pull/1";

const CHECK = `const fs = require("fs");
const verdict = fs.readFileSync("verdict.txt", "utf8").trim();
if (verdict !== "pass") { console.log("boom: " + verdict); process.exit(1); }
`;

export interface FeatureStartOptions {
  /** More lines of the project's config. */
  yaml?: string;
  /** Whether the project has a GitHub remote; true by default. */
  remote?: boolean;
  /** The fake GitHub at the start. */
  gh?: Partial<FakeGhState>;
  /** Where checks run; `local` runs `node check.cjs` here, else CI on the PR. */
  checks?: "local" | "ci";
  /** STORY-2's status: Cancelled by default, which Accept counts as finished. */
  story2?: string;
}

export interface FeatureWorld {
  repo: CardRepo;
  remote: string;
  gh: FakeGh;
  clock: ReturnType<typeof manualClock>;
  watches: WorkWatches;
  settings: CheckSettings;
  allowed: AllowedProjects;
  features: FeatureEnd;
  notices: { chat: string; notice: Notice }[];
  start: (options?: FeatureStartOptions) => Promise<void>;
  /** Waits for the scan, the reads and the check runs in flight. */
  settle: () => Promise<void>;
  /** Moves the clock past a read and lets what it started finish. */
  poll: () => Promise<void>;
  /** FEAT-1 as its branch has it. */
  onFeature: () => Card;
  /** FEAT-1 as main has it. */
  onMain: () => Card;
  /** A commit of `file` on `branch`, which isn't checked out. */
  commitOn: (branch: string, file: string, text: string) => Promise<void>;
  tip: (branch: string) => string;
  parents: (cwd: string, rev: string) => string[];
  remoteGit: (...args: string[]) => string;
  callsOf: (kind: string) => Promise<string[][]>;
}

export function featureWorld(): FeatureWorld {
  let scanner: ReturnType<typeof createScanner>;
  const w = {} as FeatureWorld;
  const chats = {
    list: () =>
      [{ id: "chat-1", story: { id: "STORY-1", parent: LEAD } }] as unknown as ReturnType<ChatManager["list"]>,
    notify: (chat: string, notice: Notice) => {
      w.notices.push({ chat, notice });
    },
  };

  w.settle = async () => {
    await w.watches.scan(w.repo.main);
    await w.features.idle();
    await w.watches.scan(w.repo.main);
    await w.features.idle();
  };
  w.poll = async () => {
    w.clock.advance(3 * MINUTE);
    await w.settle();
  };
  w.onFeature = () => parseCard(w.repo.show(w.repo.main, FEATURE_BRANCH, "FEAT-1"));
  w.onMain = () => parseCard(w.repo.show(w.repo.main, "main", "FEAT-1"));
  w.commitOn = (branch, file, text) =>
    w.repo.commitOn(branch, (tree) => writeFile(join(tree, file), text), `${branch}: ${file}`);
  w.tip = (branch) => w.repo.git(w.repo.main, "rev-parse", `refs/heads/${branch}`).trim();
  w.parents = (cwd, rev) => w.repo.git(cwd, "log", "-1", "--format=%P", rev).trim().split(" ").filter(Boolean);
  w.remoteGit = (...args) => w.repo.git(w.remote, ...args).trim();
  w.callsOf = async (kind) =>
    (await w.gh.calls()).map((c) => c.args).filter((a) => a.slice(0, kind.split(" ").length).join(" ") === kind);

  w.start = async ({ yaml = "", remote = true, gh = {}, checks = "local", story2 }: FeatureStartOptions = {}) => {
    const { repo } = w;
    const where = checks === "local" ? "checksWhere: local\ncheckCommand: node check.cjs\n" : "checksWhere: ci\n";
    await writeFile(join(repo.main, ".featra", "config.yaml"), `version: 1\n${where}${yaml}`);
    await writeFile(join(repo.main, "check.cjs"), CHECK);
    await writeFile(join(repo.main, "verdict.txt"), "pass\n");
    if (story2) await repo.write(repo.main, card("STORY-2", "story", "FEAT-1", story2));
    repo.commit(repo.main, "project");
    w.remote = join(repo.root, "github.com", "acme", "app.git").replace(/\\/g, "/");
    await mkdir(w.remote, { recursive: true });
    repo.git(w.remote, "init", "-q", "--bare");
    if (remote) {
      repo.git(repo.main, "remote", "add", "origin", w.remote);
      repo.git(repo.main, "push", "-q", "origin", "main");
    }
    repo.git(repo.main, "branch", FEATURE_BRANCH);
    // The feature has work of its own, so its branch is active (one with no commits reads as merged).
    await w.commitOn(FEATURE_BRANCH, "feature.txt", "feature\n");
    w.gh = await fakeGh({ remote: w.remote, ...gh });
    w.settings = createCheckSettings({ scan: w.watches.scan, now: w.clock.now, ghCommand: w.gh.command });
    await w.settings.set(repo.main, { confirm: ["command"] });
    w.allowed.set([repo.main]);
    w.features = createFeatureEnd({
      scan: w.watches.scan,
      observe: w.watches.observe,
      allowed: w.allowed,
      settings: w.settings,
      chats,
      now: w.clock.now,
      timers: w.clock.timers,
      lane: createCardLane(),
      log: () => {},
      ghCommand: w.gh.command,
      checkTimeoutMs: 30_000,
    });
    await w.watches.watch(repo.main, () => {});
    await w.settle();
  };

  beforeEach(async () => {
    w.notices = [];
    w.repo = await cardRepo();
    w.repo.git(w.repo.main, "config", "user.name", "Test");
    w.repo.git(w.repo.main, "config", "user.email", "test@example.invalid");
    await w.repo.write(w.repo.main, card("FEAT-1", "feature", null, "active", { title: "Ship it" }));
    await w.repo.write(w.repo.main, card("STORY-1", "story", "FEAT-1", "Done"));
    w.repo.commit(w.repo.main, "plan");
    w.allowed = createAllowedProjects();
    w.clock = manualClock(Date.parse("2026-11-12T10:00:00Z"));
    scanner = createScanner(createRepoGit());
    w.watches = createWorkWatches(scanner, () => {});
  });
  afterEach(async () => {
    w.features?.close();
    w.watches.close();
    await scanner.close();
    await w.gh?.dispose();
    await w.repo.dispose();
  });
  return w;
}
