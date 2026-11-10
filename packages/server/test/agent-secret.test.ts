/** STORY-47: an agent's secret is compared the way the window's token is, in constant time. */
import { describe, expect, it, vi } from "vitest";
import { createAgentBridge } from "../src/agent-bridge.ts";
import { createLogWriter } from "../src/log-writer.ts";
import * as secret from "../src/secret.ts";

vi.mock("../src/secret.ts", async (original) => {
  const real = await original<typeof secret>();
  return { ...real, sameSecret: vi.fn<typeof secret.sameSecret>(real.sameSecret) };
});

/** A bridge with two chats, whose secrets are `secret-1` and `secret-2`. */
async function twoChats() {
  let n = 0;
  const bridge = createAgentBridge({
    entry: "/app/mcp.cjs",
    exists: async () => true,
    enabled: async () => true,
    chats: { info: () => null, report: () => {} },
    writer: createLogWriter(),
    newToken: () => `secret-${++n}`,
  });
  bridge.setPort(1);
  await bridge.attach({ id: "chat-a", dir: "/work" });
  await bridge.attach({ id: "chat-b", dir: "/work" });
  return bridge;
}

describe("comparing secrets", () => {
  it("is true for the same secret only", () => {
    expect(secret.sameSecret("abc", "abc")).toBe(true);
    expect(secret.sameSecret("abc", "abd")).toBe(false);
    expect(secret.sameSecret("abc", "abcd")).toBe(false);
    expect(secret.sameSecret("", "abc")).toBe(false);
  });
});

describe("resolving an agent's secret", () => {
  it("compares through sameSecret, against every chat's secret whether or not one matched", async () => {
    const bridge = await twoChats();
    vi.mocked(secret.sameSecret).mockClear();
    expect(bridge.resolve("secret-1")).toBe("chat-a");
    expect(secret.sameSecret).toHaveBeenCalledTimes(2);
    expect(bridge.resolve("secret-2")).toBe("chat-b");
    expect(bridge.resolve("secret-")).toBeNull();
    expect(bridge.resolve("")).toBeNull();
  });
});
