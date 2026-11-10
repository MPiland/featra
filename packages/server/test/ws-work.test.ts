import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAllowedProjects } from "../src/allowed-projects.ts";
import { createServices } from "../src/services.ts";
import { startServer, type RunningServer } from "../src/ws-server.ts";
import { card, cardPath, cardRepo, type CardRepo } from "./card-repo.ts";
import { openFrames, type SocketFrame } from "./ws-frames.ts";

/** The work methods over the real socket, on a real repository: answers, pushes, unwatch (ADR 0016). */
const TOKEN = "test-token-0123456789";
const allowed = createAllowedProjects();
const logged: string[] = [];
const services = createServices({ allowed, log: (m) => logged.push(m), now: () => new Date("2026-11-05T12:00:00Z") });
let server: RunningServer;
let repo: CardRepo;

interface WorkData {
  epics: { features: { stories: { id: string; title: string }[] }[] }[];
  stale: unknown[];
}
type Frame = SocketFrame<WorkData>;
const open = () => openFrames<WorkData>(`${server.url}?token=${TOKEN}`);

const titles = (f: Frame) => f.data?.epics.flatMap((e) => e.features.flatMap((x) => x.stories.map((s) => s.title)));

beforeAll(async () => {
  repo = await cardRepo();
  await repo.write(repo.main, card("FEAT-1", "feature", null, "draft"));
  await repo.write(repo.main, card("STORY-1", "story", "FEAT-1", "Ready"));
  repo.commit(repo.main, "plan");
  allowed.set([repo.main]);
  server = await startServer({ token: TOKEN, api: services.api, log: (m) => logged.push(m) });
});

afterAll(async () => {
  await server.close();
  await services.close();
  await repo.dispose();
});

describe("work.watch", () => {
  it("answers with the list, then pushes it within 1 s of an owner file edit (STORY-3 AC5)", async () => {
    const socket = await open();
    try {
      socket.send({ id: 1, method: "work.watch", params: { dir: repo.main } });
      const answer = await socket.next((f) => f.id === 1);
      expect(answer.ok).toBe(true);
      const started = Date.now();
      await repo.write(repo.main, card("STORY-1", "story", "FEAT-1", "Ready", { title: "Edited outside" }));
      const push = await socket.next((f) => f.event === "work.list", 1000);
      expect(Date.now() - started).toBeLessThan(1000);
      expect(push).toMatchObject({ event: "work.list", watch: 1 });
      expect(push).not.toHaveProperty("id");
      expect(titles(push)).toEqual(["Edited outside"]);

      socket.send({ id: 2, method: "work.unwatch", params: { watch: 1 } });
      expect(await socket.next((f) => f.id === 2)).toEqual({ id: 2, ok: true, result: null });
      await repo.write(repo.main, card("STORY-1", "story", "FEAT-1", "Ready", { title: "Unwatched" }));
      await expect(socket.next((f) => f.event === "work.list", 400)).rejects.toThrow("No matching frame");
    } finally {
      socket.close();
    }
  });

  it("refuses a folder that isn't open", async () => {
    const socket = await open();
    try {
      socket.send({ id: 3, method: "work.watch", params: { dir: repo.root } });
      expect(await socket.next((f) => f.id === 3)).toEqual({ id: 3, ok: false, error: "Not an open project." });
      socket.send({ id: 4, method: "work.applyCopy", params: { dir: repo.root, key: "main|x" } });
      expect(await socket.next((f) => f.id === 4)).toEqual({ id: 4, ok: false, error: "Not an open project." });
    } finally {
      socket.close();
    }
  });

  it("applies a stale copy and pushes the list without it (STORY-3 AC6)", async () => {
    repo.git(repo.main, "add", "-A");
    repo.git(repo.main, "commit", "-q", "-m", "titles");
    const tree = repo.worktree("claude/story-1", "story-1");
    const socket = await open();
    try {
      await repo.write(repo.main, card("STORY-1", "story", "FEAT-1", "Ready", { title: "Edited in main" }));
      socket.send({ id: 5, method: "work.watch", params: { dir: repo.main } });
      const answer = await socket.next((f) => f.id === 5);
      expect(answer.result).toMatchObject({ stale: [{ key: `main|${cardPath("STORY-1")}`, cardId: "STORY-1" }] });

      socket.send({ id: 6, method: "work.applyCopy", params: { dir: repo.main, key: `main|${cardPath("STORY-1")}` } });
      expect(await socket.next((f) => f.id === 6)).toEqual({ id: 6, ok: true, result: { ok: true } });
      const push = await socket.next((f) => f.event === "work.list" && f.data?.stale.length === 0);
      expect(titles(push)).toEqual(["Edited in main"]);
      expect(await repo.read(tree, "STORY-1")).toContain("title: Edited in main");
    } finally {
      socket.close();
    }
    expect(logged).toEqual([]);
  });
});

describe("card.watch and card.update (ADR 0017)", () => {
  it("answers with the card, pushes it on an outside edit, and saves an edit to the owner", async () => {
    // After the tests above, STORY-1 is owned by its worktree, story-1.
    const tree = `${repo.root}/story-1`;
    const socket = await open();
    try {
      socket.send({ id: 10, method: "card.watch", params: { dir: repo.main, id: "STORY-1" } });
      const answer = await socket.next((f) => f.id === 10);
      expect(answer.result).toMatchObject({ id: "STORY-1", title: "Edited in main", owner: "worktree claude/story-1" });

      const started = Date.now();
      await repo.write(tree, card("STORY-1", "story", "FEAT-1", "Ready", { title: "Edited outside", notes: "n" }));
      const push = await socket.next((f) => f.event === "card.view", 1000);
      expect(Date.now() - started).toBeLessThan(1000);
      expect(push).toMatchObject({ watch: 10, data: { title: "Edited outside", notes: "n" } });

      const edit = { field: "notes", from: "n", to: "from the pane" };
      socket.send({ id: 11, method: "card.update", params: { dir: repo.main, id: "STORY-1", edit } });
      expect(await socket.next((f) => f.id === 11)).toMatchObject({
        ok: true,
        result: { ok: true, view: { notes: "from the pane" } },
      });
      expect(await repo.read(tree, "STORY-1")).toContain("from the pane");

      socket.send({ id: 12, method: "card.update", params: { dir: repo.root, id: "STORY-1", edit } });
      expect(await socket.next((f) => f.id === 12)).toEqual({ id: 12, ok: false, error: "Not an open project." });
      socket.send({ id: 13, method: "card.update", params: { dir: repo.main, id: "STORY-1", edit: { field: "id" } } });
      expect(await socket.next((f) => f.id === 13)).toEqual({
        id: 13,
        ok: false,
        error: "Expected { dir, id, edit }.",
      });
    } finally {
      socket.close();
    }
    expect(logged).toEqual([]);
  });
});

describe("draft.sendBack (STORY-50)", () => {
  it("is checked at the door: an unopened project, malformed params, an empty reason, and a card that isn't a draft", async () => {
    const socket = await open();
    try {
      const ask = async (id: number, params: unknown) => {
        socket.send({ id, method: "draft.sendBack", params });
        return socket.next((f) => f.id === id, 10_000);
      };
      expect(await ask(20, { dir: repo.root, id: "FEAT-1", reason: "x" })).toEqual({
        id: 20,
        ok: false,
        error: "Not an open project.",
      });
      expect(await ask(21, { dir: repo.main, id: "FEAT-1" })).toEqual({
        id: 21,
        ok: false,
        error: "Expected { dir, id, reason }.",
      });
      expect(await ask(22, { dir: repo.main, id: "FEAT-1", reason: "  " })).toEqual({
        id: 22,
        ok: false,
        error: "Say why you're sending it back.",
      });
      // FEAT-1 is a draft nobody drafted: there is no chat to send to.
      expect(await ask(23, { dir: repo.main, id: "FEAT-1", reason: "Too big." })).toEqual({
        id: 23,
        ok: false,
        error: "FEAT-1 isn't a draft.",
      });
    } finally {
      socket.close();
    }
  });
});

describe("draft.approve and draft.reject (STORY-51)", () => {
  it("are checked at the door: an unopened project, malformed params, and a card that isn't a draft", async () => {
    const socket = await open();
    try {
      let n = 30;
      const ask = async (method: string, params: unknown) => {
        const id = n++;
        socket.send({ id, method, params });
        return socket.next((f) => f.id === id, 10_000);
      };
      for (const method of ["draft.approve", "draft.reject"]) {
        expect(await ask(method, { dir: repo.root, id: "FEAT-1" })).toMatchObject({
          ok: false,
          error: "Not an open project.",
        });
        expect(await ask(method, { dir: repo.main })).toMatchObject({ ok: false, error: "Expected { dir, id }." });
        expect(await ask(method, { dir: repo.main, id: "FEAT-1" })).toMatchObject({
          ok: false,
          error: "FEAT-1 isn't a draft.",
        });
      }
    } finally {
      socket.close();
    }
  });
});
