/**
 * The Browser pane's dev servers (STORY-74, ADR 0047): the project's confirmed dev-server command, Proof's own (STORY-25),
 * run for a story in its worktree, or for a feature in progress in its branch's checkout. A feature branch nobody has
 * checked out is served from a temporary detached worktree at its tip, as a feature's checks run (ADR 0037), removed
 * once the pane closes. One running already (Preview's, or the pane's from before) is reused, and closing the pane
 * stops only a server its own start launched.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PROOF_COPY, type CardView } from "@featra/work-format";
import { ApiError } from "./api-error.ts";
import { ownedIn } from "./card-actions.ts";
import type { DevServers } from "./dev-servers.ts";
import { lookAt } from "./feature-look.ts";
import type { MergeGit } from "./merge-git.ts";
import type { ProofSettings } from "./proof-settings.ts";
import { samePath } from "./same-path.ts";
import type { Scan } from "./work-scan.ts";

export interface BrowserPreviewDeps {
  scan: (dir: string) => Promise<Scan | null>;
  git: MergeGit;
  servers: Pick<DevServers, "claim" | "halt" | "running">;
  settings: Pick<ProofSettings, "command">;
  log?: (message: string) => void;
}

/** A temporary checkout of a feature's tip: the repository it belongs to, and its folder. */
interface Temp {
  top: string;
  folder: string;
}

/** What one open pane holds: whether its start launched the dev server, and the checkout made for it. */
interface Session {
  launched: boolean;
  temp: Temp | null;
}

const keyOf = (dir: string, id: string) => `${dir}\n${id}`;

/** Whether `view` has something the pane can serve: a story's own unmerged worktree, or a feature in progress. */
export function servable(dir: string, scanned: Scan | null, view: CardView): boolean {
  const found = ownedIn(scanned, view.id);
  if (!found) return false;
  if (view.type === "story") return Boolean(found.root && !samePath(found.root, dir) && !view.merged);
  return view.type === "feature" && found.owned.owner.kind === "feature";
}

export function createBrowserPreview({ scan, git, servers, settings, log = () => {} }: BrowserPreviewDeps) {
  const sessions = new Map<string, Session>();
  /** Each pane's starts and stops, one at a time and in order: a stop sent during a start stops what it launched. */
  const turns = new Map<string, Promise<unknown>>();
  function inTurn<T>(key: string, step: () => Promise<T>): Promise<T> {
    const run = (turns.get(key) ?? Promise.resolve()).catch(() => {}).then(step);
    turns.set(key, run);
    void run
      .catch(() => {})
      .finally(() => {
        if (turns.get(key) === run) turns.delete(key);
      });
    return run;
  }

  async function removeTemp(temp: Temp | null) {
    if (!temp) return;
    await git.removeFolder(temp.top, temp.folder);
    await rm(temp.folder, { recursive: true, force: true }).catch(() => {});
  }

  /** A detached worktree of `top` at `tip`; worktrees a quit left behind are pruned first. */
  async function checkout(top: string, tip: string): Promise<Temp> {
    await git.git(top, ["worktree", "prune"]);
    const folder = await mkdtemp(join(tmpdir(), "featra-feature-preview-"));
    const added = await git.git(top, ["worktree", "add", "--detach", "--quiet", folder, tip]);
    if (added.code === 0) return { top, folder };
    await rm(folder, { recursive: true, force: true }).catch(() => {});
    throw new ApiError(`Couldn't check out the feature branch: ${added.stderr.trim()}`);
  }

  /** Where `id`'s dev server runs: a story's worktree, or a feature's checkout (made now when it has none). */
  async function placeOf(dir: string, scanned: Scan, id: string): Promise<{ folder: string; temp: Temp | null }> {
    const found = ownedIn(scanned, id);
    const card = found?.owned.card;
    if (card?.type === "story" && found?.root && !samePath(found.root, dir)) return { folder: found.root, temp: null };
    const look = card?.type === "feature" ? await lookAt(git, scanned, id) : null;
    if (!look) throw new ApiError(PROOF_COPY.noBrowser(id));
    if (look.root) return { folder: look.root, temp: null };
    // A server running already needs no checkout: the pane reuses it.
    if (servers.running(dir, id)) return { folder: look.top, temp: null };
    const temp = await checkout(look.top, look.tip);
    return { folder: temp.folder, temp };
  }

  async function start(dir: string, id: string): Promise<{ url: string }> {
    const scanned = await scan(dir);
    if (!scanned) throw new ApiError(PROOF_COPY.noBrowser(id));
    const config = scanned.collected.config;
    const command = await settings.command(dir, config);
    if (!command.ok) throw new ApiError(command.note);
    const { folder, temp } = await placeOf(dir, scanned, id);
    const claimed = servers.claim(dir, id, folder, command.command, config.devServerUrl ?? "");
    const result = await claimed.started;
    const key = keyOf(dir, id);
    const before = sessions.get(key);
    // A checkout no server of this pane runs in isn't kept.
    const kept = claimed.launched && result.ok ? temp : null;
    if (temp !== kept) await removeTemp(temp);
    if (!result.ok) throw new ApiError(result.output ? `${result.note}\n${result.output}` : result.note);
    sessions.set(key, {
      launched: claimed.launched || (before?.launched ?? false),
      temp: kept ?? before?.temp ?? null,
    });
    return { url: result.url };
  }

  async function stop(dir: string, id: string): Promise<null> {
    const key = keyOf(dir, id);
    const session = sessions.get(key);
    sessions.delete(key);
    if (!session) return null;
    if (session.launched) await servers.halt(dir, id);
    await removeTemp(session.temp).catch((err: unknown) =>
      log(`Couldn't remove ${id}'s preview checkout: ${err instanceof Error ? err.message : String(err)}`),
    );
    return null;
  }

  return {
    /** Starts `id`'s dev server for the Browser pane, or reuses the one running; its URL, or why not. */
    start: (dir: string, id: string): Promise<{ url: string }> => inTurn(keyOf(dir, id), () => start(dir, id)),
    /** The pane closed: stops what its start launched, after a start still under way, and removes its checkout. */
    stop: (dir: string, id: string): Promise<null> => inTurn(keyOf(dir, id), () => stop(dir, id)),
    /** The card with whether the Browser pane can serve it. */
    decorate(dir: string, scanned: Scan | null, view: CardView | null): CardView | null {
      if (!view || !servable(dir, scanned, view)) return view;
      return { ...view, browser: true as const };
    },
    /** Stops what every open pane started: the server is closing. */
    async close() {
      await Promise.all(
        [...sessions.keys()].map((key) => {
          const [dir = "", id = ""] = key.split("\n");
          return inTurn(key, () => stop(dir, id));
        }),
      );
    },
  };
}

export type BrowserPreview = ReturnType<typeof createBrowserPreview>;
