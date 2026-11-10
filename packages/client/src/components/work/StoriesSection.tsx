import { CARD_COPY, type CardView } from "../../card-pane.ts";

/** A feature's stories, each opening in the pane (STORY-49). */
export function StoriesSection({ stories, onOpen }: { stories: CardView["stories"]; onOpen: (id: string) => void }) {
  if (!stories.length) return null;
  return (
    <section className="card-sec" aria-label={CARD_COPY.stories}>
      <h3 className="sh">{CARD_COPY.stories}</h3>
      <ul className="card-stories" aria-label={CARD_COPY.stories}>
        {stories.map((s) => (
          <li key={s.id}>
            <button type="button" className="card-link" onClick={() => onOpen(s.id)}>
              <span className="card-id">{s.id}</span> {s.title}
              <span className="meta"> · {s.status}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
