import { resolve } from "node:path";

/** Whether `a` and `b` name the same folder or file: resolved, and without case on Windows. */
export const samePath = (a: string, b: string, platform: string = process.platform): boolean =>
  platform === "win32" ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b);
