/**
 * STORY-25: a story's dev server on this computer's own network and processes (dev-servers.ts, ADR 0044): the real port
 * probe, and a real dev server run through the check runner. dev-servers.test.ts fakes them at their boundary.
 */
import { describe, expect, it } from "vitest";
import { createServer } from "node:net";
import { PROOF_COPY } from "@featra/work-format";
import { runCommand, type RunControl } from "../src/check-run.ts";
import { createDevServers } from "../src/dev-servers.ts";

const DIR = "D:/p";
const TREE = "D:/p/.claude/worktrees/STORY-1-x";
describe("the port probe on this computer", () => {
  it("finds a port taken on ::1, where servers bound to localhost often listen", async () => {
    const other = createServer();
    const port = await new Promise<number>((resolve, reject) => {
      other.once("error", reject);
      other.listen(0, "::1", () => {
        const address = other.address();
        resolve(typeof address === "object" && address ? address.port : 0);
      });
    });
    try {
      const servers = createDevServers({ run: () => expect.unreachable("nothing is started") });
      const r = await servers.start(DIR, "STORY-1", TREE, "pnpm dev", `http://127.0.0.1:${port}`);
      expect(r).toEqual({ ok: false, note: PROOF_COPY.notes.portTaken(port) });
    } finally {
      await new Promise((resolve) => other.close(resolve));
    }
  });
});

describe("a real dev server through the check runner", () => {
  it("starts, answers on the port Featra gave it, and is stopped", async () => {
    // A port the OS has just handed out, so this test never meets another process's server.
    const port = await new Promise<number>((resolve) => {
      const probe = createServer().listen(0, "127.0.0.1", () => {
        const address = probe.address();
        probe.close(() => resolve(typeof address === "object" && address ? address.port : 0));
      });
    });
    const runs: RunControl[] = [];
    const servers = createDevServers({
      run: (command, cwd, env) => {
        const control = runCommand(command, cwd, null, env);
        runs.push(control);
        return control;
      },
    });
    const script = "require('http').createServer((q,s)=>s.end('ok')).listen(Number(process.env.PORT),'127.0.0.1')";
    const r = await servers.start(DIR, "STORY-1", process.cwd(), `node -e "${script}"`, `http://127.0.0.1:${port}`);
    expect(r).toEqual({ ok: true, url: `http://127.0.0.1:${port}` });
    const body = await fetch(`http://127.0.0.1:${port}/`).then((res) => res.text());
    expect(body).toBe("ok");

    servers.stop(DIR, "STORY-1");
    const ended = await runs[0]?.done;
    expect(ended?.code === 0).toBe(false);
    expect(servers.running(DIR, "STORY-1")).toBe(false);
  });
});
