# 0043 — Serving evidence files to the app

Date: 2026-11-24 · Status: proposed

## Context

STORY-72 shows the evidence an agent attached to a criterion next to it, in the card pane and on the review screen: a
screenshot as a thumbnail that opens full size, any other file as a link that opens it with the OS. Agents attach
evidence through `update_card` (ADR 0027): the file goes under `.featra/evidence/<FEAT-N>/<STORY-M>/` and the
criterion's line links it (`(evidence: path)`). The renderer has no file access (ADR 0011), so the local server has to
read the file for it. A link is text an agent wrote, and the file can be anything an agent put on disk, so what the
server reads, and what the OS is asked to open, must be narrow. The card's owner copy may be a story worktree, a feature
branch nobody checks out, or main, and a merged story's evidence may exist only in git.

## Decision

- **Two server methods, `evidence.read` and `evidence.open`**, each `{ dir, id, path }` for an open project. Read answers
  an image (`kind: "image"`, mime and base64 bytes), any other file by name (`kind: "file"`), or a problem: `missing`
  or `unreadable`. The app words them "Evidence missing" and "Can't open evidence". Open copies the file and answers the
  copy's path.
- **Only a path the card links is read.** The path must be the `evidence` of one of that card's criteria and pass the
  same rules `update_card` applies when it links one (`evidenceLinkError`, now in work-format `evidence-link.ts`): a
  relative path inside the card's own evidence folder, no `..`, no absolute path. Anything else is `unreadable`, so the
  API can't be used to read other files in the project.
- **It is read from the cards as shown**: the watch's last good scan (`WorkWatches.shown`), after any scan in flight,
  never a new scan; only a folder nobody watches gets a full scan. Then from the copy whose criteria are shown
  (`shownFrom`, normally the owner). If that copy is checked out
  (a story worktree, or main), the file is read from disk with `update_card`'s disk rules (`evidenceOnDisk`, shared
  with the report check): each part of the path matched by exact name and checked with `lstat` as it is walked, so no
  part (`.featra`, `evidence`, the feature's or story's folder, the file) may be a symbolic link or junction, the real
  path still inside the evidence folder, a plain file, at most 1 MB (`EVIDENCE_BYTES`). If it isn't checked out (a feature branch, a
  merged story), it is read from git at that copy's revision: `ls-tree` finds the exact entry, which must be a plain
  blob (mode 100644 or 100755, never a link 120000), at most 1 MB, then `cat-file blob` reads it.
- **Screenshots are png, jpg, gif and webp**, judged by the file's extension. Anything else is a file to open.
- **Opening never touches the original.** The server copies the file into `<data>/evidence-open/<random>/<name>` (the
  folder is cleared once per run) and answers that path. The desktop main process opens it only if its real path is
  inside that folder; it opens it with the OS only when its extension is a document or image type
  (`EVIDENCE_OPENABLE`: images, txt, md, log, json, csv, tsv, xml, yaml, pdf). Anything else, such as a script or a
  page, is shown in its folder instead, so nothing an agent wrote is ever run by a click.
- **A missing or unreadable file never breaks the criterion**: the row shows its short note and everything else as
  before. A card that isn't there answers "That card is gone.".

## Consequences

- The app shows evidence for every owner the card can have, including a story already merged, without checking out
  anything.
- A read costs one file read (or one `ls-tree` and `cat-file` for git), never a rescan of every card: a review
  screen with 20 screenshots would otherwise queue 20 full rescans, each heard by every listener. The scan may be a
  moment behind the disk, so a file attached since shows once the watch rescans and the card changes.
- Each thumbnail is read again whenever the card or review shown changes, so a file attached since, or one a read
  couldn't get for a moment, doesn't stay as its note; at 1 MB a file, the socket carries at most a
  few MB for a story with several screenshots. Larger files say "Can't open evidence".
- The open copies in the data folder are temporary: they live until the next run clears them.
- STORY-25 shows captured screenshots next to their criteria the same way: it links them as `evidence` and the shared
  `AcEvidence` component shows them.
