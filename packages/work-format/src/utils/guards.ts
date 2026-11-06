/** Type guards for data that crosses a trust boundary (files on disk, IPC payloads, storage). */

/** True for a plain object (not null, not an array), so its keys can be read and checked. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** True when `value` is one of `options`, narrowing it to that union. */
export function isOneOf<T extends string>(options: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (options as readonly string[]).includes(value);
}

/** The message of a thrown value, whatever was thrown. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Ends an exhaustive `switch`: the call only type-checks when every case is handled. */
export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}

/** A value read from outside, as text for a message or a field: objects as JSON, never "[object Object]". */
export function toText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "object") return value === null ? "null" : JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return value.toString();
  if (typeof value === "symbol") return value.toString();
  return typeof value; // "undefined" or "function"
}
