/**
 * The project's dev server, one per story, in the story's worktree (STORY-25, ADR 0044). Started on demand with the project's
 * confirmed dev-server command, the way check commands run (check-run.ts), and reused while it runs. Each is stopped
 * when its story ends (merged or abandoned, before its worktree goes), its project closes or the app quits; Featra stops only the servers it started.
 *
 * The command may hold `{port}`: Featra puts the configured port there, or a free one when that is taken, and sets
 * `PORT` to it too. Without `{port}` it can't move the server, so a taken port is a note saying so.
 */
import { get } from "node:http";
import { createServer } from "node:net";
import { devServerPort, PROOF_COPY, withPort, type ProofNote } from "@featra/work-format";
import { runCommand, type RunControl } from "./check-run.ts";

/** How long a dev server has to answer on its URL. */
export const DEV_SERVER_START_MS = 60_000;
/** How long between asks while waiting for it. */
const ASK_EVERY_MS = 250;
/** The lines of its output a note shows when it didn't start. */
const NOTE_LINES = 20;

export type DevServerStart = { ok: true; url: string } | ({ ok: false } & ProofNote);

export interface DevServerDeps {
  /** Starts the command: check-run's runner in the app. */
  run?: (command: string, cwd: string, env: Readonly<Record<string, string>>) => RunControl;
  /** Whether something answers HTTP at `url`. */
  answers?: (url: string) => Promise<boolean>;
  /** Whether nothing listens on `port` on this computer. */
  portFree?: (port: number) => Promise<boolean>;
  /** A port nothing listens on, from the OS. */
  freePort?: () => Promise<number>;
  wait?: (ms: number) => Promise<void>;
  now?: () => number;
  startMs?: number;
}

interface Running {
  project: string;
  /** Null until its command is spawned. */
  control: RunControl | null;
  /** Settles once it answers on its URL or fails to; started is the answer. */
  started: Promise<DevServerStart>;
  /** Featra stopped it, or asked to before it spawned. */
  stopped: boolean;
  /** Its process ended: it is never killed after, so a reused process id is never touched. */
  exited: boolean;
}
const listenOn = (port: number) =>
  new Promise<number | null>((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(null));
    probe.listen(port, "127.0.0.1", () => {
      const address = probe.address();
      const got = typeof address === "object" && address ? address.port : null;
      probe.close(() => resolve(got));
    });
  });

const httpAnswers = (url: string) =>
  new Promise<boolean>((resolve) => {
    const request = get(url, { timeout: 2000 }, (response) => {
      response.resume();
      resolve(true);
    });
    request.once("timeout", () => request.destroy());
    request.once("error", () => resolve(false));
  });

/** The last lines of what the server printed. */
const lastLines = (output: string) => output.trimEnd().split("\n").slice(-NOTE_LINES).join("\n");

/** A story's key: its project and id. */
const keyOf = (project: string, story: string) => `${project}\n${story}`;

export function createDevServers({
  run = (command, cwd, env) => runCommand(command, cwd, null, env),
  answers = httpAnswers,
  portFree = async (port) => (await listenOn(port)) !== null,
  freePort = async () => (await listenOn(0)) ?? 0,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
  startMs = DEV_SERVER_START_MS,
}: DevServerDeps = {}) {
  /** By story: the project and the story's id. A start is kept from the ask, so a second ask waits on the first. */
  const servers = new Map<string, Running>();
  /** The command, URL and port it runs with, or why it can't run. */
  async function plan(command: string, url: string) {
    const port = devServerPort(url);
    if (port === null) return { ok: false as const, note: PROOF_COPY.notes.noUrl };
    const free = await portFree(port);
    if (!command.includes("{port}")) {
      return free
        ? { ok: true as const, command, url, port }
        : { ok: false as const, note: PROOF_COPY.notes.portTaken(port) };
    }
    const use = free ? port : await freePort();
    return {
      ok: true as const,
      command: command.replaceAll("{port}", String(use)),
      url: withPort(url, use),
      port: use,
    };
  }

  async function waitUntilUp(entry: Running, control: RunControl, url: string): Promise<DevServerStart> {
    const until = now() + startMs;
    for (;;) {
      if (entry.stopped || entry.exited) break;
      if (await answers(url)) return { ok: true, url };
      if (now() >= until) break;
      await wait(ASK_EVERY_MS);
    }
    if (!entry.exited && !entry.stopped) control.cancel();
    const output = lastLines(control.output());
    return { ok: false, note: PROOF_COPY.notes.notStarted, ...(output ? { output } : {}) };
  }

  async function launch(entry: Running, command: string, worktree: string, url: string): Promise<DevServerStart> {
    const planned = await plan(command, url);
    if (!planned.ok) return { ok: false, note: planned.note };
    if (entry.stopped) return { ok: false, note: PROOF_COPY.notes.notStarted };
    const control = run(planned.command, worktree, { PORT: String(planned.port) });
    entry.control = control;
    void control.done.then(() => {
      entry.exited = true;
    });
    return waitUntilUp(entry, control, planned.url);
  }

  function stop(key: string) {
    const entry = servers.get(key);
    if (!entry) return;
    servers.delete(key);
    if (entry.stopped) return;
    entry.stopped = true;
    if (entry.control && !entry.exited) entry.control.cancel();
  }

  return {
    /**
     * The dev server of story `story` of `project`, started with `command` in its `worktree` unless it runs already; its
     * URL once it answers, else why not.
     */
    start(project: string, story: string, worktree: string, command: string, url: string): Promise<DevServerStart> {
      const key = keyOf(project, story);
      const known = servers.get(key);
      if (known && !known.exited) return known.started;
      const entry: Running = {
        project,
        control: null,
        started: Promise.resolve({ ok: false, note: "" }),
        stopped: false,
        exited: false,
      };
      servers.set(key, entry);
      entry.started = launch(entry, command, worktree, url).then((result) => {
        // One that didn't start isn't kept, so the next ask starts it again.
        if (!result.ok && servers.get(key) === entry) servers.delete(key);
        return result;
      });
      return entry.started;
    } /** Stops story `story`'s dev server, if Featra runs one: the story is ending and its worktree going. */,
    stop: (project: string, story: string) => stop(keyOf(project, story)),
    /** Stops the dev servers of every project not in `open`: they closed. */
    keepProjects(open: readonly string[]) {
      for (const [key, entry] of servers) if (!open.includes(entry.project)) stop(key);
    },
    /** Stops every dev server Featra runs: the app is quitting. */
    stopAll() {
      for (const key of servers.keys()) stop(key);
    },
    /** Whether Featra runs story `story`'s dev server now. */
    running(project: string, story: string) {
      const entry = servers.get(keyOf(project, story));
      return Boolean(entry?.control) && entry?.exited === false;
    },
  };
}

export type DevServers = ReturnType<typeof createDevServers>;
