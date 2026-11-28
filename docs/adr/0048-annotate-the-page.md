# 0048 — Annotate: an overlay in an isolated world, reports read as untrusted, the list owned by the main process

Date: 2026-11-27 · Status: proposed

## Context

STORY-75 lets the user annotate the page in the Browser pane (ADR 0047): hover highlights an element, a click picks
it, Shift-click adds more, a drag draws a region. Each annotation takes a comment and captures the elements or region,
a screenshot, the viewport, the address, a CSS selector, a trimmed DOM snippet, key computed styles, the console
errors since the page loaded, and a source-file hint when the dev build gives one. Numbered markers stay on their
elements through scrolling, resizing and in-page navigation. STORY-76 sends the annotations to the session, and
STORY-40 lets an agent drive the pane, so both need to read the list.

The pane's page is a sandboxed `WebContentsView` in the `featra-browser` session, with no Node and no preload. Its code
is untrusted: anything it can reach, it can forge.

The options for running the overlay in the page were:

- A preload script. It would need a privileged preload on an untrusted page, and the page's own scripts could reach
  whatever the preload exposed through the main world.
- `executeJavaScript` in the main world. The page could read the overlay's state, replace the functions it calls,
  and call its reporting hook itself.
- An isolated world through the DevTools Protocol (`webContents.debugger`), as Chrome's extensions use: the page's
  DOM is shared, its JavaScript globals are not.

## Decision

**Injection.** The overlay is one self-contained function (`packages/client/src/annotate/overlay.ts`), stringified and
run by the main process (`annotator.ts`, `page-world.ts`) in a world named `featra-annotate`: `Page.createIsolatedWorld`
for the document showing, and `Page.addScriptToEvaluateOnNewDocument` with that world name for the next ones. It
reports through `Runtime.addBinding` scoped to that world (`executionContextName`), so the page's own world has no
such function. A `Runtime.bindingCalled` counts only from the current context of that name in the main frame (from
`Page.getFrameTree` and `Page.frameNavigated`); a call from another world, a sub-frame, the main world or a document
since left is ignored. Start and stop run one after the other, and the last one asked is what holds. Each call into the
page keeps its objects in a group of its own, released after it. When the debugger is let go (DevTools opened on the
page, the renderer gone), Annotate turns off and the next start sets the world up again. With Annotate off and no
marker left, the new-document script is removed, so later pages get no overlay; the document showing keeps its overlay
until it is left. The overlay draws in a closed shadow root and acts only on events
the user made (`isTrusted`). Nothing gives the page Node or a preload.

**Source hint.** The main process resolves the picked node into the page's main world (`DOM.describeNode`,
`DOM.resolveNode`) and reads React's dev data there (`_debugStack`, `_debugSource`, `data-inspector-*` attributes):
React 19 and 18 and Vite's paths first. What the page hands back is bounded in the page before it is copied out
(primitives only, each within its size), as the page's own code can make it anything. The hint is parsed in the main
process; when there is none, it is left out.

**Trust boundary.** Everything the overlay reports is untrusted input (`annotate/messages.ts`): known kinds only, a
size cap, text cut to set lengths, style names that are names. The window reads the list it is sent defensively too
(`normalizeAnnotations`) and takes only a PNG data URL as a screenshot. Page text (selectors, snippets, styles, console
errors, addresses) is shown as text, never as HTML, and never becomes an instruction. The comment is typed in the
app's own UI. The screenshot is taken by the main process, not reported by the page: `Page.captureScreenshot` with a
clip in the document's CSS px (the overlay's rect moved by the layout viewport's scroll, cut to the visual viewport),
so device emulation, a page with no viewport meta and a pinch all give the rect the user chose.

**Data model.** The main process owns the annotations, one list per pane (`annotations.ts`). The window mirrors it
(`browser:annotations`) and asks for changes by id. The message carries the list without screenshots, and each
screenshot once, when it is new (`annotations-wire.ts`); a comment being typed is sent once the typing rests (300 ms).
A pane keeps 50 annotations at most and says so in its log. A pick whose screenshot is still being taken counts as
unsent. `BrowserHandle.annotations` gives `list()` and `take()` (the list, emptied at once) for STORY-76 and STORY-40. An annotation is `elements` (one or more, deduped by selector) or a `region` stored in document
coordinates with the element that holds it. Each element of an annotation gets its own outline; the badge sits just
outside the first one's top-left corner (below it when there is no room above). Region markers follow the document's
scroll only, not an inner scroller's. Numbers are the list's order and close up after a delete. A marker follows
its element by the overlay's own reference, else by its selector on the same address with the hash ignored.

**Lifetime.** Unsent annotations last until the pane closes. Closing it with any asks first: on Close, Escape, the
Browser toggle and another card's Browser. Capturing calls no model and costs no tokens.

## Consequences

- The page can't see or call the overlay's code, and nothing it reports is trusted beyond its shape and size.
- The page can still hide or cover the overlay (its own styles on the host element, an element above it, the top
  layer of a dialog or fullscreen), and it can tell Featra is there (the host element, the isolated world's effects on
  the DOM). Annotate is a developer's tool on their own app; it does not hide from the page.
- The pane's debugger stays attached once Annotate has started, until the pane closes.
- Leaving the view or reloading the window closes the pane without asking (STORY-74's rule); this is on the roadmap.
- STORY-40's agent-driven pane will reuse the debugger attachment and must not widen the binding's world.
