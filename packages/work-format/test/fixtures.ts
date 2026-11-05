// Builders for test data. They call the real work-format functions; no product logic lives here.
import { DEFAULT_CONFIG, newCard, setParent, setStatus, type Card, type ProjectConfig } from "../src/index.ts";

export const config: ProjectConfig = DEFAULT_CONFIG;

/** `at(5)` → 5 minutes after a fixed origin, as an ISO string. */
export function at(minutes: number): string {
  return new Date(Date.UTC(2026, 10, 1, 0, minutes)).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function feature(id: string, status = "active", parent: string | null = "EPIC-1"): Card {
  return newCard({ id, type: "feature", title: id, status, parent }, "user", at(0));
}

export function pbi(id: string, parent: string | null, opts: { created?: number; status?: string; type?: "pbi" | "bug" } = {}): Card {
  return newCard(
    { id, type: opts.type ?? "pbi", title: id, status: opts.status ?? "New", parent, origin: opts.type === "bug" ? "bug" : "planned" },
    "user",
    at(opts.created ?? 0),
  );
}

/** Applies status moves in order: `moves(card, [10, "In Progress"], [20, "Done"])`. */
export function moves(card: Card, ...steps: [number, string, string?][]): Card {
  return steps.reduce((c, [m, to, by]) => setStatus(c, to, by ?? "user", at(m)), card);
}

export function reparent(card: Card, minutes: number, to: string | null): Card {
  return setParent(card, to, "user", at(minutes));
}
