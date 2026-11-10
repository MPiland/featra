/**
 * A real git repository with card files, branches and worktrees, for the Work list tests. Git runs here directly,
 * not through the server; cards are written with work-format's own serializer.
 */
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { newCard, serializeCard, setStatus, type Card, type CardType } from "@featra/work-format";
import { cleanGitEnv } from "./temp-folder.ts";

const env = {
  ...cleanGitEnv(),
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.invalid",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.invalid",
  // A commit starts `git maintenance run --auto` as another process, and every start is slow under load (BUG-12).
  GIT_CONFIG_COUNT: "1",
  GIT_CONFIG_KEY_0: "maintenance.auto",
  GIT_CONFIG_VALUE_0: "false",
};

export const T0 = "2026-11-01T00:00:00Z";

export function card(id: string, type: CardType, parent: string | null, status: string, extra: Partial<Card> = {}) {
  return { ...newCard({ id, type, title: id, status: "New", parent }, "user", T0), status, ...extra };
}

export const moved = (c: Card, to: string, at = "2026-11-01T01:00:00Z") => setStatus(c, to, "developer", at);

export const cardPath = (id: string) => `.featra/cards/${id}-card.md`;

const raw = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const git = (cwd: string, ...args: string[]) => raw(cwd, ...args).trim();
const file = (tree: string, id: string) => join(tree, ...cardPath(id).split("/"));

export async function cardRepo(folder = "main") {
  const root = await realpath(await mkdtemp(join(tmpdir(), "featra-work-")));
  const main = join(root, folder);
  await mkdir(main);
  git(main, "init", "-q", "-b", "main");
  git(main, "config", "core.autocrlf", "false");
  await mkdir(join(main, ".featra", "cards"), { recursive: true });
  await writeFile(join(main, ".featra", "config.yaml"), "version: 1\n");
  return {
    root,
    main,
    git,
    file,
    async write(tree: string, c: Card) {
      await writeFile(file(tree, c.id), serializeCard(c), "utf8");
    },
    read: (tree: string, id: string) => readFile(file(tree, id), "utf8"),
    /** The file as commit `rev` has it, byte for byte. */
    show: (tree: string, rev: string, id: string) => raw(tree, "show", `${rev}:${cardPath(id)}`),
    commit(tree: string, message: string) {
      git(tree, "add", "-A");
      git(tree, "commit", "-q", "--allow-empty", "-m", message);
    },
    /** `git worktree add -b <branch> <root>/<name> <from>`; the new worktree's folder. */
    worktree(branch: string, name: string, from = "main") {
      const path = resolve(root, name);
      git(main, "worktree", "add", "-q", "-b", branch, path, from);
      return path;
    },
    /** Commits on `branch` without checking it out anywhere: in a worktree made for the commit and removed after. */
    async commitOn(branch: string, change: (tree: string) => Promise<void>, message: string) {
      const tree = resolve(root, `tmp-${Date.now()}`);
      git(main, "worktree", "add", "-q", "--detach", tree, branch);
      await change(tree);
      git(tree, "add", "-A");
      git(tree, "commit", "-q", "--allow-empty", "-m", message);
      git(main, "update-ref", `refs/heads/${branch}`, git(tree, "rev-parse", "HEAD"));
      git(main, "worktree", "remove", "--force", tree);
    },
    dispose: () => rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }),
  };
}

export type CardRepo = Awaited<ReturnType<typeof cardRepo>>;
