/**
 * STORY-66: `needs.watch` over the real socket and the real services (ADR 0018), across two real repositories. Only the
 * Agent SDK's `query` (and its `canUseTool` calls) and the PATH lookup are fake.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { NeedsList } from "@featra/work-format";
import { createAllowedProjects } from "../src/allowed-projects.ts";
import { createServices } from "../src/services.ts";
import { startServer, type RunningServer } from "../src/ws-server.ts";
import { card, cardRepo, type CardRepo } from "./card-repo.ts";
import { fakeClaude, sdk } from "./fake-query.ts";
import { until } from "./until.ts";
import { openFrames } from "./ws-frames.ts";

const TOKEN = "test-token-0123456789";
const BASH = { command: "npm test" };
const allowed = createAllowedProjects();
const claude = fakeClaude("/usr/local/bin/claude");
const services = createServices({ allowed, log: () => {}, claude: claude.deps });
let server: RunningServer;
let a: CardRepo;
let b: CardRepo;
const open = () => openFrames<unknown>(`${server.url}?token=${TOKEN}`);

beforeAll(async () => {
  a = await cardRepo("alpha");
  b = await cardRepo("beta");
  await b.write(b.main, card("FEAT-2", "feature", null, "draft", { extra: { "drafted-by": "chat-1" } }));
  for (const repo of [a, b]) repo.commit(repo.main, "plan");
  allowed.set([a.main, b.main]);
  server = await startServer({ token: TOKEN, api: services.api, log: () => {} });
});

afterAll(async () => {
  await server.close();
  await services.close();
  await a.dispose();
  await b.dispose();
});

describe("STORY-66: needs.watch", () => {
  it("answers every open project's needs, pushes each change, and stops at work.unwatch", async () => {
    const socket = await open();
    try {
      socket.send({ id: 1, method: "needs.watch", params: {} });
      expect(await socket.next((f) => f.id === 1)).toEqual({
        id: 1,
        ok: true,
        result: {
          projects: [
            { dir: a.main, waiting: 0, review: false },
            { dir: b.main, waiting: 0, review: true },
          ],
        },
      });

      socket.send({ id: 2, method: "chat.start", params: { dir: a.main, role: "developer" } });
      const { id } = (await socket.next((f) => f.id === 2)).result as { id: string };
      socket.send({ id: 3, method: "chat.send", params: { id, text: "test it" } });
      await socket.next((f) => f.id === 3);
      await until(() => claude.runs[0]?.heard.length === 1);
      const run = claude.runs[0]!;
      run.say(sdk.init(), sdk.assistant("m1", [sdk.toolUse("t1", "Bash", BASH)]));
      const asked = run.ask("Bash", BASH, "t1");

      const waiting = await socket.next((f) => f.event === "needs.list" && f.watch === 1);
      expect((waiting.data as NeedsList).projects).toEqual([
        { dir: a.main, waiting: 1, review: false },
        { dir: b.main, waiting: 0, review: true },
      ]);

      socket.send({ id: 4, method: "chat.approve", params: { id, tool: "t1", choice: "allow" } });
      await socket.next((f) => f.id === 4);
      await asked;
      const cleared = await socket.next(
        (f) => f.event === "needs.list" && f.watch === 1 && (f.data as NeedsList).projects[0]?.waiting === 0,
      );
      expect((cleared.data as NeedsList).projects[1]).toEqual({ dir: b.main, waiting: 0, review: true });

      socket.send({ id: 5, method: "work.unwatch", params: { watch: 1 } });
      expect(await socket.next((f) => f.id === 5)).toEqual({ id: 5, ok: true, result: null });
      const before = socket.frames.length;
      await b.write(b.main, card("FEAT-2", "feature", null, "approved", { extra: { "drafted-by": "chat-1" } }));
      // A watch that is still open sees the change; the stopped one heard nothing.
      socket.send({ id: 6, method: "needs.watch", params: {} });
      await until(() =>
        socket.frames.some(
          (f) =>
            (f.id === 6 || (f.event === "needs.list" && f.watch === 6)) &&
            ((f.id === 6 ? f.result : f.data) as NeedsList).projects[1]?.review === false,
        ),
      );
      expect(socket.frames.slice(before).some((f) => f.event === "needs.list" && f.watch === 1)).toBe(false);
    } finally {
      socket.close();
    }
  });
});
