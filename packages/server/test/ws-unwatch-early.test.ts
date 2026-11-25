import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAllowedProjects } from "../src/allowed-projects.ts";
import { createServices } from "../src/services.ts";
import { startServer, type RunningServer } from "../src/ws-server.ts";
import { card, cardRepo, type CardRepo } from "./card-repo.ts";
import { openFrames } from "./ws-frames.ts";

/**
 * The page can end a watch before its answer comes: a screen that unmounts at once (BUG-41, BUG-44). The unwatch used
 * to find nothing yet, and the watch was kept when it answered, pushing to the page for as long as the socket lived.
 * Real socket, services and repository.
 */
const TOKEN = "test-token-0123456789";
const allowed = createAllowedProjects();
const services = createServices({ allowed, log: () => {} });
let server: RunningServer;
let repo: CardRepo;

beforeAll(async () => {
  repo = await cardRepo();
  await repo.write(repo.main, card("FEAT-1", "feature", null, "draft"));
  repo.commit(repo.main, "plan");
  allowed.set([repo.main]);
  server = await startServer({ token: TOKEN, api: services.api, log: () => {} });
});

afterAll(async () => {
  await server.close();
  await services.close();
  await repo.dispose();
});

describe("ending a watch before its answer", () => {
  it("stops the watch when it answers, so nothing is pushed for it", async () => {
    const socket = await openFrames(`${server.url}?token=${TOKEN}`);
    try {
      socket.send({ id: 1, method: "work.watch", params: { dir: repo.main } });
      socket.send({ id: 2, method: "work.unwatch", params: { watch: 1 } });
      expect(await socket.next((f) => f.id === 2)).toEqual({ id: 2, ok: true, result: null });
      expect((await socket.next((f) => f.id === 1)).ok).toBe(true);
      // A watch kept alongside hears the edit, so the edit is one that pushes.
      socket.send({ id: 3, method: "work.watch", params: { dir: repo.main } });
      expect((await socket.next((f) => f.id === 3)).ok).toBe(true);
      await repo.write(repo.main, card("FEAT-1", "feature", null, "draft", { title: "Edited after the unwatch" }));
      expect(await socket.next((f) => f.event === "work.list" && f.watch === 3)).toMatchObject({ watch: 3 });
      // Both watches share the folder's scans, and watch 1 joined first: a push for it would have come before watch 3's.
      expect(socket.frames.filter((f) => f.event === "work.list" && f.watch === 1)).toEqual([]);
    } finally {
      socket.close();
    }
  });
});
