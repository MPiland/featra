/**
 * The world of the story PR tests (STORY-11): a real repository with FEAT-1's branch and STORY-1's worktree, the real
 * scanner, watches, card lane, settings and work-format rules. Only the platform is faked: GitHub is `fake-gh.cjs`
 * behind `ghCommand`, the remote is a bare repository on disk whose path names github.com (so it reads as a GitHub
 * remote and pushes stay on this computer), and the clock and timers are moved by hand.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach } from "vitest";
import { parseCard, setStatus, type Card } from "@featra/work-format";
import { createAllowedProjects, type AllowedProjects } from "../src/allowed-projects.ts";
import { createCheckSettings, type CheckSettings } from "../src/check-settings.ts";
import { createRepoGit } from "../src/repo-git.ts";
import { createStoryPrs, type StoryPrs } from "../src/story-prs.ts";
import { createScanner } from "../src/work-scan.ts";
import { createWorkWatches, type WorkWatches } from "../src/work-watch.ts";
import { card, cardRepo, moved, type CardRepo } from "./card-repo.ts";
import { fakeGh, type FakeGh, type FakeGhState } from "./fake-gh.ts";
import { manualClock } from "./manual-clock.ts";

export const STORY_BRANCH = "featra/story-1-pr";
export const FEATURE_BRANCH = "feature/1-prs";

export interface PrStartOptions {
  /** More lines of the project's config. */
  yaml?: string;
  /** Whether the project has a GitHub remote; true by default. */
  remote?: boolean;
  /** The fake GitHub at the start. */
  gh?: Partial<FakeGhState>;
  /** A `gh` that isn't installed, in place of the fake. */
  noGh?: boolean;
  /** The story's status when the watch starts. */
  status?: string;
  /** The name of the GitHub remote; `origin` by default. */
  remoteName?: string;
}

export interface PrWorld {
  repo: CardRepo;
  tree: string;
  /** The bare repository that stands in for GitHub's copy. */
  remote: string;
  gh: FakeGh;
  clock: ReturnType<typeof manualClock>;
  prs: StoryPrs;
  watches: WorkWatches;
  settings: CheckSettings;
  allowed: AllowedProjects;
  start: (options?: PrStartOptions) => Promise<void>;
  /** The story's status changes in its worktree, as a session's report would write it, and everything settles. */
  move: (status: string, extra?: Partial<Card>) => Promise<void>;
  /** The story's status changes in its worktree, its history kept, as a session moving it would write it. */
  moveOn: (status: string) => Promise<void>;
  read: () => Promise<Card>;
  /** The branches the remote has. */
  remoteBranches: () => string[];
  /** Waits for every open and read in flight. */
  settle: () => Promise<void>;
  /** The `gh` calls of one kind (`pr view`, `pr list`, `api`). */
  callsOf: (kind: string) => Promise<string[][]>;
}

export const storyCard = (status: string, extra: Partial<Card> = {}): Card => ({
  ...moved(card("STORY-1", "story", "FEAT-1", "In Progress"), status),
  title: "Open a PR",
  description: "As a user, I want a PR.",
  acs: [{ text: "It opens", done: false, test: null }],
  branch: STORY_BRANCH,
  ...extra,
});

export function prWorld(): PrWorld {
  let scanner: ReturnType<typeof createScanner>;
  const w = {} as PrWorld;

  w.read = async () => parseCard(await w.repo.read(w.tree, "STORY-1"));
  w.remoteBranches = () => w.repo.git(w.remote, "branch", "--format=%(refname:short)").split("\n").filter(Boolean);
  w.settle = async () => {
    await w.watches.scan(w.repo.main);
    await w.prs.idle();
  };
  w.move = async (status, extra = {}) => {
    await w.repo.write(w.tree, storyCard(status, extra));
    await w.settle();
    // The PR's own write is heard by the watch too.
    await w.settle();
  };
  w.moveOn = async (status) => {
    await w.repo.write(w.tree, setStatus(await w.read(), status, "session:test", w.clock.now().toISOString()));
    await w.settle();
    await w.settle();
  };
  w.callsOf = async (kind) =>
    (await w.gh.calls()).map((c) => c.args).filter((a) => a.slice(0, kind.split(" ").length).join(" ") === kind);

  w.start = async ({
    yaml = "",
    remote = true,
    gh = {},
    noGh = false,
    status = "In Progress",
    remoteName = "origin",
  }: PrStartOptions = {}) => {
    const { repo } = w;
    await writeFile(join(repo.main, ".featra", "config.yaml"), `version: 1\n${yaml}`);
    repo.commit(repo.main, "config");
    w.remote = join(repo.root, "github.com", "acme", "app.git").replace(/\\/g, "/");
    await mkdir(w.remote, { recursive: true });
    repo.git(w.remote, "init", "-q", "--bare");
    if (remote) repo.git(repo.main, "remote", "add", remoteName, w.remote);
    repo.git(repo.main, "branch", FEATURE_BRANCH);
    w.tree = repo.worktree(STORY_BRANCH, "story-1", FEATURE_BRANCH);
    await repo.write(w.tree, storyCard(status));
    w.gh = await fakeGh({ remote: w.remote, ...gh });
    const deps = { ghCommand: noGh ? "gh-that-is-not-installed" : w.gh.command };
    w.settings = createCheckSettings({ scan: w.watches.scan, now: w.clock.now, ...deps });
    w.allowed.set([repo.main]);
    w.prs = createStoryPrs({
      scan: w.watches.scan,
      observe: w.watches.observe,
      allowed: w.allowed,
      settings: w.settings,
      now: w.clock.now,
      timers: w.clock.timers,
      log: () => {},
      ...deps,
    });
    await w.watches.watch(repo.main, () => {});
    // The project's watch starts, which reads its PRs once.
    await w.settle();
  };

  beforeEach(async () => {
    w.repo = await cardRepo();
    w.repo.git(w.repo.main, "config", "user.name", "Test");
    w.repo.git(w.repo.main, "config", "user.email", "test@example.invalid");
    await w.repo.write(w.repo.main, card("FEAT-1", "feature", null, "active"));
    await w.repo.write(w.repo.main, storyCard("Ready"));
    w.repo.commit(w.repo.main, "plan");
    w.allowed = createAllowedProjects();
    w.clock = manualClock(Date.parse("2026-11-12T10:00:00Z"));
    scanner = createScanner(createRepoGit());
    w.watches = createWorkWatches(scanner, () => {});
  });
  afterEach(async () => {
    w.prs?.close();
    w.watches.close();
    await scanner.close();
    await w.gh?.dispose();
    await w.repo.dispose();
  });
  return w;
}
