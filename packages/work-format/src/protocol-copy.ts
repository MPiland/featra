import { dirParams, type CopyActionResult } from "./protocol.ts";
import { isRecord } from "./utils/guards.ts";

/** The `{ dir, key }` params of the stale-copy actions, or null. */
export function copyParams(params: unknown): { dir: string; key: string } | null {
  const dir = dirParams(params);
  return dir && isRecord(params) && typeof params.key === "string" && params.key ? { ...dir, key: params.key } : null;
}

export function normalizeCopyActionResult(raw: unknown): CopyActionResult {
  const r = isRecord(raw) ? raw : {};
  if (r.ok === true) return { ok: true };
  return { ok: false, error: typeof r.error === "string" && r.error ? r.error : "Something went wrong." };
}
