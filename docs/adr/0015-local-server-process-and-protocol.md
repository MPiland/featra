# 0015 — The local server's process model and WebSocket protocol

Date: 2026-11-06 · Status: accepted

## Context

ADR 0012 decided on a local Node server bound to 127.0.0.1, on Electron's Node, behind a WebSocket API. STORY-2 is the
first story that needs it: detecting git and `.featra/`, running `git init` and scaffolding a project. STORY-3 adds the
index and card listing on top. Before that grows, we need to settle:

- how the app starts, stops and restarts the server;
- how the server knows which client and which folders to trust;
- what a request and a response look like on the wire;
- where the client code lives.

Any process on the machine can connect to a loopback port, so 127.0.0.1 alone is not access control. Node 24 has a
WebSocket client but no WebSocket server.

## Decision

**Process.** Main forks `packages/server` (bundled as `dist/server.cjs`) with `child_process.fork`. It runs on Electron's
own executable with `ELECTRON_RUN_AS_NODE=1` and an IPC channel. The server is started on first use. If it exits, the
next use starts a new one. When main closes the IPC channel (on quit), the server closes its sockets and exits.

**Host messages (IPC, JSON).** Main sends `start { token }` and `projects { seq, dirs }`. The server answers:

- `listening { port }`;
- `failed { error }`;
- `projects-ack { seq }`;
- `log { message }`, which goes to main's log.

The shapes live in `packages/server/src/host-messages.ts`.

**Trust.**

- The server listens on 127.0.0.1, port 0 (the OS picks a free one).
- Main makes a random 32-byte token for each server start. The token goes over IPC, never through env or argv, so it
  never reaches git or other child processes. It is never logged.
- A connection must use the path `/v1` and pass `?token=`. The server compares the token in constant time. A connection
  that fails either check is refused before the upgrade.
- The server acts only on folders in main's open-project list. Main sends the list at start and after every project
  change. It waits for the ack before it answers the page, so a folder the page just opened is always known. Folders
  compare without case on Windows and macOS.

**Client.** `packages/client/src/server-client.ts` is plain browser code. The preload asks main for the endpoint
(`server:endpoint` IPC) and builds the `FeatraBridge` methods from it. The token stays in the preload's isolated world;
the page never sees it. The client connects on the first call. If the socket closes, pending calls fail, and the next
call fetches the endpoint again, which picks up a restarted server. The renderer CSP allows `connect-src
ws://127.0.0.1:*`, since the port changes on every start.

**Protocol (`packages/work-format/src/protocol.ts`).** One JSON text frame per message.

- A request is `{ id, method, params }`.
- The answer is `{ id, ok: true, result }` or `{ id, ok: false, error }`.
- `error` is a short, user-facing sentence.
- A frame without a numeric id gets `id: null`.
- Binary frames close the socket.
- Frames are capped at 1 MB.
- A breaking change gets a new path (`/v2`).

The methods so far are:

| Method                | Params              | Result                                                                   |
| --------------------- | ------------------- | ------------------------------------------------------------------------ |
| `project.setupStatus` | `{ dir }`           | `no-git`, `no-featra`, `ready` or `error`                                |
| `project.gitInit`     | `{ dir }`           | The new setup status                                                     |
| `project.init`        | `{ dir }`           | `{ ok, created, kept }` or `{ ok: false, error }`                        |
| `project.setupPlan`   | `{ dir }`           | `{ ok, git, items: [{ id, exists }] }` or `{ ok: false, error }`         |
| `project.setup`       | `{ dir, items }`    | `{ ok, created, kept }` or `{ ok: false, error }`: git first, then items |
| `work.watch`          | `{ dir }`           | The Work list, then pushes (ADR 0016)                                    |
| `work.unwatch`        | `{ watch }`         | `null`                                                                   |
| `work.applyCopy`      | `{ dir, key }`      | `{ ok: true }` or `{ ok: false, error }`                                 |
| `work.discardCopy`    | `{ dir, key }`      | `{ ok: true }` or `{ ok: false, error }`                                 |
| `card.watch`          | `{ dir, id }`       | The card pane's view of one card, then pushes (ADR 0017)                 |
| `card.update`         | `{ dir, id, edit }` | `{ ok, view }` or `{ ok: false, error, view }`: one field, at the owner  |
| `chat.roles`          | `{ dir }`           | The roles a chat can start from (ADR 0018)                               |
| `chat.start`          | `{ dir, role }`     | `{ id }` of a new chat (ADR 0018)                                        |
| `chat.watch`          | `{ id }`            | The chat's event log, then pushes (ADR 0018)                             |
| `chat.send`           | `{ id, text }`      | `null`, or refused while a turn runs (ADR 0018)                          |
| `chat.stop`           | `{ id }`            | `null`: interrupts the running turn (ADR 0018)                           |

`project.setupPlan` and `project.setup` (STORY-42) serve the one-screen setup page; `items` are setup item ids
(`work-format/setup-plan`), and the required ones are always set up. The client no longer calls `project.gitInit` or
`project.init`; they stay until a story removes them.

A new method is added to `ServerMethods` first; both ends check against it.

**Dependency.** `ws` (MIT, no runtime dependencies), because Node has no WebSocket server. `bufferutil` and
`utf-8-validate` are its optional speedups and stay out of the bundle.

## Consequences

- The server is plain Node and has no Electron imports. Tests fork it with Node and use the real client and real git
  (`apps/desktop/test/server-process.test.ts`).
- A crashed server costs one failed call, and the next call starts a new one. Its stderr and log messages land in
  main's log.
- Another local process can't use the API without the token, and the page can't reach folders the user hasn't opened.
- Services are built by `createServices` and closed after the socket server on disconnect, so no scan holds the
  index file when the server exits.
- Lint keeps `packages/server` free of React, Electron, `client` and `desktop`. Lint also keeps `client` from
  importing the server.
- Besides request and answer, the server pushes `{ event, watch, data }` frames, with no `id`, for a running watch
  (STORY-3, ADR 0016). A watch ends with `work.unwatch` or when its socket closes.
- No installer exists yet. When packaging lands, it must check that the forked `server.cjs` still loads from the
  packaged app, and unpack it from the asar if it doesn't.
