/**
 * Runs one check command (STORY-56): through the platform's shell, as typed, in a worktree. It costs no tokens and never
 * blocks the server. What it printed is kept only as a bounded tail, which is where a failure says why, and a run that
 * takes too long is killed with its children.
 */
import { spawn, spawnSync } from "node:child_process";
import { gitEnv } from "./git-run.ts";

export const OUTPUT_TAIL = 20_000;
export const RUN_TIMEOUT_MS = 10 * 60_000;

export interface RunResult {
  /** The exit code; null when the command was killed or could not start. */
  code: number | null;
  /** The end of what it printed, without colour codes. */
  output: string;
  timedOut: boolean;
}

export interface RunControl {
  /** Kills the run (the app is closing). */
  cancel: () => void;
  done: Promise<RunResult>;
}

// ESC [ ... letter: colour and cursor codes, which a card cannot show.
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[A-Za-z]`, "g");

export const tail = (text: string, max = OUTPUT_TAIL) => (text.length > max ? `...${text.slice(-max)}` : text);

function kill(pid: number | undefined) {
  if (pid === undefined) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { windowsHide: true });
  else {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }
}

export function runCommand(command: string, cwd: string, timeoutMs = RUN_TIMEOUT_MS): RunControl {
  let output = "";
  let timedOut = false;
  const child = spawn(command, {
    cwd,
    env: { ...gitEnv(), CI: "true", FORCE_COLOR: "0" },
    shell: true,
    windowsHide: true,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const take = (chunk: Buffer) => {
    output = tail(output + chunk.toString("utf8"), OUTPUT_TAIL * 2);
  };
  child.stdout.on("data", take);
  child.stderr.on("data", take);
  const timer = setTimeout(() => {
    timedOut = true;
    kill(child.pid);
  }, timeoutMs);
  const done = new Promise<RunResult>((resolve) => {
    let ended = false;
    const end = (code: number | null) => {
      if (ended) return;
      ended = true;
      clearTimeout(timer);
      resolve({ code, output: tail(output.replace(ANSI, "")), timedOut });
    };
    child.on("error", (err) => {
      output += `${err.message}\n`;
      end(null);
    });
    child.on("close", (code) => end(code));
  });
  return { cancel: () => kill(child.pid), done };
}
