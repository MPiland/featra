/**
 * One `git cat-file --batch` process that answers several rounds of object names (BUG-6). Each git start costs about
 * 200 ms on Windows, and over 1 s under load, so a scan asks for its trees and then their blobs through the same one.
 */
import { spawn } from "node:child_process";
import { failed, gitEnv, spawnError } from "./git-run.ts";

/** An object git printed for a name, or null when it has none (`missing`, `ambiguous`). */
export type BatchObject = { sha: string; type: string; data: Buffer } | null;

export interface GitBatch {
  /** The objects for `names`, in order. Rounds are answered in the order they were asked. */
  get: (names: readonly string[]) => Promise<BatchObject[]>;
  /** Ends the process once every round asked so far is answered. */
  close: () => Promise<void>;
}

interface Round {
  left: number;
  got: BatchObject[];
  done: (objects: BatchObject[]) => void;
  fail: (err: Error) => void;
}

export function openBatch(command: string, dir: string): GitBatch {
  const child = spawn(command, ["cat-file", "--batch"], { cwd: dir, env: gitEnv(), windowsHide: true });
  const rounds: Round[] = [];
  const err: Buffer[] = [];
  let out: Buffer = Buffer.alloc(0);
  let ended: Error | null = null;

  const answer = (object: BatchObject) => {
    const round = rounds[0];
    if (!round) return;
    round.got.push(object);
    if (--round.left > 0) return;
    rounds.shift();
    round.done(round.got);
  };

  /** Takes every whole answer off the front of `out`: `<sha> <type> <size>\n<bytes>\n`, or `<name> missing\n`. */
  const drain = () => {
    for (;;) {
      const eol = out.indexOf(10);
      if (eol < 0) return;
      const header = out.subarray(0, eol).toString("utf8").split(" ");
      const last = header.at(-1);
      if (last === "missing" || last === "ambiguous") {
        out = out.subarray(eol + 1);
        answer(null);
        continue;
      }
      const [sha = "", type = "", size = "0"] = header;
      const end = eol + 1 + Number(size);
      if (out.length < end + 1) return;
      answer({ sha, type, data: Buffer.from(out.subarray(eol + 1, end)) });
      out = out.subarray(end + 1);
    }
  };

  const stop = (reason: Error) => {
    ended = reason;
    for (const round of rounds.splice(0)) round.fail(reason);
  };

  child.stdout.on("data", (b: Buffer) => {
    out = out.length ? Buffer.concat([out, b]) : b;
    drain();
  });
  child.stderr.on("data", (b: Buffer) => err.push(b));
  child.stdin.on("error", () => {
    // The process ended early; `close` below says why.
  });
  child.on("error", (e) => stop(spawnError(e)));
  const closed = new Promise<void>((resolve) => {
    child.on("close", (code) => {
      const r = { code: code ?? -1, stdout: "", stderr: Buffer.concat(err).toString("utf8") };
      stop(failed("git cat-file", r));
      resolve();
    });
  });

  return {
    get(names) {
      if (!names.length) return Promise.resolve([]);
      if (ended) return Promise.reject(ended);
      return new Promise((done, fail) => {
        rounds.push({ left: names.length, got: [], done, fail });
        child.stdin.write(`${names.join("\n")}\n`);
      });
    },
    async close() {
      if (!ended) child.stdin.end();
      await closed;
    },
  };
}

/** One entry of a tree object. `kind` is `blob` for files and links, `tree` or `commit` otherwise. */
export interface TreeEntry {
  name: string;
  sha: string;
  kind: "blob" | "tree" | "commit";
}

/** The entries of a tree from `get`: `<mode> <name>\0<raw id>` each, the id as long as the tree's own. */
export function treeEntries(tree: BatchObject): TreeEntry[] {
  if (tree?.type !== "tree") return [];
  const { data } = tree;
  const idBytes = tree.sha.length / 2;
  const entries: TreeEntry[] = [];
  let at = 0;
  while (at < data.length) {
    const space = data.indexOf(32, at);
    const nul = space < 0 ? -1 : data.indexOf(0, space);
    if (nul < 0) break;
    const mode = data.toString("latin1", at, space);
    const kind = mode === "40000" ? "tree" : mode === "160000" ? "commit" : "blob";
    const name = data.toString("utf8", space + 1, nul);
    entries.push({ name, sha: data.subarray(nul + 1, nul + 1 + idBytes).toString("hex"), kind });
    at = nul + 1 + idBytes;
  }
  return entries;
}
