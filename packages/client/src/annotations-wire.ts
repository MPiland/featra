/**
 * A pane's annotations on their way to the window (STORY-75, ADR 0048). The main process tells the window each change;
 * a screenshot is sent once, when it is new or changed, not with every change (a comment typed, an annotation opened).
 * The window keeps the screenshots it was sent and reads the rest defensively, as ever (normalizeAnnotations).
 */
import { isRecord } from "@featra/work-format/guards";
import { normalizeAnnotations, type Annotation, type AnnotationsState } from "./annotations.ts";

/** What the main process sends: the state without screenshots, and the screenshots that are new or changed, by id. */
export interface AnnotationsMessage extends Omit<AnnotationsState, "list"> {
  list: Omit<Annotation, "screenshot">[];
  shots: Record<string, string | null>;
}

/** The main process's side: each state as a message, with only the screenshots the window doesn't have yet. */
export function createAnnotationsSender() {
  const sent = new Map<string, string | null>();
  return (state: AnnotationsState): AnnotationsMessage => {
    const shots: Record<string, string | null> = {};
    const list = state.list.map(({ screenshot, ...a }) => {
      if (!sent.has(a.id) || sent.get(a.id) !== screenshot) {
        shots[a.id] = screenshot;
        sent.set(a.id, screenshot);
      }
      return a;
    });
    for (const id of sent.keys()) if (!state.list.some((a) => a.id === id)) sent.delete(id);
    return { ...state, list, shots };
  };
}

/** The window's side: each message as the whole state, with the screenshots it was sent before. */
export function createAnnotationsReader() {
  const shots = new Map<string, string | null>();
  return (raw: unknown): AnnotationsState => {
    const r = isRecord(raw) ? raw : {};
    if (isRecord(r.shots))
      for (const [id, shot] of Object.entries(r.shots)) shots.set(id, typeof shot === "string" ? shot : null);
    const list: unknown[] = Array.isArray(r.list) ? r.list : [];
    // The message is the window's own copy: each annotation takes its screenshot in place.
    for (const a of list) if (isRecord(a) && typeof a.id === "string") a.screenshot = shots.get(a.id) ?? null;
    const state = normalizeAnnotations({ ...r, list });
    for (const id of shots.keys()) if (!state.list.some((a) => a.id === id)) shots.delete(id);
    return state;
  };
}
