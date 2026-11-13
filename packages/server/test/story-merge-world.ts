/**
 * The world of the merge tests (STORY-12): the story PR world (a real repository with FEAT-1's branch and STORY-1's
 * worktree, the real scanner, watches, card lane, settings and PR poller), with the real merge and `request_merge`
 * modules on it. Only the platform is faked: GitHub (`fake-gh.cjs` and a bare remote), the clock, and the chat
 * manager, which records what the merge asks of it.
 */
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach } from "vitest";
import { withCheckEvidence, type Notice } from "@featra/work-format";
import type { AppApproval, ChatManager } from "../src/chat-manager-types.ts";
import { runGit } from "../src/git-run.ts";
import { createMergeRequest, type MergeRequest } from "../src/merge-request.ts";
import { createStoryChecks } from "../src/story-checks.ts";
import { createStoryMerge, type StoryMerge } from "../src/story-merge.ts";
import {
  FEATURE_BRANCH,
  prWorld,
  STORY_BRANCH,
  storyCard,
  type PrStartOptions,
  type PrWorld,
} from "./story-prs-world.ts";

export { FEATURE_BRANCH, STORY_BRANCH };

/** The Dev Lead's chat, which started STORY-1, and STORY-1's session. */
export const LEAD = "lead-1";
export const SESSION = "chat-1";

export interface MergeWorld {
  w: PrWorld;
  merges: StoryMerge;
  requests: MergeRequest;
  /** What the fake chat manager was asked: opened and retired chats, sent messages, approvals and notices. */
  opened: string[];
  retired: string[];
  sent: { chat: string; text: string }[];
  asked: { chat: string; request: AppApproval }[];
  notices: { chat: string; notice: Notice }[];
  logs: string[];
  /** What sending to the session throws, as a chat that is gone would; null to send. */
  refuse: Error | null;
  /** What happens as STORY-1's session is retired, mid-merge (a turn that ran meanwhile); nothing unless a test sets it. */
  onRetire: (() => Promise<void>) | undefined;
  /** The fake chat manager, for the other modules a test puts beside the merge. */
  chats: Pick<ChatManager, "storySession" | "list" | "open" | "send" | "retire">;
  /** Whether STORY-1's session is running a turn. */
  running: boolean;
  /**
   * The commit the story's local checks settled on, when a test sets it. Unset, it is what the real checks of a
   * Featra that has just started say: none of their own, so the commit the card recorded.
   */
  checked: string | null | undefined;
  /** The platform's git the merge runs, when a test stands in for it (an old or busy git). */
  gitRun: typeof runGit | undefined;
  /** How the user answers the next approval: resolve it with true (allow) or false (deny). */
  answer: (allow: boolean) => void;
  start: (options?: PrStartOptions) => Promise<void>;
  /**
   * STORY-1 with committed work in its worktree, in `status` and Verified for that commit, as a passing run records
   * it; in GitHub mode its PR is open.
   */
  verified: (status?: string, file?: string) => Promise<void>;
  /** A commit of `file` on the feature branch, which isn't checked out. */
  onFeature: (file: string, text: string) => Promise<void>;
  /** A branch's tip in the project's repository. */
  tip: (branch: string) => string;
  /** The parents of commit `rev` in repository `cwd`. */
  parents: (cwd: string, rev: string) => string[];
  hasBranch: (branch: string) => boolean;
  treeExists: () => boolean;
}

export function mergeWorld(): MergeWorld {
  const w = prWorld();
  const m = { w } as MergeWorld;
  let answers: ((allow: boolean) => void)[] = [];

  const chats = {
    storySession: () => SESSION,
    list: () =>
      [
        { id: SESSION, running: m.running, queued: false, story: { id: "STORY-1", parent: LEAD } },
      ] as unknown as ReturnType<ChatManager["list"]>,
    open: async (id: string) => {
      m.opened.push(id);
    },
    send: (chat: string, text: string) => {
      if (m.refuse) throw m.refuse;
      m.sent.push({ chat, text });
    },
    retire: async (id: string) => {
      await m.onRetire?.();
      m.retired.push(id);
    },
    askApproval: (chat: string, request: AppApproval) => {
      m.asked.push({ chat, request });
      return new Promise<boolean>((resolve) => answers.push(resolve));
    },
    notify: (chat: string, notice: Notice) => {
      m.notices.push({ chat, notice });
    },
  };

  beforeEach(() => {
    m.opened = [];
    m.retired = [];
    m.sent = [];
    m.asked = [];
    m.notices = [];
    m.logs = [];
    m.running = false;
    m.refuse = null;
    m.checked = undefined;
    m.gitRun = undefined;
    m.onRetire = undefined;
    answers = [];
  });

  m.chats = chats;
  m.answer = (allow) => answers.shift()?.(allow);
  m.tip = (branch) => w.repo.git(w.repo.main, "rev-parse", `refs/heads/${branch}`).trim();
  m.parents = (cwd, rev) => w.repo.git(cwd, "log", "-1", "--format=%P", rev).trim().split(" ").filter(Boolean);
  m.hasBranch = (branch) => w.repo.git(w.repo.main, "branch", "--list", branch).trim() !== "";
  m.treeExists = () => existsSync(w.tree);

  m.onFeature = async (file, text) => {
    await w.repo.commitOn(FEATURE_BRANCH, (tree) => writeFile(join(tree, file), text), `feature: ${file}`);
  };

  m.start = async (options = {}) => {
    await w.start(options);
    // The feature has work of its own, so its branch is active (one with no commits reads as merged).
    await m.onFeature("feature.txt", "feature\n");
    // A Featra that has just started: its checks have run nothing, and watch no project.
    const checks = createStoryChecks({
      scan: w.watches.scan,
      observe: w.watches.observe,
      allowed: { dirs: () => [], has: () => false, onChange: () => () => {} },
      settings: w.settings,
      now: w.clock.now,
      log: () => {},
    });
    m.merges = createStoryMerge({
      scan: w.watches.scan,
      now: w.clock.now,
      log: (line) => m.logs.push(line),
      settings: w.settings,
      chats,
      checkedHead: (dir, id, stored) => (m.checked === undefined ? checks.settledHead(dir, id, stored) : m.checked),
      ghCommand: options.noGh ? "gh-that-is-not-installed" : w.gh.command,
      gitRun: (...args) => (m.gitRun ?? runGit)(...args),
    });
    m.requests = createMergeRequest({
      scan: w.watches.scan,
      chats,
      merge: m.merges.merge,
      log: (line) => m.logs.push(line),
    });
    w.onMerged = (dir, id) => m.merges.merged(dir, id);
  };

  m.verified = async (status = "In Review", file = "work.txt") => {
    await writeFile(join(w.tree, file), "story\n");
    await w.repo.write(w.tree, storyCard("In Progress"));
    w.repo.commit(w.tree, "work");
    await w.settle();
    await w.moveOn(status);
    const at = w.clock.now().toISOString();
    const config = (await w.watches.scan(w.repo.main))!.collected.config;
    const head = m.tip(STORY_BRANCH);
    await w.repo.write(
      w.tree,
      withCheckEvidence(await w.read(), config, { passed: true, acs: [], head }, "system", at),
    );
    await w.settle();
  };

  return m;
}
