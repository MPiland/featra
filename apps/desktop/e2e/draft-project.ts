import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newCard, serializeCard } from "@featra/work-format";

/** Shared by the draft journeys (STORY-8, 49, 50): a real git project to draft into, and its card files. */
const env = (() => {
  const e: Record<string, string | undefined> = { ...process.env };
  for (const key of Object.keys(e)) if (key.startsWith("GIT_")) delete e[key];
  return {
    ...e,
    GIT_AUTHOR_NAME: "Test",
    GIT_AUTHOR_EMAIL: "test@example.invalid",
    GIT_COMMITTER_NAME: "Test",
    GIT_COMMITTER_EMAIL: "test@example.invalid",
  };
})();
export const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

/** A project in git with one finished feature, so the draft's IDs are the next ones. */
export async function project(config = "version: 1\n") {
  const dir = await realpath(await mkdtemp(join(tmpdir(), "featra-draft-e2e-")));
  await mkdir(join(dir, ".featra", "cards"), { recursive: true });
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "core.autocrlf", "false");
  await writeFile(join(dir, ".featra", "config.yaml"), config);
  const first = newCard(
    { id: "FEAT-1", type: "feature", title: "First", status: "done" },
    "user",
    "2026-11-01T00:00:00Z",
  );
  await writeFile(join(dir, ".featra", "cards", "FEAT-1-first.md"), serializeCard(first), "utf8");
  git(dir, "add", "-A");
  git(dir, "commit", "-q", "-m", "plan");
  return { dir, dispose: () => rm(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }) };
}

/** A card's file as the owner has it on disk. */
export async function cardFile(dir: string, id: string) {
  const cards = join(dir, ".featra", "cards");
  const name = (await readdir(cards)).find((f) => f.startsWith(`${id}-`)) ?? "";
  return readFile(join(cards, name), "utf8");
}
