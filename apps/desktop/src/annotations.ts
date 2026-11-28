import type { Annotation, AnnotationsState } from "@featra/client/annotate";
import { ANNOTATION_LIMITS } from "@featra/client/annotate";

/** What a new annotation is, before it has an id and a comment. */
export type Captured = Omit<Annotation, "id" | "comment">;

/** The overlay's refs for each annotation's elements, which are the page's, not the annotation's record. */
export interface Placed {
  refs: number[];
}

/**
 * A Browser pane's annotations (STORY-75, ADR 0048): the one owner of its list, in the main process, for as long as the
 * pane is open; nothing keeps them past it. The window shows the list it is sent; STORY-76's Send reads it and clears
 * it. Each change calls `changed`, saying whether it was only a comment typed. Numbers are places in the list, so they
 * close up when one is deleted. It keeps `ANNOTATION_LIMITS.annotations` at most.
 */
export function createAnnotations(changed: (state: AnnotationsState, typed: boolean) => void) {
  let list: (Annotation & Placed)[] = [];
  let editing: string | null = null;
  let annotating = false;
  let capturing = false;
  let next = 1;
  const state = (): AnnotationsState => ({
    annotating,
    list: list.map(({ refs: _refs, ...a }) => a),
    editing,
    capturing,
  });
  const emit = (typed = false) => changed(state(), typed);
  const find = (id: string) => list.find((a) => a.id === id);
  return {
    state,
    /** The list with each annotation's overlay refs, for its markers. */
    placed: () => list.map((a, i) => ({ ...a, n: i + 1 })),
    get annotating() {
      return annotating;
    },
    setAnnotating(on: boolean) {
      if (annotating === on) return;
      annotating = on;
      emit();
    },
    /** Whether a pick is being captured: it will be in the list in a moment, so it counts as unsent. */
    setCapturing(on: boolean) {
      if (capturing === on) return;
      capturing = on;
      emit();
    },
    /** Adds an annotation, open to edit; returns its id, or null when the list is full. */
    add(captured: Captured, refs: number[]): string | null {
      if (list.length >= ANNOTATION_LIMITS.annotations) return null;
      const id = `a${next++}`;
      list = [...list, { ...captured, id, comment: "", refs }];
      editing = id;
      emit();
      return id;
    },
    /** Adds an element to annotation `id`, with the screenshot of all of them; one it has already is left as it is. */
    addElement(id: string, element: Annotation["elements"][number], ref: number, screenshot: string | null) {
      const a = find(id);
      if (!a || a.kind !== "elements" || a.elements.length >= ANNOTATION_LIMITS.elements) return;
      if (a.elements.some((e) => e.selector === element.selector)) return;
      list = list.map((x) =>
        x.id === id ? { ...x, elements: [...x.elements, element], refs: [...x.refs, ref], screenshot } : x,
      );
      editing = id;
      emit();
    },
    /** The annotation open to edit, if any. */
    get editing() {
      return editing;
    },
    edit(id: string | null) {
      const to = id && find(id) ? id : null;
      if (to === editing) return;
      editing = to;
      emit();
    },
    comment(id: string, text: string) {
      const a = find(id);
      if (!a) return;
      const comment = text.slice(0, ANNOTATION_LIMITS.comment);
      if (comment === a.comment) return;
      list = list.map((x) => (x.id === id ? { ...x, comment } : x));
      emit(true);
    },
    remove(id: string) {
      if (!find(id)) return;
      list = list.filter((a) => a.id !== id);
      if (editing === id) editing = null;
      emit();
    },
    /** The annotations, in order. */
    list: (): Annotation[] => state().list,
    /** The annotations, in order, cleared at once: what STORY-76 sends, with nothing added between reading and clearing. */
    take(): Annotation[] {
      const taken = state().list;
      if (!taken.length) return taken;
      list = [];
      editing = null;
      emit();
      return taken;
    },
  };
}

export type Annotations = ReturnType<typeof createAnnotations>;
