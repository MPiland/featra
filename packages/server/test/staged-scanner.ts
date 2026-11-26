/**
 * The real scanner, with one write staged at an exact moment (BUG-24): once armed, the first scan that reads a card it
 * can't parse in a working tree runs the write before it returns. That is a writer outside Featra finishing its save
 * just after a scan read the file it had emptied. Everything else is the real scanner.
 */
import type { Scanner } from "../src/work-scan.ts";
import { cardPath } from "./card-repo.ts";

export function stagedScanner(real: Scanner) {
  let armed: { id: string; write: () => Promise<void> } | null = null;
  let calls = 0;
  const scanner: Scanner = {
    ...real,
    async scan(...args) {
      calls += 1;
      const scan = await real.scan(...args);
      const staged = armed;
      if (staged && scan?.collected.copies.some((c) => c.workingTree && !c.card && c.path === cardPath(staged.id))) {
        armed = null;
        await staged.write();
      }
      return scan;
    },
  };
  return {
    scanner,
    /** Arms `write` for the next scan that reads card `id` unparseable. */
    stage(id: string, write: () => Promise<void>) {
      armed = { id, write };
    },
    /** Whether the staged write has run. */
    done: () => armed === null,
    /** How many scans were asked for. */
    calls: () => calls,
  };
}
