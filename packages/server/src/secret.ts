import { timingSafeEqual } from "node:crypto";

/** Whether two secrets are the same, compared in constant time so a guess learns nothing from how long it took. */
export function sameSecret(given: string, secret: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
