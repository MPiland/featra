/**
 * What the STORY-54 tests share: a Dev Lead chat whose turn is over, a story session's reply, and what a lead's chat
 * was told. Real services throughout; only the Agent SDK and the clock are faked (story-fixture.ts).
 */
import { NOTICE_LABEL, type ChatEvent } from "@featra/work-format";
import type { FakeRun } from "./fake-query.ts";
import { sdk } from "./fake-query.ts";
import type { StoryWorld } from "./story-fixture.ts";

export type Lead = Awaited<ReturnType<StoryWorld["runningLead"]>>;

let ids = 0;

/** A Dev Lead chat with a run, whose first turn has ended: it is idle and can be told things. */
export async function idleLead(w: StoryWorld): Promise<Lead> {
  const lead = await w.runningLead();
  lead.run.say(sdk.init(), sdk.success("Planned."));
  await w.until(() => lead.events().some((e) => e.type === "turn-end"));
  return lead;
}

/** The session says `text` and ends its turn. */
export function finish(run: FakeRun, text: string) {
  const id = `reply-${++ids}`;
  run.say(sdk.start(id), sdk.delta(text), sdk.assistant(id, [sdk.text(text)]), sdk.success(text));
}

/** The messages a chat was sent that Featra wrote: the notices, in order. */
export const noticesIn = (events: ChatEvent[]): string[] =>
  events.flatMap((e) => (e.type === "user" && e.text.startsWith(NOTICE_LABEL) ? [e.text] : []));

/**
 * For checking that something did not happen: a round trip through the server (it has handled what came before it)
 * and the ticks its own follow-up work takes. No timer, so it neither flakes nor waits when nothing is pending.
 */
export async function settled(w: StoryWorld) {
  await w.window.ask("chat.list", { dir: w.repo.main });
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve));
}
