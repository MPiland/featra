/**
 * STORY-5 AC4: Featra never reads a credential file to tell whether `claude` is logged in. Every path the server
 * touches through node:fs while a chat finds `claude`, starts, and learns it is logged out is recorded (the platform
 * is faked; the code under test is real), and none is a credential or login file.
 */
import type * as Fs from "node:fs";
import type * as FsPromises from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { foldChat, type ChatEvent } from "@featra/work-format";
import { createChatManager, type ChatManager } from "../src/chat-manager.ts";
import { locateClaude } from "../src/claude-locate.ts";
import { createClaudeProvider } from "../src/claude-provider.ts";
import { createRoleRegistry } from "../src/role-registry.ts";
import { fakeQuery, sdk } from "./fake-query.ts";
import { until } from "./until.ts";

const touched = vi.hoisted(() => [] as string[]);

/** Wraps every function of an fs module so each path argument is recorded. */
function recording<T extends object>(mod: T): T {
  return Object.fromEntries(
    Object.entries(mod).map(([name, value]) => [
      name,
      typeof value === "function"
        ? (...args: unknown[]) => {
            for (const a of args) if (typeof a === "string" || a instanceof URL) touched.push(String(a));
            return (value as (...a: unknown[]) => unknown)(...args);
          }
        : value,
    ]),
  ) as T;
}

vi.mock("node:fs", async (original) => {
  const real = await original<typeof Fs>();
  return { ...recording(real), default: recording(real) };
});
vi.mock("node:fs/promises", async (original) => {
  const real = await original<typeof FsPromises>();
  return { ...recording(real), default: recording(real) };
});

// An npm install on Windows: the lookup finds the .cmd shim and follows it to its script with existsSync.
const lookup = async () => "C:\\Users\\me\\AppData\\Roaming\\npm\\claude.cmd\r\n";
const CREDENTIALS = /credential|\.claude\.json|auth|token|keychain|login/i;
let manager: ChatManager | null = null;
afterEach(() => manager?.close());

describe("AC4: logged out is learned from claude itself, never from a credential file", () => {
  it("touches no credential file while finding claude, starting it, and hearing it is logged out", async () => {
    const fake = fakeQuery();
    manager = createChatManager({
      providers: [
        createClaudeProvider({
          loadQuery: async () => fake.query,
          locate: () => locateClaude(lookup, "win32"),
          env: {},
        }),
      ],
      roles: createRoleRegistry(),
    });
    const id = await manager.start("/home/me/demo", "researcher");
    const events: ChatEvent[] = [];
    manager.watch(id, (e) => events.push(e));
    manager.send(id, "hello");
    await until(() => fake.runs[0]?.heard.length === 1);
    fake.runs[0]!.say(
      sdk.init(),
      sdk.assistant("m1", [sdk.text("Not logged in")], { error: "authentication_failed" }),
      sdk.failure({ result: "Not logged in · Please run /login" }),
    );
    await until(() => !foldChat(events).running);
    expect(foldChat(events).items.at(-1)).toMatchObject({ kind: "notice", notice: { type: "logged-out" } });
    expect(touched.length).toBeGreaterThan(0);
    expect(touched.filter((p) => CREDENTIALS.test(p))).toEqual([]);
  });
});
