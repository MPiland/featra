/** STORY-56: the checks bridge and Re-run over the real server client. Only the network is faked. */
import { describe, expect, it } from "vitest";
import { noChecks, serverChecks } from "../src/bridge.ts";
import { serverCards } from "../src/card-pane.ts";
import { setup } from "./fake-socket.ts";

async function connected() {
  const s = setup();
  const checks = serverChecks(s.client);
  const cards = serverCards(s.client);
  return { ...s, checks, cards };
}

describe("checks over the client", () => {
  it("loads the section and sends the user's patch, and reads each answer as the server's view", async () => {
    const { socket, checks } = await connected();
    const loaded = checks.load("/p");
    const ws = await socket();
    ws.open();
    await expect.poll(() => ws.sent.length).toBe(1);
    expect(ws.sent[0]).toMatchObject({ method: "checks.load", params: { dir: "/p" } });
    ws.answer({
      id: 1,
      ok: true,
      result: { where: "ci", chosen: true, reason: "", command: "pnpm test", proposals: [], error: null },
    });
    expect(await loaded).toMatchObject({ where: "ci", chosen: true, command: "pnpm test", testCommand: null });

    const saved = checks.set("/p", { command: null });
    await expect.poll(() => ws.sent.length).toBe(2);
    expect(ws.sent[1]).toMatchObject({ method: "checks.set", params: { dir: "/p", patch: { command: null } } });
    ws.answer({ id: 2, ok: true, result: { where: "ci", chosen: true, reason: "", proposals: [], error: null } });
    expect((await saved).command).toBeNull();
  });

  it("answers a refusal as the section with the reason, never a throw", async () => {
    const { socket, checks } = await connected();
    const loaded = checks.load("/p");
    const ws = await socket();
    ws.open();
    await expect.poll(() => ws.sent.length).toBe(1);
    ws.answer({ id: 1, ok: false, error: "Not an open project." });
    expect(await loaded).toMatchObject({ error: "Not an open project.", proposals: [] });
  });

  it("has no checks in a browser tab", async () => {
    expect(await noChecks("No folder.").load("/p")).toMatchObject({ error: "No folder." });
    expect(await noChecks("No folder.").set("/p", {})).toMatchObject({ error: "No folder." });
  });

  it("asks the server to re-run a story's checks, and says why when it won't", async () => {
    const { socket, cards } = await connected();
    const ok = cards.rerunChecks("/p", "STORY-5");
    const ws = await socket();
    ws.open();
    await expect.poll(() => ws.sent.length).toBe(1);
    expect(ws.sent[0]).toMatchObject({ method: "story.rerunChecks", params: { dir: "/p", id: "STORY-5" } });
    ws.answer({ id: 1, ok: true, result: {} });
    expect(await ok).toEqual({ ok: true });
    const refused = cards.rerunChecks("/p", "STORY-9");
    await expect.poll(() => ws.sent.length).toBe(2);
    ws.answer({ id: 2, ok: false, error: "STORY-9 isn't in review." });
    expect(await refused).toEqual({ ok: false, error: "STORY-9 isn't in review." });
  });
});
