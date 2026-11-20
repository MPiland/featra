import { ACTION_LIMITS } from "@featra/work-format";

/**
 * What the window may put on the clipboard (STORY-68's Copy, review nit): a request's command, never longer than one
 * may be; null for anything else, which is copied nowhere.
 */
export const copyable = (text: unknown): string | null =>
  typeof text === "string" && text.length <= ACTION_LIMITS.command ? text : null;
