/**
 * The Dev Lead's summary of a feature (STORY-69): plain language the user reads on the review screen, written through
 * the Featra MCP's `write_summary`. It lives in the feature's card as its `## Summary` section, so it travels with the
 * card to main, and each write is a `summary` event in its history, by the Dev Lead's session. Pure.
 */
import { appendHistory } from "./history.ts";
import { parseId } from "./ids.ts";
import type { Card } from "./types.ts";
import { isRecord } from "./utils/guards.ts";

export const SUMMARY_HEADING = "Summary";
export const WRITE_SUMMARY_TOOL = "write_summary";
export const SUMMARY_LIMIT = 4000;

/** What a Dev Lead chat is told when it writes for a feature another Dev Lead leads (its summary, its replies). */
export const notLeadOf = (id: string): string => `You don't lead ${id}.`;

export const SUMMARY_MESSAGES = {
  badFeature: "Give the feature's id, such as FEAT-9, as `feature`.",
  empty: "Write the summary as `summary`: plain language, what changed for the user.",
  tooLong: `Keep the summary under ${SUMMARY_LIMIT} characters.`,
  notActive: (id: string) => `${id} isn't a feature in progress.`,
  notLead: notLeadOf,
  written: (id: string) => `Wrote the summary of ${id}. The user sees it on its review screen.`,
} as const;

/** A `write_summary` call: the feature and its summary. */
export interface SummaryInput {
  feature: string;
  summary: string;
}

/** A `write_summary` call's input, or what to fix. */
export function parseSummaryInput(input: unknown): { ok: true; value: SummaryInput } | { ok: false; error: string } {
  const raw = isRecord(input) ? input : {};
  const feature = (typeof raw.feature === "string" ? raw.feature.trim() : "").toUpperCase();
  if (parseId(feature)?.prefix !== "FEAT") return { ok: false, error: SUMMARY_MESSAGES.badFeature };
  const summary = typeof raw.summary === "string" ? raw.summary.replace(/\r\n/g, "\n").trim() : "";
  if (!summary) return { ok: false, error: SUMMARY_MESSAGES.empty };
  if (summary.length > SUMMARY_LIMIT) return { ok: false, error: SUMMARY_MESSAGES.tooLong };
  // A `## ` line would end the card's section when it is read back, so it becomes a heading one level down.
  return { ok: true, value: { feature, summary: summary.replace(/^## /gm, "### ") } };
}

/** The feature with `text` as its summary, replacing the one before, and the write in its history by `by`. */
export function withSummary(card: Card, text: string, by: string, at: string): Card {
  const kept = card.extraSections.filter((s) => s.heading !== SUMMARY_HEADING);
  const written = { ...card, extraSections: [{ heading: SUMMARY_HEADING, content: text }, ...kept] };
  return appendHistory(written, { at, field: "summary", from: null, to: null, by });
}

/** The feature's summary as the review screen shows it, with when it was last written; null when it has none. */
export interface FeatureSummary {
  text: string;
  /** When the Dev Lead last wrote it; null when its history doesn't say. */
  at: string | null;
}

export function summaryOf(card: Pick<Card, "extraSections" | "history">): FeatureSummary | null {
  const text = card.extraSections.find((s) => s.heading === SUMMARY_HEADING)?.content.trim() ?? "";
  if (!text) return null;
  return { text, at: card.history.findLast((e) => e.field === "summary")?.at ?? null };
}
