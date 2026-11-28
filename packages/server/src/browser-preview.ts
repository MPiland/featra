/**
 * The Browser pane's dev servers (STORY-74, ADR 0047): the project's confirmed dev-server command, Proof's own (STORY-25),
 * run for a story in its worktree, or for a feature in progress in its branch's checkout. A feature branch nobody has
 * checked out is served from a temporary detached worktree at its tip, as a feature's checks run (ADR 0037), with its
 * dependencies installed there first; the checkout goes once its server stops. Each open pane holds the server it
 * shows, as Preview and the screenshots do: the last holder's release stops it. A pane is named by the page's key for
 * it, and is closed when the page says so or its socket closes (a reload, a crash).
 */
import { PROOF_COPY, type CardView } from "@featra/work-format";
import { ApiError } from "./api-error.ts";
import { ownedIn } from "./card-actions.ts";
import { runCommand, type RunControl } from "./check-run.ts";
import { lastLines, type DevServers } from "./dev-servers.ts";
import { lookAt } from "./feature-look.ts";
import type { MergeGit } from "./merge-git.ts";
import type { ProofSettings } from "./proof-settings.ts";
import { samePath } from "./same-path.ts";
import { checkoutAt, checkoutsNamed, removeCheckout, type TempCheckout } from "./temp-checkout.ts";
import type { Scan } from "./work-scan.ts";

/** What a feature's preview checkout is named: ones a quit left behind are known by it, and removed. */
export const PREVIEW_PREFIX = "featra-feature-preview-";
/** How long an install may run. */
const INSTALL_MS = 10 * 60_000;
/** How long a quit waits for a pane's dev server to end before leaving its checkout for the next start's sweep. */
export const QUIT_WAIT_MS = 3000;

export interface BrowserPreviewDeps {
  scan: (dir: string) => Promise<Scan | null>;
  git: MergeGit;
  servers: Pick<DevServers, "claim" | "release" | "running">;
  settings: Pick<ProofSettings, "command" | "install">;
  log?: (message: string) => void;
  /** Runs the install; check-run's runner in the app. */
  run?: (command: string, cwd: string) => RunControl;
  quitMs?: number;
}

/** What a start answers: the dev server's URL, or that dependencies install first (ask again to wait for it). */
export type BrowserStart = { url: string } | { installing: true };

/** Ties a pane to the page's socket: `stop` runs when it closes; the tie's return ends it. */
export type BrowserTie = (stop: () => void) => () => void;

/** One open pane: what it shows, where its dev server runs, and what it holds. */
interface Session {
  dir: string;
  id: string;
  launch: { folder: string; command: string; url: string };
  /** A checkout made for it that no running server has taken yet. */
  temp: TempCheckout | null;
  /** The install under way in that checkout; it rejects with why it failed. */
  install: { control: RunControl; done: Promise<void> } | null;
  untie: () => void;
}

const serverKey = (dir: string, id: string) => `${dir}\n${id}`;
const holderOf = (pane: string) => `browser:${pane}`;
const why = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Whether `view` has something the pane can serve: a story's own unmerged worktree, or a feature in progress. */
export function servable(dir: string, scanned: Scan | null, view: CardView): boolean {
  const found = ownedIn(scanned, view.id);
  if (!found) return false;
  if (view.type === "story") return Boolean(found.root && !samePath(found.root, dir) && !view.merged);
  return view.type === "feature" && found.owned.owner.kind === "feature";
}

export function createBrowserPreview(deps: BrowserPreviewDeps) {
  const { scan, git, servers, settings, log = () => {}, quitMs = QUIT_WAIT_MS } = deps;
  const run = deps.run ?? ((command: string, cwd: string) => runCommand(command, cwd, INSTALL_MS));
  const sessions = new Map<string, Session>();
  /** The checkout each running feature server runs in, by server: it goes when that server stops. */
  const temps = new Map<string, TempCheckout>();
  /** Each project's sweep of checkouts a quit left behind; a start there waits for it. */
  const sweeps = new Map<string, Promise<void>>();
  /** Each pane's starts and stops, one at a time and in order: a stop sent during a start stops what it launched. */
  const turns = new Map<string, Promise<unknown>>();
  function inTurn<T>(pane: string, step: () => Promise<T>): Promise<T> {
    const next = (turns.get(pane) ?? Promise.resolve()).catch(() => {}).then(step);
    turns.set(pane, next);
    void next
      .catch(() => {})
      .finally(() => {
        if (turns.get(pane) === next) turns.delete(pane);
      });
    return next;
  }

  const remove = (checkout: TempCheckout | null | undefined) =>
    removeCheckout(git, checkout ?? null).catch((err: unknown) =>
      log(`Couldn't remove a preview checkout: ${why(err)}`),
    );

  /** Where `id`'s dev server runs: a story's worktree, or a feature's checkout (made now when it has none). */
  async function placeOf(
    dir: string,
    scanned: Scan,
    id: string,
  ): Promise<{ folder: string; temp: TempCheckout | null }> {
    const found = ownedIn(scanned, id);
    const card = found?.owned.card;
    if (card?.type === "story" && found?.root && !samePath(found.root, dir)) return { folder: found.root, temp: null };
    const look = card?.type === "feature" ? await lookAt(git, scanned, id) : null;
    if (!look) throw new ApiError(PROOF_COPY.noBrowser(id));
    if (look.root) return { folder: look.root, temp: null };
    // A server running already needs no checkout: the pane reuses it.
    if (servers.running(dir, id)) return { folder: look.top, temp: null };
    const made = await checkoutAt(git, look.top, look.tip, PREVIEW_PREFIX);
    if (!made.ok) throw new ApiError(`Couldn't check out the feature branch: ${made.error}`);
    return { folder: made.checkout.folder, temp: made.checkout };
  }

  /** Installs dependencies in a fresh checkout; settles once done, rejecting with why it failed. */
  function installIn(folder: string, command: string): Session["install"] {
    const control = run(command, folder);
    const done = control.done.then((r) => {
      if (r.code === 0) return;
      const output = lastLines(`${r.timedOut ? "Timed out.\n" : ""}${r.output}`);
      throw new ApiError(output ? `${PROOF_COPY.notes.installFailed}\n${output}` : PROOF_COPY.notes.installFailed);
    });
    done.catch(() => {});
    return { control, done };
  }

  /** A new pane: where its server runs, with the checkout made and its install started when it needs one. */
  async function prepare(pane: string, dir: string, id: string, tie: BrowserTie): Promise<Session> {
    await sweeps.get(dir);
    const scanned = await scan(dir);
    if (!scanned) throw new ApiError(PROOF_COPY.noBrowser(id));
    const config = scanned.collected.config;
    const command = await settings.command(dir, config);
    if (!command.ok) throw new ApiError(command.note);
    const place = await placeOf(dir, scanned, id);
    const launch = { folder: place.folder, command: command.command, url: config.devServerUrl ?? "" };
    const s: Session = { dir, id, launch, temp: place.temp, install: null, untie: () => {} };
    sessions.set(pane, s);
    // Only while this session is the pane's: its own end unties it, which must not stop a start queued after it.
    s.untie = tie(() => {
      if (sessions.get(pane) === s) void stop(pane);
    });
    if (place.temp) {
      const install = await settings.install(dir, config, place.temp.folder);
      if (!install.ok) throw new ApiError(install.note);
      if (install.command) s.install = installIn(place.temp.folder, install.command);
    }
    return s;
  }

  /** Starts the pane's dev server, or holds the one running; its URL. */
  async function serve(pane: string, s: Session): Promise<{ url: string }> {
    const { folder, command, url } = s.launch;
    const claimed = servers.claim(s.dir, s.id, folder, command, url, holderOf(pane));
    const result = await claimed.started;
    if (!result.ok) throw new ApiError(result.output ? `${result.note}\n${result.output}` : result.note);
    // The server runs in the pane's checkout now, which goes when it stops; one that ran already didn't need it.
    if (s.temp && claimed.launched) temps.set(serverKey(s.dir, s.id), s.temp);
    else await remove(s.temp);
    s.temp = null;
    return { url: result.url };
  }

  async function start(pane: string, dir: string, id: string, tie: BrowserTie): Promise<BrowserStart> {
    try {
      let s = sessions.get(pane);
      if (!s) {
        s = await prepare(pane, dir, id, tie);
        if (s.install) return { installing: true };
      }
      if (s.install) {
        await s.install.done;
        s.install = null;
      }
      return await serve(pane, s);
    } catch (err) {
      await end(pane, Infinity);
      throw err;
    }
  }

  /** Lets go of what pane `pane` holds: its install, its server, and the checkouts no server runs in. */
  async function end(pane: string, within: number): Promise<void> {
    const s = sessions.get(pane);
    if (!s) return;
    sessions.delete(pane);
    s.untie();
    if (s.install) {
      s.install.control.cancel();
      await s.install.done.catch(() => {});
    }
    const key = serverKey(s.dir, s.id);
    // Gone: no process of it runs in its checkout any more. Still running (another holder, or a quit that didn't wait
    // long enough), the checkout stays: for that holder, or for the next start's sweep.
    if (await servers.release(s.dir, s.id, holderOf(pane), within)) await remove(temps.get(key));
    if (!servers.running(s.dir, s.id)) temps.delete(key);
    await remove(s.temp);
  }

  function stop(pane: string): Promise<null> {
    // An install is stopped at once, not after the start waiting on it.
    sessions.get(pane)?.install?.control.cancel();
    return inTurn(pane, () => end(pane, Infinity)).then(() => null);
  }

  return {
    /** Starts `id`'s dev server for pane `pane`, or holds the one running; its URL, or that it installs first. */
    start: (pane: string, dir: string, id: string, tie: BrowserTie): Promise<BrowserStart> =>
      inTurn(pane, () => start(pane, dir, id, tie)),
    /** The pane closed: lets go of its dev server, after a start still under way, and of its checkout. */
    stop,
    /** The card with whether the Browser pane can serve it. */
    decorate(dir: string, scanned: Scan | null, view: CardView | null): CardView | null {
      if (!view || !servable(dir, scanned, view)) return view;
      return { ...view, browser: true as const };
    },
    /** Removes the preview checkouts a quit left behind in each project not swept yet: it just opened. */
    sweep(dirs: readonly string[]) {
      for (const dir of dirs) {
        if (sweeps.has(dir)) continue;
        const swept = (async () => {
          for (const folder of await checkoutsNamed(git, dir, PREVIEW_PREFIX)) await remove({ top: dir, folder });
        })().catch((err: unknown) => log(`Couldn't sweep preview checkouts: ${why(err)}`));
        sweeps.set(dir, swept);
      }
    },
    /** Lets go of what every open pane holds: the server is closing. Waits a while for each server to end. */
    async close() {
      await Promise.all(
        [...sessions.keys()].map((pane) => {
          sessions.get(pane)?.install?.control.cancel();
          return inTurn(pane, () => end(pane, quitMs));
        }),
      );
      await Promise.all(sweeps.values());
    },
  };
}

export type BrowserPreview = ReturnType<typeof createBrowserPreview>;
