import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { afterAll, describe, expect, it } from "vitest";
import { createAgentBridge, createLogWriter, startServer, type LogFs } from "@featra/server";

/**
 * The Featra MCP an agent starts is the built `mcp.cjs`, not the TypeScript the unit tests drive, and a bundle can
 * fail where the source runs (a missing dependency, a top-level await). Builds it with the real Vite config, starts it
 * over stdio the way an agent's SDK does, against a real server with a memory disk, and has it log a decision.
 */
const desktop = join(import.meta.dirname, "..");
const out = mkdtempSync(join(tmpdir(), "featra-mcp-"));
afterAll(() => rmSync(out, { recursive: true, force: true }));

const DIR = "/work/featra";
const TOKEN = "window-token-0123456789";

describe("the MCP bundle", () => {
  it("starts over stdio, offers its tools and logs a decision through the server", async () => {
    execFileSync(
      process.execPath,
      [join(desktop, "node_modules", "vite", "bin", "vite.js"), "build", "--mode", "mcp", "--outDir", out],
      { cwd: desktop, stdio: "pipe" },
    );
    const bundle = join(out, "mcp.cjs");

    const files = new Map<string, string>();
    const fs: LogFs = {
      read: (file) => Promise.resolve(files.get(file) ?? null),
      write: (file, text) => {
        files.set(file, text);
        return Promise.resolve();
      },
    };
    const bridge = createAgentBridge({
      entry: bundle,
      enabled: () => Promise.resolve(true),
      chats: {
        info: (id) => (id === "chat-1" ? { dir: DIR, session: "Developer chat 1a2b3c4d" } : null),
        report: () => {},
        retitle: () => {},
      },
      writer: createLogWriter({ fs, platform: "linux" }),
    });
    const server = await startServer({ token: TOKEN, api: () => Promise.resolve(null), agents: bridge, log: () => {} });
    bridge.setPort(server.port);
    const spec = await bridge.attach({ id: "chat-1", dir: DIR });
    expect(spec?.args).toEqual([bundle]);

    const child = spawn(process.execPath, [bundle], { env: { ...process.env, ...spec?.env }, stdio: "pipe" });
    const answers = new Map<number, (message: Record<string, unknown>) => void>();
    createInterface({ input: child.stdout }).on("line", (line) => {
      const message = JSON.parse(line) as Record<string, unknown>;
      answers.get(message.id as number)?.(message);
    });
    let id = 0;
    const call = (method: string, params: unknown) =>
      new Promise<Record<string, unknown>>((resolve) => {
        const mine = ++id;
        answers.set(mine, resolve);
        child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: mine, method, params })}\n`);
      });
    try {
      await call("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "smoke", version: "0.0.0" },
      });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);

      const listed = await call("tools/list", {});
      const names = ((listed.result as { tools: { name: string }[] }).tools ?? []).map((t) => t.name);
      expect(names).toEqual([
        "log_decision",
        "defer_question",
        "draft_cards",
        "start_feature",
        "spawn_session",
        "update_card",
      ]);

      const logged = await call("tools/call", {
        name: "log_decision",
        arguments: { decision: "Ship the bundle", why: "Agents run it, not the source." },
      });
      expect((logged.result as { isError?: boolean }).isError).toBeFalsy();
      expect(files.get(join(DIR, "decisions.md"))).toContain("Ship the bundle");
    } finally {
      child.kill();
      await server.close();
    }
  }, 120_000);
});
