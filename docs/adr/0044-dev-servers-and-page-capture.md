# 0044 — Dev servers and page capture

Date: 2026-11-24 · Status: proposed

## Context

STORY-25 lets a project choose its proof: screenshots, a Preview button, both or neither. Screenshots come from the
project's own dev server, captured with Electron's Chromium, with no browser download, no extra dependency and no agent
tokens. Preview opens the same dev server in a Featra window. Featra therefore starts and stops processes in a story's
worktree, loads pages from them, and writes files into a story's evidence folder, all without an agent. A dev-server
command is text in `.featra/config.yaml`, which a commit can change; the window may load only what the user chose; and
Featra must never kill a process it didn't start.

## Decision

- **Settings.** `.featra/config.yaml` holds `proof` (`screenshots`, `preview`, `both`, `none`, or unset),
  `devServerCommand`, `devServerUrl` (`http://localhost:<port>` or `http://127.0.0.1:<port>`) and `testScreenshots` (a
  folder inside the project). Settings > Project > Proof shows and changes them. The command runs only once the user
  saved or confirmed it there: the confirmed command is kept in the app's data folder
  (`dev-server-confirmed.json`), as check commands are (ADR 0031), so one changed through git shows as not confirmed
  and doesn't run.
- **The proof question.** When a Dev Lead chat drafts a project's first feature and `proof` is unset, the server asks
  on that chat's question card (subject `proof`), the card agents use. It is the app's question, not the agent's, so it
  costs no tokens and outlives the turn. While it waits it isn't asked again; once answered, the setting keeps it from
  coming back. A project that already had features is never asked: its proof is chosen in Settings.
- **One dev server per story worktree**, in the server (`dev-servers.ts`), keyed by project and story and reused while
  it runs. Two asks at once share one start. It runs through the check runner (`runCommand`: the platform's shell, in
  the worktree), with `PORT` set and `{port}` in the command replaced. When the URL's port is taken and the command takes
  `{port}`, Featra picks a free port and the URL moves with it; when it can't move, the note says the port is taken.
  A port is taken when anything listens on it on either loopback (127.0.0.1 or ::1, since `localhost` may resolve to
  either), or when its URL already answers before Featra starts anything: a dev server another worktree or tool left
  there would otherwise be captured as this story's code. A loopback this computer lacks doesn't count. For the same
  reason, a dev server whose own process ended before its URL answered didn't start, whatever answers there.
  The server asks the URL every 250 ms until it answers, for up to 60 s. Past that, Featra stops what it started and
  the note "Dev server didn't start" shows the last 20 lines it printed.
- **Stopping.** A dev server stops when its story ends (merged or abandoned), before its worktree goes, when its
  project closes, and when the app quits. Featra cancels only a process it started that is still running: one that has exited is never signalled
  (its pid could belong to another process by then), and one stopped while its port was being checked is never spawned.
  On quit the server stops its dev servers first, before it closes its sockets and services, and main waits for the
  server to exit (5 s at most, then ends it) before the app exits. On Windows the app's exit ends the server process
  and each dev server's shell through Node's job object, but not the server the shell started, which inherits the
  app's handles: a dev server left running kept the app from closing.
- **Capture runs in Electron main, over the host's IPC channel.** The server sends
  `{ type: "capture", seq, url, origin }`; main loads the URL in a hidden 1280×800 window, waits for it to load (30 s at
  most), calls `capturePage()` and answers `{ type: "captured", seq, data, ext }` (a PNG, or a JPEG when the PNG is over
  the evidence limit, `EVIDENCE_BYTES`) or `{ seq, error }`. Without a desktop host (a browser tab, tests), nothing is
  captured and the criterion says so.
- **Pages stay on the dev server's origin.** A criterion's page is written by an agent and its card file can be edited
  by hand, so it is checked twice. The server captures a page only when it is a route (`pageError` passes, also for a
  page written into the file by hand) and `new URL(page, devServerUrl)` keeps the dev server's origin; a page such as
  `@127.0.0.1:8080/` that would turn into another host is never sent. Main then loads the URL only when its origin is
  on this computer (http on `localhost` or `127.0.0.1`, with no user name or password) and equals the `origin` the
  server sent.
- **Dev-server windows are guarded.** Every web contents gets a guard as it is created: `will-navigate` and
  `will-redirect` are stopped unless the contents is a registered dev-server window (Preview or capture) staying on its
  own origin, so a redirect can't take a capture or Preview to another host, and the app's own window never moves;
  `window.open` is always denied. Dev-server windows run sandboxed with context isolation in their own session
  partition (`featra-dev-pages`), whose permission request and check handlers deny everything (camera, microphone,
  notifications, clipboard and the rest), so a dev server's page shares no storage with the app and is granted nothing.
- **What is captured.** An agent lists the page that shows a criterion with `update_card`'s `page` (a route such as
  `/settings`), kept on the criterion's line as `(page: /route)`. When the report moves the story to In Review, for
  each criterion with a page and proof that takes screenshots, Featra captures that page from the story's dev server.
  For each other criterion, a screenshot the project's tests wrote to `testScreenshots` is copied when its name matches
  `<STORY-ID>-ac<n>[-anything].(png|jpg|jpeg|gif|webp)` (any case, `n` from 1; the first by name wins). An agent's own
  evidence on a criterion is kept. Files land as `.featra/evidence/<FEAT>/<STORY>/ac<n>-page.<ext>` or
  `ac<n>-test.<ext>`, linked as the criterion's `evidence`, so STORY-72's `AcEvidence` shows them. A new screenshot
  removes the criterion's earlier ones of any other type, so a page captured as a PNG and later as a JPEG leaves no
  stale file. Featra commits
  nothing: the tool's answer tells the agent to commit them with the card.
- **Failures are notes.** A page that couldn't be captured keeps a short note on its criterion (in memory, shown in the
  card pane), with the dev server's last output folded away. The move to review always stands.
- **Preview.** When the proof includes Preview and the story has a worktree, the card pane offers Preview: the server
  starts (or reuses) the story's dev server and answers its URL, and main opens it in a Featra window titled
  "Preview STORY-N". That window may navigate only within that dev server's origin.

## Consequences

- Screenshots need no browser download and spend no tokens; the agent's only part is naming a page.
- A project without a dev server still gets its tests' screenshots attached, by the documented name rule.
- Dev servers outlive the capture for Preview and later captures; they cost memory until the story ends or the app quits.
- A hidden window per capture is slower than a shared one, but no page's state leaks into another.
- Notes are lost on restart; the next move to review captures again.
