import { ANNOTATE_COPY, type Annotation } from "../../annotations.ts";

const px = (n: number) => String(Math.round(n));

/** The viewport an annotation was made in: its size, the device shown, and its pixel ratio when not 1. */
export function viewportText(a: Annotation): string {
  const { width, height, dpr, device } = a.viewport;
  return [`${px(width)} × ${px(height)}`, device, dpr !== 1 ? `${dpr}x` : null].filter(Boolean).join(" · ");
}

export function sourceText(a: Annotation): string | null {
  const s = a.source;
  if (!s) return null;
  return [s.file, s.line, s.column].filter((v) => v !== null).join(":");
}

/**
 * What an annotation captured (STORY-75), as the page gave it: shown as text only, as anything from the page is. The
 * source hint shows only when the page's dev build gave one.
 */
export function AnnotationDetails({ annotation: a }: { annotation: Annotation }) {
  const source = sourceText(a);
  const r = a.region;
  return (
    <dl className="annotation-details">
      {r && (
        <>
          <dt>{ANNOTATE_COPY.region}</dt>
          <dd>{`${px(r.x)}, ${px(r.y)} · ${px(r.width)} × ${px(r.height)}`}</dd>
        </>
      )}
      {a.elements.map((e, i) => (
        <div key={e.selector} className="annotation-element">
          <dt>{a.elements.length > 1 ? `${ANNOTATE_COPY.selector} ${i + 1}` : ANNOTATE_COPY.selector}</dt>
          <dd>
            <code>{e.selector}</code>
          </dd>
          <dt>{ANNOTATE_COPY.snippet}</dt>
          <dd>
            <pre>{e.snippet}</pre>
          </dd>
          <dt>{ANNOTATE_COPY.styles}</dt>
          <dd>
            <pre>
              {Object.entries(e.styles)
                .map(([k, v]) => `${k}: ${v};`)
                .join("\n")}
            </pre>
          </dd>
        </div>
      ))}
      <dt>{ANNOTATE_COPY.viewport}</dt>
      <dd>{viewportText(a)}</dd>
      <dt>{ANNOTATE_COPY.url}</dt>
      <dd className="annotation-url">{a.url}</dd>
      {source && (
        <>
          <dt>{ANNOTATE_COPY.source}</dt>
          <dd>
            <code>{source}</code>
          </dd>
        </>
      )}
      <dt>{ANNOTATE_COPY.consoleErrors}</dt>
      <dd>
        {a.consoleErrors.length ? (
          <pre className="annotation-errors">{a.consoleErrors.join("\n")}</pre>
        ) : (
          ANNOTATE_COPY.noErrors
        )}
      </dd>
    </dl>
  );
}
