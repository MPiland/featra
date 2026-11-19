/**
 * The project needs bridge (STORY-66): for every open project, how many of its agents wait on the user and whether it
 * has work to review, as the server counts them, kept current. The project switcher shows them.
 */
import { EMPTY_NEEDS, normalizeNeeds, type NeedsList, type ProjectNeeds } from "@featra/work-format/project-needs";
import type { MenuMark } from "./menu.ts";
import type { ServerClient } from "./server-client.ts";

export type { NeedsList, ProjectNeeds };

export interface NeedsBridge {
  /** Calls back with every open project's needs now and on every change; returns the stop. */
  watch: (listener: (needs: NeedsList) => void) => () => void;
}

export const NEEDS_COPY = {
  waiting: (n: number) => (n === 1 ? "1 agent waiting" : `${n} agents waiting`),
  review: "to review",
  reviewTip: "To review",
  others: (n: number) => (n === 1 ? "another project needs you" : `${n} other projects need you`),
} as const;

/** A project's marks in the switcher's menu: its waiting agents' count, then the quieter review mark. */
export function needsMarks(needs: ProjectNeeds | undefined): MenuMark[] {
  if (!needs) return [];
  const marks: MenuMark[] = [];
  if (needs.waiting > 0)
    marks.push({ id: "waiting", text: String(needs.waiting), spoken: `, ${NEEDS_COPY.waiting(needs.waiting)}` });
  if (needs.review)
    marks.push({ id: "review", spoken: `, ${NEEDS_COPY.review}`, tip: NEEDS_COPY.reviewTip, quiet: true });
  return marks;
}

/** The bridge's needs watch over the server client. */
export function serverNeeds(server: ServerClient): NeedsBridge {
  return {
    watch(listener) {
      // A dropped connection keeps the last list: the watch starts again and sends a fresh one.
      return server.watch("needs.watch", {}, { data: (raw) => listener(normalizeNeeds(raw)), error: () => {} });
    },
  };
}

/** A browser tab has no folders, so no project needs anything. */
export function noNeeds(): NeedsBridge {
  return {
    watch(listener) {
      listener(EMPTY_NEEDS);
      return () => {};
    },
  };
}
