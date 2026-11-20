/**
 * STORY-68 (the MCP side): `request_action` through the real Featra MCP process over stdio, into the real Featra
 * services (agent bridge, action request, approval desk, Inbox). The chat never runs a turn here, so the Agent SDK is
 * not exercised; the user answers through the window socket's `chat.approve`, as the card's buttons do.
 */
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { until } from "@featra/tooling/waits";
import {
  ACTION_LIMITS,
  ACTION_MESSAGES,
  ACTION_RESULTS,
  CHAT_MESSAGES,
  REQUEST_ACTION_TOOL,
  type ChatEvent,
  type Inbox,
  type InboxItem,
} from "@featra/work-format";
import {
  createAllowedProjects,
  createServices,
  startServer,
  type Api,
  type ClaudeDeps,
  type RunningServer,
} from "@featra/server";
import { TOOLS } from "../src/index.ts";

const MAIN = fileURLToPath(new URL("../src/main.ts", import.meta.url));

const claude: ClaudeDeps = {
  locate: async () => "/usr/local/bin/claude",
  env: {},
  loadQuery: async () => (() => ({})) as never,
};

let root = "";
let project = "";
let chat = "";
let server: RunningServer;
let services: ReturnType<typeof createServices>;
let agent: Client;
const connection = { push: () => {}, keep: () => {}, unwatch: () => false };
const call = (method: Parameters<Api>[0], params: unknown) => services.api(method, params, 1, connection);
const text = (r: unknown) => (r as { content: { text: string }[] }).content[0]?.text ?? "";
const isError = (r: unknown) => (r as { isError?: boolean }).isError === true;
const requestAction = (args: Record<string, unknown>) =>
  agent.callTool({ name: REQUEST_ACTION_TOOL, arguments: args }, undefined, { timeout: 2 ** 31 - 1 });

/** The request waiting in the Inbox, once it is there. */
async function waiting(): Promise<InboxItem> {
  let found: InboxItem | undefined;
  await until(async () => {
    const inbox = (await call("inbox.watch", { dir: project, waitMs: 0 })) as Inbox;
    found = inbox.items.find((i) => i.request.type === "approval" && i.request.name === REQUEST_ACTION_TOOL);
    return found !== undefined;
  });
  return found!;
}

beforeAll(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "featra-mcp-action-")));
  project = join(root, "project");
  await mkdir(join(project, ".featra"), { recursive: true });
  await writeFile(join(project, ".featra", "config.yaml"), "version: 1\n");
  const allowed = createAllowedProjects();
  allowed.set([project]);
  services = createServices({ allowed, log: () => {}, claude, mcpEntry: MAIN });
  server = await startServer({
    token: "window-token-0123456789",
    api: services.api,
    agents: services.agents,
    log: () => {},
  });
  services.agents.setPort(server.port);
  chat = ((await call("chat.start", { dir: project, role: "developer" })) as { id: string }).id;
  const spec = await services.agents.attach({ id: chat, dir: project });
  if (!spec) throw new Error("The bridge offered no MCP.");
  agent = new Client({ name: "agent", version: "0.0.0" });
  await agent.connect(new StdioClientTransport({ ...spec, stderr: "pipe" }));
});

afterAll(async () => {
  await agent.close();
  await server.close();
  await services.close();
  await rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
});

describe("request_action through the Featra MCP (AC1)", () => {
  it("is listed with a description that teaches when to use it, and when not", async () => {
    const { tools } = await agent.listTools();
    const tool = tools.find((t) => t.name === REQUEST_ACTION_TOOL);
    expect(tool?.description).toBe(TOOLS.find((t) => t.name === REQUEST_ACTION_TOOL)?.description);
    expect(tool?.inputSchema.required).toEqual(["title", "steps"]);
    // The limits the server holds the call to, told up front (review nit).
    expect(tool?.inputSchema.properties).toMatchObject({
      title: { maxLength: ACTION_LIMITS.title },
      why: { maxLength: ACTION_LIMITS.why },
      steps: {
        minItems: 1,
        maxItems: ACTION_LIMITS.steps,
        items: {
          properties: { text: { maxLength: ACTION_LIMITS.step }, command: { maxLength: ACTION_LIMITS.command } },
        },
      },
    });
    for (const taught of [
      "only they can do",
      "signing in",
      "sudo",
      "changing a setting",
      "approving something in an external service",
      "Featra never runs the commands",
      "waits until the user answers",
      "Don't use it to ask a question",
    ]) {
      expect(tool?.description).toContain(taught);
    }
  });

  it("tells the agent what to fix when the input is refused, and asks nothing", async () => {
    const none = await requestAction({ steps: [{ text: "Sign in" }] });
    expect(isError(none)).toBe(true);
    expect(text(none)).toBe(`Not done. ${ACTION_MESSAGES.badTitle}`);
    const noSteps = await requestAction({ title: "Sign in", steps: [] });
    expect(isError(noSteps)).toBe(true);
    expect(text(noSteps)).toBe(`Not done. ${ACTION_MESSAGES.badSteps}`);
    const inbox = (await call("inbox.watch", { dir: project, waitMs: 0 })) as Inbox;
    expect(inbox.items).toEqual([]);
  });
});

describe("the agent waits for the user's answer (AC3, AC6)", () => {
  it("waits until Done, which is the call's result, and never runs the command", async () => {
    const marker = join(root, "ran.txt");
    const command = `node -e "require('fs').writeFileSync(${JSON.stringify(marker)}, 'ran')"`;
    let answered = false;
    const result = requestAction({
      title: "Sign in to the CLI",
      why: "The tests need your account.",
      steps: [{ text: "Run this in a terminal.", command }, { text: "Come back here." }],
    }).finally(() => (answered = true));
    const item = await waiting();
    expect(item.request).toMatchObject({
      name: REQUEST_ACTION_TOOL,
      input: {
        title: "Sign in to the CLI",
        why: "The tests need your account.",
        steps: [{ text: "Run this in a terminal.", command }, { text: "Come back here." }],
      },
    });
    // Still waiting: nothing has answered it.
    expect(answered).toBe(false);
    expect(await call("chat.approve", { id: chat, tool: item.request.id, choice: "allow" })).toBeNull();
    const done = await result;
    expect(isError(done)).toBe(false);
    expect(text(done)).toBe(ACTION_RESULTS.done);
    expect(existsSync(marker)).toBe(false);
  });

  it("gives Can't do it and the user's reason as the call's result", async () => {
    const result = requestAction({ title: "Approve the app", steps: [{ text: "Approve it in the console." }] });
    const item = await waiting();
    await call("chat.approve", { id: chat, tool: item.request.id, choice: "deny", reason: "No admin rights here." });
    const cant = await result;
    expect(isError(cant)).toBe(false);
    expect(text(cant)).toBe(ACTION_RESULTS.cant("No admin rights here."));
  });
});

/** The chat's events from now on, as the window hears them. */
async function chatEvents(): Promise<ChatEvent[]> {
  const events: ChatEvent[] = [];
  const watcher = {
    push: (event: string, _watch: number, data: unknown) => {
      if (event === "chat.event") events.push(data as ChatEvent);
    },
    keep: () => {},
    unwatch: () => false,
  };
  await services.api("chat.watch", { id: chat }, 2, watcher);
  return events;
}

/** The project's waiting count in the switcher and the badge, as it is now. */
function waitingCount(): () => number {
  let count = -1;
  const read = (needs: { projects: { dir: string; waiting: number }[] }) => {
    count = needs.projects.find((p) => p.dir === project)?.waiting ?? -1;
  };
  const { needs, stop } = services.needs.watch(read);
  read(needs);
  stops.push(stop);
  return () => count;
}
const stops: (() => void)[] = [];
afterAll(() => stops.splice(0).forEach((stop) => stop()));

/** Waits for it to end as cancelled, off the card and no longer counted; gives what the Inbox then holds. */
async function endedAsCancelled(events: ChatEvent[], item: InboxItem, count: () => number) {
  await until(() => events.some((e) => e.type === "approval-cancelled" && e.id === item.request.id));
  await until(() => count() === 0);
  const inbox = (await call("inbox.watch", { dir: project, waitMs: 0 })) as Inbox;
  return inbox.items;
}

describe("AC3, AC5: a call the agent's host drops ends its request (review B1)", () => {
  it("ends the request when the host gives up on the call, as at its tool timeout or Stop", async () => {
    const events = await chatEvents();
    const count = waitingCount();
    const drop = new AbortController();
    const result = agent.callTool(
      { name: REQUEST_ACTION_TOOL, arguments: { title: "Sign in", steps: [{ text: "Sign in." }] } },
      undefined,
      { signal: drop.signal, timeout: 2 ** 31 - 1 },
    );
    result.catch(() => {});
    const item = await waiting();
    await until(() => count() === 1);
    drop.abort();
    await expect(result).rejects.toThrow(/abort/i);
    expect(await endedAsCancelled(events, item, count)).toEqual([]);
    // Nothing is left to answer: the card's Done reaches no one, and says so.
    await expect(call("chat.approve", { id: chat, tool: item.request.id, choice: "allow" })).rejects.toThrow(
      CHAT_MESSAGES.noRequest,
    );
  });

  it("ends the request when the MCP process goes away", async () => {
    const events = await chatEvents();
    const count = waitingCount();
    const spec = await services.agents.attach({ id: chat, dir: project });
    if (!spec) throw new Error("The bridge offered no MCP.");
    const second = new Client({ name: "agent-2", version: "0.0.0" });
    await second.connect(new StdioClientTransport({ ...spec, stderr: "pipe" }));
    const result = second.callTool(
      { name: REQUEST_ACTION_TOOL, arguments: { title: "Sign in", steps: [{ text: "Sign in." }] } },
      undefined,
      { timeout: 2 ** 31 - 1 },
    );
    result.catch(() => {});
    const item = await waiting();
    await until(() => count() === 1);
    await second.close();
    expect(await endedAsCancelled(events, item, count)).toEqual([]);
  });
});
