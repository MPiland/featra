/**
 * The Dev Lead's `report_bug` (STORY-13, ADR 0036), modelled on `request_merge`: it reports, the user places it. The
 * report and Featra's proposed placement are an approval card in the Dev Lead's chat and the Inbox, where the user
 * keeps the proposal or picks another place, then Creates or Cancels. The call answers once the user is asked; where
 * the bug went (or that it was cancelled, or couldn't be filed and why) reaches the Dev Lead as a notice.
 */
import {
  REPORT_BUG_MESSAGES,
  REPORT_BUG_TOOL,
  routeOf,
  spawner,
  type BugReport,
  type Notice,
} from "@featra/work-format";
import type { BugFiling } from "./bug-filing.ts";
import type { ChatManager } from "./chat-manager.ts";

export interface BugRequestDeps {
  chats: Pick<ChatManager, "askChoice" | "notify">;
  bugs: Pick<BugFiling, "propose" | "file">;
  log: (message: string) => void;
}

/** What a notice calls the bug: its title, quoted. */
export const bugSubject = (title: string) => `Bug "${title}"`;

/** What the notice says of where it went. */
const filedSummary = (filed: { kind: "card" | "task"; id: string }, parent: string | null) =>
  filed.kind === "task"
    ? `a task on ${filed.id}.`
    : parent
      ? `${filed.id} under ${parent}.`
      : `${filed.id} on the project bug list.`;

export function createBugRequest({ chats, bugs, log }: BugRequestDeps) {
  let asks = 0;

  /** The user's answer, then the bug filed where they placed it, told to the Dev Lead as a notice. */
  async function decide(dir: string, report: BugReport, input: Record<string, unknown>, lead: string) {
    const story = bugSubject(report.title);
    const ask = { id: `bug-${++asks}-${Date.now()}`, name: REPORT_BUG_TOOL, input, subject: story };
    let notice: Notice;
    try {
      const allowed = await chats.askChoice(lead, ask);
      if (allowed === "denied") {
        notice = { story, outcome: "declined", summary: "" };
      } else if (allowed === "cancelled") {
        notice = { story, outcome: "not filed", summary: REPORT_BUG_MESSAGES.cancelled };
      } else {
        const placement = typeof allowed.option === "string" ? allowed.option : String(input.proposed);
        const filed = await bugs.file(dir, report, placement, spawner(lead));
        const route = routeOf(placement);
        const parent = route?.kind === "feature-bug" ? route.feature : null;
        notice = { story, outcome: "filed", summary: filedSummary(filed, parent) };
      }
    } catch (err) {
      notice = { story, outcome: "not filed", summary: err instanceof Error ? err.message : String(err) };
    }
    try {
      chats.notify(lead, notice);
    } catch (err) {
      log(`The Dev Lead couldn't be told where a bug went: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    /** Asks the user to place `report`, for the Dev Lead's chat `lead`; answers once the user has been asked. */
    async report(dir: string, report: BugReport, lead: string): Promise<{ asked: true }> {
      const placements = await bugs.propose(dir, report.cause);
      void decide(dir, report, { ...report, ...placements }, lead);
      return { asked: true };
    },
  };
}

export type BugRequest = ReturnType<typeof createBugRequest>;
