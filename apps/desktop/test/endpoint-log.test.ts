import { describe, expect, it } from "vitest";
import type { ServerEndpoint } from "@featra/client/bridge";
import { loggedEndpoint, SLOW_ASK_MS } from "../src/endpoint-log.ts";

const ENDPOINT: ServerEndpoint = { url: "ws://127.0.0.1:1234/v1", token: "t" };

/** Only the server process and the clock are faked: each answer takes the time the test sets. */
function setup() {
  const logged: string[] = [];
  let clock = 0;
  let answer: ServerEndpoint | null = null;
  let takes = 0;
  const ask = loggedEndpoint(
    async () => {
      clock += takes;
      return answer;
    },
    (m) => logged.push(m),
    () => clock,
  );
  return {
    logged,
    ask,
    answer: (a: ServerEndpoint | null, ms = 0) => {
      answer = a;
      takes = ms;
    },
  };
}

describe("BUG-40: the page's ask for the server's address in main.log", () => {
  it("a server that never starts is logged once, however often the page asks again", async () => {
    const s = setup();
    for (let i = 0; i < 50; i++) expect(await s.ask()).toBeNull();
    expect(s.logged).toEqual(["No server address for the page after 0 ms"]);
  });

  it("each change of answer is logged, and a repeat of the same fast answer is not", async () => {
    const s = setup();
    s.answer(ENDPOINT, 3);
    expect(await s.ask()).toBe(ENDPOINT);
    expect(await s.ask()).toBe(ENDPOINT);
    s.answer(null);
    await s.ask();
    await s.ask();
    s.answer(ENDPOINT);
    await s.ask();
    expect(s.logged).toEqual([
      "Gave the page the server's address after 3 ms",
      "No server address for the page after 0 ms",
      "Gave the page the server's address after 0 ms",
    ]);
  });

  it("a slow answer is logged with its time, even when it is the same as the last", async () => {
    const s = setup();
    s.answer(ENDPOINT, 2);
    await s.ask();
    s.answer(ENDPOINT, SLOW_ASK_MS + 1);
    await s.ask();
    s.answer(ENDPOINT, SLOW_ASK_MS);
    await s.ask();
    expect(s.logged).toEqual([
      "Gave the page the server's address after 2 ms",
      `Gave the page the server's address after ${SLOW_ASK_MS + 1} ms`,
    ]);
  });
});
