/**
 * The messages a streaming-input session reads: an async iterable the agent waits on between turns. Pushing wakes
 * it; closing ends it once it has read what is queued.
 */
export interface InputQueue<T> {
  push: (item: T) => void;
  close: () => void;
  iterable: AsyncIterable<T>;
}

export function createInputQueue<T>(): InputQueue<T> {
  const items: T[] = [];
  let closed = false;
  let wake: (() => void) | null = null;
  const signal = () => {
    wake?.();
    wake = null;
  };
  return {
    push(item) {
      if (closed) return;
      items.push(item);
      signal();
    },
    close() {
      closed = true;
      signal();
    },
    iterable: {
      async *[Symbol.asyncIterator]() {
        for (;;) {
          const next = items.shift();
          if (next !== undefined) {
            yield next;
            continue;
          }
          if (closed) return;
          await new Promise<void>((resolve) => (wake = resolve));
        }
      },
    },
  };
}
